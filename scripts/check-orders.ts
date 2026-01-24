import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkOrders() {
    console.log('Checking orders...');
    const orders = await prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { restaurant: true }
    });

    if (orders.length === 0) {
        console.log('No orders found.');
    } else {
        orders.forEach(o => {
            console.log(`Order ${o.id.substring(0, 8)}: Status=${o.status}, PayStatus=${o.paymentStatus}, Total=${o.total}`);
        });
    }
}

checkOrders()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
