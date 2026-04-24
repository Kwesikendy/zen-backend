import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createDeliverySchema, updateDeliveryStatusSchema, rateDeliverySchema } from '../schemas/delivery';
import { emitToUser, emitToDelivery } from '../services/socket';
import { sendSMS } from '../services/notification';

const prisma = new PrismaClient();

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Zone-based pricing (GHS)
function calculatePrice(distanceKm: number): number {
    if (distanceKm <= 3) return 8;
    if (distanceKm <= 5) return 12;
    if (distanceKm <= 10) return 18;
    if (distanceKm <= 15) return 25;
    if (distanceKm <= 25) return 35;
    return 35 + Math.ceil((distanceKm - 25) / 5) * 8;
}

function generateTrackingCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ZD-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// GET /deliveries/price-estimate
export const getPriceEstimate = async (req: AuthRequest, res: Response) => {
    try {
        const pickupLat = parseFloat(req.query.pickupLat as string);
        const pickupLng = parseFloat(req.query.pickupLng as string);
        const dropoffLat = parseFloat(req.query.dropoffLat as string);
        const dropoffLng = parseFloat(req.query.dropoffLng as string);

        if ([pickupLat, pickupLng, dropoffLat, dropoffLng].some(isNaN)) {
            return res.status(400).json({ error: 'All coordinates are required' });
        }

        const distanceKm = haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
        const price = calculatePrice(distanceKm);

        res.json({ distanceKm: Math.round(distanceKm * 10) / 10, price });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /deliveries
export const createDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const data = createDeliverySchema.parse(req.body);
        const senderId = req.user!.userId;

        const distanceKm = haversineKm(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng);
        const price = calculatePrice(distanceKm);

        // Generate unique tracking code
        let trackingCode = generateTrackingCode();
        let exists = await prisma.delivery.findUnique({ where: { trackingCode } });
        while (exists) {
            trackingCode = generateTrackingCode();
            exists = await prisma.delivery.findUnique({ where: { trackingCode } });
        }

        const delivery = await prisma.delivery.create({
            data: {
                senderId,
                packageDesc: data.packageDesc,
                pickupAddress: data.pickupAddress,
                pickupLat: data.pickupLat,
                pickupLng: data.pickupLng,
                pickupPhone: data.pickupPhone,
                dropoffAddress: data.dropoffAddress,
                dropoffLat: data.dropoffLat,
                dropoffLng: data.dropoffLng,
                receiverName: data.receiverName,
                receiverPhone: data.receiverPhone,
                distanceKm: Math.round(distanceKm * 10) / 10,
                price,
                paymentMethod: data.paymentMethod || 'CASH',
                trackingCode,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
            },
        });

        // Notify nearby online couriers
        const nearbyCouriers = await prisma.courierProfile.findMany({
            where: { isOnline: true, isApproved: true },
        });

        for (const courier of nearbyCouriers) {
            if (courier.currentLat && courier.currentLng) {
                const dist = haversineKm(courier.currentLat, courier.currentLng, data.pickupLat, data.pickupLng);
                if (dist <= 10) {
                    emitToUser(courier.userId, 'NEW_DELIVERY_REQUEST', {
                        id: delivery.id,
                        packageDesc: delivery.packageDesc,
                        pickupAddress: delivery.pickupAddress,
                        dropoffAddress: delivery.dropoffAddress,
                        distanceKm: delivery.distanceKm,
                        price: delivery.price,
                    });
                }
            }
        }

        // SMS to sender
        await sendSMS(data.pickupPhone, `Your Zenran delivery ${trackingCode} has been requested. We're finding a courier for you.`);

        res.status(201).json(delivery);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// POST /deliveries/:id/accept  (courier accepts)
export const acceptDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const courierId = req.user!.userId;

        const delivery = await prisma.delivery.findUnique({ where: { id } });
        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
        if (delivery.status !== 'REQUESTED') return res.status(400).json({ error: 'Delivery already taken' });

        // Verify user has a courier profile
        const profile = await prisma.courierProfile.findUnique({ where: { userId: courierId } });
        if (!profile) return res.status(403).json({ error: 'No courier profile found' });

        const updated = await prisma.delivery.update({
            where: { id },
            data: { courierId, status: 'ACCEPTED' },
            include: { courier: { select: { name: true } } },
        });

        // Notify sender
        emitToUser(delivery.senderId, 'DELIVERY_STATUS_UPDATE', updated);
        emitToDelivery(id, 'DELIVERY_STATUS_UPDATE', updated);

        const courierName = updated.courier?.name || 'A courier';
        await sendSMS(delivery.pickupPhone, `${courierName} is on the way to pick up your package (${delivery.trackingCode}).`);

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /deliveries/:id/status  (courier updates status)
export const updateDeliveryStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const { status, cancelReason } = updateDeliveryStatusSchema.parse(req.body);

        const delivery = await prisma.delivery.findUnique({ where: { id } });
        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

        // Only assigned courier or sender (for cancel) can update
        const isCourier = delivery.courierId === userId;
        const isSender = delivery.senderId === userId;
        if (!isCourier && !isSender) return res.status(403).json({ error: 'Unauthorized' });

        // Sender can only cancel
        if (isSender && status !== 'CANCELLED') return res.status(403).json({ error: 'You can only cancel' });

        const updateData: any = { status };

        if (status === 'PICKED_UP') updateData.pickedUpAt = new Date();
        if (status === 'DELIVERED') updateData.deliveredAt = new Date();
        if (status === 'CANCELLED') updateData.cancelReason = cancelReason;

        const updated = await prisma.delivery.update({
            where: { id },
            data: updateData,
            include: { courier: { select: { name: true } } },
        });

        // Update courier stats on completion
        if (status === 'COMPLETED' && delivery.courierId) {
            await prisma.courierProfile.update({
                where: { userId: delivery.courierId },
                data: { totalDeliveries: { increment: 1 } },
            });
        }

        // Notify both parties
        emitToUser(delivery.senderId, 'DELIVERY_STATUS_UPDATE', updated);
        if (delivery.courierId) emitToUser(delivery.courierId, 'DELIVERY_STATUS_UPDATE', updated);
        emitToDelivery(id, 'DELIVERY_STATUS_UPDATE', updated);

        // SMS to receiver when courier is close
        if (status === 'ARRIVED_DROPOFF') {
            await sendSMS(delivery.receiverPhone, `Your package from ${delivery.pickupAddress} has arrived! Tracking: ${delivery.trackingCode}`);
        }

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// GET /deliveries/my  (sender's deliveries)
export const getMyDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const deliveries = await prisma.delivery.findMany({
            where: { senderId: userId },
            include: { courier: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(deliveries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /deliveries/:id
export const getDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const delivery = await prisma.delivery.findUnique({
            where: { id },
            include: {
                courier: { select: { name: true } },
                trackingPoints: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
        });

        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
        if (delivery.senderId !== userId && delivery.courierId !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        res.json(delivery);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /deliveries/track/:trackingCode  (public tracking by code)
export const trackDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { trackingCode } = req.params;
        const delivery = await prisma.delivery.findUnique({
            where: { trackingCode },
            select: {
                id: true,
                status: true,
                trackingCode: true,
                pickupAddress: true,
                dropoffAddress: true,
                receiverName: true,
                createdAt: true,
                pickedUpAt: true,
                deliveredAt: true,
                courier: { select: { name: true } },
                trackingPoints: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
        });

        if (!delivery) return res.status(404).json({ error: 'Tracking code not found' });
        res.json(delivery);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /deliveries/:id/rate
export const rateDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const { rating, comment } = rateDeliverySchema.parse(req.body);

        const delivery = await prisma.delivery.findUnique({ where: { id } });
        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
        if (delivery.senderId !== userId) return res.status(403).json({ error: 'Only sender can rate' });
        if (delivery.status !== 'DELIVERED' && delivery.status !== 'COMPLETED') {
            return res.status(400).json({ error: 'Can only rate completed deliveries' });
        }

        const updated = await prisma.delivery.update({
            where: { id },
            data: { rating, ratingComment: comment, status: 'COMPLETED' },
        });

        // Update courier average rating
        if (delivery.courierId) {
            const avgResult = await prisma.delivery.aggregate({
                where: { courierId: delivery.courierId, rating: { not: null } },
                _avg: { rating: true },
            });
            if (avgResult._avg.rating) {
                await prisma.courierProfile.update({
                    where: { userId: delivery.courierId },
                    data: { rating: Math.round(avgResult._avg.rating * 10) / 10 },
                });
            }
        }

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
