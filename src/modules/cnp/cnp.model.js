import mongoose from 'mongoose';

const cnpSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, unique: true },
    title: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    dueDate: { type: Date },
    address: { type: String },
    notes: [{ text: String, createdAt: { type: Date, default: Date.now } }],
    cnpCount: { type: Number, default: 1 },
    lastCnpAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('Cnp', cnpSchema);
