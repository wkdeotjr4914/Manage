# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## ⚠️ Critical: this is a modified Next.js (v16.2.10)

APIs, conventions, and file structure may differ from your training data. **Read the
relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code**, and
heed deprecation notices. (This is the standing instruction from `AGENTS.md` above.)

All user-facing text is **Korean** — match it in UI strings, errors, and comments.

## Commands

```bash
npm run dev          # dev server (localhost:3000)
npm run build        # production build (also the fastest full typecheck)
npm run lint         # eslint (next core-web-vitals + typescript)

npm run db:generate  # regenerate Prisma client into src/generated/prisma (run after schema edits)
npm run db:push      # push schema.prisma to the DB — THIS is the schema workflow (no migrations dir exists)
npm run db:seed      # wipe + reseed sample knowledge/kanban data (does NOT seed PMS submenu tables)
npm run db:clear     # empty all app tables (rows only; structure kept) — see scripts/clear.ts
npm run db:studio    # Prisma Studio
npm run import:tips   # scripts/import-tips-meetings.ts — bulk-import sample markdown

# db:migrate / db:reset exist but the project is push-based; prefer db:push unless deliberately adopting migrations.
```

There is no test runner configured. `npm run build` is the primary correctness gate.

## Database — read before touching data or Prisma

The DB is a **remote EDB (Oracle-compatible) Postgres**, and two non-obvious things in
`src/server/db.ts` make it work; don't remove them:

- **`datestyle=ISO,MDY` is forced on the connection.** EDB defaults to emitting
  `DD-MON-YY` timestamps that the `pg` driver parses as `Invalid Date`. Every `Date`
  column depends on this.
- **The schema is passed explicitly to the `PrismaPg` adapter.** `DATABASE_URL` carries
  `?schema=dc_pms`, but the pg driver *ignores* `?schema=`. Passing it to the adapter
  qualifies every query (`"dc_pms"."Note"`) and keeps this app's tables isolated from a
  same-named ERP schema (`public`) in the **shared** `dc_erp` database. Any script that
  opens its own client (`scripts/*`, `prisma/seed.ts`) repeats this pattern — keep it.

Prisma 7 uses **driver adapters** (no bundled query engine). The client is generated to
`src/generated/prisma`, so import it as `@/generated/prisma/client`, not `@prisma/client`.
`prisma`/`prisma.config.ts` load `DATABASE_URL` from `.env`.

## Architecture

A Next.js App Router app pairing a **knowledge graph ("second brain")** with a
**project-management (PMS)** domain, joined by a cross-link table. UI is server-rendered;
mutations go through server actions.

### Two domains + the bridge

- **Knowledge**: `Note` (graph node) · `Edge` (typed relation between notes) · `Tag` ·
  `Topic`. Notes carry a `sourceKey` (usually the imported filename) so re-importing a
  file can delete-and-replace its prior notes instead of duplicating.
- **PMS**: `Project` → `Task` (kanban) plus the **submenu domain ported from "spmf"**:
  `Requirement`, `RequirementSpec`, `WBSItem`, `PmsTask`, `Deliverable`. Every submenu
  record is scoped to a `Project` with `onDelete: Cascade`. Rendered under
  `/projects/[id]/{wbs,requirements-def,requirements,tasks,deliverables}` — the tab set
  lives in `components/shell/ProjectTopNav.tsx`, chrome in `app/projects/[id]/layout.tsx`.
- **Bridge**: `NoteLink` attaches a note to a project or task (`relation` label). This is
  what makes imported documents show up on a project *and* in the graph.

### Request/mutation flow

- **Server actions** in `src/server/actions/*.ts` (`"use server"`) are the only write
  path. Each: validates input with a Zod schema from `src/lib/validation.ts`, returns the
  discriminated union `ActionResult<T> = {ok:true,data?}|{ok:false,error}`, then calls
  `revalidatePath(...)` for every affected route. Follow this shape for new mutations.
- **Auth is a deliberate stub.** `src/server/auth.ts` is the single seam: `getScope()`
  currently returns `where: {}` (one shared workspace) and null user. Every action/query
  already routes through it, so wiring real auth later touches only this file — keep new
  queries going through `getScope()` rather than filtering ad hoc.

### Enum single-sources-of-truth (keep in sync)

Three files describe the same domain enums and must agree:
- `src/lib/validation.ts` — the `*_VALUES` arrays + Zod enums (the canonical string set).
- `src/lib/theme.ts` — per-enum **display metadata** (Korean labels + hex colors). Note
  `NodeTypeKey` (real DB types) vs `GraphNodeTypeKey` which adds a graph-only `PROJECT`
  hub kind — never let `PROJECT` reach a Prisma `type` filter.
- `prisma/schema.prisma` — the DB enums. Colors in `theme.ts` mirror CSS vars in
  `app/globals.css`.

### Knowledge graph rendering

`src/lib/graph/adapter.ts` (`getGraphData`) loads notes+edges, applies filters, drops
dangling edges, computes node degree, and **injects virtual `PROJECT` hub nodes**: files
imported into one project have no cross-edges, so a synthetic hub links each document's
anchor note into one constellation. `react-force-graph-2d` is browser-only — it's loaded
via `dynamic(..., { ssr: false })` in `components/graph/GraphView.tsx`. The graph canvas
is always dark-themed regardless of the app theme.

### Document import pipeline (signature feature)

`/import` → `analyzeImport` (mode `"heuristic"` or `"ai"`) produces an `ImportPlan`
(`src/lib/import.ts`), which `commitImport` writes transactionally into notes/edges/tasks
and the PMS submenu tables (per-domain save toggles; dedup by name/sourceKey).

- **The import AI is Google Gemini, NOT Claude** (`src/server/import/ai.ts`). It calls the
  `generativelanguage` REST API with a `responseSchema`; `coercePlan` is the validation
  backstop. Default model `gemini-flash-lite-latest` — **use `*-latest` aliases only;
  pinned/dated model ids 404 or are retired.** Set via `GEMINI_API_KEY` (+ optional
  `IMPORT_AI_MODEL`); with no key, only heuristic mode runs.
- Extracted dates are `YYYY-MM-DD` strings, bound to `Date` via `parseDateInput`.

### Dates & React-purity gotcha

Date-only values are anchored at **noon UTC** (`parseDateInput` in `src/lib/utils.ts`) and
read back with UTC getters (`toDateInputValue`) so a day never shifts under ±12h offsets
(e.g. KST). The React purity lint forbids `Date.now()`/`new Date()` during render — use the
module-scoped helpers (`daysAgo`, `todayDateInput`, `formatEpoch`) instead of inlining.

### Theming

Dual light/dark via a `data-theme` attribute on `<html>`, persisted in `localStorage`
under `theme`. `app/layout.tsx` runs a tiny pre-paint script to apply it before first
paint (no flash). `tint()` (`src/lib/utils.ts`) mixes an accent toward surface/foreground
CSS vars so one color reads in both themes.

### Conventions

- Path alias `@/*` → `src/*`.
- Server-only modules (`db.ts`, `graph/adapter.ts`, `import/ai.ts`) import `"server-only"`.
- Project subpages use `export const dynamic = "force-dynamic"`.

## Project skills (`.claude/skills/`)

Playbooks for the workflows that have repeatedly cost time here. Prefer consulting the
matching skill before diving in — they encode the gotchas above as step-by-step guidance.

- **db-prisma** — DB/Prisma work: `dc_pms` isolation, the forced ISO datestyle, `db:generate`
  vs `db:push`, and the "`prisma.<model>` is undefined → stale client → `db:generate`" debug
  pattern (this is what currently 500s the `/projects/[id]/{requirements,tasks,deliverables}` pages).
- **nextjs16** — before writing framework code: read the vendored Next docs, the hydration/FOUC
  pattern, CSS-not-conditional theme switching, and the React purity lint.
- **run-and-verify** — start/restart the dev server and browser-verify. Note the big trap:
  `db.ts` / connection changes need a **full dev-server restart** (the Prisma client is cached
  on `globalThis`, so HMR keeps the old one).
- **import-gemini** — the `/import` Gemini pipeline and the `*-latest`-only model gotcha.
