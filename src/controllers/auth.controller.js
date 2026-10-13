'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Review = require('../models/review.model');
const { config } = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

const SALT_ROUNDS = 10;

function generateAuthToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** Remove sensitive fields before returning a user to the client. */
function sanitizeUser(userDoc) {
  const user = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete user.password;
  return user;
}

/**
 * POST /register
 * Body: { email, password, name, userType }
 */
const register = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, message: 'email or password is empty' });
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ ...req.body, password: hashedPassword });

  return res.json({
    success: true,
    message: 'user registered successfully',
    data: sanitizeUser(user),
  });
});

/**
 * POST /login
 * Body: { email, password }
 * Returns the user document (including a freshly-minted `token`) in `data`.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email?.toLowerCase() });
  if (!user) {
    return res.json({
      success: false,
      status: 400,
      message: 'user does not exist with this email and password',
    });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.json({ success: false, status: 400, message: 'user credentials are not correct' });
  }

  const token = generateAuthToken({ _id: user._id, email: user.email });
  user.token = token;
  await user.save();

  return res.json({
    success: true,
    status: 200,
    message: 'user Logged in',
    data: sanitizeUser(user),
  });
});

/**
 * POST /update-user?id=:id
 */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.query;

  const updatedUser = await User.findByIdAndUpdate(id, req.body, { new: true });
  if (!updatedUser) {
    return res.json({ success: false, message: 'user does not exist' });
  }

  return res.json({
    success: true,
    message: 'user updated successfully',
    data: sanitizeUser(updatedUser),
  });
});

/**
 * GET /user?id=:id
 */
const userById = asyncHandler(async (req, res) => {
  const { id } = req.query;

  const user = await User.findById(id).select('-password');
  if (!user) {
    return res.json({ success: false, message: 'user does not exist' });
  }

  return res.json({ success: true, message: 'user found', data: user });
});

/**
 * GET /delete-user?id=:id
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.query;

  const deleted = await User.findByIdAndDelete(id);
  if (!deleted) {
    return res.json({ success: false, message: 'user does not exist' });
  }

  const { deletedCount } = await Review.deleteMany({ user: deleted._id });
  logger.info(`reviews.purged reason=user_deleted id=${deleted._id} count=${deletedCount}`);

  return res.json({ success: true, message: 'user deleted successfully' });
});

/**
 * POST /reset-password?id=:id
 * Body: { password, newPassword }
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { password, newPassword } = req.body;
  const { id } = req.query;

  if (!password || !newPassword || !id) {
    return res.json({ success: false, message: 'Fields are empty' });
  }

  const user = await User.findById(id);
  if (!user) {
    return res.json({ success: false, message: 'user does not exist' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.json({ success: false, message: 'wrong password' });
  }

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  return res.json({ success: true, message: 'password updated successfully' });
});

module.exports = {
  register,
  login,
  updateUser,
  userById,
  deleteUser,
  resetPassword,
};
