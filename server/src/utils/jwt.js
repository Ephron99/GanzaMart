import jwt from 'jsonwebtoken';
import process from 'node:process';

// All JWT traffic goes through here so the secret and the verification rules
// live in exactly one place.
const ISSUER = 'ganza-mart-api';

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      // tv = token_version. Logging out bumps the DB value, which instantly
      // invalidates every token signed with an older number.
      tv: user.token_version,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d', issuer: ISSUER }
  );
}

// Throws JsonWebTokenError / TokenExpiredError, which the auth middleware maps to 401.
export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { issuer: ISSUER });
}
