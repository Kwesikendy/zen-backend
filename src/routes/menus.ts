import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { createMenu, getRestaurantMenus, addMenuItem, updateMenuItem } from '../controllers/menu';

const router = express.Router();

router.use(authenticateToken);

router.post('/', createMenu);
router.get('/:restaurantId', getRestaurantMenus);
router.post('/items', addMenuItem);
router.put('/items/:id', updateMenuItem);

export default router;
