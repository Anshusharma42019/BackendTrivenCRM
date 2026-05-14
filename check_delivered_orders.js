import mongoose from 'mongoose';
import { Order } from './src/modules/shiprocket/models/order.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log('Connected to MongoDB');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 4 for May

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  console.log(`Checking for month: ${month} (May), Year: ${year}`);
  console.log(`Range: ${monthStart.toISOString()} to ${monthEnd.toISOString()}`);

  const totalOrders = await Order.countDocuments({});
  console.log(`Total orders in DB: ${totalOrders}`);

  const deliveredInMonth = await Order.find({
    status: { $in: ['DELIVERED', 'Delivered', 'delivered'] },
    $or: [
      { delivered_at: { $gte: monthStart, $lte: monthEnd } },
      { delivered_at: null, status_updated_at: { $gte: monthStart, $lte: monthEnd } },
    ],
  }).lean();

  console.log(`Delivered orders in May 2026: ${deliveredInMonth.length}`);

  if (deliveredInMonth.length > 0) {
    console.log('Sample order:');
    const o = deliveredInMonth[0];
    console.log({
      order_id: o.order_id,
      status: o.status,
      sub_total: o.sub_total,
      delivered_at: o.delivered_at,
      status_updated_at: o.status_updated_at,
      createdAt: o.createdAt
    });

    const totalRevenue = deliveredInMonth.reduce((acc, o) => acc + (o.sub_total || 0), 0);
    console.log(`Calculated Total Revenue: ${totalRevenue}`);
  } else {
    console.log('No delivered orders found in this range.');
    const anyDelivered = await Order.find({ status: /delivered/i }).limit(5).lean();
    console.log(`Found ${anyDelivered.length} total delivered orders across all time.`);
    anyDelivered.forEach(o => {
       console.log(`Order ${o.order_id}: status=${o.status}, delivered_at=${o.delivered_at}, status_updated_at=${o.status_updated_at}, createdAt=${o.createdAt}`);
    });
  }

  await mongoose.disconnect();
}

check().catch(console.error);
