import { z } from 'zod';

export const createOrderSchema = z.object({
    restaurantId: z.string().uuid(),
    customerName: z.string().optional(),
    tableNumber: z.string().optional(),
    items: z.array(z.object({
        menuItemId: z.string().uuid(),
        qty: z.number().int().min(1, 'Quantity must be at least 1'),
        options: z.array(z.string().uuid()).optional() // Array of Option IDs
    })).min(1, 'Order must have at least one item'),
    paymentMethod: z.enum(['CASH', 'MOMO']).optional(),
    phoneNumber: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']),
});
