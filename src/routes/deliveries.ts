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
    liveTrackingPage,
    rateDelivery,
} from '../controllers/delivery';

const router = express.Router();

// Public routes (no auth needed for tracking or price estimates)
router.get('/track/:trackingCode', trackDelivery as any);
router.get('/track/:trackingCode/live', liveTrackingPage as any);
router.get('/price-estimate', getPriceEstimate);

// All other routes require auth
router.use(authenticateToken);

router.post('/', createDelivery);
router.get('/my', getMyDeliveries);
router.get('/:id', getDelivery);
router.post('/:id/accept', acceptDelivery);
router.patch('/:id/status', updateDeliveryStatus);
router.post('/:id/rate', rateDelivery);

export default router;
