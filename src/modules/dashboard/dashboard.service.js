import Lead from '../lead/lead.model.js';
import Task from '../task/task.model.js';
import { Order } from '../shiprocket/models/order.model.js';
import Verification from '../verification/verification.model.js';
import StaffTarget from './staffTarget.model.js';
import Cnp from '../cnp/cnp.model.js';
import CallAgain from '../callagain/callagain.model.js';
import mongoose from 'mongoose';

const todayDateStr = () => new Date().toISOString().slice(0, 10);

export const getStaffStats = async (userId) => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const todayStart = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET);
  const monthStart = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - IST_OFFSET);
  const uid = new mongoose.Types.ObjectId(userId);

  const [todayVerifications, monthVerifications, pendingTasks, targetDoc,
    todayCnp, todayCallAgain, todayInterested, todayNotInterested] = await Promise.all([
    Verification.countDocuments({ assignedTo: uid, createdAt: { $gte: todayStart } }),
    Verification.countDocuments({ assignedTo: uid, createdAt: { $gte: monthStart } }),
    Task.countDocuments({ assignedTo: uid, status: 'pending', isDeleted: false }),
    StaffTarget.findOne({ user: uid, date: todayDateStr() }),
    Cnp.countDocuments({}),
    CallAgain.countDocuments({}),
    Task.countDocuments({ status: 'interested', isDeleted: false }),
    Task.countDocuments({ status: 'cancel_call', isDeleted: false }),
  ]);

  return {
    todayVerifications,
    monthVerifications,
    pendingTasks,
    todayTarget: targetDoc?.target || 0,
    todayCnp,
    todayCallAgain,
    todayInterested,
    todayNotInterested,
  };
};

export const setStaffTarget = async (userId, target) => {
  const date = todayDateStr();
  console.log('[setStaffTarget] userId:', userId, 'date:', date, 'target:', target);
  let doc = await StaffTarget.findOne({ user: userId, date });
  if (doc) {
    doc.target = Number(target);
    await doc.save();
  } else {
    doc = await StaffTarget.create({ user: userId, date, target: Number(target) });
  }
  console.log('[setStaffTarget] saved:', doc);
  return { todayTarget: doc.target };
};

export const getStaffTodayLists = async (userId) => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const todayStart = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET);
  const uid = new mongoose.Types.ObjectId(userId);

  const [cnpList, callAgainList, interestedList, notInterestedList] = await Promise.all([
    Cnp.find({})
      .populate('lead', 'name phone').populate('assignedTo', 'name').sort({ createdAt: -1 }).limit(50).lean(),
    CallAgain.find({})
      .populate('lead', 'name phone').populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(50).lean(),
    Task.find({ status: 'interested', isDeleted: false })
      .populate('lead', 'name phone').sort({ updatedAt: -1 }).limit(50).lean(),
    Task.find({ status: 'cancel_call', isDeleted: false })
      .populate('lead', 'name phone').sort({ updatedAt: -1 }).limit(50).lean(),
  ]);

  return { cnpList, callAgainList, interestedList, notInterestedList };
};

export const getStaffMonthlyChart = async (userId) => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const monthStart = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - IST_OFFSET);

  const data = await Verification.aggregate([
    { $match: { createdAt: { $gte: monthStart } } },
    { $group: { _id: { $dayOfMonth: '$createdAt' }, count: { $sum: 1 } } },
    { $sort: { '_id': 1 } },
  ]);

  const daysInMonth = new Date(nowIST.getUTCFullYear(), nowIST.getUTCMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const found = data.find(d => d._id === day);
    return { day, count: found?.count || 0 };
  });
};

export const getStaffVerifications = async (userId) => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const todayStart = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET);
  const uid = new mongoose.Types.ObjectId(userId);

  return Verification.find({ assignedTo: uid, createdAt: { $gte: todayStart } })
    .populate('lead', 'name phone status')
    .sort({ createdAt: -1 })
    .lean();
};

export const getAllStaffStats = async () => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const todayStart = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_OFFSET);
  const monthStart = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - IST_OFFSET);
  const dateStr = todayDateStr();

  const User = (await import('../user/user.model.js')).default;
  const salesUsers = await User.find({ role: 'sales', isDeleted: false }).select('_id name phone role').lean();

  const stats = await Promise.all(salesUsers.map(async (u) => {
    const uid = new mongoose.Types.ObjectId(u._id);
    const [todayVerifications, monthVerifications, pendingTasks, targetDoc,
      todayCnp, todayCallAgain, todayInterested, todayNotInterested] = await Promise.all([
      Verification.countDocuments({ assignedTo: uid, createdAt: { $gte: todayStart } }),
      Verification.countDocuments({ assignedTo: uid, createdAt: { $gte: monthStart } }),
      Task.countDocuments({ assignedTo: uid, status: 'pending', isDeleted: false }),
      StaffTarget.findOne({ user: uid, date: dateStr }).lean(),
      Cnp.countDocuments({ assignedTo: uid, createdAt: { $gte: todayStart } }),
      CallAgain.countDocuments({ assignedTo: uid, updatedAt: { $gte: todayStart } }),
      Task.countDocuments({ assignedTo: uid, status: 'interested', isDeleted: false, updatedAt: { $gte: todayStart } }),
      Task.countDocuments({ assignedTo: uid, status: 'cancel_call', isDeleted: false, updatedAt: { $gte: todayStart } }),
    ]);
    return {
      user: u,
      todayVerifications,
      monthVerifications,
      pendingTasks,
      todayTarget: targetDoc?.target || 0,
      todayCnp,
      todayCallAgain,
      todayInterested,
      todayNotInterested,
    };
  }));

  return stats;
};

export const getDashboardStats = async (userRole, userId) => {
  // For countDocuments — plugin auto-adds isDeleted:false
  const countFilter = {};
  // For aggregate — plugin does NOT apply, must be explicit
  const aggMatch = { isDeleted: false };

  if (userRole === 'sales') {
    countFilter.assignedTo = userId;
    aggMatch.assignedTo = userId;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalLeads,
    newLeadsToday,
    convertedLeads,
    readyToShipmentCount,
    revenueResult,
    funnelData,
    sourceData,
    pendingTasks,
    overdueTasks,
  ] = await Promise.all([
    Lead.countDocuments(countFilter),

    Lead.countDocuments({ ...countFilter, createdAt: { $gte: todayStart } }),

    Lead.countDocuments({ ...countFilter, status: 'closed_won' }),

    Task.countDocuments({ status: 'ready_to_shipment', isDeleted: false }),

    Lead.aggregate([
      { $match: { ...aggMatch, status: 'closed_won' } },
      { $group: { _id: null, total: { $sum: '$revenue' } } },
    ]),


    Lead.aggregate([
      { $match: aggMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),

    Lead.aggregate([
      { $match: aggMatch },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    Task.countDocuments({
      status: 'pending',
      ...(userRole === 'sales' ? { assignedTo: userId } : {}),
    }),

    Task.countDocuments({
      status: 'overdue',
      ...(userRole === 'sales' ? { assignedTo: userId } : {}),
    }),
  ]);

  const stageOrder = ['new', 'contacted', 'interested', 'follow_up', 'closed_won', 'closed_lost'];
  const funnelMap = Object.fromEntries(funnelData.map((f) => [f._id, f.count]));
  const salesFunnel = stageOrder.map((stage) => ({ stage, count: funnelMap[stage] || 0 }));

  const sourcePerformance = sourceData.map((s) => ({
    source: s._id || 'other',
    count: s.count,
    percentage: totalLeads ? Math.round((s.count / totalLeads) * 100) : 0,
  }));



  return {
    totalLeads,
    newLeadsToday,
    convertedLeads,
    readyToShipmentCount,
    revenue: revenueResult[0]?.total || 0,
    conversionRate: totalLeads ? Math.round((convertedLeads / totalLeads) * 100) : 0,
    salesFunnel,
    sourcePerformance,
    tasks: { pending: pendingTasks, overdue: overdueTasks },
  };
};

export const getRevenueChart = async (userRole, userId, period = 'monthly') => {
  const groupBy = period === 'weekly'
    ? { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } }
    : { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };

  const sortBy = period === 'weekly'
    ? { '_id.year': 1, '_id.week': 1 }
    : { '_id.year': 1, '_id.month': 1 };

  return Order.aggregate([
    { $match: { status: 'DELIVERED', sub_total: { $gt: 0 } } },
    { $group: { _id: groupBy, revenue: { $sum: '$sub_total' }, count: { $sum: 1 } } },
    { $sort: sortBy },
    { $limit: 12 },
  ]);
};
