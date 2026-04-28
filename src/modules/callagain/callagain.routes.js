import express from 'express';
import auth from '../../middleware/auth.js';
import CallAgain from './callagain.model.js';
import { Lead } from '../lead/lead.model.js';

const router = express.Router();

// GET all call-again records
router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const query = { status: { $in: ['pending'] } };
    if (req.user.role === 'sales') query.assignedTo = req.user._id;
    const { filter } = req.query;
    if (filter) {
      const now = new Date();
      const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (filter === 'today') query.createdAt = { $gte: startOfDay(now) };
      else if (filter === 'yesterday') {
        const start = startOfDay(new Date(now - 86400000));
        query.createdAt = { $gte: start, $lt: startOfDay(now) };
      } else if (filter === 'this_week') {
        query.createdAt = { $gte: startOfDay(new Date(now - now.getDay() * 86400000)) };
      } else if (filter === 'this_month') {
        query.createdAt = { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
      }
    }
    const records = await CallAgain.find(query)
      .populate('lead', 'name phone problem email address source status type revenue assignedTo createdBy cnpCount cnpAt notes note createdAt')
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
      { lead: leadId, assignedTo: lead.assignedTo?._id || lead.assignedTo, status: 'pending' },
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

    // Sync lead status (skip for 'done' status)
    if (record.lead && status !== 'done') {
      const leadStatus = status === 'converted' ? 'closed_won' : status === 'closed_lost' ? 'closed_lost' : status;
      await Lead.findByIdAndUpdate(record.lead._id || record.lead, { status: leadStatus, cnp: false });
    }

    res.json({ status: 200, data: record });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
