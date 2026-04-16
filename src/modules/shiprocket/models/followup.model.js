import mongoose from 'mongoose';

const followupSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiprocketOrder', required: true, index: true },
  followup_number: { type: Number, required: true }, // 1 to 5
  scheduled_date: { type: Date, required: true },
  completed: { type: Boolean, default: false },
  completed_at: { type: Date },
  note: { type: String, default: '' },
}, { timestamps: true });

followupSchema.index({ order_id: 1, followup_number: 1 }, { unique: true });

export const Followup = mongoose.model('Followup', followupSchema);
export default Followup;
