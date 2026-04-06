import express from 'express';
import auth from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import * as leadValidation from './lead.validation.js';
import leadController from './lead.controller.js';

const router = express.Router();

// Public route — no token required (website inquiry form)
router.post('/submit', validate(leadValidation.createLead), leadController.submitLead);

router
  .route('/')
  .post(auth('admin', 'manager', 'sales'), validate(leadValidation.createLead), leadController.createLead)
  .get(auth('admin', 'manager', 'sales'), validate(leadValidation.getLeads), leadController.getLeads);

router.patch('/:leadId/assign', auth('admin', 'manager'), validate(leadValidation.assignLead), leadController.assignLead);
router.patch('/:leadId/cnp', auth('admin', 'manager', 'sales'), leadController.markCNP);
router.patch('/:leadId/uncnp', auth('admin', 'manager', 'sales'), leadController.unmarkCNP);
router.post('/:leadId/notes', auth('admin', 'manager', 'sales'), leadController.addNote);

router
  .route('/:leadId')
  .get(auth('admin', 'manager', 'sales'), validate(leadValidation.getLead), leadController.getLead)
  .patch(auth('admin', 'manager', 'sales'), validate(leadValidation.updateLead), leadController.updateLead)
  .delete(auth('admin', 'manager'), validate(leadValidation.deleteLead), leadController.deleteLead);

export default router;
