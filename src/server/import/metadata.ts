import "server-only";

/**
 * Document-level metadata pulled out of a markdown file before analysis:
 * YAML frontmatter (title / tags / topic / project) plus inline `#hashtags`
 * from the body. Feeds both the heuristic and AI analyzers so projects, tags,
 * and topics accumulate automatically on import.
 */
export type ExtractedMetadata = {
  /** Markdown body with the frontmatter block stripped. */
  body: string;
  title?: string;
  tags: string[];
  topic?: string;
  project?: string;
};

/** Strip matching surrounding quotes from a scalar value. */
function unquote(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/** A frontmatter value is either a scalar string or a list of strings. */
type FmValue = string | string[];

/** Normalize any frontmatter value to a clean string array (drops blanks). */
function toArray(v: FmValue | undefined): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((x) => unquote(String(x))).map((x) => x.trim()).filter(Boolean);
}

/** First non-empty scalar of a frontmatter value, or undefined. */
function firstScalar(v: FmValue | undefined): string | undefined {
  const arr = toArray(v);
  return arr[0];
}

const KEY_LINE = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;
const LIST_LINE = /^\s*-\s+(.*\S)\s*$/;

/**
 * Minimal, defensive YAML-frontmatter parser. Handles the shapes markdown
 * notes actually use — `key: value`, inline `key: [a, b]`, and block lists
 * (`key:` then `  - item`) — and ignores anything it doesn't understand rather
 * than throwing.
 */
function parseFrontmatter(block: string): Record<string, FmValue> {
  const out: Record<string, FmValue> = {};
  let listKey: string | null = null;
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;

    const listItem = line.match(LIST_LINE);
    if (listItem && listKey && Array.isArray(out[listKey])) {
      (out[listKey] as string[]).push(unquote(listItem[1]));
      continue;
    }

    const kv = line.match(KEY_LINE);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const rest = kv[2].trim();

    if (rest === "") {
      // Begin a block list; subsequent `- item` lines append to it.
      out[key] = [];
      listKey = key;
    } else if (rest.startsWith("[") && rest.endsWith("]")) {
      out[key] = rest
        .slice(1, -1)
        .split(",")
        .map((x) => unquote(x))
        .filter(Boolean);
      listKey = null;
    } else {
      out[key] = unquote(rest);
      listKey = null;
    }
  }
  return out;
}

/** Split leading `---\n … \n---` frontmatter from the body, if present. */
function splitFrontmatter(markdown: string): { fm: string | null; body: string } {
  const text = markdown.replace(/^﻿/, "");
  if (!/^---\s*\n/.test(text)) return { fm: null, body: text };
  // Find the closing fence on its own line.
  const rest = text.slice(text.indexOf("\n") + 1);
  const close = rest.search(/\n(?:---|\.\.\.)\s*(?:\n|$)/);
  if (close === -1) return { fm: null, body: text };
  const fm = rest.slice(0, close);
  const after = rest.slice(close + 1); // skip the leading newline
  const body = after.replace(/^(?:---|\.\.\.)\s*\n?/, "");
  return { fm, body: body.replace(/^\s*\n/, "") };
}

// Inline hashtags: `#tag` starting with a letter/digit/underscore, so markdown
// headings (`# `, `## `) and bare `#` are excluded. Unicode-aware for Korean.
const HASHTAG = /(?:^|\s)#([\p{L}\d_][\p{L}\d_/-]*)/gu;

function extractHashtags(body: string): string[] {
  // Ignore `#` inside fenced code blocks and inline code (e.g. `#define`).
  const stripped = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ");
  const out: string[] = [];
  for (const m of stripped.matchAll(HASHTAG)) out.push(m[1]);
  return out;
}

/** Case-insensitive dedupe that preserves the first-seen spelling. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

export function extractMetadata(markdown: string): ExtractedMetadata {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const { fm, body } = splitFrontmatter(normalized);
  const meta = fm ? parseFrontmatter(fm) : {};

  const fmTags = [
    ...toArray(meta.tags),
    ...toArray(meta.tag),
    ...toArray(meta.keywords),
    ...toArray(meta.category),
    ...toArray(meta.categories),
  ];
  const tags = dedupe([...fmTags, ...extractHashtags(body)]);

  return {
    body,
    title: firstScalar(meta.title),
    tags,
    topic: firstScalar(meta.topic) ?? firstScalar(meta.topics),
    project: firstScalar(meta.project) ?? firstScalar(meta.projects),
  };
}
