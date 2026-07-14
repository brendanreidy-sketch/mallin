/**
 * Tiny markdown-backed blog loader.
 *
 * Posts live in /content/posts/<slug>.md with YAML frontmatter:
 *
 *   ---
 *   title: "Operating layer, not assistant"
 *   date: "2026-05-20"
 *   excerpt: "One-line teaser shown on the index."
 *   author: "Mallín"
 *   ---
 *
 *   Body in markdown.
 *
 * All file IO happens server-side at build / request time. Pages
 * under app/blog/ call these helpers in server components.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const POSTS_DIR = join(process.cwd(), "content", "posts");

export interface PostMeta {
  slug: string;
  title: string;
  date: string;      // ISO yyyy-mm-dd
  excerpt: string;
  author: string;
  readingMinutes: number;
}

export interface Post extends PostMeta {
  html: string;
}

function listSlugs(): string[] {
  try {
    return readdirSync(POSTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

function loadRaw(slug: string): { data: Record<string, unknown>; content: string } {
  const file = join(POSTS_DIR, `${slug}.md`);
  const raw = readFileSync(file, "utf-8");
  return matter(raw);
}

function readingMinutes(text: string): number {
  // ~225 wpm for long-form, rounded up to nearest minute, min 1.
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 225));
}

function pickMeta(slug: string, data: Record<string, unknown>, content: string): PostMeta {
  return {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    excerpt: String(data.excerpt ?? ""),
    author: String(data.author ?? "Mallín"),
    readingMinutes: readingMinutes(content),
  };
}

/** All posts, newest first. Returns lightweight metadata only. */
export function listPosts(): PostMeta[] {
  const slugs = listSlugs();
  const metas = slugs.map((slug) => {
    const { data, content } = loadRaw(slug);
    return pickMeta(slug, data, content);
  });
  // Newest first by ISO date string.
  metas.sort((a, b) => (a.date < b.date ? 1 : -1));
  return metas;
}

/** A single post with rendered HTML body. Returns null if not found. */
export function getPost(slug: string): Post | null {
  try {
    const { data, content } = loadRaw(slug);
    const meta = pickMeta(slug, data, content);
    const html = marked.parse(content, { async: false }) as string;
    return { ...meta, html };
  } catch {
    return null;
  }
}

/** For generateStaticParams in app/blog/[slug]/page.tsx. */
export function allSlugs(): string[] {
  return listSlugs();
}

/** Human-readable date — May 20, 2026. */
export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
