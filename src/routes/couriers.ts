import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    registerCourier,
    getCourierProfile,
    toggleOnline,
    updateLocation,
    getAvailableDeliveries,
    getMyDeliveries,
    getCourierEarnings,
} from '../controllers/courier';

const router = express.Router();

router.use(authenticateToken);

router.post('/register', registerCourier);
router.get('/profile', getCourierProfile);
router.patch('/online', toggleOnline);
router.patch('/location', updateLocation);
router.get('/available-deliveries', getAvailableDeliveries);
router.get('/my-deliveries', getMyDeliveries);
router.get('/earnings', getCourierEarnings);

export default router;
