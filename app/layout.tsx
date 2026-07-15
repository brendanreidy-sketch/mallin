import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Post-sign-in redirect target. /cockpit is a tenant-aware redirect
// page — it reads the signed-in user's tenant from Clerk session,
// looks up the demo opportunity belonging to that tenant, and
// redirects to /prep?dealId=<that-opp-uuid>. This works for both
// the original demo@mallin.io tenant AND multi-tenant design-partner
// accounts provisioned via scripts/clerk/provision-demo-partner.mjs.
const POST_SIGNIN_PATH = "/cockpit";
// New signups must land on /welcome FIRST — it provisions the personal workspace
// and activates the Clerk org (setActive), then forwards to /cockpit. Sending a
// fresh signup straight to /cockpit skips provisioning, so the protected page has
// no active org and bounces the brand-new user back to /sign-in.
const POST_SIGNUP_PATH = "/welcome";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Mallín — the operational layer of the revenue organization",
  description:
    "Agentic AI for revenue ops. Mallín owns the operational work between calls and CRM — qualification, governance, follow-ups — so reps and managers focus on the conversation. We never auto-write your forecast.",
  metadataBase: new URL("https://mallin.io"),
  openGraph: {
    title: "Mallín — the operational layer of the revenue organization",
    description:
      "Agentic AI for revenue ops. Agents own the operational work; humans own the revenue-critical decisions.",
    url: "https://mallin.io",
    siteName: "Mallín",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mallín — the operational layer of the revenue organization",
    description:
      "Agentic AI for revenue ops. Agents own the operational work; humans own the revenue-critical decisions.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fail-open when Clerk env vars are missing (same pattern as the
  // middleware). Preview deployments without Clerk secrets still
  // render the landing page; auth-gated pages will surface a
  // configuration error on their own when accessed.
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const body = (
    <body
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      {children}
      {/* Pageview + custom-event tracking (funnel: / → /start → signup).
          No-op unless Web Analytics is enabled on the Vercel project. */}
      <Analytics />
    </body>
  );

  return (
    <html lang="en">
      {hasClerk ? (
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl={POST_SIGNIN_PATH}
          signUpFallbackRedirectUrl={POST_SIGNUP_PATH}
        >
          {body}
        </ClerkProvider>
      ) : (
        body
      )}
    </html>
  );
}
