
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
require('express-async-errors');

const authController = require('./controllers/auth.controller');
const restaurantController = require('./controllers/restaurant.controller');
const orderController = require('./controllers/order.controller');
const authMiddleware = require('./middleware/auth.middleware');
const rateLimiter = require('./middleware/rateLimiter.middleware');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Query Count Middleware (Part A)
app.use((req, res, next) => {
    req._queryCount = 0;

    res.on('finish', () => {
        if (req._queryCount > 5) {
            console.log(
                `[QUERY COUNT] ${req.method} ${req.path} → ${req._queryCount} queries`
            );
        }
    });

    next();
});

// Rate Limiter (Part B)
const orderRateLimit = rateLimiter({
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
    keyFn: (req) => `user:${req.user.id}:orders`
});

// Public Routes
app.get('/api/health', restaurantController.getHealth);
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

app.get(
    '/api/restaurants',
    restaurantController.getRestaurants
);

app.get(
    '/api/restaurants/:id/menu',
    restaurantController.getMenu
);

// Protected Routes
app.use('/api/orders', authMiddleware);

// Rate limited order creation
app.post(
    '/api/orders',
    orderRateLimit,
    orderController.createOrder
);

app.get(
    '/api/orders/history',
    orderController.getOrderHistory
);

app.get(
    '/api/orders/:id',
    orderController.getOrderById
);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Global Error]', err.stack);

    res.status(500).json({
        error: 'Internal Server Error'
    });
});

module.exports = app;

