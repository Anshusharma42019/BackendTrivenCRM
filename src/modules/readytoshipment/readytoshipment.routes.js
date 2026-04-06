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
      .populate('task')
      .sort({ createdAt: -1 });

    res.json({ status: 200, data: records });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
