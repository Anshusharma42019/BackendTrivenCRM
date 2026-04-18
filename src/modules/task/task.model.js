import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    problem: { type: String },
    type: {
      type: String,
      enum: ['call', 'follow_up', 'meeting', 'email', 'task'],
      default: 'task',
    },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'completed', 'overdue', 'cancelled', 'verification', 'cnp', 'interested', 'cancel_call', 'ready_to_shipment'],
      default: 'pending',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    reminderAt: { type: Date },
    cityVillageType: { type: String, enum: ['city', 'village'], default: 'city' },
    cityVillage: { type: String },
    houseNo: { type: String },
    postOffice: { type: String },
    district: { type: String },
    landmark: { type: String },
    pincode: { type: String },
    state: { type: String },
    address: { type: String },
    phone: { type: String },
    age: { type: Number },
    weight: { type: Number },
    height: { type: Number },
    otherProblems: { type: String },
    problemDuration: { type: String },
    price: { type: Number },
    notes: [{
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

taskSchema.index({ assignedTo: 1, dueDate: 1, status: 1 });

taskSchema.set('toJSON', {
  transform: (doc, ret) => { delete ret.__v; return ret; },
});

export const Task = mongoose.model('Task', taskSchema);
export default Task;
