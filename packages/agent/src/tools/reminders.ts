import { tool } from 'ai';
import { z } from 'zod';
import type { SchedulerService } from '@amightyclaw/scheduler';

export function createReminderTools(getScheduler: () => SchedulerService, getProfile: () => string) {
  const setReminder = tool({
    description: 'Set a recurring reminder or scheduled task. The message will be sent to you at the specified schedule so you can act on it. Use standard cron expressions (e.g. "0 9 * * *" for daily at 9am, "*/30 * * * *" for every 30 minutes, "0 9 * * 1" for every Monday at 9am).',
    parameters: z.object({
      name: z.string().describe('A short unique name for this reminder (e.g. "morning-greeting", "weather-check")'),
      cron: z.string().describe('Cron expression for the schedule'),
      message: z.string().describe('The message/prompt that will be sent to you when the reminder fires. Be specific about what you should do.'),
    }),
    execute: async ({ name, cron, message }) => {
      try {
        const job = await getScheduler().addJob({ name, cron, message, profile: getProfile() });
        return `Reminder "${job.name}" created! Schedule: ${job.cron}. I'll receive the message "${message}" on that schedule.`;
      } catch (e) {
        return `Failed to create reminder: ${(e as Error).message}`;
      }
    },
  });

  const listReminders = tool({
    description: 'List all scheduled reminders and recurring tasks.',
    parameters: z.object({}),
    execute: async () => {
      const jobs = getScheduler().listJobs();
      if (jobs.length === 0) return 'No reminders set.';
      return jobs.map((j) =>
        `• ${j.name} [${j.enabled ? 'active' : 'paused'}] — ${j.cron} — "${j.message}"${j.lastRun ? ` (last ran: ${j.lastRun})` : ''}`
      ).join('\n');
    },
  });

  const removeReminder = tool({
    description: 'Remove a scheduled reminder by name.',
    parameters: z.object({
      name: z.string().describe('The name of the reminder to remove'),
    }),
    execute: async ({ name }) => {
      try {
        await getScheduler().removeJob(name);
        return `Reminder "${name}" removed.`;
      } catch (e) {
        return `Failed to remove reminder: ${(e as Error).message}`;
      }
    },
  });

  const toggleReminder = tool({
    description: 'Enable or disable a scheduled reminder by name.',
    parameters: z.object({
      name: z.string().describe('The name of the reminder'),
      enabled: z.boolean().describe('Whether to enable (true) or disable (false) the reminder'),
    }),
    execute: async ({ name, enabled }) => {
      try {
        await getScheduler().toggleJob(name, enabled);
        return `Reminder "${name}" is now ${enabled ? 'enabled' : 'disabled'}.`;
      } catch (e) {
        return `Failed to toggle reminder: ${(e as Error).message}`;
      }
    },
  });

  return { setReminder, listReminders, removeReminder, toggleReminder };
}
