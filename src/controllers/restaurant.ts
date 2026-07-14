import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createRestaurantSchema, updateRestaurantSchema } from '../schemas/restaurant';
import { createPaystackSubaccount } from '../services/payment';

const prisma = new PrismaClient();

export const createRestaurant = async (req: AuthRequest, res: Response) => {
    try {
        const validatedData = createRestaurantSchema.parse(req.body);
        const userId = req.user!.userId;

        const restaurant = await prisma.restaurant.create({
            data: {
                name: validatedData.name,
                address: validatedData.address || '',
                phone: validatedData.phone,
                ownerId: userId,
                isVisible: true,
            },
        });

        res.status(201).json(restaurant);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getMyRestaurants = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const restaurants = await prisma.restaurant.findMany({
            where: { ownerId: userId },
        });
        res.json(restaurants);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// Public endpoint - get all restaurants
export const getAllRestaurants = async (req: AuthRequest, res: Response) => {
    try {
        const restaurants = await prisma.restaurant.findMany({
            where: { isVerified: true, isVisible: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(restaurants);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateRestaurant = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const validatedData = updateRestaurantSchema.parse(req.body);

        // Check ownership
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Restaurant not found' });
        if (existing.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.restaurant.update({
            where: { id },
            data: validatedData,
        });

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const deleteRestaurant = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        // Check ownership
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Restaurant not found' });
        if (existing.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        await prisma.restaurant.delete({ where: { id } });
        res.status(204).send();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getRestaurant = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const restaurant = await prisma.restaurant.findUnique({
            where: { id },
            include: {
                menus: {
                    include: {
                        items: {
                            include: { options: true }
                        }
                    }
                }
            }
        });

        if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
        res.json(restaurant);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// Option B: Setup Paystack Subaccount for Instant Split Payments at Checkout
export const setupPaystackSubaccount = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const { settlementBank, accountNumber, percentageCharge } = req.body; // e.g. settlementBank: "MTN", accountNumber: "0241234567", percentageCharge: 15

        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Restaurant not found' });
        if (existing.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        // Call Paystack API to create subaccount
        const subaccount = await createPaystackSubaccount(
            existing.name,
            settlementBank || 'MTN',
            accountNumber,
            percentageCharge || 15
        );

        const updated = await prisma.restaurant.update({
            where: { id },
            data: {
                paystackSubaccountCode: subaccount.subaccount_code,
                paystackCommissionPct: percentageCharge || 15,
                momoNetwork: settlementBank || 'MTN',
                momoNumber: accountNumber
            }
        });

        res.json({ success: true, subaccountCode: subaccount.subaccount_code, restaurant: updated });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
