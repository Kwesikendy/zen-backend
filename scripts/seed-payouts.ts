import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPayouts() {
    console.log('Seeding pending payouts...');

    // Get all orders that are COMPLETED or CONFIRMED but have no payout record
    const orders = await prisma.order.findMany({
        where: {
            status: { in: ['COMPLETED', 'CONFIRMED'] },
            paymentStatus: { in: ['PAID', 'PENDING'] } // Depending on if we pay out before getting paid? Let's assume yes for now or just PAID.
        },
        include: {
            restaurant: true
        }
    });

    console.log(`Found ${orders.length} orders to check.`);

    let createdCount = 0;

    for (const order of orders) {
        if (!order.restaurant.ownerId) continue;

        // Check if payout exists
        const existing = await prisma.vendorPayout.findFirst({
            where: { orderId: order.id }
        });

        if (!existing) {
            await prisma.vendorPayout.create({
                data: {
                    vendorId: order.restaurant.ownerId,
                    orderId: order.id,
                    amount: order.total,
                    status: 'PENDING'
                }
            });
            createdCount++;
        }
    }

    console.log(`Created ${createdCount} new pending payout records.`);
}

seedPayouts()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
