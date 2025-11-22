import { z } from 'zod';

export const createOrderSchema = z.object({
    restaurantId: z.string().uuid(),
    customerName: z.string().optional(),
    tableNumber: z.string().optional(),
    items: z.array(z.object({
        menuItemId: z.string().uuid(),
        qty: z.number().int().positive(),
    })).min(1, 'Order must have at least one item'),
});

export const updateOrderStatusSchema = z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
});
