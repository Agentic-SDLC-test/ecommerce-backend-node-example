'use strict';

const express = require('express');
const {
  getProductReviews,
  getMyReview,
  submitReview,
  getAdminReviews,
  updateReviewVisibility,
  deleteReview,
} = require('../controllers/review.controller');
const { checkAuth, isAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/product-reviews', getProductReviews);
router.get('/my-review', checkAuth, getMyReview);
router.post('/review', checkAuth, submitReview);
router.get('/admin/reviews', isAdmin, getAdminReviews);
router.post('/admin/review-visibility', isAdmin, updateReviewVisibility);
router.post('/admin/delete-review', isAdmin, deleteReview);

module.exports = router;
