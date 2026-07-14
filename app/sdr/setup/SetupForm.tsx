"use client";

import { useEffect, useState } from "react";
import type { SdrResource, SdrTenantConfig } from "@/lib/sdr/types";

/**
 * SDR setup — where a customer declares what they use Mallín for: their
 * offering, the governed rubric (ICP / criteria / work-now bar / nurture band),
 * what to implement per outcome, and the resource library the agent can send.
 *
 * Loads GET /api/sdr/config, saves POST /api/sdr/config.
 */

const CK = {
  bg: "#f4f1ea",
  ink: "#1a2230",
  sub: "#6b7689",
  line: "#dcd6ca",
  card: "#ffffff",
  accent: "#1a2230",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: CK.sub,
  margin: "0 0 6px",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 14,
  color: CK.ink,
  background: CK.card,
  border: `1px solid ${CK.line}`,
  borderRadius: 8,
  boxSizing: "border-box",
  fontFamily: "inherit",
};
const section: React.CSSProperties = {
  background: CK.card,
  border: `1px solid ${CK.line}`,
  borderRadius: 12,
  padding: 20,
  margin: "0 0 16px",
};
const h2: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 16,
  fontWeight: 700,
  color: CK.ink,
};
const hint: React.CSSProperties = { margin: "0 0 16px", fontSize: 13, color: CK.sub };

// Textarea where each non-empty line is one array entry.
function LinesField({
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      style={{ ...input, resize: "vertical" }}
      rows={rows}
      placeholder={placeholder}
      value={value.join("\n")}
      onChange={(e) =>
        onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))
      }
    />
  );
}

export default function SetupForm() {
  const [config, setConfig] = useState<SdrTenantConfig | null>(null);
  const [widgetKey, setWidgetKey] = useState<string>("");
  const [entitled, setEntitled] = useState(true);
  const [researching, setResearching] = useState(false);
  const [researchMsg, setResearchMsg] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/sdr/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          setConfig(d.config);
          setWidgetKey(d.widget_key ?? "");
          setEntitled(d.entitled !== false);
          setStatus("ready");
        } else {
          setStatus("error");
          setMessage(d.error ?? "Could not load config");
        }
      })
      .catch((e) => {
        setStatus("error");
        setMessage(String(e));
      });
  }, []);

  if (!config) {
    return (
      <p style={{ color: CK.sub, fontSize: 14 }}>
        {status === "error" ? `Couldn't load: ${message}` : "Loading…"}
      </p>
    );
  }

  // Nested update helpers.
  const set = (patch: Partial<SdrTenantConfig>) => setConfig({ ...config, ...patch });
  const setGov = (patch: Partial<SdrTenantConfig["governance"]>) =>
    set({ governance: { ...config.governance, ...patch } });
  const setImpl = (patch: Partial<SdrTenantConfig["implementation"]>) =>
    set({ implementation: { ...config.implementation, ...patch } });

  const resources = config.resources ?? [];
  const setResource = (i: number, patch: Partial<SdrResource>) => {
    const next = resources.slice();
    next[i] = { ...next[i], ...patch };
    set({ resources: next });
  };
  const addResource = () =>
    set({
      resources: [
        ...resources,
        { id: "", title: "", type: "case_study", url: "", summary: "", relevant_for: [] },
      ],
    });
  const removeResource = (i: number) =>
    set({ resources: resources.filter((_, j) => j !== i) });

  async function researchCompany() {
    if (!config) return;
    if (!config.company_name.trim()) {
      setResearchMsg("Add a company name first.");
      return;
    }
    setResearching(true);
    setResearchMsg("");
    try {
      const r = await fetch("/api/sdr/research-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: config.company_name, website: config.website }),
      });
      const d = await r.json();
      if (r.ok && d.draft) {
        const draft = d.draft;
        setConfig({
          ...config,
          offering: draft.offering || config.offering,
          knowledge: [...new Set([...(config.knowledge ?? []), ...(draft.knowledge ?? [])])],
          products: draft.products ?? [],
          personas: draft.personas ?? [],
        });
        setResearchMsg(
          `Filled from research — ${draft.products?.length ?? 0} products, ${draft.personas?.length ?? 0} personas. Review everything, then Save.`,
        );
      } else if (d.error === "not_enabled") {
        setResearchMsg("Activate the SDR first to use research.");
      } else {
        setResearchMsg(d.detail ?? d.error ?? "Research failed");
      }
    } catch (e) {
      setResearchMsg(String(e));
    } finally {
      setResearching(false);
    }
  }

  async function save() {
    setStatus("saving");
    setMessage("");
    try {
      const r = await fetch("/api/sdr/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const d = await r.json();
      if (r.ok) {
        setStatus("saved");
        setMessage("Saved.");
      } else if (d.error === "not_enabled") {
        setStatus("error");
        setMessage("Saving is enabled once your AI SDR is activated — book a demo to turn it on.");
      } else {
        setStatus("error");
        setMessage(d.detail ?? d.error ?? "Save failed");
      }
    } catch (e) {
      setStatus("error");
      setMessage(String(e));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {!entitled && (
        <div
          style={{
            background: "#1a2230",
            color: "#f4f1ea",
            borderRadius: 12,
            padding: "16px 18px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            The AI SDR is a paid capability. Configure it freely here — turning it
            live on your site needs activation.
          </span>
          <a
            href="/contact"
            style={{
              background: "#f4f1ea",
              color: "#1a2230",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Book a demo →
          </a>
        </div>
      )}
      {/* Identity */}
      <div style={section}>
        <h2 style={h2}>Your company</h2>
        <p style={hint}>Who the agent represents, and what it sells.</p>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Company name</span>
          <input
            style={input}
            value={config.company_name}
            onChange={(e) => set({ company_name: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Website</span>
          <input
            style={input}
            placeholder="https://yourcompany.com — anchors research to the right company"
            value={config.website ?? ""}
            onChange={(e) => set({ website: e.target.value })}
          />
        </div>
        <div>
          <span style={label}>Offering</span>
          <textarea
            style={{ ...input, resize: "vertical" }}
            rows={3}
            placeholder="What you sell, in a sentence or two."
            value={config.offering}
            onChange={(e) => set({ offering: e.target.value })}
          />
        </div>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={researchCompany}
            disabled={researching}
            style={{
              background: CK.bg,
              border: `1px solid ${CK.line}`,
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: CK.ink,
              cursor: researching ? "default" : "pointer",
            }}
          >
            {researching ? "Researching…" : "Research my company →"}
          </button>
          {researchMsg && <span style={{ fontSize: 12, color: CK.sub }}>{researchMsg}</span>}
        </div>
      </div>

      {((config.products?.length ?? 0) > 0 || (config.personas?.length ?? 0) > 0) && (
        <div style={section}>
          <h2 style={h2}>Catalog &amp; personas</h2>
          <p style={hint}>
            What the agent knows you sell, and who it tailors to — auto-built from
            research. The agent qualifies across all of it.
          </p>
          {(config.products?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={label}>Products / services</span>
              {config.products!.map((p, i) => (
                <div key={i} style={{ fontSize: 13, color: CK.ink, padding: "5px 0", borderBottom: `0.5px solid ${CK.line}` }}>
                  <strong style={{ fontWeight: 600 }}>{p.name}</strong>
                  {p.description ? ` — ${p.description}` : ""}
                  {p.for_who ? <span style={{ color: CK.sub }}> · for {p.for_who}</span> : null}
                </div>
              ))}
            </div>
          )}
          {(config.personas?.length ?? 0) > 0 && (
            <div>
              <span style={label}>Personas it tailors to</span>
              {config.personas!.map((p, i) => (
                <div key={i} style={{ fontSize: 13, color: CK.ink, padding: "5px 0", borderBottom: `0.5px solid ${CK.line}` }}>
                  <strong style={{ fontWeight: 600 }}>{p.role}</strong>
                  {p.pains?.length ? <span style={{ color: CK.sub }}> · pains: {p.pains.join("; ")}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Governance */}
      <div style={section}>
        <h2 style={h2}>Governance — the rubric</h2>
        <p style={hint}>How the agent decides who to work now, nurture, or pass on.</p>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>ICP — who's a good fit</span>
          <textarea
            style={{ ...input, resize: "vertical" }}
            rows={2}
            value={config.governance.icp}
            onChange={(e) => setGov({ icp: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Qualification criteria (one per line)</span>
          <LinesField
            value={config.governance.qualification_criteria}
            onChange={(v) => setGov({ qualification_criteria: v })}
            placeholder={"Decision-making role\nTimeline to go live\n…"}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Disqualifiers (one per line)</span>
          <LinesField
            value={config.governance.disqualifiers ?? []}
            onChange={(v) => setGov({ disqualifiers: v })}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Work-now bar</span>
          <textarea
            style={{ ...input, resize: "vertical" }}
            rows={2}
            placeholder="What must be true to route to sales immediately."
            value={config.governance.work_now_bar}
            onChange={(e) => setGov({ work_now_bar: e.target.value })}
          />
        </div>
        <div>
          <span style={label}>Nurture band</span>
          <textarea
            style={{ ...input, resize: "vertical" }}
            rows={2}
            placeholder="Right profile but not ready — keep warm instead."
            value={config.governance.nurture_band}
            onChange={(e) => setGov({ nurture_band: e.target.value })}
          />
        </div>
      </div>

      {/* Implementation */}
      <div style={section}>
        <h2 style={h2}>Implementation — what happens per outcome</h2>
        <p style={hint}>What the agent does once it decides.</p>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, marginBottom: 12 }}>
          <span style={{ ...label, margin: 0, alignSelf: "center" }}>Work now →</span>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              style={{ ...input, width: 170 }}
              value={config.implementation.work_now.type}
              onChange={(e) =>
                setImpl({
                  work_now: {
                    ...config.implementation.work_now,
                    type: e.target.value as "book_meeting" | "handoff_sales" | "start_trial",
                  },
                })
              }
            >
              <option value="book_meeting">book_meeting</option>
              <option value="handoff_sales">handoff_sales</option>
              <option value="start_trial">start_trial</option>
            </select>
            <input
              style={input}
              placeholder="detail (e.g. booking link)"
              value={config.implementation.work_now.detail ?? ""}
              onChange={(e) =>
                setImpl({ work_now: { ...config.implementation.work_now, detail: e.target.value } })
              }
            />
          </div>
          <span style={{ ...label, margin: 0, alignSelf: "center" }}>Nurture →</span>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              style={{ ...input, width: 170 }}
              value={config.implementation.nurture.type}
              onChange={(e) =>
                setImpl({
                  nurture: {
                    ...config.implementation.nurture,
                    type: e.target.value as "capture_email" | "send_resource" | "add_to_sequence",
                  },
                })
              }
            >
              <option value="capture_email">capture_email</option>
              <option value="send_resource">send_resource</option>
              <option value="add_to_sequence">add_to_sequence</option>
            </select>
            <input
              style={input}
              placeholder="detail"
              value={config.implementation.nurture.detail ?? ""}
              onChange={(e) =>
                setImpl({ nurture: { ...config.implementation.nurture, detail: e.target.value } })
              }
            />
          </div>
        </div>
      </div>

      {/* Resources */}
      <div style={section}>
        <h2 style={h2}>Resource library</h2>
        <p style={hint}>
          Collateral the agent can send. It picks by relevance; it can only send what's here.
        </p>
        {resources.map((r, i) => (
          <div
            key={i}
            style={{
              border: `1px solid ${CK.line}`,
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <input style={input} placeholder="id (e.g. cs-fintech)" value={r.id} onChange={(e) => setResource(i, { id: e.target.value })} />
            <select
              style={input}
              value={r.type}
              onChange={(e) => setResource(i, { type: e.target.value as SdrResource["type"] })}
            >
              {["case_study", "product_doc", "security", "pricing", "guide", "integration", "other"].map(
                (t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ),
              )}
            </select>
            <input style={{ ...input, gridColumn: "1 / span 2" }} placeholder="title" value={r.title} onChange={(e) => setResource(i, { title: e.target.value })} />
            <input style={{ ...input, gridColumn: "1 / span 2" }} placeholder="url" value={r.url} onChange={(e) => setResource(i, { url: e.target.value })} />
            <input style={{ ...input, gridColumn: "1 / span 2" }} placeholder="summary" value={r.summary} onChange={(e) => setResource(i, { summary: e.target.value })} />
            <input
              style={{ ...input, gridColumn: "1 / span 2" }}
              placeholder="relevant for (comma-separated: fintech, security, …)"
              value={(r.relevant_for ?? []).join(", ")}
              onChange={(e) =>
                setResource(i, {
                  relevant_for: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
            <button
              onClick={() => removeResource(i)}
              style={{
                gridColumn: "1 / span 2",
                justifySelf: "start",
                background: "none",
                border: "none",
                color: "#b4453a",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={addResource}
          style={{
            background: CK.bg,
            border: `1px solid ${CK.line}`,
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            color: CK.ink,
            cursor: "pointer",
          }}
        >
          + Add resource
        </button>
      </div>

      {/* Product knowledge + voice */}
      <div style={section}>
        <h2 style={h2}>Product knowledge & voice</h2>
        <p style={hint}>Facts the agent may state (and nothing beyond), plus tone.</p>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Knowledge (one fact per line)</span>
          <LinesField value={config.knowledge ?? []} onChange={(v) => set({ knowledge: v })} />
        </div>
        <div>
          <span style={label}>Voice</span>
          <input
            style={input}
            placeholder="warm, sharp, consultative"
            value={config.voice ?? ""}
            onChange={(e) => set({ voice: e.target.value })}
          />
        </div>
      </div>

      {/* Embed — drop the agent on your site */}
      {widgetKey && (
        <div style={section}>
          <h2 style={h2}>Embed on your site</h2>
          <p style={hint}>
            Save your config, then paste this where you want the chat to appear.{" "}
            <a
              href={`/sdr/widget/${widgetKey}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#3b6ea5" }}
            >
              Preview it →
            </a>
          </p>
          {(() => {
            const origin =
              typeof window !== "undefined" ? window.location.origin : "https://mallin.io";
            const snippet = `<iframe src="${origin}/sdr/widget/${widgetKey}" width="400" height="600" style="border:0;border-radius:12px"></iframe>`;
            return (
              <div>
                <pre
                  style={{
                    ...input,
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    color: CK.ink,
                    margin: 0,
                  }}
                >
                  {snippet}
                </pre>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(snippet)}
                  style={{
                    marginTop: 8,
                    background: CK.bg,
                    border: `1px solid ${CK.line}`,
                    borderRadius: 8,
                    padding: "7px 13px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: CK.ink,
                    cursor: "pointer",
                  }}
                >
                  Copy snippet
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
        <button
          onClick={save}
          disabled={status === "saving"}
          style={{
            background: CK.accent,
            color: CK.bg,
            border: "none",
            borderRadius: 8,
            padding: "11px 22px",
            fontSize: 14,
            fontWeight: 600,
            cursor: status === "saving" ? "default" : "pointer",
            opacity: status === "saving" ? 0.6 : 1,
          }}
        >
          {status === "saving" ? "Saving…" : "Save configuration"}
        </button>
        {message && (
          <span style={{ fontSize: 13, color: status === "error" ? "#b4453a" : "#2f7a4f" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
