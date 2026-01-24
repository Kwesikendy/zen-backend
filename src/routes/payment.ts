import express from 'express';
import { handlePaymentCallback, handlePaymentWebhook } from '../controllers/payment';

const router = express.Router();

router.get('/callback', handlePaymentCallback);
router.post('/webhook', handlePaymentWebhook);

export default router;
