import express from 'express';
import auth from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import * as userValidation from './user.validation.js';
import userController from './user.controller.js';

const router = express.Router();

router
  .route('/')
  .post(auth('admin', 'manager'), validate(userValidation.createUser), userController.createUser)
  .get(auth('admin', 'manager'), validate(userValidation.getUsers), userController.getUsers);

router.get('/stats/shipment-counts', auth('admin', 'manager'), userController.getStaffShipmentCounts);

router
  .route('/:userId')
  .get(auth('admin', 'manager', 'sales'), validate(userValidation.getUser), userController.getUser)
  .patch(auth('admin', 'manager'), validate(userValidation.updateUser), userController.updateUser)
  .delete(auth('admin'), validate(userValidation.deleteUser), userController.deleteUser);

export default router;
