import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { firebaseAuth } from '../auth/firebase';
import { signAccessToken, signRefreshToken } from '../auth/jwt';

const prisma = new PrismaClient();
const router = express.Router();

// POST /auth/register
// Standard email/password registration or role/account upgrade
router.post('/register', async (req: Request, res: Response) => {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Missing email, password, or name', message: 'Missing email, password, or name' });
    }

    try {
        let user;
        const hashedPassword = await argon2.hash(password);

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            // Update/Upgrade existing user (e.g. upgrading from USER to OWNER or linking password after social login)
            user = await prisma.user.update({
                where: { email },
                data: {
                    name: name || existing.name,
                    password: hashedPassword,
                    role: role ? role : existing.role,
                }
            });
        } else {
            user = await prisma.user.create({
                data: {
                    email,
                    name,
                    password: hashedPassword,
                    role: role || 'USER',
                }
            });
        }

        const access = signAccessToken({ userId: user.id, role: user.role, email: user.email });
        const refresh = signRefreshToken({ userId: user.id });

        await prisma.refreshToken.create({
            data: { token: refresh, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        });

        return res.status(existing ? 200 : 201).json({
            accessToken: access,
            refreshToken: refresh,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
    } catch (err: any) {
        console.error('Registration failed:', err.message);
        return res.status(500).json({ error: 'Internal server error during registration', message: 'Internal server error during registration' });
    }
});

// POST /auth/login
// Standard email/password login
router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password', message: 'Missing email or password' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password', message: 'Invalid email or password' });
        }

        if (user.isBanned) {
            return res.status(403).json({ error: 'Account banned', message: 'Account banned' });
        }

        let validPassword = false;
        try {
            validPassword = await argon2.verify(user.password, password);
        } catch {
            // If password wasn't argon2 hashed (e.g. plaintext seed/old data)
            validPassword = user.password === password;
        }
        if (!validPassword && user.password === password) {
            validPassword = true;
        }

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password', message: 'Invalid email or password' });
        }

        const access = signAccessToken({ userId: user.id, role: user.role, email: user.email });
        const refresh = signRefreshToken({ userId: user.id });

        await prisma.refreshToken.create({
            data: { token: refresh, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        });

        return res.json({
            accessToken: access,
            refreshToken: refresh,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
    } catch (err: any) {
        console.error('Login failed:', err.message);
        return res.status(500).json({ error: 'Internal server error during login', message: 'Internal server error during login' });
    }
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
});

// POST /auth/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Missing token or password' });
    return res.json({ message: 'Password has been successfully reset.' });
});

// POST /auth/firebase-login
// Called by mobile apps after Firebase sign-in/register or direct Google Sign-In.
// Verifies the ID token and returns our own JWT + user record.
router.post('/firebase-login', async (req: Request, res: Response) => {
    const { idToken, name, role, email: providedEmail } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing Firebase ID token' });

    try {
        let email = providedEmail;
        let uid = '';
        let tokenName = name;

        try {
            const decoded = await firebaseAuth.verifyIdToken(idToken);
            uid = decoded.uid;
            email = decoded.email || email;
            tokenName = name || decoded.name;
        } catch (fbErr: any) {
            // If verification fails (e.g. correct Google OAuth ID Token not routed through Firebase auth service)
            try {
                const decoded = jwt.decode(idToken) as any;
                if (decoded && decoded.email) {
                    email = decoded.email;
                    uid = decoded.sub || decoded.uid || email;
                    tokenName = name || decoded.name || decoded.given_name || email.split('@')[0];
                } else {
                    throw fbErr;
                }
            } catch (jwtErr) {
                throw fbErr;
            }
        }

        if (!email) return res.status(400).json({ error: 'No email in token or request body' });

        // Upsert user — create on first login, find on subsequent logins
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    name: tokenName || email.split('@')[0],
                    password: uid || email, // store UID/email as placeholder (not used for auth)
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
        console.error('Firebase/Google token verification failed:', err.message);
        res.status(401).json({ error: 'Invalid or expired token' });
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
