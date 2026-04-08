import express from 'express';
import auth from '../../middleware/auth.js';
import Verification from './verification.model.js';

const router = express.Router();

router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    // Sync any tasks with status=verification that aren't in Verification collection yet
    const verificationTasks = await (await import('../task/task.model.js')).default
      .find({ status: 'verification', isDeleted: false })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status');

    for (const task of verificationTasks) {
      await Verification.findOneAndUpdate(
        { task: task._id },
        { task: task._id, title: task.title, assignedTo: task.assignedTo?._id, lead: task.lead?._id,
          dueDate: task.dueDate, description: task.description,
          cityVillageType: task.cityVillageType, cityVillage: task.cityVillage,
          houseNo: task.houseNo, postOffice: task.postOffice, district: task.district,
          landmark: task.landmark, pincode: task.pincode, state: task.state,
          reminderAt: task.reminderAt, notes: task.notes },
        { upsert: true }
      );
    }

    const records = await Verification.find()
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status')
      .populate('task')
      .sort({ createdAt: -1 });
    res.json({ status: 200, data: records });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.patch('/:id', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const record = await Verification.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status, ...(req.body.onHoldUntil && { onHoldUntil: req.body.onHoldUntil }) },
      { new: true }
    ).populate('assignedTo', 'name email').populate('lead', 'name phone');
    if (!record) return res.status(404).json({ message: 'Not found' });
    res.json({ status: 200, data: record });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
