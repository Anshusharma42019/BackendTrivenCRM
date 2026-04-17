import express from 'express';
import auth from '../../middleware/auth.js';
import ReadyToShipment from './readytoshipment.model.js';
import Task from '../task/task.model.js';

const router = express.Router();

router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    // Auto-sync tasks with status=ready_to_shipment
    const tasks = await Task.find({ status: 'ready_to_shipment', isDeleted: false })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status');

    for (const task of tasks) {
      await ReadyToShipment.findOneAndUpdate(
        { task: task._id },
        {
          task: task._id, title: task.title,
          assignedTo: task.assignedTo?._id, lead: task.lead?._id,
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
        { upsert: true }
      );
    }

    const records = await ReadyToShipment.find()
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status')
      .populate({ path: 'task', match: { status: 'ready_to_shipment', isDeleted: false } })
      .sort({ createdAt: -1 });

    const filtered = records.filter(r => r.task !== null && !r.sentToShiprocket);
    res.json({ status: 200, data: filtered });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.get('/for-shipment', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const records = await ReadyToShipment.find()
      .populate('lead', 'name phone email address')
      .populate('task', 'title')
      .sort({ createdAt: -1 });
    res.json({ status: 200, data: records });
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
