/**
 * /settings/profile — the AE's intro on customer decks ("Meet your rep").
 *
 * Server component: resolves the signed-in rep's tenant, loads their name +
 * any saved intro fields, and hands them to the client form. The form runs the
 * LinkedIn enrichment (propose) and the confirm/save — nothing reaches a deck
 * until the rep confirms.
 */
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import AeProfileForm from "./AeProfileForm";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const tenantId = await getCurrentTenantId().catch(() => null);

  let initial = {
    name: "",
    company: "",
    title: "",
    linkedinUrl: "",
    bio: "",
    confirmed: false,
  };

  if (tenantId) {
    const { data } = await supabaseAdmin
      .from("tenants")
      .select(
        "first_name, last_name, seller_company, ae_title, ae_linkedin_url, ae_bio, ae_profile_confirmed",
      )
      .eq("id", tenantId)
      .maybeSingle();
    if (data) {
      initial = {
        name: [data.first_name, data.last_name].filter(Boolean).join(" ").trim(),
        company: data.seller_company ?? "",
        title: data.ae_title ?? "",
        linkedinUrl: data.ae_linkedin_url ?? "",
        bio: data.ae_bio ?? "",
        confirmed: Boolean(data.ae_profile_confirmed),
      };
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Your intro on decks</h1>
        <p className={styles.lede}>
          When you generate a deck for a call, Mallín can open it with a short
          &ldquo;meet your rep&rdquo; slide — your name, title, and a one-line
          background pulled from LinkedIn. It only appears on decks once
          you&apos;ve confirmed it&apos;s right.
        </p>
      </header>

      {!tenantId ? (
        <div className={styles.note}>Set up a workspace first to configure your intro.</div>
      ) : (
        <AeProfileForm initial={initial} />
      )}
    </div>
  );
}
