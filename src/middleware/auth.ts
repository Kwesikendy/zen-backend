import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/jwt';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string;
    };
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    try {
        const user = verifyAccessToken(token) as { userId: string; role: string };
        (req as AuthRequest).user = user;
        next();
    } catch (err) {
        return res.sendStatus(403);
    }
}
