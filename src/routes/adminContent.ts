
import { Router } from 'express';
import {
    getPendingRestaurants,
    verifyRestaurant,
    rejectRestaurant,
    toggleRestaurantVisibility
} from '../controllers/adminContent';
import { authenticateToken } from '../middleware/auth';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Middleware to check Admin Role (Reused)
const verifyAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

router.use(authenticateToken, verifyAdmin);

router.get('/restaurants/pending', getPendingRestaurants);
router.post('/restaurants/:id/verify', verifyRestaurant);
router.post('/restaurants/:id/reject', rejectRestaurant);
router.patch('/restaurants/:id/visibility', toggleRestaurantVisibility);

export default router;
