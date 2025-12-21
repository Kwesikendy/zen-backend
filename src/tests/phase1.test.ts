import request from 'supertest';
import { createApp } from '../app';
import { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../auth/jwt';

const app = createApp();
const prisma = new PrismaClient();

describe('Phase 1 Features', () => {
    let userToken: string;
    let restaurantId: string;
    let menuItemId: string;

    beforeAll(async () => {
        // Cleanup existing data to ensure clean test state
        await prisma.review.deleteMany();
        await prisma.orderItem.deleteMany();
        await prisma.order.deleteMany();
        await prisma.menuItem.deleteMany();
        await prisma.menu.deleteMany();
        await prisma.restaurant.deleteMany();
        await prisma.user.deleteMany();

        // Setup
        const owner = await prisma.user.create({
            data: { email: `owner-${Date.now()}@test.com`, password: 'pw', name: 'Own', role: 'OWNER' }
        });
        const user = await prisma.user.create({
            data: { email: `user-${Date.now()}@test.com`, password: 'pw', name: 'User', role: 'USER' }
        });
        userToken = signAccessToken({ userId: user.id, role: user.role });

        const rest = await prisma.restaurant.create({
            data: { name: 'P1 Rest', address: 'Addr', ownerId: owner.id }
        });
        restaurantId = rest.id;

        const menu = await prisma.menu.create({ data: { title: 'M', restaurantId } });
        const item = await prisma.menuItem.create({
            data: { menuId: menu.id, name: 'Burger', price: 10, qty: 5 }
        });
        menuItemId = item.id;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should decrement stock on order', async () => {
        const res = await request(app)
            .post('/orders')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                restaurantId,
                items: [{ menuItemId, qty: 2 }]
            });

        expect(res.status).toBe(201);

        const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
        expect(item?.qty).toBe(3); // 5 - 2 = 3
    });

    it('should fail if ordering more than stock', async () => {
        const res = await request(app)
            .post('/orders')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                restaurantId,
                items: [{ menuItemId, qty: 10 }] // Only 3 left
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Out of stock');
    });

    it('should add a review', async () => {
        const res = await request(app)
            .post(`/reviews/${menuItemId}`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                rating: 5,
                comment: 'Great burger',
                userName: 'Tester'
            });

        expect(res.status).toBe(201);
        expect(res.body.rating).toBe(5);
    });

    it('should get reviews', async () => {
        const res = await request(app)
            .get(`/reviews/${menuItemId}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].comment).toBe('Great burger');
    });

    it('should restore stock on cancel', async () => {
        // Create an order first (takes 1, left 2)
        const orderRes = await request(app)
            .post('/orders')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                restaurantId,
                items: [{ menuItemId, qty: 1 }]
            });
        const orderId = orderRes.body.order.id;

        // Verify stock is 2
        let item = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
        expect(item?.qty).toBe(2);

        // Cancel Order (Owner action, but using direct DB or supertest if have auth. 
        // We'll mock owner auth for simplicity or just sign a token here)
        // ... Wait, updateOrderStatus needs Owner. 
        // Let's create owner token quickly
        const owner = await prisma.user.findFirst({ where: { role: 'OWNER' } });
        const ownerToken = signAccessToken({ userId: owner!.id, role: 'OWNER' });

        const updateRes = await request(app)
            .patch(`/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ status: 'CANCELLED' });

        expect(updateRes.status).toBe(200);

        // Verify stock is back to 3
        item = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
        expect(item?.qty).toBe(3);
    });
});
