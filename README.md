# Zenran Backend API

## 📖 Project Overview

**Zenran Backend** is a robust, type-safe REST API built with **Node.js**, **Express**, and **TypeScript**. It powers the Zenran food ordering platform, handling everything from user authentication and restaurant management to order processing, payments, and sales reporting.

### 🚀 Key Features

*   **Authentication & Security**: Secure user registration and login using JWT (Access + Refresh tokens) and Argon2 password hashing.
*   **Restaurant Management**: Create and manage restaurant profiles.
*   **Menu Management**: Create menus, add items with options (e.g., "Spicy", "Extra Cheese"), and handle image uploads.
*   **Order Processing**: Complete order lifecycle management (Create -> Pending -> Paid/Confirmed -> Completed).
*   **Payments**: Integrated **Mobile Money (MoMo)** and **Card** payments via **Paystack**.
*   **Notifications**: Automated **SMS notifications** to customers with unique ticket codes upon order placement.
*   **Sales Reports**: Generate detailed sales reports grouped by payment method.
*   **Scalable Architecture**: Built with Prisma ORM and PostgreSQL for reliability and performance.

---

## 🛠️ Tech Stack

*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **Language**: TypeScript
*   **Database**: PostgreSQL
*   **ORM**: Prisma
*   **Validation**: Zod
*   **Auth**: JSON Web Tokens (JWT) & Argon2
*   **Uploads**: Multer (Local storage, ready for Cloudinary)

---

## 🏁 Getting Started

Follow these steps to set up the backend locally.

### Prerequisites

*   Node.js (v16+)
*   Docker (for the database) or a local PostgreSQL instance

### Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd zenran-backend
    ```

2.  **Install dependencies**
    ```bash
    npm ci
    ```

3.  **Environment Configuration**
    Create a `.env` file in the root directory based on `.env.example`:
    ```env
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zenran?schema=public"
    PORT=3000
    JWT_ACCESS_SECRET="your_super_secret_access_key"
    JWT_REFRESH_SECRET="your_super_secret_refresh_key"
    # Add Paystack keys if working on payments
    PAYSTACK_SECRET_KEY="sk_test_..."
    # Add SMS keys if working on notifications
    ```

4.  **Start the Database**
    If using Docker:
    ```bash
    docker-compose up -d db
    ```

5.  **Run Migrations**
    Initialize the database schema:
    ```bash
    npx prisma migrate dev
    ```

6.  **Start Development Server**
    ```bash
    npm run dev
    ```
    The server will start at `http://localhost:3000`.

---

## 💻 Frontend Integration Guide

This section is specifically for Frontend Engineers integrating with the Zenran Backend.

### Base URL
*   **Local**: `http://localhost:3000`
*   **Production**: `https://<your-hosted-domain>.com`

### Authentication Flow
1.  **Register/Login**: Send `POST` request to `/auth/register` or `/auth/login`.
2.  **Tokens**: Response includes `accessToken` and `refreshToken`.
3.  **Authenticated Requests**: Add the `accessToken` to the **Authorization** header of every protected request:
    ```http
    Authorization: Bearer <your_access_token>
    ```
4.  **Token Expiry**: If you get a `401 Unauthorized`, use the `refreshToken` to hit `/auth/refresh` and get a new `accessToken`.

### 📂 Image Uploads (Important)
*   Currently, images are stored **locally** in the `uploads/` folder.
*   **Frontend Action**: When displaying images, prepend the Base URL.
    *   *Example*: If API returns `imageUrl: "uploads/burger.jpg"`, display it as `http://localhost:3000/uploads/burger.jpg`.
*   *Note*: In production, we will switch to Cloudinary, and the API will return full URLs (e.g., `https://res.cloudinary.com/...`).

### 📡 API Endpoints Reference

#### 1. Authentication
*   `POST /auth/register`: Create a new user.
    *   Body: `{ email, password, name, role }`
*   `POST /auth/login`: Login user.
    *   Body: `{ email, password }`
*   `POST /auth/refresh`: Refresh access token.
    *   Body: `{ token }` (Refresh Token)

#### 2. Restaurants
*   `POST /restaurants`: Create a restaurant.
    *   Body: `{ name, address, phone }`
*   `GET /restaurants/:id`: Get restaurant details.

#### 3. Menus
*   `POST /menus`: Create a menu for a restaurant.
    *   Body: `{ title, restaurantId }`
*   `GET /menus/:restaurantId`: Get all menus and items for a restaurant.
*   `POST /menus/items`: Add an item to a menu (Multipart/Form-Data).
    *   Fields: `menuId`, `name`, `price`, `qty`, `options` (JSON string), `image` (File).

#### 4. Orders & Payments
*   `POST /orders`: Place a new order.
    *   Body:
        ```json
        {
          "restaurantId": "uuid",
          "items": [{ "menuItemId": "uuid", "qty": 2, "options": ["opt_uuid"] }],
          "paymentMethod": "MOMO", // or "CASH"
          "phoneNumber": "054xxxxxxx" // Required for MOMO
        }
        ```
    *   **Response**: Returns `paymentUrl` for Paystack. **Redirect the user to this URL** to complete payment.
*   `GET /orders/my-orders`: Get logged-in user's history.
*   `GET /orders/restaurant/:restaurantId`: Get incoming orders for a restaurant (Owner only).
*   `PATCH /orders/:id/status`: Update order status (e.g., `PENDING` -> `COMPLETED`).

#### 5. Reports
*   `GET /reports/sales?restaurantId=...`: Get sales summary grouped by payment method.

---

## 🚀 Deployment

The backend is ready for deployment on platforms like **Render**, **Railway**, or **Heroku**.

1.  **Build**: `npm run build`
2.  **Start**: `npm start`
3.  **Env Vars**: Ensure all environment variables from `.env.example` are set in your hosting provider's dashboard.

---

## 📝 Notes for Developers

*   **Image Storage**: Currently using local storage. **Do not rely on image persistence** if deploying to a platform with ephemeral filesystems (like Heroku/Render free tier) without switching to Cloudinary first.
*   **Payments**: Paystack is in Test Mode. Use test cards/numbers.
