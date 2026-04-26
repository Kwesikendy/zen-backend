import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { firebaseAuth } from '../auth/firebase';
import { signAccessToken, signRefreshToken } from '../auth/jwt';

const prisma = new PrismaClient();
const router = express.Router();

// POST /auth/firebase-login
// Called by mobile apps after Firebase sign-in/register.
// Verifies the Firebase ID token and returns our own JWT + user record.
router.post('/firebase-login', async (req: Request, res: Response) => {
    const { idToken, name, role } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing Firebase ID token' });

    try {
        const decoded = await firebaseAuth.verifyIdToken(idToken);
        const { uid, email } = decoded;

        if (!email) return res.status(400).json({ error: 'No email in Firebase token' });

        // Upsert user — create on first login, find on subsequent logins
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    name: name || decoded.name || email.split('@')[0],
                    password: uid, // store firebase UID as placeholder (not used for auth)
                    role: role || 'USER',
                }
            });
        }

        if (user.isBanned) return res.status(403).json({ error: 'Account banned' });

        const access = signAccessToken({ userId: user.id, role: user.role, email: user.email });
        const refresh = signRefreshToken({ userId: user.id });

        await prisma.refreshToken.create({
            data: { token: refresh, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        });

        res.json({
            accessToken: access,
            refreshToken: refresh,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
    } catch (err: any) {
        console.error('Firebase token verification failed:', err.message);
        res.status(401).json({ error: 'Invalid or expired Firebase token' });
    }
});

// POST /auth/refresh — keep existing refresh token flow
router.post('/refresh', async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) return res.status(401).json({ error: 'Invalid refresh token' });

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const access = signAccessToken({ userId: user.id, role: user.role, email: user.email });
    res.json({ accessToken: access });
});

export default router;
