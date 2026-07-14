import type { RenderField } from '@/lib/cockpit/render-model';
import { EvidenceChip } from './EvidenceChip';
import { toneColor } from './tone';
import s from './fieldBody.module.css';

/** Renders one normalized RenderField. Shared by every view — switching on
 *  `kind`, never on the source artifact. A required field with no value renders
 *  as a governance gap. */
export function FieldBody({ field, label }: { field: RenderField; label?: boolean }) {
  if (!field.present) {
    if (field.required) {
      return (
        <div className={s.gap}>
          <span className={s.gapDot} />
          <span className={s.gapText}>
            {field.label} — <em>required, not yet captured</em>
          </span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={s.field}>
      {label && field.kind !== 'pairs' && <div className={s.label}>{field.label}</div>}
      {field.kind === 'text' && <p className={s.text}>{field.text}</p>}

      {field.kind === 'list' && (
        <ul className={s.list}>
          {field.items?.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}

      {field.kind === 'pairs' && (
        <div className={s.pairs}>
          {field.pairs?.map((p, i) => (
            <div key={i} className={s.pair}>
              <span className={s.pairLabel}>{p.label}</span>
              <span className={s.pairValue} style={{ color: toneColor(p.tone) }}>
                {p.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {field.kind === 'people' && (
        <div className={s.people}>
          {field.people?.map((person, i) => (
            <div key={i} className={s.person}>
              <span className={s.personDot} style={{ background: toneColor(person.tone) }} />
              <div className={s.personBody}>
                <div className={s.personHead}>
                  <span className={s.personName}>{person.name}</span>
                  {person.role && <span className={s.personRole}>{person.role}</span>}
                  {person.disposition && (
                    <span className={s.personDisp} style={{ color: toneColor(person.tone) }}>
                      {person.disposition}
                    </span>
                  )}
                </div>
                {person.note && <div className={s.personNote}>{person.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {field.kind === 'flags' && (
        <div className={s.flags}>
          {field.flags?.map((flag, i) => (
            <div key={i} className={s.flag}>
              <span className={s.flagBar} style={{ background: toneColor(flag.tone) }} />
              <div className={s.flagBody}>
                <div className={s.flagHead}>
                  <span className={s.flagTitle}>{flag.title}</span>
                  {flag.severity && (
                    <span className={s.flagSev} style={{ color: toneColor(flag.tone) }}>
                      {flag.severity}
                    </span>
                  )}
                </div>
                {flag.detail && <div className={s.flagDetail}>{flag.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {field.evidence && field.evidence.length > 0 && <EvidenceChip evidence={field.evidence} />}
    </div>
  );
}
