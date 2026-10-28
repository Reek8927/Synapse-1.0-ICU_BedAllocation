import bcrypt from 'bcryptjs';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function createTenant(req, res, next) {
  let tenant;
  try {
    const name = String(req.body?.name ?? '').trim();
    const slug = String(req.body?.slug ?? '').trim().toLowerCase();
    const adminName = String(req.body?.adminName ?? '').trim();
    const adminEmail = String(req.body?.adminEmail ?? '').trim().toLowerCase();
    const adminPassword = String(req.body?.adminPassword ?? '');

    if (name.length < 2 || name.length > 150) return res.status(400).json({ error: 'Hospital name must contain 2 to 150 characters' });
    if (!slugPattern.test(slug) || slug.length < 3 || slug.length > 60) return res.status(400).json({ error: 'Workspace slug must be 3 to 60 lowercase letters, numbers, or hyphen-separated words' });
    if (adminName.length < 2 || adminName.length > 100) return res.status(400).json({ error: 'Hospital administrator name must contain 2 to 100 characters' });
    if (!emailPattern.test(adminEmail) || adminEmail.length > 254) return res.status(400).json({ error: 'Enter a valid administrator email' });
    if (adminPassword.length < 14 || adminPassword.length > 128) return res.status(400).json({ error: 'Initial password must contain 14 to 128 characters' });

    tenant = await Tenant.create({ name, slug });
    const admin = await User.create({
      tenantId: tenant._id,
      name: adminName,
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'hospital_admin'
    });

    return res.status(201).json({
      tenant: { id: tenant._id.toString(), name: tenant.name, slug: tenant.slug, status: tenant.status },
      hospitalAdmin: { id: admin._id.toString(), name: admin.name, email: admin.email, role: admin.role }
    });
  } catch (error) {
    // Keep onboarding atomic from the application's perspective if the initial user fails.
    if (tenant?._id) await Tenant.deleteOne({ _id: tenant._id }).catch(() => {});
    if (error?.code === 11000) return res.status(409).json({ error: 'That hospital slug or account already exists' });
    return next(error);
  }
}

export async function listTenants(req, res, next) {
  try {
    const tenants = await Tenant.find({}, { name: 1, slug: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ tenants: tenants.map((tenant) => ({ ...tenant, id: tenant._id.toString(), _id: undefined })) });
  } catch (error) {
    return next(error);
  }
}
