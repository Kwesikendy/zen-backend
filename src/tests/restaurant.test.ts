import request from 'supertest';
import 'dotenv/config';
import { createApp } from '../app';
import { PrismaClient } from '@prisma/client';
import { signAccessToken } from '../auth/jwt';

const app = createApp();
const prisma = new PrismaClient();

describe('Restaurant Management', () => {
    let token: string;
    let userId: string;

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
                email: `owner-${Date.now()}@test.com`,
                password: 'hashedpassword',
                name: 'Restaurant Owner',
                role: 'OWNER'
            }
        });
        userId = user.id;
        token = signAccessToken({ userId: user.id, role: user.role });
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should create a restaurant', async () => {
        const res = await request(app)
            .post('/restaurants')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Test Restaurant',
                address: '123 Test St',
                phone: '123-456-7890'
            });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Test Restaurant');
        expect(res.body.ownerId).toBe(userId);
    });

    it('should list my restaurants', async () => {
        const res = await request(app)
            .get('/restaurants')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
    });

    it('should update a restaurant', async () => {
        // First create one
        const created = await prisma.restaurant.create({
            data: {
                name: 'To Update',
                address: 'Old Address',
                ownerId: userId
            }
        });

        const res = await request(app)
            .put(`/restaurants/${created.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Updated Name'
            });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Updated Name');
    });

    it('should delete a restaurant', async () => {
        const created = await prisma.restaurant.create({
            data: {
                name: 'To Delete',
                address: 'Delete St',
                ownerId: userId
            }
        });

        const res = await request(app)
            .delete(`/restaurants/${created.id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(204);

        const check = await prisma.restaurant.findUnique({ where: { id: created.id } });
        expect(check).toBeNull();
    });
});
