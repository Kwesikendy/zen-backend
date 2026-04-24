import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { courierProfileSchema, updateLocationSchema } from '../schemas/delivery';
import { emitToDelivery } from '../services/socket';

const prisma = new PrismaClient();

// POST /couriers/register  (create courier profile)
export const registerCourier = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const data = courierProfileSchema.parse(req.body);
        const normalizedVehicleType = data.vehicleType === 'MOTORCYCLE' ? 'MOTORBIKE' : data.vehicleType;

        // Check if profile already exists
        const existing = await prisma.courierProfile.findUnique({ where: { userId } });
        if (existing) return res.status(400).json({ error: 'Courier profile already exists' });

        // Update user role to COURIER
        await prisma.user.update({ where: { id: userId }, data: { role: 'COURIER' } });

        const profile = await prisma.courierProfile.create({
            data: {
                userId,
                vehicleType: normalizedVehicleType || 'MOTORBIKE',
                licensePlate: data.licensePlate,
            },
        });

        res.status(201).json(profile);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// GET /couriers/profile
export const getCourierProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const profile = await prisma.courierProfile.findUnique({
            where: { userId },
            include: { user: { select: { name: true, email: true } } },
        });

        if (!profile) return res.status(404).json({ error: 'Courier profile not found' });
        res.json(profile);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// PATCH /couriers/online
export const toggleOnline = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        console.log('[toggleOnline] userId:', userId);

        const current = await prisma.courierProfile.findUnique({ where: { userId } });
        console.log('[toggleOnline] current profile:', current);
        if (!current) return res.status(404).json({ error: 'Courier profile not found' });

        const profile = await prisma.courierProfile.update({
            where: { userId },
            data: { isOnline: !current.isOnline },
        });

        console.log('[toggleOnline] updated isOnline:', profile.isOnline);
        res.json(profile);
    } catch (error: any) {
        console.error('[toggleOnline] ERROR:', error.message);
        res.status(400).json({ error: error.message });
    }
};

// PATCH /couriers/location
export const updateLocation = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const { lat, lng } = updateLocationSchema.parse(req.body);

        const profile = await prisma.courierProfile.update({
            where: { userId },
            data: { currentLat: lat, currentLng: lng },
        });

        // If courier has active deliveries, broadcast location
        const activeDeliveries = await prisma.delivery.findMany({
            where: {
                courierId: userId,
                status: { in: ['ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_DROPOFF'] },
            },
        });

        for (const delivery of activeDeliveries) {
            // Save tracking point
            await prisma.deliveryTracking.create({
                data: { deliveryId: delivery.id, lat, lng },
            });

            // Broadcast to delivery room
            emitToDelivery(delivery.id, 'COURIER_LOCATION', { lat, lng, timestamp: new Date() });
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// GET /couriers/available-deliveries
export const getAvailableDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        const profile = await prisma.courierProfile.findUnique({ where: { userId } });
        if (!profile) return res.status(404).json({ error: 'Courier profile not found' });

        const deliveries = await prisma.delivery.findMany({
            where: { status: 'REQUESTED' },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        res.json(deliveries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /couriers/my-deliveries
export const getMyDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const deliveries = await prisma.delivery.findMany({
            where: { courierId: userId },
            include: { sender: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(deliveries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /couriers/earnings
export const getCourierEarnings = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        const profile = await prisma.courierProfile.findUnique({ where: { userId } });
        if (!profile) return res.status(404).json({ error: 'Courier profile not found' });

        // Calculate earnings from completed deliveries
        const completed = await prisma.delivery.findMany({
            where: { courierId: userId, status: 'COMPLETED' },
            select: { price: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });

        const COURIER_CUT = 0.80; // 80% to courier, 20% platform commission

        const totalEarnings = completed.reduce((sum: number, d: { price: any; createdAt: Date }) => sum + Number(d.price) * COURIER_CUT, 0);

        // This week's earnings
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const thisWeek = completed
            .filter((d: { price: any; createdAt: Date }) => new Date(d.createdAt) >= weekStart)
            .reduce((sum: number, d: { price: any; createdAt: Date }) => sum + Number(d.price) * COURIER_CUT, 0);

        res.json({
            totalEarnings: Math.round(totalEarnings * 100) / 100,
            thisWeekEarnings: Math.round(thisWeek * 100) / 100,
            totalDeliveries: profile.totalDeliveries,
            rating: profile.rating,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
