import { z } from 'zod';

export const createRestaurantSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    address: z.string().optional(),
    phone: z.string().optional(),
});

export const updateRestaurantSchema = z.object({
    name: z.string().min(1).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
});
