'use strict';

const Order = require('../models/order.model');
const Product = require('../models/product.model');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * POST /checkout   (auth)
 * Creates an order for the authenticated user and decrements product stock.
 */
const checkout = asyncHandler(async (req, res) => {
  const body = req.body;
  body.user = req.user?._id;
  body.orderId = Math.floor(Math.random() * 1000000000).toString();

  if (!body.items || body.items.length === 0) {
    return res.json({ success: false, message: 'pass correct parameters' });
  }

  const type = body.payment_type || 'cod';
  if (!['cod', 'online'].includes(type)) {
    logger.warn(`Checkout rejected: invalid payment type ${type}`);
    return res.status(400).json({ success: false, message: 'Invalid payment type' });
  }
  if (type === 'online' && body.payment_status !== 'paid') {
    logger.warn(`Checkout rejected: online payment_status=${body.payment_status}`);
    return res
      .status(400)
      .json({ success: false, message: 'Online payments must be paid before the order is placed' });
  }
  body.payment_type = type;
  body.payment_status = type === 'cod' ? 'pending' : body.payment_status;

  const order = await Order.create(body);
  logger.info(
    `Checkout: order ${order.orderId} payment_type=${order.payment_type} payment_status=${order.payment_status}`
  );

  // Decrement stock for each purchased item.
  await Promise.all(
    body.items.map((item) =>
      Product.findByIdAndUpdate(item.productId, [
        { $set: { quantity: { $subtract: ['$quantity', item.quantity] } } },
      ])
    )
  );

  return res.json({
    success: true,
    message: 'successful checkout',
    data: order,
  });
});

/**
 * GET /orders   (auth)
 * Returns the authenticated user's orders.
 */
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .populate({ path: 'user', select: '-password -token' })
    .populate('items.productId')
    .populate('items.categoryId');

  return res.json({ success: true, message: 'orders', data: orders });
});

module.exports = { checkout, getMyOrders };
