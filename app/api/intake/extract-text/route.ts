import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * POST /api/intake/extract-text — server-side text extraction for transcript
 * uploads that the browser can't read directly (Word, PDF).
 *
 * Plain-text formats (.txt/.md/.vtt/.srt) are read client-side; this route is
 * for the binary ones:
 *   .docx → mammoth (raw text)
 *   .pdf  → pdf-parse v2 (PDFParse → getText)
 *
 * Accepts multipart/form-data with a single `file` field. Returns { text }.
 * Auth-gated (signed-in users only). Caps file size to avoid abuse.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "bad_form" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "File is too large (max 20 MB)." },
      { status: 400 },
    );
  }

  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    let text = "";
    if (name.endsWith(".docx")) {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    } else if (name.endsWith(".pdf")) {
      // unpdf, not pdf-parse: pdf-parse's pdfjs build needs the browser DOMMatrix
      // API, which doesn't exist in Vercel's Node runtime ("DOMMatrix is not
      // defined"). unpdf ships a serverless pdfjs build with no DOM deps.
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const extracted = await extractText(pdf, { mergePages: true });
      text = extracted.text;
    } else if (/\.(txt|text|md|markdown|vtt|srt)$/.test(name)) {
      text = buf.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "unsupported", message: "Unsupported file type. Use .txt, .md, .vtt, .srt, .docx, or .pdf." },
        { status: 400 },
      );
    }

    text = text.trim();
    if (!text) {
      return NextResponse.json(
        { error: "empty", message: "Couldn't find any text in that file — it may be scanned/image-only." },
        { status: 422 },
      );
    }
    return NextResponse.json({ text });
  } catch (err) {
    console.error(`[extract-text] parse failed for ${name}:`, err);
    return NextResponse.json(
      {
        error: "parse_failed",
        message: "Couldn't read that file. Try exporting the transcript as .txt.",
        detail: ((err as Error)?.message ?? String(err)).slice(0, 300),
      },
      { status: 422 },
    );
  }
}
