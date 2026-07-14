import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ensurePersonalWorkspace } from "@/lib/auth/ensure-personal-workspace";
import { getTenantSalesExperience } from "@/lib/auth/tenant-context";
import { sendWelcomeEmail } from "@/lib/email/welcome";
import ActivateAndContinue from "./ActivateAndContinue";

/**
 * /welcome — post-signup provisioning step (B2C self-serve).
 *
 * Runs server-side:
 *   1. ensurePersonalWorkspace() — create/resolve the user's Clerk org + tenant.
 *   2. On first creation, send the welcome email (best-effort, once).
 * Then hands off to a client component that calls setActive({ organization })
 * — required because a server-created org is NOT the session's active org yet —
 * and forwards into the app.
 *
 * Protected by middleware (not in the public list), so only signed-in users
 * reach it. An unauthenticated hit bounces to /start.
 */
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/start");
  }

  const { orgId, tenantId, createdOrg } = await ensurePersonalWorkspace();

  // Ask for sales tenure only if we don't already have it (a /try signup
  // imports it, so those reps skip the question). Best-effort / null-safe.
  const existingExperience = await getTenantSalesExperience(tenantId);
  const askExperience = !existingExperience;

  if (createdOrg) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) {
        await sendWelcomeEmail({ to: email, firstName: user.firstName });
      }
    } catch (err) {
      // Never block the flow on email. Log and continue.
      console.error("[welcome] welcome email failed:", err);
    }
  }

  // Finish the active-org handoff on the client, then forward into the app.
  return (
    <ActivateAndContinue
      orgId={orgId}
      next="/cockpit"
      createdOrg={createdOrg}
      askExperience={askExperience}
    />
  );
}
