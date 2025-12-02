import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createMenuSchema, addMenuItemSchema, updateMenuItemSchema } from '../schemas/menu';

const prisma = new PrismaClient();

export const createMenu = async (req: AuthRequest, res: Response) => {
    try {
        const validatedData = createMenuSchema.parse(req.body);
        const userId = req.user!.userId;

        // Verify restaurant ownership
        const restaurant = await prisma.restaurant.findUnique({ where: { id: validatedData.restaurantId } });
        if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
        if (restaurant.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        const menu = await prisma.menu.create({
            data: {
                title: validatedData.title,
                restaurantId: validatedData.restaurantId,
            },
        });

        res.status(201).json(menu);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getRestaurantMenus = async (req: AuthRequest, res: Response) => {
    try {
        const { restaurantId } = req.params;
        const menus = await prisma.menu.findMany({
            where: { restaurantId },
            include: {
                items: {
                    include: { options: true }
                }
            },
        });
        res.json(menus);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const addMenuItem = async (req: AuthRequest, res: Response) => {
    try {
        // Parse body (it might be form-data now, but Zod handles objects)
        // If using form-data, req.body fields are strings, so we might need to parse numbers
        const body = { ...req.body };
        if (req.file) {
            // If file exists, we upload it
            // Note: In a real app, we'd upload to Cloudinary here
            // const imageUrl = await uploadImage(req.file.path);
            // body.imageUrl = imageUrl;

            // For now, we'll just use the local path or a dummy URL if Cloudinary isn't set up
            body.imageUrl = req.file.path;
        }

        // Manual parsing for multipart/form-data numbers
        if (typeof body.price === 'string') body.price = parseFloat(body.price);
        if (typeof body.qty === 'string') body.qty = parseInt(body.qty);
        if (typeof body.options === 'string') body.options = JSON.parse(body.options);

        const { menuId, name, price, qty, options, imageUrl } = addMenuItemSchema.parse(body);
        const userId = req.user!.userId;

        // Verify ownership via menu -> restaurant
        const menu = await prisma.menu.findUnique({
            where: { id: menuId },
            include: { restaurant: true },
        });
        if (!menu) return res.status(404).json({ error: 'Menu not found' });
        if (menu.restaurant.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        // Upload image if present (and validated)
        let finalImageUrl = imageUrl;
        if (req.file) {
            // In production: finalImageUrl = await uploadImage(req.file.path);
            // For this demo without valid keys:
            finalImageUrl = `uploads/${req.file.filename}`;
        }

        const item = await prisma.menuItem.create({
            data: {
                menuId,
                name,
                price,
                qty: qty || 0,
                imageUrl: finalImageUrl,
                options: {
                    create: options // Create options if provided
                }
            },
            include: { options: true }
        });

        res.status(201).json(item);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const updateMenuItem = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const validatedData = updateMenuItemSchema.parse(req.body);

        // Verify ownership
        const item = await prisma.menuItem.findUnique({
            where: { id },
            include: { menu: { include: { restaurant: true } } },
        });
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.menu.restaurant.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.menuItem.update({
            where: { id },
            data: validatedData,
        });

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
