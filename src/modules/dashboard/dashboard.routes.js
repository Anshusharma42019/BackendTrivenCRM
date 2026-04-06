import express from 'express';
import auth from '../../middleware/auth.js';
import dashboardController from './dashboard.controller.js';

const router = express.Router();

router.get('/stats', auth('admin', 'manager', 'sales'), dashboardController.getStats);
router.get('/revenue-chart', auth('admin', 'manager', 'sales'), dashboardController.getRevenueChart);

export default router;
