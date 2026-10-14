'use strict';

const Order = require('../models/order.model');
const User = require('../models/user.model');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Review = require('../models/review.model');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { parseObjectId, parsePaging, toAdminReview } = require('../utils/review.helpers');

const VALID_STATUSES = ['pending', 'shipped', 'delivered'];

function getCurrentDate() {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  return `${months[today.getMonth()]} ${day}, ${today.getFullYear()}`;
}

/**
 * GET /dashboard   (admin)
 */
const dashboardData = asyncHandler(async (req, res) => {
  const [ordersCount, usersCount, productsCount, categoriesCount] = await Promise.all([
    Order.countDocuments(),
    User.countDocuments(),
    Product.countDocuments(),
    Category.countDocuments(),
  ]);

  return res.json({
    success: true,
    message: 'dashboard data',
    data: { ordersCount, usersCount, productsCount, categoriesCount },
  });
});

/**
 * GET /admin/users   (admin)
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select('-password -token');
  return res.json({ success: true, message: 'all users', data: users });
});

/**
 * GET /admin/orders   (admin)
 */
const getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate({ path: 'user', select: '-password -token' })
    .populate('items.productId')
    .populate('items.categoryId');

  const ordersCount = await Order.countDocuments();

  return res.json({
    success: true,
    status: 200,
    message: 'all orders',
    data: orders,
    ordersCount,
  });
});

/**
 * GET /admin/order-status?orderId=:id&status=:status   (admin)
 */
const changeStatusOfOrder = asyncHandler(async (req, res) => {
  const { status, orderId } = req.query;

  if (!orderId || !status) {
    return res.json({ success: false, message: 'status or order Id is missing' });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.json({ success: false, message: 'wrong status' });
  }

  const update = { status };
  if (status === 'shipped') update.shippedOn = getCurrentDate();
  if (status === 'delivered') update.deliveredOn = getCurrentDate();

  const updatedOrder = await Order.findByIdAndUpdate(orderId, update, { new: true });

  return res.json({
    success: true,
    status: 200,
    message: 'status updated successfully',
    data: updatedOrder,
  });
});

/**
 * GET /admin/reviews?visibility=all|visible|hidden&limit=&skip=   (admin)
 */
const getAllReviews = asyncHandler(async (req, res) => {
  const visibility = req.query.visibility || 'all';
  if (!['all', 'visible', 'hidden'].includes(visibility)) {
    throw ApiError.badRequest('Invalid visibility');
  }

  let filter = {};
  if (visibility === 'visible') filter = { hidden: false };
  if (visibility === 'hidden') filter = { hidden: true };

  const { limit, skip } = parsePaging(req.query, 20);

  const [docs, total] = await Promise.all([
    Review.find(filter)
      .sort({ postedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name')
      .populate('product', 'title'),
    Review.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    message: 'all reviews',
    data: { reviews: docs.map(toAdminReview), total },
  });
});

/**
 * POST /admin/review-visibility?id=&hidden=true|false   (admin)
 */
const setReviewVisibility = asyncHandler(async (req, res) => {
  const id = parseObjectId(req.query.id, 'id');

  if (req.query.hidden !== 'true' && req.query.hidden !== 'false') {
    throw ApiError.badRequest('Invalid hidden value');
  }
  const hidden = req.query.hidden === 'true';

  const doc = await Review.findByIdAndUpdate(id, { hidden }, { new: true })
    .populate('user', 'name')
    .populate('product', 'title');
  if (!doc) {
    throw ApiError.notFound('Review not found');
  }

  if (hidden) {
    logger.info(`review.hidden reviewId=${id} adminId=${req.user._id}`);
  } else {
    logger.info(`review.unhidden reviewId=${id} adminId=${req.user._id}`);
  }

  return res.json({
    success: true,
    message: hidden ? 'Review hidden' : 'Review visible',
    data: toAdminReview(doc),
  });
});

/**
 * POST /admin/delete-review?id=   (admin)
 */
const deleteReview = asyncHandler(async (req, res) => {
  const id = parseObjectId(req.query.id, 'id');

  const doc = await Review.findByIdAndDelete(id);
  if (!doc) {
    throw ApiError.notFound('Review not found');
  }

  logger.info(`review.deleted reviewId=${id} adminId=${req.user._id}`);

  return res.json({ success: true, message: 'Review removed' });
});

module.exports = {
  dashboardData,
  getAllUsers,
  getAllOrders,
  changeStatusOfOrder,
  getAllReviews,
  setReviewVisibility,
  deleteReview,
};
