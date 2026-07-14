"use client";

import * as Clerk from "@clerk/elements/common";
import * as SignUp from "@clerk/elements/sign-up";
import Link from "next/link";
import s from "../../sign-in/[[...sign-in]]/signin.module.css";

/**
 * /sign-up — custom Mallín-styled sign-up form.
 *
 * Mirrors /sign-in styling exactly. Self-sign-up is intentionally NOT
 * advertised on the landing page right now — access is granted by
 * provisioning users manually. This page exists because Clerk needs a
 * sign-up URL configured and because design-partner onboarding will
 * use it later.
 */
export default function SignUpPage() {
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
              <h1 className={s.title}>Create account</h1>
              <p className={s.subtitle}>
                Mallín is currently invitation-only. Email{" "}
                <a href="mailto:hello@mallin.io" className={s.footLink}>
                  hello@mallin.io
                </a>{" "}
                for design-partner access.
              </p>
            </div>

            <Clerk.GlobalError className={s.error} />

            <Clerk.Field name="emailAddress" className={s.field}>
              <Clerk.Label className={s.label}>Email</Clerk.Label>
              <Clerk.Input
                type="email"
                required
                autoComplete="email"
                className={s.input}
                placeholder="you@company.com"
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

            {/* Required: Clerk's bot-signup protection mounts its CAPTCHA here.
                Without this element, submit silently fails when protection is on. */}
            <div id="clerk-captcha" />

            <SignUp.Action submit className={s.primaryBtn}>
              Continue
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
                <Clerk.Input
                  type="otp"
                  required
                  className={s.input}
                />
                <Clerk.FieldError className={s.fieldError} />
              </Clerk.Field>

              <SignUp.Action submit className={s.primaryBtn}>
                Verify
              </SignUp.Action>
            </SignUp.Strategy>
          </SignUp.Step>
        </SignUp.Root>

        <div className={s.foot}>
          Already have access?{" "}
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
