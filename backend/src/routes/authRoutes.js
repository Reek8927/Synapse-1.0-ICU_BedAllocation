import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createHospitalUser, getMe, login, logout } from '../controllers/authController.js';
import { bootstrapCsrf, requireCsrf } from '../security/csrf.js';
import { requireAuth, requireRoles, requireTenant } from '../middleware/auth.js';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' }
});

router.get('/csrf', bootstrapCsrf);
router.post('/login', loginLimiter, requireCsrf, login);
router.post('/logout', requireCsrf, requireAuth, logout);
router.get('/me', requireAuth, getMe);
router.post('/users', requireCsrf, requireAuth, requireTenant, requireRoles('hospital_admin'), createHospitalUser);

export default router;
