import Lead from '../lead/lead.model.js';
import Task from '../task/task.model.js';
import { Order } from '../shiprocket/models/order.model.js';
import Verification from '../verification/verification.model.js';
import StaffTarget from './staffTarget.model.js';
import Cnp from '../cnp/cnp.model.js';
import CallAgain from '../callagain/callagain.model.js';
import mongoose from 'mongoose';

const todayDateStr = () => new Date().toISOString().slice(0, 10);

export const getStaffStats = async (userId, targetDate) => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const target = targetDate ? new Date(targetDate) : new Date();
  
  const startOfDay = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - IST_OFFSET);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
  const monthStart = new Date(Date.UTC(target.getFullYear(), target.getMonth(), 1) - IST_OFFSET);
  
  const uid = new mongoose.Types.ObjectId(userId);
  const dateStr = target.toISOString().slice(0, 10);

  const [
    todayVerifications, 
    monthVerifications, 
    pendingTasks, 
    targetDoc,
    todayCnp, 
    todayCallAgain, 
    todayInterested, 
    todayNotInterested,
    leadsAdded,
    verifiedCount,
    onHoldCount,
    todayClosedLost
  ] = await Promise.all([
    Verification.countDocuments({ assignedTo: uid, createdAt: { $gte: startOfDay, $lte: endOfDay } }),
    Verification.countDocuments({ assignedTo: uid, createdAt: { $gte: monthStart, $lte: endOfDay } }),
    Task.countDocuments({ assignedTo: uid, status: 'pending', isDeleted: false }),
    StaffTarget.findOne({ user: uid, date: dateStr }),
    Cnp.countDocuments({ assignedTo: uid, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    CallAgain.countDocuments({ assignedTo: uid, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Task.countDocuments({ assignedTo: uid, status: 'interested', isDeleted: false, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Task.countDocuments({ assignedTo: uid, status: 'cancel_call', isDeleted: false, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Lead.countDocuments({ assignedTo: uid, createdAt: { $gte: startOfDay, $lte: endOfDay } }),
    Verification.countDocuments({ assignedTo: uid, status: 'verified', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Verification.countDocuments({ assignedTo: uid, status: 'on_hold', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Lead.countDocuments({ assignedTo: uid, status: 'closed_lost', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
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
    todayClosedLost,
    leadsAdded,
    verifiedCount,
    onHoldCount,
    date: dateStr
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

export const getStaffTodayLists = async (userRole, userId, targetDate, targetStaffId) => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const target = targetDate ? new Date(targetDate) : new Date();
  const todayStart = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - IST_OFFSET);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  const filter = { createdAt: { $gte: todayStart, $lte: todayEnd } };
  const updateFilter = { updatedAt: { $gte: todayStart, $lte: todayEnd } };
  const taskFilter = { isDeleted: false, updatedAt: { $gte: todayStart, $lte: todayEnd } };

  let sid = null;
  if (userRole === 'manager' || userRole === 'admin') {
    if (targetStaffId) sid = new mongoose.Types.ObjectId(targetStaffId);
  } else {
    sid = new mongoose.Types.ObjectId(userId);
  }

  if (sid) {
    filter.assignedTo = sid;
    updateFilter.assignedTo = sid;
    taskFilter.assignedTo = sid;
  }

  const [cnpList, callAgainList, interestedList, notInterestedList, onHoldList] = await Promise.all([
    Cnp.find(updateFilter)
      .populate('lead', 'name phone').populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(100).lean(),
    CallAgain.find(updateFilter)
      .populate('lead', 'name phone').populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(100).lean(),
    Task.find({ ...taskFilter, status: 'interested' })
      .populate('lead', 'name phone').sort({ updatedAt: -1 }).limit(100).lean(),
    Task.find({ ...taskFilter, status: 'cancel_call' })
      .populate('lead', 'name phone').sort({ updatedAt: -1 }).limit(100).lean(),
    Verification.find({ ...(sid ? { assignedTo: sid } : {}), status: 'on_hold', updatedAt: { $gte: todayStart, $lte: todayEnd } })
      .populate('lead', 'name phone').sort({ updatedAt: -1 }).limit(100).lean(),
  ]);

  return { cnpList, callAgainList, interestedList, notInterestedList, onHoldList };
};

export const getStaffMonthlyChart = async (userId) => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const monthStart = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - IST_OFFSET);

  const match = { createdAt: { $gte: monthStart } };
  if (userId) {
    match.assignedTo = new mongoose.Types.ObjectId(userId);
  }

  const data = await Verification.aggregate([
    { $match: match },
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

export const getAllStaffStats = async (targetDate) => {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const target = targetDate ? new Date(targetDate) : new Date();
  
  const startOfDay = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - IST_OFFSET);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
  const monthStart = new Date(Date.UTC(target.getFullYear(), target.getMonth(), 1) - IST_OFFSET);
  const monthEnd = new Date(Date.UTC(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999) - IST_OFFSET);
  const dateStr = target.toISOString().slice(0, 10);

  const User = (await import('../user/user.model.js')).default;
  const Appointment = (await import('../appointment/appointment.model.js')).default;
  const allUsers = await User.find({ role: { $in: ['sales', 'manager', 'doctor'] }, isDeleted: false }).select('_id name phone role').lean();

  const stats = await Promise.all(allUsers.map(async (u) => {
    const uid = new mongoose.Types.ObjectId(u._id);

    if (u.role === 'doctor') {
      const docRegex = new RegExp(u.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      const [totalAppointments, completedAppointments, cancelledAppointments] = await Promise.all([
        Appointment.countDocuments({ doctorName: docRegex, appointmentDate: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false }),
        Appointment.countDocuments({ doctorName: docRegex, appointmentDate: { $gte: startOfDay, $lte: endOfDay }, status: 'completed', isDeleted: false }),
        Appointment.countDocuments({ doctorName: docRegex, appointmentDate: { $gte: startOfDay, $lte: endOfDay }, status: 'cancelled', isDeleted: false })
      ]);
      return {
        user: u,
        todayVerifications: 0,
        monthVerifications: 0,
        pendingTasks: 0,
        todayTarget: 0,
        todayCnp: 0,
        todayCallAgain: 0,
        todayInterested: 0,
        todayNotInterested: 0,
        todayClosedLost: 0,
        leadsAdded: 0,
        verifiedCount: 0,
        onHoldCount: 0,
        readyToShipmentCount: 0,
        deliveredCount: 0,
        rtoCount: 0,
        totalAppointments,
        completedAppointments,
        cancelledAppointments
      };
    }
    
    // For delivered orders, we need lead IDs assigned to this staff
    const staffLeads = await Lead.find({ assignedTo: uid, isDeleted: { $ne: true } }).distinct('_id');
    // console.log(`[getAllStaffStats] Staff: ${u.name}, Leads: ${staffLeads.length}`);

    const [
      todayVerifications, 
      monthVerifications, 
      pendingTasks, 
      targetDoc,
      todayCnp, 
      todayCallAgain, 
      todayInterested, 
      todayNotInterested,
      todayClosedLost,
      leadsAdded,
      verifiedCount,
      onHoldCount,
      readyToShipmentCount,
      deliveredCount,
      rtoCount,
      assignedVerifications
    ] = await Promise.all([
      Verification.countDocuments({ assignedTo: uid, createdAt: { $gte: startOfDay, $lte: endOfDay } }),
      Verification.countDocuments({ assignedTo: uid, createdAt: { $gte: monthStart, $lte: monthEnd } }),
      Task.countDocuments({ assignedTo: uid, status: 'pending', isDeleted: false }),
      StaffTarget.findOne({ user: uid, date: dateStr }).lean(),
      Cnp.countDocuments({ assignedTo: uid, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
      CallAgain.countDocuments({ assignedTo: uid, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
      Task.countDocuments({ assignedTo: uid, status: 'interested', isDeleted: false, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
      Task.countDocuments({ assignedTo: uid, status: 'cancel_call', isDeleted: false, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
      Lead.countDocuments({ assignedTo: uid, status: 'closed_lost', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
      Lead.countDocuments({ assignedTo: uid, createdAt: { $gte: startOfDay, $lte: endOfDay } }),
      Verification.countDocuments({ assignedTo: uid, status: 'verified', updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
      Verification.countDocuments({ 
        assignedTo: uid, 
        status: 'on_hold',
        $or: [
          { onHoldAt: { $gte: startOfDay, $lte: endOfDay } },
          { onHoldAt: null, updatedAt: { $gte: startOfDay, $lte: endOfDay } }
        ]
      }),
      Task.countDocuments({ assignedTo: uid, status: 'ready_to_shipment', isDeleted: false }),
      Order.countDocuments({ 
        lead_id: { $in: staffLeads }, 
        status: { $in: ['DELIVERED', 'Delivered', 'delivered'] },
        $or: [
          { delivered_at: { $gte: monthStart, $lte: monthEnd } },
          { delivered_at: null, status_updated_at: { $gte: monthStart, $lte: monthEnd } },
          { delivered_at: null, status_updated_at: null, createdAt: { $gte: monthStart, $lte: monthEnd } },
        ],
      }),
      Order.countDocuments({
        lead_id: { $in: staffLeads },
        status: { $regex: /^rto/i },
        $or: [
          { status_updated_at: { $gte: monthStart, $lte: monthEnd } },
          { status_updated_at: null, createdAt: { $gte: monthStart, $lte: monthEnd } },
        ],
      }),
      Verification.countDocuments({ 
        assignedTo: uid, 
        createdAt: { $gte: startOfDay, $lte: endOfDay }, 
        isDeleted: { $ne: true } 
      })
    ]);
    // console.log(`[getAllStaffStats] Staff: ${u.name}, Ready: ${readyToShipmentCount}, Delivered: ${deliveredCount}`);
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
      todayClosedLost,
      leadsAdded,
      verifiedCount,
      onHoldCount,
      readyToShipmentCount,
      deliveredCount,
      rtoCount,
      assignedVerifications
    };
  }));

  return stats;
};

export const getDashboardStats = async (userRole, userId, targetDate) => {
  // For countDocuments — plugin auto-adds isDeleted:false
  const countFilter = {};
  // For aggregate — plugin does NOT apply, must be explicit
  const aggMatch = { isDeleted: false };

  if (userRole === 'sales') {
    countFilter.assignedTo = userId;
    aggMatch.assignedTo = userId;
  }

  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const target = targetDate ? new Date(targetDate) : new Date();
  const todayStart = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - IST_OFFSET);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

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

    Lead.countDocuments({ ...countFilter, createdAt: { $gte: todayStart, $lte: todayEnd } }),

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

    Cnp.countDocuments({ updatedAt: { $gte: todayStart, $lte: todayEnd } }),
    CallAgain.countDocuments({ updatedAt: { $gte: todayStart, $lte: todayEnd } }),
    Task.countDocuments({ status: 'interested', isDeleted: false, updatedAt: { $gte: todayStart, $lte: todayEnd } }),
    Task.countDocuments({ status: 'cancel_call', isDeleted: false, updatedAt: { $gte: todayStart, $lte: todayEnd } }),
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
    todayClosedLost: await Lead.countDocuments({ status: 'closed_lost', updatedAt: { $gte: todayStart, $lte: todayEnd } }),
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

const getValidDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getDashboardDeliveredDate = (order) => {
  return getValidDate(order.delivered_at) || getValidDate(order.createdAt);
};

const isDeliveredInRange = (order, monthStart, monthEnd) => {
  const deliveredDate = getDashboardDeliveredDate(order);
  return !!deliveredDate && deliveredDate >= monthStart && deliveredDate <= monthEnd;
};

const getOrderRevenue = (order) => {
  const subTotal = Number(order.sub_total) || 0;
  if (subTotal > 0) return subTotal;
  return (order.order_items || []).reduce((sum, item) => {
    const price = Number(item.selling_price) || 0;
    const units = Number(item.units) || 1;
    return sum + (price * units);
  }, 0);
};

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
  const deliveredOrders = await Order.find({
    status: /^delivered$/i,
    lead_id: { $in: leadIds },
  }).select('order_items sub_total delivered_at status_updated_at raw_response createdAt billing_customer_name').lean();
  const orders = deliveredOrders.filter(order => isDeliveredInRange(order, monthStart, monthEnd));

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
    const orderItemTotal = getOrderRevenue(order);
    const commission = orderItemTotal * COMMISSION_RATE;
    totalItemRevenue += orderItemTotal;
    totalCommission += commission;

    const dateKey = getDashboardDeliveredDate(order).toISOString().slice(0, 10);
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
  const ReadyToShipment = (await import('../readytoshipment/readytoshipment.model.js')).default;

  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const m = month != null ? Number(month) : nowIST.getUTCMonth();
  const y = year != null ? Number(year) : nowIST.getUTCFullYear();
  const monthStart = new Date(Date.UTC(y, m, 1) - IST_OFFSET);
  const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59) - IST_OFFSET);

  // 1. Get all staff (Sales and Managers)
  const staffUsers = await User.find({
    role: { $in: ['sales', 'manager'] },
    createdAt: { $lte: monthEnd },
    isDeleted: false
  }).select('_id name phone role baseSalary createdAt').lean();

  // 2. Get all delivered orders in the month
  const allDeliveredOrders = await Order.find({
    status: /^delivered$/i,
  }).select('order_items sub_total lead_id delivered_at status_updated_at raw_response createdAt').lean();
  const deliveredOrders = allDeliveredOrders.filter(order => isDeliveredInRange(order, monthStart, monthEnd));

  // 3. Build lead → staff mapping
  const leadIds = [...new Set(deliveredOrders.map(o => o.lead_id ? String(o.lead_id) : null).filter(Boolean))];
  const staffCreatedAt = Object.fromEntries(staffUsers.map(u => [String(u._id), getValidDate(u.createdAt)]));
  const [readyRecords, verificationOwnerRecords] = await Promise.all([
    ReadyToShipment.find({ lead: { $in: leadIds } }).select('lead assignedTo createdAt updatedAt').sort({ createdAt: 1 }).lean(),
    Verification.find({ lead: { $in: leadIds } }).select('lead assignedTo createdAt updatedAt').sort({ createdAt: 1 }).lean(),
  ]);
  const leadWorkflowOwners = {};
  for (const record of [...verificationOwnerRecords, ...readyRecords]) {
    const leadId = record.lead ? String(record.lead) : null;
    if (!leadId || !record.assignedTo) continue;
    if (!leadWorkflowOwners[leadId]) leadWorkflowOwners[leadId] = [];
    leadWorkflowOwners[leadId].push({
      assignedTo: String(record.assignedTo),
      date: getValidDate(record.updatedAt) || getValidDate(record.createdAt)
    });
  }
  for (const owners of Object.values(leadWorkflowOwners)) {
    owners.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
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
  const unassignedStaffId = '__unassigned__';
  staffMap[unassignedStaffId] = {
    user: {
      _id: unassignedStaffId,
      name: 'Unassigned Orders',
      role: 'unassigned',
      baseSalary: 0
    },
    totalDeliveries: 0,
    totalItemRevenue: 0,
    totalCommission: 0,
    attendance: { present: 0, late: 0, half_day: 0, absent: 0 },
    verifications: { assigned: 0, verified: 0 },
    basePay: 0,
    totalPay: 0
  };

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
    const deliveredDate = getDashboardDeliveredDate(order);
    const leadOwners = order.lead_id ? leadWorkflowOwners[String(order.lead_id)] || [] : [];
    const owner = [...leadOwners].reverse().find(item => (
      !item.date ||
      item.date <= deliveredDate ||
      (item.date >= monthStart && item.date <= monthEnd)
    ));
    const staffId = owner?.assignedTo;
    const staffExistedOnDelivery = staffId && (!staffCreatedAt[staffId] || staffCreatedAt[staffId] <= deliveredDate);
    const targetStaffId = staffExistedOnDelivery && staffMap[staffId] ? staffId : unassignedStaffId;

    const orderItemTotal = getOrderRevenue(order);

    staffMap[targetStaffId].totalDeliveries++;
    staffMap[targetStaffId].totalItemRevenue += orderItemTotal;
    if (targetStaffId !== unassignedStaffId) {
      staffMap[targetStaffId].totalCommission += orderItemTotal * COMMISSION_RATE;
    }
  }

  // Finalize Salaries
  const result = Object.values(staffMap).filter(s => (
    s.user._id !== unassignedStaffId || s.totalDeliveries > 0
  )).map(s => {
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
