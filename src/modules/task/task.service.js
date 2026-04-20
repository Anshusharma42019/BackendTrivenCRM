import httpStatus from 'http-status';
import mongoose from 'mongoose';
import Task from './task.model.js';
import ApiError from '../../utils/ApiError.js';
import { createNotification } from '../notification/notification.service.js';
import Cnp from '../cnp/cnp.model.js';
import Verification from '../verification/verification.model.js';
import ReadyToShipment from '../readytoshipment/readytoshipment.model.js';
import User from '../user/user.model.js';

const notifyAdmins = async (data) => {
  const admins = await User.find({ role: { $in: ['admin', 'manager'] }, isDeleted: false }, '_id');
  await Promise.all(admins.map(a => createNotification({ ...data, user: a._id }).catch(() => {})));
};

export const createTask = async (data, createdBy, creatorRole) => {
  // Sales staff can only assign tasks to themselves
  if (creatorRole === 'sales') {
    data.assignedTo = createdBy;
  } else if (!data.assignedTo) {
    const { getNextSalesUser } = await import('../lead/lead.service.js');
    data.assignedTo = await getNextSalesUser();
  }

  const task = await Task.create({ ...data, createdBy });
  await createNotification({
    user: task.assignedTo,
    title: 'New Task Assigned',
    message: `Task "${task.title}" is due on ${new Date(task.dueDate).toDateString()}.`,
    type: 'task_due',
    relatedTask: task._id,
    relatedLead: task.lead,
  });
  await notifyAdmins({ title: 'New Task Created', message: `Task "${task.title}" assigned, due ${new Date(task.dueDate).toDateString()}.`, type: 'task_due', relatedTask: task._id });
  return task;
};

export const getTasks = async (filter, userRole, userId) => {
  const query = { isDeleted: false };
  // Sales staff always see only their own tasks — cannot be overridden
  if (userRole === 'sales') {
    query.assignedTo = new mongoose.Types.ObjectId(String(userId));
  } else {
    if (filter.assignedTo) query.assignedTo = new mongoose.Types.ObjectId(String(filter.assignedTo));
  }
  if (filter.status) {
    query.status = filter.status;
  } else if (userRole === 'sales') {
    query.status = { $nin: ['verification', 'cnp', 'cancel_call', 'ready_to_shipment', 'interested'] };
  }
  if (filter.type) query.type = filter.type;
  if (filter.lead) query.lead = filter.lead;

  console.log('[GET-TASKS] query:', JSON.stringify(query), 'role:', userRole, 'userId:', userId);
  if (filter.date) {
    const start = new Date(filter.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filter.date);
    end.setHours(23, 59, 59, 999);
    query.dueDate = { $gte: start, $lte: end };
  }

  // Auto-mark overdue (only pending tasks)
  await Task.updateMany(
    { status: 'pending', dueDate: { $lt: new Date() }, isDeleted: false },
    { status: 'overdue' }
  );

  return Task.find(query)
    .populate('assignedTo', 'name email')
    .populate('lead', 'name phone status')
    .sort({ createdAt: -1 });
};

export const getTaskById = async (id, userRole, userId) => {
  const task = await Task.findOne({ _id: id, isDeleted: false })
    .populate('assignedTo', 'name email')
    .populate('lead', 'name phone');
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  if (userRole === 'sales' && String(task.assignedTo?._id) !== String(userId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  return task;
};

export const updateTask = async (id, data, userRole, userId) => {
  const task = await getTaskById(id, userRole, userId);
  // Sales staff cannot reassign tasks to other users
  if (userRole === 'sales') delete data.assignedTo;
  Object.assign(task, data);
  await task.save();

  // Sync to dedicated collections on status change
  const record = { task: task._id, title: task.title, assignedTo: task.assignedTo, changedBy: userId, lead: task.lead, dueDate: task.dueDate, description: task.description, cityVillageType: task.cityVillageType, cityVillage: task.cityVillage, houseNo: task.houseNo, postOffice: task.postOffice, district: task.district, landmark: task.landmark, pincode: task.pincode, state: task.state, reminderAt: task.reminderAt, notes: task.notes };
  if (data.status === 'cnp') {
    await Cnp.findOneAndUpdate({ task: task._id }, { ...record, lastCnpAt: new Date(), $inc: { cnpCount: 1 }, $push: { cnpHistory: { clickedAt: new Date() } } }, { upsert: true, new: true });
    await Verification.deleteOne({ task: task._id });
    await ReadyToShipment.deleteOne({ task: task._id });
  } else if (data.status === 'verification') {
    await Verification.findOneAndUpdate({ task: task._id }, record, { upsert: true, new: true });
    await Cnp.deleteOne({ task: task._id });
    await ReadyToShipment.deleteOne({ task: task._id });
  } else if (data.status === 'ready_to_shipment') {
    await ReadyToShipment.findOneAndUpdate({ task: task._id }, record, { upsert: true, new: true });
    await Verification.deleteOne({ task: task._id });
    await Cnp.deleteOne({ task: task._id });
  } else {
    await Cnp.deleteOne({ task: task._id });
    await Verification.deleteOne({ task: task._id });
    await ReadyToShipment.deleteOne({ task: task._id });
  }

  return task;
};

export const deleteTask = async (id) => {
  const task = await Task.findOne({ _id: id, isDeleted: false });
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  task.isDeleted = true;
  await task.save();
};

export const getDailyTasks = async (userId, userRole) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const query = {
    isDeleted: false,
    dueDate: { $gte: start, $lte: end },
    status: { $nin: ['verification', 'cnp', 'cancel_call', 'ready_to_shipment', 'interested'] },
  };
  if (userRole === 'sales') query.assignedTo = new mongoose.Types.ObjectId(String(userId));

  return Task.find(query)
    .populate('lead', 'name phone status')
    .populate('assignedTo', 'name email')
    .sort({ priority: -1, dueDate: 1 });
};
