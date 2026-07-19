# Gmail OAuth — launch decision

**Type:** decision doc · no code / Console change · pick a path before any verification work.
**Context:** `gmail.compose` is a **restricted** scope (see [audit](gmail-oauth-verification.md)); with
server-stored tokens the restricted-scope path applies and **may require a CASA third-party security
assessment — unconfirmed with Google.** The product is going **drafts-only**
([plan](gmail-drafts-only-plan.md)). No design-partner demo is currently scheduled.

---

## Cloud-project question (Google recommends separate test vs Production projects)

**Current evidence:** the setup notes reference a **single** Google Cloud project — **`mallin-502618`**
("Mallin"), OAuth client "Mallin Web" — used for the live integration, with the app in **Testing** mode.
No separate test project is documented.

**Finding:** it appears **one project serves both testing and Production**, contrary to Google's
recommendation. **Confirm in the Console.** Recommendation: before submitting for verification, create a
**separate project** so day-to-day testing (test users, scope experiments, consent-screen edits) never
touches the **verified Production** OAuth client. Decide which project becomes the verified-Production one
and keep the other for testing. (This is a Console action — not part of the code change; do it when a path
below is chosen.)

---

## Path 1 — Complete restricted-scope verification (+ any required security assessment)

- **Launch impact:** highest effort and longest lead time. Verification can take weeks; **if CASA is
  required**, add a paid third-party assessment (typically multi-week and costly). Blocks a fully public,
  any-user Gmail experience until done.
- **Customer experience:** best end state — any user connects Gmail with no "unverified app" warning,
  seamless draft creation.
- **Verification requirements:** verified `mallin.io` domain; accurate privacy policy + consent
  justification (drafts-only); demo video; **restricted-scope review**; **CASA/security assessment
  status to be confirmed with Google**; likely a security questionnaire (data handling, token storage,
  deletion, incident response).
- **Unresolved risks:** CASA scope/cost/timeline unknown until confirmed; review can bounce on
  policy/video mismatches; token-storage security posture will be scrutinized (encryption at rest, access
  controls, deletion/revocation).
- **Next action:** contact Google to **confirm the exact restricted-scope requirements and whether CASA
  applies** to this usage; land drafts-only first; set up a separate Production project; only then submit.

## Path 2 — Keep Gmail limited to approved test users (design-partner phase)

- **Launch impact:** lowest effort, available now. App stays in **Testing** mode; no verification needed
  yet. Works cleanly for a small design-partner cohort.
- **Customer experience:** each design partner is added as a **test user** and sees Google's
  **"unverified app"** interstitial once, then proceeds. Acceptable for a handful of partners given a
  heads-up; **not** acceptable for broad public signup. **Cap: 100 test users.**
- **Verification requirements:** none now — deferred. Still land drafts-only so the experience and copy are
  correct, and so the eventual verification is a smaller delta.
- **Unresolved risks:** the unverified-app warning can spook a less-technical partner; the 100-user cap and
  the Testing-mode 7-day refresh-token expiry (Google can expire refresh tokens for unverified apps in
  Testing) may cause periodic reconnects — confirm current behavior.
- **Next action:** land drafts-only; add each design partner as a test user with a short "you'll see an
  unverified-app screen, that's expected" note; revisit Path 1 after validation.

## Path 3 — No Gmail OAuth at launch; user-controlled copy / open-in-Gmail

- **Launch impact:** removes Gmail OAuth from the critical path entirely — **no verification, no scope, no
  CASA, no warning.** Ship to anyone immediately.
- **Customer experience:** Mallín shows the drafted email with a **"Copy"** button and/or an **"Open in
  Gmail"** deep link (`https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…`) that opens Gmail's
  compose window prefilled; the user reviews and sends themselves. Slightly less seamless (URL body-length
  limits ~2KB, plain-ish text, no in-thread reply context), but zero friction to adopt and fully
  user-controlled.
- **Verification requirements:** **none** — no Google user data is accessed.
- **Unresolved risks:** lower fidelity (no rich HTML/threading); relies on the user's default Gmail
  account; loses the "draft already in your Drafts folder" magic. Keep the OAuth code behind a flag so
  Path 1/2 remains available later.
- **Next action:** build the open-in-Gmail/copy flow; hide the "Connect Gmail" entry point for public
  launch; keep the (drafts-only) OAuth path flag-gated for design partners / later verification.

---

## Summary & recommendation

| Path | Effort | Who can use it | Verification | Best for |
|---|---|---|---|---|
| 1 · Full restricted verification | High (+ possible CASA) | Anyone | Restricted review + CASA (confirm) | Public launch at scale, later |
| 2 · Test users only | Low, now | ≤100 test users | None (deferred) | The current design-partner phase |
| 3 · No OAuth / open-in-Gmail | Low–med | Anyone | None | Broad public launch without OAuth burden |

**Recommendation (yours to decide):** with **no demo scheduled** and CASA unconfirmed, **Path 2** is the
pragmatic near-term for design partners (land drafts-only, add partners as test users), with **Path 3** as
the fallback if you want a public launch before taking on restricted verification. Reserve **Path 1** for
once traction justifies the CASA cost/time. These paths compose: 2 now → 1 later, with 3 always available
as the no-OAuth escape hatch.

**Do not submit for verification, modify the consent screen, or implement code until a path is approved.**
