import cron from 'node-cron';
import { v4 as uuid } from 'uuid';
import type { AppConfig, CronJob } from '@amightyclaw/core';
import { getLogger } from '@amightyclaw/core';
import { getDatabase } from '@amightyclaw/memory';

const log = getLogger('scheduler');

interface AddJobOpts {
  name: string;
  cron: string;
  message: string;
  profile: string;
}

export class SchedulerService {
  private config: AppConfig;
  private tasks = new Map<string, cron.ScheduledTask>();
  private onMessage?: (profile: string, message: string) => Promise<void>;

  constructor(config: AppConfig) {
    this.config = config;
  }

  setMessageHandler(handler: (profile: string, message: string) => Promise<void>): void {
    this.onMessage = handler;
  }

  async init(): Promise<void> {
    const db = getDatabase();
    const jobs = db.prepare('SELECT * FROM cron_jobs WHERE enabled = 1').all() as Array<Record<string, unknown>>;

    for (const job of jobs) {
      this.scheduleJob(job as unknown as CronJob);
    }

    log.info({ count: jobs.length }, 'Scheduler initialized');
  }

  async addJob(opts: AddJobOpts): Promise<CronJob> {
    if (!cron.validate(opts.cron)) {
      throw new Error(`Invalid cron expression: ${opts.cron}`);
    }

    const db = getDatabase();
    const id = uuid();
    const job: CronJob = {
      id,
      name: opts.name,
      cron: opts.cron,
      message: opts.message,
      profile: opts.profile,
      enabled: true,
    };

    db.prepare(
      'INSERT INTO cron_jobs (id, name, cron, message, profile, enabled) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, opts.name, opts.cron, opts.message, opts.profile, 1);

    this.scheduleJob(job);
    log.info({ name: opts.name, cron: opts.cron }, 'Cron job added');
    return job;
  }

  async removeJob(name: string): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM cron_jobs WHERE name = ?').run(name);

    const task = this.tasks.get(name);
    if (task) {
      task.stop();
      this.tasks.delete(name);
    }

    log.info({ name }, 'Cron job removed');
  }

  listJobs(): CronJob[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM cron_jobs ORDER BY name').all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      cron: r.cron as string,
      message: r.message as string,
      profile: r.profile as string,
      enabled: r.enabled === 1,
      lastRun: r.last_run as string | undefined,
      nextRun: r.next_run as string | undefined,
    }));
  }

  async toggleJob(name: string, enabled: boolean): Promise<void> {
    const db = getDatabase();
    db.prepare('UPDATE cron_jobs SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);

    const task = this.tasks.get(name);
    if (enabled && !task) {
      // Re-schedule if enabling
      const row = db.prepare('SELECT * FROM cron_jobs WHERE name = ?').get(name) as Record<string, unknown> | undefined;
      if (row) this.scheduleJob(row as unknown as CronJob);
    } else if (!enabled && task) {
      task.stop();
      this.tasks.delete(name);
    }

    log.info({ name, enabled }, 'Cron job toggled');
  }

  private scheduleJob(job: CronJob): void {
    const task = cron.schedule(job.cron, async () => {
      log.info({ name: job.name }, 'Cron job triggered');
      const db = getDatabase();
      db.prepare('UPDATE cron_jobs SET last_run = datetime("now") WHERE id = ?').run(job.id);

      if (this.onMessage) {
        await this.onMessage(job.profile, job.message).catch((e) => {
          log.error({ name: job.name, error: (e as Error).message }, 'Cron job execution failed');
        });
      }
    });

    this.tasks.set(job.name, task);
  }

  async stop(): Promise<void> {
    for (const [name, task] of this.tasks) {
      task.stop();
    }
    this.tasks.clear();
    log.info('Scheduler stopped');
  }
}
