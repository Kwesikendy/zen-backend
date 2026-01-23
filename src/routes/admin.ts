
import { Router } from 'express';
import { getSystemStats, getUsers, toggleBan } from '../controllers/admin';
import { authenticateToken } from '../middleware/auth';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Middleware to check Admin Role
const verifyAdmin = (req: Request, res: Response, next: NextFunction) => {
    // authenticateToken adds `user` to request
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

router.get('/stats', authenticateToken, verifyAdmin, getSystemStats);
router.get('/users', authenticateToken, verifyAdmin, getUsers);
router.post('/users/:userId/ban', authenticateToken, verifyAdmin, toggleBan);

export default router;
