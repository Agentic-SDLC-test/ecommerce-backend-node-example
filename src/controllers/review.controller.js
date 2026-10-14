'use strict';

const mongoose = require('mongoose');
const Review = require('../models/review.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const {
  ELIGIBILITY,
  parseReviewInput,
  parseObjectId,
  parsePaging,
  buildSummary,
  toPublicReview,
  toOwnReview,
} = require('../utils/review.helpers');

/**
 * Determines whether a user may review a product: `eligible` once they have
 * a delivered order containing the product, `not_delivered` if they have an
 * order for it that hasn't been delivered yet, otherwise `not_purchased`.
 */
async function getEligibility(userId, productId) {
  const delivered = await Order.exists({
    user: userId,
    status: 'delivered',
    'items.productId': productId,
  });
  if (delivered) {
    return ELIGIBILITY.ELIGIBLE;
  }

  const purchased = await Order.exists({ user: userId, 'items.productId': productId });
  if (purchased) {
    return ELIGIBILITY.NOT_DELIVERED;
  }

  return ELIGIBILITY.NOT_PURCHASED;
}

/**
 * Throws the appropriate 403 for a non-eligible user, logging the rejection
 * reason first. Shared by createReview and updateReview.
 */
function assertEligible(eligibility, productId, userId) {
  if (eligibility === ELIGIBILITY.NOT_DELIVERED) {
    logger.warn(`review.rejected reason=not_delivered productId=${productId} userId=${userId}`);
    throw ApiError.forbidden('You can review this product once your order is delivered');
  }
  if (eligibility === ELIGIBILITY.NOT_PURCHASED) {
    logger.warn(`review.rejected reason=not_purchased productId=${productId} userId=${userId}`);
    throw ApiError.forbidden('Only customers who have received this product can review it');
  }
}

/** GET /product-reviews?productId=&limit=&skip=   (public) */
const getProductReviews = asyncHandler(async (req, res) => {
  const productId = parseObjectId(req.query.productId, 'productId');
  if (!(await Product.exists({ _id: productId }))) {
    throw ApiError.notFound('Product not found');
  }

  const { limit, skip } = parsePaging(req.query, 5);

  const visible = { product: productId, hidden: false };
  const written = { ...visible, text: { $ne: '' } };

  const [rows, writtenCount, docs] = await Promise.all([
    Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId), hidden: false } },
      { $group: { _id: '$rating', n: { $sum: 1 } } },
    ]),
    Review.countDocuments(written),
    Review.find(written)
      .sort({ postedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name'),
  ]);

  return res.json({
    success: true,
    message: 'product reviews',
    data: {
      summary: buildSummary(rows),
      reviews: docs.map(toPublicReview),
      writtenCount,
    },
  });
});

/** GET /my-review?productId=   (auth) */
const getMyReview = asyncHandler(async (req, res) => {
  const productId = parseObjectId(req.query.productId, 'productId');

  const eligibility = await getEligibility(req.user._id, productId);
  const review = await Review.findOne({ user: req.user._id, product: productId }).populate(
    'user',
    'name'
  );

  return res.json({
    success: true,
    message: 'my review',
    data: { eligibility, review: review ? toOwnReview(review) : null },
  });
});

/** POST /review   (auth)   Body: { productId, rating, text } */
const createReview = asyncHandler(async (req, res) => {
  const productId = parseObjectId(req.body.productId, 'productId');
  if (!(await Product.exists({ _id: productId }))) {
    throw ApiError.notFound('Product not found');
  }

  const { rating, text } = parseReviewInput(req.body);

  const eligibility = await getEligibility(req.user._id, productId);
  assertEligible(eligibility, productId, req.user._id);

  if (await Review.exists({ user: req.user._id, product: productId })) {
    logger.warn(`review.rejected reason=duplicate productId=${productId} userId=${req.user._id}`);
    throw new ApiError(409, 'You have already reviewed this product. Edit your existing review instead');
  }

  let review;
  try {
    review = await Review.create({
      user: req.user._id,
      product: productId,
      rating,
      text,
      postedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'You have already reviewed this product. Edit your existing review instead');
    }
    throw err;
  }

  await review.populate('user', 'name');

  logger.info(
    `review.created reviewId=${review._id} productId=${productId} userId=${req.user._id} rating=${rating} hasText=${Boolean(text)}`
  );

  return res.status(201).json({ success: true, message: 'Review submitted', data: toOwnReview(review) });
});

/** POST /update-review?id=   (auth)   Body: { rating, text } */
const updateReview = asyncHandler(async (req, res) => {
  const id = parseObjectId(req.query.id, 'id');

  const review = await Review.findOne({ _id: id, user: req.user._id });
  if (!review) {
    throw ApiError.notFound('Review not found');
  }

  const { rating, text } = parseReviewInput(req.body);

  const eligibility = await getEligibility(req.user._id, review.product);
  assertEligible(eligibility, review.product, req.user._id);

  review.rating = rating;
  review.text = text;
  review.edited = true;
  review.postedAt = new Date();

  await review.save();
  await review.populate('user', 'name');

  logger.info(
    `review.updated reviewId=${review._id} productId=${review.product} userId=${req.user._id} rating=${rating} hasText=${Boolean(text)}`
  );

  return res.json({ success: true, message: 'Review updated', data: toOwnReview(review) });
});

module.exports = { getEligibility, getProductReviews, getMyReview, createReview, updateReview };
