"use client";

import * as Clerk from "@clerk/elements/common";
import * as SignIn from "@clerk/elements/sign-in";
import Link from "next/link";
import s from "./signin.module.css";

/**
 * /sign-in — custom Mallín-styled sign-in form.
 *
 * Uses Clerk Elements (headless primitives) so the auth flow runs on
 * Clerk's backend but every visible pixel is Mallín's. No "Secured by
 * Clerk" badge, no Clerk widget chrome — just our visual system.
 *
 * Catch-all route handles Clerk's subroutes (factor-one, factor-two,
 * sso-callback, verify) without us having to author each one.
 */
export default function SignInPage() {
  return (
    <div className={s.page}>
      <div className={s.card}>
        <Link href="/" className={s.brand}>
          <MallinMark />
          <span>Mallín</span>
        </Link>

        <SignIn.Root>
          {/* Step 1 — collect identifier (email) */}
          <SignIn.Step name="start" className={s.step}>
            <div className={s.head}>
              <h1 className={s.title}>Sign in</h1>
              <p className={s.subtitle}>
                The operational layer of the revenue organization.
              </p>
            </div>

            <Clerk.GlobalError className={s.error} />

            {/* Social sign-in — one click, no email-code dependency. The
                scalable path for self-serve; email stays below as fallback. */}
            <div className={s.socialRow}>
              <Clerk.Connection name="google" className={s.socialBtn}>
                <GoogleIcon />
                Continue with Google
              </Clerk.Connection>
              <p className={s.socialHint}>Fastest — no code to wait for.</p>
            </div>

            <div className={s.divider}>or continue with email</div>

            <Clerk.Field name="identifier" className={s.field}>
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

            <SignIn.Action submit className={s.primaryBtn}>
              Continue
            </SignIn.Action>
          </SignIn.Step>

          {/* Step 2 — verify password.
              The Strategy block only renders when password is Clerk's
              active strategy. If the instance defaults to a different
              first-factor (email_code on dev instances often does), the
              user would see the step with no input. SupportedStrategy
              below renders a button that lets them force password as
              the active strategy. */}
          {/* Step 2 — verify. The heading lives INSIDE each strategy so it
              always matches the field actually shown: "Enter your password"
              for the password strategy, "Check your email" for the email-code
              strategy. (Previously a single static "Enter your password"
              title sat above both, so it mislabeled the code step.) Which
              strategy Clerk makes active is an instance/account setting, not
              a choice this page makes. */}
          <SignIn.Step name="verifications" className={s.step}>
            <Clerk.GlobalError className={s.error} />

            <SignIn.Strategy name="password">
              <div className={s.head}>
                <h1 className={s.title}>Enter your password</h1>
              </div>

              <Clerk.Field name="password" className={s.field}>
                <Clerk.Label className={s.label}>Password</Clerk.Label>
                <Clerk.Input
                  type="password"
                  required
                  autoComplete="current-password"
                  className={s.input}
                />
                <Clerk.FieldError className={s.fieldError} />
              </Clerk.Field>

              <SignIn.Action submit className={s.primaryBtn}>
                Sign in
              </SignIn.Action>

              <SignIn.Action
                navigate="forgot-password"
                className={s.linkBtn}
              >
                Forgot password?
              </SignIn.Action>
            </SignIn.Strategy>

            {/* Email-code strategy — shown when Clerk makes it the active
                factor (e.g. an account with no password, or an instance that
                requires email verification on sign-in). */}
            <SignIn.Strategy name="email_code">
              <div className={s.head}>
                <h1 className={s.title}>Check your email</h1>
              </div>

              <Clerk.Field name="code" className={s.field}>
                <Clerk.Label className={s.label}>
                  Verification code
                </Clerk.Label>
                <p className={s.subtitle}>
                  We sent a code to your email. Enter it below.
                </p>
                <Clerk.Input
                  type="otp"
                  required
                  className={s.input}
                />
                <Clerk.FieldError className={s.fieldError} />
              </Clerk.Field>

              <SignIn.Action submit className={s.primaryBtn}>
                Verify
              </SignIn.Action>

              <SignIn.Action resend className={s.linkBtn}>
                Resend code
              </SignIn.Action>

              <p className={s.hint}>
                Don&apos;t see it? Check your spam folder — new senders
                sometimes land there.
              </p>
            </SignIn.Strategy>

            {/* If Clerk offered a non-password factor but the account HAS a
                password, let the user switch to it. Only renders when password
                is a supported-but-not-active strategy. */}
            <SignIn.SupportedStrategy name="password" asChild>
              <button type="button" className={s.linkBtn}>
                Use your password instead
              </button>
            </SignIn.SupportedStrategy>
          </SignIn.Step>

          {/* Step 3 — forgot password (request reset code) */}
          <SignIn.Step name="forgot-password" className={s.step}>
            <div className={s.head}>
              <h1 className={s.title}>Reset password</h1>
              <p className={s.subtitle}>
                We&apos;ll send a code to your email.
              </p>
            </div>

            <SignIn.SupportedStrategy name="reset_password_email_code">
              Send reset code
            </SignIn.SupportedStrategy>

            <SignIn.Action navigate="previous" className={s.linkBtn}>
              ← Back
            </SignIn.Action>
          </SignIn.Step>

          {/* Step 4 — set new password after reset */}
          <SignIn.Step name="reset-password" className={s.step}>
            <div className={s.head}>
              <h1 className={s.title}>Set a new password</h1>
            </div>

            <Clerk.GlobalError className={s.error} />

            <Clerk.Field name="password" className={s.field}>
              <Clerk.Label className={s.label}>New password</Clerk.Label>
              <Clerk.Input
                type="password"
                required
                autoComplete="new-password"
                className={s.input}
              />
              <Clerk.FieldError className={s.fieldError} />
            </Clerk.Field>

            <Clerk.Field name="confirmPassword" className={s.field}>
              <Clerk.Label className={s.label}>Confirm password</Clerk.Label>
              <Clerk.Input
                type="password"
                required
                autoComplete="new-password"
                className={s.input}
              />
              <Clerk.FieldError className={s.fieldError} />
            </Clerk.Field>

            <SignIn.Action submit className={s.primaryBtn}>
              Update password
            </SignIn.Action>
          </SignIn.Step>
        </SignIn.Root>
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
