'use strict';

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'product' },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'categories' },
        quantity: { type: Number },
        price: { type: Number },
      },
    ],
    amount: { type: Number },
    discount: { type: Number },
    shippingAddress: { type: String },
    status: { type: String, enum: ['pending', 'shipped', 'delivered'], default: 'pending' },
    country: { type: String },
    city: { type: String },
    zipcode: { type: String },
    payment_type: { type: String, enum: ['cod', 'online'] },
    shippedOn: { type: String },
    deliveredOn: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('order', orderSchema);
