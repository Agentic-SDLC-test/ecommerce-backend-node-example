'use strict';

const express = require('express');
const {
  getProductReviews,
  createReview,
  updateReview,
  getAdminReviews,
  setReviewVisibility,
  deleteReview,
} = require('../controllers/review.controller');
const { checkAuth, isAdmin, optionalAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/products/:id/reviews', optionalAuth, getProductReviews);
router.post('/reviews', checkAuth, createReview);
router.post('/reviews/:id/update', checkAuth, updateReview);
router.get('/admin/reviews', isAdmin, getAdminReviews);
router.post('/admin/reviews/:id/visibility', isAdmin, setReviewVisibility);
router.post('/admin/reviews/:id/delete', isAdmin, deleteReview);

module.exports = router;
