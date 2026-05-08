import express from 'express';
import auth from '../../middleware/auth.js';
import Verification from './verification.model.js';

const router = express.Router();

router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const records = await Verification.find({ status: { $nin: ['verified', 'on_hold'] }, isDeleted: { $ne: true } })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status address houseNo cityVillage cityVillageType postOffice landmark district state pincode problem')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ status: 200, data: records });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

// Sync tasks with status 'verification' into Verification collection
router.post('/sync', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const Task = (await import('../task/task.model.js')).default;

    const verificationTasks = await Task.find({ status: 'verification', isDeleted: false }, '_id title assignedTo lead dueDate description cityVillageType cityVillage houseNo postOffice district landmark pincode state reminderAt notes problem age weight height otherProblems problemDuration price');
    const existingTaskIds = await Verification.distinct('task');
    const existingSet = new Set(existingTaskIds.map(id => id.toString()));
    const newTasks = verificationTasks.filter(t => !existingSet.has(t._id.toString()));

    if (newTasks.length > 0) {
      try {
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
      } catch (err) {
        // Ignore duplicate key errors (11000) during bulk insert
        if (err.code !== 11000) console.error('Sync insert error:', err);
      }
    }

    const existingTasks = verificationTasks.filter(t => existingSet.has(t._id.toString()));
    if (existingTasks.length > 0) {
      const ops = existingTasks.map(task => ({
        updateOne: {
          filter: { task: task._id },
          update: { 
            $set: { 
              title: task.title, assignedTo: task.assignedTo, lead: task.lead,
              age: task.age, weight: task.weight, height: task.height, price: task.price, 
              problem: task.problem, otherProblems: task.otherProblems, 
              problemDuration: task.problemDuration, description: task.description, 
              cityVillageType: task.cityVillageType, cityVillage: task.cityVillage, 
              houseNo: task.houseNo, postOffice: task.postOffice, district: task.district, 
              landmark: task.landmark, pincode: task.pincode, state: task.state, 
              reminderAt: task.reminderAt 
            } 
          }
        }
      }));
      await Verification.bulkWrite(ops, { ordered: false }).catch(err => console.error('Sync bulkWrite error:', err));
    }

    res.json({ status: 200, message: `Synced ${newTasks.length} new records` });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

// MUST be before /:id routes
router.post('/repair', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const Task = (await import('../task/task.model.js')).default;
    const ReadyToShipment = (await import('../readytoshipment/readytoshipment.model.js')).default;
    const Lead = (await import('../lead/lead.model.js')).default;

    // Fix on_hold: sync lead status
    const onHoldRecords = await Verification.find({ status: 'on_hold' }).lean();
    for (const record of onHoldRecords) {
      if (record.lead) await Lead.findByIdAndUpdate(record.lead, {
        status: 'on_hold',
        cnp: false,
        ...(record.onHoldReason && { onHoldReason: record.onHoldReason }),
        ...(record.onHoldUntil && { onHoldUntil: record.onHoldUntil }),
      });
      if (record.task) await Task.findByIdAndUpdate(record.task, { status: 'on_hold' });
    }

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

router.get('/on-hold', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const Lead = (await import('../lead/lead.model.js')).default;

    // Get verification on-hold records
    const verificationRecords = await Verification.find({ status: 'on_hold', isDeleted: { $ne: true } })
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone status onHoldReason onHoldUntil address houseNo cityVillage cityVillageType postOffice landmark district state pincode problem')
      .sort({ onHoldUntil: 1 })
      .lean();

    // Get lead IDs already covered by verification records
    const verificationLeadIds = new Set(
      verificationRecords.map(r => r.lead?._id?.toString()).filter(Boolean)
    );

    const mongoose = (await import('mongoose')).default;
    // Get pipeline on-hold leads NOT in verification
    const pipelineOnHoldLeads = await Lead.find({
      status: 'on_hold',
      isDeleted: false,
      _id: { $nin: [...verificationLeadIds].map(id => new mongoose.Types.ObjectId(id)) },
    })
      .populate('assignedTo', 'name email')
      .sort({ onHoldUntil: 1 })
      .lean();

    // Shape pipeline leads to match verification record structure
    const pipelineRecords = pipelineOnHoldLeads.map(lead => ({
      _id: lead._id,
      title: `Call ${lead.name}`,
      status: 'on_hold',
      onHoldReason: lead.onHoldReason,
      onHoldUntil: lead.onHoldUntil,
      assignedTo: lead.assignedTo,
      lead: lead,
      createdAt: lead.createdAt,
      _isPipelineOnly: true,
    }));

    res.json({ status: 200, data: [...verificationRecords, ...pipelineRecords] });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.patch('/:id', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const { status, onHoldUntil, onHoldReason, ...taskFields } = req.body;
    const update = { ...taskFields };
    if (status) update.status = status;
    if (onHoldUntil) update.onHoldUntil = onHoldUntil;
    if (onHoldReason) update.onHoldReason = onHoldReason;

    const record = await Verification.findByIdAndUpdate(
      req.params.id,
      update,
      { returnDocument: 'after' }
    ).populate('assignedTo', 'name email').populate('lead', 'name phone status address houseNo cityVillage cityVillageType postOffice landmark district state pincode problem');
    if (!record) return res.status(404).json({ message: 'Not found' });

    const Task = (await import('../task/task.model.js')).default;
    const ReadyToShipment = (await import('../readytoshipment/readytoshipment.model.js')).default;

    if (status === 'on_hold' && record.lead) {
      const Lead = (await import('../lead/lead.model.js')).default;
      const leadId = record.lead._id || record.lead;
      await Lead.findByIdAndUpdate(leadId, {
        status: 'on_hold',
        cnp: false,
        isDeleted: false,
        ...(onHoldReason && { onHoldReason }),
        ...(onHoldUntil && { onHoldUntil }),
      });
      // Set task status to on_hold so lead appears in Pipeline On Hold list
      if (record.task) {
        await Task.findByIdAndUpdate(record.task, { status: 'on_hold', isDeleted: false });
      }
    }

    if (status === 'pending' && record.lead) {
      const Lead = (await import('../lead/lead.model.js')).default;
      const leadId = record.lead._id || record.lead;
      await Lead.findByIdAndUpdate(leadId, { status: 'new', cnp: false, isDeleted: false });
      if (record.task) {
        await Task.findByIdAndUpdate(record.task, { status: 'verification', isDeleted: false });
      }
    }

    if (status === 'verified' && record.task) {
      const taskUpdate = await Task.findByIdAndUpdate(
        record.task,
        { status: 'ready_to_shipment', ...taskFields },
        { returnDocument: 'after' }
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
        { upsert: true, returnDocument: 'after' }
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
    const Lead = (await import('../lead/lead.model.js')).default;
    const Task = (await import('../task/task.model.js')).default;
    const leadService = await import('../lead/lead.service.js');

    const record = await Verification.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date() }, { returnDocument: 'after' });
    
    if (record) {
      if (record.lead) {
        await leadService.deleteLead(record.lead).catch(() => {});
      } else if (record.task) {
        await Task.findByIdAndUpdate(record.task, { isDeleted: true, deletedAt: new Date() }).catch(() => {});
      }
      return res.json({ message: 'Verification record and associated lead soft deleted' });
    }

    // If not found in Verification, check if it's a Lead ID (pipeline-only on-hold records)
    try {
      await leadService.deleteLead(req.params.id);
      return res.json({ message: 'Pipeline record and associated tasks soft deleted' });
    } catch (err) {
      return res.json({ message: 'Record already deleted' });
    }
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
