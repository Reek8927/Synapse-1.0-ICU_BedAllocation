import { Router } from 'express';
import { createTenant, listTenants } from '../controllers/tenantController.js';
import { listContactMessages } from '../controllers/contactController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { requireCsrf } from '../security/csrf.js';

const router = Router();
router.use(requireAuth, requireRoles('platform_admin'));
router.get('/tenants', listTenants);
router.get('/contact-messages', listContactMessages);
router.post('/tenants', requireCsrf, createTenant);
export default router;
