import express from 'express';
import auth from '../../middleware/auth.js';
import ReadyToShipment from './readytoshipment.model.js';
import Task from '../task/task.model.js';

const router = express.Router();

router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const Verification = (await import('../verification/verification.model.js')).default;

    // Repair: fix any verified records whose Task was never updated
    const verifiedStuck = await Verification.find({ status: 'verified' })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone');

    for (const v of verifiedStuck) {
      if (!v.task) continue;
      await Task.findByIdAndUpdate(v.task, { status: 'ready_to_shipment' });
      await ReadyToShipment.findOneAndUpdate(
        { task: v.task },
        {
          $set: {
            title: v.title,
            assignedTo: v.assignedTo?._id || v.assignedTo,
            lead: v.lead?._id || v.lead,
            description: v.description, problem: v.problem,
            age: v.age, weight: v.weight, height: v.height,
            otherProblems: v.otherProblems, problemDuration: v.problemDuration,
            price: v.price,
            cityVillageType: v.cityVillageType, cityVillage: v.cityVillage,
            houseNo: v.houseNo, postOffice: v.postOffice,
            district: v.district, landmark: v.landmark,
            pincode: v.pincode, state: v.state, reminderAt: v.reminderAt,
          },
          $setOnInsert: { task: v.task },
        },
        { upsert: true }
      );
    }

    // Auto-sync tasks with status=ready_to_shipment
    const tasks = await Task.find({ status: 'ready_to_shipment', isDeleted: false })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status');

    for (const task of tasks) {
      await ReadyToShipment.findOneAndUpdate(
        { task: task._id },
        {
          $set: {
            title: task.title,
            assignedTo: task.assignedTo?._id,
            lead: task.lead?._id,
            description: task.description,
            problem: task.problem,
            age: task.age, weight: task.weight, height: task.height,
            otherProblems: task.otherProblems, problemDuration: task.problemDuration,
            price: task.price,
            cityVillageType: task.cityVillageType, cityVillage: task.cityVillage,
            houseNo: task.houseNo, postOffice: task.postOffice,
            district: task.district, landmark: task.landmark,
            pincode: task.pincode, state: task.state,
            reminderAt: task.reminderAt, notes: task.notes,
          },
          $setOnInsert: { task: task._id },
        },
        { upsert: true }
      );
    }

    const records = await ReadyToShipment.find({ sentToShiprocket: { $ne: true } })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status')
      .populate('task', 'status isDeleted')
      .sort({ createdAt: -1 });

    const filtered = records.filter(r => r.task && r.task.status === 'ready_to_shipment' && !r.task.isDeleted);
    res.json({ status: 200, data: filtered });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.get('/for-shipment', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const records = await ReadyToShipment.find({ sentToShiprocket: { $ne: true } })
      .populate('lead', 'name phone email address')
      .populate('task', 'status isDeleted title')
      .sort({ createdAt: -1 });
    const filtered = records.filter(r => r.task && r.task.status === 'ready_to_shipment' && !r.task.isDeleted);
    res.json({ status: 200, data: filtered });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.get('/by-user/:userId', auth('admin', 'manager'), async (req, res) => {
  try {
    const records = await Task.find({
      status: 'ready_to_shipment',
      isDeleted: false,
      assignedTo: req.params.userId,
    })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone')
      .sort({ createdAt: -1 });
    res.json({ status: 200, data: records });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.patch('/:id/sent', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    await ReadyToShipment.findByIdAndUpdate(req.params.id, { sentToShiprocket: true });
    res.json({ status: 200, message: 'Marked as sent' });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
