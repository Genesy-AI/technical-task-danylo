---
name: review
description: Review a GitHub PR or local diff for this repo. Use for the "PR Review" README task or any code review request.
---

# PR review checklist for TinyEnginy

On top of a general review, check specifically for patterns this codebase has already been caught
doing — a new PR repeating one of these is a strong signal to flag it:

- **Frontend/backend route mismatch**: does a new or changed call in
  `frontend/src/api/modules/leads.ts` use an HTTP method the backend actually registers in
  `backend/src/index.ts`? (Already found once: `update` is wired to PUT `/leads/:id`, but the
  backend only has PATCH `/leads/:id` — currently unused in the UI, so it's silent.)

- **Temporal activities**: does `proxyActivities` set an explicit retry policy
  (`retry.maximumAttempts`) alongside the timeout? A short timeout with no retry cap retries
  forever under Temporal's default policy — this is the root cause of the existing
  "email verification hangs" bug.

- **Temporal workflows**: is the `workflowId` deterministic (one per business entity, e.g.
  `enrich-phone-${lead.id}`), not time-based (`Date.now()` like the existing verify-email
  workflow)? README explicitly requires idempotent, one-workflow-per-lead behavior for the
  enrich-phone feature.

- **Schema changes**: does a `backend/prisma/schema.prisma` change also update CSV import
  (`frontend/src/utils/csvParser.ts` + the bulk-import route in `backend/src/index.ts`) and the
  leads table UI (`frontend/src/components/LeadsList.tsx`), or only one of the three?

- **Temporal connection reuse**: does the PR open a new `Connection`/`Client` per request instead
  of reusing one (existing anti-pattern in `POST /leads/verify-emails`)?

- **Validation**: is a new Express route validating its body consistently with the ad-hoc style
  already used elsewhere in `index.ts`, or silently skipping it?

Per the README's task description, end the review with an explicit **approve** or
**request-changes** verdict, plus inline comments on the specific lines.
