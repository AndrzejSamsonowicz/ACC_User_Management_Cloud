const admin = require('firebase-admin');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const fs = require('fs');
const path = require('path');

// Check if we should use VM service account (no key file needed)
const useVMServiceAccount = process.env.USE_VM_SERVICE_ACCOUNT === 'true';

// Firebase Auth project (for token verification)
const firebaseAuthProjectId = process.env.FIREBASE_PROJECT_ID || 'forma-user-management-b0656';

// Firestore project (for database - uses VM's own project for native permissions)
const firestoreProjectId = process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'apps-503111';
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || 'forma-user-management-firebase';

if (useVMServiceAccount) {
    console.log('✅ Using VM Service Account (Application Default Credentials)');
    console.log(`   Auth Project (token verification): ${firebaseAuthProjectId}`);
    console.log(`   Firestore Project: ${firestoreProjectId}, Database: ${firestoreDatabaseId}`);

    // App for Firebase Auth token verification only
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseAuthProjectId
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

// Separate Firestore client pointing to the VM's own project database
// This avoids cross-project permission issues
const db = new Firestore({
    projectId: firestoreProjectId,
    databaseId: firestoreDatabaseId
});

module.exports = { admin, db, FieldValue };
