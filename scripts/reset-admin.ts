import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function resetAdmin() {
    try {
        const email = 'admin@zenran.com';
        const password = 'password123';

        console.log(`  Deleting existing admin user: ${email}...`);

        // Find user first to get ID
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            console.log('Cleaning up related records...');
            // Delete related records manually to avoid FK constraint errors
            await prisma.refreshToken.deleteMany({ where: { userId: existingUser.id } });
            await prisma.adminAction.deleteMany({ where: { adminId: existingUser.id } });
            // Note: Orders, Restaurants, etc. might be better to keep or handle carefully
            // But for admin reset, these are likely minimal.

            await prisma.user.delete({
                where: { email }
            });
            console.log('✅ Deleted existing admin user.');
        } else {
            console.log('ℹ️  No existing admin user found.');
        }

        console.log(`Creating new Super Admin...`);
        const hashedPassword = await argon2.hash(password);

        const admin = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: 'Super Admin',
                role: 'ADMIN',
                isBanned: false
            }
        });

        console.log(`
✅ SUCCESS! Admin account reset.
------------------------------------------
Email:    ${email}
Password: ${password}
Role:     ${admin.role}
ID:       ${admin.id}
------------------------------------------
`);

    } catch (error) {
        console.error('❌ Error resetting admin:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetAdmin();
