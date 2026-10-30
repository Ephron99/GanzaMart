import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import * as addressController from '../controllers/addressController.js';
import { validate } from '../middleware/validate.js';
import { createAddressRules, updateAddressRules, addressParamRules } from '../validators/addressValidators.js';

const router = Router();

// The address book is strictly private: every route needs a signed-in customer, and
// the service scopes each query to that user's id.
router.use(authenticate);

router.get('/', addressController.list);
router.post('/', createAddressRules, validate, addressController.create);
router.get('/:id', addressParamRules, validate, addressController.getOne);
router.put('/:id', addressParamRules, updateAddressRules, validate, addressController.update);
router.patch('/:id/default', addressParamRules, validate, addressController.makeDefault);
router.delete('/:id', addressParamRules, validate, addressController.remove);

export default router;
