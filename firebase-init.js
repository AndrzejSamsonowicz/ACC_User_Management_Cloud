const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Check if we should use VM service account (no key file needed)
const useVMServiceAccount = process.env.USE_VM_SERVICE_ACCOUNT === 'true';

if (useVMServiceAccount) {
    console.log('✅ Using VM Service Account (Application Default Credentials)');
    console.log('   No service-account.json file needed');
    
    // When running on GCP VM, automatically uses the VM's service account
    // Explicitly specify the Firebase project ID to avoid project mismatch
    const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || 'forma-user-management-b0656';
    console.log(`   Using Firebase Project: ${firebaseProjectId}`);
    
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseProjectId
    });
} else {
    // Traditional method: use service-account.json file
    const serviceAccountPath = path.join(__dirname, 'service-account.json');
    
    if (fs.existsSync(serviceAccountPath)) {
        console.log('✅ Using service-account.json file');
        const serviceAccount = require('./service-account.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        console.error('❌ service-account.json not found!');
        console.error('   Either:');
        console.error('   1. Add service-account.json file, OR');
        console.error('   2. Set USE_VM_SERVICE_ACCOUNT=true in .env to use VM credentials');
        process.exit(1);
    }
}

const db = admin.firestore();

module.exports = { admin, db };
