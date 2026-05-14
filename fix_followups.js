import mongoose from 'mongoose';
import { Followup } from './src/modules/shiprocket/models/followup.model.js';
import { Order } from './src/modules/shiprocket/models/order.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function fixBacklog() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all incomplete followups scheduled before today
  const past = await Followup.find({ scheduled_date: { $lt: today }, completed: false });
  console.log(`Found ${past.length} past followups to mark as done.`);
  
  let count = 0;
  for(const fu of past) {
    fu.completed = true;
    fu.completed_at = new Date();
    await fu.save();
    count++;
  }
  
  // Update next_follow_up for affected orders
  const orderIds = [...new Set(past.map(f => String(f.order_id)))];
  console.log(`Updating next_follow_up for ${orderIds.length} orders...`);
  
  for(const oid of orderIds) {
    const next = await Followup.findOne({ order_id: oid, completed: false }).sort({ followup_number: 1 });
    await Order.findByIdAndUpdate(oid, { next_follow_up: next ? next.scheduled_date : null });
  }
  
  console.log('Successfully completed backlog cleanup!');
  process.exit(0);
}

fixBacklog().catch(console.error);
