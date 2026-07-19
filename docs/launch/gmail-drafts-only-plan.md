# Gmail drafts-only conversion — pre-implementation plan

**Type:** plan only · **no code changed** · do not implement until approved.
**Decision:** drafts-only for launch — Mallín creates Gmail drafts and **never sends**.
**Pairs with:** [gmail-oauth-verification.md](gmail-oauth-verification.md) (audit) and
[gmail-oauth-launch-decision.md](gmail-oauth-launch-decision.md) (launch paths).

**Why this is bigger than "remove one button":** the audit found **two** backend `messages.send`
paths and **four** UI producers. All must be neutralized for a true "cannot send" guarantee.

---

## Complete send surface to neutralize (from the audit)

| # | Kind | Location | Action |
|---|---|---|---|
| A | Backend send route | `app/api/gmail/send/route.ts` (messages.send) | **delete** the route |
| B | Backend queue executor | `lib/action-queue/executors.ts` `executeEmailSend` (:126, send at :144) + dispatch case (:69) + `buildMime` (:333) | **remove** the send executor; make `email_send` impossible to execute |
| C | UI | `app/prep/EmailComposer.tsx` — "✉ Send via Gmail" button (:265) + "Queue"→`email_send` (:101) | relabel to draft; enqueue `email_draft` (not `email_send`) or drop the queue-send option |
| D | UI | `app/cockpit-views/BookReview.tsx` — "✉ Send via Gmail" (:468 → send:270) | replace with "Save to Gmail Drafts" (draft path) |
| E | UI | `app/prep/SendDeckToRoom.tsx` — enqueues `email_send` (:104) | enqueue `email_draft`, or draft directly |
| F | UI | `app/prep/ActionQueue.tsx` — renders/approves `email_send` (:398) | remove the `email_send` case/label |
| G | UI (mock) | `app/cockpit-mock/page.tsx` — "✉ Send via Gmail" label (:181) | confirm decorative (stale mock); relabel or leave if it has no live handler |
| H | Types | `lib/action-queue/types.ts` — `email_send` type + `EmailSendPayload` (:21, :53) | remove the type (or keep only as a rejected/blocked variant) |

---

## The nine items

### 1. Replace every user-facing "Send via Gmail" with "Save to Gmail Drafts"
- EmailComposer (C): make the primary action **"💾 Save to Gmail Drafts"** (the existing `handleSaveDraft`
  → `drafts.create`); remove the `handleSend` button and its `sending`/`sent` status states.
- BookReview (D): replace its "✉ Send via Gmail" one-click with the draft action.
- cockpit-mock (G): relabel the decorative button (or leave if it does nothing) so no "Send" language
  remains in shipping surfaces.
- **Copy:** everywhere the UI says "send," it should say "save to your Drafts — you send from Gmail."

### 2. Fix the drafts-route authentication bug
- `app/api/gmail/drafts/route.ts:19` reads `x-user-id` (with a `TODO: pull from auth()`), but the caller
  (EmailComposer `handleSaveDraft`) never sends that header → the draft save from `/prep` 400s today.
- **Fix:** resolve `userId` from Clerk `auth()` in the route (matching `send/route.ts`), drop the
  `x-user-id` shim. This makes the draft path actually work from the UI (required for the demo video).

### 3. Remove or hard-disable every active `messages.send` path
- **Delete** `app/api/gmail/send/route.ts` (A).
- **Remove** `executeEmailSend` + its `email_send` dispatch case + `buildMime` in
  `lib/action-queue/executors.ts` (B). Convert `email_send` producers (C, E) to `email_draft`
  (the existing `executeEmailDraft` → `drafts.create`), or drop the queue-send option entirely.
- **Preferred:** delete the send code rather than flag-gate it, so there is no latent path to re-enable
  by accident. If a queue path is still wanted, it enqueues **drafts only**.

### 4. Confirm no UI component or API route can send email
- **Guarantee test:** after the change, `grep -rniE 'messages/send|messages\.send|email_send' app lib`
  returns **zero** shipping references (only historical docs). Add this grep to the verification checklist.
- Confirm no remaining route calls `.../users/me/messages/send`, and no action type resolves to a send.
- Re-run the producer inventory (A–H) and confirm each now points at drafts or is removed.

### 5. Correct all stale scope comments
- `app/api/gmail/send/route.ts:9` "gmail.modify" → removed with the route.
- `app/prep/EmailComposer.tsx:9` "fires gmail.send immediately" → rewrite for drafts-only.
- `lib/auth/gmail-oauth.ts:47-49` — the comment calls `gmail.compose` **"a SENSITIVE scope … keeps
  verification OFF the restricted tier and its CASA assessment."** This is now **factually wrong** (compose
  is **restricted**). Correct it to state: restricted scope; restricted-scope verification (and possibly
  CASA) applies; do not add read scopes. (Comment-only; no behavior change.)
- Sweep for any other "send"/"modify" scope language in comments/JSDoc.

### 6. Keep requested scopes = `gmail.compose`, `openid`, `email`
- **No change** to `REQUIRED_SCOPES` (gmail-oauth.ts:52-56). Drafts-only still needs `gmail.compose`
  (the floor for `drafts.create`), plus `openid`+`email` to show the connected account. Verify the array
  is untouched by the change and that the authorize URL still requests exactly these three.

### 7. Update the privacy policy + OAuth justification to "creates drafts, never sends"
- **Privacy policy** (`app/(trust)/privacy/page.tsx` §11, :220-229) **already** says "create draft emails"
  and "Mallín never sends email on your behalf." After the code change this becomes **true**; tighten as
  needed: state Mallín uses `gmail.compose` **only to create drafts**, never sends, never reads mail;
  keep the Limited-Use disclosure. Remove any residual "send" language elsewhere (marketing, integrations
  page copy already says "never sends" — verify).
- **OAuth consent-screen justification** (Console, not code — do at submission): "Creates draft emails in
  the user's Gmail Drafts folder; does not send or read mail." Must match the video + policy.

### 8. Confirm disconnect / token-deletion; propose Google revocation
- **Confirmed:** `disconnectGmail` (gmail-oauth.ts:319-322) deletes the `gmail_oauth_tokens` row for the
  user. It does **not** revoke the grant at Google, so the grant lingers in the user's Google account until
  they remove it manually.
- **Proposal:** on disconnect, also `POST https://oauth2.googleapis.com/revoke?token=<refresh_or_access>`
  before deleting the row (best-effort; ignore failures). Google reviewers favor apps that revoke. Small,
  isolated addition to `disconnectGmail`.

### 9. Canary test matrix
On prod-debug → `canary.mallin.io`, in real + SaaS-demo orgs, light + dark:
- **Connected state:** integrations page shows "connected as <email>"; `/prep` shows the composer with a
  **Save to Gmail Drafts** action and **no Send control**.
- **Draft created:** click Save to Gmail Drafts → a draft appears in the connected Gmail Drafts folder
  (verifies item 2 fix); status reads "saved," not "sent."
- **Disconnected state:** after Disconnect → composer shows the "connect Gmail" prompt; token row gone;
  (if revocation added) grant removed at Google.
- **Reconnect:** Connect Gmail again → consent → connected; draft works again.
- **No-send guarantee:** confirm there is no Send button anywhere (prep, cockpit-views, action queue) and
  the `grep` guarantee (item 4) is clean.
- Real org unaffected by demo; demo tenants still simulate cleanly.
- Then prepare a Production candidate and **pause for approval** (standard 12-step flow).

---

## Effort & risk
- **Effort:** ~1–1.5 days. It touches ~8 files across two send backends and four UI producers, plus the
  privacy copy — more than a one-line change, but all subtractive/relabel work with no new scope surface.
- **Risk:** low and mostly UI; the draft path already exists and works server-side. The main care items are
  (a) not breaking the queue for non-email actions when removing `email_send`, and (b) the drafts-route
  auth fix. Both covered by the canary matrix.
- **Sequencing:** one focused branch; consider splitting into two commits — (i) drafts-route auth fix +
  comment corrections, (ii) send removal + UI relabel + privacy update — for a cleaner review. Do **not**
  bundle the disconnect-revocation improvement unless you want it in the same release.

**Do not implement until approved.**
