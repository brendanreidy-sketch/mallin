'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PrepArtifact } from '@/lib/contracts/execution-agent-output';
import type { GovernanceTemplate } from '@/lib/cockpit/render-model';
import { deriveRenderModel } from '@/lib/cockpit/derive-render-model';
import type { EvidenceIndex } from '@/lib/cockpit/evidence-index';
import type { ReferenceMatch } from '@/lib/cockpit/match-reference';
import { defaultTemplate } from '@/lib/cockpit/templates/default-template';
import { macerichTemplate } from '@/lib/cockpit/templates/macerich-template';
import { CoverageSpine } from './CoverageSpine';
import { ReferenceCard } from './ReferenceCard';
import { CardsView } from './CardsView';
import { DocView } from './DocView';
import s from './page.module.css';

const TEMPLATES: GovernanceTemplate[] = [defaultTemplate, macerichTemplate];
type ViewKind = 'cards' | 'doc';

export function ViewsHarness({
  artifact,
  dealName,
  evidenceIndex,
  referenceMatch,
  backHref,
}: {
  artifact: PrepArtifact;
  dealName: string;
  evidenceIndex?: EvidenceIndex;
  referenceMatch?: ReferenceMatch | null;
  backHref?: string;
}) {
  const [view, setView] = useState<ViewKind>('cards');
  const [orgId, setOrgId] = useState<string>(defaultTemplate.orgId);

  const template = TEMPLATES.find((t) => t.orgId === orgId) ?? defaultTemplate;
  const model = useMemo(
    () => deriveRenderModel(artifact, template, dealName, evidenceIndex),
    [artifact, template, dealName, evidenceIndex],
  );

  const jump = (key: string) => {
    document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={s.page}>
      <div className={s.shell}>
        <header className={s.topbar}>
          <div>
            {backHref && (
              <Link href={backHref} className={s.back}>
                ← The Book
              </Link>
            )}
            <div className={s.deal}>{dealName}</div>
            <div className={s.sub}>
              Governance: <span className={s.templateName}>{model.templateLabel}</span> ·
              rep view: <span className={s.viewName}>{view}</span>
            </div>
          </div>
          <div className={s.controls}>
            <div className={s.switch}>
              <span className={s.switchLabel}>Firm governance</span>
              <div className={s.seg}>
                {TEMPLATES.map((t) => (
                  <button
                    key={t.orgId}
                    type="button"
                    className={`${s.segBtn} ${orgId === t.orgId ? s.segOn : ''}`}
                    onClick={() => setOrgId(t.orgId)}
                  >
                    {t.orgId}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.switch}>
              <span className={s.switchLabel}>Rep view</span>
              <div className={s.seg}>
                {(['cards', 'doc'] as ViewKind[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`${s.segBtn} ${view === v ? s.segOn : ''}`}
                    onClick={() => setView(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className={s.spineWrap}>
          <CoverageSpine model={model} onJump={jump} />
        </div>

        <div className={s.content}>
          {view === 'cards' ? <CardsView model={model} /> : <DocView model={model} />}
        </div>

        {/* Reference ammo follows the decision — never precedes it. The Primary
            Decision Focus must be the first substantive thing the rep reads
            (north star: elevate ONE primary thing); the closest closed-won
            comparable is support, rendered after the deal content. */}
        {referenceMatch && (
          <div className={s.referenceWrap}>
            <ReferenceCard match={referenceMatch} />
          </div>
        )}
      </div>
    </div>
  );
}
