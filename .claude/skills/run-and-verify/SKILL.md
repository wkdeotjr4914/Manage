---
name: run-and-verify
description: >-
  How to run and browser-verify the PMS SAMPLE app locally (Next.js dev server on
  port 3000 + Chrome MCP). Use whenever you need to start or restart the dev server,
  load the app in a browser, take screenshots, confirm a fix works, or check
  light/dark themes and console hydration errors. Trigger ESPECIALLY after editing
  src/server/db.ts or any DB-connection code — the Prisma client is cached on
  globalThis, so changes there need a full dev-server restart (HMR keeps the old
  client) — and whenever the app appears to be down.
---

# Run & verify (PMS SAMPLE)

Complements the built-in `/run` and `/verify` — this adds the project-specific
caveats that trip people up.

## Start the dev server

```bash
npm run dev            # Next.js dev, port 3000 (Turbopack)
npm run dev -- -p 3002 # different port if 3000 is taken
```

- `.env` must have `DATABASE_URL`, or `src/server/db.ts` throws at startup
  ("DATABASE_URL 환경변수가 설정되지 않았습니다").
- **Only one `next dev` per directory.** A second one detects the lock, prints
  "Another next dev server is already running", and exits. If your new server won't
  start, an old one is still up — reuse it or stop it first
  (`Stop-Process -Id <pid> -Force`; the banner prints the PID).

## The restart caveat (most common gotcha)

`src/server/db.ts` caches the Prisma client on `globalThis` (dev singleton). HMR
re-evaluates modules but keeps that cached client, so **edits to `db.ts` or the DB
connection options do NOT take effect until the dev server is fully restarted.**
After changing `db.ts` (or running `db:generate` — see [[db-prisma]]), stop and
restart `npm run dev`, then re-check.

## Verify in the browser (Chrome MCP)

1. Load core tools with one ToolSearch call, then `tabs_context_mcp` → `navigate` to
   `http://localhost:3000`.
2. `screenshot` the page. For themes, toggle via the header button or set
   `localStorage.theme` and reload; screenshot light and dark.
3. Check hydration health: `read_console_messages` with a pattern like
   `hydrat|mismatch|Error`. Ignore extension noise ("message channel closed");
   care about "Hydration failed". See [[nextjs16]] for what causes these.
4. To read a rendered value quickly, use `javascript_tool` (e.g. check
   `document.body.innerText.includes('NaN')`).

## Non-browser checks

```bash
npx tsc --noEmit   # fast, reliable type check (prefer over build)
npm run lint       # note: already fails on pre-existing debt — see [[nextjs16]]
npm run build      # full build; also runs lint, so it fails on that debt too
```

State results honestly: if lint fails only on the known pre-existing files, say so;
don't report a green build that isn't.
