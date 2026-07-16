import { z } from 'zod';

export const createDeliverySchema = z.object({
    packageDesc: z.string().optional().default('Express Package'),
    pickupAddress: z.string().min(1, 'Pickup address is required'),
    pickupLat: z.coerce.number().default(5.6037),
    pickupLng: z.coerce.number().default(-0.1870),
    pickupPhone: z.string().min(1, 'Valid pickup phone is required'),
    dropoffAddress: z.string().min(1, 'Dropoff address is required'),
    dropoffLat: z.coerce.number().default(5.6350),
    dropoffLng: z.coerce.number().default(-0.1700),
    receiverName: z.string().optional().default('Receiver'),
    receiverPhone: z.string().min(1, 'Valid receiver phone is required'),
    paymentMethod: z.enum(['CASH', 'MOMO']).optional().default('CASH'),
    scheduledAt: z.string().optional(),
    isBulk: z.boolean().optional().default(false),
    stops: z.array(z.object({
        dropoffAddress: z.string().min(1, 'Stop address is required'),
        dropoffLat: z.coerce.number().default(5.6350),
        dropoffLng: z.coerce.number().default(-0.1700),
        receiverName: z.string().optional().default('Receiver'),
        receiverPhone: z.string().min(1, 'Valid receiver phone is required'),
        packageDesc: z.string().optional(),
        status: z.string().optional()
    })).optional(),
});

export const updateDeliveryStatusSchema = z.object({
    status: z.enum([
        'REQUESTED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP',
        'IN_TRANSIT', 'ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED', 'CANCELLED'
    ]),
    cancelReason: z.string().optional(),
});

export const rateDeliverySchema = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional(),
});

export const courierProfileSchema = z.object({
    vehicleType: z.enum(['MOTORBIKE', 'MOTORCYCLE', 'CAR', 'BICYCLE']).optional(),
    licensePlate: z.string().optional(),
    phone: z.string().optional(),
});

export const updateLocationSchema = z.object({
    lat: z.number(),
    lng: z.number(),
});
