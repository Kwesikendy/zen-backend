import { Router } from 'express';
import {
    getFinancialOverview,
    getTransactions,
    getVendors,
    suspendVendor,
    activateVendor
} from '../controllers/adminFinance';
import { authenticateToken } from '../middleware/auth';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Middleware to check Admin Role
const verifyAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

// Financial routes
router.get('/finance/overview', authenticateToken, verifyAdmin, getFinancialOverview);
router.get('/transactions', authenticateToken, verifyAdmin, getTransactions);

// Vendor management routes
router.get('/vendors', authenticateToken, verifyAdmin, getVendors);
router.post('/vendors/:id/suspend', authenticateToken, verifyAdmin, suspendVendor);
router.post('/vendors/:id/activate', authenticateToken, verifyAdmin, activateVendor);

export default router;
