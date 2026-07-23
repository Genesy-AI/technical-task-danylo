---
name: security-review
description: Security review of pending changes on this branch. Use for the codebase analysis/roadmap task, or before merging anything touching auth, input handling, or the external phone-lookup providers.
---

# Security review baseline for TinyEnginy

These issues are already present in the baseline codebase — don't re-report them as new findings
unless a diff makes them worse. Do flag a diff that touches these areas without addressing them:

- `Access-Control-Allow-Origin: '*'` on every route (`backend/src/index.ts`) — no origin
  restriction at all.
- No authentication/authorization middleware anywhere in the Express app.
- Input validation is manual and ad hoc per route (no schema library like zod) — check that new
  routes don't skip it entirely.

## Extra attention for the enrich-phone feature

The README's provider APIs each use a different auth scheme (header `x-auth-me`, header `apiKey`,
query param `api`) with hardcoded example keys. When implementing the real integration:

- Provider credentials must not leak into logs, error responses returned to the client, or get
  committed into `.env` files that end up in git.
- Responses from all three providers are untrusted external input — validate shape before storing
  (e.g. Nimbus Lookup returns `number` as a `number` type and a separate `countryCode`; don't trust
  it matches the `phoneNumber` format used elsewhere).
- Rate limiting is called out as "nice to have" in the README (providers currently unlimited, but
  will add limits) — a naive sequential-retry-on-all-three-providers implementation without
  backoff awareness could get the app rate-limited in production.

Also review any new user-facing input introduced by the "New lead fields" feature (phone number,
years at company, LinkedIn URL — via manual entry or CSV) for the same missing-validation pattern
already found in `countryCode` (accepted as any string, no format check).
