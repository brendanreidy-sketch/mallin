import type { RenderModel } from '@/lib/cockpit/render-model';
import s from './coverageSpine.module.css';

/** The at-a-glance "Mallín holds this" index — the firm's governance template
 *  rendered as coverage. Signals completeness without dumping detail. */
export function CoverageSpine({
  model,
  active,
  onJump,
}: {
  model: RenderModel;
  active?: string;
  onJump?: (key: string) => void;
}) {
  return (
    <div className={s.spine}>
      {model.coverage.map((c) => {
        const state = !c.present && c.required ? 'gap' : c.present ? 'present' : 'empty';
        return (
          <button
            key={c.key}
            type="button"
            className={`${s.chip} ${s[state]} ${active === c.key ? s.active : ''}`}
            onClick={() => onJump?.(c.key)}
          >
            <span className={s.dot} />
            <span className={s.label}>{c.title}</span>
            {typeof c.count === 'number' && <span className={s.count}>{c.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
