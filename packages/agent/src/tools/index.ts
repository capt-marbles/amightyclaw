import type { AppConfig } from '@amightyclaw/core';
import type { SchedulerService } from '@amightyclaw/scheduler';
import type { AgentLoop } from '../agent-loop.js';
import { ToolRegistry } from '../tool-registry.js';
import { createWebSearchTool } from './web-search.js';
import { createSkillTools } from './skills.js';
import { createRunCommandTool } from './run-command.js';
import { createReminderTools } from './reminders.js';

// Context holder — updated per message by the agent loop
let currentContext = { conversationId: '', channel: 'webchat', profile: '' };

export function setToolContext(conversationId: string, channel: string, profile: string) {
  currentContext = { conversationId, channel, profile };
}

export function registerBuiltinTools(
  registry: ToolRegistry,
  config: AppConfig,
  agentLoop: AgentLoop,
  scheduler: SchedulerService
): void {
  // Web search (conditional on API key)
  if (config.braveApiKey) {
    registry.register('webSearch', createWebSearchTool(config.braveApiKey));
  }

  // Skills (always available)
  const { writeSkill, readSkill, listSkills } = createSkillTools();
  registry.register('writeSkill', writeSkill);
  registry.register('readSkill', readSkill);
  registry.register('listSkills', listSkills);

  // Command execution (always available, requires confirmation)
  registry.register('runCommand', createRunCommandTool(
    {
      maxExecutionTimeout: config.maxExecutionTimeout || 30000,
      commandDenyList: config.commandDenyList,
    },
    () => agentLoop,
    () => currentContext
  ));

  // Reminders / scheduled tasks (always available)
  const { setReminder, listReminders, removeReminder, toggleReminder } = createReminderTools(
    () => scheduler,
    () => currentContext.profile || Object.keys(config.profiles)[0] || 'free'
  );
  registry.register('setReminder', setReminder);
  registry.register('listReminders', listReminders);
  registry.register('removeReminder', removeReminder);
  registry.register('toggleReminder', toggleReminder);
}
