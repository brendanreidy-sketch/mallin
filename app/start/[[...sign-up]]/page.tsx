"use client";

import { useEffect, useState } from "react";
import * as Clerk from "@clerk/elements/common";
import * as SignUp from "@clerk/elements/sign-up";
import Link from "next/link";
import s from "../../sign-in/[[...sign-in]]/signin.module.css";

/**
 * First-touch attribution: stash UTM params + referrer in a short-lived cookie
 * the moment the rep lands on /start, so workspace provisioning (server, in
 * /welcome) can persist it on the tenant. Zero added friction — no form fields.
 */
function captureAttribution() {
  try {
    if (typeof document === "undefined") return;
    if (document.cookie.includes("mallin_attr=")) return; // first touch wins
    const p = new URLSearchParams(window.location.search);
    const attr = {
      utm_source: p.get("utm_source") || "",
      utm_campaign: p.get("utm_campaign") || "",
      utm_medium: p.get("utm_medium") || "",
      referrer: document.referrer || "",
    };
    if (!attr.utm_source && !attr.utm_campaign && !attr.utm_medium && !attr.referrer) return;
    document.cookie = `mallin_attr=${encodeURIComponent(JSON.stringify(attr))}; path=/; max-age=1800; samesite=lax`;
  } catch {
    // best-effort — never block signup on attribution
  }
}

/**
 * /start — self-serve B2C signup entry.
 *
 * Distinct from /sign-up (the enterprise/invitation flow): no "invitation-only"
 * message, consumer copy, and it routes to /welcome after verification so the
 * user gets a personal workspace auto-provisioned. Leaves /pilot ("request
 * access") and /sign-up untouched.
 */
export default function StartPage() {
  // When arriving from the /try teaser gate, ?email= carries the address the
  // brief was saved under. Prefill it so the signup email matches and the saved
  // brief imports on new-workspace creation (lib/intake/import-try-leads).
  const [prefillEmail, setPrefillEmail] = useState("");
  useEffect(() => {
    captureAttribution();
    try {
      const em = new URLSearchParams(window.location.search).get("email");
      if (em) setPrefillEmail(em);
    } catch {
      /* best-effort */
    }
  }, []);
  const fromTry = prefillEmail.length > 0;
  return (
    <div className={s.page}>
      <div className={s.card}>
        <Link href="/" className={s.brand}>
          <MallinMark />
          <span>Mallín</span>
        </Link>

        <SignUp.Root>
          <SignUp.Step name="start" className={s.step}>
            <div className={s.head}>
              <h1 className={s.title}>
                {fromTry ? "Unlock your full brief" : "Get started free"}
              </h1>
              <p className={s.subtitle}>
                {fromTry
                  ? `Your brief is saved. Create your account with ${prefillEmail} and the full brief is waiting in your cockpit.`
                  : "Create your account and get your first pre-call brief in minutes. No CRM, no setup — just paste a call."}
              </p>
            </div>

            <Clerk.GlobalError className={s.error} />

            {/* Social sign-up — one click, no email-code dependency. The
                scalable path for self-serve; email stays below as fallback. */}
            <div className={s.socialRow}>
              <Clerk.Connection name="google" className={s.socialBtn}>
                <GoogleIcon />
                Continue with Google
              </Clerk.Connection>
              <p className={s.socialHint}>Fastest — no code to wait for.</p>
            </div>

            <div className={s.divider}>or sign up with email</div>

            <Clerk.Field name="emailAddress" className={s.field}>
              <Clerk.Label className={s.label}>Email</Clerk.Label>
              <Clerk.Input
                type="email"
                required
                autoComplete="email"
                className={s.input}
                placeholder="you@company.com"
                // Prefill from the /try gate; key remounts the uncontrolled input
                // once the param resolves so the default value takes effect.
                defaultValue={prefillEmail}
                key={prefillEmail}
              />
              <Clerk.FieldError className={s.fieldError} />
            </Clerk.Field>

            <Clerk.Field name="password" className={s.field}>
              <Clerk.Label className={s.label}>Password</Clerk.Label>
              <Clerk.Input
                type="password"
                required
                autoComplete="new-password"
                className={s.input}
              />
              <Clerk.FieldError className={s.fieldError} />
            </Clerk.Field>

            {/* Required: renders the #clerk-captcha element for bot-signup
                protection. Without it, Clerk's Smart CAPTCHA can't initialize
                and submit silently fails. */}
            <div id="clerk-captcha" />

            <SignUp.Action submit className={s.primaryBtn}>
              Create account
            </SignUp.Action>
          </SignUp.Step>

          <SignUp.Step name="verifications" className={s.step}>
            <div className={s.head}>
              <h1 className={s.title}>Verify your email</h1>
              <p className={s.subtitle}>
                We sent a code to your inbox. Enter it below.
              </p>
            </div>

            <SignUp.Strategy name="email_code">
              <Clerk.GlobalError className={s.error} />

              <Clerk.Field name="code" className={s.field}>
                <Clerk.Label className={s.label}>Code</Clerk.Label>
                <Clerk.Input type="otp" required className={s.input} />
                <Clerk.FieldError className={s.fieldError} />
              </Clerk.Field>

              <SignUp.Action submit className={s.primaryBtn}>
                Verify
              </SignUp.Action>

              <SignUp.Action resend className={s.linkBtn}>
                Resend code
              </SignUp.Action>

              <p className={s.hint}>
                Don&apos;t see it? Check your spam folder — new senders
                sometimes land there.
              </p>
            </SignUp.Strategy>
          </SignUp.Step>
        </SignUp.Root>

        <div className={s.foot}>
          Already have an account?{" "}
          <Link href="/sign-in" className={s.footLink}>
            Sign in →
          </Link>
        </div>
      </div>
    </div>
  );
}

function MallinMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#1a2230" />
      <path
        d="M8 18 L12 14 L16 16 L20 12 L24 16"
        stroke="#88b8d0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M7 22 L25 22"
        stroke="#f4f1ea"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className={s.socialIcon} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
