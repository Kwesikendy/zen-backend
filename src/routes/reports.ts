import { Router } from 'express';
import { getSalesReport } from '../controllers/reports';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/sales', authenticateToken, getSalesReport);

export default router;
