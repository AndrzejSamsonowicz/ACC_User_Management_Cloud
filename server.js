const { admin, db, FieldValue } = require('./firebase-init');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const validator = require('validator');

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

// ============================================================================
// Error Sanitization Utility
// ============================================================================
// Prevents information disclosure by hiding implementation details in production
const isProduction = envVars.NODE_ENV === 'production';

function sanitizeError(error, userMessage = 'An error occurred') {
    // Always log the full error server-side for debugging
    console.error('Error details:', error);
    
    // In production, return generic message
    // In development, return detailed error for debugging
    return {
        message: isProduction ? userMessage : error.message,
        // Only include stack trace in development
        ...((!isProduction && error.stack) && { stack: error.stack })
    };
}

// ============================================================================
// Input Validation Utilities
// ============================================================================
// Comprehensive input validation to prevent injection attacks and malformed data

const inputValidation = {
    // Validate string with length limits
    validateString: (value, fieldName, minLength = 1, maxLength = 1000) => {
        if (typeof value !== 'string') {
            throw new Error(`${fieldName} must be a string`);
        }
        if (!validator.isLength(value, { min: minLength, max: maxLength })) {
            throw new Error(`${fieldName} must be between ${minLength} and ${maxLength} characters`);
        }
        return validator.trim(value);
    },
    
    // Validate alphanumeric with special chars (for IDs, names)
    validateAlphanumeric: (value, fieldName, allowSpaces = true) => {
        if (typeof value !== 'string') {
            throw new Error(`${fieldName} must be a string`);
        }
        const pattern = allowSpaces ? /^[a-zA-Z0-9\s\-_\.]+$/ : /^[a-zA-Z0-9\-_\.]+$/;
        if (!pattern.test(value)) {
            throw new Error(`${fieldName} contains invalid characters`);
        }
        return validator.trim(value);
    },
    
    // Validate email
    validateEmail: (value, fieldName) => {
        if (typeof value !== 'string' || !validator.isEmail(value)) {
            throw new Error(`${fieldName} must be a valid email address`);
        }
        return validator.normalizeEmail(value);
    },
    
    // Validate object/JSON structure
    validateObject: (value, fieldName, maxDepth = 10) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw new Error(`${fieldName} must be an object`);
        }
        // Check for prototype pollution - only check for explicitly defined properties (not inherited)
        if (Object.hasOwn(value, '__proto__') || Object.hasOwn(value, 'constructor') || Object.hasOwn(value, 'prototype')) {
            throw new Error(`${fieldName} contains forbidden properties`);
        }
        return value;
    },
    
    // Validate array with size limits
    validateArray: (value, fieldName, maxLength = 10000) => {
        if (!Array.isArray(value)) {
            throw new Error(`${fieldName} must be an array`);
        }
        if (value.length > maxLength) {
            throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
        }
        return value;
    },
    
    // Sanitize HTML/script tags
    sanitizeHtml: (value) => {
        if (typeof value !== 'string') return value;
        return validator.escape(value);
    }
};

// Middleware to parse JSON bodies
app.use(express.json());

// Force HTTPS redirect (except for localhost or when disabled via env var)
app.use((req, res, next) => {
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const httpsRedirectDisabled = process.env.DISABLE_HTTPS_REDIRECT === 'true';
    
    // Redirect HTTP to HTTPS in production (unless explicitly disabled)
    if (!isLocalhost && !isHttps && !httpsRedirectDisabled) {
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

// CORS configuration - restrict to allowed origins only (HTTPS-only in production)
app.use((req, res, next) => {
    // Determine if we're in production (HTTPS) or development
    // Force production mode if not running on localhost
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    const isProduction = !isLocalhost || req.secure || req.headers['x-forwarded-proto'] === 'https';
    
    const allowedOrigins = isProduction ? [
        // Production: HTTPS-ONLY for security (except localhost for development)
        'http://localhost:3000',     // Localhost HTTP allowed for development
        'http://127.0.0.1:3000',     // Localhost HTTP allowed for development
        'https://34.45.169.78:3000', // Google Cloud VM (HTTPS) - Old
        'https://34.65.160.116:3000', // Google Cloud VM (HTTPS) - Current
        'https://usermgt.digibuild.ch'   // Production domain (HTTPS ONLY)
    ] : [
        // Development: Local only (both HTTP and HTTPS)
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://localhost:3000',
        'https://127.0.0.1:3000'
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
    // Only apply when HTTPS redirect is enabled (not disabled)
    const httpsRedirectDisabled = process.env.DISABLE_HTTPS_REDIRECT === 'true';
    if (isProduction && !httpsRedirectDisabled) {
        res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    // Content Security Policy - Enhanced for XSS protection
    // Note: Firebase requires 'unsafe-eval' and 'unsafe-inline' for scripts
    // We've added upgrade-insecure-requests and form-action to improve security
    const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://*.firebaseapp.com https://www.google.com https://www.recaptcha.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' https://developer.api.autodesk.com https://*.firebaseio.com https://*.googleapis.com https://*.firebaseapp.com wss://*.firebaseio.com https://www.google.com https://www.recaptcha.net https://www.gstatic.com",
        "frame-src https://www.google.com https://www.recaptcha.net",
        "frame-ancestors 'none'",
        "form-action 'self'", // Prevent forms from posting to external sites
        "base-uri 'self'",
        "object-src 'none'",
        "media-src 'self'"
    ];
    
    // Only add upgrade-insecure-requests if HTTPS redirect is not disabled
    if (!httpsRedirectDisabled) {
        cspDirectives.push("upgrade-insecure-requests");
    }
    
    res.header('Content-Security-Policy', cspDirectives.join('; '));
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Prevent caching of HTML and JS files
app.use((req, res, next) => {
    if (req.url.endsWith('.html') || req.url === '/' || req.url.startsWith('/?') || req.url.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Serve static files from current directory
app.use(express.static(__dirname));

// ============================================================================
// Rate Limiting with Redis (shared across instances) or in-memory fallback
// ============================================================================

let redisClient = null;
let useRedis = false;

// Try to connect to Redis if available
(async () => {
    try {
        const redis = require('redis');
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        redisClient = redis.createClient({
            url: redisUrl,
            socket: {
                connectTimeout: 5000,
                reconnectStrategy: (retries) => {
                    if (retries > 3) {
                        console.log('⚠️ Redis reconnection failed after 3 attempts, using in-memory rate limiting');
                        return false; // Stop reconnecting
                    }
                    return Math.min(retries * 100, 3000);
                }
            }
        });
        
        redisClient.on('error', (err) => {
            if (!useRedis) {
                // Only log once during initial connection attempt
                console.log('ℹ️ Redis not available, using in-memory rate limiting (single instance only)');
            }
        });
        
        await redisClient.connect();
        useRedis = true;
        console.log('✅ Redis connected - rate limiting shared across all instances');
        
    } catch (error) {
        console.log('ℹ️ Redis not available, using in-memory rate limiting (single instance only)');
        console.log('   To enable Redis: Install Redis and set REDIS_URL in .env');
        useRedis = false;
    }
})();

// In-memory fallback store
const rateLimitStore = new Map();

// Deterministic cleanup for in-memory store (when Redis not available)
setInterval(() => {
    if (useRedis) return; // Skip cleanup if using Redis
    
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, record] of rateLimitStore.entries()) {
        if (now > record.resetTime) {
            rateLimitStore.delete(key);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 In-memory rate limiter cleanup: Removed ${cleanedCount} expired entries. Store size: ${rateLimitStore.size}`);
    }
}, 5 * 60 * 1000); // Run every 5 minutes

function rateLimit(options = {}) {
    const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
    const maxRequests = options.max || 100; // 100 requests default
    const message = options.message || 'Too many requests, please try again later.';
    
    return async (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const key = `ratelimit:${options.prefix || 'global'}:${ip}`;
        
        try {
            if (useRedis && redisClient) {
                // Redis-based rate limiting (shares state across all instances)
                const now = Date.now();
                const windowStart = now - windowMs;
                
                // Use Redis sorted set to track requests with timestamps
                const multi = redisClient.multi();
                
                // Remove old entries outside the window
                multi.zRemRangeByScore(key, 0, windowStart);
                
                // Count requests in current window
                multi.zCard(key);
                
                // Add current request
                multi.zAdd(key, { score: now, value: `${now}` });
                
                // Set expiration on the key
                multi.expire(key, Math.ceil(windowMs / 1000));
                
                const results = await multi.exec();
                const count = results[1]; // Result of zCard
                
                if (count >= maxRequests) {
                    console.log(`⚠️ Rate limit exceeded for ${ip} on ${options.prefix || 'global'} (Redis)`);
                    return res.status(429).json({ error: message });
                }
                
            } else {
                // In-memory fallback (single instance only)
                const now = Date.now();
                const record = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };
                
                // Reset if window expired
                if (now > record.resetTime) {
                    record.count = 0;
                    record.resetTime = now + windowMs;
                }
                
                record.count++;
                rateLimitStore.set(key, record);
                
                if (record.count > maxRequests) {
                    console.log(`⚠️ Rate limit exceeded for ${ip} on ${options.prefix || 'global'} (in-memory)`);
                    return res.status(429).json({ error: message });
                }
            }
            
            next();
            
        } catch (error) {
            console.error('Rate limiter error:', error);
            // On error, allow the request through (fail open)
            next();
        }
    };
}

// Global API rate limiter (100 requests per 15 minutes)
app.use('/api/', rateLimit({ max: 100, prefix: 'api' }));

// Stricter rate limit for auth endpoints (5 attempts per 15 minutes)
const authLimiter = rateLimit({ 
    max: 20, // Increased from 5 - this endpoint is called for validation, not just failed logins
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
        
        // Input validation
        if (!clientId || !clientSecret) {
            return res.status(400).json({ 
                success: false, 
                message: 'Both clientId and clientSecret are required' 
            });
        }
        
        // Validate clientId format (alphanumeric with hyphens)
        try {
            inputValidation.validateString(clientId, 'clientId', 1, 500);
            inputValidation.validateString(clientSecret, 'clientSecret', 1, 500);
        } catch (validationError) {
            return res.status(400).json({ 
                success: false, 
                message: validationError.message 
            });
        }

        // Encrypt credentials with unique salt per user
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const salt = crypto.randomBytes(16);
        const key = crypto.scryptSync(userId, salt, 32);
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
            credentialsSalt: salt.toString('hex'),
            encryptionIV: iv.toString('hex'),
            credentialsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ success: true, message: 'Credentials saved successfully' });
    } catch (error) {
        const sanitized = sanitizeError(error, 'Failed to save credentials');
        res.status(500).json({ 
            success: false, 
            message: 'Error saving credentials', 
            ...sanitized
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
        
        if (!userData.clientId || !userData.clientSecret || !userData.encryptionIV || !userData.credentialsSalt) {
            return res.json({
                success: true,
                clientId: '',
                clientSecret: ''
            });
        }
        
        // Decrypt credentials using stored salt
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const salt = Buffer.from(userData.credentialsSalt, 'hex');
        const key = crypto.scryptSync(userId, salt, 32);
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
        const sanitized = sanitizeError(error, 'Failed to load credentials');
        res.status(500).json({ 
            success: false, 
            message: 'Error loading credentials', 
            ...sanitized
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
        
        // Check if user already has salt for users_main_list, if not create new one
        const userDoc = await db.collection('users').doc(userId).get();
        let salt, key, iv;
        
        if (userDoc.exists && userDoc.data().usersMainListSalt) {
            // Use existing salt (for key derivation consistency)
            salt = Buffer.from(userDoc.data().usersMainListSalt, 'hex');
        } else {
            // Create new salt
            salt = crypto.randomBytes(16);
        }
        
        // ALWAYS generate new IV for each encryption (security requirement)
        iv = crypto.randomBytes(16);
        key = crypto.scryptSync(userId, salt, 32);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encryptedData = cipher.update(JSON.stringify(usersData), 'utf8', 'hex');
        encryptedData += cipher.final('hex');
        
        // Save encrypted data to Firestore
        await db.collection('users').doc(userId).set({
            users_main_list_encrypted: encryptedData,
            usersMainListSalt: salt.toString('hex'),
            usersMainListIV: iv.toString('hex')
        }, { merge: true });
        
        res.json({ success: true, message: 'Users main list saved successfully (encrypted)' });
    } catch (error) {
        const sanitized = sanitizeError(error, 'Failed to save user list');
        res.status(500).json({ success: false, message: 'Error saving users main list', ...sanitized });
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
        if (userData.users_main_list_encrypted && userData.usersMainListIV && userData.usersMainListSalt) {
            // Decrypt the data using stored salt
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const salt = Buffer.from(userData.usersMainListSalt, 'hex');
            const key = crypto.scryptSync(userId, salt, 32);
            const iv = Buffer.from(userData.usersMainListIV, 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decryptedData = decipher.update(userData.users_main_list_encrypted, 'hex', 'utf8');
            decryptedData += decipher.final('utf8');
            
            res.json(JSON.parse(decryptedData));
        } else if (userData.users_main_list) {
            // Legacy: unencrypted data (auto-migrate to encrypted)
            console.log('Migrating unencrypted users_main_list to encrypted format for user:', userId);
            
            // Encrypt and save with new salt
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const salt = crypto.randomBytes(16);
            const key = crypto.scryptSync(userId, salt, 32);
            const iv = crypto.randomBytes(16);
            
            const cipher = crypto.createCipheriv(algorithm, key, iv);
            let encryptedData = cipher.update(JSON.stringify(userData.users_main_list), 'utf8', 'hex');
            encryptedData += cipher.final('hex');
            
            await db.collection('users').doc(userId).set({
                users_main_list_encrypted: encryptedData,
                usersMainListSalt: salt.toString('hex'),
                usersMainListIV: iv.toString('hex'),
                users_main_list: admin.firestore.FieldValue.delete() // Remove old unencrypted data
            }, { merge: true });
            
            res.json(userData.users_main_list);
        } else {
            res.json({ users: [] });
        }
    } catch (error) {
        const sanitized = sanitizeError(error, 'Failed to load user list');
        res.status(500).json({ success: false, message: 'Error loading users main list', ...sanitized });
    }
});

// Endpoint to save project-specific users list to Firestore (encrypted, per project)
app.post('/save-project-users/:projectId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const projectId = req.params.projectId;
        const usersData = req.body;
        
        // Input validation
        try {
            inputValidation.validateString(projectId, 'projectId', 1, 200);
            inputValidation.validateObject(usersData, 'usersData');
        } catch (validationError) {
            return res.status(400).json({ 
                success: false, 
                message: validationError.message 
            });
        }
        
        console.log(`Saving project users list for project: ${projectId}, user: ${userId}`);
        
        // Encrypt the users data
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        
        // Check if project doc already has salt, if not create new one
        const projectRef = db.collection('users').doc(userId).collection('projects').doc(projectId);
        const projectDoc = await projectRef.get();
        let salt, key, iv;
        
        if (projectDoc.exists && projectDoc.data().usersListSalt) {
            // Use existing salt (for key derivation consistency)
            salt = Buffer.from(projectDoc.data().usersListSalt, 'hex');
        } else {
            // Create new salt
            salt = crypto.randomBytes(16);
        }
        
        // ALWAYS generate new IV for each encryption (security requirement)
        iv = crypto.randomBytes(16);
        key = crypto.scryptSync(userId + projectId, salt, 32);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encryptedData = cipher.update(JSON.stringify(usersData), 'utf8', 'hex');
        encryptedData += cipher.final('hex');
        
        // Save encrypted data to Firestore subcollection
        await projectRef.set({
            usersList_encrypted: encryptedData,
            usersListSalt: salt.toString('hex'),
            usersListIV: iv.toString('hex'),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`✅ Project users list saved successfully for project: ${projectId}`);
        res.json({ success: true, message: 'Project users list saved successfully (encrypted)' });
    } catch (error) {
        const sanitized = sanitizeError(error, 'Failed to save project users');
        res.status(500).json({ success: false, message: 'Error saving project users list', ...sanitized });
    }
});

// Endpoint to load project-specific users list from Firestore (decrypted)
app.get('/load-project-users/:projectId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const projectId = req.params.projectId;
        
        console.log(`Loading project users list for project: ${projectId}, user: ${userId}`);
        
        // Load from Firestore user's projects subcollection
        const projectRef = db.collection('users').doc(userId).collection('projects').doc(projectId);
        const projectDoc = await projectRef.get();
        
        if (!projectDoc.exists) {
            console.log(`No users list found for project: ${projectId}, returning empty list`);
            return res.json({ users: [] });
        }
        
        const projectData = projectDoc.data();
        
        // Check for encrypted data
        if (projectData.usersList_encrypted && projectData.usersListIV && projectData.usersListSalt) {
            // Decrypt the data using stored salt
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const salt = Buffer.from(projectData.usersListSalt, 'hex');
            const key = crypto.scryptSync(userId + projectId, salt, 32);
            const iv = Buffer.from(projectData.usersListIV, 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decryptedData = decipher.update(projectData.usersList_encrypted, 'hex', 'utf8');
            decryptedData += decipher.final('utf8');
            
            console.log(`✅ Project users list loaded successfully for project: ${projectId}`);
            res.json(JSON.parse(decryptedData));
        } else {
            console.log(`No encrypted data found for project: ${projectId}, returning empty list`);
            res.json({ users: [] });
        }
    } catch (error) {
        const sanitized = sanitizeError(error, 'Failed to load project users');
        res.status(500).json({ success: false, message: 'Error loading project users list', ...sanitized });
    }
});

// Endpoint to save folder permissions
// Endpoint to save folder permissions (per user, per project in Firestore)
app.post('/save-folder-permissions', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { projectName, hubId, projectId, data } = req.body;
        
        // Input validation
        try {
            inputValidation.validateString(hubId, 'hubId', 1, 200);
            inputValidation.validateString(projectId, 'projectId', 1, 200);
            if (projectName) {
                inputValidation.validateString(projectName, 'projectName', 1, 500);
            }
            inputValidation.validateObject(data, 'data');
        } catch (validationError) {
            return res.status(400).json({ 
                success: false, 
                message: validationError.message 
            });
        }
        
        if (!hubId || !projectId) {
            return res.status(400).json({ success: false, message: 'Hub ID and Project ID are required' });
        }
        
        // Create unique key using hubId_projectId
        const permissionKey = `${hubId}_${projectId}`;
        
        // Encrypt the folder permissions data
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        
        // Check if user already has salt for this project's permissions
        const userDoc = await db.collection('users').doc(userId).get();
        let salt, key, iv;
        const existingIVs = (userDoc.exists && userDoc.data().folderPermissionsIVs) || {};
        const existingSalts = (userDoc.exists && userDoc.data().folderPermissionsSalts) || {};
        
        if (existingSalts[permissionKey]) {
            // Use existing salt (for key derivation consistency)
            salt = Buffer.from(existingSalts[permissionKey], 'hex');
        } else {
            // Create new salt for this project
            salt = crypto.randomBytes(16);
            existingSalts[permissionKey] = salt.toString('hex');
        }
        
        // ALWAYS generate new IV for each encryption (security requirement)
        iv = crypto.randomBytes(16);
        existingIVs[permissionKey] = iv.toString('hex');
        
        key = crypto.scryptSync(userId, salt, 32);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encryptedData = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encryptedData += cipher.final('hex');
        
        // Save to Firestore under user's document
        const folderPermissions = userDoc.exists ? (userDoc.data().folderPermissions || {}) : {};
        folderPermissions[permissionKey] = encryptedData;
        
        await db.collection('users').doc(userId).set({
            folderPermissions: folderPermissions,
            folderPermissionsSalts: existingSalts,
            folderPermissionsIVs: existingIVs
        }, { merge: true });
        
        console.log(`💾 Saved encrypted folder permissions for user ${userId}, project ${permissionKey}`);
        res.json({ 
            success: true, 
            message: 'Folder permissions saved successfully (encrypted)',
            permissionKey: permissionKey
        });
    } catch (error) {
        const sanitized = sanitizeError(error, 'Failed to save folder permissions');
        res.status(500).json({ 
            success: false, 
            message: 'Error saving folder permissions', 
            ...sanitized
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
        const folderPermissionsSalts = userData.folderPermissionsSalts || {};
        
        if (folderPermissions[permissionKey] && folderPermissionsIVs[permissionKey] && folderPermissionsSalts[permissionKey]) {
            // Decrypt the data using stored salt
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const salt = Buffer.from(folderPermissionsSalts[permissionKey], 'hex');
            const key = crypto.scryptSync(userId, salt, 32);
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
        const sanitized = sanitizeError(error, 'Failed to load folder permissions');
        res.status(500).json({ 
            success: false, 
            message: 'Error loading folder permissions', 
            ...sanitized
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
        const sanitized = sanitizeError(error, 'Failed to check permissions');
        res.json({ exists: false, ...sanitized });
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
                isTrial: data.isTrial || false,
                trialEndDate: data.trialEndDate?.toDate().toISOString(),
                trialUsed: data.trialUsed || false,
                lastLogin: data.lastLogin?.toDate().toISOString(),
                createdAt: data.createdAt?.toDate().toISOString()
            });
        });
        
        res.json({ success: true, users });
    } catch (error) {
        const sanitized = sanitizeError(error, 'Failed to fetch users');
        res.status(500).json({ success: false, ...sanitized });
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
        const sanitized = sanitizeError(error, 'Failed to fetch licenses');
        res.status(500).json({ success: false, ...sanitized });
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
        const sanitized = sanitizeError(error, 'Failed to fetch analytics');
        res.status(500).json({ success: false, ...sanitized });
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
        
        // If user already has a license key (e.g. expired), mark it as replaced
        if (userData.licenseKey) {
            try {
                await db.collection('licenses').doc(userData.licenseKey).update({
                    status: 'replaced',
                    replacedAt: admin.firestore.FieldValue.serverTimestamp(),
                    replacedBy: req.user.uid
                });
            } catch (e) {
                // Old license doc may not exist - ignore
            }
        }
        
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
            licenseExpiry: admin.firestore.Timestamp.fromDate(expiryDate),
            isTrial: false  // Clear trial flag when a real license is activated
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
        const sanitized = sanitizeError(error, 'Failed to activate license');
        res.status(500).json({ success: false, ...sanitized });
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
        const sanitized = sanitizeError(error, 'Failed to deactivate license');
        res.status(500).json({ success: false, ...sanitized });
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
                errors.push({ 
                    userId, 
                    error: isProduction ? 'Failed to delete user' : userError.message 
                });
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
        const sanitized = sanitizeError(error, 'Failed to delete users');
        res.status(500).json({ success: false, ...sanitized });
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
        const trialEndDate = userData.trialEndDate ? userData.trialEndDate.toDate() : null;
        const isTrial = userData.isTrial || false;
        const now = new Date();
        
        // Check access for non-admin users
        // Allow access if: 1) User has valid license OR 2) User is in trial period
        const hasValidLicense = licenseExpiry && licenseExpiry > now;
        const hasValidTrial = isTrial && trialEndDate && trialEndDate > now;
        
        if (!isAdmin && !hasValidLicense && !hasValidTrial) {
            return res.json({ 
                success: false, 
                error: isTrial ? 'Trial period expired. Please purchase a license to continue.' : 'License expired',
                redirectTo: 'purchase.html'
            });
        }
        
        // Update last login
        await db.collection('users').doc(userId).update({
            lastLogin: FieldValue.serverTimestamp()
        });
        
        // Log analytics
        await db.collection('analytics').add({
            userId: userId,
            action: 'login',
            timestamp: FieldValue.serverTimestamp(),
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
            isTrial: isTrial,
            trialEndDate: trialEndDate ? trialEndDate.toISOString() : null,
            redirectTo: isAdmin ? 'admin.html' : 'index.html'
        });
        
    } catch (error) {
        console.error('Error validating login:', error);
        res.status(500).json({ error: 'Failed to validate login' });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log('Available endpoints:');
    console.log('  GET  /load-credentials');
    console.log('  POST /save-credentials');
    console.log('  GET  /load');
    console.log('  POST /save');
    console.log('  GET  /load-project-users/:projectId');
    console.log('  POST /save-project-users/:projectId');
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