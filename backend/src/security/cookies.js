export function isSecureCookie() {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
}

export function getSessionCookieName() {
  return isSecureCookie() ? '__Host-ba_session' : 'ba_session';
}

export function getCsrfCookieName() {
  return isSecureCookie() ? '__Host-ba_csrf' : 'ba_csrf';
}

export function baseCookieOptions() {
  return {
    path: '/',
    secure: isSecureCookie(),
    sameSite: String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase()
  };
}

export function sessionCookieOptions(maxAge) {
  return { ...baseCookieOptions(), httpOnly: true, maxAge };
}

export function csrfCookieOptions() {
  return { ...baseCookieOptions(), httpOnly: true, maxAge: 4 * 60 * 60 * 1000 };
}

export function parseExpiryToMs(value = '4h') {
  const match = String(value).match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 4 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * units[match[2]];
}
