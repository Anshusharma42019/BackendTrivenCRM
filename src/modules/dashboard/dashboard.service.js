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
  // console.log('[setStaffTarget] userId:', userId, 'date:', date, 'target:', target);
  let doc = await StaffTarget.findOne({ user: userId, date });
  if (doc) {
    doc.target = Number(target);
    await doc.save();
  } else {
    doc = await StaffTarget.create({ user: userId, date, target: Number(target) });
  }
  // console.log('[setStaffTarget] saved:', doc);
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
  const salesUsers = await User.find({ role: { $in: ['sales', 'manager'] }, isDeleted: false }).select('_id name phone role').lean();

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
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const Attendance = (await import('../attendance/attendance.model.js')).default;
  const User = (await import('../user/user.model.js')).default;

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
    attendanceToday,
    totalStaffCount,
    todayCnp,
    todayCallAgain,
    todayInterested,
    todayNotInterested,
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

    Attendance.find({ date: { $gte: todayStart, $lte: todayEnd }, isDeleted: false }).lean(),

    User.countDocuments({ role: { $in: ['sales', 'manager'] }, isDeleted: false }),

    Cnp.countDocuments({ createdAt: { $gte: todayStart } }),
    CallAgain.countDocuments({ updatedAt: { $gte: todayStart } }),
    Task.countDocuments({ status: 'interested', isDeleted: false, updatedAt: { $gte: todayStart } }),
    Task.countDocuments({ status: 'cancel_call', isDeleted: false, updatedAt: { $gte: todayStart } }),
  ]);

  const stageOrder = ['new', 'contacted', 'interested', 'follow_up', 'closed_won', 'closed_lost'];
  const funnelMap = Object.fromEntries(funnelData.map((f) => [f._id, f.count]));
  const salesFunnel = stageOrder.map((stage) => ({ stage, count: funnelMap[stage] || 0 }));

  const sourcePerformance = sourceData.map((s) => ({
    source: s._id || 'other',
    count: s.count,
    percentage: totalLeads ? Math.round((s.count / totalLeads) * 100) : 0,
  }));

  const attendanceStats = {
    present: attendanceToday.filter(a => a.checkIn).length,
    checkedOut: attendanceToday.filter(a => a.checkOut).length,
    absent: Math.max(0, totalStaffCount - attendanceToday.filter(a => a.checkIn).length),
    totalStaff: totalStaffCount
  };

  const activityStats = {
    todayCnp,
    todayCallAgain,
    todayInterested,
    todayNotInterested,
  };

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
    attendance: attendanceStats,
    activity: activityStats,
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

/* ─── Staff Commission ─── */
const COMMISSION_RATE = 0.05; // 5%

/**
 * Calculate commission and salary for a single staff member for a given month.
 */
export const getStaffCommission = async (userId, month, year) => {
  const User = (await import('../user/user.model.js')).default;
  const Attendance = (await import('../attendance/attendance.model.js')).default;
  const Verification = (await import('../verification/verification.model.js')).default;

  const uid = new mongoose.Types.ObjectId(userId);
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const m = month != null ? Number(month) : nowIST.getUTCMonth();
  const y = year != null ? Number(year) : nowIST.getUTCFullYear();
  const monthStart = new Date(Date.UTC(y, m, 1) - IST_OFFSET);
  const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59) - IST_OFFSET);

  // 1. Get user details for baseSalary
  const user = await User.findById(uid).select('baseSalary name role').lean();

  // 2. Find leads assigned to this staff
  const leadIds = await Lead.find({ assignedTo: uid, isDeleted: { $ne: true } }).distinct('_id');

  // 3. Find delivered orders
  const orders = await Order.find({
    status: { $in: ['DELIVERED', 'Delivered', 'delivered'] },
    lead_id: { $in: leadIds },
    $or: [
      { delivered_at: { $gte: monthStart, $lte: monthEnd } },
      { delivered_at: null, updatedAt: { $gte: monthStart, $lte: monthEnd } },
    ],
  }).select('order_items sub_total delivered_at updatedAt billing_customer_name').lean();

  // 4. Get attendance and verifications
  const [attendances, verifications] = await Promise.all([
    Attendance.find({ user: uid, date: { $gte: monthStart, $lte: monthEnd }, isDeleted: false }).lean(),
    Verification.find({ assignedTo: uid, createdAt: { $gte: monthStart, $lte: monthEnd } }).select('status').lean(),
  ]);

  // 5. Calculate statistics
  let totalDeliveries = orders.length;
  let totalItemRevenue = 0;
  let totalCommission = 0;
  const dailyMap = {};

  for (const order of orders) {
    let orderItemTotal = 0;
    for (const item of (order.order_items || [])) {
      const price = Number(item.selling_price) || 0;
      const units = Number(item.units) || 1;
      orderItemTotal += price * units;
    }
    if (orderItemTotal === 0) orderItemTotal = Number(order.sub_total) || 0;

    const commission = orderItemTotal * COMMISSION_RATE;
    totalItemRevenue += orderItemTotal;
    totalCommission += commission;

    const dateKey = (order.delivered_at || order.updatedAt || new Date()).toISOString().slice(0, 10);
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, deliveries: 0, revenue: 0, commission: 0 };
    dailyMap[dateKey].deliveries++;
    dailyMap[dateKey].revenue += orderItemTotal;
    dailyMap[dateKey].commission += commission;
  }

  const attendanceStats = { present: 0, late: 0, half_day: 0, absent: 0 };
  for (const a of attendances) {
    if (attendanceStats[a.status] !== undefined) attendanceStats[a.status]++;
  }

  const verifStats = { assigned: verifications.length, verified: verifications.filter(v => v.status === 'verified').length };

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const effectiveDays = attendanceStats.present + attendanceStats.late + (attendanceStats.half_day * 0.5);
  const basePay = Math.round(((user?.baseSalary || 0) / daysInMonth) * effectiveDays);

  const dailyBreakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  return {
    user: { name: user?.name, role: user?.role, baseSalary: user?.baseSalary || 0 },
    totalDeliveries,
    totalItemRevenue: Math.round(totalItemRevenue),
    totalCommission: Math.round(totalCommission),
    commissionRate: COMMISSION_RATE * 100,
    attendance: attendanceStats,
    verifications: verifStats,
    basePay,
    totalPay: basePay + Math.round(totalCommission),
    month: m + 1,
    year: y,
    dailyBreakdown,
  };
};

/**
 * Get commission and salary data for ALL staff (admin view).
 */
export const getAllStaffCommissions = async (month, year) => {
  const User = (await import('../user/user.model.js')).default;
  const Attendance = (await import('../attendance/attendance.model.js')).default;
  const Verification = (await import('../verification/verification.model.js')).default;

  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const m = month != null ? Number(month) : nowIST.getUTCMonth();
  const y = year != null ? Number(year) : nowIST.getUTCFullYear();
  const monthStart = new Date(Date.UTC(y, m, 1) - IST_OFFSET);
  const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59) - IST_OFFSET);

  // 1. Get all staff (Sales and Managers)
  const staffUsers = await User.find({ role: { $in: ['sales', 'manager'] }, isDeleted: false }).select('_id name phone role baseSalary').lean();

  // 2. Get all delivered orders in the month
  const deliveredOrders = await Order.find({
    status: { $in: ['DELIVERED', 'Delivered', 'delivered'] },
    lead_id: { $exists: true, $ne: null },
    $or: [
      { delivered_at: { $gte: monthStart, $lte: monthEnd } },
      { delivered_at: null, updatedAt: { $gte: monthStart, $lte: monthEnd } },
    ],
  }).select('order_items sub_total lead_id').lean();

  // 3. Build lead → staff mapping
  const leadIds = [...new Set(deliveredOrders.map(o => String(o.lead_id)))];
  const leads = await Lead.find({ _id: { $in: leadIds } }).select('_id assignedTo').lean();
  const leadToStaff = {};
  for (const l of leads) {
    if (l.assignedTo) leadToStaff[String(l._id)] = String(l.assignedTo);
  }

  // 4. Get attendance and verifications for the month
  const [attendances, verifications] = await Promise.all([
    Attendance.find({ date: { $gte: monthStart, $lte: monthEnd }, isDeleted: false }).lean(),
    Verification.find({ createdAt: { $gte: monthStart, $lte: monthEnd } }).select('assignedTo status').lean(),
  ]);

  // 5. Aggregate per staff
  const staffMap = {};
  for (const u of staffUsers) {
    staffMap[String(u._id)] = {
      user: u,
      totalDeliveries: 0,
      totalItemRevenue: 0,
      totalCommission: 0,
      attendance: { present: 0, late: 0, half_day: 0, absent: 0 },
      verifications: { assigned: 0, verified: 0 },
      basePay: 0,
      totalPay: 0
    };
  }

  // Tally Verifications
  for (const v of verifications) {
    if (v.assignedTo && staffMap[String(v.assignedTo)]) {
      staffMap[String(v.assignedTo)].verifications.assigned++;
      if (v.status === 'verified') staffMap[String(v.assignedTo)].verifications.verified++;
    }
  }

  // Tally Attendance
  for (const a of attendances) {
    const sid = String(a.user);
    if (staffMap[sid]) {
      if (staffMap[sid].attendance[a.status] !== undefined) {
        staffMap[sid].attendance[a.status]++;
      }
    }
  }

  // Calculate Commissions
  for (const order of deliveredOrders) {
    const staffId = leadToStaff[String(order.lead_id)];
    if (!staffId || !staffMap[staffId]) continue;

    let orderItemTotal = 0;
    for (const item of (order.order_items || [])) {
      const price = Number(item.selling_price) || 0;
      const units = Number(item.units) || 1;
      orderItemTotal += price * units;
    }
    if (orderItemTotal === 0) orderItemTotal = Number(order.sub_total) || 0;

    staffMap[staffId].totalDeliveries++;
    staffMap[staffId].totalItemRevenue += orderItemTotal;
    staffMap[staffId].totalCommission += orderItemTotal * COMMISSION_RATE;
  }

  // Finalize Salaries
  const result = Object.values(staffMap).map(s => {
    const base = s.user.baseSalary || 0;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const effectiveDays = s.attendance.present + s.attendance.late + (s.attendance.half_day * 0.5);
    
    s.basePay = Math.round((base / daysInMonth) * effectiveDays);
    s.totalPay = s.basePay + Math.round(s.totalCommission);
    
    return {
      ...s,
      totalItemRevenue: Math.round(s.totalItemRevenue),
      totalCommission: Math.round(s.totalCommission),
    };
  });

  // Grand totals
  const grandTotalDeliveries = result.reduce((a, s) => a + s.totalDeliveries, 0);
  const grandTotalRevenue = result.reduce((a, s) => a + s.totalItemRevenue, 0);
  const grandTotalCommission = result.reduce((a, s) => a + s.totalCommission, 0);
  const grandTotalPay = result.reduce((a, s) => a + s.totalPay, 0);

  return {
    staff: result,
    grandTotalDeliveries,
    grandTotalRevenue,
    grandTotalCommission,
    grandTotalPay,
    commissionRate: COMMISSION_RATE * 100,
    month: m + 1,
    year: y,
  };
};
