import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createOrderSchema, updateOrderStatusSchema } from '../schemas/order';
import { initializeTransaction } from '../services/payment';
import { sendSMS, generateTicketCode } from '../services/notification';

const prisma = new PrismaClient();

export const createOrder = async (req: AuthRequest, res: Response) => {
    try {
        // 1. Validate Input
        const { restaurantId, items, customerName, tableNumber, paymentMethod, phoneNumber } = createOrderSchema.parse(req.body);
        const userId = req.user?.userId || null;

        // 2. Fetch all Menu Items to get prices
        const menuItemIds = items.map(i => i.menuItemId);
        const menuItems = await prisma.menuItem.findMany({
            where: { id: { in: menuItemIds } },
            include: { options: true }
        });

        // 3. Calculate Total
        let total = 0;
        const orderItemsData = [];

        for (const item of items) {
            const menuItem = menuItems.find(m => m.id === item.menuItemId);
            if (!menuItem) throw new Error(`Menu item ${item.menuItemId} not found`);

            let itemPrice = Number(menuItem.price);
            const selectedOptions = [];

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
                price: itemPrice,
                selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined
            });
        }

        // 4. Generate Ticket Code
        // Count orders for this restaurant today to generate code
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const orderCount = await prisma.order.count({
            where: {
                restaurantId,
                createdAt: { gte: today }
            }
        });
        const ticketCode = generateTicketCode(orderCount + 1);

        // 5. Handle Payment Logic
        let paymentStatus: 'PENDING' | 'PAID' | 'FAILED' = 'PENDING';
        let paystackData = null;

        if (paymentMethod === 'MOMO') {
            if (!phoneNumber) throw new Error('Phone number is required for Mobile Money');
            // Use a dummy email if user is anonymous, or user's email
            const email = req.user?.email || `customer-${phoneNumber}@zenran.com`;

            // Initialize Paystack
            const reference = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            paystackData = await initializeTransaction(email, total, reference);
        } else {
            // Cash orders are PENDING payment until confirmed by vendor, or we can mark as PENDING
            paymentStatus = 'PENDING';
        }

        // 6. Create Order
        const order = await prisma.order.create({
            data: {
                restaurantId,
                userId,
                customerName,
                tableNumber,
                total,
                status: 'PENDING',
                paymentMethod: paymentMethod || 'CASH',
                paymentStatus,
                phoneNumber,
                ticketCode,
                paystackReference: paystackData?.reference,
                items: {
                    create: orderItemsData
                }
            },
            include: { items: true }
        });

        // 7. Send SMS (Ticket Code)
        if (phoneNumber) {
            await sendSMS(phoneNumber, `Your Zenran Order #${ticketCode} is placed. Total: ${total}`);
        }

        res.status(201).json({
            order,
            paymentUrl: paystackData?.authorization_url // Frontend should redirect here if exists
        });

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
