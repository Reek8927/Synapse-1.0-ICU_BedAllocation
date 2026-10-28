import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getResearchModelStatus,
  postSyntheticResearchPrediction,
} from '../controllers/researchModelController.js';
import { requireAuth, requireRoles, requireTenant } from '../middleware/auth.js';
import { requireCsrf } from '../security/csrf.js';

const router = Router();
const syntheticDemoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many synthetic research requests. Please try again later.' },
});

router.use(requireAuth, requireTenant, requireRoles('hospital_admin', 'doctor'));
router.get('/status', getResearchModelStatus);
router.post('/demo-predict', syntheticDemoLimiter, requireCsrf, postSyntheticResearchPrediction);

export default router;
