/**
 * The AE's intro profile for a customer-facing deck ("Meet your rep").
 *
 * loadSellerPerson() reads the confirmed AE profile off the tenant row and
 * returns it as a DeckSellerPerson, or null when there's nothing to show. It is
 * the SINGLE source both the in-app deck (/deck/[token]) and the .pptx export
 * consume, so the two can't drift.
 *
 * GOVERNANCE: returns null unless `ae_profile_confirmed` is true. The
 * enrichment agent (ae-profile-research) can PROPOSE a match, but only an
 * AE-confirmed profile ever reaches a deck the customer sees. A bio/title/URL
 * is customer-safe by nature — it's the seller introducing themselves — so no
 * further sanitization is needed beyond the confirm gate.
 */
import { supabaseAdmin } from "@/lib/db/client";
import type { DeckSellerPerson } from "./deck-model";

/** Load the confirmed AE intro profile for a tenant, or null if not set. */
export async function loadSellerPerson(
  tenantId: string | null | undefined,
): Promise<DeckSellerPerson | null> {
  if (!tenantId) return null;

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select(
      "first_name, last_name, ae_title, ae_linkedin_url, ae_bio, ae_profile_confirmed",
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data || !data.ae_profile_confirmed) return null;

  const name = [data.first_name, data.last_name]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .join(" ")
    .trim();
  // No name → nothing to introduce. (Title/bio without a name is meaningless.)
  if (!name) return null;

  const clean = (s: unknown): string | undefined => {
    const t = typeof s === "string" ? s.trim() : "";
    return t.length > 0 ? t : undefined;
  };
  const url = clean(data.ae_linkedin_url);

  return {
    name,
    title: clean(data.ae_title),
    bio: clean(data.ae_bio),
    linkedinUrl: url && /^https?:\/\//.test(url) ? url : undefined,
  };
}
