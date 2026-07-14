import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import BuildingPoller from "./BuildingPoller";

/**
 * /new/building?dealId=… — the "building your brief" progress screen.
 *
 * The pipeline runs in the background (kicked off by /api/intake/transcript).
 * This page polls /api/intake/status until a current execution_artifact exists,
 * then forwards to /prep?dealId=…
 */
export const dynamic = "force-dynamic";

export default async function BuildingPage({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/start");
  const { dealId } = await searchParams;
  if (!dealId) redirect("/new");
  return <BuildingPoller dealId={dealId} />;
}
