import mongoose from 'mongoose';

const verificationSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, unique: true },
    title: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    dueDate: { type: Date },
    cityVillageType: { type: String, enum: ['city', 'village'], default: 'city' },
    cityVillage: { type: String },
    houseNo: { type: String },
    postOffice: { type: String },
    district: { type: String },
    landmark: { type: String },
    pincode: { type: String },
    state: { type: String },
    address: { type: String },
    notes: [{ text: String, createdAt: { type: Date, default: Date.now } }],
    description: { type: String },
    reminderAt: { type: Date },
    status: { type: String, enum: ['pending', 'verified', 'rejected', 'on_hold'], default: 'pending' },
    onHoldUntil: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('Verification', verificationSchema);
