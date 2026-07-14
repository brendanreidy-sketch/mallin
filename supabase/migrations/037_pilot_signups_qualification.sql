-- Extra qualification fields on the /pilot request form.
--
-- what_you_sell is the load-bearing one — it's the anchor for every brief
-- Mallín would generate for this team, and lets us demo on their real deals in
-- the follow-up call. The rest are optional signals: win_rate captures the ROI
-- baseline at the one moment it's recoverable; deal_profile signals where
-- compound memory pays off; team_experience signals where the coaching lift
-- lands hardest (and pairs with the experience-aware coaching work).
--
-- ⚠️ The pilot-signup insert is the source of truth (not best-effort), so this
-- migration MUST be applied before the code that writes these columns deploys —
-- otherwise the insert fails and the form 500s.

alter table pilot_signups
  add column if not exists what_you_sell    text,
  add column if not exists win_rate         text,
  add column if not exists deal_profile     text,
  add column if not exists team_experience  text;
