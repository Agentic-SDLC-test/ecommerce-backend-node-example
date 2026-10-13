'use strict';

const Order = require('../models/order.model');
const Product = require('../models/product.model');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /checkout   (auth)
 * Creates an order for the authenticated user and decrements product stock.
 */
const checkout = asyncHandler(async (req, res) => {
  const body = req.body;
  body.user = req.user?._id;
  body.orderId = Math.floor(Math.random() * 1000000000).toString();
  // A verified-purchase review requires an order's delivered status to be
  // set by an admin, not chosen by the client that creates it.
  body.status = 'pending';
  delete body.shippedOn;
  delete body.deliveredOn;

  if (!body.items || body.items.length === 0) {
    return res.json({ success: false, message: 'pass correct parameters' });
  }

  const order = await Order.create(body);

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
