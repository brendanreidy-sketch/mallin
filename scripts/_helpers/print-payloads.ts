import type { AssemblyResult } from '@/orchestration/pass-1.5/input-assembler.types';

export function printPayloads(result: AssemblyResult) {
  // Destructure to local aliases — avoids chat-mangling on dotted property access
  const { calls, emails, meetings } = result.input;
  const {
    calls_requested: callsRequested,
    calls_returned: callsReturned,
    emails_requested: emailsRequested,
    emails_returned: emailsReturned,
    meetings_requested: meetingsRequested,
    meetings_returned: meetingsReturned,
    meeting_attendees_returned: attendeesReturned,
    missing_payload_ids: missing,
  } = result.diagnostics.hydration;

  console.log('─── Payloads ──────────────────────────────────────────────────');
  console.log(`Calls:                 ${callsReturned} / ${callsRequested} requested`);
  console.log(`Emails:                ${emailsReturned} / ${emailsRequested} requested`);
  console.log(`Meetings:              ${meetingsReturned} / ${meetingsRequested} requested`);
  console.log(`Meeting attendees:     ${attendeesReturned}`);

  // Total attendees across all meetings, computed from the assembled data
  // (sanity check that grouping worked — should match attendeesReturned)
  let totalAttendeesInMeetings = 0;
  for (const m of meetings) {
    totalAttendeesInMeetings += m.attendees.length;
  }
  console.log(`Attendees attached:    ${totalAttendeesInMeetings}`);

  // Missing payloads
  const totalMissing = missing.calls.length + missing.emails.length + missing.meetings.length;
  console.log(`Missing payloads:      ${totalMissing}`);
  if (missing.calls.length > 0) {
    console.log(`  - Missing calls:     ${missing.calls.length}`);
  }
  if (missing.emails.length > 0) {
    console.log(`  - Missing emails:    ${missing.emails.length}`);
  }
  if (missing.meetings.length > 0) {
    console.log(`  - Missing meetings:  ${missing.meetings.length}`);
  }

  // Sanity check that arrays are non-empty when expected
  if (calls.length === 0 && callsRequested > 0) {
    console.log('⚠️  Calls array empty but calls were requested');
  }
  if (emails.length === 0 && emailsRequested > 0) {
    console.log('⚠️  Emails array empty but emails were requested');
  }
  if (meetings.length === 0 && meetingsRequested > 0) {
    console.log('⚠️  Meetings array empty but meetings were requested');
  }

  console.log();
}
