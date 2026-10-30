// Business logic for authentication. Controllers stay thin; models only know SQL.
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';
import {
  emailExists, findUserByEmail, findUserById, findPublicUserById,
  insertUser, updatePasswordHash, bumpTokenVersion,
} from '../models/userModel.js';

const BCRYPT_ROUNDS = 12;
// Same generic message for "wrong password" and "no such account" so attackers
// cannot enumerate which e-mails are registered (user-enumeration defence).
const CREDENTIALS_INVALID = 'Invalid e-mail or password.';

// A syntactically valid bcrypt hash used to burn the same ~80ms as a real check
// when the account does not exist — otherwise a fast response reveals it.
const DUMMY_HASH = bcrypt.hashSync('timing-equalization-placeholder', BCRYPT_ROUNDS);

// Strip anything that must never cross the API boundary.
const toPublicUser = (u) => ({
  id: u.id,
  fullName: u.full_name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  isActive: Boolean(u.is_active),
  createdAt: u.created_at,
});

export async function register({ fullName, email, password, phone }) {
  if (await emailExists(email)) {
    throw new ApiError(409, 'An account with that e-mail already exists.');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // insertId → then read back the public row so we return database-truth values.
  const id = await insertUser({ fullName, email, phone, passwordHash });
  const user = await findPublicUserById(id);

  // Registered and signed in at once: better UX, fewer round-trips.
  return { user: toPublicUser(user), token: signToken(user) };
}

export async function login({ email, password }) {
  const user = await findUserByEmail(email);
  const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !match) throw new ApiError(401, CREDENTIALS_INVALID);
  if (!user.is_active) throw new ApiError(403, 'This account has been deactivated. Contact support.');

  return { user: toPublicUser(user), token: signToken(user) };
}

export async function currentUser(userId) {
  const user = await findPublicUserById(userId);
  if (!user) throw new ApiError(404, 'Account not found.');
  return toPublicUser(user);
}

// Real logout: bump token_version so every token issued before this moment —
// on any device — is rejected by the authenticate middleware.
export async function logout(userId) {
  await bumpTokenVersion(userId);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await findUserById(userId);
  if (!user) throw new ApiError(404, 'Account not found.');

  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new ApiError(401, 'Current password is incorrect.');
  }
  if (currentPassword === newPassword) {
    throw new ApiError(422, 'New password must be different from the current one.');
  }

  await updatePasswordHash(userId, await bcrypt.hash(newPassword, BCRYPT_ROUNDS));
  // Signing in with the new password is required afterwards — old sessions die.
  await bumpTokenVersion(userId);
}
