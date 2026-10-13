'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../src/app');
const User = require('../src/models/user.model');
const Product = require('../src/models/product.model');
const Order = require('../src/models/order.model');
const Review = require('../src/models/review.model');

function tokenFor(user) {
  return jwt.sign({ _id: user._id, email: user.email }, process.env.TOKEN_KEY);
}

async function createUser(overrides = {}) {
  return User.create({
    name: 'Jane Smith',
    email: `jane-${new mongoose.Types.ObjectId()}@example.com`,
    password: 'hashed-password',
    userType: 'USER',
    ...overrides,
  });
}

async function createProduct(overrides = {}) {
  return Product.create({ title: 'Organic Basmati Rice', sku: 'rice-1', price: 10, ...overrides });
}

async function createOrder({ user, product, status }) {
  return Order.create({
    user: user._id,
    status,
    items: [{ productId: product._id, quantity: 1, price: product.price }],
    amount: product.price,
  });
}

describe('reviews', () => {
  describe('POST /review', () => {
    test('rejects a request without a token', async () => {
      const res = await request(app).post('/review').send({ productId: new mongoose.Types.ObjectId(), rating: 5 });
      expect(res.status).toBe(400);
    });

    test('rejects a request with an invalid token', async () => {
      const res = await request(app)
        .post('/review')
        .set('x-auth-token', 'not-a-real-token')
        .send({ productId: new mongoose.Types.ObjectId(), rating: 5 });
      expect(res.status).toBe(401);
    });

    test('403s when the user has no order for the product', async () => {
      const user = await createUser();
      const product = await createProduct();

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 5 });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Only customers with a delivered order for this product can review it');
    });

    test.each(['pending', 'shipped'])('403s when the order is only %s', async (status) => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status });

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 4 });

      expect(res.status).toBe(403);
    });

    test('201s when the user has a delivered order for the product', async () => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 5, comment: 'Loved it' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('review submitted');
      expect(res.body.data.rating).toBe(5);
    });

    test('rating-only submission succeeds', async () => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 3 });

      expect(res.status).toBe(201);
      expect(res.body.data.comment).toBe('');
    });

    test('a second submission edits the existing review instead of creating a new one', async () => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });

      const first = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 3, comment: 'Okay' });

      const second = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 5, comment: 'Actually great' });

      expect(second.status).toBe(200);
      expect(second.body.message).toBe('review updated');
      expect(second.body.data._id).toBe(first.body.data._id);
      await expect(Review.countDocuments({ product: product._id, user: user._id })).resolves.toBe(1);
    });

    test.each([0, 6, 3.5, '5', undefined])('rejects an invalid rating %p', async (rating) => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating });

      expect(res.status).toBe(400);
    });

    test('rejects a comment over 500 characters', async () => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 4, comment: 'a'.repeat(501) });

      expect(res.status).toBe(400);
    });

    test('accepts a comment of exactly 500 characters', async () => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 4, comment: 'a'.repeat(500) });

      expect(res.status).toBe(201);
    });

    test('404s for a product that does not exist', async () => {
      const user = await createUser();

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: new mongoose.Types.ObjectId(), rating: 4 });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('product does not exist');
    });

    test('400s for a malformed productId', async () => {
      const user = await createUser();

      const res = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: 'not-an-id', rating: 4 });

      expect(res.status).toBe(400);
    });

    test('editing a hidden review keeps it hidden', async () => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });

      const created = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 2, comment: 'meh' });

      await Review.findByIdAndUpdate(created.body.data._id, { isVisible: false });

      const edited = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 4, comment: 'better now' });

      expect(edited.status).toBe(200);
      expect(edited.body.data.isVisible).toBe(false);
    });
  });

  describe('GET /product-reviews', () => {
    test('returns a null average and zero count for a product with no reviews', async () => {
      const product = await createProduct();

      const res = await request(app).get('/product-reviews').query({ productId: product._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.summary).toEqual({
        average: null,
        count: 0,
        distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      });
      expect(res.body.data.reviews).toEqual([]);
    });

    test('computes the average, distribution, and recent reviews from visible reviews', async () => {
      const product = await createProduct();
      const [u1, u2, u3] = await Promise.all([createUser(), createUser(), createUser()]);
      await Promise.all([u1, u2, u3].map((u) => createOrder({ user: u, product, status: 'delivered' })));

      await request(app).post('/review').set('x-auth-token', tokenFor(u1)).send({ productId: product._id, rating: 5, comment: 'Excellent' });
      await request(app).post('/review').set('x-auth-token', tokenFor(u2)).send({ productId: product._id, rating: 4, comment: 'Good' });
      await request(app).post('/review').set('x-auth-token', tokenFor(u3)).send({ productId: product._id, rating: 4, comment: 'Also good' });

      const res = await request(app).get('/product-reviews').query({ productId: product._id.toString() });

      expect(res.body.data.summary).toEqual({
        average: 4.3,
        count: 3,
        distribution: { '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 },
      });
      expect(res.body.data.reviews).toHaveLength(3);
      expect(res.body.data.reviews[0]).toMatchObject({ verifiedPurchase: true, reviewerName: 'Jane S.' });
      res.body.data.reviews.forEach((review) => {
        expect(review.user).toBeUndefined();
        expect(review.email).toBeUndefined();
      });
    });

    test('excludes hidden reviews from the summary and the recent list', async () => {
      const product = await createProduct();
      const user = await createUser();
      await createOrder({ user, product, status: 'delivered' });
      const created = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 5, comment: 'Great' });
      await Review.findByIdAndUpdate(created.body.data._id, { isVisible: false });

      const res = await request(app).get('/product-reviews').query({ productId: product._id.toString() });

      expect(res.body.data.summary.count).toBe(0);
      expect(res.body.data.reviews).toEqual([]);
    });

    test('rating-only reviews count toward the summary but are absent from the written review list', async () => {
      const product = await createProduct();
      const user = await createUser();
      await createOrder({ user, product, status: 'delivered' });
      await request(app).post('/review').set('x-auth-token', tokenFor(user)).send({ productId: product._id, rating: 4 });

      const res = await request(app).get('/product-reviews').query({ productId: product._id.toString() });

      expect(res.body.data.summary.count).toBe(1);
      expect(res.body.data.reviews).toEqual([]);
    });

    test('caps the recent list at 5, newest updated first', async () => {
      const product = await createProduct();
      const users = await Promise.all(Array.from({ length: 6 }, () => createUser()));
      await Promise.all(users.map((u) => createOrder({ user: u, product, status: 'delivered' })));

      for (let i = 0; i < users.length; i += 1) {
        await request(app)
          .post('/review')
          .set('x-auth-token', tokenFor(users[i]))
          .send({ productId: product._id, rating: 5, comment: `Review number ${i}` });
      }

      const res = await request(app).get('/product-reviews').query({ productId: product._id.toString() });

      expect(res.body.data.reviews).toHaveLength(5);
      expect(res.body.data.reviews[0].comment).toBe('Review number 5');
    });

    test('400s when productId is missing', async () => {
      const res = await request(app).get('/product-reviews');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /my-review', () => {
    test('reports eligibility and the caller\'s own hidden review', async () => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });
      const created = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 3 });
      await Review.findByIdAndUpdate(created.body.data._id, { isVisible: false });

      const res = await request(app).get('/my-review').set('x-auth-token', tokenFor(user)).query({ productId: product._id.toString() });

      expect(res.body.data.eligible).toBe(true);
      expect(res.body.data.review.isVisible).toBe(false);
    });

    test('reports ineligible when the user has no delivered order', async () => {
      const user = await createUser();
      const product = await createProduct();

      const res = await request(app).get('/my-review').set('x-auth-token', tokenFor(user)).query({ productId: product._id.toString() });

      expect(res.body.data).toEqual({ eligible: false, review: null });
    });
  });

  describe('admin moderation', () => {
    test('non-admins are rejected on all three admin endpoints', async () => {
      const user = await createUser();
      const token = tokenFor(user);

      const results = await Promise.all([
        request(app).get('/admin/reviews').set('x-auth-token', token),
        request(app).post('/admin/review-visibility').set('x-auth-token', token).send({ reviewId: new mongoose.Types.ObjectId(), isVisible: false }),
        request(app).post('/admin/delete-review').set('x-auth-token', token).send({ reviewId: new mongoose.Types.ObjectId() }),
      ]);

      results.forEach((res) => expect(res.status).toBe(403));
    });

    test('hide then restore round-trips, and delete lets the customer review again', async () => {
      const admin = await createUser({ userType: 'ADMIN' });
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });
      const created = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 5 });
      const reviewId = created.body.data._id;
      const adminToken = tokenFor(admin);

      const hidden = await request(app)
        .post('/admin/review-visibility')
        .set('x-auth-token', adminToken)
        .send({ reviewId, isVisible: false });
      expect(hidden.status).toBe(200);
      expect(hidden.body.message).toBe('review hidden');

      const restored = await request(app)
        .post('/admin/review-visibility')
        .set('x-auth-token', adminToken)
        .send({ reviewId, isVisible: true });
      expect(restored.status).toBe(200);
      expect(restored.body.message).toBe('review restored');

      const deleted = await request(app).post('/admin/delete-review').set('x-auth-token', adminToken).send({ reviewId });
      expect(deleted.status).toBe(200);

      const resubmitted = await request(app)
        .post('/review')
        .set('x-auth-token', tokenFor(user))
        .send({ productId: product._id, rating: 4 });
      expect(resubmitted.status).toBe(201);
    });
  });

  describe('checkout hardening', () => {
    test('ignores a client-supplied delivered status', async () => {
      const user = await createUser();
      const product = await createProduct({ quantity: 5 });

      const res = await request(app)
        .post('/checkout')
        .set('x-auth-token', tokenFor(user))
        .send({
          status: 'delivered',
          shippedOn: '2020-01-01',
          deliveredOn: '2020-01-02',
          items: [{ productId: product._id, quantity: 1, price: product.price }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.shippedOn).toBeUndefined();
      expect(res.body.data.deliveredOn).toBeUndefined();
    });
  });

  describe('cleanup on deletion', () => {
    test('deleting a user removes their reviews', async () => {
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });
      await request(app).post('/review').set('x-auth-token', tokenFor(user)).send({ productId: product._id, rating: 5 });

      await request(app).get('/delete-user').query({ id: user._id.toString() });

      await expect(Review.countDocuments({ user: user._id })).resolves.toBe(0);
    });

    test('deleting a product removes its reviews', async () => {
      const admin = await createUser({ userType: 'ADMIN' });
      const user = await createUser();
      const product = await createProduct();
      await createOrder({ user, product, status: 'delivered' });
      await request(app).post('/review').set('x-auth-token', tokenFor(user)).send({ productId: product._id, rating: 5 });

      await request(app)
        .get('/delete-product')
        .set('x-auth-token', tokenFor(admin))
        .query({ id: product._id.toString() });

      await expect(Review.countDocuments({ product: product._id })).resolves.toBe(0);
    });
  });
});
