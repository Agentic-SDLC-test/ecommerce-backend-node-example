'use strict';

const mongoose = require('mongoose');
const Review = require('../src/models/review.model');

function newReview(overrides = {}) {
  return {
    product: new mongoose.Types.ObjectId(),
    user: new mongoose.Types.ObjectId(),
    rating: 5,
    comment: 'Great product.',
    ...overrides,
  };
}

describe('review.model', () => {
  test('creates a review with valid fields', async () => {
    const review = await Review.create(newReview());

    expect(review._id).toBeDefined();
    expect(review.isVisible).toBe(true);
    expect(review.rating).toBe(5);
  });

  test.each([0, 6, 3.5])('rejects rating %p', async (rating) => {
    await expect(Review.create(newReview({ rating }))).rejects.toThrow();
  });

  test('rejects a 501-character comment', async () => {
    await expect(Review.create(newReview({ comment: 'a'.repeat(501) }))).rejects.toThrow();
  });

  test('accepts a 500-character comment', async () => {
    const review = await Review.create(newReview({ comment: 'a'.repeat(500) }));
    expect(review.comment).toHaveLength(500);
  });

  test('trims whitespace from the comment', async () => {
    const review = await Review.create(newReview({ comment: '  nice fit  ' }));
    expect(review.comment).toBe('nice fit');
  });

  test('rejects a second review for the same product and user', async () => {
    const product = new mongoose.Types.ObjectId();
    const user = new mongoose.Types.ObjectId();
    await Review.create(newReview({ product, user }));

    await expect(Review.create(newReview({ product, user }))).rejects.toMatchObject({ code: 11000 });
  });
});
