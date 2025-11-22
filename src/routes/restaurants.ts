import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { createRestaurant, getMyRestaurants, updateRestaurant, deleteRestaurant } from '../controllers/restaurant';

const router = express.Router();

router.use(authenticateToken);

router.post('/', createRestaurant);
router.get('/', getMyRestaurants);
router.put('/:id', updateRestaurant);
router.delete('/:id', deleteRestaurant);

export default router;
