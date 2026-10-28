import crypto from 'node:crypto';
import { getAllowedOrigins } from '../config/env.js';
import { csrfCookieOptions, getCsrfCookieName } from './cookies.js';

function macFor(nonce) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(nonce).digest('hex');
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isValidSignedToken(value) {
  if (typeof value !== 'string') return false;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return false;
  const nonce = value.slice(0, separator);
  const suppliedMac = value.slice(separator + 1);
  if (!/^[a-f0-9]{64}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(suppliedMac)) return false;
  return safeEqual(suppliedMac, macFor(nonce));
}

export function issueCsrfToken(res) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const token = `${nonce}.${macFor(nonce)}`;
  res.cookie(getCsrfCookieName(), token, csrfCookieOptions());
  return token;
}

export function bootstrapCsrf(req, res) {
  const cookieToken = req.cookies?.[getCsrfCookieName()];
  const token = isValidSignedToken(cookieToken) ? cookieToken : issueCsrfToken(res);
  res.set('Cache-Control', 'no-store');
  return res.json({ csrfToken: token });
}

export function requireCsrf(req, res, next) {
  const origin = req.get('origin');
  const allowedOrigins = getAllowedOrigins();
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Request origin is not allowed' });
  }

  const cookieToken = req.cookies?.[getCsrfCookieName()];
  const headerToken = req.get('x-csrf-token');
  if (!isValidSignedToken(cookieToken) || !safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({ error: 'CSRF verification failed. Refresh the page and try again.' });
  }
  return next();
}
