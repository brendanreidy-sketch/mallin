/**
 * preview-brief — LOCAL visual-QA tooling only. Renders the fictional Northwind
 * brief to a .pptx and (if LibreOffice is present) a .pdf preview.
 *
 * NOT a runtime / production / API-route / CI dependency. LibreOffice is used
 * only for local eyeballing; the final deck MUST be reviewed in real Microsoft
 * PowerPoint before any production approval (LibreOffice rendering is not
 * definitive). Nothing in the renderer imports this file.
 *
 * Run: npx tsx lib/deck/preview-brief.ts [outDir]
 */

import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { assembleBrief } from "@/lib/deck/brief-model";
import { buildCover } from "@/lib/deck/brief-agent";
import { makeValidDraft, request } from "@/lib/deck/fixtures/brief-mock-drafts";
import { buildBriefPptx } from "@/lib/deck/build-brief-pptx";

async function main(): Promise<void> {
  const outDir = process.argv[2] ?? ".";
  const { brief } = assembleBrief(makeValidDraft(), buildCover(request));
  const { buffer, diagnostics, report } = await buildBriefPptx(brief);

  const pptxPath = join(outDir, "northwind-brief.pptx");
  writeFileSync(pptxPath, buffer);
  console.log(`wrote ${pptxPath} (${buffer.length} bytes, ${report.slides.length} slides)`);
  for (const d of diagnostics) console.log(`  diagnostic: ${d.code} — ${d.message}`);

  // Optional local PDF preview via LibreOffice. Best-effort; never required.
  for (const soffice of ["/opt/homebrew/bin/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice", "soffice"]) {
    try {
      execFileSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", outDir, pptxPath], { stdio: "ignore" });
      console.log(`wrote ${join(outDir, "northwind-brief.pdf")} (LibreOffice preview — NOT definitive; review in PowerPoint)`);
      return;
    } catch {
      // try next candidate
    }
  }
  console.log("LibreOffice not found — skipped PDF preview (local QA only).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
