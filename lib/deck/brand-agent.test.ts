import { describe, it, expect } from "vitest";
import { normalizeToHex, extractBrandCandidates } from "./brand-agent";

describe("normalizeToHex", () => {
  it("normalizes hex, short hex, and rgb() to #rrggbb", () => {
    expect(normalizeToHex("#E6FF00")).toBe("#e6ff00");
    expect(normalizeToHex("#fff")).toBe("#ffffff");
    expect(normalizeToHex("rgb(230, 255, 0)")).toBe("#e6ff00");
    expect(normalizeToHex("rgba(230,255,0,0.5)")).toBe("#e6ff00");
    expect(normalizeToHex("not-a-color")).toBeNull();
  });
});

describe("extractBrandCandidates", () => {
  const html = `
    <head>
      <title>Northwind — Liquidity Performance</title>
      <meta name="theme-color" content="#0b0b0b">
      <link rel="apple-touch-icon" href="/apple.png">
      <meta property="og:image" content="https://northwind.com/og.png">
    </head>
    <header><a class="logo"><img src="/logo.svg"></a></header>
    <a class="cta" style="background:#E6FF00;color:#111">Get a demo</a>
    <footer style="background:#0b0b0b"></footer>`;
  const css = `.cta{background-color:rgb(230,255,0)} .cta:hover{background:#e6ff00} body{color:#333}`;

  it("surfaces the vivid brand accent (#e6ff00) ahead of chrome colors", () => {
    const c = extractBrandCandidates(html, css, "northwind.com");
    const lime = c.colors.find((x) => x.hex === "#e6ff00");
    expect(lime).toBeTruthy();
    expect(lime!.vivid).toBe(true);
    // vivid-first ranking: the lime should sort ahead of the dark/gray chrome
    const limeIdx = c.colors.findIndex((x) => x.hex === "#e6ff00");
    const darkIdx = c.colors.findIndex((x) => x.hex === "#0b0b0b");
    expect(limeIdx).toBeLessThan(darkIdx);
  });

  it("collects theme color, logo candidates, and title", () => {
    const c = extractBrandCandidates(html, css, "northwind.com");
    expect(c.themeColors).toContain("#0b0b0b");
    expect(c.logos).toContain("https://northwind.com/apple.png");
    expect(c.logos).toContain("https://northwind.com/logo.svg");
    expect(c.title).toContain("Northwind");
  });

  it("does not flag near-black/gray as vivid", () => {
    const c = extractBrandCandidates(html, css, "northwind.com");
    expect(c.colors.find((x) => x.hex === "#0b0b0b")?.vivid).toBe(false);
    expect(c.colors.find((x) => x.hex === "#333333")?.vivid).toBe(false);
  });
});
