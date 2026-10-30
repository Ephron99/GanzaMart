import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { registerRules, loginRules, changePasswordRules } from '../validators/authValidators.js';

const router = Router();

// Public (rate-limited: these are the credential-attack surface)
router.post('/register', authLimiter, registerRules, validate, authController.register);
router.post('/login',    authLimiter, loginRules,    validate, authController.login);

// Authenticated
router.get('/me',            authenticate, authController.me);
router.post('/logout',       authenticate, authController.logout);
router.post('/change-password', authenticate, changePasswordRules, validate, authController.changePassword);

export default router;
