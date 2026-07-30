const admin = require('firebase-admin');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const fs = require('fs');
const path = require('path');

// Check if we should use VM service account (no key file needed)
const useVMServiceAccount = process.env.USE_VM_SERVICE_ACCOUNT === 'true';

// Firebase Auth project (for token verification)
const firebaseAuthProjectId = process.env.FIREBASE_PROJECT_ID || 'forma-user-management-b0656';

// Firestore project (same project as Firebase Auth)
const firestoreProjectId = process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'forma-user-management-b0656';
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';

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

const db = new Firestore({
    projectId: firestoreProjectId,
    databaseId: firestoreDatabaseId
});

module.exports = { admin, db, FieldValue };
