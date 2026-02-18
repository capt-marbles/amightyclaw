import type { AppConfig } from '@amightyclaw/core';
import type { SchedulerService } from '@amightyclaw/scheduler';
import type { AgentLoop } from '../agent-loop.js';
import { ToolRegistry } from '../tool-registry.js';
import { createWebSearchTool } from './web-search.js';
import { createSkillTools } from './skills.js';
import { createRunCommandTool } from './run-command.js';
import { createReminderTools } from './reminders.js';
import { createSocialIntelTools } from './social-intel.js';
import { SocialPostStore } from '@amightyclaw/memory';

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

  // Social intelligence tools
  const socialPostStore = new SocialPostStore();
  const socialTools = createSocialIntelTools(socialPostStore, config);

  // X/Twitter tools — conditional on PhantomBuster config
  if (config.phantomBuster?.apiKey) {
    if (config.phantomBuster.tweetExtractorAgentId) {
      registry.register('xTrackAccount', socialTools.xTrackAccount);
    }
    if (config.phantomBuster.searchExportAgentId) {
      registry.register('xSearchKeywords', socialTools.xSearchKeywords);
    }
    registry.register('queryTweets', socialTools.queryTweets);
  }

  // Reddit tools — always available, no auth needed
  registry.register('redditSearch', socialTools.redditSearch);
  registry.register('redditMonitor', socialTools.redditMonitor);
  registry.register('queryRedditPosts', socialTools.queryRedditPosts);
}
