/**
 * Extracts plaintext from a transcript file (PDF or plain text).
 *
 * Used by the intake CLI to normalize transcript inputs before
 * handing to the Anthropic agent. Keep small + dependency-light.
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";

export async function extractTranscript(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();

  if (ext === ".pdf") {
    // Lazy import — pdf-parse pulls in heavy deps.
    const { PDFParse } = await import("pdf-parse");
    const data = readFileSync(path);
    const parser = new PDFParse({ data });
    const out = await parser.getText();
    return normalize(out.text);
  }

  if (ext === ".txt" || ext === ".md" || ext === "") {
    return normalize(readFileSync(path, "utf-8"));
  }

  throw new Error(
    `Unsupported transcript extension "${ext}" — use .pdf, .txt, or .md`,
  );
}

function normalize(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
