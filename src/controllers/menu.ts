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
        const { menuId, name, price, qty, options } = addMenuItemSchema.parse(req.body);
        const userId = req.user!.userId;

        // Verify ownership via menu -> restaurant
        const menu = await prisma.menu.findUnique({
            where: { id: menuId },
            include: { restaurant: true },
        });
        if (!menu) return res.status(404).json({ error: 'Menu not found' });
        if (menu.restaurant.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        const item = await prisma.menuItem.create({
            data: {
                menuId,
                name,
                price,
                qty: qty || 0,
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
