import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { createOrder, getOrder, getMyOrders, getRestaurantOrders, updateOrderStatus } from '../controllers/order';

const router = express.Router();

router.use(authenticateToken);

router.post('/', createOrder);
router.get('/me', getMyOrders);
router.get('/restaurant/:restaurantId', getRestaurantOrders);
router.get('/:id', getOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
