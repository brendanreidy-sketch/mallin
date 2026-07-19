# Gmail drafts-only conversion — revised implementation plan (Path 2)

**Type:** plan only · **no code, no dashboard, no env, no Supabase change** · implement only after approval.
**Decisions locked:** drafts-only for launch; **OAuth Path 2** (approved test users only, no restricted
verification yet); **Option B** — do **not** split or edit the shared `GOOGLE_OAUTH_*` env vars; test on
canary using the founder's existing connection only. Pairs with [audit](gmail-oauth-verification.md) and
[launch decision](gmail-oauth-launch-decision.md).

**This release contains ONLY the seven code items in §2.** No OAuth project/client/consent-screen/env/DB
changes. Google token **revocation on disconnect** is a separate future change (§7). **Because prod-debug
shares the Production Supabase (§3), no disconnect/reconnect/token-deletion is done during canary testing.**

---

## 1. Exact active send paths being removed

Two backend `messages.send` paths and their producers (all confirmed in the audit):

| Kind | Location | This release does |
|---|---|---|
| Backend send route | `app/api/gmail/send/route.ts` → `messages.send` (:105) | **delete the route** |
| Backend queue executor | `lib/action-queue/executors.ts` `executeEmailSend` (:126), send call (:144), dispatch case (:69-70), `buildMime` (:333) | **delete the executor + dispatch + buildMime** |
| Queue type | `lib/action-queue/types.ts` `email_send` + `EmailSendPayload` (:21, :53-54, :98) | **remove the type** (or convert to a blocked/no-op) |
| UI producer | `app/prep/EmailComposer.tsx` "✉ Send via Gmail" (:265) + Queue→`email_send` (:101) | button → **Save to Gmail Drafts**; queue enqueues `email_draft` or is dropped |
| UI producer | `app/cockpit-views/BookReview.tsx` "✉ Send via Gmail" (:468 → send :270) | replace with **Save to Gmail Drafts** (draft path) |
| UI producer | `app/prep/SendDeckToRoom.tsx` enqueues `email_send` (:104) | enqueue `email_draft`, or draft directly |
| UI render | `app/prep/ActionQueue.tsx` renders/approves `email_send` (:398) | **remove the `email_send` case** |
| UI (stale mock) | `app/cockpit-mock/page.tsx` "✉ Send via Gmail" label (:181) | confirm decorative; relabel/remove the "Send" wording |

**End state:** `grep -rniE 'messages/send|messages\.send|email_send' app lib` returns **zero** shipping
hits.

---

## 2. The seven items in this release (file-by-file)

### (1) Replace all direct-send actions with "Save to Gmail Drafts"
- `app/prep/EmailComposer.tsx` — remove `handleSend` + the "✉ Send via Gmail" button and the
  `sending`/`sent` statuses; make **"💾 Save to Gmail Drafts"** the primary action (existing
  `handleSaveDraft` → `drafts.create`). The "Queue" button, if kept, enqueues `email_draft`.
- `app/cockpit-views/BookReview.tsx` — replace the one-click "✉ Send via Gmail" with the draft action.
- `app/cockpit-mock/page.tsx` — relabel/remove the decorative "Send" label (verify it has no live handler).
- Copy rule: no shipping surface says "send"; it says "saved to your Drafts — you send from Gmail."

### (2) Fix the drafts-route authentication bug
- `app/api/gmail/drafts/route.ts:19` — replace the `x-user-id` header shim with Clerk `auth()` (mirror
  `send/route.ts`'s pattern before it's deleted). This makes "Save to Gmail Drafts" from `/prep` actually
  work (it 400s today).

### (3) Remove/disable both `messages.send` backend paths
- **Delete** `app/api/gmail/send/route.ts`.
- **Delete** `executeEmailSend` + its dispatch case + `buildMime` in `lib/action-queue/executors.ts`.
- Prefer deletion over flag-gating so there is no latent re-enable path.

### (4) Remove every active `email_send` queue producer and executor
- Producers → `email_draft` (or removed): `EmailComposer.tsx:101`, `SendDeckToRoom.tsx:104`.
- Executor + type + UI case removed: `executors.ts` (§1), `types.ts:21/53-54/98`, `ActionQueue.tsx:398`.
- Verify no non-email queue behavior regresses when `email_send` is removed (other action types untouched).

### (5) Confirm no UI component or API route can send email
- The grep guarantee (§1 end state) is part of the acceptance checklist.
- Manual sweep of the §1 producer list; confirm each now drafts or is gone; confirm no route calls
  `.../users/me/messages/send`.

### (6) Correct stale scope/behavior comments
- `app/prep/EmailComposer.tsx:9` "fires gmail.send" → rewrite for drafts-only.
- `lib/auth/gmail-oauth.ts:47-49` — the "SENSITIVE scope … keeps verification OFF the restricted tier and
  CASA" comment is **factually wrong** now (compose is **restricted**). Correct to: restricted scope;
  restricted-scope verification (possibly CASA) applies; drafts-only; do not add read scopes.
- Any residual "modify"/"send" scope language in comments/JSDoc.

### (7) Align privacy policy + OAuth wording with drafts-only
- `app/(trust)/privacy/page.tsx` §11 already says "create draft emails" and "never sends" — after the code
  change this becomes **true**; tighten to state `gmail.compose` is used **only** to create drafts, never
  send, never read mail; keep the Limited-Use line. Verify the integrations-page copy matches.
- OAuth consent-screen justification wording (Console, at submission-time only — not now) must say the same.

**Scopes unchanged:** `gmail.compose` + `openid` + `email` stay exactly as-is (gmail-oauth.ts:52-56). No
scope edit in this release.

---

## 3. OAuth / project / env / DB changes in this release: NONE (Option B)

This release makes **no** change to any Google Cloud project, OAuth client, consent screen, Vercel env
var, or Supabase. The `GOOGLE_OAUTH_*` env vars are **not** split or edited (they are shared
Production+prod-debug entries — editing them would change Production). The separate-test-project idea
moves to the backlog (§7) because, per the safety correction below, a separate project alone is **not**
sufficient isolation.

### ⚠ Safety correction — prod-debug shares the Production Supabase database
`prod-debug` (and therefore `canary.mallin.io`) reads/writes the **same** `gmail_oauth_tokens` table as
Production. Consequences that bound how we test:
- A **disconnect on canary** would **delete the founder's live Production token** → breaks `mallin.io` Gmail.
- A **reconnect on canary** (even via a *different* Google client) would **overwrite the same user's token
  row** → also breaks Production Gmail.
- So **a separate Google Cloud project is not enough**; true isolation also requires **separate token
  storage** (a separate Supabase project or environment-specific token rows). That is the backlog item.

### How we test safely on the shared infra (constraints 1, 2, 3, 8)
- **Draft creation:** use the founder's **existing** Gmail connection. `drafts.create` only *reads* the
  stored token and needs no redirect — it does not modify or delete the token row. Safe.
- **Do NOT disconnect or reconnect** the personal Gmail account on canary. Do **not** click Disconnect on
  the live-connected account. Do **not** delete any token row.
- **Do NOT modify any OAuth env var.**
- **Connected-state UI:** verify on the founder's real org (already connected).
- **Disconnected-state UI:** verify on an org that has **no** token — e.g. the **SaaS demo org** (it shows
  "Not connected"), or a signed-out view — **not** by disconnecting the live account.
- Fresh connect / disconnect / reconnect / 7-day expiry testing is **deferred** to the isolated
  environment (§7 backlog), where token storage is separated from Production.

---

## 5. Canary acceptance criteria (no token mutation)

On prod-debug → `canary.mallin.io`, real + SaaS-demo orgs, light + dark. **No Disconnect click, no
reconnect, no token deletion** — the shared Production token must be left intact throughout.
1. **No send anywhere (constraint 4 removal):** no "Send via Gmail" control on `/prep`, `/cockpit-views`,
   or the action queue.
2. **Zero send references (constraint 7):** `grep -rniE 'messages/send|messages\.send|email_send' app lib`
   returns **0** shipping hits.
3. **Connected-state UI (constraint 8a):** on the founder's real org (already connected), the integrations
   page shows "connected as <email>" and the composer shows **Save to Gmail Drafts** only — read-only
   check, no clicks that mutate the token.
4. **Draft created, nothing sent (constraint 6):** click **Save to Gmail Drafts** → a draft appears in the
   founder's existing Gmail Drafts folder; status reads "saved," never "sent." Confirm via Gmail that a
   **draft** exists and **no message was sent**. (Uses the existing connection; does not touch the token
   row.)
5. **Disconnected-state UI (constraint 8b):** verify on a **not-connected** org (SaaS demo org shows "Not
   connected") — the composer shows the "connect Gmail" prompt. **Do not** produce this state by
   disconnecting the live account.
6. **Draft-route auth fix (constraint 5):** the draft in #4 proves `/api/gmail/drafts` now resolves the
   user via Clerk `auth()` (it 400s today).
7. **Queue integrity:** removing `email_send` didn't break other action-queue types.
8. **Production untouched:** `mallin.io` Gmail connect + the founder's live token still work after canary
   testing (nothing was disconnected/overwritten).
9. Then prepare a Production candidate and **pause for approval** (standard 12-step flow).

## 6. Rollback plan
- **Code only:** single focused branch; rollback = revert the drafts-only commit(s) and re-alias
  `mallin.io` to the prior live deployment. All changes are subtractive/relabel, so revert is clean.
- **No env / project / DB changes were made**, so there is nothing else to reverse. The founder's live
  Gmail token is never touched by this release or its testing.

## 7. Explicitly NOT in this release (future, separate changes)
- **Isolated OAuth testing environment** — the backlog item (see `docs/backlog.md`) that makes safe
  fresh-connect / disconnect / reconnect / 7-day-expiry testing possible: separate Google Cloud test
  project, independent prod-debug OAuth vars, **separate token storage (separate Supabase project or
  environment-specific `gmail_oauth_tokens`)**, and dedicated QA Google + Clerk accounts. Until it exists,
  those flows are **not** tested on the shared prod-debug/Production database.
- **Google token revocation on disconnect** (constraint 9) — add a best-effort
  `POST oauth2.googleapis.com/revoke` in `disconnectGmail`. Its own commit, later. Disconnect today
  correctly deletes the local token row; that behavior is unchanged in this release.
- **Restricted-scope verification / CASA** (Path 1) — only after active design-partner demand for Gmail.
- **Migration to a separately-verified Production OAuth project** — see the launch-decision doc.

---

## Effort & sequence
- **Effort:** ~1–1.5 days code (≈8 files, subtractive). **No Console/env/DB work in this release** (Option
  B) — the isolation setup is the separate backlog item.
- **Sequence:** (a) code change on one branch, split into two commits — drafts-route auth fix + comment
  corrections, then send removal + UI relabel + privacy tightening; (b) canary acceptance (§5, no token
  mutation); (c) Production candidate → pause for approval.

**Do not implement code, create the project, or change any env var until approved.**
