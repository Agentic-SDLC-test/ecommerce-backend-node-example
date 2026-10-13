'use strict';

const ApiError = require('./ApiError');

const MAX_COMMENT_LENGTH = 500;
const RECENT_REVIEWS_LIMIT = 5;
const STAR_LEVELS = [5, 4, 3, 2, 1];

/**
 * Validates and normalizes review input shared by create and update.
 * Throws ApiError.badRequest with the exact messages the API contract specifies.
 */
function validateReviewInput({ rating, comment }) {
  if (typeof rating === 'boolean' || Array.isArray(rating) || (typeof rating === 'object' && rating !== null)) {
    throw ApiError.badRequest('Rating must be an integer between 1 and 5');
  }

  const numericRating = Number(rating);
  if (
    rating === undefined ||
    rating === null ||
    rating === '' ||
    !Number.isInteger(numericRating) ||
    numericRating < 1 ||
    numericRating > 5
  ) {
    throw ApiError.badRequest('Rating must be an integer between 1 and 5');
  }

  let normalizedComment = comment;
  if (normalizedComment === undefined || normalizedComment === null) {
    normalizedComment = '';
  } else if (typeof normalizedComment !== 'string') {
    throw ApiError.badRequest('Comment must be text');
  } else {
    normalizedComment = normalizedComment.trim();
  }

  if (normalizedComment.length > MAX_COMMENT_LENGTH) {
    throw ApiError.badRequest(`Comment must be at most ${MAX_COMMENT_LENGTH} characters`);
  }

  return { rating: numericRating, comment: normalizedComment };
}

/**
 * "John Doe" -> "John D."; a single token or empty name passes through unchanged
 * (so re-formatting an already-formatted name, e.g. "John D.", is a no-op).
 */
function formatReviewerName(fullName) {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName} ${lastInitial}.`;
}

/**
 * Builds the rating summary (average, total, star-level distribution) from a
 * Mongo $group-by-rating aggregation result: [{ _id: <rating>, count: <n> }].
 */
function buildRatingSummary(groups) {
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let totalCount = 0;
  let ratingSum = 0;

  for (const group of groups || []) {
    const rating = Number(group._id);
    const count = Number(group.count) || 0;
    if (distribution[String(rating)] !== undefined) {
      distribution[String(rating)] += count;
    }
    totalCount += count;
    ratingSum += rating * count;
  }

  const averageRating = totalCount ? parseFloat((ratingSum / totalCount).toFixed(1)) : 0;

  return { averageRating, totalCount, distribution };
}

function toPublicReview(doc) {
  return {
    _id: String(doc._id),
    rating: doc.rating,
    comment: doc.comment || '',
    createdAt: doc.createdAt,
    edited: Boolean(doc.editedAt),
    verifiedPurchase: true,
    user: { name: formatReviewerName(doc.reviewerName) },
  };
}

function toOwnReview(doc) {
  return { ...toPublicReview(doc), visible: doc.visible };
}

function toAdminReview(doc) {
  return {
    _id: String(doc._id),
    productId: String(doc.product),
    productTitle: doc.productTitle || '',
    user: { _id: String(doc.user), name: doc.reviewerName },
    rating: doc.rating,
    comment: doc.comment || '',
    visible: doc.visible,
    edited: Boolean(doc.editedAt),
    editedAt: doc.editedAt || null,
    verifiedPurchase: true,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function isSameId(a, b) {
  return String(a) === String(b);
}

module.exports = {
  MAX_COMMENT_LENGTH,
  RECENT_REVIEWS_LIMIT,
  STAR_LEVELS,
  validateReviewInput,
  formatReviewerName,
  buildRatingSummary,
  toPublicReview,
  toOwnReview,
  toAdminReview,
  isSameId,
};
