'use strict';

const express = require('express');
const {
  getProductReviews,
  getMyReview,
  createReview,
  updateReview,
} = require('../controllers/review.controller');
const { checkAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/product-reviews', getProductReviews);
router.get('/my-review', checkAuth, getMyReview);
router.post('/review', checkAuth, createReview);
router.post('/update-review', checkAuth, updateReview);

module.exports = router;
