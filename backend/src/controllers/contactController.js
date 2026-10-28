import ContactMessage from '../models/ContactMessage.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') return false;
    return true; // Local development only. Production requires server-side verification.
  }
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true;
}

export async function createContactMessage(req, res, next) {
  try {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const organization = String(req.body?.organization ?? '').trim();
    const subject = String(req.body?.subject ?? '').trim();
    const message = String(req.body?.message ?? '').trim();
    const turnstileToken = req.body?.turnstileToken;

    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Name must contain 2 to 100 characters' });
    if (!emailPattern.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address' });
    if (organization.length > 150) return res.status(400).json({ error: 'Organization name is too long' });
    if (subject.length < 3 || subject.length > 120) return res.status(400).json({ error: 'Subject must contain 3 to 120 characters' });
    if (message.length < 10 || message.length > 3000) return res.status(400).json({ error: 'Message must contain 10 to 3000 characters' });
    const captchaValid = await verifyTurnstile(turnstileToken, req.ip);
    if (!captchaValid) {
      const status = process.env.NODE_ENV === 'production' && !process.env.TURNSTILE_SECRET_KEY ? 503 : 400;
      return res.status(status).json({ error: status === 503 ? 'Contact submissions are temporarily unavailable. Please use the published contact email.' : 'Spam verification failed. Please try again.' });
    }

    const saved = await ContactMessage.create({ name, email, organization, subject, message });
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ success: true, reference: saved._id.toString() });
  } catch (error) {
    return next(error);
  }
}

export async function listContactMessages(req, res, next) {
  try {
    const messages = await ContactMessage.find({}, { name: 1, email: 1, organization: 1, subject: 1, message: 1, status: 1, createdAt: 1 })
      .sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ messages: messages.map((message) => ({ id: message._id.toString(), name: message.name, email: message.email, organization: message.organization, subject: message.subject, message: message.message, status: message.status, createdAt: message.createdAt })) });
  } catch (error) {
    return next(error);
  }
}
