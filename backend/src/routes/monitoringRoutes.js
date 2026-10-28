import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ingestVitals, requireMonitorKey } from '../controllers/monitoringController.js';

const router = Router();
const limiter = rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many monitor messages' } });
router.post('/vitals', limiter, requireMonitorKey, ingestVitals);
export default router;
