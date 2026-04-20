import express from 'express';
import auth from '../../middleware/auth.js';
import Verification from './verification.model.js';

const router = express.Router();

router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const Task = (await import('../task/task.model.js')).default;

    const verificationTasks = await Task.find({ status: 'verification', isDeleted: false }, '_id title assignedTo lead dueDate description cityVillageType cityVillage houseNo postOffice district landmark pincode state reminderAt notes problem age weight height otherProblems problemDuration price');
    const existingTaskIds = await Verification.distinct('task');
    const existingSet = new Set(existingTaskIds.map(id => id.toString()));
    const newTasks = verificationTasks.filter(t => !existingSet.has(t._id.toString()));

    if (newTasks.length > 0) {
      await Verification.insertMany(
        newTasks.map(task => ({
          task: task._id, title: task.title, assignedTo: task.assignedTo, lead: task.lead,
          dueDate: task.dueDate, description: task.description,
          cityVillageType: task.cityVillageType, cityVillage: task.cityVillage,
          houseNo: task.houseNo, postOffice: task.postOffice, district: task.district,
          landmark: task.landmark, pincode: task.pincode, state: task.state,
          reminderAt: task.reminderAt, notes: task.notes,
          problem: task.problem, age: task.age, weight: task.weight, height: task.height,
          otherProblems: task.otherProblems, problemDuration: task.problemDuration, price: task.price,
        })),
        { ordered: false }
      );
    }

    // Sync existing verification records with latest task data
    const existingTasks = verificationTasks.filter(t => existingSet.has(t._id.toString()));
    if (existingTasks.length > 0) {
      await Promise.all(existingTasks.map(task => 
        Verification.updateOne(
          { task: task._id },
          {
            title: task.title, assignedTo: task.assignedTo, lead: task.lead,
            dueDate: task.dueDate, description: task.description,
            cityVillageType: task.cityVillageType, cityVillage: task.cityVillage,
            houseNo: task.houseNo, postOffice: task.postOffice, district: task.district,
            landmark: task.landmark, pincode: task.pincode, state: task.state,
            reminderAt: task.reminderAt, notes: task.notes,
            problem: task.problem, age: task.age, weight: task.weight, height: task.height,
            otherProblems: task.otherProblems, problemDuration: task.problemDuration, price: task.price,
          }
        )
      ));
    }

    const records = await Verification.find({ status: { $ne: 'verified' } })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ status: 200, data: records });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.patch('/:id', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const { status, onHoldUntil, ...taskFields } = req.body;
    const update = { ...taskFields };
    if (status) update.status = status;
    if (onHoldUntil) update.onHoldUntil = onHoldUntil;

    const record = await Verification.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    ).populate('assignedTo', 'name email').populate('lead', 'name phone');
    if (!record) return res.status(404).json({ message: 'Not found' });

    // Sync task fields back to the Task document
    if (record.task) {
      const Task = (await import('../task/task.model.js')).default;
      await Task.findByIdAndUpdate(record.task, taskFields);
    }

    res.json({ status: 200, data: record });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
