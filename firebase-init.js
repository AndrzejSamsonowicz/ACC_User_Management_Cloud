const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');

if (fs.existsSync(serviceAccountPath)) {
    console.log('✅ Using service-account.json file');
    const serviceAccount = require('./service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} else {
    console.error('❌ service-account.json not found!');
    process.exit(1);
}

const db = admin.firestore();

module.exports = { admin, db };
