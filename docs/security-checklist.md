# Security Checklist

Status reflects code added to the current build phase and is not a claim of independent penetration testing.

| Requirement | Status | Implementation note |
|---|---|---|
| SQL/NoSQL injection | Foundation added | `express-mongo-sanitize`, Mongoose schemas, bounded/validated fields; endpoint-specific tests remain. |
| XSS | Foundation added | React escapes text by default; avoid unsafe HTML. Static JSON-LD only. CSP/security headers require production review. |
| CSRF | Implemented for current mutating endpoints | Signed double-submit token, HttpOnly CSRF cookie, origin allowlist, header requirement. Test reverse-proxy behavior. |
| File upload validation | Deferred | Medical document upload endpoint does not exist yet. Must validate MIME and file content, size, PDFs/images and use private storage. |
| Broken object-level authorization | Implemented for patient routes; tests still needed | Patient fetch/update/observation writes lookup the patient with authenticated tenant scope. Add cross-tenant integration tests before deployment. |
| Rate limiting | Global API limit plus stricter login/contact limits | Configure trusted proxy hops accurately in production; add tailored limits for uploads and other new sensitive endpoints. |
| JWT secrets | Implemented | Startup rejects missing, weak-length or placeholder JWT secret. |
| API secrets server-side | Design rule | Only public site URL and Turnstile site key use `NEXT_PUBLIC_*`; keep all secrets server-side. |
| Password hashing | Implemented | bcrypt cost 12; consider Argon2id migration before production. |
| MFA | Deferred | Required before production use of privileged accounts. |
| CORS | Implemented | Exact origin allowlist with credentials; set production origins accurately. |
| No localStorage auth | Implemented | JWT is stored in HttpOnly cookie, not web storage. |
| Server-side permissions | Implemented for current routes | Platform/admin and tenant membership checked by Express middleware. Patient mutation routes have role checks. |
| Role-level security | Initial roles implemented | Add role/action matrix and automated tests as clinical modules arrive. |
| Webhook signature verification | Conditional / deferred | No webhooks are configured in this phase. Verify signatures and replay controls before adding integrations. |
| SSRF | Conditional / deferred | No arbitrary URL fetch feature is present; validate and allowlist destinations if one is added. Keep API rewrite destination fixed by environment configuration. |
| Exposed source maps | Deployment check pending | Confirm production source-map publishing policy before release. |
| Default credentials | Implemented | No public self-signup; seed requires non-placeholder credentials and empty users collection. |
| Sensitive logs | Foundation added | Logs avoid request bodies and tokens. Add redaction/retention/monitoring policy before production. |
| Vulnerable dependencies | Pending every release | Run `npm audit` in frontend and backend and patch vulnerable dependencies before deployment. |

Additional medical-data safeguards in this phase: tenant-scoped patient/observation access, `Cache-Control: no-store`, patient and observation audit events written in the same database transaction, audit records that avoid storing vital-sign values, synthetic demo data, and documented file-upload requirements for the future document module. A retention policy, MFA, deployment hardening, and full authorization/integration tests remain outstanding.
