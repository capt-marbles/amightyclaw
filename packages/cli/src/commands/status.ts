import { loadConfig, getDataDir } from '@amightyclaw/core';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export async function statusCommand(): Promise<void> {
  try {
    const config = loadConfig();
    const dataDir = getDataDir();
    const dbPath = join(dataDir, 'data', 'memory.db');

    console.log('\n🐾 AMightyClaw Status\n');
    console.log(`  Config:    ${join(dataDir, 'config.json')}`);
    console.log(`  Port:      ${config.port}`);
    console.log(`  Profiles:  ${Object.keys(config.profiles).join(', ')}`);
    console.log(`  Database:  ${existsSync(dbPath) ? `${(statSync(dbPath).size / 1024).toFixed(1)} KB` : 'not created'}`);
    console.log(`  Soul:      ${existsSync(join(dataDir, 'SOUL.md')) ? 'present' : 'missing'}`);

    // Check if server is running
    try {
      const res = await fetch(`http://${config.host}:${config.port}/api/health`);
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        console.log(`  Server:    running (uptime: ${data.uptime}s)`);
      }
    } catch {
      console.log(`  Server:    not running`);
    }

    console.log();
  } catch (e) {
    console.log('AMightyClaw is not configured. Run "amightyclaw setup" first.');
  }
}
