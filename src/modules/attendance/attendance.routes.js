import express from 'express';
import auth from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import * as attendanceValidation from './attendance.validation.js';
import attendanceController from './attendance.controller.js';

const router = express.Router();

// Staff: clock in
router.post(
  '/check-in',
  auth('admin', 'manager', 'sales'),
  validate(attendanceValidation.checkIn),
  attendanceController.checkIn
);

// Staff: clock out
router.post(
  '/check-out',
  auth('admin', 'manager', 'sales'),
  validate(attendanceValidation.checkOut),
  attendanceController.checkOut
);

// Staff: today's status
router.get(
  '/today',
  auth('admin', 'manager', 'sales'),
  attendanceController.getTodayStatus
);

// Staff: my attendance history
router.get(
  '/me',
  auth('admin', 'manager', 'sales'),
  validate(attendanceValidation.getMyAttendance),
  attendanceController.getMyAttendance
);

// Admin/Manager: all staff attendance
router.get(
  '/',
  auth('admin', 'manager'),
  validate(attendanceValidation.getAttendance),
  attendanceController.getAllAttendance
);

// Admin/Manager: update attendance record
router.patch(
  '/:attendanceId',
  auth('admin', 'manager'),
  validate(attendanceValidation.updateAttendance),
  attendanceController.updateAttendance
);

export default router;
