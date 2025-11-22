import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createOrderSchema, updateOrderStatusSchema } from '../schemas/order';

const prisma = new PrismaClient();

export const createOrder = async (req: AuthRequest, res: Response) => {
    try {
        // 1. Validate Input
        const { restaurantId, items, customerName, tableNumber } = createOrderSchema.parse(req.body);
        const userId = req.user?.userId || null; // Optional for Kiosk/Vendor

        // 2. Fetch all Menu Items to get prices
        const menuItemIds = items.map(i => i.menuItemId);
        const menuItems = await prisma.menuItem.findMany({
            where: { id: { in: menuItemIds } },
            include: { options: true } // Include options to validate prices
        });

        // 3. Calculate Total and Prepare Order Items
        let total = 0;
        const orderItemsData = [];

        for (const item of items) {
            const menuItem = menuItems.find(m => m.id === item.menuItemId);
            if (!menuItem) throw new Error(`Menu item ${item.menuItemId} not found`);

            let itemPrice = Number(menuItem.price);
            const selectedOptions = [];

            // Handle Options
            if (item.options && item.options.length > 0) {
                for (const optionId of item.options) {
                    const option = menuItem.options.find(o => o.id === optionId);
                    if (option) {
                        itemPrice += Number(option.price);
                        selectedOptions.push({ name: option.name, price: Number(option.price) });
                    }
                }
            }

            total += itemPrice * item.qty;

            orderItemsData.push({
                menuItemId: item.menuItemId,
                qty: item.qty,
                price: itemPrice, // Price per unit including options
                selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined
            });
        }

        // 4. Create Order
        const order = await prisma.order.create({
            data: {
                restaurantId,
                userId,
                customerName,
                tableNumber,
                total,
                status: 'PENDING',
                items: {
                    create: orderItemsData
                }
            },
            include: { items: true }
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
