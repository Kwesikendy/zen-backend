import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { createRestaurant, getMyRestaurants, getAllRestaurants, updateRestaurant, deleteRestaurant, getRestaurant } from '../controllers/restaurant';

const router = express.Router();

// Public route - must come before authenticateToken middleware
router.get('/all', getAllRestaurants);
router.get('/:id', getRestaurant);

router.use(authenticateToken);

router.post('/', createRestaurant);
router.get('/', getMyRestaurants);
router.put('/:id', updateRestaurant);
router.delete('/:id', deleteRestaurant);

export default router;
