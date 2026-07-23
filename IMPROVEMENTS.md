# TinyEnginy — Codebase Analysis & Technical Roadmap

**Status:** Draft for review · **Owner:** Engineering · **Last updated:** 2026-07-23

This is a working document, not a sprint plan — it's meant to give the team a shared picture of
where the codebase stands today, what's fragile, and what order to tackle things in. Priorities
are P0 (fix before it bites us) → P3 (nice to have, no rush). Effort is a rough T-shirt size, not
a commitment.

## Where things stand

TinyEnginy is a small lead-management app: Express + Prisma/SQLite backend, React + TanStack
Query frontend, Temporal for background workflows (email verification, and — as of this cycle —
phone enrichment across three external providers). It works, and the recent feature work landed
cleanly, but the codebase still carries a lot of "take-home exercise" scaffolding: no auth, no
CI, no shared types between frontend and backend, and a handful of validation/consistency gaps
that are fine at 200 rows of test data and will not be fine at 20,000.

The good news: the two structural gaps that made this hardest to improve safely — no route-level
test harness, and Temporal workflows with no bounded retry policy — are both fixed as of this
cycle (see "Recently resolved" below). That unblocks most of what's on this list.

---

## P0 — Fix before this touches anything real

| Item | Why it matters |
|---|---|
| **No authentication or authorization on any endpoint** | Every `/leads/*` route is open. Anyone who can reach port 4000 can read, edit, or delete all lead data, or trigger unlimited email-verification/phone-enrichment workflows (which cost real API calls to external providers). This is fine for a local demo, not for anything with real data in it. |
| **Provider credentials hardcoded in source** (`x-auth-me: mySecretKey123`, `apiKey: 1234jhgf`, `api=000099998888` in `phoneProviders.ts`) | These are committed to git in plaintext. Move to environment variables before this goes anywhere near a shared repo with real credentials. |
| **`pnpm run build` is currently broken** | `frontend/src/api/mutations/useApiMutation.ts:64` has a type error (missing `emailVerified` in the optimistic-create object) that fails `tsc -b` outright, so `vite build` never runs. This predates the current feature work but nobody can ship a production bundle until it's fixed — it's a 1-line fix. |

## P1 — High priority, do next

| Item | Why it matters | Effort |
|---|---|---|
| **No rate limiting on the phone-enrichment providers** | The README explicitly flags that Orion Connect / Astra Dialer / Nimbus Lookup will add rate limits soon. Right now a bulk "Enrich Phone" action fires one workflow per lead with no throttling — fine at unlimited RPS, a fast way to get our IPs blocked once limits land. Temporal supports this natively (`Worker`'s `maxConcurrentActivityTaskExecutions`, or a per-provider rate limiter) — worth building before it's forced on us. | M |
| **No pagination on `GET /leads`** | The endpoint returns every lead, every time, with no `limit`/`cursor`. Fine at today's row counts; becomes a real problem once a customer imports a few thousand leads via CSV. | M |
| **Bulk-import de-duplication only checks `firstName + lastName`** | Two different people named "John Smith" collide and get skipped; two entries with the same email but different names both get imported as separate leads. Should key on email (or email + name) instead. | S |
| **CSV import is the only way to set `phoneNumber` / `yearsInRole` / `linkedinUrl` / `jobTitle` / `countryCode` / `companyName`** | The single-lead `POST /leads` and `PATCH /leads/:id` routes only ever handled `firstName`/`lastName`/`email`. There's no way to edit any of these fields on an existing lead without re-importing a whole CSV. Worth a proper edit-lead form. | M |
| **No CI pipeline** | Dependabot is already configured and opening PRs (good), but there's no `.github/workflows` to actually run lint/typecheck/tests against them or against `main`. Right now, someone has to remember to run the test suite locally. | S |

## P2 — Medium priority

| Item | Why it matters | Effort |
|---|---|---|
| **No shared types between frontend and backend** | `frontend/src/api/types/leads/*.ts` hand-mirrors whatever the Express routes actually return, with nothing enforcing they stay in sync. This bit us directly this cycle — every new backend field required a matching manual frontend type update, and it's easy to forget one. Worth a shared types package, or generating the frontend types from the Prisma schema / an OpenAPI spec. | M/L |
| **Two competing data-fetching patterns on the frontend** | Most mutations call `useMutation({ mutationFn: api.leads.X })` directly; a separate `useApiMutation` hook exists with proper optimistic-update wiring but only `leads.create` uses it. Pick one pattern and migrate the rest, or document when to use which. | S/M |
| **Message-composition field picker is a single flat dropdown** | We already converted this from a button-per-field row (which stopped scaling around 9 fields) to a dropdown this cycle. That buys time but doesn't solve search/grouping for when the field list keeps growing — worth a proper searchable combobox once we're past ~15 fields. | S |
| **No observability** | Errors go to `console.error` and nowhere else. No request logging, no metrics on workflow success/failure rates, no alerting if the Temporal worker crashes. We'd have no idea today if phone enrichment silently started failing for everyone. | M |
| **No test database** | All integration tests (`app.test.ts`, `phoneEnrichment.test.ts`, the new `workflows.test.ts`) run against the real local `dev.db`, tagging their own rows and cleaning up after themselves. Works for local dev; will not work cleanly in CI without a disposable Postgres/SQLite instance per run. | M |

## P3 — Nice to have, no rush

- Consolidate repeated Tailwind class strings across the three modals (`CsvImportModal`, `MessageTemplateModal`, and the enrich/delete buttons in `LeadsList`) into shared components instead of copy-pasted className blocks.
- Surface *which* provider found a phone (Orion vs Astra vs Nimbus) in the UI — currently only the final phone number and status are shown; the provider that succeeded is discarded.
- CORS is hand-rolled Express middleware (`Access-Control-Allow-Origin: *`) instead of the `cors` package — works, but the standard package handles edge cases (preflight caching, credentialed requests) we'd otherwise have to reinvent.
- `backend/.env.sample` documents a MySQL connection string that nothing in the code uses (`schema.prisma`'s datasource is hardcoded to SQLite) — either wire it up for real or delete it so it stops being misleading.

---

## Recently resolved (for context — not asking anyone to re-litigate these)

- **Email verification could hang forever with no feedback.** Root cause: a 1-second activity
  timeout paired with Temporal's default *unlimited* retry policy, combined with an
  intentionally-slow simulated provider path. Fixed by raising the timeout to cover the slow
  path and adding a bounded retry policy (3 attempts). This is now the standing rule for every
  Temporal activity in the codebase: never ship a timeout without an explicit retry cap.
- **CSV country-code import accepted garbage** (`"12"`, `"XXX"`) as valid country codes. Fixed
  with an ISO 3166-1 alpha-2 allowlist.
- **No route-level test coverage existed for any Express endpoint.** `backend/src/index.ts` used
  to call `app.listen()` and boot the Temporal worker at module load time, which made it
  impossible to import for testing without side effects (port conflicts, a real worker
  connecting to Temporal). Split into `app.ts` (routes only) + `index.ts` (process bootstrap) —
  now every route has `supertest`-based coverage.
- **Phone-enrichment workflow shipped this cycle**, including the provider abstraction layer,
  bounded per-provider retries, idempotent per-lead workflow IDs, and async start+poll UI
  feedback instead of a blocking request.

---

## Suggested sequencing

1. **This sprint:** the three P0 items (they're all small — auth is the exception, see below).
2. **Next sprint:** provider rate limiting (README explicitly warns this is coming), pagination,
   the bulk-import dedup fix.
3. **Following sprint:** CI pipeline, shared types investigation.
4. **Ongoing:** everything in P2/P3 as capacity allows.

Note on auth: "add authentication" is listed as P0 by severity, but it's genuinely a design
decision (session-based? JWT? SSO?) rather than a quick patch, and deserves its own short design
doc rather than being bolted on reactively. Flagging it here so it doesn't get silently dropped,
not proposing to rush an implementation.
