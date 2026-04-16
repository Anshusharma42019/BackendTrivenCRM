import mongoose from 'mongoose';

const returnSchema = new mongoose.Schema({
  shiprocket_order_id: { type: Number, index: true },
  shiprocket_shipment_id: Number,
  order_id: { type: String, index: true },
  awb_code: String,
  status: { type: String, default: 'RETURN_INITIATED' },
  return_reason: String,
  raw_response: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

export const Return = mongoose.model('ShiprocketReturn', returnSchema);
