import { Router } from 'express';
import { getSalesReport, getDashboardStats } from '../controllers/reports';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/sales', authenticateToken, getSalesReport);
router.get('/dashboard', authenticateToken, getDashboardStats);

export default router;
