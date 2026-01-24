import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function forcePayoutData() {
    console.log('Forcing payout data for testing...');

    // Get the latest 3 orders
    const orders = await prisma.order.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' },
        include: { restaurant: true }
    });

    if (orders.length === 0) {
        console.log('No orders to update.');
        return;
    }

    for (const order of orders) {
        console.log(`Updating Order ${order.id}...`);

        // 1. Update Order Status
        await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'COMPLETED',
                paymentStatus: 'PAID'
            }
        });

        // 2. Create Payout if missing
        const existing = await prisma.vendorPayout.findFirst({
            where: { orderId: order.id }
        });

        if (!existing && order.restaurant.ownerId) {
            await prisma.vendorPayout.create({
                data: {
                    vendorId: order.restaurant.ownerId,
                    orderId: order.id,
                    amount: order.total,
                    status: 'PENDING'
                }
            });
            console.log(`Created Payout for Order ${order.id}`);
        } else {
            console.log(`Payout already exists for Order ${order.id}`);
        }
    }
}

forcePayoutData()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
