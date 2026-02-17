import { getDatabase } from './database.js';

export class UsageStore {
  record(profile: string, promptTokens: number, completionTokens: number): void {
    const db = getDatabase();
    const date = new Date().toISOString().slice(0, 10);
    db.prepare(
      'INSERT INTO usage (profile, date, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?)'
    ).run(profile, date, promptTokens, completionTokens, promptTokens + completionTokens);
  }

  getDailyUsage(profile: string, date?: string): number {
    const db = getDatabase();
    const d = date || new Date().toISOString().slice(0, 10);
    const row = db.prepare(
      'SELECT COALESCE(SUM(total_tokens), 0) as total FROM usage WHERE profile = ? AND date = ?'
    ).get(profile, d) as { total: number };
    return row.total;
  }

  checkLimit(profile: string, maxTokensPerDay: number): { allowed: boolean; used: number; remaining: number } {
    const used = this.getDailyUsage(profile);
    return {
      allowed: used < maxTokensPerDay,
      used,
      remaining: Math.max(0, maxTokensPerDay - used),
    };
  }
}
