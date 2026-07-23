---
name: simplify
description: Review changed code in this repo for reuse, simplification, and consistency with project conventions. Quality pass only, not a bug hunt.
---

# Simplify pass conventions for TinyEnginy

**Style baseline** (from `.prettierrc.json` in both `frontend/` and `backend/`): no semicolons,
single quotes, `trailingComma: es5`, `printWidth: 110`. Run `pnpm format` if unsure rather than
hand-matching style.

**Known duplication worth flattening only if a diff already touches it** — don't refactor these
pre-emptively in an unrelated change, this is a small take-home-sized codebase where premature
abstraction is a bigger risk than a little duplication:

- Per-route manual validation blocks in `backend/src/index.ts` repeat the same
  `if (!req.body || typeof req.body !== 'object')` guard. If a diff adds another route with the
  same guard, that's the signal to extract it — not before.
- Temporal `Connection`/`Client` construction is duplicated per-request in the `verify-emails`
  route. If the enrich-phone feature adds a second call site with the same pattern, extract a
  shared client at that point.

**Keep changes scoped to what the task actually asked for.** Bug fixes here don't need
surrounding cleanup; a one-off script doesn't need a reusable helper.
