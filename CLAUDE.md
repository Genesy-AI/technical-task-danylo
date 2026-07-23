# CLAUDE.md

Guidance for AI coding sessions working in this repo (TinyEnginy). Everything below is drawn
directly from the current code — file paths and behaviors are cited so they can be re-verified.

## Stack

- **Backend** (`backend/`): Express 5 + TypeScript, single-file API in `src/index.ts`. Prisma ORM
  (`@prisma/client` 6.x) over **SQLite** (`prisma/dev.db`, `schema.prisma` hardcodes
  `url = "file:./dev.db"` — ignore the MySQL URL in `.env.sample`, it's unused). Temporal
  (`@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow` 1.13.x) for the
  email-verification workflow. Tests: Vitest.
- **Frontend** (`frontend/`): Vite 7 + React 18 + TypeScript. TanStack Query 5 for server state,
  axios for HTTP, Tailwind CSS 4, react-hot-toast for notifications, papaparse for CSV parsing,
  lodash, `@tabler/icons-react`. Tests: Vitest + Testing Library.
- Package manager: **pnpm**, Node version pinned per-package via `.nvmrc` in both `backend/` and
  `frontend/`.
- The two apps are entirely separate pnpm projects (own `package.json`/lockfile) — there is **no
  shared types package**. Request/response shapes are hand-duplicated in
  `frontend/src/api/types/leads/*.ts` to match what the backend actually returns; nothing enforces
  they stay in sync, so when a backend route's shape changes, update the matching frontend type by
  hand.

## Running it (order matters)

Three processes, started in this order, or the backend crashes/hangs:

1. `temporal server start-dev` — must be running as a **persistent, separate process** before the
   backend starts. Verify with `lsof -i :7233` showing `LISTEN`. If the backend is started first,
   the Temporal worker throws `ConnectError ... [::1]:7233 ... ConnectionRefused` and `nodemon`
   sits at "waiting for file changes" indefinitely.
2. `backend`: `pnpm install` (first time) → `pnpm migrate:dev` + `pnpm gen:prisma` (whenever
   `prisma/schema.prisma` changes) → `pnpm run dev`. This one process serves the REST API on
   `:4000` (`app.listen(4000, ...)` in `src/index.ts`) **and** starts the Temporal worker
   (`runTemporalWorker()` called at the bottom of the same file).
3. `frontend`: `pnpm install` (first time) → `pnpm run dev` (Vite).

See `.claude/skills/run/SKILL.md` for the full checklist, including how to smoke-test each of the
CSV import / email verification / message generation flows manually (there is no e2e/integration
test coverage for the Express routes — only unit tests for `messageGenerator.ts` and
`csvParser.ts`).

## How backend and frontend connect

- Plain REST over JSON — no GraphQL/tRPC/websockets.
- Frontend base URL comes from `VITE_API_URL` in `frontend/.env` (`http://localhost:4000`),
  consumed by a single `axiosInstance` (`frontend/src/utils/axios.ts`) which throws at import time
  if the env var is missing.
- All API calls are built through a generic `endpoint()` factory
  (`frontend/src/api/utils.ts`) and assembled into `api.leads.*` in
  `frontend/src/api/modules/leads.ts` (`getMany`, `getOne`, `create`, `update`, `delete`,
  `deleteMany`, `bulkImport`, `generateMessages`, `verifyEmails`). Add new backend routes by adding
  a matching entry here plus a new file under `api/types/leads/`.
- Components call these through TanStack Query (`useQuery`/`useMutation`) directly in
  `LeadsList.tsx`, `CsvImportModal.tsx`, `MessageTemplateModal.tsx`. There is also a separate,
  more structured `useApiMutation` hook (`frontend/src/api/mutations/useApiMutation.ts`) with
  optimistic-update wiring, but only `leads.create` uses it today — the two patterns coexist, they
  are not (yet) unified.
- CORS is hand-rolled Express middleware in `src/index.ts` (`Access-Control-Allow-Origin: *`,
  manual `OPTIONS` short-circuit) — not the `cors` npm package.
- No authentication/authorization on any route.

## Temporal wiring

- `backend/src/worker.ts`: `NativeConnection.connect({ address: 'localhost:7233' })`, then
  `Worker.create({ namespace: 'default', taskQueue: 'myQueue', workflowsPath: require.resolve('./workflows'), activities })`.
- `backend/src/workflows/workflows.ts` defines workflows; `backend/src/workflows/activities/`
  defines activities (currently `verifyEmail` in `activities/utils.ts`).
- The only workflow today is `verifyEmailWorkflow(email): Promise<boolean>`, invoked from the
  `/leads/verify-emails` route in `src/index.ts`. That route opens a **new** `Connection`/`Client`
  per HTTP request (not pooled/reused) and calls `client.workflow.execute(...)` **sequentially, one
  lead at a time** — no parallelism across leads in the same request.

### Default retry/timeout expectations for activities

- `proxyActivities<typeof activities>({ startToCloseTimeout: '1 second' })` in `workflows.ts` sets
  a timeout **but no retry policy**. Temporal's default retry policy is **unlimited retries** with
  exponential backoff — it does not fail permanently on its own.
- This is the actual mechanism behind the "email verification hangs forever" behavior: the
  `jane.smith` activity path sleeps 20s, always exceeds the 1s `startToCloseTimeout`, and then
  retries forever with growing backoff instead of failing.
- **Rule for any new activity/workflow in this repo**: always pair a timeout
  (`startToCloseTimeout` and/or `scheduleToCloseTimeout`) with an explicit
  `retry: { maximumAttempts: N, ... }` (or use `scheduleToCloseTimeout` as a hard ceiling). Never
  leave retry policy at Temporal's default in this codebase.

## How providers are simulated

- There are no real external provider calls yet. `backend/src/workflows/activities/utils.ts`
  fakes the email-verification "provider" using substrings of the lead's email address:
  - email contains `john.doe` → returns `false` (not verified)
  - email contains `jane.smith` → sleeps 20 seconds before continuing (simulates a slow/hanging
    provider)
  - email contains `+` → returns `false`
  - otherwise → returns `true`
- This is intentional test fixture behavior, not a bug to "fix" by removing the special-casing.
- The three phone-lookup providers described in the README (Orion Connect, Astra Dialer, Nimbus
  Lookup) are **not implemented anywhere in the code** — they're external mock HTTP endpoints
  (`https://api.enginy.ai/api/tmp/...`) described only in `README.md`, each with a different
  request shape, auth header/param, and response field name. Any "enrich phone" workflow work is a
  from-scratch build that has to normalize these three different shapes behind one abstraction.

## Data model gaps to be aware of

- `backend/prisma/schema.prisma` `lead` model currently has: `id, createdAt, updatedAt, firstName
  (required), lastName (required), email (required), jobTitle?, countryCode?, companyName?,
  message?, emailVerified?`.
- Sample CSVs in `docs/*.csv` already include `yearsInRole` and `phoneNumber` columns that
  **nothing in the code parses or stores yet** — not in `schema.prisma`, not in
  `frontend/src/utils/csvParser.ts`, not in the `/leads/bulk` route in `src/index.ts`. Any "add
  phone/years/LinkedIn" work touches all three layers plus the leads table UI
  (`LeadsList.tsx`) and message templating (`messageGenerator.ts` / `MessageTemplateModal.tsx`).

## Coding conventions observed in the code

- **Formatting** (`backend/.prettierrc.json` and `frontend/.prettierrc.json`, identical): no
  semicolons, single quotes, `trailingComma: "es5"`, `tabWidth: 2`, `printWidth: 110`. Match this
  in new code; run `pnpm run format` in the relevant package rather than hand-formatting.
- **TypeScript**: `strict: true` in both `tsconfig`s. Backend compiles with `module: commonjs`,
  `target: es6`.
- **Frontend component style**: functional components typed as `FC<Props>` (see `LeadsList.tsx`,
  `CsvImportModal.tsx`, `MessageTemplateModal.tsx`), props interfaces named `<Component>Props`,
  modals rendered via `createPortal(..., document.body)`.
- **API layer structure**: one file per endpoint under `frontend/src/api/types/leads/` exporting
  `Leads<Name>Input` / `Leads<Name>Output` types; wired up in `api/modules/leads.ts`; consumed via
  `api.leads.<name>(...)`. Follow this file-per-endpoint pattern for new routes rather than adding
  ad hoc fetch calls.
- **Backend route style**: every mutating route in `src/index.ts` manually validates
  `req.body` shape and returns `400` with `{ error: string }` before doing any Prisma call; success
  responses are plain `res.json(...)`; unexpected errors are caught and logged with
  `console.error`, returning `500` with `{ error: string }`. Match this defensive-validation style
  for new routes.
- **Toasts**: user feedback for mutations goes through `react-hot-toast` (`toast.success` /
  `toast.error`) inside `onSuccess`/`onError` callbacks of `useMutation`, not inline JSX banners.
- **Testing**: Vitest colocated `*.test.ts` next to the file under test (e.g.
  `csvParser.test.ts`, `messageGenerator.test.ts`) — follow this colocation, don't create a
  separate `__tests__` tree.

## Rules (quick reference)

1. Start Temporal (`temporal server start-dev`) before the backend, every time. Confirm with
   `lsof -i :7233`.
2. Never add a Temporal activity/workflow without an explicit `retry.maximumAttempts` alongside
   its timeout — the platform default is unlimited retries, which is what causes the existing
   email-verification hang bug.
3. Don't "fix" the magic-string provider simulation in `activities/utils.ts`
   (`john.doe`/`jane.smith`/`+`) — it's a deliberate fixture, not dead or broken code.
4. The three phone-lookup providers (Orion Connect / Astra Dialer / Nimbus Lookup) exist only as
   mocked HTTP endpoints described in `README.md`; there is no existing backend code for them —
   build the abstraction from scratch, don't search for a partial implementation.
5. Adding a lead field means touching four places: `prisma/schema.prisma` (+ migration),
   `frontend/src/utils/csvParser.ts`, the `/leads/bulk` and related routes in `backend/src/index.ts`,
   and the relevant frontend components (`LeadsList.tsx`, `MessageTemplateModal.tsx`,
   `frontend/src/api/types/leads/*.ts`). Missing one silently breaks CSV import or message
   generation for that field.
6. Keep frontend `api/types/leads/*.ts` shapes in sync by hand whenever a backend route's request
   or response shape changes — there is no shared/generated type layer to catch drift.
7. Format with Prettier defaults already configured (no semicolons, single quotes, `es5` trailing
   commas, width 110) — don't introduce a different style in new files.
8. No route in the backend has auth — don't assume any request is authenticated when reasoning
   about security-sensitive changes.
9. For the fuller catalogue of known issues (API/type mismatches, missing auth, uneven test
   coverage, etc.) surfaced during codebase analysis, see `docs/CLAUDE_SESSION_NOTES.md` rather
   than re-deriving it from scratch.
