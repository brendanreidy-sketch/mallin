/**
 * ============================================================================
 *  Weekly blog-post generator — autonomous thought-leadership essay
 * ============================================================================
 *
 *  Drafts ONE original thought-leadership essay in Mallin's voice, runs a
 *  self-critique/polish pass against the marketing-voice guardrails, and
 *  writes it to content/posts/<slug>.md (the dir lib/blog.ts reads).
 *
 *  Designed to run unattended from .github/workflows/weekly-blog.yml, which
 *  commits the new file to main → Vercel auto-deploys. Also runnable locally
 *  for testing:  npx tsx --env-file=.env.local scripts/blog/generate-weekly-post.ts
 *
 *  Flags:
 *    --dry-run   Generate + print to stdout, do NOT write a file.
 *
 *  Env:
 *    ANTHROPIC_API_KEY   (required)
 *    BLOG_MODEL          (optional, default claude-opus-4-7)
 *    BLOG_AUTHOR         (optional, default "Mallín")
 *
 *  Sourcing: the draft pass runs the web_search tool so any data claim is
 *  grounded in a source it actually retrieved and cited inline (a real URL from
 *  the search results — never invented). See the SOURCING block in BRAND_SYSTEM.
 *
 *  Quality gate: because posts auto-publish with no human in the loop, the
 *  generator does TWO model passes — a research+draft pass (with web_search),
 *  then an adversarial editor pass that rewrites against Mallin's voice rules
 *  (concrete, operational, no AI-magic language, no clichés, every claim earns
 *  its place) AND verifies citations: it prunes any uncited data claim and never
 *  adds a citation of its own (it can't verify one).
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const POSTS_DIR = join(process.cwd(), "content", "posts");
const MODEL = process.env.BLOG_MODEL || "claude-opus-4-7";
const AUTHOR = process.env.BLOG_AUTHOR || "Mallín";
const DRY_RUN = process.argv.includes("--dry-run");

// Real-source research for the draft pass. Every data claim in the post must be
// grounded in a source the model actually retrieved here and cited inline.
// web_search_20260209 pairs with the default opus-4-7 model.
const WEB_SEARCH_TOOL: Anthropic.Messages.WebSearchTool20260209 = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 6,
};

// ── Mallin voice + identity (encodes the marketing_voice_rule guardrails) ──
const BRAND_SYSTEM = `You are the writer for the Mallin engineering/strategy blog.

WHAT MALLIN IS:
Mallin is the governed AI operating layer for revenue execution. Not a chatbot,
not a RevOps dashboard, not a sales coach, not an "AI workspace." It reads across
a rep's calls, email, Slack, calendar and CRM, forms structured judgment (the
pre-call brief / cockpit), and writes back into the customer's CRM under the
customer's own governance. The category bet: in-flight execution judgment — the
load-bearing contradiction that changes the rep's NEXT action — not after-the-fact
analytics. It gives one rep the reach of an entire sales org (deal desk,
enablement, research analyst, the experienced sales leader's pattern instinct).

VOICE — non-negotiable:
- Concrete, operational, evidence-oriented, accountable. Write like an operator
  who has actually run deals, not a vendor.
- Every paragraph must change how the reader thinks or acts. If a line doesn't,
  cut it.
- Strong, specific claims. Name the failure mode. Show the mechanism.
- BANNED: "AI magic" / vague AI hype, "platform for the future" fluff, "unlock /
  supercharge / revolutionize / leverage synergies," empty thought-leadership
  throat-clearing, clichés ("smoking gun," "litmus test," "north star," "at the
  end of the day," "in today's fast-paced world"), fake statistics, invented
  customer quotes, and made-up numbers presented as fact.
- No fabricated case studies or named customers. Reason from mechanism and
  principle, use hypotheticals clearly framed as hypotheticals.
- American English. Tight. ~750–1100 words.

SOURCING — show your work, never fake it:
- Ground the piece in REAL, current sources. Use the web_search tool to find
  them BEFORE you write. Prefer primary sources (research reports, company
  filings, first-party benchmarks, the original author) over aggregators.
- Any statistic, dataset finding, dollar figure, named study, market trend, or
  external factual claim MUST carry an inline citation: a Markdown link, on the
  phrase it supports, to the real source URL you actually retrieved via
  web_search. e.g. "AI companies run [50–60% gross margins](https://real-url)".
- ONLY cite URLs that appeared in your web_search results. NEVER invent a URL, a
  statistic, a study, a quote, or a publication, and never attach a real URL to a
  number it doesn't actually support. If you can't find real support for a claim,
  cut the claim or make the point qualitatively. A fabricated citation is the
  worst thing you can publish — it is disqualifying.
- Quote sources accurately and attribute them by name.
- A pure-principle paragraph needs no citation; a paragraph leaning on data does.
  When in doubt, cite. Aim for at least two real, cited sources when the topic
  admits data.

FORMAT:
- Markdown body. Open with a sharp, specific hook (no "In this post we'll...").
- 2–4 "##" subheads. Use **bold** for the load-bearing phrase in a paragraph,
  sparingly. Short paragraphs. The occasional one-sentence paragraph for emphasis.
- No H1 in the body (the title renders separately). No author byline in the body.
- End on a crisp, earned takeaway — not a salesy CTA.`;

interface Draft {
  title: string;
  excerpt: string;
  slug: string;
  body_markdown: string;
}

function existingPosts(): { title: string; excerpt: string; slug: string }[] {
  try {
    return readdirSync(POSTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const raw = readFileSync(join(POSTS_DIR, f), "utf-8");
        const title = raw.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1] ?? f;
        const excerpt = raw.match(/^excerpt:\s*"?(.+?)"?\s*$/m)?.[1] ?? "";
        return { title, excerpt, slug: f.replace(/\.md$/, "") };
      });
  } catch {
    return [];
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function extractJson(text: string): Draft {
  // Tolerate fenced code blocks or leading prose around the JSON object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate) as Draft;
}

/** Run one turn with the web_search server tool enabled, resuming through any
 *  server-tool pause, and return the model's final text output. */
async function runWithWebSearch(
  client: Anthropic,
  system: string,
  userContent: string,
): Promise<string> {
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userContent },
  ];
  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system,
      tools: [WEB_SEARCH_TOOL],
      messages,
    });
    if (res.stop_reason === "pause_turn") {
      // Server-tool loop paused mid-search — echo the turn back to resume it.
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    return res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
  }
  throw new Error("web_search did not converge after resuming");
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY not set.");
    process.exit(1);
  }
  const client = new Anthropic();
  const prior = existingPosts();
  const priorList = prior.length
    ? prior.map((p) => `- "${p.title}" — ${p.excerpt}`).join("\n")
    : "(none yet)";

  // ── Pass 1: research + draft (web_search) ─────────────────────────────────
  console.error(`→ Pass 1 (research + draft, web_search) · model ${MODEL}`);
  const draftText = await runWithWebSearch(
    client,
    BRAND_SYSTEM,
    `Write this week's thought-leadership essay for the Mallin blog.

Pick ONE sharp angle we have NOT already covered. Existing posts (do not repeat their thesis):
${priorList}

Good territory to mine (pick one, go deep, don't list them all): the difference
between insight and acted-on judgment; why "the chat eats the product" is the
default failure mode of AI tools; governed write-back vs. autonomous write; how a
solo rep can carry the reach of a whole sales org; institutional memory as a moat;
why pre-call anxiety (not dopamine) is the dependency mechanism that earns trust;
detecting the contradiction that decides a deal before the rep sees it; never-auto
fields as a trust primitive. Or a fresh angle of your own that fits the identity.

FIRST research the angle with the web_search tool: pull real, current sources
(reports, benchmarks, filings, credible operators) and let what you find sharpen
the argument. Then write the essay, following the SOURCING rules exactly — every
data claim carries an inline Markdown link to a real URL you retrieved, and you
invent nothing. When you're done searching, output ONLY the JSON object below,
with the citations already embedded as Markdown links inside body_markdown.

Return ONLY a JSON object, no prose around it:
{
  "title": "specific, non-generic, no colon-subtitle cliché",
  "excerpt": "one or two sentences, the teaser shown on the index",
  "slug": "kebab-case-from-title",
  "body_markdown": "the full essay in markdown, per the format + sourcing rules"
}`,
  );
  const draft = extractJson(draftText);

  // ── Pass 2: adversarial editor / polish ───────────────────────────────────
  console.error(`→ Pass 2 (editor polish)`);
  const editMsg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: BRAND_SYSTEM,
    messages: [
      {
        role: "user",
        content: `You are the ruthless editor. Here is a draft post (JSON). Rewrite it so it
fully clears Mallin's voice rules: cut every sentence that doesn't change how the
reader thinks or acts; kill any banned phrase, cliché, hype word, or fabricated
fact; sharpen the hook and the closing line; make every claim earn its place.
Keep it ~750–1100 words. Do NOT make it blander — make it sharper and more
concrete.

CITATIONS — enforce, don't author:
- Every statistic, dollar figure, named study, or external factual claim must
  keep an inline Markdown link to its source. If a data claim has no link, either
  cut it or soften it to principle. Do not let an uncited number survive.
- You have NO way to verify a URL, so NEVER add a citation, URL, statistic, or
  named source the draft didn't already contain. You may only keep or remove what
  the research pass grounded. A link that looks malformed or invented — delete
  the claim rather than guess at a source.

Return ONLY the corrected JSON object in the same shape.

DRAFT:
${JSON.stringify(draft)}`,
      },
    ],
  });
  const editText = editMsg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const final = extractJson(editText);

  // ── Assemble + write ──────────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10); // yyyy-mm-dd (UTC)
  let slug = slugify(final.slug || final.title);
  if (!slug) slug = `essay-${date}`;
  let filename = `${slug}.md`;
  if (existsSync(join(POSTS_DIR, filename))) filename = `${slug}-${date}.md`;

  const esc = (s: string) => s.replace(/"/g, '\\"').trim();
  const frontmatter = [
    "---",
    `title: "${esc(final.title)}"`,
    `date: "${date}"`,
    `excerpt: "${esc(final.excerpt)}"`,
    `author: "${AUTHOR}"`,
    "---",
    "",
  ].join("\n");
  const fileBody = frontmatter + final.body_markdown.trim() + "\n";

  if (DRY_RUN) {
    console.error(`\n— DRY RUN — would write content/posts/${filename}\n`);
    console.log(fileBody);
    return;
  }

  writeFileSync(join(POSTS_DIR, filename), fileBody, "utf-8");
  console.error(`\n✓ Wrote content/posts/${filename}`);
  console.error(`  title: ${final.title}`);
  // Emit the path on stdout so CI can decide whether anything changed.
  console.log(`content/posts/${filename}`);
}

main().catch((err) => {
  console.error("\n✗ Blog generation failed:", err?.message || err);
  process.exit(1);
});
