import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const serviceAccountPath = path.resolve(__dirname, '../../../zenran-11c7f-firebase-adminsdk-fbsvc-e36f7daa22.json');

if (!admin.apps.length) {
    if (fs.existsSync(serviceAccountPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
        });
    } else {
        // Fallback: use env var FIREBASE_SERVICE_ACCOUNT (JSON string)
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }
}

export const firebaseAdmin = admin;
export const firebaseAuth = admin.auth();
