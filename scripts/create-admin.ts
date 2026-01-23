
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import 'dotenv/config';

const prisma = new PrismaClient();

async function createAdmin() {
    const email = process.argv[2];
    const password = process.argv[3];
    const name = process.argv[4] || 'Super Admin';

    if (!email || !password) {
        console.error('Usage: npx ts-node scripts/create-admin.ts <email> <password> [name]');
        process.exit(1);
    }

    try {
        console.log(`Creating Admin: ${email}...`);

        const hashedPassword = await argon2.hash(password);

        const admin = await prisma.user.upsert({
            where: { email },
            update: {
                role: 'ADMIN',
                password: hashedPassword, // Reset password if exists
                name
            },
            create: {
                email,
                password: hashedPassword,
                name,
                role: 'ADMIN'
            }
        });

        console.log('✅ Admin User Created/Updated Successfully!');
        console.log(`ID: ${admin.id}`);
        console.log(`Role: ${admin.role}`);

    } catch (error) {
        console.error('Error creating admin:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin();
