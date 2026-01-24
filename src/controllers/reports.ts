import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

export const getSalesReport = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const { restaurantId } = req.query;

        if (!restaurantId) {
            return res.status(400).json({ error: 'Restaurant ID is required' });
        }

        // Verify ownership
        const restaurant = await prisma.restaurant.findUnique({ where: { id: String(restaurantId) } });
        if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
        if (restaurant.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        // Group by Payment Method
        const sales = await prisma.order.groupBy({
            by: ['paymentMethod'],
            where: {
                restaurantId: String(restaurantId),
                status: { not: 'CANCELLED' } // Exclude cancelled orders
            },
            _sum: {
                total: true
            },
            _count: {
                id: true
            }
        });

        // Format the response
        const report = sales.map(s => ({
            method: s.paymentMethod,
            totalSales: s._sum.total || 0,
            orderCount: s._count.id
        }));

        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        // 1. Get all restaurant IDs for this owner
        const restaurants = await prisma.restaurant.findMany({
            where: { ownerId: userId },
            select: { id: true }
        });
        const restaurantIds = restaurants.map(r => r.id);

        if (restaurantIds.length === 0) {
            return res.json({
                totalRevenue: 0,
                totalOrders: 0,
                todaysRevenue: 0,
                todaysOrders: 0,
                recentOrders: []
            });
        }

        // 2. Aggregations

        // Total Stats (All Time) - Exclude Cancelled
        const totalStats = await prisma.order.aggregate({
            where: {
                restaurantId: { in: restaurantIds },
                status: { not: 'CANCELLED' }
            },
            _sum: { total: true },
            _count: { id: true }
        });

        // Today's Stats
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        const todayStats = await prisma.order.aggregate({
            where: {
                restaurantId: { in: restaurantIds },
                status: { not: 'CANCELLED' },
                createdAt: { gte: today }
            },
            _sum: { total: true },
            _count: { id: true }
        });

        // 4. Payout Calculations (Balance Due)
        // Ensure we only count COMPLETED orders for earnings
        const earningsStats = await prisma.order.aggregate({
            where: {
                restaurantId: { in: restaurantIds },
                status: 'COMPLETED'
            },
            _sum: { total: true }
        });
        const totalEarnings = Number(earningsStats._sum.total || 0);

        const payoutStats = await prisma.vendorPayout.aggregate({
            where: {
                vendorId: userId,
                status: 'PAID'
            },
            _sum: { amount: true }
        });
        const totalPaidOut = Number(payoutStats._sum.amount || 0);
        const balanceDue = totalEarnings - totalPaidOut;

        // 5. Top Selling Items
        // Group OrderItems by menuItemId
        const topItemsRaw = await prisma.orderItem.groupBy({
            by: ['menuItemId'],
            where: {
                order: {
                    restaurantId: { in: restaurantIds },
                    status: 'COMPLETED'
                }
            },
            _sum: {
                qty: true,
                price: true // Sum of price * qty effectively? No, price is unit price. We need manual calc or better aggregation.
            },
            orderBy: {
                _sum: { qty: 'desc' }
            },
            take: 5
        });

        // Enrich Top Items with names
        const topItems = await Promise.all(topItemsRaw.map(async (item) => {
            const menuItem = await prisma.menuItem.findUnique({
                where: { id: item.menuItemId },
                select: { name: true, price: true }
            });
            return {
                id: item.menuItemId,
                name: menuItem?.name || 'Unknown Item',
                qty: item._sum.qty || 0,
                revenue: Number(item._sum.qty || 0) * Number(menuItem?.price || 0) // Approx revenue
            };
        }));

        // 6. Customer Insights
        // Get unique customers from orders
        const ordersWithUsers = await prisma.order.findMany({
            where: {
                restaurantId: { in: restaurantIds },
                userId: { not: null }
            },
            select: {
                userId: true,
                createdAt: true,
                user: { select: { name: true, email: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Dedup customers manually
        const uniqueCustomers = new Map();
        ordersWithUsers.forEach(order => {
            if (order.userId && !uniqueCustomers.has(order.userId)) {
                uniqueCustomers.set(order.userId, {
                    id: order.userId,
                    name: order.user?.name || 'Guest',
                    email: order.user?.email,
                    lastOrderDate: order.createdAt
                });
            }
        });

        const recentCustomers = Array.from(uniqueCustomers.values()).slice(0, 10);

        res.json({
            // Revenue Stats
            totalRevenue: Number(totalStats._sum.total || 0),
            totalOrders: totalStats._count.id || 0,
            todaysRevenue: Number(todayStats._sum.total || 0),
            todaysOrders: todayStats._count.id || 0,

            // Financial Status
            totalEarnings,
            totalPaidOut,
            balanceDue,

            // Insights
            statusBreakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.id })),
            topItems,
            recentCustomers: recentCustomers
        });

    } catch (error: any) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ error: error.message });
    }
};
