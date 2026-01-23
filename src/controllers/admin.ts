
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getSystemStats = async (req: Request, res: Response) => {
    try {
        const allOrders = await prisma.order.findMany({
            where: {
                status: { not: 'CANCELLED' }
            },
            select: {
                total: true,
                paymentStatus: true,
                paymentMethod: true
            }
        });

        const totalRevenue = allOrders.reduce((acc, order) => acc + Number(order.total), 0);
        const paystackRevenue = allOrders
            .filter(o => o.paymentMethod === 'MOMO' && o.paymentStatus === 'PAID')
            .reduce((acc, order) => acc + Number(order.total), 0);
        const cashRevenue = allOrders
            .filter(o => o.paymentMethod === 'CASH')
            .reduce((acc, order) => acc + Number(order.total), 0);

        const userCount = await prisma.user.count({ where: { role: 'USER' } });
        const ownerCount = await prisma.user.count({ where: { role: 'OWNER' } });
        const restaurantCount = await prisma.restaurant.count();
        const totalOrders = allOrders.length;
        const pendingOrders = await prisma.order.count({ where: { status: 'PENDING' } });

        res.json({
            revenue: {
                total: totalRevenue,
                paystack: paystackRevenue,
                cash: cashRevenue
            },
            counts: {
                users: userCount,
                owners: ownerCount,
                restaurants: restaurantCount,
                orders: totalOrders,
                pendingOrders
            }
        });
    } catch (error) {
        console.error('Admin Stats Error:', error);
        res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
};

export const getUsers = async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isBanned: true,
                createdAt: true
            }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

export const toggleBan = async (req: Request, res: Response) => {
    const { userId } = req.params;
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const updated = await prisma.user.update({
            where: { id: userId },
            data: { isBanned: !user.isBanned }
        });

        res.json({ isBanned: updated.isBanned });
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle ban' });
    }
};
