import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const prisma = new PrismaClient();

const createReviewSchema = z.object({
    rating: z.number().min(1).max(5),
    comment: z.string().optional(),
    userName: z.string().min(1)
});

export const addReview = async (req: AuthRequest, res: Response) => {
    try {
        const { menuItemId } = req.params;
        const { rating, comment, userName } = createReviewSchema.parse(req.body);
        const userId = req.user?.userId;

        const menuItem = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
        if (!menuItem) return res.status(404).json({ error: 'Menu item not found' });

        const review = await prisma.review.create({
            data: {
                menuItemId,
                userId,
                userName,
                rating,
                comment
            }
        });

        res.status(201).json(review);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getReviews = async (req: AuthRequest, res: Response) => {
    try {
        const { menuItemId } = req.params;

        const reviews = await prisma.review.findMany({
            where: { menuItemId },
            orderBy: { createdAt: 'desc' }
        });

        res.json(reviews);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
