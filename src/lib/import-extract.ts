// Client-side file → ImportSource extraction for the /import workbench.
//
// Text-based formats (md/txt/csv/xlsx/docx) are turned into a markdown string
// here in the browser and travel to the server as `kind:"text"`, reusing the
// whole existing analyze/commit pipeline. PDFs are NOT parsed — their raw bytes
// are base64-encoded and handed to Gemini's multimodal input server-side
// (`kind:"pdf"`), which also handles scanned/image PDFs via OCR.
//
// The heavy parsers (SheetJS, mammoth) are dynamically imported so they only
// load in the client chunk when a matching file is actually dropped in.

import type { ImportSource } from "@/lib/import";

/** Hard cap on PDF size. base64 inflates ~33%, and Vercel Hobby caps the
 *  server-action request body around 4.5MB, so keep the raw file well under. */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

const TEXT_EXTS = ["md", "markdown", "mdx", "txt"];
const SHEET_EXTS = ["xlsx", "xls"];

function extOf(name: string): string {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** Turn one picked file into an ImportSource, or throw a Korean error the
 *  caller surfaces per-file. */
export async function extractFile(file: File): Promise<ImportSource> {
  const name = file.name;
  const ext = extOf(name);

  if (TEXT_EXTS.includes(ext)) {
    const markdown = (await file.text()).trim();
    if (!markdown) throw new Error(`빈 파일입니다: ${name}`);
    return { name, kind: "text", markdown };
  }

  if (ext === "csv") {
    // CSV is already text — pass it through as UTF-8. (Routing it through
    // SheetJS mangles non-ASCII to the wrong codepage and coerces date strings
    // into Excel serial numbers.) Gemini reads raw CSV fine.
    const text = (await file.text()).trim();
    if (!text) throw new Error(`빈 파일입니다: ${name}`);
    return { name, kind: "text", markdown: `# ${stripExt(name)}\n\n${text}` };
  }

  if (SHEET_EXTS.includes(ext)) {
    return { name, kind: "text", markdown: await sheetToMarkdown(file, name) };
  }

  if (ext === "docx") {
    return { name, kind: "text", markdown: await docxToMarkdown(file, name) };
  }

  if (ext === "pdf") {
    if (file.size > MAX_PDF_BYTES) {
      const mb = Math.floor(MAX_PDF_BYTES / 1024 / 1024);
      throw new Error(`PDF가 너무 큽니다(최대 ${mb}MB). 문서를 나눠서 올려 주세요: ${name}`);
    }
    return {
      name,
      kind: "pdf",
      base64: await fileToBase64(file),
      mimeType: file.type || "application/pdf",
    };
  }

  if (ext === "doc") {
    throw new Error(`구형 .doc는 지원하지 않습니다. .docx로 저장해 주세요: ${name}`);
  }
  throw new Error(`지원하지 않는 형식입니다(.${ext}): ${name}`);
}

// ---- spreadsheet (xlsx/xls/csv) → markdown tables ----

function escapeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/** Render rows (array-of-arrays) as a GFM table; first row is the header. */
function rowsToMarkdownTable(rows: unknown[][]): string {
  const filled = rows.filter((r) => r.some((c) => escapeCell(c) !== ""));
  if (!filled.length) return "";
  const cols = Math.max(...filled.map((r) => r.length));
  const line = (r: unknown[]) =>
    `| ${Array.from({ length: cols }, (_, i) => escapeCell(r[i])).join(" | ")} |`;
  const sep = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;
  return [line(filled[0]), sep, ...filled.slice(1).map(line)].join("\n");
}

async function sheetToMarkdown(file: File, name: string): Promise<string> {
  const XLSX = await import("xlsx");
  // cellDates + formatted output (raw:false, dateNF) keep date cells readable
  // ("2026-07-20") instead of leaking Excel serial numbers.
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
    type: "array",
    cellDates: true,
    dateNF: "yyyy-mm-dd",
  });
  const parts: string[] = [`# ${stripExt(name)}`];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
      dateNF: "yyyy-mm-dd",
    });
    const table = rowsToMarkdownTable(rows);
    if (table) parts.push(`## ${sheetName}`, table);
  }
  if (parts.length <= 1) throw new Error(`빈 스프레드시트입니다: ${name}`);
  return parts.join("\n\n");
}

// ---- word (docx) → plain text ----

async function docxToMarkdown(file: File, name: string): Promise<string> {
  const mod = await import("mammoth");
  // mammoth is CJS (`export =`); depending on the bundler its API lands on the
  // namespace's `.default` or on the namespace itself — normalize either way.
  const mammoth = mod.default ?? mod;
  const { value } = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  const text = value.trim();
  if (!text) throw new Error(`텍스트를 추출하지 못했습니다: ${name}`);
  return `# ${stripExt(name)}\n\n${text}`;
}

// ---- pdf → base64 (no parsing; Gemini reads it) ----

function fileToBase64(file: File): Promise<string> {
  // FileReader.readAsDataURL uses the browser's native encoder — more memory
  // efficient than building a binary string for btoa.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error(`파일을 읽지 못했습니다: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
