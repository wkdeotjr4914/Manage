---
name: nextjs16
description: >-
  Conventions and gotchas for THIS project's Next.js 16 (App Router) + React 19
  build. Consult this BEFORE writing or editing any Next.js/React code here — pages,
  layouts, client/server components, server actions, metadata, fonts, hydration, or
  theming. This Next version has breaking changes vs. training data (see AGENTS.md),
  so read node_modules/next/dist/docs first. Trigger whenever you hit a hydration
  mismatch, a flash of wrong content on load (FOUC), a theme-toggle rendering bug, an
  eslint "Cannot call impure function" / Date.now()-in-render error, or need SSR-safe
  client-only state.
---

# Next.js 16 conventions (PMS SAMPLE)

`AGENTS.md` warns: "This is NOT the Next.js you know." APIs, file structure, and
conventions differ from what's in training data. The docs are vendored locally —
**read them before writing framework code.**

## Read the vendored docs first

- Docs live at `node_modules/next/dist/docs/01-app/…`
  (`01-getting-started/` for routing/layouts/data-fetching/caching, `02-guides/` for
  hydration, rendering philosophy, etc.).
- When a task touches fonts, metadata, caching, server actions, or hydration, open
  the matching guide instead of assuming the old API.

## Hydration & FOUC (the recurring trap)

Anything that depends on client-only state (theme, locale, localStorage) must be
corrected **before first paint**, or React throws a hydration mismatch and the user
sees a flash. Guide: `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`.

Pattern already used here (theme):
- `<html data-theme="light" suppressHydrationWarning>` in `src/app/layout.tsx`.
- An inline `<head>` `<script dangerouslySetInnerHTML>` reads `localStorage` and sets
  `data-theme` synchronously during HTML parse.

**Key rule:** a component whose *output* differs by theme/client-state must switch
via **CSS**, not conditional rendering. The server always renders the default, so
`isDark ? <Sun/> : <Moon/>` mismatches at hydration. `ThemeToggle` renders BOTH icons
and lets CSS (`.theme-icon-light` / `.theme-icon-dark`, keyed off `[data-theme]`)
show the right one — identical server/client markup, no mismatch. Reach for this
pattern before adding `suppressHydrationWarning` to deep nodes (it only covers one
level and won't silence nested SVG/text diffs).

## React purity lint (Date.now / new Date / Math.random)

The bundled `react-hooks` (React Compiler) rules reject impure calls **in render**:
`Date.now()`, `new Date()`, `Math.random()`. `npm run lint` fails with
"Cannot call impure function". Put the impure call in a plain module helper instead —
e.g. `daysAgo(n)` in `src/lib/utils.ts` — and call that from the component. Same for
`setState` directly inside an effect body and writing `ref.current` during render.

## Pre-existing lint debt (not yours)

`npm run lint` already fails (~12 errors) in files unrelated to most changes:
- `src/components/graph/ConstellationGraph.tsx` — `no-explicit-any`
- `src/components/graph/GraphView.tsx` — `set-state-in-effect`
- `src/components/kanban/KanbanBoard.tsx` — `refs` + `set-state-in-effect`

Don't claim you introduced these, and don't get pulled into fixing them unless asked.
`next build` runs lint and will fail on them, so prefer `npx tsc --noEmit` for a quick
type check.

## Theming

Design tokens are CSS variables in `src/app/globals.css` — `:root` = light (DashStack),
`[data-theme="dark"]` = dark. Components use token classes (`bg-surface`,
`text-foreground`, …), so re-theming = overriding the raw vars, nothing else. The
knowledge graph stays dark in both themes via the `.graph-dark` token island. See the
`pms-dual-theme-dashstack` project memory for the full rationale.
