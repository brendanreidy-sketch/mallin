/**
 * GET /api/cron/process-brief-jobs
 *
 * Background worker for async internal-brief generation. Claims the oldest
 * 'queued' brief_jobs row (compare-and-swap → 'running'), runs the full model
 * pipeline (generate → validate → one repair → render) out of the user's
 * request lifecycle, and writes the terminal result (base64 .pptx or an
 * error_code). Processes ONE job per invocation so a single ~5-minute pipeline
 * stays comfortably inside maxDuration; the every-minute schedule drains the
 * queue one job at a time.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}`; reject otherwise.
 */
import { NextResponse, type NextRequest } from "next/server";
import { claimNextBriefJob, runClaimedBriefJob } from "@/lib/deck/brief-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // a full brief pipeline runs ~5 min; Fluid Compute ceiling

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const job = await claimNextBriefJob();
  if (!job) return NextResponse.json({ ok: true, processed: 0 });

  const status = await runClaimedBriefJob(job);
  return NextResponse.json({ ok: true, processed: 1, jobId: job.id, status });
}
