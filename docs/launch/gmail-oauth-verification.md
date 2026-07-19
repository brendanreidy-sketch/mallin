# Gmail OAuth — scope audit & Google verification runbook

**Type:** audit only (no code / env / Clerk / Google Console / Production change).
**Date:** 2026-07-18. **Scope of trace:** active + dead code, privacy policy, launch docs, Clerk relationship.
**Bottom line:** the app requests **`gmail.compose` + `openid` + `email`** and every live flow works on
those three; **`gmail.modify` is not requested or required anywhere** (only stale comments). One
material mismatch to resolve before submitting: the **privacy policy says "never sends," but a live,
UI-exposed `messages.send` path exists.**

---

## 1. Evidence table

### 1a. OAuth scopes currently requested (active)

| Scope | Sensitivity | Where configured | Why |
|---|---|---|---|
| `https://www.googleapis.com/auth/gmail.compose` | **Sensitive** (not restricted) | [lib/auth/gmail-oauth.ts:53](lib/auth/gmail-oauth.ts:53) | create drafts + send (compose supersets send) |
| `openid` | identity | [lib/auth/gmail-oauth.ts:54](lib/auth/gmail-oauth.ts:54) | OIDC id_token |
| `email` | identity | [lib/auth/gmail-oauth.ts:55](lib/auth/gmail-oauth.ts:55) | read the connected Google email to display it |

Joined and sent as the `scope` param of the authorize URL at
[lib/auth/gmail-oauth.ts:135](lib/auth/gmail-oauth.ts:135) (`buildAuthorizeUrl`). `access_type=offline`,
`prompt=consent`. No other scope string exists in the codebase.

### 1b. Gmail API methods the app calls, and the scope each needs

| API method | HTTP call · file:line | Min scope required | Status | Callers |
|---|---|---|---|---|
| `drafts.create` | `POST …/users/me/drafts` — [lib/adapters/gmail.ts:121](lib/adapters/gmail.ts:121) | `gmail.compose` | **ACTIVE** | drafts/route.ts:42, action-queue/executors.ts:191, proactive/email-nudges.ts:124, dev/example-nudge:54 |
| `messages.send` | `POST …/users/me/messages/send` — [app/api/gmail/send/route.ts:105](app/api/gmail/send/route.ts:105) | `gmail.send` **or `gmail.compose`** or `gmail.modify` | **ACTIVE, UI-exposed** | EmailComposer.tsx:65 (prep), BookReview.tsx:270 |
| `threads.list` (`listSentThreads`) | none — throws [lib/adapters/gmail.ts:152](lib/adapters/gmail.ts:152) | `gmail.readonly`/`modify` (if built) | **DEAD stub** | no runtime callers |
| `messages.get` (`getMessage`) | none — throws [lib/adapters/gmail.ts:167](lib/adapters/gmail.ts:167) | `gmail.readonly`/`modify` (if built) | **DEAD stub** | no runtime callers |
| OAuth token exchange / refresh | `oauth2.googleapis.com/token` — [lib/auth/gmail-oauth.ts:160](lib/auth/gmail-oauth.ts:160) | n/a (not a data scope) | ACTIVE | callback + `getAccessTokenForUser` |

### 1c. Does each flow work with `gmail.compose` + identity scopes only?

| Flow | Gmail API call? | Works on compose+openid+email only? | Evidence |
|---|---|---|---|
| **Connect** (`/api/gmail/connect`) | no (redirects to consent) | ✅ | connect/route.ts → `getAuthorizeUrl` |
| **OAuth callback** | token exchange + id_token email | ✅ (needs openid/email) | oauth-callback → gmail-oauth.ts:191 |
| **Compose / Save to Drafts** (`drafts.create`) | yes | ✅ compose covers it | adapters/gmail.ts:106 |
| **Send** (`messages.send`) | yes | ✅ **compose includes send** | send/route.ts:104 |
| **Connection status** (integrations page) | no — reads `gmail_oauth_tokens` row | ✅ (no scope) | integrations/page.tsx:41/58 |
| **Disconnect** | no — deletes the token row | ✅ (no scope) | gmail-oauth.ts:319-322 |

**Conclusion:** every live flow — connect, callback, compose/draft, send, status, disconnect — functions
on `gmail.compose` + `openid` + `email`. Nothing active requires `gmail.modify` or a read scope.

### 1d. Is `gmail.modify` used anywhere?

**No — not requested, not required.** The only occurrences are comments:
- [app/api/gmail/send/route.ts:9](app/api/gmail/send/route.ts:9) — "using the gmail.modify scope" → **incorrect** (granted scope is `gmail.compose`).
- [lib/auth/gmail-oauth.ts:49](lib/auth/gmail-oauth.ts:49) — a correct *warning* not to add it.
- [app/prep/EmailComposer.tsx:9](app/prep/EmailComposer.tsx:9) — a third label, "fires gmail.send" (also not the granted name, though compose supersets send).

Three different scope names in comments; one real requested scope (`gmail.compose`).

---

## 2. Findings separated by evidence class

### Confirmed active behavior
- Requested scopes: `gmail.compose` + `openid` + `email` (§1a).
- Live Gmail API usage: `drafts.create` and `messages.send` — **both** authorized by `gmail.compose`.
- Send is **real and user-exposed**: `/prep` renders EmailComposer with a primary "✉ Send via Gmail"
  button ([EmailComposer.tsx:268](app/prep/EmailComposer.tsx:268)) → `/api/gmail/send`. It is gated to an
  authenticated user click and short-circuits to simulation for demo tenants (send/route.ts:70-79).
- Disconnect deletes the local token row; it does **not** call Google's revoke endpoint.

### Unused / dead code
- `listSentThreads` and `getMessage` — throw-only stubs; the only things that would need a read scope.
  They keep the app on the **sensitive** tier, not restricted. Not wired to any surface.

### Documentation claims
- **Privacy policy** [app/(trust)/privacy/page.tsx:220-229](app/(trust)/privacy/page.tsx:220): "requests a
  single Google permission — **gmail.compose** — which lets it **create draft emails**… We do **not** read
  your inbox… **Mallín never sends email on your behalf** — every message is sent by you, from your own
  inbox." Correct on scope name and no-read; **contradicts the live `messages.send` path** on "never sends."
- **Integrations page** copy: "Mallín never sends — you click Send from your own inbox" — same draft-only claim.
- **Launch docs**: silent on Gmail scopes (no claim to reconcile).
- **Clerk**: not involved in the Gmail grant. Gmail uses a **standalone Google OAuth client**
  (`GOOGLE_OAUTH_CLIENT_ID`, the "Mallin Web" client), independent of any Clerk Google sign-in social
  connection. The verification below concerns the Mallin Web client only.

### Unknowns requiring dashboard confirmation
- **Does the live Google consent screen still list `gmail.modify`?** Scopes were reduced in code on
  2026-07-16, but the OAuth consent-screen "Data Access" list is a Console setting. If `gmail.modify` is
  still there, it must be removed so the screen matches the code — **potential review blocker.**
- **Is `mallin.io` domain-verified** in Google Search Console under the same Google account? Required for
  the authorized domain + branding.
- **Publishing status** (Testing vs In production) and current **test users** list.

### Adjacent code issue (not a scope/verification blocker, but affects the demo)
- **Drafts route auth mismatch:** [app/api/gmail/drafts/route.ts:19](app/api/gmail/drafts/route.ts:19) requires
  an `x-user-id` header (with a `TODO: pull from auth()`), but EmailComposer's "Save to Drafts" handler
  ([EmailComposer.tsx:132](app/prep/EmailComposer.tsx:132)) does **not** send that header — so "Save to Drafts"
  from `/prep` likely 400s. `drafts.create` itself works when called server-side with a `userId`
  (dev/example-nudge, action-queue, proactive nudges). Flag it because the verification video should demo a
  **working** draft path.

---

## 3. Google OAuth verification runbook

### 1. Exact scopes to submit
- `.../auth/gmail.compose` — **Sensitive**. Justification: "Mallín drafts follow-up emails in the user's
  voice into their Gmail Drafts folder, and (if the send feature is kept) sends a message the user
  explicitly clicks Send on. No inbox/message reading."
- `openid`, `email` — identity, to show which Google account is connected.
- **Do not submit** `gmail.modify` or any read scope.

### 2. Authorized domains & redirect URLs
- Authorized domain: **`mallin.io`** (must be verified in Search Console).
- Authorized redirect URI: **`https://mallin.io/api/gmail/oauth-callback`** (matches
  `GOOGLE_OAUTH_REDIRECT_URI`; adapters/gmail.ts:20).
- App homepage: `https://mallin.io` · Privacy: `https://mallin.io/privacy` · Terms: `https://mallin.io/terms`
  (confirm the `/terms` route exists and is public).

### 3. Consent-screen wording
- App name: **Mallín**; user-support email + developer contact set.
- Per-scope justification text as in item 1. **The wording must match actual behavior** — see the
  send/never-sends decision in §4 before finalizing.

### 4. Privacy-policy & terms requirements
- Google's *Limited Use* disclosure is present ("limited to what is described here", page.tsx:225) — keep it.
- **Reconcile the "never sends" claim with the live send path before submission.** Two clean options:
  - **(A) Drafts-only (matches current copy & the "Mallín never sends" brand):** remove/gate the send
    feature; the privacy policy is then accurate as-is and the review story is simplest (compose = drafts).
  - **(B) Keep send:** update the privacy policy + consent justification to disclose that Mallín **sends**
    emails from the user's account on explicit user action; keep "we never read your mail."
- Whichever is chosen, the video, consent wording, and privacy policy must all describe the same behavior.

### 5. Verification video script (screen recording)
1. Show `https://mallin.io` (homepage — proves domain ownership/branding).
2. Sign in; go to **Settings → Integrations** (the entry point shipped 2026-07-18).
3. Click **Connect Gmail** → show the Google consent screen listing **only** gmail.compose + identity.
4. Grant; return to the app showing "Gmail connected as <email>".
5. Open a deal's `/prep`; show a Mallín-drafted email; click **Save to Drafts** (fix the drafts-route auth
   first) and show it in the user's Gmail Drafts. If send is kept (option B), also click **Send via Gmail**
   and show the sent message.
6. Return to **Settings → Integrations**; click **Disconnect**; show tokens removed.
7. Narration must state the scope purpose and that Mallín does not read the inbox.

### 6. Test-account instructions
- While in **Testing**: add Google's review address + a founder test account as test users (100 cap).
- Provide reviewers a working test login (a demo/real org) and the exact click-path from item 5, plus a
  note that demo tenants short-circuit send to simulation (so reviewers test on a real-connected account).

### 7. Screenshots / evidence Google may request
- The consent screen with the exact scopes; the in-app connected state; the draft (and/or sent) message in
  Gmail; the privacy-policy Google-data section (page.tsx §11); homepage; the OAuth client config showing the
  single redirect URI.

### 8. Expected review path & remaining blockers
- **Path: standard sensitive-scope verification — NO CASA.** `gmail.compose` is *sensitive*, not
  *restricted*; CASA only applies to restricted scopes (gmail.modify/readonly), which we do not request.
- **Blockers to clear first:**
  1. Remove `gmail.modify` from the consent screen if still listed (dashboard unknown, §2).
  2. Reconcile the privacy policy vs the live send path (§4) — the biggest substantive item.
  3. Verify `mallin.io` in Search Console.
  4. Fix the drafts-route `x-user-id` auth so the demoed draft path works.
  5. (Nice-to-have Google favors) revoke the token at Google on Disconnect, not just delete locally.

---

## 4. Scope-removal assessment (proposal only — NOT implemented)

**No scope can be removed.** `gmail.compose` is the floor for `drafts.create` (no narrower "drafts-only"
scope exists); `openid`+`email` are needed to display the connected account. The audit's real lever is
**behavior/doc alignment**, not scope reduction:

- If you choose **drafts-only (option A)**, the *smallest change* is to remove the "Send via Gmail" button
  and the `/api/gmail/send` route (or gate them to demo-only), restoring the true "never sends" posture.
  This does **not** narrow the scope (drafts still need compose) but makes the privacy policy accurate and
  the review cleanest.
  - **Canary test plan (if approved):** on a branch, remove/gate send → typecheck+build → prod-debug →
    canary: confirm draft flow still works, the Send button is gone, connect/disconnect/status unchanged,
    real + demo orgs → prepare Production candidate → pause for approval. Standard 12-step flow.
- If you choose **keep send (option B)**, no code change — only the privacy-policy + consent-wording update
  (its own docs/legal change, separately reviewed).

**Do not implement either until you decide A vs B and approve.**

---

*Audit complete. No code, environment, Clerk, Google Console, Production, or `mallin.io` change was made.*
