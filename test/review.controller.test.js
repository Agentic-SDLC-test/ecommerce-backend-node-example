'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Order = require('../src/models/order.model');
const Product = require('../src/models/product.model');
const Review = require('../src/models/review.model');
const {
  getEligibility,
  createReview,
  updateReview,
} = require('../src/controllers/review.controller');

function objectId() {
  return new mongoose.Types.ObjectId().toString();
}

/**
 * Invokes an asyncHandler-wrapped controller. asyncHandler fires the inner
 * promise but does not return it, so we resolve on whichever of
 * `res.json`/`next` the handler reaches first.
 */
function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ res: this, error: null });
        return this;
      },
    };
    const next = (err) => resolve({ res, error: err });
    handler(req, res, next);
  });
}

describe('getEligibility', () => {
  test('returns eligible when a delivered order containing the product exists', async (t) => {
    t.mock.method(Order, 'exists', async (filter) => (filter.status === 'delivered' ? { _id: objectId() } : null));

    const result = await getEligibility(objectId(), objectId());
    assert.equal(result, 'eligible');
  });

  test('returns not_delivered when an order exists but none is delivered', async (t) => {
    t.mock.method(Order, 'exists', async (filter) => (filter.status === 'delivered' ? null : { _id: objectId() }));

    const result = await getEligibility(objectId(), objectId());
    assert.equal(result, 'not_delivered');
  });

  test('returns not_purchased when no order contains the product', async (t) => {
    t.mock.method(Order, 'exists', async () => null);

    const result = await getEligibility(objectId(), objectId());
    assert.equal(result, 'not_purchased');
  });
});

describe('createReview', () => {
  function baseReq(overrides = {}) {
    return {
      user: { _id: objectId() },
      body: { productId: objectId(), rating: 4, text: 'Nice' },
      ...overrides,
    };
  }

  test('rejects with 409 when a review already exists (pre-check)', async (t) => {
    t.mock.method(Product, 'exists', async () => ({ _id: objectId() }));
    t.mock.method(Order, 'exists', async () => ({ _id: objectId() })); // eligible
    t.mock.method(Review, 'exists', async () => ({ _id: objectId() })); // duplicate
    t.mock.method(Review, 'create', async () => {
      throw new Error('Review.create should not be called when a duplicate pre-check hits');
    });

    const req = baseReq();
    const { error } = await invoke(createReview, req);

    assert.ok(error);
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /already reviewed this product/);
  });

  test('rejects with the same 409 message on a concurrent duplicate-key error', async (t) => {
    t.mock.method(Product, 'exists', async () => ({ _id: objectId() }));
    t.mock.method(Order, 'exists', async () => ({ _id: objectId() })); // eligible
    t.mock.method(Review, 'exists', async () => null); // pre-check passes...
    t.mock.method(Review, 'create', async () => {
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      throw err; // ...but a concurrent request won the race
    });

    const req = baseReq();
    const { error } = await invoke(createReview, req);

    assert.ok(error);
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /already reviewed this product/);
  });

  test('ignores an injected hidden field in the request body', async (t) => {
    const createCall = t.mock.method(Review, 'create', async (payload) => ({
      ...payload,
      _id: objectId(),
      edited: false,
      hidden: false,
      populate: async function populate() {
        this.user = { _id: this.user, name: 'Tester' };
        return this;
      },
    }));
    t.mock.method(Product, 'exists', async () => ({ _id: objectId() }));
    t.mock.method(Order, 'exists', async () => ({ _id: objectId() })); // eligible
    t.mock.method(Review, 'exists', async () => null);

    const req = baseReq({ body: { productId: objectId(), rating: 5, text: 'Nice', hidden: true } });
    const { res, error } = await invoke(createReview, req);

    assert.equal(error, null);
    assert.equal(res.statusCode, 201);

    const createdPayload = createCall.mock.calls[0].arguments[0];
    assert.equal(Object.prototype.hasOwnProperty.call(createdPayload, 'hidden'), false);
    assert.equal(res.body.data.hidden, false);
  });

  test('rejects with 403 when the order has not been delivered yet', async (t) => {
    t.mock.method(Product, 'exists', async () => ({ _id: objectId() }));
    t.mock.method(Order, 'exists', async (filter) => (filter.status === 'delivered' ? null : { _id: objectId() }));

    const req = baseReq();
    const { error } = await invoke(createReview, req);

    assert.ok(error);
    assert.equal(error.statusCode, 403);
    assert.match(error.message, /once your order is delivered/);
  });

  test('rejects with 403 when the product was never purchased', async (t) => {
    t.mock.method(Product, 'exists', async () => ({ _id: objectId() }));
    t.mock.method(Order, 'exists', async () => null);

    const req = baseReq();
    const { error } = await invoke(createReview, req);

    assert.ok(error);
    assert.equal(error.statusCode, 403);
    assert.match(error.message, /have received this product/);
  });

  test('rejects with 404 when the product does not exist', async (t) => {
    t.mock.method(Product, 'exists', async () => null);

    const req = baseReq();
    const { error } = await invoke(createReview, req);

    assert.ok(error);
    assert.equal(error.statusCode, 404);
    assert.match(error.message, /Product not found/);
  });
});

describe('updateReview', () => {
  function makeExistingReview(overrides = {}) {
    return {
      _id: objectId(),
      product: objectId(),
      user: objectId(),
      rating: 3,
      text: 'old text',
      edited: false,
      hidden: true,
      postedAt: new Date('2026-01-01'),
      save: async function save() {
        return this;
      },
      populate: async function populate() {
        this.user = { _id: this.user, name: 'Tester' };
        return this;
      },
      ...overrides,
    };
  }

  test('returns 404 when the review belongs to another user (or does not exist)', async (t) => {
    t.mock.method(Review, 'findOne', async () => null);

    const req = { user: { _id: objectId() }, query: { id: objectId() }, body: { rating: 4, text: 'edit' } };
    const { error } = await invoke(updateReview, req);

    assert.ok(error);
    assert.equal(error.statusCode, 404);
    assert.match(error.message, /Review not found/);
  });

  test('leaves hidden untouched while updating rating/text and setting edited', async (t) => {
    const existing = makeExistingReview({ hidden: true });
    t.mock.method(Review, 'findOne', async () => existing);
    t.mock.method(Order, 'exists', async () => ({ _id: objectId() })); // eligible

    const req = { user: { _id: existing.user }, query: { id: existing._id }, body: { rating: 5, text: 'updated text' } };
    const { res, error } = await invoke(updateReview, req);

    assert.equal(error, null);
    assert.equal(existing.hidden, true, 'hidden must not change on edit');
    assert.equal(existing.rating, 5);
    assert.equal(existing.text, 'updated text');
    assert.equal(existing.edited, true);
    assert.equal(res.body.data.hidden, true);
  });

  test('rejects with 403 when no longer eligible (order deleted/returned)', async (t) => {
    const existing = makeExistingReview();
    t.mock.method(Review, 'findOne', async () => existing);
    t.mock.method(Order, 'exists', async () => null); // not_purchased

    const req = { user: { _id: existing.user }, query: { id: existing._id }, body: { rating: 2, text: '' } };
    const { error } = await invoke(updateReview, req);

    assert.ok(error);
    assert.equal(error.statusCode, 403);
  });
});
