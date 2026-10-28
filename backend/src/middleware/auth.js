import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import { getSessionCookieName } from '../security/cookies.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[getSessionCookieName()];
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'bedallocation-api',
      audience: 'bedallocation-client',
      algorithms: ['HS256']
    });
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ error: 'Account is unavailable' });

    let tenant = null;
    if (user.role !== 'platform_admin') {
      tenant = await Tenant.findById(user.tenantId);
      if (!tenant || tenant.status !== 'active') {
        return res.status(403).json({ error: 'Hospital workspace is unavailable' });
      }
    }

    req.user = user;
    req.tenant = tenant;
    req.tenantId = tenant?._id ?? null;
    return next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError' || error?.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    return next(error);
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    return next();
  };
}

export function requireTenant(req, res, next) {
  if (!req.user || req.user.role === 'platform_admin' || !req.tenantId) {
    return res.status(403).json({ error: 'A hospital workspace is required for this action' });
  }
  return next();
}
