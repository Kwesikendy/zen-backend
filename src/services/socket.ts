import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*", // Allow all origins for now (or configure based on FE)
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket: Socket) => {
        console.log('Client connected:', socket.id);

        // Join restaurant room
        socket.on('joinRestaurant', (restaurantId: string) => {
            console.log(`Socket ${socket.id} joining restaurant ${restaurantId}`);
            socket.join(`restaurant_${restaurantId}`);
        });

        // Join user room (for order updates)
        socket.on('joinUser', (userId: string) => {
            console.log(`Socket ${socket.id} joining user ${userId}`);
            socket.join(`user_${userId}`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

export const emitToRestaurant = (restaurantId: string, event: string, data: any) => {
    if (io) {
        io.to(`restaurant_${restaurantId}`).emit(event, data);
    }
};

export const emitToUser = (userId: string, event: string, data: any) => {
    if (io) {
        io.to(`user_${userId}`).emit(event, data);
    }
};
