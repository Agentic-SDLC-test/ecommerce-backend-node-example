'use strict';

const mongoose = require('mongoose');
const ApiError = require('./ApiError');

const REVIEW_TEXT_MAX = 500;

const ELIGIBILITY = {
  ELIGIBLE: 'eligible',
  NOT_DELIVERED: 'not_delivered',
  NOT_PURCHASED: 'not_purchased',
};

/**
 * Validates and normalizes the `{ rating, text }` pair sent by the client
 * when creating or updating a review.
 */
function parseReviewInput(body) {
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw ApiError.badRequest('Please select a star rating from 1 to 5');
  }

  let text = body?.text;
  if (text === undefined || text === null) {
    text = '';
  } else if (typeof text !== 'string') {
    throw ApiError.badRequest('Review text must be plain text');
  } else {
    text = text.trim();
  }

  if (text.length > REVIEW_TEXT_MAX) {
    throw ApiError.badRequest('Review text must be 500 characters or fewer');
  }

  return { rating, text };
}

/**
 * Validates a Mongo ObjectId coming from the request, labelling the error
 * with the field name so the client knows what was wrong.
 */
function parseObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) {
    throw ApiError.badRequest(`Invalid ${label}`);
  }
  return value;
}

/**
 * Normalizes `limit`/`skip` query params into safe paging values.
 */
function parsePaging(query, defaultLimit) {
  let limit = parseInt(query?.limit, 10);
  if (Number.isNaN(limit)) {
    limit = defaultLimit;
  }
  limit = Math.min(50, Math.max(1, limit));

  let skip = parseInt(query?.skip, 10);
  if (Number.isNaN(skip) || skip < 0) {
    skip = 0;
  }

  return { limit, skip };
}

/**
 * Builds a rating summary from a `$group` aggregation of the shape
 * `[{ _id: rating, n: count }]`.
 */
function buildSummary(rows) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let weighted = 0;

  rows.forEach((row) => {
    distribution[row._id] = row.n;
    count += row.n;
    weighted += row._id * row.n;
  });

  const average = count ? Math.round((weighted / count) * 10) / 10 : null;

  return { average, count, distribution };
}

/** Shape returned to any client (public or own) for a single review. */
function toPublicReview(doc) {
  return {
    _id: doc._id,
    rating: doc.rating,
    text: doc.text,
    edited: doc.edited,
    postedAt: doc.postedAt,
    reviewer: { name: doc.user?.name || 'EasyBuy customer' },
  };
}

/** Shape returned to the review's own author, including moderation state. */
function toOwnReview(doc) {
  return {
    ...toPublicReview(doc),
    product: String(doc.product?._id || doc.product),
    hidden: doc.hidden,
  };
}

/** Shape returned to admins moderating reviews. */
function toAdminReview(doc) {
  const product = doc.product;
  return {
    ...toPublicReview(doc),
    hidden: doc.hidden,
    product: {
      _id: product?._id || product,
      title: product?.title || 'Deleted product',
    },
    reviewer: { _id: doc.user?._id, name: doc.user?.name || 'EasyBuy customer' },
  };
}

module.exports = {
  REVIEW_TEXT_MAX,
  ELIGIBILITY,
  parseReviewInput,
  parseObjectId,
  parsePaging,
  buildSummary,
  toPublicReview,
  toOwnReview,
  toAdminReview,
};
