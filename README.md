# EV Charging Demand & Grid Load Analytics

DBMS Level 3 mini project. Next.js (App Router, TypeScript) + Tailwind CSS + Recharts on PostgreSQL.
MongoDB integration is planned (see *Status*).

## Status

| Stage | Scope | State |
|---|---|---|
| 1 | Next.js foundation, `pg` connection, env handling, API response/error layer | Done |
| 2 | Migration 002 (views, trigger, indexes), `GET /api/overview`, Overview dashboard | Done |
| 3 | Authentication, Admin / Analyst roles, user management | Done (see *Known limitations*) |
| 4 | Demand, Station, Overload and Session explorers | Next |
| 5 | Admin CRUD for stations/chargers/sessions with transactions | Planned |
| 6 | MongoDB telemetry integration (waiting for teammate's data contract) | Planned |
| 7 | Demo seed data, final docs, requirement mapping | Planned |

## Prerequisites

Node.js 22+, npm, and PostgreSQL with the `ev_charging_analytics` database created from
`database/postgresql_schema.sql` and `database/postgresql_sample_data.sql`.

## Setup

```bash
npm install

# 1. Apply the additive migrations, in order. Both are safe to re-run and never drop or alter existing objects.
psql -U <your_user> -d ev_charging_analytics -f database/migrations/002_analytics_views_and_triggers.sql
psql -U <your_user> -d ev_charging_analytics -f database/migrations/003_users_and_sessions.sql

# 2. Configure the environment (.env.local is git-ignored; never commit it)
cp .env.example .env.local          # then set DATABASE_URL

# 3. Create the first administrator (there are NO default credentials)
npm run user:create -- --email you@example.com --name "Your Name" --role ADMIN
#    It asks for a password (min 12 characters) with hidden input, twice.

# 4. Run
npm run dev                          # http://localhost:3000  -> redirects to /login
```

Sign in as the administrator, open **User management**, and create Analyst accounts.

## Checks

```bash
npm run typecheck
npm run lint
npm test            # unit tests always run; integration tests run when DATABASE_URL is set
npm run build
```

Integration tests need migrations 002 and 003 applied and the repository's own sample data loaded, nothing else.
The auth tests create their own throw-away users (`test+<random>@example.test`, random passwords) and remove them afterwards;
they never read or change other accounts.

## Roles

| Role | Can do |
|---|---|
| Anonymous | Open `/login`; `GET /api/health` (connectivity only). Everything else returns 401 / redirects to `/login` |
| Analyst | Everything anonymous can, plus dashboards and read APIs (`/api/overview`, `/api/auth/me`) |
| Admin | Everything an Analyst can, plus user management (`/api/admin/users`, `/admin/users`) and the detailed health report |

Authorization is enforced on the server in `src/lib/auth/dal.ts` on every protected page and API call. Hiding a menu link is cosmetic only.

## API

All responses: success `{ ok: true, data, meta }`, failure `{ ok: false, error: { code, message, details? } }`.
State-changing requests from a browser must come from the same origin (otherwise `403 CROSS_ORIGIN`).

| Endpoint | Access | Description |
|---|---|---|
| `POST /api/auth/login` | public | `{ email, password }` -> sets the session cookie. Any failure is the same `401 INVALID_CREDENTIALS` |
| `POST /api/auth/logout` | public | Revokes the session server-side, clears the cookie |
| `GET /api/auth/me` | Analyst+ | Current user |
| `GET /api/overview?from=&to=` | Analyst+ | KPIs, hourly demand, station comparison, alerts (dates `YYYY-MM-DD`, optional, inclusive) |
| `GET /api/admin/users` | Admin | List users (never includes password hashes) |
| `POST /api/admin/users` | Admin | `{ email, displayName, role, password }` -> `201`; `409` if the email exists |
| `PATCH /api/admin/users/[id]` | Admin | Any of `{ displayName, role, isActive, password }`; `404` unknown id; `409` if it would remove the last active admin |
| `GET /api/health` | public / Admin | Public: `{ database }`. Admin: also latency and applied migrations |

Status codes: `200`/`201` OK, `400` invalid input (field-level messages), `401` not signed in, `403` signed in but not allowed,
`404` not found, `409` conflict, `413` body too large, `503` database unavailable, `500` anything else.
SQL text, stack traces, password hashes and connection details are never returned; they are not logged either (only error codes).

## How authentication works

- **Passwords**: Argon2id (`@node-rs/argon2`, 19 MiB, 2 iterations, 1 lane), random salt per hash, minimum 12 characters. Plaintext is never stored or logged.
- **Sessions**: on login the server creates a random 256-bit token. The browser gets it in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). The database stores only the **SHA-256 hash** (`auth_session.token_hash`), so a leaked table cannot be replayed. Sessions last 8 hours and are validated against the database on every request, which makes logout, deactivation, password reset and role changes take effect immediately.
- **Brute force**: 5 consecutive failures lock the account for 15 minutes. The check and counters run in one transaction with `SELECT ... FOR UPDATE`, so parallel guesses cannot sidestep the counter. Unknown emails take the same time and give the same answer as wrong passwords (no account enumeration).
- **CSRF**: `SameSite=Lax` plus an `Origin`/`Sec-Fetch-Site` check on every state-changing request.
- **Proxy** (`src/proxy.ts`): redirects visitors with no cookie to `/login`. It is a convenience, **not** the security boundary; it cannot tell a real cookie from a forged one.
- **Last-admin guard**: a database trigger refuses to delete, demote or deactivate the last active administrator.

## Metric definitions

- **Average utilization**: mean of `utilization_pct` over `Station_Capacity` snapshots in the range. Not capped at 100%.
- **Overload event**: one capacity snapshot with `overload_status = 'OVERLOADED'` (load strictly above the permitted maximum).
- **Hourly demand**: energy per hour of day. Each session's `energy_kwh` is split across the hours it spans in proportion to time in each hour. Ongoing sessions (null `end_time`) count entirely in their start hour.
- **Date filter**: `from` is the start of that day; `to` includes the whole day.
- **Capacity snapshot vs telemetry reading**: a snapshot (`Station_Capacity`) compares load with the permitted limit; a telemetry reading (`Grid_Telemetry`) is an electrical measurement. The UI keeps them separate.
- **Timestamps**: analytics columns are `TIMESTAMP` without time zone, treated as IST wall-clock time and shown exactly as stored. Auth tables use `TIMESTAMPTZ`; the Users page shows those in IST.
- **Demo data**: with `DATA_MODE=demo` the UI states that readings are synthetic and never calls them live.

## Advanced DBMS concepts implemented so far

| Concept | Where | How to demonstrate |
|---|---|---|
| View | `v_overload_events`, `v_station_latest_capacity` (migration 002); Overview alerts read the first | `SELECT * FROM v_overload_events;` |
| Trigger + stored function (1) | `trg_station_capacity_compute` (002) keeps `utilization_pct` / `overload_status` consistent | In `BEGIN; ... ROLLBACK;` insert a snapshot with wrong values and `SELECT` it; exactly 100% stays NORMAL |
| Trigger + stored function (2) | `trg_protect_last_admin` (003) | In `BEGIN; ... ROLLBACK;` try to delete/demote/deactivate the only active admin: error `EV001` |
| Transaction | `authenticate()` (login + lockout counters + session creation) and `updateUser()` (change + session revocation), via `withTransaction` | Lock an account with 5 wrong passwords: the failure counter persists even though login failed; `SELECT ... FOR UPDATE` serialises guesses |
| Constraints | CHECKs on role/email/expiry, UNIQUE email, FK `ON DELETE CASCADE` from `auth_session` to `app_user` (003) | Insert `role='OWNER'` or a mixed-case email: rejected by the database |
| Indexes | `idx_capacity_overloaded_time` (partial), `idx_telemetry_recorded_at`, `idx_charger_station` (002); `uq_app_user_email`, session indexes (003) | `EXPLAIN` the overload query. On the 3-row sample PostgreSQL correctly prefers a sequential scan; `SET enable_seqscan = off;` shows the partial index is usable. The benefit appears at volume (Stage 7 seed data) |
| Parameterized queries | `src/lib/db/queries/*` | Every value is a bound parameter; try `?from=2026-10-20';DROP TABLE ev;--` and see a `400` |

MongoDB aggregation/indexes (Stage 6) are not implemented yet.

## Known limitations (Stage 3)

- **Not verified in a real browser.** The login page, cookie behaviour in browsers, the Users page interactions (confirm dialogs) and charts were tested only through HTTP requests and server-rendered HTML. Please click through them once.
- A **forged cookie** is rejected by the server-side check, but because the check runs while the page streams, that response is HTTP 200 with a redirect to `/login` (no data), not a 307.
- A signed-in Analyst opening `/admin/users` sees an "Administrator access required" message (HTTP 200). The API endpoints return a proper `403`.
- Lockout is **per account**: it stops guessing but also lets someone deliberately lock a known account for 15 minutes. There is no per-IP rate limiting.
- No self-service password change or "forgot password" flow. An admin can reset a password through `PATCH /api/admin/users/[id]` (there is no UI for it yet).
- Behind a reverse proxy, forward the original `Host` header or the same-origin check will reject legitimate requests.
- Sessions have a fixed 8-hour lifetime (no sliding renewal).

## Project layout

```
database/                      schema, sample data + migrations/ (002 analytics, 003 users)
scripts/create-user.ts         first-admin CLI
src/proxy.ts                   optimistic redirect only
src/lib/env.ts                 validated, server-only environment
src/lib/auth/                  password hashing, sessions, login, CSRF, Data Access Layer
src/lib/db/pool.ts             pg pool, transaction helper, timestamp/numeric parsing
src/lib/db/queries/            SQL queries per feature
src/lib/validation/            Zod schemas
src/lib/api/                   response envelope, safe error mapping, auth wrapper
src/app/api/                   Route Handlers
src/app/login, src/app/(dashboard)/   pages
src/components/                UI components
tests/                         Vitest unit and integration tests
```

## Troubleshooting

- **Redirected to /login with no account yet**: run `npm run user:create` (step 3).
- **`relation "app_user" does not exist`**: apply migration 003.
- **`relation "v_overload_events" does not exist`**: apply migration 002.
- **Login always fails**: after 5 wrong attempts the account is locked for 15 minutes. An admin can still use another admin account; as a last resort, `UPDATE app_user SET locked_until = NULL, failed_login_count = 0 WHERE email = '...';`
- **Locked out of every admin account / forgot the only admin password**: run `npm run user:create` for a new admin, or reset in SQL after generating a hash.
- **Page says the database is unavailable**: PostgreSQL is not running or `DATABASE_URL` is wrong. Check `psql "$DATABASE_URL"`.
- **`npm run build && npm start` login seems to do nothing on http://localhost**: production sets the `Secure` cookie flag; set `COOKIE_SECURE=false` in `.env.local` for local production testing only.
- **`npm run user:create` fails to load `@node-rs/argon2`**: your platform has no prebuilt binary; tell me and the hashing module (`src/lib/auth/password.ts`, one file) can be switched to `bcryptjs`.
