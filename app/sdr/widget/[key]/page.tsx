import WidgetChat from "./WidgetChat";

/**
 * /sdr/widget/[key] — the public, embeddable chat surface. `key` is the
 * tenant's embed id; the customer drops this in an iframe on their site.
 * Public (in middleware isPublicRoute) — visitors are anonymous.
 */
export const dynamic = "force-dynamic";

export default async function SdrWidgetPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <WidgetChat widgetKey={key} />;
}
