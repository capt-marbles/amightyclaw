import { v4 as uuid } from 'uuid';
import { getDatabase } from './database.js';

export interface SocialPost {
  id: string;
  platform: 'twitter' | 'reddit';
  externalId: string;
  author: string;
  content: string;
  url: string;
  subreddit?: string;
  title?: string;
  score: number;
  replyCount: number;
  repostCount: number;
  postType: 'tweet' | 'article' | 'thread';
  sourceQuery: string;
  postedAt: string;
  ingestedAt: string;
}

interface SocialPostInput {
  platform: 'twitter' | 'reddit';
  externalId: string;
  author?: string;
  content: string;
  url?: string;
  subreddit?: string;
  title?: string;
  score?: number;
  replyCount?: number;
  repostCount?: number;
  postType?: 'tweet' | 'article' | 'thread';
  sourceQuery?: string;
  postedAt: string;
}

export class SocialPostStore {
  upsert(post: SocialPostInput): SocialPost {
    const db = getDatabase();
    const id = uuid();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT OR IGNORE INTO social_posts
       (id, platform, external_id, author, content, url, subreddit, title, score, reply_count, repost_count, post_type, source_query, posted_at, ingested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      post.platform,
      post.externalId,
      post.author || '',
      post.content,
      post.url || '',
      post.subreddit || null,
      post.title || null,
      post.score || 0,
      post.replyCount || 0,
      post.repostCount || 0,
      post.postType || 'tweet',
      post.sourceQuery || '',
      post.postedAt,
      now
    );

    return {
      id,
      platform: post.platform,
      externalId: post.externalId,
      author: post.author || '',
      content: post.content,
      url: post.url || '',
      subreddit: post.subreddit,
      title: post.title,
      score: post.score || 0,
      replyCount: post.replyCount || 0,
      repostCount: post.repostCount || 0,
      postType: post.postType || 'tweet',
      sourceQuery: post.sourceQuery || '',
      postedAt: post.postedAt,
      ingestedAt: now,
    };
  }

  upsertMany(posts: SocialPostInput[]): number {
    const db = getDatabase();
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO social_posts
       (id, platform, external_id, author, content, url, subreddit, title, score, reply_count, repost_count, post_type, source_query, posted_at, ingested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const now = new Date().toISOString();
    let inserted = 0;

    const tx = db.transaction(() => {
      for (const post of posts) {
        const result = stmt.run(
          uuid(),
          post.platform,
          post.externalId,
          post.author || '',
          post.content,
          post.url || '',
          post.subreddit || null,
          post.title || null,
          post.score || 0,
          post.replyCount || 0,
          post.repostCount || 0,
          post.postType || 'tweet',
          post.sourceQuery || '',
          post.postedAt,
          now
        );
        if (result.changes > 0) inserted++;
      }
    });

    tx();
    return inserted;
  }

  search(query: string, opts: { platform?: string; limit?: number } = {}): SocialPost[] {
    const words = query.replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 1);
    if (words.length === 0) return [];

    const ftsQuery = words.map((w) => `"${w}"`).join(' OR ');
    const db = getDatabase();

    let sql = `SELECT sp.* FROM social_posts sp
               JOIN social_posts_fts fts ON sp.rowid = fts.rowid
               WHERE social_posts_fts MATCH ?`;
    const params: (string | number)[] = [ftsQuery];

    if (opts.platform) {
      sql += ' AND sp.platform = ?';
      params.push(opts.platform);
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(opts.limit || 20);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(this.mapRow);
  }

  getRecent(opts: {
    platform?: string;
    author?: string;
    subreddit?: string;
    sourceQuery?: string;
    limit?: number;
  } = {}): SocialPost[] {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts.platform) {
      conditions.push('platform = ?');
      params.push(opts.platform);
    }
    if (opts.author) {
      conditions.push('author = ?');
      params.push(opts.author);
    }
    if (opts.subreddit) {
      conditions.push('subreddit = ?');
      params.push(opts.subreddit);
    }
    if (opts.sourceQuery) {
      conditions.push('source_query = ?');
      params.push(opts.sourceQuery);
    }

    let sql = 'SELECT * FROM social_posts';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY posted_at DESC LIMIT ?';
    params.push(opts.limit || 50);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(this.mapRow);
  }

  count(platform?: string): number {
    const db = getDatabase();
    if (platform) {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM social_posts WHERE platform = ?').get(platform) as { cnt: number };
      return row.cnt;
    }
    const row = db.prepare('SELECT COUNT(*) as cnt FROM social_posts').get() as { cnt: number };
    return row.cnt;
  }

  existsByExternalId(platform: string, externalId: string): boolean {
    const db = getDatabase();
    const row = db.prepare('SELECT 1 FROM social_posts WHERE platform = ? AND external_id = ? LIMIT 1').get(platform, externalId);
    return !!row;
  }

  private mapRow(r: Record<string, unknown>): SocialPost {
    return {
      id: r.id as string,
      platform: r.platform as 'twitter' | 'reddit',
      externalId: r.external_id as string,
      author: r.author as string,
      content: r.content as string,
      url: r.url as string,
      subreddit: r.subreddit as string | undefined,
      title: r.title as string | undefined,
      score: r.score as number,
      replyCount: r.reply_count as number,
      repostCount: r.repost_count as number,
      postType: (r.post_type as 'tweet' | 'article' | 'thread') || 'tweet',
      sourceQuery: r.source_query as string,
      postedAt: r.posted_at as string,
      ingestedAt: r.ingested_at as string,
    };
  }
}
