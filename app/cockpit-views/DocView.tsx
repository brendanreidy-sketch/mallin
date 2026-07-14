import type { RenderModel } from '@/lib/cockpit/render-model';
import { FieldBody } from './FieldBody';
import s from './docView.module.css';

/** Doc view — the same governance vocabulary read as a single-column briefing
 *  document. Identical RenderModel as Cards; only presentation differs. */
export function DocView({ model }: { model: RenderModel }) {
  return (
    <article className={s.doc}>
      {model.sections.map((sec) => {
        if (!sec.present && !sec.hasGap) return null;
        return (
          <section key={sec.key} id={`sec-${sec.key}`} className={s.section}>
            <h3 className={`${s.title} ${sec.primary ? s.primaryTitle : ''}`}>
              {sec.title}
              {sec.hasGap && <span className={s.gapTag}>gap</span>}
            </h3>
            {sec.primary && sec.descriptor && <p className={s.descriptor}>{sec.descriptor}</p>}
            <div className={s.body}>
              {sec.fields.map((f) => (
                <FieldBody key={f.key} field={f} label />
              ))}
            </div>
          </section>
        );
      })}
    </article>
  );
}
