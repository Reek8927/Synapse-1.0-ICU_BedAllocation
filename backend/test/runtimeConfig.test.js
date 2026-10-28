import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidTrustProxyHops } from '../src/utils/trustProxyConfig.js';

test('proxy hop configuration accepts safe whole-number values', () => {
  for (const value of ['0', '1', '2', '10']) assert.equal(isValidTrustProxyHops(value), true, String(value));
});

test('proxy hop configuration accepts an unset value so the default can be used', () => {
  assert.equal(isValidTrustProxyHops(undefined), true);
  assert.equal(isValidTrustProxyHops(''), true);
});

test('proxy hop configuration rejects fractions, negative values, and non-numbers', () => {
  for (const value of ['1.5', '-1', 'many', ' 1', '1 ', '01']) {
    assert.equal(isValidTrustProxyHops(value), false, String(value));
  }
});

test('proxy hop configuration rejects values above the supported bound', () => {
  assert.equal(isValidTrustProxyHops('11'), false);
  assert.equal(isValidTrustProxyHops('999'), false);
});
