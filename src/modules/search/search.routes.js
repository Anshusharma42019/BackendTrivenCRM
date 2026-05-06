import express from 'express';
import auth from '../../middleware/auth.js';
import catchAsync from '../../utils/catchAsync.js';
import ApiResponse from '../../utils/ApiResponse.js';
import Lead from '../lead/lead.model.js';
import { Order } from '../shiprocket/models/order.model.js';
import { Task } from '../task/task.model.js';
import httpStatus from 'http-status';

const router = express.Router();

router.get('/', auth('admin', 'manager', 'sales'), catchAsync(async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 3) {
    return res.json(new ApiResponse(httpStatus.OK, [], 'Search results'));
  }

  const regex = new RegExp(q.trim(), 'i');

  const [leads, orders, tasks] = await Promise.all([
    Lead.find({ isDeleted: false, $or: [{ name: regex }, { phone: regex }, { email: regex }] })
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 }).limit(5).lean(),

    Order.find({ $or: [{ billing_customer_name: regex }, { billing_phone: regex }, { order_id: regex }, { awb_code: regex }] })
      .sort({ createdAt: -1 }).limit(5).lean(),

    Task.find({ isDeleted: false, $or: [{ title: regex }, { phone: regex }] })
      .populate('assignedTo', 'name').populate('lead', 'name phone')
      .sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  const results = [
    ...leads.map(l => ({ type: 'lead', _id: l._id, title: l.name, subtitle: l.phone, meta: l.status, assignedTo: l.assignedTo?.name, createdAt: l.createdAt })),
    ...orders.map(o => ({ type: 'order', _id: o._id, title: o.billing_customer_name, subtitle: o.billing_phone, meta: o.status, orderId: o.order_id, awb: o.awb_code, createdAt: o.createdAt })),
    ...tasks.map(t => ({ type: 'task', _id: t._id, title: t.title, subtitle: t.phone || t.lead?.phone, meta: t.status, assignedTo: t.assignedTo?.name, createdAt: t.createdAt })),
  ];

  res.json(new ApiResponse(httpStatus.OK, results, 'Search results'));
}));

export default router;
