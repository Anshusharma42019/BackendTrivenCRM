import express from 'express';
import auth from '../../middleware/auth.js';
import dashboardController from './dashboard.controller.js';

const router = express.Router();

router.get('/stats', auth('admin', 'manager'), dashboardController.getStats);
router.get('/revenue-chart', auth('admin', 'manager'), dashboardController.getRevenueChart);
router.get('/staff-stats', auth('sales', 'admin', 'manager'), dashboardController.getStaffStats);
router.post('/staff-target', auth('sales', 'admin', 'manager'), dashboardController.setStaffTarget);
router.get('/staff-verifications', auth('sales', 'admin', 'manager'), dashboardController.getStaffVerifications);
router.get('/staff-today-lists', auth('sales', 'admin', 'manager'), dashboardController.getStaffTodayLists);
router.get('/staff-monthly-chart', auth('sales', 'admin', 'manager'), dashboardController.getStaffMonthlyChart);
router.get('/all-staff-stats', auth('admin', 'manager'), dashboardController.getAllStaffStats);

export default router;
