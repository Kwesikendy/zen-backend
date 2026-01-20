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

        // 3. Status Breakdown (for fun visual)
        const statusBreakdown = await prisma.order.groupBy({
            by: ['status'],
            where: {
                restaurantId: { in: restaurantIds },
            },
            _count: { id: true }
        });

        res.json({
            totalRevenue: Number(totalStats._sum.total || 0),
            totalOrders: totalStats._count.id || 0,
            todaysRevenue: Number(todayStats._sum.total || 0),
            todaysOrders: todayStats._count.id || 0,
            statusBreakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.id }))
        });

    } catch (error: any) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ error: error.message });
    }
};
