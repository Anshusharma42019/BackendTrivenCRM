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

    const existingTasks = verificationTasks.filter(t => existingSet.has(t._id.toString()));
    if (existingTasks.length > 0) {
      await Promise.all(existingTasks.map(task =>
        Verification.updateOne(
          { task: task._id },
          { $set: { title: task.title, assignedTo: task.assignedTo, lead: task.lead } }
        ).then(() =>
          Verification.updateOne(
            { task: task._id, age: { $exists: false } },
            { $set: { age: task.age, weight: task.weight, height: task.height, price: task.price, problem: task.problem, otherProblems: task.otherProblems, problemDuration: task.problemDuration, description: task.description, cityVillageType: task.cityVillageType, cityVillage: task.cityVillage, houseNo: task.houseNo, postOffice: task.postOffice, district: task.district, landmark: task.landmark, pincode: task.pincode, state: task.state, reminderAt: task.reminderAt } }
          )
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

// MUST be before /:id routes
router.post('/repair', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const Task = (await import('../task/task.model.js')).default;
    const ReadyToShipment = (await import('../readytoshipment/readytoshipment.model.js')).default;

    const verifiedRecords = await Verification.find({ status: 'verified' })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone');

    let fixed = 0;
    for (const record of verifiedRecords) {
      if (!record.task) continue;
      await Task.findByIdAndUpdate(record.task, { status: 'ready_to_shipment' });
      await ReadyToShipment.findOneAndUpdate(
        { task: record.task },
        {
          $set: {
            title: record.title,
            assignedTo: record.assignedTo?._id || record.assignedTo,
            lead: record.lead?._id || record.lead,
            description: record.description,
            problem: record.problem,
            age: record.age, weight: record.weight, height: record.height,
            otherProblems: record.otherProblems, problemDuration: record.problemDuration,
            price: record.price,
            cityVillageType: record.cityVillageType, cityVillage: record.cityVillage,
            houseNo: record.houseNo, postOffice: record.postOffice,
            district: record.district, landmark: record.landmark,
            pincode: record.pincode, state: record.state,
            reminderAt: record.reminderAt,
          },
          $setOnInsert: { task: record.task },
        },
        { upsert: true }
      );
      fixed++;
    }
    res.json({ status: 200, message: `Repaired ${fixed} records` });
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

    const Task = (await import('../task/task.model.js')).default;
    const ReadyToShipment = (await import('../readytoshipment/readytoshipment.model.js')).default;

    if (status === 'verified' && record.task) {
      const taskUpdate = await Task.findByIdAndUpdate(
        record.task,
        { status: 'ready_to_shipment', ...taskFields },
        { new: true }
      );
      if (!taskUpdate) return res.status(500).json({ status: 500, message: 'Task not found' });

      await ReadyToShipment.findOneAndUpdate(
        { task: record.task },
        {
          $set: {
            title: record.title,
            assignedTo: record.assignedTo?._id || record.assignedTo,
            lead: record.lead?._id || record.lead,
            description: record.description,
            problem: record.problem,
            age: record.age, weight: record.weight, height: record.height,
            otherProblems: record.otherProblems, problemDuration: record.problemDuration,
            price: record.price,
            cityVillageType: record.cityVillageType, cityVillage: record.cityVillage,
            houseNo: record.houseNo, postOffice: record.postOffice,
            district: record.district, landmark: record.landmark,
            pincode: record.pincode, state: record.state,
            reminderAt: record.reminderAt,
          },
          $setOnInsert: { task: record.task },
        },
        { upsert: true, new: true }
      );
    } else if (record.task && Object.keys(taskFields).length > 0) {
      await Task.findByIdAndUpdate(record.task, taskFields);
    }

    res.json({ status: 200, data: record });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.delete('/:id', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const record = await Verification.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: 'Not found' });
    if (record.task) {
      const Task = (await import('../task/task.model.js')).default;
      await Task.findByIdAndUpdate(record.task, { isDeleted: true });
    }
    res.json({ status: 200, message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
