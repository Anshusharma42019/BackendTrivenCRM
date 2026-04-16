import express from 'express';
import auth from '../../middleware/auth.js';
import CallAgain from './callagain.model.js';
import { Lead } from '../lead/lead.model.js';

const router = express.Router();

// GET all call-again records
router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const records = await CallAgain.find({ status: 'pending' })
      .populate('lead', 'name phone problem assignedTo')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });
    res.json({ status: 200, data: records });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

// POST create a call-again record from a lead
router.post('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ message: 'leadId is required' });

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    // Update lead status to follow_up
    await Lead.findByIdAndUpdate(leadId, { status: 'follow_up' });

    // Mark any pending/overdue tasks for this lead as cancel_call so they disappear from Tasks
    const { default: Task } = await import('../task/task.model.js');
    await Task.updateMany(
      { lead: leadId, status: { $in: ['pending', 'overdue'] }, isDeleted: false },
      { status: 'cancel_call' }
    );

    // Upsert — one record per lead
    const record = await CallAgain.findOneAndUpdate(
      { lead: leadId },
      { lead: leadId, assignedTo: lead.assignedTo, status: 'pending' },
      { upsert: true, new: true }
    ).populate('lead', 'name phone problem').populate('assignedTo', 'name email');

    res.json({ status: 200, data: record });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

// PATCH update status
router.patch('/:id', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const { status } = req.body;
    const record = await CallAgain.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('lead', 'name phone').populate('assignedTo', 'name email');

    if (!record) return res.status(404).json({ message: 'Not found' });

    // Sync lead status
    if (record.lead) {
      const leadStatus = status === 'converted' ? 'closed_won' : status === 'closed_lost' ? 'closed_lost' : status;
      await Lead.findByIdAndUpdate(record.lead._id || record.lead, { status: leadStatus });
    }

    res.json({ status: 200, data: record });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
