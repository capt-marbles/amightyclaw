import { loadConfig, getLogger } from '@amightyclaw/core';

export async function cronCommand(): Promise<void> {
  console.log('Use "amightyclaw cron add|list|remove"');
}

interface CronAddOpts {
  name: string;
  cron: string;
  message: string;
  profile: string;
}

export async function cronAdd(opts: CronAddOpts): Promise<void> {
  const config = loadConfig();
  const { SchedulerService } = await import('@amightyclaw/scheduler');
  const scheduler = new SchedulerService(config);
  await scheduler.init();
  await scheduler.addJob({
    name: opts.name,
    cron: opts.cron,
    message: opts.message,
    profile: opts.profile,
  });
  console.log(`✅ Cron job "${opts.name}" added: ${opts.cron}`);
  await scheduler.stop();
}

export async function cronList(): Promise<void> {
  const config = loadConfig();
  const { SchedulerService } = await import('@amightyclaw/scheduler');
  const scheduler = new SchedulerService(config);
  await scheduler.init();
  const jobs = scheduler.listJobs();
  if (jobs.length === 0) {
    console.log('No cron jobs configured.');
  } else {
    console.log('\nCron Jobs:');
    for (const job of jobs) {
      console.log(`  ${job.enabled ? '●' : '○'} ${job.name} — ${job.cron} — "${job.message}" [${job.profile}]`);
    }
    console.log();
  }
  await scheduler.stop();
}

interface CronRemoveOpts {
  name: string;
}

export async function cronRemove(opts: CronRemoveOpts): Promise<void> {
  const config = loadConfig();
  const { SchedulerService } = await import('@amightyclaw/scheduler');
  const scheduler = new SchedulerService(config);
  await scheduler.init();
  await scheduler.removeJob(opts.name);
  console.log(`✅ Cron job "${opts.name}" removed.`);
  await scheduler.stop();
}
