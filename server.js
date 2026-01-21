const { admin, db } = require('./firebase-init');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = 3000;

// Firebase Admin SDK initialized in firebase-init.js

// Read .env file for ENCRYPTION_KEY
function readEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        return {};
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envObj = {};
    
    envContent.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                envObj[key.trim()] = valueParts.join('=').trim();
            }
        }
    });
    
    return envObj;
}

const envVars = readEnvFile();

// Validate encryption key exists (fail fast if missing)
const ENCRYPTION_KEY = envVars.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    console.error('❌ FATAL: ENCRYPTION_KEY not set or too short in .env file');
    console.error('Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}
console.log('✅ Encryption key loaded successfully');

// Middleware to parse JSON bodies
app.use(express.json());

// Force HTTPS redirect (except for localhost)
app.use((req, res, next) => {
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    
    // Redirect HTTP to HTTPS in production
    if (!isLocalhost && !isHttps) {
        return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
    next();
});

// Request logging middleware with geolocation
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    const method = req.method;
    const url = req.url;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Log to console (will be captured by PM2 and Google Cloud)
    console.log(JSON.stringify({
        timestamp,
        ip,
        method,
        url,
        userAgent,
        type: 'http_request'
    }));
    
    next();
});

// CORS configuration - restrict to allowed origins only
app.use((req, res, next) => {
    // Determine if we're in production (HTTPS) or development
    // Force production mode if not running on localhost
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    const isProduction = !isLocalhost || req.secure || req.headers['x-forwarded-proto'] === 'https';
    
    const allowedOrigins = isProduction ? [
        // Production: HTTPS preferred, HTTP allowed for transition
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://34.45.169.78:3000',  // Google Cloud VM (HTTP) - Old
        'https://34.45.169.78:3000', // Google Cloud VM (HTTPS) - Old
        'http://34.65.160.116:3000',  // Google Cloud VM (HTTP) - Current
        'https://34.65.160.116:3000', // Google Cloud VM (HTTPS) - Current
        'http://usermgt.digibuild.ch',   // Production domain (HTTP)
        'https://usermgt.digibuild.ch'   // Production domain (HTTPS)
    ] : [
        // Development: Local only
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ];
    
    const origin = req.headers.origin;
    
    // Allow requests with no origin (e.g., mobile apps, Postman, same-origin)
    if (!origin || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Security Headers (Helmet equivalent)
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Strict Transport Security - Force HTTPS
    // Apply in production mode (non-localhost)
    if (isProduction) {
        res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    // Content Security Policy - Enhanced for XSS protection
    // Note: Firebase requires 'unsafe-eval' and 'unsafe-inline' for scripts
    // We've added upgrade-insecure-requests and form-action to improve security
    const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://*.firebaseapp.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' https://developer.api.autodesk.com https://*.firebaseio.com https://*.googleapis.com https://*.firebaseapp.com wss://*.firebaseio.com",
        "frame-ancestors 'none'",
        "form-action 'self'", // Prevent forms from posting to external sites
        "base-uri 'self'",
        "object-src 'none'",
        "media-src 'self'",
        "upgrade-insecure-requests" // Always upgrade HTTP to HTTPS
    ];
    
    res.header('Content-Security-Policy', cspDirectives.join('; '));
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Serve static files from current directory
app.use(express.static(__dirname));

// Simple rate limiting implementation
const rateLimitStore = new Map();

function rateLimit(options = {}) {
    const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
    const maxRequests = options.max || 100; // 100 requests default
    const message = options.message || 'Too many requests, please try again later.';
    
    return (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const key = `${ip}-${options.prefix || 'global'}`;
        
        const now = Date.now();
        const record = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };
        
        // Reset if window expired
        if (now > record.resetTime) {
            record.count = 0;
            record.resetTime = now + windowMs;
        }
        
        record.count++;
        rateLimitStore.set(key, record);
        
        // Clean up old entries periodically
        if (Math.random() < 0.01) { // 1% chance
            for (const [k, v] of rateLimitStore.entries()) {
                if (now > v.resetTime + windowMs) {
                    rateLimitStore.delete(k);
                }
            }
        }
        
        if (record.count > maxRequests) {
            console.log(`⚠️ Rate limit exceeded for ${ip} on ${options.prefix || 'global'}`);
            return res.status(429).json({ error: message });
        }
        
        next();
    };
}

// Global API rate limiter (100 requests per 15 minutes)
app.use('/api/', rateLimit({ max: 100, prefix: 'api' }));

// Stricter rate limit for auth endpoints (5 attempts per 15 minutes)
const authLimiter = rateLimit({ 
    max: 5, 
    prefix: 'auth',
    message: 'Too many login attempts, please try again in 15 minutes.'
});

// Function to read .env file
function readEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        return {};
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envObj = {};
    
    envContent.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                envObj[key.trim()] = valueParts.join('=').trim();
            }
        }
    });
    
    return envObj;
}

// Function to write .env file
function writeEnvFile(envObj) {
    const envPath = path.join(__dirname, '.env');
    const envContent = Object.entries(envObj)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    fs.writeFileSync(envPath, envContent);
}

// Endpoint to save credentials to .env file
// Endpoint to save credentials (now uses Firebase and user authentication)
app.post('/save-credentials', authenticateUser, async (req, res) => {
    try {
        const { clientId, clientSecret } = req.body;
        const userId = req.user.uid;
        
        if (!clientId || !clientSecret) {
            return res.status(400).json({ 
                success: false, 
                message: 'Both clientId and clientSecret are required' 
            });
        }

        // Encrypt credentials (simple encryption - you may want to use a stronger method)
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(userId, 'salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipherClientId = crypto.createCipheriv(algorithm, key, iv);
        let encryptedClientId = cipherClientId.update(clientId, 'utf8', 'hex');
        encryptedClientId += cipherClientId.final('hex');
        
        const cipherSecret = crypto.createCipheriv(algorithm, key, iv);
        let encryptedSecret = cipherSecret.update(clientSecret, 'utf8', 'hex');
        encryptedSecret += cipherSecret.final('hex');
        
        // Save to Firestore user document
        await db.collection('users').doc(userId).update({
            clientId: encryptedClientId,
            clientSecret: encryptedSecret,
            encryptionIV: iv.toString('hex'),
            credentialsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ success: true, message: 'Credentials saved successfully' });
    } catch (error) {
        console.error('Error saving credentials:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error saving credentials', 
            error: error.message 
        });
    }
});

// Endpoint to load credentials from Firestore
app.get('/load-credentials', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        
        // Get user document from Firestore
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.json({
                success: true,
                clientId: '',
                clientSecret: ''
            });
        }
        
        const userData = userDoc.data();
        
        if (!userData.clientId || !userData.clientSecret || !userData.encryptionIV) {
            return res.json({
                success: true,
                clientId: '',
                clientSecret: ''
            });
        }
        
        // Decrypt credentials
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(userId, 'salt', 32);
        const iv = Buffer.from(userData.encryptionIV, 'hex');
        
        const decipherClientId = crypto.createDecipheriv(algorithm, key, iv);
        let clientId = decipherClientId.update(userData.clientId, 'hex', 'utf8');
        clientId += decipherClientId.final('utf8');
        
        const decipherSecret = crypto.createDecipheriv(algorithm, key, iv);
        let clientSecret = decipherSecret.update(userData.clientSecret, 'hex', 'utf8');
        clientSecret += decipherSecret.final('utf8');
        
        res.json({
            success: true,
            clientId: clientId,
            clientSecret: clientSecret
        });
    } catch (error) {
        console.error('Error loading credentials:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error loading credentials', 
            error: error.message 
        });
    }
});

// Endpoint to save users main list to Firestore (encrypted)
app.post('/save', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const usersData = req.body;
        
        // Encrypt the users data
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(userId, 'salt', 32);
        
        // Check if user already has an IV for users_main_list, if not create one
        const userDoc = await db.collection('users').doc(userId).get();
        let iv;
        
        if (userDoc.exists && userDoc.data().usersMainListIV) {
            // Use existing IV
            iv = Buffer.from(userDoc.data().usersMainListIV, 'hex');
        } else {
            // Create new IV
            iv = crypto.randomBytes(16);
        }
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encryptedData = cipher.update(JSON.stringify(usersData), 'utf8', 'hex');
        encryptedData += cipher.final('hex');
        
        // Save encrypted data to Firestore
        await db.collection('users').doc(userId).set({
            users_main_list_encrypted: encryptedData,
            usersMainListIV: iv.toString('hex')
        }, { merge: true });
        
        res.json({ success: true, message: 'Users main list saved successfully (encrypted)' });
    } catch (error) {
        console.error('Error saving users main list:', error);
        res.status(500).json({ success: false, message: 'Error saving users main list', error: error.message });
    }
});

// Endpoint to load users main list from Firestore (decrypted)
app.get('/load', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        
        // Load from Firestore user's document
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.json({ users: [] });
        }
        
        const userData = userDoc.data();
        
        // Check for encrypted data first
        if (userData.users_main_list_encrypted && userData.usersMainListIV) {
            // Decrypt the data
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(userId, 'salt', 32);
            const iv = Buffer.from(userData.usersMainListIV, 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decryptedData = decipher.update(userData.users_main_list_encrypted, 'hex', 'utf8');
            decryptedData += decipher.final('utf8');
            
            res.json(JSON.parse(decryptedData));
        } else if (userData.users_main_list) {
            // Legacy: unencrypted data (auto-migrate to encrypted)
            console.log('Migrating unencrypted users_main_list to encrypted format for user:', userId);
            
            // Encrypt and save
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(userId, 'salt', 32);
            const iv = crypto.randomBytes(16);
            
            const cipher = crypto.createCipheriv(algorithm, key, iv);
            let encryptedData = cipher.update(JSON.stringify(userData.users_main_list), 'utf8', 'hex');
            encryptedData += cipher.final('hex');
            
            await db.collection('users').doc(userId).set({
                users_main_list_encrypted: encryptedData,
                usersMainListIV: iv.toString('hex'),
                users_main_list: admin.firestore.FieldValue.delete() // Remove old unencrypted data
            }, { merge: true });
            
            res.json(userData.users_main_list);
        } else {
            res.json({ users: [] });
        }
    } catch (error) {
        console.error('Error loading users main list:', error);
        res.status(500).json({ success: false, message: 'Error loading users main list', error: error.message });
    }
});

// Endpoint to save folder permissions
// Endpoint to save folder permissions (per user, per project in Firestore)
app.post('/save-folder-permissions', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { projectName, hubId, projectId, data } = req.body;
        
        if (!hubId || !projectId) {
            return res.status(400).json({ success: false, message: 'Hub ID and Project ID are required' });
        }
        
        // Create unique key using hubId_projectId
        const permissionKey = `${hubId}_${projectId}`;
        
        // Encrypt the folder permissions data
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(userId, 'salt', 32);
        
        // Check if user already has an IV for this project's permissions
        const userDoc = await db.collection('users').doc(userId).get();
        let iv;
        const existingIVs = (userDoc.exists && userDoc.data().folderPermissionsIVs) || {};
        
        if (existingIVs[permissionKey]) {
            // Use existing IV for this project
            iv = Buffer.from(existingIVs[permissionKey], 'hex');
        } else {
            // Create new IV for this project
            iv = crypto.randomBytes(16);
            existingIVs[permissionKey] = iv.toString('hex');
        }
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encryptedData = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encryptedData += cipher.final('hex');
        
        // Save to Firestore under user's document
        const folderPermissions = userDoc.exists ? (userDoc.data().folderPermissions || {}) : {};
        folderPermissions[permissionKey] = encryptedData;
        
        await db.collection('users').doc(userId).set({
            folderPermissions: folderPermissions,
            folderPermissionsIVs: existingIVs
        }, { merge: true });
        
        console.log(`💾 Saved encrypted folder permissions for user ${userId}, project ${permissionKey}`);
        res.json({ 
            success: true, 
            message: 'Folder permissions saved successfully (encrypted)',
            permissionKey: permissionKey
        });
    } catch (error) {
        console.error('Error saving folder permissions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error saving folder permissions', 
            error: error.message 
        });
    }
});

// Endpoint to load folder permissions (per user, per project from Firestore)
app.get('/load-folder-permissions/:hubId/:projectId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { hubId, projectId } = req.params;
        
        if (!hubId || !projectId) {
            return res.status(400).json({ success: false, message: 'Hub ID and Project ID are required' });
        }
        
        const permissionKey = `${hubId}_${projectId}`;
        
        // Load from Firestore
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.json({ success: true, data: null, exists: false });
        }
        
        const userData = userDoc.data();
        const folderPermissions = userData.folderPermissions || {};
        const folderPermissionsIVs = userData.folderPermissionsIVs || {};
        
        if (folderPermissions[permissionKey] && folderPermissionsIVs[permissionKey]) {
            // Decrypt the data
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(userId, 'salt', 32);
            const iv = Buffer.from(folderPermissionsIVs[permissionKey], 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decryptedData = decipher.update(folderPermissions[permissionKey], 'hex', 'utf8');
            decryptedData += decipher.final('utf8');
            
            res.json({ 
                success: true, 
                data: JSON.parse(decryptedData),
                exists: true
            });
        } else {
            res.json({ 
                success: true, 
                data: null,
                exists: false
            });
        }
    } catch (error) {
        console.error('Error loading folder permissions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error loading folder permissions', 
            error: error.message 
        });
    }
});

// Endpoint to check if folder permissions exist (per user, per project)
app.get('/check-folder-permissions/:hubId/:projectId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { hubId, projectId } = req.params;
        const permissionKey = `${hubId}_${projectId}`;
        
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.json({ exists: false, permissionKey: permissionKey });
        }
        
        const folderPermissions = userDoc.data().folderPermissions || {};
        
        res.json({ 
            exists: !!folderPermissions[permissionKey],
            permissionKey: permissionKey
        });
    } catch (error) {
        console.error('Error checking folder permissions:', error);
        res.json({ exists: false, error: error.message });
    }
});

// ============================================
// Firebase Authentication Middleware
// ============================================

// Middleware to authenticate user via Firebase token
async function authenticateUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

// Middleware to authenticate admin user
async function authenticateAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Check if user is admin
        const adminDoc = await db.collection('admins').doc(decodedToken.uid).get();
        if (!adminDoc.exists) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Admin authentication error:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

// ============================================
// Admin API Endpoints
// ============================================

// Get all users (admin only)
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const users = [];
        
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            users.push({
                userId: doc.id,
                email: data.email,
                emailVerified: data.emailVerified || false,
                licenseKey: data.licenseKey,
                licenseExpiry: data.licenseExpiry?.toDate().toISOString(),
                lastLogin: data.lastLogin?.toDate().toISOString(),
                createdAt: data.createdAt?.toDate().toISOString()
            });
        });
        
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get all licenses (admin only)
app.get('/api/admin/licenses', authenticateAdmin, async (req, res) => {
    try {
        const licensesSnapshot = await db.collection('licenses').get();
        const licenses = [];
        
        licensesSnapshot.forEach(doc => {
            const data = doc.data();
            licenses.push({
                licenseKey: doc.id,
                email: data.email,
                userId: data.userId,
                status: data.status,
                purchaseDate: data.purchaseDate?.toDate().toISOString(),
                expiryDate: data.expiryDate?.toDate().toISOString(),
                price: data.price,
                paypalOrderId: data.paypalOrderId
            });
        });
        
        res.json({ success: true, licenses });
    } catch (error) {
        console.error('Error fetching licenses:', error);
        res.status(500).json({ error: 'Failed to fetch licenses' });
    }
});

// Get analytics (admin only)
app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const analyticsSnapshot = await db.collection('analytics')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(cutoffDate))
            .orderBy('timestamp', 'desc')
            .limit(1000)
            .get();
        
        const analytics = [];
        analyticsSnapshot.forEach(doc => {
            const data = doc.data();
            analytics.push({
                id: doc.id,
                userId: data.userId,
                action: data.action,
                timestamp: data.timestamp?.toDate().toISOString(),
                metadata: data.metadata
            });
        });
        
        res.json({ success: true, analytics });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Revoke license (admin only)
app.post('/api/admin/revoke-license', authenticateAdmin, async (req, res) => {
    try {
        const { licenseKey } = req.body;
        
        if (!licenseKey) {
            return res.status(400).json({ error: 'License key is required' });
        }
        
        // Update license status
        await db.collection('licenses').doc(licenseKey).update({
            status: 'revoked',
            revokedAt: admin.firestore.FieldValue.serverTimestamp(),
            revokedBy: req.user.uid
        });
        
        // Find and update user
        const licenseDoc = await db.collection('licenses').doc(licenseKey).get();
        if (licenseDoc.exists && licenseDoc.data().userId) {
            await db.collection('users').doc(licenseDoc.data().userId).update({
                licenseExpiry: null
            });
        }
        
        res.json({ success: true, message: 'License revoked successfully' });
    } catch (error) {
        console.error('Error revoking license:', error);
        res.status(500).json({ error: 'Failed to revoke license' });
    }
});

// Activate license manually (admin only)
app.post('/api/admin/activate-license', authenticateAdmin, async (req, res) => {
    try {
        const { userId, days } = req.body;
        
        if (!userId || !days) {
            return res.status(400).json({ error: 'User ID and duration are required' });
        }
        
        // Get user data
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        const email = userData.email;
        
        // Generate unique license key
        const licenseKey = generateLicenseKey();
        
        // Calculate price and expiry
        const prices = { 365: 900 };
        const price = prices[days] || 900;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
        
        // Create license document
        await db.collection('licenses').doc(licenseKey).set({
            licenseKey: licenseKey,
            email: email,
            userId: userId,
            status: 'active',
            purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
            expiryDate: admin.firestore.Timestamp.fromDate(expiryDate),
            price: price,
            paymentMethod: 'manual_activation'
        });
        
        // Update user document
        await db.collection('users').doc(userId).update({
            licenseKey: licenseKey,
            licenseExpiry: admin.firestore.Timestamp.fromDate(expiryDate)
        });
        
        // Log analytics
        await db.collection('analytics').add({
            userId: userId,
            action: 'manual_license_activation',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
                email: email,
                licenseKey: licenseKey,
                duration: days,
                price: price,
                activatedBy: req.user.uid
            }
        });
        
        res.json({ 
            success: true, 
            licenseKey: licenseKey,
            expiryDate: expiryDate.toISOString()
        });
    } catch (error) {
        console.error('Error activating license:', error);
        res.status(500).json({ error: 'Failed to activate license: ' + error.message });
    }
});

// Deactivate license manually (admin only)
app.post('/api/admin/deactivate-license', authenticateAdmin, async (req, res) => {
    try {
        const { userId, licenseKey } = req.body;
        
        if (!userId || !licenseKey) {
            return res.status(400).json({ error: 'User ID and license key are required' });
        }
        
        // Update license status to deactivated
        await db.collection('licenses').doc(licenseKey).update({
            status: 'deactivated',
            deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
            deactivatedBy: req.user.uid
        });
        
        // Remove license from user document
        await db.collection('users').doc(userId).update({
            licenseKey: null,
            licenseExpiry: null
        });
        
        // Log analytics
        await db.collection('analytics').add({
            userId: userId,
            action: 'manual_license_deactivation',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
                licenseKey: licenseKey,
                deactivatedBy: req.user.uid
            }
        });
        
        res.json({ 
            success: true, 
            message: 'License deactivated successfully'
        });
    } catch (error) {
        console.error('Error deactivating license:', error);
        res.status(500).json({ error: 'Failed to deactivate license: ' + error.message });
    }
});

// Delete users (admin only)
app.post('/api/admin/delete-users', authenticateUser, async (req, res) => {
    try {
        const { userIds } = req.body;
        
        // Verify admin
        const adminDoc = await db.collection('admins').doc(req.user.uid).get();
        if (!adminDoc.exists) {
            return res.status(403).json({ error: 'Unauthorized: Admin access required' });
        }
        
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'Invalid user IDs provided' });
        }
        
        let deletedCount = 0;
        const errors = [];
        
        for (const userId of userIds) {
            try {
                // Get user data before deletion
                const userDoc = await db.collection('users').doc(userId).get();
                const userData = userDoc.data();
                
                // 1. Delete from Firebase Authentication
                try {
                    await admin.auth().deleteUser(userId);
                } catch (authError) {
                    console.error(`Failed to delete user from Auth: ${userId}`, authError);
                    // Continue with Firestore deletion even if Auth deletion fails
                }
                
                // 2. Delete user document from Firestore
                await db.collection('users').doc(userId).delete();
                
                // 3. Revoke and delete associated licenses
                if (userData && userData.licenseKey) {
                    await db.collection('licenses').doc(userData.licenseKey).update({
                        status: 'revoked',
                        revokedAt: admin.firestore.FieldValue.serverTimestamp(),
                        revokedBy: req.user.uid,
                        userId: null,
                        email: null
                    });
                }
                
                // 4. Delete analytics records (optional - you may want to keep these)
                const analyticsSnapshot = await db.collection('analytics')
                    .where('userId', '==', userId)
                    .get();
                
                const analyticsDeletePromises = [];
                analyticsSnapshot.forEach(doc => {
                    analyticsDeletePromises.push(doc.ref.delete());
                });
                await Promise.all(analyticsDeletePromises);
                
                // 5. Log deletion action
                await db.collection('analytics').add({
                    userId: req.user.uid,
                    action: 'user_deleted',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        deletedUserId: userId,
                        deletedUserEmail: userData?.email || 'unknown',
                        deletedBy: req.user.email
                    }
                });
                
                deletedCount++;
                
            } catch (userError) {
                console.error(`Error deleting user ${userId}:`, userError);
                errors.push({ userId, error: userError.message });
            }
        }
        
        if (errors.length > 0) {
            return res.status(207).json({ 
                deletedCount, 
                errors,
                message: `Deleted ${deletedCount} users with ${errors.length} errors`
            });
        }
        
        res.json({ 
            success: true, 
            deletedCount,
            message: `Successfully deleted ${deletedCount} user(s)`
        });
        
    } catch (error) {
        console.error('Error deleting users:', error);
        res.status(500).json({ error: 'Failed to delete users: ' + error.message });
    }
});

// Helper function to generate license key
function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars[Math.floor(Math.random() * chars.length)];
    }
    return key;
}

// Validate user login and get user info (requires authentication + rate limiting)
app.post('/api/validate-login', authLimiter, authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        
        // Check if user is admin
        const adminDoc = await db.collection('admins').doc(userId).get();
        const isAdmin = adminDoc.exists;
        
        // Get user data
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User data not found' });
        }
        
        const userData = userDoc.data();
        const licenseExpiry = userData.licenseExpiry ? userData.licenseExpiry.toDate() : null;
        
        // Check license expiry for non-admin users
        if (!isAdmin && (!licenseExpiry || licenseExpiry < new Date())) {
            return res.json({ 
                success: false, 
                error: 'License expired',
                redirectTo: 'purchase.html'
            });
        }
        
        // Update last login
        await db.collection('users').doc(userId).update({
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Log analytics
        await db.collection('analytics').add({
            userId: userId,
            action: 'login',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {
                email: userData.email,
                userAgent: req.headers['user-agent']
            }
        });
        
        res.json({ 
            success: true,
            isAdmin: isAdmin,
            email: userData.email,
            licenseExpiry: licenseExpiry ? licenseExpiry.toISOString() : null,
            redirectTo: isAdmin ? 'admin.html' : 'index.html'
        });
        
    } catch (error) {
        console.error('Error validating login:', error);
        res.status(500).json({ error: 'Failed to validate login' });
    }
});

app.listen(port, '127.0.0.1', () => {
    console.log(`Server running at http://localhost:${port} (localhost only)`);
    console.log('Available endpoints:');
    console.log('  GET  /load-credentials');
    console.log('  POST /save-credentials');
    console.log('  GET  /load');
    console.log('  POST /save');
    console.log('  POST /save-folder-permissions');
    console.log('  GET  /load-folder-permissions/:projectName');
    console.log('  GET  /check-folder-permissions/:projectName');
    console.log('');
    console.log('Admin API endpoints:');
    console.log('  GET  /api/admin/users');
    console.log('  GET  /api/admin/licenses');
    console.log('  GET  /api/admin/analytics?days=30');
    console.log('  POST /api/admin/revoke-license');
    console.log('  POST /api/admin/activate-license');
    console.log('  POST /api/admin/deactivate-license');
    console.log('  POST /api/admin/delete-users');
});