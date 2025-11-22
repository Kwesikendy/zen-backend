import request from 'supertest';
import 'dotenv/config';
import { createApp } from '../app';
import { PrismaClient } from '@prisma/client';

const app = createApp();
const prisma = new PrismaClient();

describe('E2E Flows', () => {
    beforeAll(async () => {
        // Cleanup before tests (optional, be careful in prod!)
        // await prisma.order.deleteMany();
        // await prisma.menuItem.deleteMany();
        // await prisma.menu.deleteMany();
        // await prisma.restaurant.deleteMany();
        // await prisma.user.deleteMany();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should register a new user', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({
                email: `test-${Date.now()}@example.com`,
                password: 'password123',
                name: 'Test User'
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('user');
    });

    it('should login an existing user', async () => {
        const email = `login-${Date.now()}@example.com`;
        const password = 'password123';

        await request(app).post('/auth/register').send({ email, password, name: 'Login User' });

        const res = await request(app)
            .post('/auth/login')
            .send({ email, password });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('accessToken');
    });

    // Add more tests for Restaurant, Menu, Order flows here
    // Note: These require implementing the respective routes first.
});
