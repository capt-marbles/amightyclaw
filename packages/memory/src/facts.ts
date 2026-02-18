import { v4 as uuid } from 'uuid';
import type { Fact } from '@amightyclaw/core';
import { getDatabase } from './database.js';

export class FactStore {
  add(content: string, category = 'general', source = ''): Fact {
    const db = getDatabase();
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO facts (id, content, category, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, content, category, source, now, now);
    return { id, content, category, source, createdAt: now, updatedAt: now };
  }

  update(id: string, content: string, category?: string): void {
    const db = getDatabase();
    if (category) {
      db.prepare('UPDATE facts SET content = ?, category = ?, updated_at = datetime("now") WHERE id = ?').run(content, category, id);
    } else {
      db.prepare('UPDATE facts SET content = ?, updated_at = datetime("now") WHERE id = ?').run(content, id);
    }
  }

  delete(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM facts WHERE id = ?').run(id);
  }

  getAll(limit = 200): Fact[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM facts ORDER BY updated_at DESC LIMIT ?').all(limit) as Array<Record<string, string>>;
    return rows.map(this.mapRow);
  }

  searchFTS(query: string, limit = 10): Fact[] {
    // Sanitize query for FTS5: extract alphanumeric words, join with OR
    const words = query.replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 1);
    if (words.length === 0) return [];

    const ftsQuery = words.map((w) => `"${w}"`).join(' OR ');
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT f.* FROM facts f
       JOIN facts_fts fts ON f.rowid = fts.rowid
       WHERE facts_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    ).all(ftsQuery, limit) as Array<Record<string, string>>;
    return rows.map(this.mapRow);
  }

  searchHybrid(query: string, limit = 10): Fact[] {
    // For now, just use FTS5. Vector search will be added when sqlite-vec is available.
    return this.searchFTS(query, limit);
  }

  private mapRow(r: Record<string, string>): Fact {
    return {
      id: r.id,
      content: r.content,
      category: r.category,
      source: r.source,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
