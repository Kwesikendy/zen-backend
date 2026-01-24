import { Request, Response } from 'express';
import { verifyTransaction } from '../services/payment';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { emitToRestaurant } from '../services/socket';

const prisma = new PrismaClient();

export const handlePaymentCallback = async (req: Request, res: Response) => {
    try {
        const { reference } = req.query;
        if (!reference || typeof reference !== 'string') {
            return res.status(400).send('Missing transaction reference');
        }

        const data = await verifyTransaction(reference);

        if (data.status === 'success') {
            // Find order
            const order = await prisma.order.findFirst({
                where: { paystackReference: reference }
            });

            if (order) {
                // Update order if not already paid
                if (order.paymentStatus !== 'PAID') {
                    const updatedOrder = await prisma.order.update({
                        where: { id: order.id },
                        data: {
                            paymentStatus: 'PAID',
                            status: 'CONFIRMED'
                        }
                    });

                    // Create Vendor Payout Record if not exists
                    if (updatedOrder.status === 'COMPLETED' || updatedOrder.status === 'CONFIRMED') {
                        const restaurant = await prisma.restaurant.findUnique({ where: { id: updatedOrder.restaurantId } });
                        if (restaurant && restaurant.ownerId) {
                            const existingPayout = await prisma.vendorPayout.findFirst({ where: { orderId: updatedOrder.id } });
                            if (!existingPayout) {
                                await prisma.vendorPayout.create({
                                    data: {
                                        vendorId: restaurant.ownerId,
                                        orderId: updatedOrder.id,
                                        amount: updatedOrder.total,
                                        status: 'PENDING'
                                    }
                                });
                            }
                        }
                    }

                    emitToRestaurant(order.restaurantId, 'ORDER_STATUS_UPDATE', updatedOrder);
                }
                // Redirect to app
                return res.redirect('zenran://payment-success');
            } else {
                return res.status(404).send('Order not found for this transaction');
            }
        } else {
            return res.redirect('zenran://payment-failed');
        }

    } catch (error) {
        console.error('Payment Callback Error:', error);
        res.status(500).send('Internal Server Error');
    }
};

export const handlePaymentWebhook = async (req: Request, res: Response) => {
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY || '';
        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

        if (hash === req.headers['x-paystack-signature']) {
            const event = req.body;
            if (event.event === 'charge.success') {
                const reference = event.data.reference;

                const order = await prisma.order.findFirst({
                    where: { paystackReference: reference }
                });

                if (order && order.paymentStatus !== 'PAID') {
                    const updatedOrder = await prisma.order.update({
                        where: { id: order.id },
                        data: {
                            paymentStatus: 'PAID',
                            status: 'CONFIRMED'
                        }
                    });

                    // Create Vendor Payout
                    const restaurant = await prisma.restaurant.findUnique({ where: { id: updatedOrder.restaurantId } });
                    if (restaurant && restaurant.ownerId) {
                        const existingPayout = await prisma.vendorPayout.findFirst({ where: { orderId: updatedOrder.id } });
                        if (!existingPayout) {
                            await prisma.vendorPayout.create({
                                data: {
                                    vendorId: restaurant.ownerId,
                                    orderId: updatedOrder.id,
                                    amount: updatedOrder.total,
                                    status: 'PENDING'
                                }
                            });
                        }
                    }

                    emitToRestaurant(order.restaurantId, 'ORDER_STATUS_UPDATE', updatedOrder);
                }
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook Error:', error);
        res.sendStatus(500);
    }
};
