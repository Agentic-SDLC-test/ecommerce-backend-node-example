'use strict';

const mongoose = require('mongoose');
const Review = require('../models/review.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

const RECENT_REVIEWS_LIMIT = 5;

/**
 * Returns true when the given user has at least one delivered order
 * containing the given product.
 */
async function isVerifiedPurchaser(userId, productId) {
  return Boolean(
    await Order.exists({ user: userId, status: 'delivered', 'items.productId': productId })
  );
}

/**
 * Aggregates the visible reviews for a product into an average, a total
 * count and a distribution across the five star levels.
 */
async function buildSummary(productId) {
  const rows = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), isVisible: true } },
    { $group: { _id: '$rating', n: { $sum: 1 } } },
  ]);

  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let count = 0;
  let sum = 0;
  rows.forEach((row) => {
    distribution[String(row._id)] = row.n;
    count += row.n;
    sum += row._id * row.n;
  });

  return {
    average: count === 0 ? null : Math.round((sum / count) * 10) / 10,
    count,
    distribution,
  };
}

/** Shortens a reviewer's name to first name + last initial, for public display. */
function toDisplayName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'EasyBuy customer';

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  const lastPart = parts[parts.length - 1];
  return `${parts[0]} ${lastPart[0].toUpperCase()}.`;
}

/** Maps a review document to the shape returned to shoppers (no user id/email). */
function toPublicReview(doc) {
  return {
    _id: doc._id,
    rating: doc.rating,
    comment: doc.comment,
    reviewerName: toDisplayName(doc.user?.name),
    verifiedPurchase: true,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    edited: doc.updatedAt - doc.createdAt > 1000,
  };
}

function assertObjectId(value, field) {
  if (!value) {
    throw ApiError.badRequest(`${field} is required`);
  }
  if (!mongoose.isValidObjectId(value)) {
    throw ApiError.badRequest(`Invalid ${field}`);
  }
}

/**
 * GET /product-reviews?productId=:productId
 * Public. Returns the rating summary and up to five most recent written
 * reviews (newest updated first). Only visible reviews count.
 */
const getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.query;
  assertObjectId(productId, 'productId');

  const [summary, reviews] = await Promise.all([
    buildSummary(productId),
    Review.find({ product: productId, isVisible: true, comment: { $ne: '' } })
      .sort({ updatedAt: -1 })
      .limit(RECENT_REVIEWS_LIMIT)
      .populate({ path: 'user', select: 'name' }),
  ]);

  return res.json({
    success: true,
    message: 'product reviews',
    data: { summary, reviews: reviews.map(toPublicReview) },
  });
});

/**
 * GET /my-review?productId=:productId   (auth)
 * Returns the caller's eligibility and their own review for the product,
 * including a hidden review if one exists.
 */
const getMyReview = asyncHandler(async (req, res) => {
  const { productId } = req.query;
  assertObjectId(productId, 'productId');

  const [eligible, review] = await Promise.all([
    isVerifiedPurchaser(req.user._id, productId),
    Review.findOne({ product: productId, user: req.user._id }),
  ]);

  return res.json({
    success: true,
    message: 'my review',
    data: {
      eligible,
      review: review
        ? {
            _id: review._id,
            rating: review.rating,
            comment: review.comment,
            isVisible: review.isVisible,
            createdAt: review.createdAt,
            updatedAt: review.updatedAt,
          }
        : null,
    },
  });
});

/**
 * POST /review   (auth)
 * Body: { productId, rating, comment? }
 * Creates or edits the caller's single review for the product. Eligibility
 * (a delivered order containing the product) is enforced server-side.
 */
const submitReview = asyncHandler(async (req, res) => {
  const { productId, rating, comment = '' } = req.body;

  assertObjectId(productId, 'productId');

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw ApiError.badRequest('Rating must be a whole number from 1 to 5');
  }
  if (typeof comment !== 'string') {
    throw ApiError.badRequest('Comment must be text');
  }
  const text = comment.trim();
  if (text.length > 500) {
    throw ApiError.badRequest('Comment must be 500 characters or fewer');
  }

  if (!(await Product.exists({ _id: productId }))) {
    throw ApiError.notFound('product does not exist');
  }

  if (!(await isVerifiedPurchaser(req.user._id, productId))) {
    logger.warn(`review.rejected reason=not_verified_purchaser productId=${productId} userId=${req.user._id}`);
    throw ApiError.forbidden('Only customers with a delivered order for this product can review it');
  }

  let result;
  try {
    result = await Review.findOneAndUpdate(
      { product: productId, user: req.user._id },
      { $set: { rating, comment: text }, $setOnInsert: { isVisible: true } },
      { upsert: true, new: true, runValidators: true, includeResultMetadata: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Two concurrent first submissions raced the upsert; the other request
    // already created the row, so retry as a plain update.
    result = await Review.findOneAndUpdate(
      { product: productId, user: req.user._id },
      { $set: { rating, comment: text } },
      { new: true, runValidators: true, includeResultMetadata: true }
    );
  }

  const doc = result.value;
  const created = !result.lastErrorObject.updatedExisting;

  logger.info(
    `review.upserted reviewId=${doc._id} productId=${productId} userId=${req.user._id} created=${created} rating=${rating}`
  );

  return res.status(created ? 201 : 200).json({
    success: true,
    message: created ? 'review submitted' : 'review updated',
    data: {
      _id: doc._id,
      rating: doc.rating,
      comment: doc.comment,
      isVisible: doc.isVisible,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
  });
});

/**
 * GET /admin/reviews   (admin)
 * Returns every review, visible and hidden, newest first.
 */
const getAdminReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find()
    .sort({ createdAt: -1 })
    .populate({ path: 'user', select: 'name email' })
    .populate({ path: 'product', select: 'title image' });

  return res.json({ success: true, message: 'all reviews', data: reviews });
});

/**
 * POST /admin/review-visibility   (admin)
 * Body: { reviewId, isVisible }
 */
const updateReviewVisibility = asyncHandler(async (req, res) => {
  const { reviewId, isVisible } = req.body;
  assertObjectId(reviewId, 'reviewId');

  if (typeof isVisible !== 'boolean') {
    throw ApiError.badRequest('isVisible must be true or false');
  }

  const review = await Review.findByIdAndUpdate(reviewId, { isVisible }, { new: true });
  if (!review) {
    throw ApiError.notFound('review does not exist');
  }

  logger.info(
    `review.visibility_changed reviewId=${review._id} productId=${review.product} adminId=${req.user._id} isVisible=${isVisible}`
  );

  return res.json({
    success: true,
    message: isVisible ? 'review restored' : 'review hidden',
    data: review,
  });
});

/**
 * POST /admin/delete-review   (admin)
 * Body: { reviewId }
 */
const deleteReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.body;
  assertObjectId(reviewId, 'reviewId');

  const review = await Review.findByIdAndDelete(reviewId);
  if (!review) {
    throw ApiError.notFound('review does not exist');
  }

  logger.info(`review.deleted reviewId=${review._id} productId=${review.product} adminId=${req.user._id}`);

  return res.json({ success: true, message: 'review deleted successfully' });
});

module.exports = {
  getProductReviews,
  getMyReview,
  submitReview,
  getAdminReviews,
  updateReviewVisibility,
  deleteReview,
};
