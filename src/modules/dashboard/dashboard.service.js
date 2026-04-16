import Lead from '../lead/lead.model.js';
import Task from '../task/task.model.js';
import { Order } from '../shiprocket/models/order.model.js';

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
