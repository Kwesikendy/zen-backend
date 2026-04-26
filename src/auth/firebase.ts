import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

if (!admin.apps.length) {
    const serviceAccountPath = path.resolve(__dirname, '../../../zenran-11c7f-firebase-adminsdk-fbsvc-e36f7daa22.json');

    if (fs.existsSync(serviceAccountPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
        });
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } else {
        throw new Error('[Firebase] No Firebase credentials found. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY on Render.');
    }
}

export const firebaseAdmin = admin;
export const firebaseAuth = admin.auth();
