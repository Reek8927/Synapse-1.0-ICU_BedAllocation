/**
 * Build a tenant-scoped MongoDB filter for hospital-owned records.
 * Additional filters are copied first so a caller cannot override tenantId.
 * Platform-level workflows must use explicit platform-admin routes instead.
 */
export function tenantScopedFilter(req, additionalFilter = {}) {
  if (!req?.tenantId || req?.user?.role === 'platform_admin') {
    const error = new Error('A hospital tenant is required for this operation');
    error.statusCode = 403;
    throw error;
  }
  return { ...additionalFilter, tenantId: req.tenantId };
}
