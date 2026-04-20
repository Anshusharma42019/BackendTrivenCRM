import express from 'express';
import auth from '../../middleware/auth.js';
import Cnp from './cnp.model.js';

const router = express.Router();

router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const query = {};
    const { filter } = req.query;
    if (filter) {
      const now = new Date();
      const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (filter === 'today') {
        query.createdAt = { $gte: startOfDay(now) };
      } else if (filter === 'yesterday') {
        const start = startOfDay(new Date(now - 86400000));
        query.createdAt = { $gte: start, $lt: startOfDay(now) };
      } else if (filter === 'this_week') {
        const day = now.getDay();
        const start = startOfDay(new Date(now - day * 86400000));
        query.createdAt = { $gte: start };
      } else if (filter === 'this_month') {
        query.createdAt = { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
      }
    }
    const records = await Cnp.find(query)
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone')
      .sort({ createdAt: -1 });
    res.json({ status: 200, data: records });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.patch('/:id/increment', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const existing = await Cnp.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (existing.cnpCount >= 3) return res.status(400).json({ message: 'Max CNP count reached' });
    const record = await Cnp.findByIdAndUpdate(
      req.params.id,
      { $inc: { cnpCount: 1 }, lastCnpAt: new Date(), $push: { cnpHistory: { clickedAt: new Date() } } },
      { new: true }
    ).populate('assignedTo', 'name email').populate('lead', 'name phone');
    res.json({ status: 200, data: record });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

router.delete('/:id', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    await Cnp.findByIdAndDelete(req.params.id);
    res.json({ status: 200, message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
