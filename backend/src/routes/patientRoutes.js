import { Router } from 'express';
import { createObservation, createPatient, getPatient, createResearchAssessment, listPatients, updatePatient } from '../controllers/patientController.js';
import { requireAuth, requireRoles, requireTenant } from '../middleware/auth.js';
import { HOSPITAL_ROLES } from '../models/User.js';
import { requireCsrf } from '../security/csrf.js';

const router = Router();
router.use(requireAuth, requireTenant, requireRoles(...HOSPITAL_ROLES));
router.get('/', listPatients);
router.post('/search', requireCsrf, listPatients);
router.post('/', requireCsrf, createPatient);
router.get('/:patientId', getPatient);
router.patch('/:patientId', requireCsrf, requireRoles('hospital_admin', 'doctor'), updatePatient);
router.post('/:patientId/observations', requireCsrf, createObservation);
router.post(
  '/:patientId/research-assessments',
  requireCsrf,
  requireRoles('hospital_admin', 'doctor', 'nurse'),
  createResearchAssessment
);

export default router;
