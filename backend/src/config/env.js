import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidTrustProxyHops } from '../utils/trustProxyConfig.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '../..');
dotenv.config({ path: path.join(backendRoot, '.env') });

export function getAllowedOrigins() {
  return (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function validateRuntimeEnv() {
  const problems = [];
  if (!process.env.MONGODB_URI) problems.push('MONGODB_URI is required');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace_with_')) {
    problems.push('JWT_SECRET must be a strong, non-placeholder secret with at least 32 characters');
  }
  if (!isValidTrustProxyHops(process.env.TRUST_PROXY_HOPS)) problems.push('TRUST_PROXY_HOPS must be a whole number from 0 to 10');
  const sameSite = String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) problems.push('COOKIE_SAME_SITE must be lax, strict, or none');
  if (sameSite === 'none' && process.env.COOKIE_SECURE !== 'true') {
    problems.push('COOKIE_SECURE=true is required when COOKIE_SAME_SITE=none');
  }
  const origins = getAllowedOrigins();
  if (process.env.NODE_ENV === 'production' && origins.some((origin) => origin.includes('localhost'))) {
    problems.push('CORS_ORIGIN must not include localhost in production');
  }
  if (problems.length) throw new Error(`Invalid environment configuration: ${problems.join('; ')}`);
}
