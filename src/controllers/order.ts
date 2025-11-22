import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createOrderSchema, updateOrderStatusSchema } from '../schemas/order';

const prisma = new PrismaClient();

export const createOrder = async (req: AuthRequest, res: Response) => {
    try {
        const validatedData = createOrderSchema.parse(req.body);
        // userId is optional now (for kiosks/vendors)
        const userId = req.user?.userId;

        // 1. Fetch all menu items to get real prices
        const itemIds = validatedData.items.map(i => i.menuItemId);
        const dbItems = await prisma.menuItem.findMany({
            where: { id: { in: itemIds } },
        });

        // 2. Validate all items exist
        if (dbItems.length !== itemIds.length) {
            return res.status(400).json({ error: 'One or more items not found' });
        }

        // 3. Calculate total and prepare order items data
        let total = 0;
        const orderItemsData = validatedData.items.map(item => {
            const dbItem = dbItems.find(i => i.id === item.menuItemId)!;
            const itemTotal = dbItem.price * item.qty;
            total += itemTotal;
            return {
                name: dbItem.name,
                price: dbItem.price,
                qty: item.qty,
            };
        });

        // 4. Create Order
        const order = await prisma.order.create({
            data: {
                userId: userId || null, // Explicitly allow null
                restaurantId: validatedData.restaurantId,
                customerName: validatedData.customerName,
                tableNumber: validatedData.tableNumber,
                total,
                status: 'PENDING',
                items: {
                    create: orderItemsData,
                },
            },
            include: { items: true },
        });

        res.status(201).json(order);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getOrder = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const order = await prisma.order.findUnique({
            where: { id },
            include: { items: true, restaurant: true },
        });

        if (!order) return res.status(404).json({ error: 'Order not found' });

        // Allow access if user is the creator OR the restaurant owner
        if (order.userId !== userId) {
            const restaurant = await prisma.restaurant.findUnique({ where: { id: order.restaurantId } });
            if (restaurant?.ownerId !== userId) {
                return res.status(403).json({ error: 'Unauthorized' });
            }
        }

        res.json(order);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getMyOrders = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const orders = await prisma.order.findMany({
            where: { userId },
            include: { items: true, restaurant: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(orders);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getRestaurantOrders = async (req: AuthRequest, res: Response) => {
    try {
        const { restaurantId } = req.params;
        const userId = req.user!.userId;

        // Verify ownership
        const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
        if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
        if (restaurant.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        const orders = await prisma.order.findMany({
            where: { restaurantId },
            include: { items: true, user: { select: { name: true, email: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(orders);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const { status } = updateOrderStatusSchema.parse(req.body);

        const order = await prisma.order.findUnique({
            where: { id },
            include: { restaurant: true },
        });

        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.restaurant.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.order.update({
            where: { id },
            data: { status },
        });

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
