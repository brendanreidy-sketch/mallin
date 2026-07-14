/**
 * /share/[token] — public read-only render of an Account Intelligence
 * artifact. NO Clerk auth, NO tenant-membership check. The route is
 * gated by the opportunity having a non-null `share_token` field that
 * matches the URL token. If it doesn't, render NotFound.
 *
 * Use case: external sharing with prospects, investors, demo audiences,
 * community groups. The rendered content is the SANITIZED substrate —
 * see SanitizedCockpit.tsx for what gets dropped vs. the rep-internal
 * /prep view.
 *
 * Token rotation: regenerate the token on the opportunity row to
 * revoke an in-flight share link. Tokens are UUIDs (effectively
 * unguessable).
 */

import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/db/client";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import SanitizedCockpit from "./SanitizedCockpit";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Tokens are UUIDs — strict format. Anything else 404s.
  const safe = token.replace(/[^a-fA-F0-9-]/g, "");
  if (!safe || safe.length < 32) notFound();

  // Look up the opportunity by share_token. The column is sparse —
  // most opps have NULL; only explicitly-shared opps have a token.
  const { data: opp, error } = await supabaseAdmin
    .from("opportunities")
    .select("id, name, account_id, accounts(name)")
    .eq("share_token", safe)
    .maybeSingle();

  if (error || !opp) notFound();

  // Load the current account intelligence artifact for this opp.
  const { data: intelRow, error: intelErr } = await supabaseAdmin
    .from("account_intelligence_artifacts")
    .select("artifact")
    .eq("opportunity_id", opp.id)
    .eq("is_current", true)
    .maybeSingle();

  if (intelErr || !intelRow) notFound();
  const artifact = intelRow.artifact as AccountIntelligenceArtifact;

  const accountName =
    (opp.accounts as unknown as { name?: string } | null)?.name ??
    artifact.account?.name ??
    "Untitled Account";

  return <SanitizedCockpit artifact={artifact} accountName={accountName} />;
}
