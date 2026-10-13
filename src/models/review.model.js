'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'product', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    reviewerName: { type: String, required: true, trim: true },
    productTitle: { type: String, default: '' },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer between 1 and 5',
      },
    },
    comment: { type: String, default: '', trim: true, maxlength: [500, 'Comment must be at most 500 characters'] },
    visible: { type: Boolean, default: true },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, visible: 1, createdAt: -1 });

module.exports = mongoose.model('review', reviewSchema);
