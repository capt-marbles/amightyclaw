import { readFileSync, existsSync, watch } from 'node:fs';
import { join } from 'node:path';
import { getLogger, getDataDir } from '@amightyclaw/core';

const log = getLogger('soul');

export class SoulService {
  private content: string = '';
  private filePath: string;
  private watcher?: ReturnType<typeof watch>;

  constructor(filePath?: string) {
    this.filePath = filePath || join(getDataDir(), 'SOUL.md');
  }

  load(): string {
    if (!existsSync(this.filePath)) {
      log.warn({ path: this.filePath }, 'SOUL.md not found, using default');
      this.content = 'You are AMightyClaw, a helpful AI assistant.';
      return this.content;
    }

    this.content = readFileSync(this.filePath, 'utf-8');
    log.info({ path: this.filePath }, 'SOUL.md loaded');
    return this.content;
  }

  getContent(): string {
    if (!this.content) {
      this.load();
    }
    return this.content;
  }

  startWatching(): void {
    if (this.watcher) return;

    this.watcher = watch(this.filePath, (eventType) => {
      if (eventType === 'change') {
        log.info('SOUL.md changed, reloading...');
        this.load();
      }
    });

    log.info('Watching SOUL.md for changes');
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }
}
