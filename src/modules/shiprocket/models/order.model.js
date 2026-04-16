import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  name: String, sku: String, units: Number,
  selling_price: mongoose.Schema.Types.Mixed,
  discount: String, tax: String, hsn: String,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  shiprocket_order_id: { type: Number, unique: true, sparse: true, index: true },
  shiprocket_shipment_id: { type: Number, index: true },
  order_id: { type: String, unique: true, sparse: true },
  order_date: String,
  status: { type: String, default: 'NEW' },
  status_code: Number,
  awb_code: String,
  courier_id: Number,
  courier_name: String,
  pickup_location: String,
  billing_customer_name: String,
  billing_phone: String,
  billing_email: String,
  billing_address: String,
  billing_city: String,
  billing_state: String,
  billing_pincode: mongoose.Schema.Types.Mixed,
  billing_country: { type: String, default: 'India' },
  shipping_is_billing: { type: Boolean, default: true },
  shipping_address: String,
  shipping_city: String,
  shipping_state: String,
  shipping_pincode: mongoose.Schema.Types.Mixed,
  order_items: [orderItemSchema],
  payment_method: String,
  sub_total: Number,
  length: Number, breadth: Number, height: Number, weight: Number,
  lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  follow_ups: [{
    date: Date,
    note: String,
    auto: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }],
  next_follow_up: Date,
  delivered_at: { type: Date, index: true },
  auto_followups_set: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  raw_response: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

export const Order = mongoose.model('ShiprocketOrder', orderSchema);
