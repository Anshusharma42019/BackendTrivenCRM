import httpStatus from 'http-status';
import mongoose from 'mongoose';
import Lead from './lead.model.js';
import Task from '../task/task.model.js';
import Cnp from '../cnp/cnp.model.js';
import User from '../user/user.model.js';
import ApiError from '../../utils/ApiError.js';
import { createNotification } from '../notification/notification.service.js';

const notifyAdmins = async (data) => {
  const admins = await User.find({ role: { $in: ['admin', 'manager'] }, isDeleted: false }, '_id');
  await Promise.all(admins.map(a => createNotification({ ...data, user: a._id }).catch(() => {})));
};

// True equal distribution — assign to sales user with fewest active leads
export const getNextSalesUser = async () => {
  const salesUsers = await User.find({ role: 'sales', isDeleted: false }).sort({ createdAt: 1 });
  if (!salesUsers.length) return null;

  // Count active leads per sales user
  const counts = await Lead.aggregate([
    { $match: { isDeleted: false, assignedTo: { $in: salesUsers.map(u => u._id) } } },
    { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
  ]);

  const countMap = {};
  counts.forEach(c => { countMap[String(c._id)] = c.count; });

  // Pick user with fewest leads (ties broken by earliest created)
  let minUser = salesUsers[0];
  let minCount = countMap[String(salesUsers[0]._id)] ?? 0;

  for (const u of salesUsers) {
    const c = countMap[String(u._id)] ?? 0;
    if (c < minCount) { minCount = c; minUser = u; }
  }

  return minUser._id;
};

export const createLead = async (data, createdBy, creatorRole) => {
  if (!data.assignedTo) {
    // If a sales staff manually adds a lead, assign it to themselves
    if (creatorRole === 'sales' && createdBy) {
      data.assignedTo = createdBy;
    } else {
      data.assignedTo = await getNextSalesUser();
    }
  }

  const payload = { ...data };
  if (createdBy) payload.createdBy = createdBy;

  const lead = await Lead.create(payload);

  if (lead.assignedTo) {
    // Notify assigned sales person
    await createNotification({
      user: lead.assignedTo,
      title: 'New Lead Assigned',
      message: `Lead "${lead.name}" has been assigned to you.`,
      type: 'lead_assigned',
      relatedLead: lead._id,
    }).catch(() => {});
    await notifyAdmins({ title: 'New Lead Created', message: `Lead "${lead.name}" was created and assigned.`, type: 'lead_assigned', relatedLead: lead._id });

    // Auto-create a CALL task due in 2 hours for the assigned sales person
    const assignedToId = lead.assignedTo._id ?? lead.assignedTo;
    if (assignedToId) {
      const dueDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const taskCreatedBy = createdBy
        ? new mongoose.Types.ObjectId(String(createdBy))
        : assignedToId;
      const task = await Task.create({
        title: `Call ${lead.name}`,
        description: `Phone: ${lead.phone}${lead.problem ? ' | ' + lead.problem : ''}`,
        type: 'call',
        lead: lead._id,
        assignedTo: assignedToId,
        createdBy: taskCreatedBy,
        dueDate,
        priority: 'high',
        status: 'pending',
        isDeleted: false,
      });
      console.log('[AUTO-TASK] Created call task:', task._id, 'for user:', assignedToId);
    } else {
      console.warn('[AUTO-TASK] Skipped — no sales user available for lead:', lead._id);
    }
  }

  return lead;
};

export const getLeads = async (filter, options, userRole, userId) => {
  const query = { isDeleted: false };

  if (userRole === 'sales') query.assignedTo = userId;

  if (!filter.cnp) query.cnp = { $ne: true };

  if (filter.status) {
    query.status = filter.status;
  } else if (!filter.cnp) {
    query.status = { $nin: ['closed_won', 'interested'] };
  }
  if (filter.source) query.source = filter.source;
  if (filter.assignedTo && userRole !== 'sales') query.assignedTo = filter.assignedTo;
  if (filter.cnp === 'true') query.cnp = true;

  // Exclude leads moved to verification/ready_to_shipment, but keep on_hold/closed_lost/cnp
  if (!filter.cnp) {
    const [advancedLeadIds, alwaysShowIds] = await Promise.all([
      Task.distinct('lead', { status: { $in: ['verification', 'ready_to_shipment'] }, lead: { $ne: null }, isDeleted: false }),
      Lead.distinct('_id', { isDeleted: false, status: { $in: ['on_hold', 'closed_lost', 'interested'] } }),
    ]);
    const alwaysShowSet = new Set(alwaysShowIds.map(String));
    const excludeIds = advancedLeadIds.filter(id => !alwaysShowSet.has(String(id)));
    if (excludeIds.length) query._id = { $nin: excludeIds };
  }

  if (filter.search) {
    query.$or = [
      { name: { $regex: filter.search, $options: 'i' } },
      { phone: { $regex: filter.search, $options: 'i' } },
      { email: { $regex: filter.search, $options: 'i' } },
    ];
  }
  if (filter.dateFrom || filter.dateTo) {
    query.createdAt = {};
    if (filter.dateFrom) query.createdAt.$gte = new Date(filter.dateFrom);
    if (filter.dateTo) {
      const to = new Date(filter.dateTo);
      to.setHours(23, 59, 59, 999);
      query.createdAt.$lte = to;
    }
  }

  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 20;
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    Lead.find(query)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Lead.countDocuments(query),
  ]);

  return { leads, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getLeadById = async (id, userRole, userId) => {
  const lead = await Lead.findOne({ _id: id, isDeleted: false })
    .populate('assignedTo', 'name email role')
    .populate('createdBy', 'name email')
    .populate('notes.createdBy', 'name');
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  if (userRole === 'sales' && String(lead.assignedTo?._id) !== String(userId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  return lead;
};

export const updateLead = async (id, data, userRole, userId) => {
  const lead = await getLeadById(id, userRole, userId);
  const oldStatus = lead.status;
  Object.assign(lead, data);
  await lead.save();

  if (data.status && data.status !== oldStatus && lead.assignedTo) {
    await createNotification({
      user: lead.assignedTo,
      title: 'Lead Status Updated',
      message: `Lead "${lead.name}" moved to ${data.status}.`,
      type: 'lead_status_changed',
      relatedLead: lead._id,
    });
    await notifyAdmins({ title: 'Lead Status Updated', message: `Lead "${lead.name}" moved to ${data.status}.`, type: 'lead_status_changed', relatedLead: lead._id });
  }
  return lead;
};

export const markCNP = async (leadId, userRole, userId) => {
  const lead = await getLeadById(leadId, userRole, userId);
  lead.cnp = true;
  lead.cnpCount = (lead.cnpCount || 0) + 1;
  lead.cnpAt = new Date();
  await lead.save();

  // Mark any pending/overdue tasks for this lead as cnp
  const tasks = await Task.find(
    { lead: leadId, status: { $in: ['pending', 'overdue'] }, isDeleted: false }
  ).lean();

  await Task.updateMany(
    { lead: leadId, status: { $in: ['pending', 'overdue'] }, isDeleted: false },
    { status: 'cnp' }
  );

  // Create a Cnp record for each task (upsert to avoid duplicates)
  for (const task of tasks) {
    await Cnp.findOneAndUpdate(
      { task: task._id },
      {
        task: task._id,
        title: task.title,
        assignedTo: task.assignedTo,
        lead: leadId,
        dueDate: task.dueDate,
        cnpCount: 1,
        lastCnpAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return lead;
};

export const unmarkCNP = async (leadId, userRole, userId) => {
  const lead = await getLeadById(leadId, userRole, userId);
  lead.cnp = false;
  await lead.save();
  return lead;
};

export const deleteLead = async (id) => {
  const lead = await Lead.findOne({ _id: id, isDeleted: false });
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  lead.isDeleted = true;
  lead.deletedAt = new Date();
  await lead.save();
};

export const assignLead = async (leadId, assignedTo) => {
  const lead = await Lead.findOne({ _id: leadId, isDeleted: false });
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  lead.assignedTo = assignedTo;
  await lead.save();

  await createNotification({
    user: assignedTo,
    title: 'Lead Assigned',
    message: `Lead "${lead.name}" has been assigned to you.`,
    type: 'lead_assigned',
    relatedLead: lead._id,
  });

  // Auto-create call task for newly assigned sales person
  const dueDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await Task.create({
    title: `Call ${lead.name}`,
    description: `Phone: ${lead.phone}${lead.problem ? ' | ' + lead.problem : ''}`,
    type: 'call',
    lead: lead._id,
    assignedTo,
    createdBy: assignedTo,
    dueDate,
    priority: 'high',
    status: 'pending',
    isDeleted: false,
  });

  return lead;
};
