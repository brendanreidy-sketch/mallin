# Gmail drafts-only conversion — revised implementation plan (Path 2)

**Type:** plan only · **no code, no dashboard, no env change** · implement only after approval.
**Decisions locked:** drafts-only for launch; **OAuth Path 2** (approved test users only, no restricted
verification yet). Pairs with [audit](gmail-oauth-verification.md) and
[launch decision](gmail-oauth-launch-decision.md).

**This release contains ONLY the seven items in §2.** Google token **revocation on disconnect is split
out to a separate future change** (see §7) and is NOT in this release.

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

## 3. Separate Google Cloud project for testing/canary (constraints 3–5)

**Do NOT touch the current Production project (`mallin-502618`), the "Mallin Web" client, or `mallin.io`.**

**Setup steps (Console — user performs; documented here, not executed):**
1. Create a **new** Google Cloud project, e.g. `mallin-canary`.
2. Configure its **OAuth consent screen** in **Testing** mode; app name e.g. "Mallín (Canary)"; add the
   scopes `gmail.compose`, `openid`, `email`; add the design partners + founder as **test users**.
3. Create an **OAuth client** ("Mallin Canary Web") with **authorized redirect URI =
   `https://canary.mallin.io/api/gmail/oauth-callback`** and authorized domain `mallin.io` (canary
   subdomain). **No `mallin.io` redirect on this client.**
4. Record the new client id/secret (secret handled only in the Vercel dashboard — never repo/chat).

## 4. Env-var handling — the blocker constraint 4 caught

**Read-only finding (confirmed via `vercel env ls`):** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
and `GOOGLE_OAUTH_REDIRECT_URI` are **single entries scoped to `Production` AND `prod-debug` together**.
**They are NOT independent.** Editing any of them **changes Production**. (Preview has its own separate
entries; prod-debug does not.)

**Therefore we will not edit the shared entries' values.** To point canary/prod-debug at the test client
without touching Production, split them into independent entries:
1. **Re-scope** each shared entry to **Production-only** (remove `prod-debug` from its environment list).
   This does **not** change the value Production uses — Production keeps the exact same client id/secret/
   redirect.
2. **Add new `prod-debug`-only entries** for `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` with the **test
   client** values (redirect = `https://canary.mallin.io/api/gmail/oauth-callback`).
3. **Verify Production is unchanged:** after the split, confirm the Production-scoped values are byte-
   identical to before (re-pull/inspect), and that `mallin.io` Gmail connect still works.

- This split **is** an edit to the shared entries' *scope* (not their value); because the constraint is
  "do not edit any variable **shared with Production**," this step is called out explicitly and needs
  **your explicit approval** before execution, with the Production-unchanged verification above as the gate.
- **Alternative if you'd rather not touch the shared entries at all:** most acceptance tests (no-send UI,
  grep guarantee, draft-created, disconnect) can run on canary using the founder's **existing** Gmail
  connection (the token already lives in the shared Supabase DB, and `drafts.create` needs no redirect).
  Only the **fresh connect/reconnect** test truly needs the canary test client. We can run everything
  except fresh-connect without the env split, and verify fresh-connect on `mallin.io` during the eventual
  Production release. Your call.

---

## 5. Canary acceptance criteria

On prod-debug → `canary.mallin.io`, real + SaaS-demo orgs, light + dark:
1. **No send anywhere:** no "Send via Gmail" control on `/prep`, `/cockpit-views`, or the action queue;
   the `grep` guarantee (§1) is clean.
2. **Connected state:** integrations page shows "connected as <email>"; composer shows **Save to Gmail
   Drafts** only.
3. **Draft created (item-2 fix):** click Save to Gmail Drafts → a draft appears in the connected Gmail
   Drafts folder; status reads "saved," never "sent." (Uses the founder's existing connection.)
4. **Disconnected state:** Disconnect → composer shows the connect prompt; `gmail_oauth_tokens` row gone.
5. **Reconnect (needs the test client + env split, if done):** Connect Gmail on `canary.mallin.io` →
   consent on the **canary test client** → connected → draft works again.
6. **Queue integrity:** removing `email_send` didn't break other action-queue types.
7. **Isolation:** real org unaffected by demo; `mallin.io` Gmail connect still works (Production untouched).
8. Then prepare a Production candidate and **pause for approval** (standard 12-step flow).

## 6. Rollback plan
- **Code:** single focused branch; rollback = revert the drafts-only commit(s) and re-alias `mallin.io` to
  the prior live deployment. All changes are subtractive/relabel, so revert is clean.
- **Env split (if done):** reverse is re-adding `prod-debug` to the Production-scoped entries and deleting
  the prod-debug-only test entries — Production values were never changed, so no Production impact either
  way. Keep a note of the exact pre-split scoping to restore it.
- **Test Cloud project:** independent; can be left or deleted with zero Production effect.

## 7. Explicitly NOT in this release (future, separate changes)
- **Google token revocation on disconnect** (constraint 1) — add a best-effort
  `POST oauth2.googleapis.com/revoke` in `disconnectGmail`. Its own commit, later. Disconnect today
  correctly deletes the local token row; that behavior is unchanged in this release.
- **Restricted-scope verification / CASA** (Path 1) — only after active design-partner demand for Gmail.
- **Migration to a separately-verified Production OAuth project** — see the launch-decision doc.

---

## Effort & sequence
- **Effort:** ~1–1.5 days code (8 files, subtractive), plus the Console/env setup (§3–4) if the env split
  is approved.
- **Sequence:** (a) code change on one branch, split into two commits — drafts-route auth fix + comment
  corrections, then send removal + UI relabel + privacy tightening; (b) test-project + env split (gated,
  §4); (c) canary acceptance; (d) Production candidate → pause.

**Do not implement code, create the project, or change any env var until approved.**
