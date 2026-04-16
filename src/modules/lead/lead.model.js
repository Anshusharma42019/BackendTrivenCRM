import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    source: {
      type: String,
      enum: ['website', 'referral', 'social_media', 'cold_call', 'email', 'walk_in', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'interested', 'follow_up', 'closed_won', 'closed_lost', 'on_hold'],
      default: 'new',
    },
    note: { type: String },
    notes: [{ text: { type: String }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, createdAt: { type: Date, default: Date.now } }],
    problem: { type: String },
    type: {
      type: String,
      enum: ['general', 'ayurveda', 'panchakarma', 'consultation', 'product', 'other'],
      default: 'general',
    },
    revenue: { type: Number, default: 0 },
    cnp: { type: Boolean, default: false },
    cnpCount: { type: Number, default: 0 },
    cnpAt: { type: Date },
    follow_ups: [{
      date: { type: Date, default: Date.now },
      note: String,
      next_date: Date,
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],
    next_follow_up: Date,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

leadSchema.index({ status: 1, assignedTo: 1, createdAt: -1 });
leadSchema.index({ name: 'text', phone: 'text', email: 'text' });

leadSchema.set('toJSON', {
  transform: (doc, ret) => { delete ret.__v; return ret; },
});

export const Lead = mongoose.model('Lead', leadSchema);
export default Lead;
