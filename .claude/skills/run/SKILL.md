---
name: run
description: Launch the TinyEnginy app (backend + frontend) for manual testing. Use when asked to run, start, or verify the app works, or before claiming a bug fix or feature is done.
---

# Run TinyEnginy locally

Three processes must run together, in this order. Skipping the first one crashes the backend.

1. **Temporal dev server** (must stay running as a separate, persistent process):
   ```
   temporal server start-dev
   ```
   Verify before continuing: `lsof -i :7233` must show a `LISTEN` entry. If backend was started first, it throws
   `TransportError ... ConnectError ... [::1]:7233 ... ConnectionRefused` and nodemon sits at
   "waiting for file changes" — start Temporal, then re-run `pnpm run dev` (or type `rs` in that terminal).

2. **Backend** (from `backend/`):
   ```
   pnpm install        # first time only
   pnpm migrate:dev    # after any change to prisma/schema.prisma
   pnpm gen:prisma     # after any change to prisma/schema.prisma
   pnpm run dev        # nodemon; serves the API on :4000 and starts the Temporal worker
   ```

3. **Frontend** (from `frontend/`):
   ```
   pnpm install        # first time only
   pnpm run dev        # Vite dev server
   ```

## Smoke-testing changes

There is no e2e/integration coverage for the Express routes (only unit tests for
`messageGenerator.ts` and `csvParser.ts`). To verify a fix or feature actually works, exercise it
through the browser:

- CSV import: use the sample files in `docs/*.csv` (in particular `leads-with-errors.csv`, which
  deliberately contains invalid country codes like `XXX`/`12` and duplicate/invalid rows).
- Email verification: an email containing `jane.smith` triggers the artificial 20s delay used to
  simulate a slow/hanging provider; `john.doe` and any address with a `+` simulate "not verified".
- Message generation: templates use `{firstName}`, `{lastName}`, `{email}`, `{jobTitle}`,
  `{companyName}`, `{countryCode}` placeholders (see `backend/src/utils/messageGenerator.ts`).
