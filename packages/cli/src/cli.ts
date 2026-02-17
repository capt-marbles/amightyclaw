import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { startCommand } from './commands/start.js';
import { cronCommand } from './commands/cron.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('amightyclaw')
  .description('Self-hosted AI assistant')
  .version('0.1.0');

program
  .command('setup')
  .description('Interactive setup wizard')
  .action(setupCommand);

program
  .command('start')
  .description('Start the assistant server')
  .option('-p, --port <port>', 'Port to listen on')
  .action(startCommand);

program
  .command('cron')
  .description('Manage scheduled tasks')
  .addCommand(
    new Command('add')
      .description('Add a cron job')
      .requiredOption('--name <name>', 'Job name')
      .requiredOption('--cron <expression>', 'Cron expression')
      .requiredOption('--message <message>', 'Message to send')
      .option('--profile <profile>', 'Profile to use', 'free')
      .action(async (opts) => {
        const { cronAdd } = await import('./commands/cron.js');
        await cronAdd(opts);
      })
  )
  .addCommand(
    new Command('list')
      .description('List cron jobs')
      .action(async () => {
        const { cronList } = await import('./commands/cron.js');
        await cronList();
      })
  )
  .addCommand(
    new Command('remove')
      .description('Remove a cron job')
      .requiredOption('--name <name>', 'Job name')
      .action(async (opts) => {
        const { cronRemove } = await import('./commands/cron.js');
        await cronRemove(opts);
      })
  );

program
  .command('status')
  .description('Show server status')
  .action(statusCommand);

program.parse();
