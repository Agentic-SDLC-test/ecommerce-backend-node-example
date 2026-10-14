'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseReviewInput,
  parsePaging,
  buildSummary,
  toPublicReview,
  toOwnReview,
  toAdminReview,
} = require('../src/utils/review.helpers');

describe('parseReviewInput', () => {
  test('throws when rating is missing', () => {
    assert.throws(
      () => parseReviewInput({}),
      /Please select a star rating from 1 to 5/
    );
  });

  test('throws when rating is 0', () => {
    assert.throws(
      () => parseReviewInput({ rating: 0 }),
      /Please select a star rating from 1 to 5/
    );
  });

  test('throws when rating is 6', () => {
    assert.throws(
      () => parseReviewInput({ rating: 6 }),
      /Please select a star rating from 1 to 5/
    );
  });

  test('throws when rating is 4.5 (non-integer)', () => {
    assert.throws(
      () => parseReviewInput({ rating: 4.5 }),
      /Please select a star rating from 1 to 5/
    );
  });

  test('accepts a rating sent as a numeric string', () => {
    const { rating } = parseReviewInput({ rating: '5' });
    assert.equal(rating, 5);
  });

  test('throws when text exceeds 500 characters after trim', () => {
    const text = 'a'.repeat(501);
    assert.throws(
      () => parseReviewInput({ rating: 3, text }),
      /Review text must be 500 characters or fewer/
    );
  });

  test('accepts text that is exactly 500 characters after trim', () => {
    const text = `  ${'a'.repeat(500)}  `;
    const { text: parsed } = parseReviewInput({ rating: 3, text });
    assert.equal(parsed.length, 500);
  });

  test('throws when text is not a string', () => {
    assert.throws(
      () => parseReviewInput({ rating: 3, text: 42 }),
      /Review text must be plain text/
    );
  });

  test('treats a null text as an empty string', () => {
    const { text } = parseReviewInput({ rating: 3, text: null });
    assert.equal(text, '');
  });

  test('treats a missing text as an empty string', () => {
    const { text } = parseReviewInput({ rating: 3 });
    assert.equal(text, '');
  });
});

describe('parsePaging', () => {
  test('uses the default limit when limit is not a number', () => {
    const { limit } = parsePaging({}, 5);
    assert.equal(limit, 5);
  });

  test('clamps limit above 50 down to 50', () => {
    const { limit } = parsePaging({ limit: '500' }, 5);
    assert.equal(limit, 50);
  });

  test('clamps limit below 1 up to 1', () => {
    const { limit } = parsePaging({ limit: '0' }, 5);
    assert.equal(limit, 1);
  });

  test('defaults skip to 0 when missing or negative', () => {
    assert.equal(parsePaging({}, 5).skip, 0);
    assert.equal(parsePaging({ skip: '-10' }, 5).skip, 0);
  });

  test('accepts a valid skip', () => {
    const { skip } = parsePaging({ skip: '10' }, 5);
    assert.equal(skip, 10);
  });
});

describe('buildSummary', () => {
  test('returns a null average for an empty rows set', () => {
    const summary = buildSummary([]);
    assert.deepEqual(summary, {
      average: null,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  test('computes the rounded average and distribution for ratings 5,4,4', () => {
    const rows = [
      { _id: 5, n: 1 },
      { _id: 4, n: 2 },
    ];
    const summary = buildSummary(rows);
    assert.equal(summary.average, 4.3);
    assert.equal(summary.count, 3);
    assert.deepEqual(summary.distribution, { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 });
  });
});

describe('mappers never expose email', () => {
  const baseDoc = {
    _id: 'review1',
    product: { _id: 'product1', title: 'Widget' },
    user: { _id: 'user1', name: 'Jess', email: 'jess@example.com' },
    rating: 5,
    text: 'Great product',
    edited: false,
    hidden: false,
    postedAt: new Date('2026-01-01'),
  };

  test('toPublicReview omits email', () => {
    const result = toPublicReview(baseDoc);
    assert.equal(JSON.stringify(result).includes('email'), false);
    assert.equal(JSON.stringify(result).includes('example.com'), false);
    assert.equal(result.reviewer.name, 'Jess');
  });

  test('toOwnReview omits email', () => {
    const result = toOwnReview(baseDoc);
    assert.equal(JSON.stringify(result).includes('example.com'), false);
    assert.equal(result.product, 'product1');
  });

  test('toAdminReview omits email', () => {
    const result = toAdminReview(baseDoc);
    assert.equal(JSON.stringify(result).includes('example.com'), false);
    assert.equal(result.reviewer.name, 'Jess');
    assert.equal(result.reviewer._id, 'user1');
    assert.equal(result.product.title, 'Widget');
  });

  test('toAdminReview falls back to "Deleted product" when product is missing', () => {
    const result = toAdminReview({ ...baseDoc, product: null });
    assert.equal(result.product.title, 'Deleted product');
  });

  test('toPublicReview falls back to "EasyBuy customer" when user is missing', () => {
    const result = toPublicReview({ ...baseDoc, user: null });
    assert.equal(result.reviewer.name, 'EasyBuy customer');
  });
});
