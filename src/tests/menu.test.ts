import request from 'supertest';
import 'dotenv/config';
import { createApp } from '../app';
import { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../auth/jwt';

const app = createApp();
const prisma = new PrismaClient();

describe('Menu Management', () => {
    let token: string;
    let userId: string;
    let restaurantId: string;

    beforeAll(async () => {
        await prisma.orderItem.deleteMany();
        await prisma.order.deleteMany();
        await prisma.menuItem.deleteMany();
        await prisma.menu.deleteMany();
        await prisma.restaurant.deleteMany();
        await prisma.refreshToken.deleteMany();
        await prisma.user.deleteMany();

        const user = await prisma.user.create({
            data: {
                email: `menu-owner-${Date.now()}@test.com`,
                password: 'hashedpassword',
                name: 'Menu Owner',
                role: 'OWNER'
            }
        });
        userId = user.id;
        token = signAccessToken({ userId: user.id, role: user.role });

        const restaurant = await prisma.restaurant.create({
            data: {
                name: 'Menu Test Restaurant',
                address: '123 Menu St',
                ownerId: userId
            }
        });
        restaurantId = restaurant.id;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should create a menu', async () => {
        const res = await request(app)
            .post('/menus')
            .set('Authorization', `Bearer ${token}`)
            .send({
                restaurantId,
                title: 'Lunch Menu'
            });

        expect(res.status).toBe(201);
        expect(res.body.title).toBe('Lunch Menu');
    });

    it('should add an item to menu with options', async () => {
        const menu = await prisma.menu.create({
            data: {
                title: 'Dinner Menu',
                restaurantId
            }
        });

        const res = await request(app)
            .post('/menus/items')
            .set('Authorization', `Bearer ${token}`)
            .send({
                menuId: menu.id,
                name: 'Burger',
                price: 15.99,
                qty: 100,
                options: [
                    { name: 'Cheese', price: 2.00 },
                    { name: 'Bacon', price: 3.00 }
                ]
            });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Burger');
        expect(res.body.options).toHaveLength(2);
        expect(res.body.options[0].name).toBe('Cheese');
    });

    it('should get restaurant menus with items', async () => {
        const res = await request(app)
            .get(`/menus/${restaurantId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0].items).toBeDefined();
    });
});
