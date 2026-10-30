import * as contentService from '../services/contentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/httpResponse.js';

// POST /api/newsletter — public, rate limited, idempotent per e-mail address.
export const subscribe = asyncHandler(async (req, res) => {
  const result = await contentService.subscribeToNewsletter(req.body.email);
  // 201 only when a row was really added; a repeat address gets a plain 200 so the
  // client can show one success message without parsing two shapes.
  return result.alreadySubscribed
    ? ok(res, result)
    : created(res, result);
});

// POST /api/contact — public, rate limited, returns a reference number.
export const sendMessage = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  created(res, await contentService.submitContactMessage({ name, email, phone, subject, message }));
});
