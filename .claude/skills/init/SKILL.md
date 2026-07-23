---
name: init
description: Create or refresh CLAUDE.md for this repo. Use when asked to init the project, document conventions, or when no CLAUDE.md exists yet.
---

# Init CLAUDE.md for TinyEnginy

Besides the usual stack/structure summary, make sure a generated or refreshed CLAUDE.md captures
these project-specific facts. None of them are obvious from a quick file scan, and the first one
has already caused a backend crash once this session:

- **Temporal dependency**: `temporal server start-dev` must run as a persistent separate process
  before `backend`'s `pnpm run dev`. Without it the worker throws
  `ConnectError ... [::1]:7233 ... ConnectionRefused` and nodemon waits indefinitely. See the
  `run` skill in this same `.claude/skills/` directory for the full startup order.

- **Temporal default retry policy**: `proxyActivities` in `backend/src/workflows/workflows.ts`
  sets a timeout but no retry policy — Temporal's default is *unlimited retries* with exponential
  backoff. This is the real cause of the "email verification hangs" bug (the `jane.smith` activity
  always times out and then retries forever), and it matters for any new workflow: always pair a
  timeout with an explicit `retry.maximumAttempts`.

- **Provider simulation via magic strings**: `backend/src/workflows/activities/utils.ts` fakes
  provider responses using substrings in the lead's email — `john.doe` → not verified,
  `jane.smith` → 20s delay, any address containing `+` → not verified. Don't "fix" this logic as
  if it were a real bug; it's the intentional fixture.

- **Schema/CSV gap for "New lead fields"**: sample CSVs in `docs/` already include `yearsInRole`
  and `phoneNumber` columns that `backend/prisma/schema.prisma` does not model yet, and that
  `frontend/src/utils/csvParser.ts` / `backend/src/index.ts` bulk-import route don't parse. Any
  work on that feature touches all three: schema, CSV parsing, and the leads table UI.

- **Style**: both `frontend/.prettierrc.json` and `backend/.prettierrc.json` specify no
  semicolons, single quotes, `trailingComma: es5`, `printWidth: 110` — match this in new code.

For the fuller list of known issues found during codebase analysis (API mismatches, missing auth,
uneven test coverage, etc.), link to `docs/CLAUDE_SESSION_NOTES.md` rather than re-deriving it.
