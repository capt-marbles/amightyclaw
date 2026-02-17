import { EventEmitter } from 'node:events';
import type { BusMessage } from '@amightyclaw/core';
import { getLogger } from '@amightyclaw/core';

const log = getLogger('message-bus');

export class MessageBus extends EventEmitter {
  publish(message: BusMessage): void {
    log.debug({ id: message.id, channel: message.channel, role: message.role }, 'Message published');
    this.emit('message', message);
    this.emit(`message:${message.channel}`, message);
  }

  publishStream(conversationId: string, channel: string, chunk: string): void {
    this.emit('stream', { conversationId, channel, chunk });
    this.emit(`stream:${channel}`, { conversationId, chunk });
  }

  publishStreamEnd(conversationId: string, channel: string): void {
    this.emit('stream:end', { conversationId, channel });
    this.emit(`stream:end:${channel}`, { conversationId });
  }
}
