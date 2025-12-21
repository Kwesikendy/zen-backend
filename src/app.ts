import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import restaurantRoutes from './routes/restaurants';
import menuRoutes from './routes/menus';
import orderRoutes from './routes/orders';
import reportRoutes from './routes/reports';
import reviewRoutes from './routes/reviews';

export const createApp = () => {
    const app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
    app.use('/auth', authRoutes);
    app.use('/restaurants', restaurantRoutes);
    app.use('/menus', menuRoutes);
    app.use('/orders', orderRoutes);
    app.use('/reports', reportRoutes);
    app.use('/reviews', reviewRoutes);
    app.get('/health', (req: Request, res: Response) => res.json({ status: 'ok' }));
    return app;
};
