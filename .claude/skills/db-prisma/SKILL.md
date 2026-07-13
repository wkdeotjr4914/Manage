---
name: db-prisma
description: >-
  Database & Prisma workflow for the PMS SAMPLE app (Prisma 7 + @prisma/adapter-pg
  on an EDB Oracle-compatible Postgres, isolated in the dc_pms schema). Use this
  WHENEVER you touch the DB or Prisma — editing prisma/schema.prisma or
  src/server/db.ts, running any db:* script, writing a query, or debugging. Trigger
  especially when: dates render as "Invalid Date" or "NaN.NaN.NaN"; a page 500s with
  `Cannot read properties of undefined (reading 'findMany')`; `prisma.<model>` is
  undefined at runtime; or you changed the schema and need to regenerate/push. Covers
  dc_pms schema isolation, the mandatory ISO datestyle connection option, db:generate
  vs db:push, and the dev-server restart caveat.
---

# DB & Prisma (PMS SAMPLE)

The app lives in a dedicated **`dc_pms`** schema inside a shared company Postgres
(`dc_erp`) that is **EDB (Oracle-compatible)**. Two facts about this setup cause
most of the time lost here — internalize them before touching data code.

## Schema isolation — never touch `public`

The `public` schema holds the ERP's own tables (User/Project/Task names collide).
Everything this app does must stay in `dc_pms`.

- `@prisma/adapter-pg` **ignores `?schema=` in the connection string**. The runtime
  schema is passed as the **2nd argument** to `PrismaPg`:
  `new PrismaPg({ connectionString, ... }, { schema })`. See `src/server/db.ts`
  and `prisma/seed.ts`. The `?schema=dc_pms` in `DATABASE_URL` only matters for the
  Prisma **CLI** (push/migrate).
- Never write to or migrate `public`. Don't add `--force-reset`.

## Oracle datestyle — why `db.ts` sets `options: "-c datestyle=ISO,MDY"`

EDB emits timestamps in Oracle style `DD-MON-YY` (e.g. `13-JUL-26`). The `pg`
driver's date parser only understands ISO, so **every Date comes back
`Invalid Date`** → UI shows `NaN.NaN.NaN`. The connection in `src/server/db.ts`
forces ISO to fix this app-wide:

```ts
new PrismaPg({ connectionString, options: "-c datestyle=ISO,MDY" }, { schema })
```

Do **not** remove that `options`. If dates regress to Invalid Date, check it's
still there first. To confirm what the DB actually stores, cast to text:
`SELECT "updatedAt"::text FROM "dc_pms"."Note" LIMIT 1` — ISO means fixed, Oracle
format means the option is missing.

## After changing `prisma/schema.prisma`

1. `npm run db:generate` — regenerates the client into `src/generated/prisma`.
2. `npm run db:push` — applies schema to the DB. Use **push, not migrate**: the RDS
   role lacks shadow-DB permissions, so `migrate dev` fails.
3. **Restart the dev server** (see the [[run-and-verify]] skill for why).

## Debug pattern: `prisma.<model>` is undefined at runtime

Symptom: a page 500s with `Cannot read properties of undefined (reading 'findMany')`,
e.g. `prisma.requirementSpec` / `prisma.pmsTask` / `prisma.deliverable` on the
`/projects/[id]/{requirements,tasks,deliverables}` pages.

Cause is almost always a **stale generated client** — the model exists in
`prisma/schema.prisma` but the client in `src/generated/prisma` predates it.

Fix: `npm run db:generate`, then restart the dev server. If the model is genuinely
missing from `schema.prisma`, add it first, then generate + `db:push`.

## Running server-only modules standalone (tsx)

Modules that `import "server-only"` throw if run outside a React Server context. To
run/test one via tsx:

```bash
NODE_OPTIONS=--conditions=react-server npx tsx <file>
```

`commitImport` also calls `revalidatePath`, which throws outside a Next request — the
DB writes complete first, so wrap the call in try/catch when testing via tsx.

## Command reference

- `npm run db:generate` — regenerate client (after schema edits)
- `npm run db:push` — apply schema (NOT migrate)
- `npm run db:seed` — demo data
- `npm run db:studio` — Prisma Studio
- `npm run db:clear` / `db:reset` — **destructive**, confirm intent before running
