# Phase 1 verification checklist

- [ ] MongoDB is reachable and `MONGODB_URI` is correct.
- [ ] The API starts only when required environment variables are valid.
- [ ] `GET /api/health` returns status 200 when MongoDB is connected.
- [ ] Initial admin creation refuses to run against a database with existing users.
- [ ] Login accepts valid credentials and rejects invalid credentials.
- [ ] Login throttling responds after repeated attempts.
- [ ] `/api/auth/me` rejects requests without a valid bearer token.
- [ ] Non-admin users cannot create accounts.
- [ ] Frontend health status updates and displays API/database readiness.
- [ ] `.env` and any private data are not committed to Git.
