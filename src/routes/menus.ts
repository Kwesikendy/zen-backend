import { Router } from 'express';
import { createMenu, getRestaurantMenus, addMenuItem, updateMenuItem } from '../controllers/menu';
import { authenticateToken } from '../middleware/auth';
import upload from '../middleware/upload';

const router = Router();

router.post('/', authenticateToken, createMenu);
router.get('/:restaurantId', authenticateToken, getRestaurantMenus);
router.post('/items', authenticateToken, upload.single('image'), addMenuItem);
router.put('/items/:id', authenticateToken, updateMenuItem);

export default router;
