import { Router } from 'express';
import { addToQueue, confirmAllocation, createBed, dischargeAdmission, listAdmissions, listBeds, listQueue, setQueueReviewPriority, updateBed, withdrawFromQueue } from '../controllers/icuController.js';
import { requireAuth, requireRoles, requireTenant } from '../middleware/auth.js';
import { HOSPITAL_ROLES } from '../models/User.js';
import { requireCsrf } from '../security/csrf.js';
import { acknowledgeICUObservationReminder, listICUObservationReminders } from '../controllers/icuReminderController.js';

const router = Router();
router.use(requireAuth, requireTenant, requireRoles(...HOSPITAL_ROLES));
router.get('/beds', listBeds);
router.post('/beds', requireCsrf, requireRoles('hospital_admin'), createBed);
router.patch('/beds/:bedId', requireCsrf, requireRoles('hospital_admin', 'nurse', 'staff'), updateBed);
router.get('/queue', listQueue);
router.get('/admissions', listAdmissions);
router.get('/reminders', listICUObservationReminders);
router.post('/reminders/:reminderId/acknowledge', requireCsrf, acknowledgeICUObservationReminder);
router.post('/queue', requireCsrf, requireRoles('hospital_admin', 'doctor', 'nurse'), addToQueue);
router.patch('/queue/:queueEntryId/priority', requireCsrf, requireRoles('hospital_admin', 'doctor'), setQueueReviewPriority);
router.post('/queue/:queueEntryId/withdraw', requireCsrf, requireRoles('hospital_admin', 'doctor', 'nurse'), withdrawFromQueue);
router.post('/queue/:queueEntryId/confirm-allocation', requireCsrf, requireRoles('hospital_admin', 'doctor'), confirmAllocation);
router.post('/admissions/:patientId/discharge', requireCsrf, requireRoles('hospital_admin', 'doctor'), dischargeAdmission);

export default router;
