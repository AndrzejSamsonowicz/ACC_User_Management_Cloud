const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Add CORS headers to allow requests from http-server (port 8080)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Serve static files from current directory
app.use(express.static(__dirname));

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
app.post('/save-credentials', (req, res) => {
    try {
        const { clientId, clientSecret } = req.body;
        
        if (!clientId || !clientSecret) {
            return res.status(400).json({ 
                success: false, 
                message: 'Both clientId and clientSecret are required' 
            });
        }

        // Read existing .env file
        const envObj = readEnvFile();
        
        // Update credentials
        envObj.APS_CLIENT_ID = clientId;
        envObj.APS_CLIENT_SECRET = clientSecret;
        
        // Write back to .env file
        writeEnvFile(envObj);
        
        res.json({ success: true, message: 'Credentials saved to .env file successfully' });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error saving credentials', 
            error: error.message 
        });
    }
});

// Endpoint to load credentials from .env file
app.get('/load-credentials', (req, res) => {
    try {
        const envObj = readEnvFile();
        
        res.json({
            success: true,
            clientId: envObj.APS_CLIENT_ID || '',
            clientSecret: envObj.APS_CLIENT_SECRET || ''
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error loading credentials', 
            error: error.message 
        });
    }
});

// Endpoint to save JSON file
app.post('/save', (req, res) => {
    const filePath = path.join(__dirname, 'user_permissions_import.json');
    try {
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
        res.json({ success: true, message: 'File saved successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error saving file', error: error.message });
    }
});

// Endpoint to load JSON file
app.get('/load', (req, res) => {
    const filePath = path.join(__dirname, 'user_permissions_import.json');
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json({ users: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error loading file', error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log('  GET  /load-credentials');
    console.log('  POST /save-credentials');
    console.log('  GET  /load');
    console.log('  POST /save');
});