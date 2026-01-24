
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get Pending Restaurants for Verification
export const getPendingRestaurants = async (req: Request, res: Response) => {
    try {
        const restaurants = await prisma.restaurant.findMany({
            where: { isVerified: false, rejectionReason: null }, // Only brand new unauthorized ones
            include: {
                owner: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(restaurants);
    } catch (error) {
        console.error('Get Pending Restaurants Error:', error);
        res.status(500).json({ error: 'Failed to fetch pending restaurants' });
    }
};

// Verify Restaurant
export const verifyRestaurant = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const restaurant = await prisma.restaurant.update({
            where: { id },
            data: {
                isVerified: true,
                verifiedAt: new Date(),
                rejectionReason: null
            }
        });
        res.json({ message: 'Restaurant verified successfully', restaurant });
    } catch (error) {
        res.status(500).json({ error: 'Failed to verify restaurant' });
    }
};

// Reject Restaurant
export const rejectRestaurant = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

    try {
        const restaurant = await prisma.restaurant.update({
            where: { id },
            data: {
                isVerified: false,
                rejectionReason: reason
            }
        });
        res.json({ message: 'Restaurant rejected', restaurant });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject restaurant' });
    }
};

// Toggle Visibility (Content Moderation)
export const toggleRestaurantVisibility = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { isVisible } = req.body;

    try {
        const restaurant = await prisma.restaurant.update({
            where: { id },
            data: { isVisible }
        });
        res.json({ message: `Restaurant visibility set to ${isVisible}`, restaurant });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update visibility' });
    }
};
