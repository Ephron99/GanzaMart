import { Router } from 'express';
import { formLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { contactRules } from '../validators/contentValidators.js';
import * as contentController from '../controllers/contentController.js';

const router = Router();

router.post('/', formLimiter, contactRules, validate, contentController.sendMessage);

export default router;
