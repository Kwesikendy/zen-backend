import request from 'supertest';
import 'dotenv/config';
import { createApp } from '../app';
import { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../auth/jwt';

const app = createApp();
const prisma = new PrismaClient();

describe('Order Management', () => {
    let userToken: string;
    let ownerToken: string;
    let userId: string;
    let ownerId: string;
    let restaurantId: string;
    let menuItemId: string;

    beforeAll(async () => {
        await prisma.orderItem.deleteMany();
        await prisma.order.deleteMany();
        await prisma.menuItem.deleteMany();
        await prisma.menu.deleteMany();
        await prisma.restaurant.deleteMany();
        await prisma.refreshToken.deleteMany();
        await prisma.user.deleteMany();

        // Create Owner
        const owner = await prisma.user.create({
            data: {
                email: `owner-${Date.now()}@test.com`,
                password: 'hashedpassword',
                name: 'Owner',
                role: 'OWNER'
            }
        });
        ownerId = owner.id;
        ownerToken = signAccessToken({ userId: owner.id, role: owner.role });

        // Create User
        const user = await prisma.user.create({
            data: {
                email: `user-${Date.now()}@test.com`,
                password: 'hashedpassword',
                name: 'Customer',
                role: 'USER'
            }
        });
        userId = user.id;
        userToken = signAccessToken({ userId: user.id, role: user.role });

        // Create Restaurant
        const restaurant = await prisma.restaurant.create({
            data: {
                name: 'Order Test Restaurant',
                address: '123 Order St',
                ownerId: owner.id
            }
        });
        restaurantId = restaurant.id;

        // Create Menu and Item
        const menu = await prisma.menu.create({
            data: {
                title: 'Order Menu',
                restaurantId: restaurant.id
            }
        });

        const item = await prisma.menuItem.create({
            data: {
                menuId: menu.id,
                name: 'Burger',
                price: 10.00,
                qty: 100
            }
        });
        menuItemId = item.id;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should create an order with options', async () => {
        // Fetch the item to get its options
        const item = await prisma.menuItem.findUnique({
            where: { id: menuItemId },
            include: { options: true }
        });

        // If no options exist (from setup), create one manually for this test
        let optionId;
        if (!item?.options || item.options.length === 0) {
            const opt = await prisma.menuItemOption.create({
                data: {
                    menuItemId,
                    name: 'Extra Cheese',
                    price: 2.00
                }
            });
            optionId = opt.id;
        } else {
            optionId = item.options[0].id;
        }

        const res = await request(app)
            .post('/orders')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                restaurantId,
                items: [
                    {
                        menuItemId,
                        qty: 1,
                        options: [optionId]
                    }
                ]
            });

        expect(res.status).toBe(201);
        // Base price 10.00 + Option 2.00 = 12.00
        expect(Number(res.body.order.total)).toBe(12.00);
        expect(res.body.order.status).toBe('PENDING');
    });

    it('should get my orders', async () => {
        const res = await request(app)
            .get('/orders/me')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0].items).toBeDefined();
    });

    it('should get restaurant orders (owner)', async () => {
        const res = await request(app)
            .get(`/orders/restaurant/${restaurantId}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
    });

    it('should update order status (owner)', async () => {
        // Get an order id first
        const ordersRes = await request(app)
            .get(`/orders/restaurant/${restaurantId}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        const orderId = ordersRes.body[0].id;

        const res = await request(app)
            .patch(`/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ status: 'PREPARING' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('PREPARING');
    });

    it('should create an anonymous order with customerName', async () => {
        const res = await request(app)
            .post('/orders')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                restaurantId,
                customerName: 'Guest John',
                items: [
                    { menuItemId, qty: 1 }
                ]
            });

        expect(res.status).toBe(201);
        expect(res.body.order.customerName).toBe('Guest John');
    });

    it('should create an order with tableNumber', async () => {
        const res = await request(app)
            .post('/orders')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                restaurantId,
                tableNumber: 'Table 5',
                items: [
                    { menuItemId, qty: 1 }
                ]
            });

        expect(res.status).toBe(201);
        expect(res.body.order.tableNumber).toBe('Table 5');
    });
});
