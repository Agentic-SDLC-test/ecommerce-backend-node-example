'use strict';

const express = require('express');
const {
  dashboardData,
  getAllUsers,
  getAllOrders,
  changeStatusOfOrder,
  getAllReviews,
  setReviewVisibility,
  deleteReview,
} = require('../controllers/admin.controller');
const { isAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/dashboard', isAdmin, dashboardData);
router.get('/admin/orders', isAdmin, getAllOrders);
router.get('/admin/order-status', isAdmin, changeStatusOfOrder);
router.get('/admin/users', isAdmin, getAllUsers);
router.get('/admin/reviews', isAdmin, getAllReviews);
router.post('/admin/review-visibility', isAdmin, setReviewVisibility);
router.post('/admin/delete-review', isAdmin, deleteReview);

module.exports = router;
