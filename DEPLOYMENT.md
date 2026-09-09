# Deployment runbook — 9 September 2026

This runbook applies to the **MongoDB / React CRA application in this workspace**.
GitHub `main` at `9c1a180` is an unrelated PostgreSQL / Vite rewrite. Do not point
these commands at that branch, combine the databases, or replace either database
with an empty one. The tested changes are committed on a separate audit branch. GitHub push currently
requires repository write access.

## Recommended hosting

| Component | Recommendation | Published base price checked 9 Sep 2026 |
| --- | --- | --- |
| Database | MongoDB Atlas M10, automatic backups enabled | Starts at $56.94/month; region, backup, transfer charges vary |
| Backend | Render `1c-2g` / legacy Standard, one instance, one Uvicorn worker | $25/month |
| Frontend | Vercel Pro, Node 22, `frontend` root | Starts at $20/month; additional seats/usage can cost extra |
| Photos/audio | Existing Cloudinary storage | Confirm current account quota |
| Password reset email | Existing Brevo account | Confirm sender verification and quota |

This is a starting configuration to validate in staging, **not a measured guarantee
for 400 simultaneous logins on a 1-CPU server**. Place the backend and database in
the same region where available, such as Singapore. The base total is approximately
$102/month before taxes, backups, bandwidth, domain, media, email and extra seats.

Atlas Flex is a lower-cost alternative with shared resources and up to $30/month
database charges, but MongoDB positions it for development/prototyping. Use it only
after a realistic staging workload and backup/restore check meet the business's
needs. Render Free sleeps after 15 idle minutes and is unsuitable for predictable
meal cutoff access. Vercel Hobby is restricted to personal, non-commercial use.

Sources: [MongoDB pricing](https://www.mongodb.com/pricing),
[Atlas Flex limits](https://www.mongodb.com/docs/atlas/reference/flex-limitations/),
[Render pricing](https://render.com/pricing),
[Render free limitations](https://render.com/docs/free),
[Vercel pricing](https://vercel.com/pricing),
[Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby).

If choosing the PostgreSQL/Vite rewrite instead, it requires its **own audit,
SQL migrations, deployment configuration and tested MongoDB-to-SQL data migration**.
The load results in this repository do not validate that application.

## Before changing the live service

1. Confirm the serving repository, branch and commit in Render and Vercel. Record
   the actual Atlas cluster and database name from Render's settings without
   copying credentials into Git or chat. The checkout's configured database had
   **18** workers, not the reported 400+, so its identity is not established.
2. Verify the actual student count in the confirmed live database. Preserve the
   existing database and take a backup before migrations/index work. Restore that
   backup to a separate staging database and check counts, payments, quota,
   attendance and sample student access.
3. Review duplicates for all unique keys in
   `backend/services/production_indexes.py`. Startup now stops on an index failure
   instead of silently skipping the remaining indexes. Do not delete duplicates
   automatically: resolve ownership and conflicting meal choices with the owner.
4. Confirm production JWT secret is at least 32 characters. Preserve it if it is
   already strong; rotation signs out existing admin sessions. Disable public
   signup and legacy data backfill. Keep historical meal cleanup disabled.
5. Run tests and the capacity script against staging-equivalent resources. The
   included load script intentionally only connects to localhost test MongoDB.
6. Enable Render's `After CI Checks Pass` deploy setting and HTTP health path
   `/api/ready` in the actual service settings. Adding `render.yaml` alone does not
   reconfigure an existing non-Blueprint service.

## Backend settings

`render.yaml` provides a template. Configure secrets in the hosting dashboard.

```env
ENVIRONMENT=production
MONGO_URL=<existing confirmed Atlas connection string>
DB_NAME=<existing confirmed database name>
JWT_SECRET=<existing strong random secret, at least 32 characters>
FRONTEND_URL=https://<your-frontend-domain>
CORS_ORIGINS=https://<your-frontend-domain>
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
ALLOW_ADMIN_SIGNUP=false
ENABLE_MEAL_DATA_CLEANUP=false
ENABLE_LEGACY_BUSINESS_BACKFILL=false
MEDIA_STORAGE=cloudinary
CLOUDINARY_URL=<existing Cloudinary credentials>
BREVO_API_KEY=<existing Brevo key>
BREVO_SENDER_EMAIL=<verified sender>
PASSWORD_RESET_URL=https://<your-frontend-domain>/reset-password
MONGO_MAX_POOL_SIZE=50
MONGO_WAIT_QUEUE_TIMEOUT_MS=5000
MONGO_SOCKET_TIMEOUT_MS=15000
MONGO_OPERATION_TIMEOUT_MS=20000
BUSINESS_TIMEZONE=Asia/Kolkata
```

Set `ADMIN_PASSWORD` to a strong unique value of at least 12 characters only for
initial provisioning of an empty database. It does not reset an existing admin.
Configure all existing VAPID values to preserve push subscriptions. Restrict Atlas
network access to the actual service's outbound addresses and give the application
user access only to its database.

Backend root is the **repository root**:

```sh
pip install -r backend/requirements.lock
python -m uvicorn backend.main:app --host 0.0.0.0 --port "$PORT" --workers 1 --timeout-keep-alive 5
```

Use one worker for this release because scheduled reminders and rate-limit state
are process-local. Multiple workers/replicas require shared rate limiting and a
distributed scheduler lock or separate scheduler service first. Existing sessions
with string expiry fields are not removed by the new TTL index; new sessions use
MongoDB datetime expiry. A separate reviewed migration can convert old values.

## Frontend settings

- Root directory: `frontend`; Node version: 22.
- Install: `npm ci --ignore-scripts`; build: `npm run build`; output: `build`.
- The checked-in `.npmrc` preserves the peer-resolution settings used to make the
  lockfile; use npm rather than Yarn.
- API calls use same-origin `/api`. Confirm `frontend/vercel.json` points to the
  **correct** Render service. For this proxy configuration, `SameSite=lax` works;
  direct requests across unrelated domains need a separate cookie/CORS review.
- The new response headers and no-cache service worker policy apply only after
  deploying this frontend configuration.

## Verification commands

```sh
# MongoDB for local tests only; create the data directory first.
mkdir -p /tmp/ayushman-audit-mongo
mongod --dbpath /tmp/ayushman-audit-mongo --bind_ip 127.0.0.1 --port 27019 --nounixsocket

# Separate terminal, repository root:
backend/venv/bin/python -m pytest backend/tests --integration -q
backend/venv/bin/python scripts/load_test.py --concurrency 400
backend/venv/bin/python scripts/production_audit.py

# Add --database only when backend/.env points to the intended database.
# This command reads counts/indexes and does not modify database records.
backend/venv/bin/python scripts/production_audit.py --database

cd frontend
npm ci --ignore-scripts
CI=true npm test -- --watchAll=false --runInBand
CI=true npm run build
npm audit --audit-level=high
```

Tests forcibly use localhost port 27019 and a test-only database, and disable email
and push credentials. Legacy `cleanup_database.py` and `seed_atlas.py` now refuse
non-local or non-scratch targets. Do not use either to migrate production.

## Monitoring, rollout and rollback

Configure an external one-minute uptime check for the public homepage and proxied
`/api/ready`; alert on two consecutive failures. In Render, retain crash logs and
restart events, and alert on sustained high memory/CPU, increased 5xx responses,
database timeouts and latency near meal cutoffs. Review Atlas connections, query
latency and storage. Set an initial staging acceptance target of p95 under 2 seconds
for normal student reads and meal writes, under 5 seconds for ordinary login load,
and no unexpected 5xx responses. These are proposed targets, not a provider SLA.

Verify login, logout, CSRF refresh, selection/cancellation, leave/resume, renewal,
chat, payment recording, PDF exports, photo/audio upload and push delivery with
dedicated test accounts. Check real devices and a slow network. The browser/device
checks and external-service deliveries were not performed in this audit.

Deploy during a quiet period after the source version and database are confirmed.
Check `/api/health`'s `revision` against the expected Render commit, `/api/ready`,
student counts and logs. Observe at least one lunch and dinner cutoff plus 24 hours
before declaring rollout complete. A short smoke test cannot establish historical
uptime or guarantee the service will never crash.

If startup, error rate or latency regresses, roll the **application** back to the
previous confirmed deployment. Keep the original database and backup; added indexes
are backward-compatible, so routine rollback does not require deleting them.
Restoring data is a separate decision if actual corruption occurred.

Render's documented health checks can prevent traffic switching to an unhealthy
new release and restart unhealthy running instances; confirm they are enabled on
the existing service. [Render health checks](https://render.com/docs/health-checks)
