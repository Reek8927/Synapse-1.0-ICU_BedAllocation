import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createContactMessage } from '../controllers/contactController.js';
import { requireCsrf } from '../security/csrf.js';

const router = Router();
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many contact submissions. Please try again later.' }
});
router.post('/', contactLimiter, requireCsrf, createContactMessage);
export default router;
