import { tool } from 'ai';
import { z } from 'zod';
import type { AppConfig } from '@amightyclaw/core';
import type { SocialPostStore } from '@amightyclaw/memory';

// ─── PhantomBuster Helper ───────────────────────────────────────────────────

interface PBResult {
  status: string;
  output?: unknown;
}

async function launchPhantomAndWait(
  apiKey: string,
  agentId: string,
  args: Record<string, unknown>,
  timeoutMs = 120_000
): Promise<unknown> {
  // Launch the agent
  const launchRes = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
    method: 'POST',
    headers: {
      'X-Phantombuster-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: agentId, argument: JSON.stringify(args) }),
  });

  if (!launchRes.ok) {
    const text = await launchRes.text();
    throw new Error(`PhantomBuster launch failed (HTTP ${launchRes.status}): ${text}`);
  }

  const { containerId } = (await launchRes.json()) as { containerId: string };

  // Poll for results
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(
      `https://api.phantombuster.com/api/v2/agents/fetch-output?id=${agentId}&containerId=${containerId}`,
      { headers: { 'X-Phantombuster-Key': apiKey } }
    );

    if (!statusRes.ok) continue;

    const data = (await statusRes.json()) as PBResult;
    if (data.status === 'finished') {
      return data.output;
    }
    if (data.status === 'error') {
      throw new Error('PhantomBuster agent finished with an error');
    }
  }

  throw new Error(`PhantomBuster agent timed out after ${timeoutMs / 1000}s`);
}

// ─── Reddit Helper ──────────────────────────────────────────────────────────

interface RedditChild {
  data: {
    id: string;
    author: string;
    selftext?: string;
    body?: string;
    title?: string;
    permalink: string;
    subreddit: string;
    score: number;
    num_comments?: number;
    created_utc: number;
  };
}

async function fetchRedditSearch(
  query: string,
  subreddit?: string,
  sort = 'relevance',
  limit = 25
): Promise<RedditChild[]> {
  const base = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`
    : 'https://www.reddit.com/search.json';

  const params = new URLSearchParams({
    q: query,
    sort,
    limit: String(Math.min(limit, 100)),
    restrict_sr: subreddit ? 'true' : 'false',
    type: 'link',
  });

  const res = await fetch(`${base}?${params}`, {
    headers: { 'User-Agent': 'amightyclaw/1.0' },
  });

  if (res.status === 429) {
    throw new Error('Reddit rate limit reached. Try again in a minute.');
  }
  if (!res.ok) {
    throw new Error(`Reddit search failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { data?: { children?: RedditChild[] } };
  return json.data?.children || [];
}

function redditChildToPost(child: RedditChild, sourceQuery: string) {
  const d = child.data;
  return {
    platform: 'reddit' as const,
    externalId: d.id,
    author: d.author || '[deleted]',
    content: d.selftext || d.body || '',
    url: `https://www.reddit.com${d.permalink}`,
    subreddit: d.subreddit,
    title: d.title,
    score: d.score || 0,
    replyCount: d.num_comments || 0,
    repostCount: 0,
    sourceQuery,
    postedAt: new Date(d.created_utc * 1000).toISOString(),
  };
}

// ─── X Post Type Detection ──────────────────────────────────────────────────

function detectPostType(t: Record<string, unknown>): 'tweet' | 'article' | 'thread' {
  // Check for article indicators from PhantomBuster output
  if (
    t.type === 'article' ||
    t.noteText ||
    t.articleBody ||
    t.articleTitle ||
    (typeof t.tweetUrl === 'string' && t.tweetUrl.includes('/articles/'))
  ) {
    return 'article';
  }
  // Thread detection: if it's part of a conversation thread
  if (t.isThread || t.threadLength || (typeof t.conversationCount === 'number' && t.conversationCount > 1)) {
    return 'thread';
  }
  return 'tweet';
}

function extractContent(t: Record<string, unknown>): string {
  // Prefer article/note body over short tweet text
  return String(t.articleBody || t.noteText || t.text || t.tweetText || '');
}

function extractTitle(t: Record<string, unknown>): string | undefined {
  const title = t.articleTitle || t.noteTitle || t.title;
  return title ? String(title) : undefined;
}

// ─── Tool Factory ───────────────────────────────────────────────────────────

export function createSocialIntelTools(store: SocialPostStore, config: AppConfig) {
  // ── X/Twitter Tools ─────────────────────────────────────────────────────

  const xTrackAccount = tool({
    description:
      'Fetch recent tweets from a specific X/Twitter account using PhantomBuster. Ingests them into the database for later querying.',
    parameters: z.object({
      handle: z.string().describe('X/Twitter handle (with or without @)'),
      count: z.number().min(1).max(100).optional().default(20).describe('Number of tweets to fetch'),
    }),
    execute: async ({ handle, count }) => {
      const pb = config.phantomBuster;
      if (!pb?.apiKey || !pb.tweetExtractorAgentId) {
        return 'PhantomBuster Tweet Extractor is not configured.';
      }

      try {
        const cleanHandle = handle.replace(/^@/, '');
        const output = await launchPhantomAndWait(pb.apiKey, pb.tweetExtractorAgentId, {
          twitterHandle: cleanHandle,
          numberOfTweets: count,
        });

        const tweets = Array.isArray(output) ? output : [];
        if (tweets.length === 0) return `No tweets found for @${cleanHandle}.`;

        const posts = tweets.map((t: Record<string, unknown>) => {
          const postType = detectPostType(t);
          return {
            platform: 'twitter' as const,
            externalId: String(t.tweetId || t.id || ''),
            author: cleanHandle,
            content: extractContent(t),
            title: extractTitle(t),
            url: String(t.tweetUrl || t.url || ''),
            score: Number(t.likeCount || 0),
            replyCount: Number(t.replyCount || 0),
            repostCount: Number(t.retweetCount || 0),
            postType,
            sourceQuery: `account:${cleanHandle}`,
            postedAt: t.timestamp ? new Date(t.timestamp as string).toISOString() : new Date().toISOString(),
          };
        });

        const inserted = store.upsertMany(posts);
        const articles = posts.filter((p) => p.postType === 'article').length;
        const top = posts.slice(0, 5);
        const summary = top
          .map((p, i) => `${i + 1}. [${p.postType}] @${p.author}: ${(p.title || p.content).slice(0, 120)}${(p.title || p.content).length > 120 ? '...' : ''}`)
          .join('\n');

        return `Fetched ${tweets.length} posts from @${cleanHandle} (${inserted} new, ${articles} articles).\n\nTop results:\n${summary}`;
      } catch (e) {
        return `Failed to fetch tweets: ${(e as Error).message}`;
      }
    },
  });

  const xSearchKeywords = tool({
    description:
      'Search X/Twitter for tweets matching keywords using PhantomBuster. Ingests results into the database.',
    parameters: z.object({
      keywords: z.string().describe('Search keywords or phrase'),
      count: z.number().min(1).max(100).optional().default(20).describe('Number of results to fetch'),
    }),
    execute: async ({ keywords, count }) => {
      const pb = config.phantomBuster;
      if (!pb?.apiKey || !pb.searchExportAgentId) {
        return 'PhantomBuster Search Export is not configured.';
      }

      try {
        const output = await launchPhantomAndWait(pb.apiKey, pb.searchExportAgentId, {
          searchTerms: keywords,
          numberOfTweets: count,
        });

        const tweets = Array.isArray(output) ? output : [];
        if (tweets.length === 0) return `No tweets found for "${keywords}".`;

        const posts = tweets.map((t: Record<string, unknown>) => {
          const postType = detectPostType(t);
          return {
            platform: 'twitter' as const,
            externalId: String(t.tweetId || t.id || ''),
            author: String(t.handle || t.username || ''),
            content: extractContent(t),
            title: extractTitle(t),
            url: String(t.tweetUrl || t.url || ''),
            score: Number(t.likeCount || 0),
            replyCount: Number(t.replyCount || 0),
            repostCount: Number(t.retweetCount || 0),
            postType,
            sourceQuery: `search:${keywords}`,
            postedAt: t.timestamp ? new Date(t.timestamp as string).toISOString() : new Date().toISOString(),
          };
        });

        const inserted = store.upsertMany(posts);
        const articles = posts.filter((p) => p.postType === 'article').length;
        const top = posts.slice(0, 5);
        const summary = top
          .map((p, i) => `${i + 1}. [${p.postType}] @${p.author}: ${(p.title || p.content).slice(0, 120)}${(p.title || p.content).length > 120 ? '...' : ''}`)
          .join('\n');

        return `Found ${tweets.length} posts for "${keywords}" (${inserted} new, ${articles} articles).\n\nTop results:\n${summary}`;
      } catch (e) {
        return `Failed to search tweets: ${(e as Error).message}`;
      }
    },
  });

  const queryTweets = tool({
    description:
      'Search previously ingested tweets using full-text search. Use this to find tweets already collected by xTrackAccount or xSearchKeywords.',
    parameters: z.object({
      query: z.string().describe('Search query'),
      author: z.string().optional().describe('Filter by author handle'),
      limit: z.number().min(1).max(50).optional().default(10).describe('Max results'),
    }),
    execute: async ({ query, author, limit }) => {
      try {
        let results;
        if (author) {
          results = store.getRecent({ platform: 'twitter', author: author.replace(/^@/, ''), limit });
          // Further filter by query text if provided
          if (query) {
            const lower = query.toLowerCase();
            results = results.filter(
              (p) => p.content.toLowerCase().includes(lower) || (p.title || '').toLowerCase().includes(lower)
            );
          }
        } else {
          results = store.search(query, { platform: 'twitter', limit });
        }

        if (results.length === 0) return 'No matching tweets found in the database.';

        return results
          .map(
            (p, i) =>
              `${i + 1}. [${p.postType}] @${p.author} (${p.postedAt.slice(0, 10)}): ${(p.title || p.content).slice(0, 150)}${(p.title || p.content).length > 150 ? '...' : ''}\n   ${p.url}`
          )
          .join('\n');
      } catch (e) {
        return `Query failed: ${(e as Error).message}`;
      }
    },
  });

  // ── Reddit Tools ────────────────────────────────────────────────────────

  const redditSearch = tool({
    description:
      'Search Reddit for posts matching a query. Optionally restrict to a specific subreddit. Results are ingested into the database for later querying.',
    parameters: z.object({
      query: z.string().describe('Search query'),
      subreddit: z.string().optional().describe('Restrict to a specific subreddit (without r/)'),
      sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional().default('relevance').describe('Sort order'),
      limit: z.number().min(1).max(100).optional().default(25).describe('Max results'),
    }),
    execute: async ({ query, subreddit, sort, limit }) => {
      try {
        const children = await fetchRedditSearch(query, subreddit, sort, limit);
        if (children.length === 0) return `No Reddit posts found for "${query}".`;

        const posts = children.map((c) => redditChildToPost(c, query));
        const inserted = store.upsertMany(posts);

        const top = posts.slice(0, 5);
        const summary = top
          .map(
            (p, i) =>
              `${i + 1}. r/${p.subreddit} — **${(p.title || '').slice(0, 80)}** (score: ${p.score}, ${p.replyCount} comments)\n   by u/${p.author} — ${p.url}`
          )
          .join('\n');

        return `Found ${children.length} Reddit posts for "${query}" (${inserted} new).\n\n${summary}`;
      } catch (e) {
        return `Reddit search failed: ${(e as Error).message}`;
      }
    },
  });

  const redditMonitor = tool({
    description:
      'Check a subreddit for NEW posts matching keywords (only returns posts not already in the database). Designed to pair with setReminder for recurring monitoring.',
    parameters: z.object({
      subreddit: z.string().describe('Subreddit to monitor (without r/)'),
      keywords: z.string().describe('Keywords to search for'),
    }),
    execute: async ({ subreddit, keywords }) => {
      try {
        const children = await fetchRedditSearch(keywords, subreddit, 'new', 50);
        if (children.length === 0) return `No posts found in r/${subreddit} for "${keywords}".`;

        // Filter to only genuinely new posts
        const newChildren = children.filter(
          (c) => !store.existsByExternalId('reddit', c.data.id)
        );

        if (newChildren.length === 0) {
          return `No new posts in r/${subreddit} for "${keywords}" since last check.`;
        }

        const posts = newChildren.map((c) => redditChildToPost(c, `monitor:${subreddit}:${keywords}`));
        store.upsertMany(posts);

        const summary = posts
          .slice(0, 5)
          .map(
            (p, i) =>
              `${i + 1}. **${(p.title || '').slice(0, 80)}** (score: ${p.score})\n   by u/${p.author} — ${p.url}`
          )
          .join('\n');

        return `${newChildren.length} new post(s) in r/${subreddit} for "${keywords}":\n\n${summary}`;
      } catch (e) {
        return `Reddit monitor failed: ${(e as Error).message}`;
      }
    },
  });

  const queryRedditPosts = tool({
    description:
      'Search previously ingested Reddit posts using full-text search. Use this to find Reddit posts already collected by redditSearch or redditMonitor.',
    parameters: z.object({
      query: z.string().describe('Search query'),
      subreddit: z.string().optional().describe('Filter by subreddit'),
      limit: z.number().min(1).max(50).optional().default(10).describe('Max results'),
    }),
    execute: async ({ query, subreddit, limit }) => {
      try {
        let results;
        if (subreddit && !query) {
          results = store.getRecent({ platform: 'reddit', subreddit, limit });
        } else {
          results = store.search(query, { platform: 'reddit', limit });
          if (subreddit) {
            results = results.filter((p) => p.subreddit === subreddit);
          }
        }

        if (results.length === 0) return 'No matching Reddit posts found in the database.';

        return results
          .map(
            (p, i) =>
              `${i + 1}. r/${p.subreddit} — **${(p.title || '').slice(0, 80)}** (score: ${p.score})\n   by u/${p.author} (${p.postedAt.slice(0, 10)})\n   ${p.url}`
          )
          .join('\n');
      } catch (e) {
        return `Query failed: ${(e as Error).message}`;
      }
    },
  });

  return {
    xTrackAccount,
    xSearchKeywords,
    queryTweets,
    redditSearch,
    redditMonitor,
    queryRedditPosts,
  };
}
