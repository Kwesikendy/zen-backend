import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    createDelivery,
    getPriceEstimate,
    getMyDeliveries,
    getDelivery,
    acceptDelivery,
    updateDeliveryStatus,
    trackDelivery,
    rateDelivery,
} from '../controllers/delivery';

const router = express.Router();

// Public route - track by code (no auth needed)
router.get('/track/:trackingCode', trackDelivery as any);

// All other routes require auth
router.use(authenticateToken);

router.get('/price-estimate', getPriceEstimate);
router.post('/', createDelivery);
router.get('/my', getMyDeliveries);
router.get('/:id', getDelivery);
router.post('/:id/accept', acceptDelivery);
router.patch('/:id/status', updateDeliveryStatus);
router.post('/:id/rate', rateDelivery);

export default router;
