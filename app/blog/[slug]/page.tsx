/**
 * /blog/[slug] — individual post page. Renders the markdown body
 * to HTML server-side via the shared loader in lib/blog.ts.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogChrome } from "../BlogChrome";
import { getPost, allSlugs, formatDate } from "@/lib/blog";
import styles from "../blog.module.css";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Mallín — Blog" };
  return {
    title: `Mallín — ${post.title}`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <BlogChrome>
      <header className={styles.postHeader}>
        <p className={styles.postEyebrow}>— Notes from Mallín</p>
        <h1 className={styles.postTitle}>{post.title}</h1>
        <div className={styles.postMeta}>
          <span>{formatDate(post.date)}</span>
          <span className={styles.sep}>·</span>
          <span>{post.author}</span>
          <span className={styles.sep}>·</span>
          <span>{post.readingMinutes} min read</span>
        </div>
      </header>

      <article
        className={styles.prose}
        dangerouslySetInnerHTML={{ __html: post.html }}
      />

      <div className={styles.postFooter}>
        <span className={styles.byline}>
          — <strong>{post.author}</strong>, {formatDate(post.date)}
        </span>
        <a className={styles.backLink} href="/blog">
          ← All posts
        </a>
      </div>
    </BlogChrome>
  );
}
