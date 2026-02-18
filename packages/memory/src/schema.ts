export const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT 'free',
  token_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
  content,
  category,
  content=facts,
  content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
  INSERT INTO facts_fts(rowid, content, category) VALUES (new.rowid, new.content, new.category);
END;

CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, content, category) VALUES ('delete', old.rowid, old.content, old.category);
END;

CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, content, category) VALUES ('delete', old.rowid, old.content, old.category);
  INSERT INTO facts_fts(rowid, content, category) VALUES (new.rowid, new.content, new.category);
END;

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile TEXT NOT NULL,
  date TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_profile_date ON usage(profile, date);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content=messages,
  content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cron TEXT NOT NULL,
  message TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT 'free',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run TEXT,
  next_run TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'reddit')),
  external_id TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  subreddit TEXT,
  title TEXT,
  score INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  repost_count INTEGER DEFAULT 0,
  post_type TEXT NOT NULL DEFAULT 'tweet' CHECK (post_type IN ('tweet', 'article', 'thread')),
  source_query TEXT NOT NULL DEFAULT '',
  posted_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_platform_extid
  ON social_posts(platform, external_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts(platform, author);

CREATE VIRTUAL TABLE IF NOT EXISTS social_posts_fts USING fts5(
  content, title, author,
  content=social_posts, content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS social_posts_ai AFTER INSERT ON social_posts BEGIN
  INSERT INTO social_posts_fts(rowid, content, title, author) VALUES (new.rowid, new.content, new.title, new.author);
END;

CREATE TRIGGER IF NOT EXISTS social_posts_ad AFTER DELETE ON social_posts BEGIN
  INSERT INTO social_posts_fts(social_posts_fts, rowid, content, title, author) VALUES ('delete', old.rowid, old.content, old.title, old.author);
END;

CREATE TRIGGER IF NOT EXISTS social_posts_au AFTER UPDATE ON social_posts BEGIN
  INSERT INTO social_posts_fts(social_posts_fts, rowid, content, title, author) VALUES ('delete', old.rowid, old.content, old.title, old.author);
  INSERT INTO social_posts_fts(rowid, content, title, author) VALUES (new.rowid, new.content, new.title, new.author);
END;
`;
