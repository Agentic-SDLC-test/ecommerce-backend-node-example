'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateReviewInput,
  formatReviewerName,
  buildRatingSummary,
  toPublicReview,
  toOwnReview,
} = require('../src/utils/reviewRules');

describe('validateReviewInput', () => {
  test('accepts valid ratings', () => {
    assert.deepEqual(validateReviewInput({ rating: 1, comment: '' }), { rating: 1, comment: '' });
    assert.deepEqual(validateReviewInput({ rating: 5, comment: undefined }), { rating: 5, comment: '' });
    assert.deepEqual(validateReviewInput({ rating: '3' }), { rating: 3, comment: '' });
  });

  for (const bad of [0, 6, 4.5, 'abc', null, true, [], {}, '']) {
    test(`rejects rating ${JSON.stringify(bad)}`, () => {
      assert.throws(
        () => validateReviewInput({ rating: bad, comment: '' }),
        /Rating must be an integer between 1 and 5/
      );
    });
  }

  test('comment undefined/null becomes empty string', () => {
    assert.equal(validateReviewInput({ rating: 4, comment: undefined }).comment, '');
    assert.equal(validateReviewInput({ rating: 4, comment: null }).comment, '');
  });

  test('non-string comment throws', () => {
    assert.throws(() => validateReviewInput({ rating: 4, comment: 42 }), /Comment must be text/);
  });

  test('comment is trimmed', () => {
    assert.equal(validateReviewInput({ rating: 4, comment: '  nice  ' }).comment, 'nice');
  });

  test('500-character comment passes, 501-character comment throws', () => {
    const ok = 'a'.repeat(500);
    const tooLong = 'a'.repeat(501);
    assert.equal(validateReviewInput({ rating: 4, comment: ok }).comment, ok);
    assert.throws(
      () => validateReviewInput({ rating: 4, comment: tooLong }),
      /Comment must be at most 500 characters/
    );
  });
});

describe('formatReviewerName', () => {
  test('empty name is Anonymous', () => {
    assert.equal(formatReviewerName(''), 'Anonymous');
    assert.equal(formatReviewerName(null), 'Anonymous');
  });

  test('single token stays unchanged', () => {
    assert.equal(formatReviewerName('Madonna'), 'Madonna');
  });

  test('full name becomes "First L."', () => {
    assert.equal(formatReviewerName('John Doe'), 'John D.');
  });

  test('is idempotent on an already-formatted name', () => {
    assert.equal(formatReviewerName('John D.'), 'John D.');
  });
});

describe('buildRatingSummary', () => {
  test('empty groups give zeros', () => {
    assert.deepEqual(buildRatingSummary([]), {
      averageRating: 0,
      totalCount: 0,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    });
  });

  test('mixed groups compute average, total and distribution', () => {
    const result = buildRatingSummary([
      { _id: 5, count: 1 },
      { _id: 4, count: 2 },
    ]);
    assert.equal(result.averageRating, 4.3);
    assert.equal(result.totalCount, 3);
    assert.deepEqual(result.distribution, { '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 });
  });
});

describe('review payload mappers', () => {
  const baseDoc = {
    _id: 'rev1',
    product: 'prod1',
    user: 'user1',
    reviewerName: 'John Doe',
    productTitle: 'Widget',
    rating: 4,
    comment: 'Great',
    visible: true,
    editedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  test('toPublicReview has no user _id and sets verifiedPurchase', () => {
    const result = toPublicReview(baseDoc);
    assert.equal(result.user._id, undefined);
    assert.equal(result.user.name, 'John D.');
    assert.equal(result.verifiedPurchase, true);
    assert.equal(result.edited, false);
  });

  test('toPublicReview sets edited from editedAt', () => {
    const result = toPublicReview({ ...baseDoc, editedAt: '2026-02-01T00:00:00.000Z' });
    assert.equal(result.edited, true);
  });

  test('toOwnReview includes visible', () => {
    const result = toOwnReview({ ...baseDoc, visible: false });
    assert.equal(result.visible, false);
  });
});
