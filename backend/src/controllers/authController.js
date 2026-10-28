import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User, { HOSPITAL_ROLES } from '../models/User.js';
import Tenant from '../models/Tenant.js';
import {
  getSessionCookieName,
  parseExpiryToMs,
  sessionCookieOptions
} from '../security/cookies.js';
import { issueCsrfToken } from '../security/csrf.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issueSessionCookie(res, user) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '4h';
  const token = jwt.sign(
    { sub: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn, issuer: 'bedallocation-api', audience: 'bedallocation-client', algorithm: 'HS256' }
  );
  res.cookie(getSessionCookieName(), token, sessionCookieOptions(parseExpiryToMs(expiresIn)));
}

function clearSessionCookie(res) {
  res.clearCookie(getSessionCookieName(), {
    path: '/',
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    sameSite: String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase(),
    httpOnly: true
  });
}

function safeTenant(tenant) {
  return tenant ? { id: tenant._id.toString(), name: tenant.name, slug: tenant.slug, status: tenant.status } : null;
}

export async function login(req, res, next) {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const tenantSlug = String(req.body?.tenantSlug ?? '').trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254 || password.length === 0 || password.length > 128) {
      return res.status(400).json({ error: 'Enter a valid email and password' });
    }

    let user = null;
    let tenant = null;
    if (tenantSlug) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug) || tenantSlug.length > 60) {
        return res.status(401).json({ error: 'Invalid hospital workspace or credentials' });
      }
      tenant = await Tenant.findOne({ slug: tenantSlug, status: 'active' });
      if (tenant) user = await User.findOne({ tenantId: tenant._id, email }).select('+passwordHash');
    } else {
      // Platform administrators sign in without a hospital slug.
      user = await User.findOne({ role: 'platform_admin', email }).select('+passwordHash');
    }

    const passwordMatches = user ? await user.comparePassword(password) : false;
    if (!user || !passwordMatches || !user.isActive) {
      return res.status(401).json({ error: 'Invalid hospital workspace or credentials' });
    }

    if (user.role === 'platform_admin' && tenantSlug) {
      return res.status(401).json({ error: 'Invalid hospital workspace or credentials' });
    }
    if (user.role !== 'platform_admin' && (!tenant || user.tenantId.toString() !== tenant._id.toString())) {
      return res.status(401).json({ error: 'Invalid hospital workspace or credentials' });
    }

    user.lastLoginAt = new Date();
    await user.save();
    issueSessionCookie(res, user);
    const csrfToken = issueCsrfToken(res);
    res.set('Cache-Control', 'no-store');
    return res.json({ user: user.toSafeJSON(), tenant: safeTenant(tenant), csrfToken });
  } catch (error) {
    return next(error);
  }
}

export async function getMe(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.json({ user: req.user.toSafeJSON(), tenant: safeTenant(req.tenant) });
}

export async function logout(req, res) {
  clearSessionCookie(res);
  res.clearCookie(process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true' ? '__Host-ba_csrf' : 'ba_csrf', {
    path: '/', secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    sameSite: String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase(), httpOnly: true
  });
  return res.status(204).end();
}

export async function createHospitalUser(req, res, next) {
  try {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const role = String(req.body?.role ?? 'staff');

    if (!name || name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Name must contain 2 to 100 characters' });
    if (!emailPattern.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address' });
    if (password.length < 14 || password.length > 128) return res.status(400).json({ error: 'Password must contain 14 to 128 characters' });
    if (!HOSPITAL_ROLES.filter((item) => item !== 'hospital_admin').includes(role)) {
      return res.status(400).json({ error: 'Hospital administrators can create doctor, nurse, or staff accounts only' });
    }

    const user = await User.create({
      tenantId: req.tenantId,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role
    });
    return res.status(201).json({ user: user.toSafeJSON() });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'An account with this email already exists in this hospital' });
    return next(error);
  }
}
