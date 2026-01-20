import { Router } from 'express';
import { updatePushToken } from '../controllers/user';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.put('/push-token', authenticateToken, updatePushToken);

export default router;
