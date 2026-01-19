import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { signAccessToken, signRefreshToken } from '../auth/jwt';

const prisma = new PrismaClient();
const router = express.Router();

router.post('/register', async (req: Request, res: Response) => {
    const { email, password, name, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email in use' });

    const hashed = await argon2.hash(password);
    const user = await prisma.user.create({
        data: {
            email,
            password: hashed,
            name,
            role: role || 'USER' // Default to USER if not provided
        }
    });
    const access = signAccessToken({ userId: user.id, role: user.role, email: user.email });
    const refresh = signRefreshToken({ userId: user.id });

    await prisma.refreshToken.create({
        data: { token: refresh, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    });

    res.status(201).json({ accessToken: access, refreshToken: refresh, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await argon2.verify(user.password, password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const access = signAccessToken({ userId: user.id, role: user.role, email: user.email });
    const refresh = signRefreshToken({ userId: user.id });

    await prisma.refreshToken.create({
        data: { token: refresh, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    });

    res.json({ accessToken: access, refreshToken: refresh, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

export default router;
