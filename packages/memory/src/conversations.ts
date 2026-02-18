import { v4 as uuid } from 'uuid';
import type { Conversation, Message } from '@amightyclaw/core';
import { getDatabase } from './database.js';

export class ConversationStore {
  create(title = 'New Conversation'): Conversation {
    const db = getDatabase();
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).run(id, title, now, now);
    return { id, title, createdAt: now, updatedAt: now };
  }

  get(id: string): Conversation | undefined {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, string> | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(limit = 50): Conversation[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?'
    ).all(limit) as Array<Record<string, string>>;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  updateTitle(id: string, title: string): void {
    const db = getDatabase();
    db.prepare('UPDATE conversations SET title = ?, updated_at = datetime("now") WHERE id = ?').run(title, id);
  }

  delete(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  addMessage(msg: Omit<Message, 'id' | 'createdAt'>): Message {
    const db = getDatabase();
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, profile, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, msg.conversationId, msg.role, msg.content, msg.profile, msg.tokenCount || 0, now);

    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, msg.conversationId);

    return { id, ...msg, createdAt: now };
  }

  searchMessages(query: string, limit = 20): Array<{ conversationId: string; title: string; snippet: string; createdAt: string }> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT m.conversation_id, c.title, snippet(messages_fts, 0, '<b>', '</b>', '...', 32) as snippet, m.created_at
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      JOIN conversations c ON c.id = m.conversation_id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<Record<string, string>>;
    return rows.map((r) => ({
      conversationId: r.conversation_id,
      title: r.title,
      snippet: r.snippet,
      createdAt: r.created_at,
    }));
  }

  getMessages(conversationId: string, limit = 100): Message[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(conversationId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      conversationId: r.conversation_id as string,
      role: r.role as Message['role'],
      content: r.content as string,
      profile: r.profile as string,
      tokenCount: r.token_count as number,
      createdAt: r.created_at as string,
    }));
  }
}
