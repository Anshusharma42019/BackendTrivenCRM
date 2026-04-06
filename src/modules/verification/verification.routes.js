import express from 'express';
import auth from '../../middleware/auth.js';
import Verification from './verification.model.js';

const router = express.Router();

router.get('/', auth('admin', 'manager', 'sales'), async (req, res) => {
  try {
    const records = await Verification.find()
      .populate('assignedTo', 'name email')
      .populate('lead', 'name phone')
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
      { status: req.body.status },
      { new: true }
    ).populate('assignedTo', 'name email').populate('lead', 'name phone');
    if (!record) return res.status(404).json({ message: 'Not found' });
    res.json({ status: 200, data: record });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
