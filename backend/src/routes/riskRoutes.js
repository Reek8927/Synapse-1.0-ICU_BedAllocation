import { Router } from 'express';
import { allocateNext, getPatientRisk, getRankedQueue, rescoreQueue, scorePatientNow } from '../controllers/riskController.js';
import { requireAuth, requireRoles, requireTenant } from '../middleware/auth.js';
import { HOSPITAL_ROLES } from '../models/User.js';
import { requireCsrf } from '../security/csrf.js';

const router = Router();
router.use(requireAuth, requireTenant, requireRoles(...HOSPITAL_ROLES));
router.get('/patients/:patientId', getPatientRisk);
router.post('/patients/:patientId/score', requireCsrf, scorePatientNow);
router.get('/queue', getRankedQueue);
router.post('/queue/rescore', requireCsrf, rescoreQueue);
router.post('/queue/allocate-next', requireCsrf, requireRoles('hospital_admin', 'doctor'), allocateNext);

export default router;
