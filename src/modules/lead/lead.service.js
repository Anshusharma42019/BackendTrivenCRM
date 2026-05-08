import httpStatus from 'http-status';
import mongoose from 'mongoose';
import Lead from './lead.model.js';
import Task from '../task/task.model.js';
import Cnp from '../cnp/cnp.model.js';
import Verification from '../verification/verification.model.js';
import CallAgain from '../callagain/callagain.model.js';
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
      // console.log('[AUTO-TASK] Created call task:', task._id, 'for user:', assignedToId);
    } else {
      console.warn('[AUTO-TASK] Skipped — no sales user available for lead:', lead._id);
    }
  }

  return lead;
};

export const getLeads = async (filter, options, userRole, userId) => {
  const query = { isDeleted: false };

  // Sales can see all leads for shared statuses (interested, closed_lost, on_hold)
  const sharedStatuses = ['interested', 'closed_lost', 'on_hold'];
  const isSharedStatus = filter.status && sharedStatuses.includes(filter.status);
  if (userRole === 'sales' && !isSharedStatus) query.assignedTo = userId;

  if (!filter.cnp) query.cnp = { $ne: true };

  if (filter.status) {
    query.status = filter.status;
  } else if (!filter.cnp) {
    query.status = { $nin: ['closed_won', 'closed_lost', 'interested'] };
  }
  if (filter.source) query.source = filter.source;
  if (filter.assignedTo && userRole !== 'sales') query.assignedTo = filter.assignedTo;
  if (filter.cnp === 'true') query.cnp = true;

  // Always exclude leads that are in verification/shipment pipeline (unless fetching CNP list)
  if (!filter.cnp) {
    const isOnHold = filter.status === 'on_hold';
    const isInterested = filter.status === 'interested';

    // For on_hold: get lead IDs that have a verification record with on_hold status (these SHOULD show)
    const verificationOnHoldLeadIds = isOnHold
      ? (await Verification.distinct('lead', { status: 'on_hold', lead: { $ne: null } })).map(String)
      : [];

    // Remove cnp leads from whitelist
    const cnpLeadIds = isOnHold && verificationOnHoldLeadIds.length
      ? (await Lead.find({ _id: { $in: verificationOnHoldLeadIds }, cnp: true }, '_id').lean()).map(l => String(l._id))
      : [];
    const safeWhitelist = verificationOnHoldLeadIds.filter(id => !cnpLeadIds.includes(id));

    const [excludeByTask, excludeByCnpCollection, excludeByVerification] = await Promise.all([
      isInterested
        ? Task.distinct('lead', { type: 'task', status: { $in: ['pending', 'overdue'] }, lead: { $ne: null }, isDeleted: false })
        : isOnHold
          ? Task.distinct('lead', { status: { $in: ['verification', 'ready_to_shipment', 'interested'] }, lead: { $ne: null }, isDeleted: false })
          : Task.distinct('lead', { status: { $in: ['cnp', 'verification', 'ready_to_shipment', 'interested'] }, lead: { $ne: null }, isDeleted: false }),
      isOnHold ? Promise.resolve([]) : Cnp.distinct('lead', { lead: { $ne: null } }),
      (isOnHold || isInterested)
        ? Promise.resolve([])
        : Verification.distinct('lead', { lead: { $exists: true, $ne: null }, status: { $nin: ['on_hold'] } }),
    ]);
    const allExclude = [...new Set([...excludeByTask.map(String), ...excludeByCnpCollection.map(String), ...excludeByVerification.map(String)])]
      .filter(id => !safeWhitelist.includes(id));
    if (allExclude.length) {
      const allExcludeIds = allExclude.map(id => new mongoose.Types.ObjectId(id));
      query._id = query._id
        ? { $nin: [...new Set([...query._id.$nin.map(String), ...allExclude])].map(id => new mongoose.Types.ObjectId(id)) }
        : { $nin: allExcludeIds };
    }
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
  // Sales can view shared-status leads (interested, closed_lost, on_hold) from all staff
  const sharedStatuses = ['interested', 'closed_lost', 'on_hold'];
  if (userRole === 'sales' && !sharedStatuses.includes(lead.status) && String(lead.assignedTo?._id) !== String(userId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  return lead;
};

export const updateLead = async (id, data, userRole, userId) => {
  const lead = await Lead.findOne({ _id: id, isDeleted: false })
    .populate('assignedTo', 'name email role');
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  if (userRole === 'sales' && !['closed_lost', 'interested', 'on_hold'].includes(data.status) && String(lead.assignedTo?._id) !== String(userId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  // Normalize assignedTo — accept object {_id} or string
  if (data.assignedTo && typeof data.assignedTo === 'object') {
    data.assignedTo = data.assignedTo._id;
  }
  // Sales users can only assign to themselves
  if (userRole === 'sales') {
    data.assignedTo = new mongoose.Types.ObjectId(String(userId));
  }
  const oldStatus = lead.status;

  // When moving to on_hold, force cnp=false and clean up CNP records/tasks BEFORE saving
  if (data.status === 'on_hold') {
    data.cnp = false;
    const leadObjId = new mongoose.Types.ObjectId(String(id));
    await Cnp.deleteMany({ lead: leadObjId });
    await CallAgain.deleteMany({ lead: leadObjId });
    await Task.updateMany(
      { lead: leadObjId, status: { $in: ['pending', 'overdue', 'cnp'] }, isDeleted: false },
      { isDeleted: true }
    );
  }

  // When clearing CNP flag (from any status), delete cnp-status tasks and remove CNP records BEFORE saving
  if (data.cnp === false) {
    await Task.deleteMany({ lead: id, status: 'cnp', isDeleted: false });
    await Cnp.deleteMany({ lead: id });
  }

  Object.assign(lead, data);
  await lead.save();

  // When moving out of on_hold back to active (new/interested), sync verification record
  if (data.status && ['new', 'interested'].includes(data.status) && oldStatus === 'on_hold') {
    const leadObjId = new mongoose.Types.ObjectId(String(id));
    if (data.status === 'new') {
      const details = {
        houseNo: lead.houseNo,
        cityVillage: lead.cityVillage,
        cityVillageType: lead.cityVillageType,
        postOffice: lead.postOffice,
        district: lead.district,
        state: lead.state,
        pincode: lead.pincode,
        landmark: lead.landmark,
        address: lead.address,
        problem: lead.problem,
        phone: lead.phone
      };

      // Move back to pending in verification if record exists
      await Verification.updateMany({ lead: leadObjId }, { status: 'pending', ...details });
      const verRecords = await Verification.find({ lead: leadObjId });
      for (const vr of verRecords) {
        if (vr.task) await Task.findByIdAndUpdate(vr.task, { status: 'verification', isDeleted: false, ...details });
      }
      // Also restore any soft-deleted call tasks so they show in Action Required
      await Task.updateMany(
        { lead: leadObjId, status: { $in: ['pending', 'overdue', 'cnp', 'on_hold'] }, isDeleted: true },
        { 
          status: data.forceVerification ? 'verification' : 'pending', 
          isDeleted: false,
          ...details
        }
      );
    } else {
      // Moving to interested - clean up verification so it shows in pipeline
      await Verification.deleteMany({ lead: leadObjId });
      await Task.updateMany(
        { lead: leadObjId, status: { $in: ['verification', 'pending', 'overdue', 'on_hold', 'cnp'] }, isDeleted: false },
        { isDeleted: true }
      );
    }
  }

  // When marking interested from CNP, soft-delete pending/overdue tasks so lead shows in pipeline
  if (data.status === 'interested' && data.cnp === false) {
    const leadObjId = new mongoose.Types.ObjectId(String(id));
    await Task.updateMany(
      { lead: leadObjId, status: { $in: ['pending', 'overdue', 'cnp'] }, isDeleted: false },
      { isDeleted: true }
    );
  }

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
  const lead = await Lead.findOne({ _id: leadId, isDeleted: false });
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  }

  // If no tasks exist, create a placeholder task then CNP record
  if (tasks.length === 0) {
    const placeholderTask = await Task.create({
      title: lead.name,
      type: 'call',
      lead: leadId,
      assignedTo: lead.assignedTo,
      createdBy: lead.assignedTo,
      dueDate: new Date(),
      status: 'cnp',
      isDeleted: false,
    });
    await Cnp.findOneAndUpdate(
      { task: placeholderTask._id },
      {
        task: placeholderTask._id,
        title: lead.name,
        assignedTo: lead.assignedTo,
        lead: leadId,
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

  // Cascading soft-delete associated records
  const leadObjId = new mongoose.Types.ObjectId(String(id));
  await Promise.all([
    Task.updateMany({ lead: leadObjId, isDeleted: false }, { isDeleted: true, deletedAt: new Date() }),
    Verification.updateMany({ lead: leadObjId, isDeleted: false }, { isDeleted: true, deletedAt: new Date() }),
    Cnp.deleteMany({ lead: leadObjId }),
    CallAgain.deleteMany({ lead: leadObjId }),
  ]).catch(err => console.error('Cascading delete error:', err));
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
