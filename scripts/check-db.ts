import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
    try {
        const restaurants = await prisma.restaurant.findMany({
            include: {
                menuItems: true
            }
        });

        console.log('\n📊 DATABASE STATUS:\n');
        console.log(`Total Restaurants: ${restaurants.length}`);

        restaurants.forEach(restaurant => {
            console.log(`\n🏪 ${restaurant.name}`);
            console.log(`   Menu Items: ${restaurant.menuItems.length}`);

            if (restaurant.menuItems.length > 0) {
                restaurant.menuItems.forEach(item => {
                    console.log(`   - ${item.name} (₵${item.price})`);
                });
            } else {
                console.log('   ⚠️  NO MENU ITEMS');
            }
        });

        const totalMenuItems = await prisma.menuItem.count();
        console.log(`\n📝 Total Menu Items Across All Restaurants: ${totalMenuItems}\n`);

    } catch (error) {
        console.error('❌ Database Check Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDatabase();
