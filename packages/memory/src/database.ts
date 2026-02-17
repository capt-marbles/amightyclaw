import Database from 'better-sqlite3';
import { join } from 'node:path';
import { getLogger, getDataDir } from '@amightyclaw/core';
import { SCHEMA } from './schema.js';

const log = getLogger('memory');

let db: Database.Database | undefined;

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const path = dbPath || join(getDataDir(), 'data', 'memory.db');
  log.info({ path }, 'Opening database');

  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run schema
  db.exec(SCHEMA);

  log.info('Database initialized');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = undefined;
    log.info('Database closed');
  }
}
