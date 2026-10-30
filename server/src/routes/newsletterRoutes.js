import { Router } from 'express';
import { formLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { newsletterRules } from '../validators/contentValidators.js';
import * as contentController from '../controllers/contentController.js';

const router = Router();

router.post('/', formLimiter, newsletterRules, validate, contentController.subscribe);

export default router;
