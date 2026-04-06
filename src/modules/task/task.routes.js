import express from 'express';
import auth from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import * as taskValidation from './task.validation.js';
import taskController from './task.controller.js';

const router = express.Router();

router.get('/daily', auth('admin', 'manager', 'sales'), taskController.getDailyTasks);

router
  .route('/')
  .post(auth('admin', 'manager', 'sales'), validate(taskValidation.createTask), taskController.createTask)
  .get(auth('admin', 'manager', 'sales'), validate(taskValidation.getTasks), taskController.getTasks);

router
  .route('/:taskId')
  .get(auth('admin', 'manager', 'sales'), validate(taskValidation.getTask), taskController.getTask)
  .patch(auth('admin', 'manager', 'sales'), validate(taskValidation.updateTask), taskController.updateTask)
  .delete(auth('admin', 'manager'), validate(taskValidation.deleteTask), taskController.deleteTask);

router.post('/:taskId/notes', auth('admin', 'manager', 'sales'), taskController.addNote);

export default router;
