import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

if (!admin.apps.length) {
    const serviceAccountPath = path.resolve(__dirname, '../../../zenran-11c7f-firebase-adminsdk-fbsvc-e36f7daa22.json');

    if (fs.existsSync(serviceAccountPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
        });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } else {
        throw new Error(
            '[Firebase] FIREBASE_SERVICE_ACCOUNT environment variable is not set. ' +
            'Add the service account JSON string to your environment variables on Render.'
        );
    }
}

export const firebaseAdmin = admin;
export const firebaseAuth = admin.auth();
