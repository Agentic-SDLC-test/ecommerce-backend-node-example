'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const User = require('../models/user.model');

/**
 * Extract the JWT from the request.
 * The React Native client sends the token in the `x-auth-token` header, but we
 * also accept it via body/query for backwards compatibility with older clients.
 */
function extractToken(req) {
  return req.headers['x-auth-token'] || req.body.token || req.query.token;
}

/**
 * Requires a valid JWT. Populates `req.user` with the decoded payload and the
 * loaded user document.
 *
 * IMPORTANT: On failure this returns `{ msg, err }` with `err` set to the JWT
 * error message (e.g. "jwt expired"). The mobile client relies on the exact
 * `err: "jwt expired"` string to trigger a logout, so do not change this shape.
 */
async function checkAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(400).json({ msg: 'No Auth Token Found', err: 'No Auth Token Found' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;

    const user = await User.findOne({ _id: decoded?._id }).select('-password');
    if (!user) {
      return res.status(401).json({ msg: 'Authentication failed', err: 'Authentication failed' });
    }

    req.currentUser = user;
    return next();
  } catch (error) {
    return res.status(401).json({ msg: 'Invalid User Auth Token', err: error.message });
  }
}

/**
 * Requires a valid JWT belonging to a user with `userType: "ADMIN"`.
 */
async function isAdmin(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(400).json({ msg: 'No Auth Token Found', err: 'No Auth Token Found' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;

    const user = await User.findOne({ _id: decoded?._id, userType: 'ADMIN' }).select('-password');
    if (!user) {
      return res.status(403).json({ msg: 'Insufficient User Permissions', err: 'Insufficient User Permissions' });
    }

    req.currentUser = user;
    return next();
  } catch (error) {
    return res.status(401).json({ msg: 'Invalid User Auth Token', err: error.message });
  }
}

/**
 * Resolves a valid JWT to `req.currentUser` / `req.user` when present, and
 * continues anonymously (never responds 401) on a missing or invalid token.
 * Used by public reads that personalize their response for a signed-in caller.
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findOne({ _id: decoded?._id }).select('-password');
    if (user) {
      req.user = decoded;
      req.currentUser = user;
    }
    return next();
  } catch (error) {
    return next();
  }
}

module.exports = { checkAuth, isAdmin, optionalAuth, extractToken };
