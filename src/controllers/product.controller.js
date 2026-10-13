'use strict';

const Product = require('../models/product.model');
const Review = require('../models/review.model');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * GET /products?search=:term
 * Returns products (optionally filtered by title) with the category populated.
 * Response: { success, status, message, data: Product[] }
 */
const getAllProducts = asyncHandler(async (req, res) => {
  const search = req.query.search || '';

  const products = await Product.find({
    title: { $regex: search, $options: 'i' },
  }).populate('category');

  return res.json({
    success: true,
    status: 200,
    message: 'list of products',
    data: products,
  });
});

/**
 * POST /product   (admin)
 * Body: { title, sku, price, image, description, category, quantity }
 */
const addProduct = asyncHandler(async (req, res) => {
  const { title, sku, price } = req.body;

  if (!title || !sku || !price) {
    return res.json({ success: false, message: 'Fields are empty' });
  }

  const product = await Product.create(req.body);

  return res.json({
    success: true,
    message: 'Product inserted successfully',
    data: product,
  });
});

/**
 * POST /update-product?id=:id   (admin)
 */
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.query;

  const updatedProduct = await Product.findByIdAndUpdate(id, req.body, { new: true });
  if (!updatedProduct) {
    return res.json({ success: false, status: 400, message: 'product does not exist' });
  }

  return res.json({
    success: true,
    status: 200,
    message: 'product updated successfully',
    data: updatedProduct,
  });
});

/**
 * GET /delete-product?id=:id   (admin)
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.query;

  const product = await Product.findByIdAndDelete(id);
  if (!product) {
    return res.json({ success: false, message: 'product does not exist' });
  }

  const { deletedCount } = await Review.deleteMany({ product: product._id });
  logger.info(`reviews.purged reason=product_deleted id=${product._id} count=${deletedCount}`);

  return res.json({ success: true, message: 'product deleted successfully' });
});

module.exports = {
  getAllProducts,
  addProduct,
  updateProduct,
  deleteProduct,
};
