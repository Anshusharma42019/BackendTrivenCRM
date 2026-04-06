import express from 'express';
import validate from '../../middleware/validate.js';
import * as authValidation from './auth.validation.js';
import authController from './auth.controller.js';

const router = express.Router();

router.post('/register', validate(authValidation.register), authController.register);
router.post('/login', validate(authValidation.login), authController.login);
router.post('/refresh-tokens', validate(authValidation.refreshToken), authController.refreshTokens);
router.post('/logout', authController.logout);

export default router;
