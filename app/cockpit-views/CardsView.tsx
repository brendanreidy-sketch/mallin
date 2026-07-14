import type { RenderModel, RenderSection } from '@/lib/cockpit/render-model';
import { FieldBody } from './FieldBody';
import s from './cardsView.module.css';

/** Cards view — sections rendered in three importance bands (break the
 *  "every card equal" democracy):
 *    Tier 1  one dominant primary card, full width
 *    Tier 2  supporting actors (risks, stakeholders) in a prominent grid
 *    Tier 3  quiet reference material, denser + dimmer
 *  Evidence proves truth (the chip); tier proves importance (the layout). */
export function CardsView({ model }: { model: RenderModel }) {
  const visible = model.sections.filter((sec) => sec.present || sec.hasGap);
  const tier1 = visible.filter((s) => s.tier === 1);
  const tier2 = visible.filter((s) => s.tier === 2);
  const tier3 = visible.filter((s) => s.tier === 3);

  return (
    <div className={s.bands}>
      {tier1.map((sec) => (
        <Card key={sec.key} sec={sec} />
      ))}

      {tier2.length > 0 && (
        <div className={s.grid}>
          {tier2.map((sec) => (
            <Card key={sec.key} sec={sec} />
          ))}
        </div>
      )}

      {tier3.length > 0 && (
        <div className={s.referenceBand}>
          <div className={s.bandLabel}>Reference</div>
          <div className={s.gridDense}>
            {tier3.map((sec) => (
              <Card key={sec.key} sec={sec} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ sec }: { sec: RenderSection }) {
  const tierClass = sec.tier === 3 ? s.tier3 : '';
  return (
    <section
      id={`sec-${sec.key}`}
      className={`${s.card} ${sec.primary ? s.primary : ''} ${tierClass} ${sec.hasGap ? s.gapped : ''}`}
    >
      <header className={s.head}>
        <h3 className={s.title}>{sec.title}</h3>
        {sec.hasGap && <span className={s.gapTag}>Gap</span>}
      </header>
      {sec.primary && sec.descriptor && <p className={s.descriptor}>{sec.descriptor}</p>}
      <div className={s.body}>
        {sec.fields.map((f) => (
          <FieldBody key={f.key} field={f} label={!sec.primary} />
        ))}
      </div>
    </section>
  );
}
