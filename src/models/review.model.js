'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'product', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be a whole number from 1 to 5',
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Comment must be 500 characters or fewer'],
      default: '',
    },
    isVisible: { type: Boolean, default: true },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, isVisible: 1, updatedAt: -1 });
reviewSchema.index({ user: 1 });

module.exports = mongoose.model('review', reviewSchema);
