import express from 'express';
import interaktController from './interakt.controller.js';

const router = express.Router();

// Route to handle webhooks sent from Interakt
router.post('/webhook', interaktController.handleWebhook);
router.get('/webhook', (req, res) => res.status(200).send('OK'));
router.get('/test-webhook', interaktController.testWebhook);
router.get('/latest-leads', interaktController.latestLeads);

export default router;
