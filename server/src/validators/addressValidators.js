import { body, param } from 'express-validator';

// PUT sends the whole address, so create and update share one rule set. The client
// never supplies the owner (user_id) or timestamps — those are refused outright.
const addressBodyRules = [
  body('label').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 50 })
    .withMessage('Label must be 1–50 characters.'),
  body('recipient').exists().withMessage('Recipient name is required.')
    .trim().isLength({ min: 2, max: 100 }).withMessage('Recipient must be 2–100 characters.'),
  body('phone').exists().withMessage('Contact phone is required.')
    .trim().matches(/^[+()0-9\s-]{7,20}$/).withMessage('Phone may contain digits, spaces and + ( ) - only.'),
  body('line1').exists().withMessage('Street address is required.')
    .trim().isLength({ min: 3, max: 150 }).withMessage('Address line 1 must be 3–150 characters.'),
  body('line2').optional({ values: 'falsy' }).trim().isLength({ max: 150 })
    .withMessage('Address line 2 is too long.'),
  body('city').exists().withMessage('City is required.')
    .trim().isLength({ min: 2, max: 80 }).withMessage('City must be 2–80 characters.'),
  body('province').optional({ values: 'falsy' }).trim().isLength({ max: 80 })
    .withMessage('Province is too long.'),
  body('postalCode').optional({ values: 'falsy' }).trim().isLength({ max: 20 })
    .withMessage('Postal code is too long.'),
  body('country').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 60 })
    .withMessage('Country must be 2–60 characters.'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be true or false.').toBoolean(),
  body('userId').not().exists().withMessage('Unexpected field: userId.'),
  body('id').not().exists().withMessage('Unexpected field: id.'),
];

export const createAddressRules = addressBodyRules;
export const updateAddressRules = addressBodyRules;

export const addressParamRules = [
  param('id').isInt({ min: 1 }).withMessage('Address id must be a positive integer.').toInt(),
];
