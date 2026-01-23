import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/jwt';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string;
        email: string;
    };
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    try {
        const payload = verifyAccessToken(token) as { userId: string; role: string; email: string };

        // Strict Ban Check
        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user || user.isBanned) {
            return res.status(403).json({ error: 'Account Banned' });
        }

        (req as AuthRequest).user = payload;
        next();
    } catch (err) {
        return res.sendStatus(403);
    }
}
