import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/db/client";
import { runIntakeSubstrate } from "@/lib/agents/intake-substrate-agent";

/**
 * POST /api/try-brief — PUBLIC, no auth. The "try one call" hook: a visitor
 * gives a company + what they sell + who they're meeting, and gets a real
 * pre-call brief (Pass 0 research only — no transcript, no persistence).
 *
 * This exposes a costed LLM + web-search pipeline to the open internet, so it
 * is rate-limited: a per-IP daily cap and a global daily cap, both read off
 * anon_brief_log (migration 024). If the ledger table is missing the route
 * fails CLOSED — never run the costed pipeline ungoverned.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pass 0 web-research runs a few minutes — same window as the intake routes.
export const maxDuration = 800;

// A cold visitor should be able to try a couple of accounts before the signup
// nudge — 1/day walled people on their second brief, before they were sold.
// Still bounded by the 150/day global cost cap below.
const PER_IP_DAILY = 3;
const GLOBAL_DAILY = 150;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    company?: string;
    productContext?: string;
    stakeholders?: string;
  };
  const company = (body.company ?? "").trim().slice(0, 200);
  const productContext = (body.productContext ?? "").trim().slice(0, 300);
  const stakeholderHints = (body.stakeholders ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!company) {
    return NextResponse.json(
      { error: "company_required", message: "Tell us the company you're meeting." },
      { status: 400 },
    );
  }
  if (!productContext) {
    return NextResponse.json(
      { error: "product_required", message: "Tell us what you sell." },
      { status: 400 },
    );
  }

  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "unknown";
  const since = new Date(Date.now() - 86_400_000).toISOString();

  // ── Light abuse guard: per-IP + global daily caps. Fail CLOSED if the
  //    ledger can't be read — better to send someone to signup than to leave
  //    a public costed pipeline ungoverned.
  try {
    const { count: ipCount } = await supabaseAdmin
      .from("anon_brief_log")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((ipCount ?? 0) >= PER_IP_DAILY) {
      return NextResponse.json(
        { error: "rate_limited", message: "That's your free brief. Sign up free — your first 3 calls are on us." },
        { status: 429 },
      );
    }
    const { count: globalCount } = await supabaseAdmin
      .from("anon_brief_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since);
    if ((globalCount ?? 0) >= GLOBAL_DAILY) {
      return NextResponse.json(
        { error: "busy", message: "Free briefs are busy right now — sign up to skip the line." },
        { status: 429 },
      );
    }
    await supabaseAdmin.from("anon_brief_log").insert({ ip });
  } catch {
    return NextResponse.json(
      { error: "unavailable", message: "Try-it is warming up — sign up to build your brief." },
      { status: 503 },
    );
  }

  try {
    const intake = await runIntakeSubstrate({
      mode: "pre_call",
      transcript: "",
      product_context: productContext,
      account_name_hint: company,
      stakeholder_hints: stakeholderHints,
    });
    return NextResponse.json({
      ok: true,
      account_name: intake.account_name,
      artifact: intake.artifact,
    });
  } catch (err) {
    console.error("[try-brief] research failed:", err);
    return NextResponse.json(
      { error: "research_failed", message: "We couldn't finish researching that account. Try again, or sign up for the full product." },
      { status: 502 },
    );
  }
}
