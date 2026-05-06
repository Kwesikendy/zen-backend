import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';
import 'dotenv/config';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

async function createFirebaseAdmin() {
    // Init Firebase Admin
    if (!admin.apps.length) {
        const serviceAccountPath = path.resolve(__dirname, '../../zenran-11c7f-firebase-adminsdk-fbsvc-e36f7daa22.json');
        if (fs.existsSync(serviceAccountPath)) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
        }
    }

    const email = 'admin@zenran.com';
    const password = 'ZeNrAnAdMiN';

    try {
        // Create or update in Firebase
        let firebaseUser;
        try {
            firebaseUser = await admin.auth().getUserByEmail(email);
            await admin.auth().updateUser(firebaseUser.uid, { password });
            console.log('✅ Updated existing Firebase user password');
        } catch {
            firebaseUser = await admin.auth().createUser({ email, password, displayName: 'Super Admin' });
            console.log('✅ Created new Firebase user');
        }

        // Upsert in database with ADMIN role
        const user = await prisma.user.upsert({
            where: { email },
            update: { role: 'ADMIN', name: 'Super Admin', password: firebaseUser.uid },
            create: { email, name: 'Super Admin', password: firebaseUser.uid, role: 'ADMIN' },
        });

        console.log(`
✅ Admin account ready!
------------------------------------------
Email:    ${email}
Password: ${password}
Role:     ${user.role}
ID:       ${user.id}
------------------------------------------
        `);
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createFirebaseAdmin();
