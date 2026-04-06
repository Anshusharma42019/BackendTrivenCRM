import mongoose from 'mongoose';

const verificationSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, unique: true },
    title: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    dueDate: { type: Date },
    address: { type: String },
    notes: [{ text: String, createdAt: { type: Date, default: Date.now } }],
    status: { type: String, enum: ['pending', 'verified', 'rejected', 'on_hold'], default: 'pending' },
  },
  { timestamps: true }
);

export default mongoose.model('Verification', verificationSchema);
