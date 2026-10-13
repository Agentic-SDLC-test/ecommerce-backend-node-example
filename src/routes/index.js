'use strict';

const express = require('express');
const mongoose = require('mongoose');

const authRoutes = require('./auth.routes');
const productRoutes = require('./product.routes');
const categoryRoutes = require('./category.routes');
const orderRoutes = require('./order.routes');
const wishlistRoutes = require('./wishlist.routes');
const reviewRoutes = require('./review.routes');
const cartRoutes = require('./cart.routes');
const adminRoutes = require('./admin.routes');
const uploadRoutes = require('./upload.routes');

const router = express.Router();

/**
 * Liveness/readiness probe. Useful for Docker healthchecks and load balancers.
 */
router.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    database: dbState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// All feature routers are mounted at the root to preserve the flat URL
// contract the mobile client depends on (e.g. POST /login, GET /products).
router.use('/', authRoutes);
router.use('/', productRoutes);
router.use('/', categoryRoutes);
router.use('/', orderRoutes);
router.use('/', wishlistRoutes);
router.use('/', reviewRoutes);
router.use('/', cartRoutes);
router.use('/', adminRoutes);
router.use('/', uploadRoutes);

module.exports = router;
