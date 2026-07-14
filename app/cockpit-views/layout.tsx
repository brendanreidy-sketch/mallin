import { notFound } from 'next/navigation';
import { hasCockpitAccess } from '@/lib/cockpit/access';
import { AppSignOut } from '@/components/auth/sign-out-button';

/**
 * Owner gate for the whole cockpit subtree (the book + every deal cockpit).
 * Middleware already requires a login to reach here; this layout adds the
 * sharper check — only the cockpit owner(s) may see it. A logged-in non-owner
 * gets a 404 (the route simply isn't there for them), not a redirect that would
 * advertise its existence.
 *
 * Reading the user makes this subtree dynamic by definition; the gate must run
 * per request, never at build time.
 */
export const dynamic = 'force-dynamic';

export default async function CockpitViewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasCockpitAccess())) notFound();
  return (
    <>
      {/* Always-visible logout — the book + every drill-down had no way out.
          Returns to the landing (where Sign in / Get started free live). */}
      <div style={{ position: "fixed", top: 14, right: 16, zIndex: 100 }}>
        <AppSignOut />
      </div>
      {children}
    </>
  );
}
