import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createOrderSchema, updateOrderStatusSchema } from '../schemas/order';
import { initializeTransaction, verifyTransaction } from '../services/payment';
import { sendSMS, generateTicketCode } from '../services/notification';
import { sendPushNotification } from '../services/notificationService';
import { emitToRestaurant, emitToUser } from '../services/socket';

const prisma = new PrismaClient();

export const createOrder = async (req: AuthRequest, res: Response) => {
    try {
        // 1. Validate Input
        // We manually extract deliveryLocation for now as it's not yet in the Zod schema
        const { restaurantId, items, customerName, tableNumber, paymentMethod, phoneNumber, deliveryLocation } = req.body;

        // Validate core fields using Zod (excluding deliveryLocation which is unchecked for now)
        createOrderSchema.parse({ restaurantId, items, customerName, tableNumber, paymentMethod, phoneNumber });

        const userId = req.user?.userId || null;

        // 2. Fetch all Menu Items to get prices
        const menuItemIds = items.map((i: any) => i.menuItemId);
        const menuItems = await prisma.menuItem.findMany({
            where: { id: { in: menuItemIds } },
            include: { options: true }
        });

        // 3. Calculate Total
        let total = 0;
        const orderItemsData: any[] = [];

        for (const item of items) {
            const menuItem = menuItems.find(m => m.id === item.menuItemId);
            if (!menuItem) throw new Error(`Menu item ${item.menuItemId} not found`);

            // Inventory Check
            if (menuItem.qty < item.qty) {
                throw new Error(`Out of stock: ${menuItem.name}. Only ${menuItem.qty} left.`);
            }

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

            // Fetch restaurant to check if Option B Subaccount Split is active
            const restaurantInfo = await prisma.restaurant.findUnique({
                where: { id: restaurantId },
                select: { paystackSubaccountCode: true }
            });

            // Initialize Paystack with Option B subaccount (if present)
            const reference = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            paystackData = await initializeTransaction(email, total, reference, restaurantInfo?.paystackSubaccountCode);
        } else {
            // Cash orders are PENDING payment until confirmed by vendor, or we can mark as PENDING
            paymentStatus = 'PENDING';
        }

        // 6. Create Order with Inventory Decrement
        const order = await prisma.$transaction(async (tx) => {
            // Decrement Stock
            for (const item of items) {
                await tx.menuItem.update({
                    where: { id: item.menuItemId },
                    data: { qty: { decrement: item.qty } }
                });
            }

            return tx.order.create({
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

                    // Delivery Fields
                    deliveryAddress: deliveryLocation?.address,
                    deliveryLat: deliveryLocation?.lat,
                    deliveryLng: deliveryLocation?.lng,

                    items: {
                        create: orderItemsData
                    }
                },
                include: { items: true }
            });
        });

        // 7. Send SMS (Ticket Code)
        if (phoneNumber) {
            await sendSMS(phoneNumber, `Your Zenran Order #${ticketCode} is placed. Total: ${total}`);
        }

        // 8. Real-time Notification
        emitToRestaurant(restaurantId, 'NEW_ORDER', order);

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
            include: { restaurant: true, items: true, user: true },
        });

        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.restaurant.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        // Handle Inventory Restock on Cancellation
        if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
            await prisma.$transaction(async (tx) => {
                for (const item of order.items) {
                    await tx.menuItem.update({
                        where: { id: item.menuItemId },
                        data: { qty: { increment: item.qty } }
                    });
                }

                await tx.order.update({
                    where: { id },
                    data: { status }
                });
            });
            // Fetch updated order to return
            const updated = await prisma.order.findUnique({ where: { id } });

            if (updated) {
                emitToRestaurant(order.restaurantId, 'ORDER_STATUS_UPDATE', updated);
                if (updated.userId) emitToUser(updated.userId, 'ORDER_STATUS_UPDATE', updated);
            }

            return res.json(updated);
        }

        const updated = await prisma.order.update({
            where: { id },
            data: { status },
        });

        // Create Vendor Payout Record if Completed
        if (status === 'COMPLETED' || status === 'CONFIRMED') {
            // Check if payout exists
            const existingPayout = await prisma.vendorPayout.findFirst({ where: { orderId: id } });
            if (!existingPayout && order.restaurant.ownerId) {
                await prisma.vendorPayout.create({
                    data: {
                        vendorId: order.restaurant.ownerId,
                        orderId: id,
                        amount: order.total,
                        status: 'PENDING'
                    }
                });
            }
        }

        // Push Notification
        if (order.user?.pushToken && (status === 'READY' || status === 'CONFIRMED' || status === 'COMPLETED' || status === 'CANCELLED')) {
            let title = 'Order Update';
            let body = `Your order is now ${status}`;

            if (status === 'READY') {
                title = 'Order Ready! 🍽️';
                body = `Your order #${order.ticketCode} is ready for pickup!`;
            } else if (status === 'CONFIRMED') {
                title = 'Order Confirmed ✅';
                body = `Your order #${order.ticketCode} is being prepared.`;
            }

            await sendPushNotification(order.user.pushToken, title, body, { orderId: order.id });
        }

        emitToRestaurant(order.restaurantId, 'ORDER_STATUS_UPDATE', updated);
        if (updated.userId) emitToUser(updated.userId, 'ORDER_STATUS_UPDATE', updated);

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const verifyPayment = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const order = await prisma.order.findUnique({
            where: { id },
        });

        if (!order) return res.status(404).json({ error: 'Order not found' });

        console.log(`Verifying Payment: Order User ${order.userId} vs Request User ${userId}`);

        if (order.userId !== userId) return res.status(403).json({ error: 'Unauthorized - User ID Mismatch' });

        if (!order.paystackReference) {
            return res.status(400).json({ error: 'No payment reference found for this order' });
        }

        // Verify with Paystack
        const data = await verifyTransaction(order.paystackReference);

        if (data.status === 'success') {
            // Update Order
            const updated = await prisma.order.update({
                where: { id },
                data: {
                    paymentStatus: 'PAID',
                    status: 'CONFIRMED' // Auto-confirm on payment
                }
            });

            emitToRestaurant(order.restaurantId, 'ORDER_STATUS_UPDATE', updated);
            return res.json({ success: true, order: updated });
        } else {
            return res.status(400).json({ success: false, message: 'Payment verification failed', data });
        }
    } catch (error: any) {
        console.error('Verify Payment Error:', error);
        res.status(500).json({ error: error.message });
    }
};
