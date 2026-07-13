---
name: import-gemini
description: >-
  The /import document-ingestion AI pipeline for PMS SAMPLE runs on Google Gemini
  (NOT Claude/Anthropic). Use this whenever you work on the import feature — the
  /import page, src/server/import/ai.ts, src/server/actions/import.ts, or
  ImportWorkbench — or when AI analysis suddenly fails with a 404 / "model not found"
  / "no longer available" error. Covers the GEMINI_API_KEY and IMPORT_AI_MODEL env
  vars and the critical gotcha that only *-latest model aliases work with this key
  (pinned/versioned model names 404).
---

# /import AI pipeline (Gemini)

The `/import` page turns uploaded/pasted markdown into notes, edges, tasks, tags,
topics, projects, and PMS records. It has two modes: a rule-based heuristic (no key
needed) and **AI Smart**, which calls Google Gemini.

Note: an older project memory still says the AI analyzer uses Anthropic/Claude — that
is stale. It was switched to Gemini on 2026-07-13. This skill is authoritative.

## How it works

- Provider: **Google Gemini** via REST (`generativelanguage.googleapis.com`) called
  with `fetch` — no SDK. Structured output via `responseMimeType: application/json`
  + `responseSchema`.
- Key files: `src/server/import/ai.ts` (Gemini call + system prompt + schema),
  `src/server/actions/import.ts` (server actions), `src/server/import/heuristic.ts`
  and `metadata.ts` (rule-based path + frontmatter/hashtag extraction),
  `src/components/import/ImportWorkbench.tsx` (UI).
- Env: `GEMINI_API_KEY` (required to enable AI mode), `IMPORT_AI_MODEL` (optional,
  default `gemini-flash-lite-latest`). Without the key, only heuristic mode runs.

## Gotcha: only `*-latest` aliases work with this key

Pinned/versioned model names (`gemini-2.0-flash`, `gemini-2.5-flash`,
`gemini-2.0-flash-001`, …) return **404** for this API key — some are retired, others
just aren't served on this key. Only `*-latest` aliases (e.g.
`gemini-flash-lite-latest`) succeed at `generateContent`.

**If import suddenly dies with a 404 / "no longer available":** suspect model
retirement, not a code bug. List available models for the key
(`GET .../v1beta/models?key=…`), pick a live `*-latest` alias, and set
`IMPORT_AI_MODEL` to it. **No code change needed.**
