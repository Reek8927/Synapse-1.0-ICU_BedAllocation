import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantScopedFilter } from '../src/utils/tenantScope.js';

test('tenant-scoped filter always pins the authenticated tenant', () => {
  const tenantId = 'hospital-a';
  const result = tenantScopedFilter({ tenantId, user: { role: 'doctor' } }, { status: 'active', tenantId: 'hospital-b' });
  assert.deepEqual(result, { status: 'active', tenantId });
});

test('tenant-scoped filter rejects platform admins', () => {
  assert.throws(
    () => tenantScopedFilter({ tenantId: null, user: { role: 'platform_admin' } }, {}),
    (error) => error.statusCode === 403
  );
});

test('tenant-scoped filter rejects missing tenant context', () => {
  assert.throws(
    () => tenantScopedFilter({ user: { role: 'doctor' } }, { name: 'record' }),
    (error) => error.statusCode === 403
  );
});
