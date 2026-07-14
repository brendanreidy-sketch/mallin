/**
 * /blog — index page listing every post in content/posts/, newest first.
 */

import type { Metadata } from "next";
import { BlogChrome } from "./BlogChrome";
import { listPosts, formatDate } from "@/lib/blog";
import styles from "./blog.module.css";

export const metadata: Metadata = {
  title: "Mallín — Blog",
  description:
    "Notes from Mallín. Thinking about the operating layer of the revenue organization — product doctrine, build-in-public, design-partner field notes.",
};

export default function BlogIndexPage() {
  const posts = listPosts();
  return (
    <BlogChrome>
      <p className={styles.indexEyebrow}>— Notes from Mallín</p>
      <h1 className={styles.indexH1}>
        Building the <em>operating layer</em> for revenue, in public.
      </h1>
      <p className={styles.indexLede}>
        Product doctrine, architectural decisions, design-partner field
        notes. Mostly about why the things we ship look the way they
        do, and what we&apos;ve gotten wrong along the way.
      </p>

      {posts.length === 0 ? (
        <p className={styles.empty}>No posts yet. Check back soon.</p>
      ) : (
        <ul className={styles.postList}>
          {posts.map((p) => (
            <li key={p.slug} className={styles.postListItem}>
              <a href={`/blog/${p.slug}`} style={{ display: "block" }}>
                <div className={styles.postListMeta}>
                  <span>{formatDate(p.date)}</span>
                  <span className={styles.sep}>·</span>
                  <span>{p.readingMinutes} min read</span>
                </div>
                <h2 className={styles.postListTitle}>{p.title}</h2>
                {p.excerpt && (
                  <p className={styles.postListExcerpt}>{p.excerpt}</p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </BlogChrome>
  );
}
