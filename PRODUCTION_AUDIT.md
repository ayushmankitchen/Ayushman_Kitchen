# Ayushman Kitchen — production audit

**Date:** 9 September 2026. **Scope:** the MongoDB/FastAPI + React/CRA application
present in the supplied workspace, its available production URLs, dependency tree,
test suite, maintenance scripts and deployment configuration.

**Verdict: the hardened MongoDB application is deployed and its production smoke
checks pass. It is not yet sized or monitored for a 400+ student production SLA.**
The actual live student count and historical crash rate remain unconfirmed, and the
current Render Free plan can cold-start after inactivity. GitHub `main` contains an
unrelated PostgreSQL/Vite rewrite, so production is deliberately pinned to the
separate audited branch. No student records were replaced or seeded.

**Hindi summary:** Code mein serious issues fix kiye hain. 600 dummy students aur
400 concurrent API requests ka local test pass hua aur hardened version ab live hai.
Production health/readiness, frontend, API proxy aur access control pass hain. Lekin
actual live 400+ student count aur purane crash metrics abhi verify nahi hue, aur
Render Free predictable peak-time uptime ke liye suitable nahi hai. Isliye “kabhi
crash nahi hoga” ki guarantee dena sahi nahi hoga.

## 1. Production evidence

The documented Vercel and Render endpoints were checked with low-volume GET
requests. This was a smoke check, not a production stress test.

| Check | Observed result | Time |
| --- | --- | --- |
| Vercel homepage | 200, security headers present | 528 ms |
| Vercel student login page | 200, security headers present | 108 ms |
| Vercel `/api/health` | 200, revision `60e567c8e3c3` | 209 ms |
| Vercel `/api/ready` | 200, database ready | 410 ms |
| Vercel public branding API | 200 | 262 ms |
| Vercel unauthenticated `/api/workers` | 401, expected denial | 321 ms |
| Direct Render `/api/health` | 200, revision `60e567c8e3c3` | 653 ms |
| Direct Render `/api/ready` | 200 | 237 ms |

These measurements were taken at the UTC timestamp in
[production-evidence.json](audit/production-evidence.json). They demonstrate
reachability at that time. Login page HTTP 200 does not establish that the browser
rendered successfully or that a real student could sign in.

The database pointed to by **this checkout's `backend/.env`** was separately read:
18 total workers, 18 active workers, 19 businesses, no workers missing a business
ID. No duplicate groups were found for the proposed unique index keys, and the
required application indexes are now present in that database. **This is not
confirmed to be Render's database**, and the count does not match the reported
400+ students. Do not migrate, replace or seed the live database based on that
result.

A later follow-up at 13:45 UTC observed a **30-second ReadTimeout on the proxied
public branding API**, while homepage, login, health, readiness and authentication
denial checks still responded. This is an observed intermittent request failure,
not proof of a whole-process crash. Three immediate repeat checks succeeded
(200; 384–976 ms) through Vercel and direct Render. This establishes recovery,
not the timeout’s cause. See [follow-up evidence](audit/production-followup.json)
and [repeat checks](audit/branding-recheck.json).

The signed-in Render service showed a single Singapore web service on the Free plan,
one instance, one worker and no configured datastore resource. Its external MongoDB
configuration values were not exposed. Historical CPU/RAM, restart/crash history,
Atlas tier, backup policy, restore success, actual live student count and 24-hour
availability remain unverified.

## 2. Source version mismatch

The local starting commit was `4dd3cb9`. Fetching GitHub found `origin/main` at
`9c1a180` with new GPS/delivery tracking, SQLAlchemy/PostgreSQL and TypeScript/Vite.
The histories have different root commits and no common ancestor: 37 local commits
and 50 remote commits. Combining them is an application migration, not routine
conflict resolution.

The safe push target is `audit/production-hardening-2026-09-09`. GitHub `main` is
preserved. Its PostgreSQL application is **not covered by the test and capacity
results below**. Selecting that application requires auditing it and testing a
data migration from the existing student system before deployment.

## 3. Findings and fixes

| Priority | Finding and impact | Implemented change |
| --- | --- | --- |
| High | Student password hashes were returned by chat conversation APIs | Admin and student chat responses remove password material; regression test verifies 600 admin conversations |
| High | Admin directory fetched only the first 100 students | Frontend follows the API's pagination until all students are loaded |
| High | Kitchen roster and low-balance list silently stopped at 500 students | Complete business-scoped data is loaded; 600-student headcount test passes |
| High | Admin chat made about two DB queries per student per refresh | Existing conversations and unread counts are loaded in batches; populated list uses three queries |
| High | Low-balance checks repeated settings, leaves and selections queries per student | Shared inputs loaded in four queries for the whole business |
| High | bcrypt ran on the async API event loop | Password hashing/checking moved to a bounded thread pool; health remains responsive during login work |
| High | Cloudinary uploads/deletions and PDF generation could block unrelated requests | Blocking operations moved to the thread pool; media/push network timeouts added |
| High | No unique meal-selection key; concurrent upserts could duplicate rows | Compound unique key on business/student/date/slot; duplicate-write conflicts handled; 25 concurrent submissions verified to leave one row |
| High | Core index errors were logged then ignored, skipping subsequent indexes | Required indexes are checked at startup; failure prevents an unverified release from starting |
| High | Startup and background task deleted old attendance/meal evidence | Historical deletion disabled by default; explicit reviewed opt-in required |
| High | Legacy cleanup rewrote collections and demo utilities could target Atlas | Legacy utilities restricted to explicitly named localhost scratch databases |
| High | Password reset tokens were checked and consumed non-atomically | Reset token is atomically claimed before updating credentials |
| High | Default admin fallback used a publicly guessable password | Empty-database provisioning requires an explicit password; public production signup disabled by default |
| High | Push endpoint accepted arbitrary server-side HTTP destinations | HTTPS browser push provider validation rejects arbitrary hosts/IPs |
| Medium | Four-second student polling repeated expensive full-data reads | Background chat polls every 30 s, dashboard refresh every 60 s, active chat every 5 s; hidden tabs idle; polls do not overlap |
| Medium | Missing meal settings could cause headcount `None.get` failures; shared menu defaults could be mutated | Missing settings handled and menu data copied per request |
| Medium | Invalid meal date/types and >72-byte bcrypt input could produce 500s | Invalid inputs rejected with controlled errors; corrupt stored hashes fail authentication safely |
| Medium | Frontend CSRF refresh called a missing admin route | Added `/api/admin/auth/me` alias |
| Medium | Requests and database pool waits could remain pending too long | Frontend 30-second timeout and MongoDB pool/socket/operation bounds added |
| Medium | Private data/media could be cached and static page security headers were absent | Private/no-store API/media responses and Vercel security headers configured |
| Medium | Local-storage access exceptions or render errors could blank the app | Safe storage helpers and a reloadable React error boundary added |
| Medium | Sessions were stored with string expiry, unusable by TTL | New sessions use BSON datetime plus an expiry TTL index |
| Medium | Startup guessed business ownership for orphan records | Automatic legacy business backfill now requires explicit opt-in |
| Medium | Dependency installation was inconsistent and backend packages unpinned | npm lockfile/overrides, explicit chart peer dependency, backend exact lock and CI added |
| Medium | Tests inherited the local `.env` and could access a live database | Test configuration forces localhost test MongoDB and disables external email/push credentials |

## 4. Verification results

- Backend: **78 passed** with real isolated local MongoDB. Existing coverage
  includes authentication, CSRF, password recovery, tenant separation, meal
  calendars/validity, delivery preferences, payroll, PDFs, chat retention and media.
- Frontend: **34 passed across 13 suites**. New checks include full student
  pagination, hidden-tab polling and prevention of overlapping polls.
- Production frontend build: **passed with `CI=true`**. Main JavaScript bundle
  approximately 181 kB gzip; source-map/browser/network behavior still needs device QA.
- Python dependency audit: **no known vulnerabilities reported** in the locked
  packages. This does not guarantee the absence of unpublished vulnerabilities.
- npm audit: **41 total / 21 high before**, **13 total / 0 high / 0 critical after**.
  The remaining **9 low and 4 moderate** findings are in CRA/Jest/development-server
  tooling and transitive packages. Full details are retained in the audit JSON;
  they are not being represented as “zero vulnerabilities.”
- Git whitespace validation: passed before commit.

Evidence: [npm before](audit/npm-before.json), [npm after](audit/npm-after.json),
[Python packages](audit/python-dependencies.json),
[capacity run](audit/load-test-400.json).

Updated packages include Axios, React Router, Lodash, PostCSS and SVG build tools.
The old Yarn `resolutions` block did not govern npm installs; effective npm
overrides now apply patched versions. CRA/Jest remains a legacy toolchain, and
Motor should be migrated to the supported PyMongo async API in a separate tested
change. [MongoDB migration guidance](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/)

## 5. Capacity and crash assessment

The final capacity run used one local API process through in-process ASGI, real
localhost MongoDB, **600 synthetic students**, **12,000 historical meal selections**
covering ten days, and up to **400 requests in flight**. No real student data was
used. All synthetic data was removed from its dedicated temporary database.

| Workload | Requests | HTTP 200 | p95 |
| --- | ---: | ---: | ---: |
| Simultaneous password login burst | 40 | 40 | 1,395 ms |
| Student today meal | 400 | 400 | 885 ms |
| Student meal stats | 400 | 400 | 618 ms |
| Student dashboard data | 400 | 400 | 596 ms |
| Student chat conversation | 400 | 400 | 602 ms |
| Meal selection burst | 400 | 400 | 864 ms |
| Admin kitchen headcount | 10 | 10 | 199 ms |
| Admin low-balance list | 10 | 10 | 408 ms |
| Admin conversation list | 10 | 10 | 157 ms |
| Same student, same dinner, simultaneous resubmission | 25 | 25 | 60 ms |

**2,095 workload requests succeeded.** Thirteen additional health probes during
the login burst all returned 200, with p95 7.33 ms. Final readiness returned 200.
Headcount included all 600 students, 400 lunch choices were persisted, and the
25 dinner submissions left exactly one meal-selection record. API-process peak
RSS was approximately **251 MiB**, excluding the MongoDB process.

This is a short correctness/concurrency test on the local machine. It **does not
include** Render CPU limits, real network/TLS/proxy overhead, Atlas latency or
throttling, media/email/push providers, prolonged traffic, real browser rendering,
or 400 concurrent password logins. It does not establish an uptime percentage or
predict that the app will never crash. A production-like staging run, monitoring,
restore drill and observation through actual meal cutoffs remain release gates.

For 400 open student home tabs, the old four-second chat + data timer generated
roughly 200 recurring endpoint calls per second. The new scheduled timers generate
roughly 33 calls/second before initial loads, user actions and push events: chat
400/30 plus three dashboard endpoints at 400/60 each. Actual database demand depends
on each endpoint; this is a timer calculation, not a production traffic measurement.

## 6. Remaining limitations and operational work

1. **Confirm the real live database and student count.** The application branch is
   now pinned, but do not initialize an empty database or force-push GitHub `main`.
2. **Verify backups and restore.** No backup was created, scheduled or restored
   on the real live database during this audit. Historical records already deleted
   by the old cleanup cannot be reconstructed by these code changes.
3. **Enable actual monitoring and review crash history.** Request logs, response
   IDs and health endpoints exist, but no external monitor, alert channel or
   error-tracking service is configured.
4. **Add a production-like staging environment for subsequent releases.** The live
   startup verified required indexes without deleting records, but the 18-record
   checkout database still does not establish the live database's student count.
5. **Single process assumption.** Rate limits and scheduled jobs remain process-local.
   Add shared rate limiting and scheduler coordination before multiple workers or
   replicas. Current student login coarse limit is 300/IP/minute plus 15 per
   identifier/IP/minute; verify actual proxy/client-IP behavior and shared-hostel
   traffic before tuning. It is not a distributed brute-force defense.
6. **External delivery and browser QA.** Real password-reset emails, push delivery,
   Cloudinary network failures, installed PWAs, mobile permission behavior and
   signed-in production flows were not exercised. Push delivery remains best effort,
   and the provider allowlist must be maintained as browser services evolve.
7. **Data lifecycle.** Convert legacy string session expiries in a reviewed migration;
   set a business-approved archive/retention policy before ever enabling historical
   deletion. Large business lists should eventually use streamed exports/server-side
   pagination instead of accumulating all rows in memory.
8. **Broader business-rule review.** Renewal/payment operations span multiple writes;
   transactional recovery and idempotency for billing deserve further work. This
   audit's duplicate-meal protection is not a transaction guarantee for every route.
9. **Toolchain maintenance.** Retire CRA/Jest 27 and Motor with focused compatibility
   testing. Four FastAPI lifecycle deprecation warnings remain in backend tests.

## 7. Database and deployment recommendation

For the **audited application**, keep MongoDB Atlas rather than switching databases
under real students. Start staging with Atlas M10 + Render Standard (`1c-2g`) +
Vercel Pro, then size from real metrics. The checked base prices total roughly
**$102/month before taxes and usage extras**. A lower-cost Atlas Flex option trades
dedicated resources for a smaller bill; it still needs workload and backup checks.

If you choose GitHub's PostgreSQL rewrite, use managed PostgreSQL for that separate
application and plan an explicit data migration. Connecting this MongoDB application
to PostgreSQL, or connecting the rewrite to Atlas, will not work without code changes.

Exact configuration, current official pricing links, deployment commands, monitoring
targets and rollback steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

## 8. Commit and push status

Implementation and tests are published on
`audit/production-hardening-2026-09-09`; GitHub Actions run `34360657633` completed
successfully. Render deploy `dep-dagmkcmk1f9s73div2mg` deployed commit `60e567c`
successfully after production index verification. The service branch is pinned to
the audit branch, uses the locked Python dependencies and checks `/api/ready` before
serving the new release. Vercel production deployment `dpl_FtKvinc7PnrkPFn8f71KEqFEDExz`
is Ready and owns `https://ayushman-kitchen.vercel.app`. GitHub `main` remains
unchanged because it is the unrelated application described above.
