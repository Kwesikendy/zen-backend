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
