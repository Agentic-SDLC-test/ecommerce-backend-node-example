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
        message: 'rating must be an integer',
      },
    },
    text: { type: String, default: '', trim: true, maxlength: 500 },
    hidden: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    postedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

reviewSchema.index({ user: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1, hidden: 1, postedAt: -1 });
reviewSchema.index({ postedAt: -1 });

module.exports = mongoose.model('review', reviewSchema);
