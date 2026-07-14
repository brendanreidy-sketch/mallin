/**
 * /deck/[token] — public, read-only slide deck built from an Account
 * Intelligence artifact. NO Clerk auth, NO tenant check. Gated exactly like
 * /share/[token]: the opportunity must carry a non-null `share_token` matching
 * the URL. The rendered content is the SANITIZED, customer-safe substrate —
 * the deck model (lib/deck/deck-model.ts) drops every rep-internal field.
 *
 * This is the presentation form of /share/[token]: same gate, same source,
 * same sanitization, different shape (slides vs. scroll). Reuse a deck link by
 * regenerating the opportunity's share_token to revoke it.
 */

import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/db/client";
import { getTenantBrand } from "@/lib/auth/tenant-context";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import { buildDeckModel } from "@/lib/deck/deck-model";
import { loadSellerPerson } from "@/lib/deck/ae-profile";
import { resolveBrandingAuto } from "@/lib/deck/brands";
import { buildVersionList, selectArtifactRow, type DeckArtifactRow } from "@/lib/deck/deck-versions";
import DeckView from "./DeckView";

export const dynamic = "force-dynamic";

export default async function DeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { token } = await params;
  const { v } = await searchParams;
  // Tokens are UUIDs — strict format. Anything else 404s.
  const safe = token.replace(/[^a-fA-F0-9-]/g, "");
  if (!safe || safe.length < 32) notFound();

  // The requested version id — untrusted. Constrained to the UUID charset so it
  // can't smuggle anything into the query; `selectArtifactRow` then confirms it
  // actually maps to a row in THIS opportunity's history before rendering it.
  const requestedVersion = v ? v.replace(/[^a-fA-F0-9-]/g, "") : undefined;

  const { data: opp, error } = await supabaseAdmin
    .from("opportunities")
    .select("id, name, account_id, tenant_id, accounts(name)")
    .eq("share_token", safe)
    .maybeSingle();

  if (error || !opp) notFound();

  // Fetch the FULL artifact history for THIS opportunity — the security gate is
  // this WHERE clause. Every row here provably belongs to the opportunity that
  // owns the share_token, so any id we later select from this set is safe.
  const { data: historyRows, error: intelErr } = await supabaseAdmin
    .from("account_intelligence_artifacts")
    .select("id, is_current, generated_at, created_at, artifact")
    .eq("opportunity_id", opp.id);

  if (intelErr || !historyRows || historyRows.length === 0) notFound();

  const rows = historyRows as DeckArtifactRow[];
  const selectedRow = selectArtifactRow(rows, requestedVersion);
  if (!selectedRow) notFound();

  const artifact = selectedRow.artifact as AccountIntelligenceArtifact;
  // Client-safe: id + label + isCurrent only — never the full artifacts.
  const versions = buildVersionList(rows);

  const accountName =
    (opp.accounts as unknown as { name?: string } | null)?.name ??
    artifact.account?.name ??
    "Untitled Account";

  const sellerBrand = opp.tenant_id ? await getTenantBrand(opp.tenant_id as string) : null;
  // Autonomous resolution (logo + colors from the seller/buyer domains), the
  // SAME resolver the .pptx export uses — so the in-browser preview and the
  // downloaded deck render with identical, real branding instead of the preview
  // falling back to a neutral wordmark.
  const branding = await resolveBrandingAuto({
    sellerBrand,
    sellerCompany: sellerBrand?.displayName ?? null,
    buyerName: accountName,
    buyerDomain: artifact.account?.domain,
  });

  const sellerPerson = await loadSellerPerson(opp.tenant_id as string | null);
  const model = buildDeckModel(artifact, accountName, branding, sellerPerson);

  return (
    <DeckView model={model} token={safe} versions={versions} selectedVersionId={selectedRow.id} />
  );
}
