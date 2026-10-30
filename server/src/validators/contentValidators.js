import { body, query } from 'express-validator';

// Validation for the public forms (spec §3I/§4). These endpoints need no account,
// so they are the ones a bot will target: length caps stop a 5 MB "message" from
// ever reaching MySQL, and unknown fields are refused outright.
export const newsletterRules = [
  body('email').exists().withMessage('E-mail address is required.')
    .isEmail().withMessage('Enter a valid e-mail address.')
    .normalizeEmail().withMessage('Enter a valid e-mail address.')
    .isLength({ max: 191 }).withMessage('E-mail address is too long.'),
  body('id').not().exists().withMessage('Unexpected field.'),
  body('created_at').not().exists().withMessage('Unexpected field.'),
];

export const contactRules = [
  body('name').isString().trim().isLength({ min: 2, max: 100 })
    .withMessage('Please tell us your name (2–100 characters).'),
  body('email').exists().withMessage('E-mail address is required.')
    .isEmail().withMessage('Enter a valid e-mail address.')
    .normalizeEmail().withMessage('Enter a valid e-mail address.')
    .isLength({ max: 191 }).withMessage('E-mail address is too long.'),
  // `optional({ values: 'falsy' })` lets the browser send phone:"" for a field the
  // visitor left empty, while still rejecting a value that is not a phone number.
  body('phone').optional({ values: 'falsy' })
    .matches(/^[+()0-9\s-]{7,20}$/).withMessage('Phone number may contain digits, spaces and + ( ) - only.'),
  body('subject').isString().trim().isLength({ min: 3, max: 150 })
    .withMessage('Please add a subject (3–150 characters).'),
  body('message').isString().trim().isLength({ min: 10, max: 2000 })
    .withMessage('Your message must be between 10 and 2000 characters.'),
  // is_handled is an admin workflow field: a visitor must never be able to file
  // their own message as "already handled", or it disappears from the queue.
  body('is_handled').not().exists().withMessage('Unexpected field.'),
  body('isHandled').not().exists().withMessage('Unexpected field.'),
  body('id').not().exists().withMessage('Unexpected field.'),
];

export const reviewQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be ≥ 1.').toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1–50.').toInt(),
];
