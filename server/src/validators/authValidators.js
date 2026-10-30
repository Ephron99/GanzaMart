import { body } from 'express-validator';

// Server-side validation is the authority (spec §9); the React rules only
// exist to give instant feedback and always mirror these constraints.
export const registerRules = [
  body('fullName')
    .trim().isLength({ min: 2, max: 100 }).withMessage('Full name must be 2–100 characters.')
    // Note: we store text as typed and do NOT html-escape it. Parameterized SQL
    // makes injection impossible, and React escapes output when rendering.
    // Escaping here would corrupt real names containing apostrophes.
    .customSanitizer((v) => v.replace(/\s+/g, ' ')),   // collapse double/trailing spaces
  body('email')
    .trim().toLowerCase().isEmail().withMessage('A valid e-mail address is required.')
    .isLength({ max: 191 }).withMessage('E-mail is too long.'),
  body('password')
    .isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 0, minNumbers: 1, minSymbols: 0 })
    .withMessage('Password must be at least 8 characters and contain a letter and a number.'),
  body('phone')
    .optional({ emptyStyle: 'null' })
    .trim().matches(/^\+?[0-9\s-]{7,20}$/).withMessage('Phone must be 7–20 digits (optional leading +).'),
  // Role is intentionally NOT accepted from the request body — privilege
  // escalation via registration is impossible; only admins can change roles.
  body('role').not().exists().withMessage('You cannot choose your own role.'),
  body('token_version').not().exists().withMessage('Unexpected field.'),
  body('is_active').not().exists().withMessage('Unexpected field.'),
];

export const loginRules = [
  body('email').trim().toLowerCase().isEmail().withMessage('A valid e-mail address is required.'),
  body('password').isString().notEmpty().withMessage('Password is required.'),
];

export const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 0, minNumbers: 1, minSymbols: 0 })
    .withMessage('New password must be at least 8 characters and contain a letter and a number.'),
];
