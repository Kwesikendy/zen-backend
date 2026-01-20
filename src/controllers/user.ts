import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const prisma = new PrismaClient();

const updatePushTokenSchema = z.object({
    pushToken: z.string().min(1),
});

export const updatePushToken = async (req: AuthRequest, res: Response) => {
    try {
        const { pushToken } = updatePushTokenSchema.parse(req.body);
        const userId = req.user!.userId;

        await prisma.user.update({
            where: { id: userId },
            data: { pushToken },
        });

        res.json({ message: 'Push token updated' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
