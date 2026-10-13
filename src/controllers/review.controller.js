'use strict';

const mongoose = require('mongoose');

const Review = require('../models/review.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const {
  RECENT_REVIEWS_LIMIT,
  validateReviewInput,
  buildRatingSummary,
  toPublicReview,
  toOwnReview,
  toAdminReview,
  isSameId,
} = require('../utils/reviewRules');

function assertValidProductId(id) {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid product id');
  }
}

function assertValidReviewId(id) {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid review id');
  }
}

async function isEligiblePurchaser(userId, productId) {
  return Boolean(
    await Order.exists({ user: userId, status: 'delivered', 'items.productId': productId })
  );
}

/**
 * GET /products/:id/reviews   (optional auth)
 */
const getProductReviews = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertValidProductId(id);

  const product = await Product.exists({ _id: id });
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  const productObjectId = new mongoose.Types.ObjectId(id);
  const currentUser = req.currentUser;

  const [groups, recent, eligible, mine] = await Promise.all([
    Review.aggregate([
      { $match: { product: productObjectId, visible: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
    Review.find({ product: productObjectId, visible: true })
      .sort({ createdAt: -1 })
      .limit(RECENT_REVIEWS_LIMIT)
      .lean(),
    currentUser ? isEligiblePurchaser(currentUser._id, id) : Promise.resolve(false),
    currentUser ? Review.findOne({ product: productObjectId, user: currentUser._id }).lean() : Promise.resolve(null),
  ]);

  const summary = buildRatingSummary(groups);

  return res.json({
    success: true,
    reviews: recent.map(toPublicReview),
    ...summary,
    isEligible: Boolean(eligible),
    hasReviewed: Boolean(mine),
    myReview: mine ? toOwnReview(mine) : null,
  });
});

/**
 * POST /reviews   (auth)
 * Body: { productId, rating, comment }
 */
const createReview = asyncHandler(async (req, res) => {
  const { productId, rating, comment } = req.body;

  if (!productId || rating === undefined) {
    throw ApiError.badRequest('productId and rating are required');
  }
  assertValidProductId(productId);

  const validated = validateReviewInput({ rating, comment });

  const product = await Product.findById(productId).select('title');
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  const eligible = await isEligiblePurchaser(req.currentUser._id, productId);
  if (!eligible) {
    logger.warn('review.create_rejected', { productId, userId: req.currentUser._id, reason: 'not_eligible' });
    throw ApiError.forbidden('You are not eligible to review this product');
  }

  const alreadyReviewed = await Review.exists({ product: productId, user: req.currentUser._id });
  if (alreadyReviewed) {
    logger.warn('review.create_rejected', { productId, userId: req.currentUser._id, reason: 'duplicate' });
    throw new ApiError(409, 'You have already reviewed this product. Edit your existing review instead.');
  }

  let review;
  try {
    review = await Review.create({
      product: productId,
      user: req.currentUser._id,
      reviewerName: req.currentUser.name || 'Anonymous',
      productTitle: product.title,
      rating: validated.rating,
      comment: validated.comment,
    });
  } catch (err) {
    if (err.code === 11000) {
      logger.warn('review.create_rejected', { productId, userId: req.currentUser._id, reason: 'duplicate' });
      throw new ApiError(409, 'You have already reviewed this product. Edit your existing review instead.');
    }
    throw err;
  }

  logger.info('review.created', { reviewId: review._id, productId, userId: req.currentUser._id, rating: review.rating });

  return res.json({
    success: true,
    message: 'Review submitted successfully',
    data: toOwnReview(review.toObject()),
  });
});

/**
 * POST /reviews/:id/update   (auth, author only)
 * Body: { rating, comment }
 */
const updateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertValidReviewId(id);

  const validated = validateReviewInput(req.body);

  const review = await Review.findById(id);
  if (!review) {
    throw ApiError.notFound('Review not found');
  }

  if (!isSameId(review.user, req.currentUser._id)) {
    throw ApiError.forbidden('You can only edit your own review');
  }

  const wasVisible = review.visible;
  review.rating = validated.rating;
  review.comment = validated.comment;
  review.editedAt = new Date();
  await review.save();

  logger.info('review.updated', {
    reviewId: review._id,
    productId: review.product,
    userId: req.currentUser._id,
    rating: review.rating,
    wasVisible,
  });

  return res.json({
    success: true,
    message: 'Review updated successfully',
    data: toOwnReview(review.toObject()),
  });
});

/**
 * GET /admin/reviews   (admin)
 */
const getAdminReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find().sort({ createdAt: -1 }).lean();
  return res.json({ success: true, message: 'all reviews', data: reviews.map(toAdminReview) });
});

/**
 * POST /admin/reviews/:id/visibility   (admin)
 * Body: { visible }
 */
const setReviewVisibility = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertValidReviewId(id);

  const { visible } = req.body;
  if (typeof visible !== 'boolean') {
    throw ApiError.badRequest('visible must be a boolean');
  }

  const review = await Review.findByIdAndUpdate(id, { visible }, { new: true }).lean();
  if (!review) {
    throw ApiError.notFound('Review not found');
  }

  logger.info('review.visibility_changed', {
    reviewId: review._id,
    productId: review.product,
    adminId: req.currentUser._id,
    visible,
  });

  return res.json({ success: true, message: 'Visibility updated successfully', data: toAdminReview(review) });
});

/**
 * POST /admin/reviews/:id/delete   (admin)
 */
const deleteReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertValidReviewId(id);

  const review = await Review.findByIdAndDelete(id);
  if (!review) {
    throw ApiError.notFound('Review not found');
  }

  logger.info('review.deleted', { reviewId: review._id, productId: review.product, adminId: req.currentUser._id });

  return res.json({ success: true, message: 'Review deleted successfully' });
});

module.exports = {
  getProductReviews,
  createReview,
  updateReview,
  getAdminReviews,
  setReviewVisibility,
  deleteReview,
};
