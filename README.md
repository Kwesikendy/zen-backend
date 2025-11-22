# Zenran Backend

## Setup

1.  Install dependencies:
    ```bash
    npm ci
    ```

2.  Start database:
    ```bash
    docker-compose up -d db
    ```

3.  Run migrations:
    ```bash
    npx prisma migrate dev
    ```

4.  Start development server:
    ```bash
    npm run dev
    ```

## Deployment

1.  Build:
    ```bash
    npm run build
    ```

2.  Start:
    ```bash
    npm start
    ```

## Environment Variables

See `.env.example`

## Security Checklist

- [x] **Password Hashing**: Uses `argon2` for secure password hashing.
- [x] **Authentication**: JWT (Access + Refresh tokens) with secure storage.
- [x] **Input Validation**: Uses `zod` (recommended) or manual checks in controllers.
- [x] **Headers**: `helmet` middleware configured for security headers.
- [x] **Rate Limiting**: `express-rate-limit` applied to prevent abuse.
- [x] **SQL Injection**: Prevented by using Prisma ORM (parameterized queries).
- [ ] **HTTPS**: Enforce HTTPS in production (e.g., via Nginx or Cloud Load Balancer).
- [ ] **Audit Logs**: Implement middleware to log sensitive actions.

## Scaling Plan

1.  **Stateless API**: The backend is stateless; tokens are stored in the DB/Client.
2.  **Horizontal Scaling**: Deploy multiple instances of the app behind a Load Balancer (Nginx/AWS ALB).
3.  **Database**: Use connection pooling (PgBouncer) to handle many concurrent connections.
4.  **Caching**: Introduce Redis for caching frequently accessed data (menus, sessions).
5.  **Workers**: Offload heavy tasks (e.g., email sending, report generation) to background workers (BullMQ).

