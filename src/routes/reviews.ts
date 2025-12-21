import { Router } from 'express';
import { addReview, getReviews } from '../controllers/reviews';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Publicly readable, but optional auth for posting? 
// Current design: Post needs explicit userName in body, userId optional from token.
// So we apply auth middleware but it doesn't fail if no token? 
// Actually authenticateToken usually fails if no token.
// Let's assume for now reviews require login OR we make a "soft" auth or just a separate endpoint.
// For Zenran, let's create a public endpoint for now, or use authenticateToken if user must be logged in.
// System says "Customer", implying they might be logged in. Guest orders exist.
// Let's use authenticateToken but creating the review is allowed if you have a userName.
// Since authenticateToken throws 401, we might need a "tryAuthenticate" or just specific routes.

// Let's stick to: Requires Auth for now for simplicity, OR allow guests.
// Given previous design allows Guest Orders, Guests should be able to review too?
// But prevent spam? 
// For Phase 1, let's allow ANYONE to post (Public).

router.post('/:menuItemId', addReview); // Front end sends userName
router.get('/:menuItemId', getReviews);

export default router;
