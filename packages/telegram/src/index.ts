import { Bot, InlineKeyboard } from 'grammy';
import { v4 as uuid } from 'uuid';
import type { AppConfig, BusMessage } from '@amightyclaw/core';
import { getLogger } from '@amightyclaw/core';
import type { MessageBus } from '@amightyclaw/agent';
import type { ConversationStore } from '@amightyclaw/memory';

const log = getLogger('telegram');

export class TelegramChannel {
  private bot: Bot;
  private config: AppConfig;
  private bus: MessageBus;
  private conversations: ConversationStore;
  // Map Telegram chatId → conversationId
  private chatMap = new Map<number, string>();
  // Pending confirmation callbacks
  private pendingConfirms = new Map<string, number>(); // toolCallId → chatId

  constructor(config: AppConfig, bus: MessageBus, conversations: ConversationStore) {
    this.config = config;
    this.bus = bus;
    this.conversations = conversations;
    this.bot = new Bot(config.telegram!.botToken);
  }

  async start(): Promise<void> {
    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      const chatId = ctx.chat.id;
      const text = ctx.message.text;

      // Get or create conversation for this chat
      let convId = this.chatMap.get(chatId);
      if (!convId) {
        const conv = this.conversations.create(`Telegram ${chatId}`);
        convId = conv.id;
        this.chatMap.set(chatId, convId);
      }

      const defaultProfile = Object.keys(this.config.profiles)[0] || 'free';

      // Publish user message to bus
      this.bus.publish({
        id: uuid(),
        conversationId: convId,
        channel: 'telegram',
        role: 'user',
        content: text,
        profile: defaultProfile,
        timestamp: Date.now(),
      });
    });

    // Handle confirmation button callbacks
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (data.startsWith('confirm:') || data.startsWith('deny:')) {
        const [action, toolCallId] = data.split(':');
        const approved = action === 'confirm';

        // Emit confirmation response via bus
        this.bus.emit('tool:confirm-response:telegram', { toolCallId, approved });

        await ctx.answerCallbackQuery({ text: approved ? 'Approved' : 'Denied' });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      }
    });

    // Listen for assistant messages on telegram channel
    this.bus.on('message', (msg: BusMessage) => {
      if (msg.role === 'assistant' && msg.channel === 'telegram') {
        // Find chatId from conversationId
        for (const [chatId, convId] of this.chatMap) {
          if (convId === msg.conversationId) {
            this.bot.api.sendMessage(chatId, msg.content || '(empty response)').catch((e) => {
              log.error({ chatId, error: (e as Error).message }, 'Failed to send Telegram message');
            });
            break;
          }
        }
      }
    });

    // Listen for tool confirmation requests on telegram channel
    this.bus.on('tool:confirm-request', (data: { conversationId: string; channel: string; toolCallId: string; command: string }) => {
      if (data.channel !== 'telegram') return;

      for (const [chatId, convId] of this.chatMap) {
        if (convId === data.conversationId) {
          const keyboard = new InlineKeyboard()
            .text('Approve', `confirm:${data.toolCallId}`)
            .text('Deny', `deny:${data.toolCallId}`);

          this.bot.api.sendMessage(chatId, `Command execution request:\n\`\`\`\n${data.command}\n\`\`\``, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          }).catch((e) => {
            log.error({ error: (e as Error).message }, 'Failed to send confirmation request');
          });
          break;
        }
      }
    });

    // Start bot with long polling
    this.bot.start({
      onStart: () => log.info('Telegram bot started'),
    });
  }

  stop(): void {
    this.bot.stop();
  }
}
