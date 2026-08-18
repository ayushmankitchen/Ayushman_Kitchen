# Test Credentials

## Admin (JWT email/password login)
- URL: /admin/login
- Email: admin@example.com
- Password: admin123
- Login endpoint: POST /api/admin/login  { "email", "password" } -> returns { token, admin }
- Auth: send `Authorization: Bearer <token>` OR httpOnly `access_token` cookie
- Endpoints: /api/admin/me, /api/workers (CRUD), /api/attendance, /api/payments, /api/extra-work, /api/admin/stats

## Worker (Google OAuth via Emergent Auth)
- URL: /worker/login
- No password. Google login only.
- A worker only sees data if admin added a worker record with the SAME Google email.
- Session endpoint: POST /api/worker/auth/session (header X-Session-ID)
- Auth: `session_token` cookie OR `Authorization: Bearer <session_token>`
- Self data: GET /api/worker/me/data
- For testing insert into `google_users` (user_id, email, name) and `worker_sessions` (user_id, session_token, expires_at). Then add a `workers` doc with matching email.
