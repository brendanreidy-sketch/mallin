"use client";

/**
 * DeckView — the in-app, customer-facing slide presentation. Consumes a
 * DeckModel (sanitized + segmented + dual-branded by lib/deck) and renders one
 * slide at a time with keyboard navigation.
 *
 * Brand colors come from model.branding.seller (CSS variables on the root);
 * logos are <img> by URL. Exports off the SAME model:
 *   - .pptx → GET /api/generate-deck?token=…&format=pptx
 *   - PDF   → window.print() (print stylesheet lays each slide out as a page)
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { DeckModel, Slide } from "@/lib/deck/deck-model";
import type { DeckBranding } from "@/lib/deck/brands";
import type { DeckVersion } from "@/lib/deck/deck-versions";
import s from "./deck.module.css";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso.trim());
  return d.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}

function Logo({ url, name, onDark }: { url?: string; name: string; onDark?: boolean }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={s.logoImg} src={url} alt={name} />;
  }
  return <span className={onDark ? s.wordmarkOnDark : s.wordmark}>{name}</span>;
}

/** Brand header bar for content slides: seller (L) / buyer (R) + accent rule. */
function BrandHeader({ b }: { b: DeckBranding }) {
  return (
    <div className={s.brandHeader}>
      <Logo url={b.seller.logoUrl} name={b.seller.name} />
      <Logo url={b.buyer.logoUrl} name={b.buyer.name} />
    </div>
  );
}

export default function DeckView({
  model,
  token,
  versions,
  selectedVersionId,
}: {
  model: DeckModel;
  token: string;
  versions: DeckVersion[];
  selectedVersionId: string;
}) {
  const [i, setI] = useState(0);
  const total = model.slides.length;
  const b = model.branding;

  const go = useCallback(
    (delta: number) => setI((prev) => Math.min(total - 1, Math.max(0, prev + delta))),
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Brand colors drive the deck via CSS variables.
  const rootStyle = {
    "--brand-primary": b.seller.colorPrimary,
    "--brand-accent": b.seller.colorAccent,
  } as CSSProperties;

  return (
    <div className={s.root} style={rootStyle}>
      <div className={s.stage}>
        <SlideBody slide={model.slides[i]} b={b} />
      </div>

      <div className={s.controls}>
        <button type="button" className={s.navBtn} onClick={() => go(-1)} disabled={i === 0}>←</button>
        <span className={s.counter}>{i + 1} / {total}</span>
        <button type="button" className={s.navBtn} onClick={() => go(1)} disabled={i === total - 1}>→</button>
        <span className={s.spacer} />
        {versions.length > 1 && (
          <VersionPicker token={token} versions={versions} selectedVersionId={selectedVersionId} />
        )}
        <a className={s.exportBtn} href={`/api/generate-deck?token=${token}&format=pptx`}>Download .pptx</a>
        <button type="button" className={s.exportBtn} onClick={() => window.print()}>Download PDF</button>
      </div>

      <div className={s.printSheet}>
        {model.slides.map((slide, k) => (
          <div key={k} className={s.printPage}>
            <SlideBody slide={slide} b={b} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Understated version switcher — a single native select in the controls bar.
 *  Each option is labeled by its meeting title/date; the current version is
 *  flagged. Switching sets `?v=`; picking the current one drops the param so the
 *  default deck URL stays clean. Full-page nav (not client state) so the
 *  server re-selects the artifact through the same security gate. */
function VersionPicker({
  token,
  versions,
  selectedVersionId,
}: {
  token: string;
  versions: DeckVersion[];
  selectedVersionId: string;
}) {
  const onChange = (id: string) => {
    const current = versions.find((v) => v.isCurrent);
    const href = current && id === current.id ? `/deck/${token}` : `/deck/${token}?v=${id}`;
    window.location.href = href;
  };
  return (
    <label className={s.versionPicker}>
      <span className={s.versionLabel}>Version</span>
      <select
        className={s.versionSelect}
        value={selectedVersionId}
        onChange={(e) => onChange(e.target.value)}
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
            {v.isCurrent ? " · current" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function SlideBody({ slide, b }: { slide: Slide; b: DeckBranding }) {
  switch (slide.kind) {
    case "title":
      return (
        <section className={`${s.slide} ${s.brandSlide}`}>
          <div className={s.brandHeaderDark}>
            <Logo url={b.seller.logoUrl} name={slide.sellerName} onDark />
            <Logo url={b.buyer.logoUrl} name={slide.buyerName} onDark />
          </div>
          <div className={s.titleCenter}>
            <p className={s.eyebrowAccent}>PRE-CALL DECK</p>
            <h1 className={s.titleHeading}>{slide.meetingTitle}</h1>
            <p className={s.crossline}>
              <span>{slide.sellerName}</span>
              <span className={s.cross}> × </span>
              <span>{slide.buyerName}</span>
            </p>
            {slide.meetingDate && <p className={s.titleDate}>{fmtDate(slide.meetingDate)}</p>}
          </div>
        </section>
      );

    case "intro":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <div className={s.person}>
            <div className={s.personHead}>
              {slide.person.linkedinUrl ? (
                <a className={s.personName} href={slide.person.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {slide.person.name} <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <span className={s.personName}>{slide.person.name}</span>
              )}
              {slide.person.title && (
                <span className={s.personTitle}>
                  {slide.person.title}
                  {slide.sellerName ? ` · ${slide.sellerName}` : ""}
                </span>
              )}
            </div>
            {slide.person.bio && <p className={s.personBg}>{slide.person.bio}</p>}
          </div>
        </section>
      );

    case "agenda":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <ol className={s.agenda}>
            {slide.items.map((it, k) => (
              <li key={k}>{it}</li>
            ))}
          </ol>
        </section>
      );

    case "points":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <ul className={s.bullets}>
            {slide.bullets.map((bb, k) => (
              <li key={k}>{bb}</li>
            ))}
          </ul>
        </section>
      );

    case "quotes":
      return (
        <section className={`${s.slide} ${s.brandSlide}`}>
          <p className={s.eyebrowAccent}>{slide.title.toUpperCase()}</p>
          <div className={s.quoteList}>
            {slide.quotes.map((q, k) => (
              <figure key={k} className={s.quoteItem}>
                <blockquote className={s.quoteText}>
                  <span className={s.quoteMark}>“</span>
                  {q.text}
                  <span className={s.quoteMark}>”</span>
                </blockquote>
                {q.attribution && <figcaption className={s.quoteAttr}>— {q.attribution}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      );

    case "impact":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          {slide.metrics.length > 0 && (
            <div className={s.metricRow}>
              {slide.metrics.map((m, k) => (
                <div key={k} className={s.metric}>
                  <span className={s.metricValue}>{m.value}</span>
                  <span className={s.metricLabel}>{m.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className={s.compareCols}>
            <div className={s.compareCol}>
              <div className={s.compareLabelToday}>TODAY</div>
              <ul className={s.bulletsTight}>
                {slide.today.map((t, k) => (
                  <li key={k}>{t}</li>
                ))}
              </ul>
            </div>
            <div className={s.compareCol}>
              <div className={s.compareLabelWith}>WITH {slide.sellerName.toUpperCase()}</div>
              <ul className={s.bulletsTight}>
                {slide.withSolution.map((t, k) => (
                  <li key={k}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      );

    case "attendees":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <div className={s.attendeeCols}>
            <AttendeeCol company={slide.sellerName} people={slide.sellerPeople} />
            <AttendeeCol company={slide.buyerName} people={slide.buyerPeople} />
          </div>
        </section>
      );

    case "fit":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <div className={s.attendeeCols}>
            <FitCol label={slide.buyerLabel} items={slide.buyerWants} />
            <FitCol label={slide.sellerLabel} items={slide.sellerOffers} />
          </div>
        </section>
      );

    case "logoWall":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <div className={s.logoWall}>
            {slide.brands.map((n, k) => (
              <div key={k} className={s.logoChip}>
                {n}
              </div>
            ))}
          </div>
        </section>
      );

    case "facts":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <div className={s.factGrid}>
            {slide.facts.map((f, k) => (
              <div key={k} className={s.factCol}>
                <span className={s.factLabel}>{f.label}</span>
                <p className={s.factValue}>{f.value}</p>
              </div>
            ))}
          </div>
        </section>
      );

    case "events":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <ul className={s.eventsList}>
            {slide.events.map((e, k) => (
              <li key={k} className={s.event}>
                <div className={s.eventHead}>
                  <span className={s.eventDate}>{fmtDate(e.date)}</span>
                  <span className={s.eventHeadline}>{e.headline}</span>
                </div>
                <p className={s.eventRelevance}>{e.relevance}</p>
              </li>
            ))}
          </ul>
        </section>
      );

    case "priorities":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <ul className={s.bullets}>
            {slide.items.map((it, k) => (
              <li key={k}>{it}</li>
            ))}
          </ul>
        </section>
      );

    case "stakeholders":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          <div className={s.people}>
            {slide.people.map((p, k) => (
              <div key={k} className={s.person}>
                <div className={s.personHead}>
                  {p.linkedinUrl ? (
                    <a className={s.personName} href={p.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {p.name} <span aria-hidden="true">↗</span>
                    </a>
                  ) : (
                    <span className={s.personName}>{p.name}</span>
                  )}
                  {p.title && <span className={s.personTitle}>{p.title}</span>}
                </div>
                <p className={s.personBg}>{p.background}</p>
                {p.priorities.length > 0 && (
                  <ul className={s.bulletsTight}>
                    {p.priorities.map((vp, j) => (
                      <li key={j}>{vp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      );

    case "competitive":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          {slide.marketPosition && <p className={s.lead}>{slide.marketPosition}</p>}
          <ul className={s.bullets}>
            {slide.competitors.map((c, k) => (
              <li key={k}>{c}</li>
            ))}
          </ul>
        </section>
      );

    case "walkingIn":
      return (
        <section className={s.slide}>
          <BrandHeader b={b} />
          <h2 className={s.slideTitle}>{slide.title}</h2>
          {slide.openingAngle && (
            <div className={s.briefRow}>
              <span className={s.briefLabel}>Opening</span>
              <p className={s.briefText}>{slide.openingAngle}</p>
            </div>
          )}
          {slide.questions.length > 0 && (
            <div className={s.briefRow}>
              <span className={s.briefLabel}>Questions</span>
              <ol className={s.questions}>
                {slide.questions.map((q, k) => (
                  <li key={k}>{q}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      );

    case "closing":
      return (
        <section className={`${s.slide} ${s.brandSlide}`}>
          <div className={s.brandHeaderDark}>
            <Logo url={b.seller.logoUrl} name={slide.sellerName} onDark />
            <Logo url={b.buyer.logoUrl} name={slide.buyerName} onDark />
          </div>
          <div className={s.titleCenter}>
            <p className={s.crossline}>
              <span>{slide.sellerName}</span>
              <span className={s.cross}> × </span>
              <span>{slide.buyerName}</span>
            </p>
            <p className={s.eyebrowAccent}>{slide.subhead}</p>
          </div>
        </section>
      );
  }
}

function FitCol({ label, items }: { label: string; items: string[] }) {
  return (
    <div className={s.attendeeCard}>
      <div className={s.attendeeCompany}>{label}</div>
      <ul className={s.bulletsTight}>
        {items.map((t, k) => (
          <li key={k}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function AttendeeCol({ company, people }: { company: string; people: { name: string; title?: string }[] }) {
  return (
    <div className={s.attendeeCard}>
      <div className={s.attendeeCompany}>{company}</div>
      {people.map((p, k) => (
        <div key={k} className={s.attendee}>
          <span className={s.attendeeName}>{p.name}</span>
          {p.title && <span className={s.attendeeTitle}>{p.title}</span>}
        </div>
      ))}
    </div>
  );
}
