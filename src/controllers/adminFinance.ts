import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// GET /admin/finance/overview
export const getFinancialOverview = async (req: AuthRequest, res: Response) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));

        // Today's stats
        const todayOrders = await prisma.order.findMany({
            where: {
                createdAt: { gte: todayStart },
                status: { not: 'CANCELLED' }
            }
        });

        const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total), 0);
        const todayPaystack = todayOrders
            .filter(o => o.paymentMethod === 'MOMO' && o.paymentStatus === 'PAID')
            .reduce((sum, order) => sum + Number(order.total), 0);
        const todayCash = todayOrders
            .filter(o => o.paymentMethod === 'CASH')
            .reduce((sum, order) => sum + Number(order.total), 0);

        // Paystack settlement tracking
        const paystackTransactions = await prisma.transaction.findMany({
            where: { method: 'MOMO' }
        });

        const paystackTotal = paystackTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
        const paystackSettled = paystackTransactions
            .filter(t => t.settlementStatus === 'SETTLED')
            .reduce((sum, t) => sum + Number(t.amount), 0);
        const paystackPending = paystackTotal - paystackSettled;

        // Vendor payouts
        const allPayouts = await prisma.vendorPayout.findMany();
        const totalOwed = allPayouts
            .filter(p => p.status === 'PENDING')
            .reduce((sum, p) => sum + Number(p.amount), 0);
        const paidOut = allPayouts
            .filter(p => p.status === 'PAID')
            .reduce((sum, p) => sum + Number(p.amount), 0);

        res.json({
            today: {
                revenue: todayRevenue,
                orders: todayOrders.length,
                paystack: todayPaystack,
                momo: todayPaystack, // Same as paystack for now
                cash: todayCash
            },
            paystack: {
                totalCollected: paystackTotal,
                settled: paystackSettled,
                pending: paystackPending,
                pendingAmount: paystackPending
            },
            vendors: {
                totalOwed,
                paidOut,
                pending: totalOwed
            }
        });
    } catch (error) {
        console.error('Financial Overview Error:', error);
        res.status(500).json({ error: 'Failed to fetch financial overview' });
    }
};

// GET /admin/transactions
export const getTransactions = async (req: AuthRequest, res: Response) => {
    try {
        const { page = '1', limit = '50', type, status, method } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = {};
        if (type) where.type = type;
        if (status) where.status = status;
        if (method) where.method = method;

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
                include: {
                    order: {
                        select: {
                            id: true,
                            customerName: true,
                            total: true
                        }
                    }
                }
            }),
            prisma.transaction.count({ where })
        ]);

        res.json({
            transactions,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit))
        });
    } catch (error) {
        console.error('Get Transactions Error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
};

// GET /admin/vendors
export const getVendors = async (req: AuthRequest, res: Response) => {
    try {
        const { page = '1', limit = '20', status } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { role: 'OWNER' };
        if (status === 'active') where.isBanned = false;
        if (status === 'suspended') where.isBanned = true;

        const vendors = await prisma.user.findMany({
            where,
            skip,
            take: Number(limit),
            include: {
                restaurants: {
                    select: { name: true }
                },
                payouts: {
                    select: {
                        amount: true,
                        status: true
                    }
                }
            }
        });

        // Calculate stats for each vendor
        const vendorsWithStats = await Promise.all(
            vendors.map(async (vendor) => {
                const orders = await prisma.order.findMany({
                    where: {
                        restaurant: {
                            ownerId: vendor.id
                        },
                        status: { not: 'CANCELLED' }
                    }
                });

                const totalSales = orders.reduce((sum, o) => sum + Number(o.total), 0);
                const pendingPayout = vendor.payouts
                    .filter(p => p.status === 'PENDING')
                    .reduce((sum, p) => sum + Number(p.amount), 0);

                return {
                    id: vendor.id,
                    name: vendor.name,
                    email: vendor.email,
                    restaurant: vendor.restaurants[0] || null,
                    totalSales,
                    totalOrders: orders.length,
                    pendingPayout,
                    isActive: !vendor.isBanned
                };
            })
        );

        const total = await prisma.user.count({ where });

        res.json({
            vendors: vendorsWithStats,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit))
        });
    } catch (error) {
        console.error('Get Vendors Error:', error);
        res.status(500).json({ error: 'Failed to fetch vendors' });
    }
};

// POST /admin/vendors/:id/suspend
export const suspendVendor = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user!.userId;

        await prisma.user.update({
            where: { id },
            data: { isBanned: true }
        });

        // Log admin action
        await prisma.adminAction.create({
            data: {
                adminId,
                action: 'SUSPEND_VENDOR',
                targetType: 'USER',
                targetId: id,
                metadata: { reason }
            }
        });

        res.json({ success: true, message: 'Vendor suspended' });
    } catch (error) {
        console.error('Suspend Vendor Error:', error);
        res.status(500).json({ error: 'Failed to suspend vendor' });
    }
};

// POST /admin/vendors/:id/activate
export const activateVendor = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const adminId = req.user!.userId;

        await prisma.user.update({
            where: { id },
            data: { isBanned: false }
        });

        // Log admin action
        await prisma.adminAction.create({
            data: {
                adminId,
                action: 'ACTIVATE_VENDOR',
                targetType: 'USER',
                targetId: id
            }
        });

        res.json({ success: true, message: 'Vendor activated' });
    } catch (error) {
        console.error('Activate Vendor Error:', error);
        res.status(500).json({ error: 'Failed to activate vendor' });
    }
};
