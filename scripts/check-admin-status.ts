import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@zenran.com';
    console.log(`Checking user status for: ${email}...`);

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        console.log('❌ User NOT FOUND in the database.');
    } else {
        console.log('✅ User Found:');
        console.log(`   ID: ${user.id}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Is Banned: ${user.isBanned}`);
        console.log(`   Created At: ${user.createdAt}`);

        if (user.role !== 'ADMIN') {
            console.warn('⚠️ WARNING: User role is NOT ADMIN!');
        } else {
            console.log('OK: User has ADMIN role.');
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
