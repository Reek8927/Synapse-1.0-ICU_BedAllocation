/**
 * Express trust-proxy hop count is a security-sensitive deployment setting.
 * Accept only a whole number with an explicit, conservative upper bound.
 */
export function isValidTrustProxyHops(value) {
  if (value === undefined || value === '') return true;
  const text = String(value);
  return /^(0|[1-9]\d*)$/.test(text) && Number(text) <= 10;
}
