import { z } from 'zod';

export const createMenuSchema = z.object({
    restaurantId: z.string().uuid(),
    title: z.string().min(1, 'Title is required'),
    qty: z.number().int().min(0).optional(),
});

export const addMenuItemSchema = z.object({
    menuId: z.string().uuid(),
    name: z.string().min(1, 'Name is required'),
    price: z.number().min(0, 'Price must be positive'),
    qty: z.number().int().min(0).optional(),
    imageUrl: z.string().optional(),
    options: z.array(z.object({
        name: z.string().min(1),
        price: z.number().min(0)
    })).optional()
});

export const updateMenuItemSchema = z.object({
    name: z.string().min(1).optional(),
    price: z.number().min(0).optional(),
    qty: z.number().int().min(0).optional(),
});
