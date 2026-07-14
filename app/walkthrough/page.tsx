import type { Metadata } from "next";
import DemoWalkthrough from "./DemoWalkthrough";

export const metadata: Metadata = {
  title: "Mallín · Walkthrough",
  description:
    "A narrated walkthrough of how Mallín watches a deal slip and proposes the next move. For the usable demo cockpit, sign in to the demo account.",
};

/**
 * /walkthrough — public, no auth. Loads the Hooli Holdings substrate
 * and renders the 5-step guided walkthrough.
 *
 * NOTE: this is the narrated/marketing surface — visitors watch the
 * product work. For reps who want to USE the product on sample data,
 * route them to the demo account flow (Clerk sign-in → /prep with
 * is_demo=true tenant). The walkthrough exists for cold visitors who
 * want overview before committing to a login.
 */
export default function WalkthroughPage() {
  return <DemoWalkthrough />;
}
