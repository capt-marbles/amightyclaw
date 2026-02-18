import { tool } from 'ai';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import type { AgentLoop } from '../agent-loop.js';

export function createRunCommandTool(
  config: { maxExecutionTimeout: number; commandDenyList?: string[] },
  getAgentLoop: () => AgentLoop,
  getContext: () => { conversationId: string; channel: string }
) {
  return tool({
    description: 'Execute a shell command or script. The user will be asked to approve before execution. Use this to run skills you have written, system commands, or other scripts.',
    parameters: z.object({
      command: z.string().describe('The shell command to execute'),
    }),
    execute: async ({ command }, { toolCallId }) => {
      // Check deny list
      const denyList = config.commandDenyList || [
        'rm -rf /', 'rm -rf ~', 'mkfs', ':(){', 'dd if=', '> /dev/sd',
        'chmod -R 777 /', 'format c:', 'del /f /s /q',
      ];
      for (const pattern of denyList) {
        if (command.includes(pattern)) {
          return `Command denied: matches blocked pattern "${pattern}".`;
        }
      }

      // Request user confirmation via the agent loop's confirmation system
      const agentLoop = getAgentLoop();
      const ctx = getContext();
      const confirmFn = agentLoop.createConfirmationHandler(ctx.conversationId, ctx.channel);
      const approved = await confirmFn(toolCallId, command);
      if (!approved) {
        return 'User denied the command execution.';
      }

      // Execute with timeout
      const timeout = config.maxExecutionTimeout || 30000;
      return new Promise<string>((resolve) => {
        execFile('sh', ['-c', command], {
          timeout,
          maxBuffer: 1024 * 1024,
          cwd: process.env.HOME,
          env: { ...process.env, PATH: process.env.PATH },
        }, (error, stdout, stderr) => {
          if (error) {
            if (error.killed) {
              resolve(`Command timed out after ${timeout}ms.`);
            } else {
              resolve(`Error (exit ${error.code}): ${error.message}\n${stderr}`);
            }
          } else {
            const output = stdout.trim();
            const errOutput = stderr.trim();
            let result = output || '(no output)';
            if (errOutput) result += `\nStderr: ${errOutput}`;
            if (result.length > 10000) {
              result = result.slice(0, 10000) + '\n... (output truncated)';
            }
            resolve(result);
          }
        });
      });
    },
  });
}
