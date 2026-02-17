import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'node:http';
import { v4 as uuid } from 'uuid';
import type { AppConfig, BusMessage } from '@amightyclaw/core';
import { getLogger } from '@amightyclaw/core';
import { MessageBus } from '@amightyclaw/agent';
import { ConversationStore } from '@amightyclaw/memory';
import { verifyToken } from './auth.js';

const log = getLogger('socket');

export function createSocketServer(
  httpServer: HTTPServer,
  config: AppConfig,
  bus: MessageBus,
  conversations: ConversationStore
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: `http://${config.host}:${config.port}`,
      methods: ['GET', 'POST'],
    },
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token || !verifyToken(token, config.jwtSecret)) {
      next(new Error('Authentication failed'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    log.info({ id: socket.id }, 'Client connected');
    let currentConversationId: string | null = null;
    let currentProfile = Object.keys(config.profiles)[0] || 'free';

    // Create or join conversation
    socket.on('conversation:new', (callback) => {
      const conv = conversations.create();
      currentConversationId = conv.id;
      socket.join(conv.id);
      if (typeof callback === 'function') callback(conv);
    });

    socket.on('conversation:join', (id: string, callback) => {
      const conv = conversations.get(id);
      if (!conv) {
        if (typeof callback === 'function') callback({ error: 'Not found' });
        return;
      }
      currentConversationId = id;
      socket.join(id);
      const messages = conversations.getMessages(id);
      if (typeof callback === 'function') callback({ conversation: conv, messages });
    });

    socket.on('conversation:list', (callback) => {
      const list = conversations.list();
      if (typeof callback === 'function') callback(list);
    });

    // Profile management
    socket.on('profile:set', (profile: string, callback) => {
      if (!config.profiles[profile]) {
        if (typeof callback === 'function') callback({ error: 'Profile not found' });
        return;
      }
      currentProfile = profile;
      if (typeof callback === 'function') callback({ profile: currentProfile });
    });

    socket.on('profile:list', (callback) => {
      const profiles = Object.entries(config.profiles).map(([name, p]) => ({
        name,
        provider: p.provider,
        model: p.model,
      }));
      if (typeof callback === 'function') callback(profiles);
    });

    // Chat
    socket.on('message:send', (content: string) => {
      if (!currentConversationId) {
        const conv = conversations.create();
        currentConversationId = conv.id;
        socket.join(conv.id);
        socket.emit('conversation:created', conv);
      }

      const msg: BusMessage = {
        id: uuid(),
        conversationId: currentConversationId,
        channel: 'webchat',
        role: 'user',
        content,
        profile: currentProfile,
        timestamp: Date.now(),
      };

      bus.publish(msg);
    });

    socket.on('disconnect', () => {
      log.info({ id: socket.id }, 'Client disconnected');
    });
  });

  // Forward stream events to Socket.IO
  bus.on('stream', (data: { conversationId: string; chunk: string }) => {
    io.to(data.conversationId).emit('message:stream', data.chunk);
  });

  bus.on('stream:end', (data: { conversationId: string }) => {
    io.to(data.conversationId).emit('message:stream:end');
  });

  bus.on('message', (msg: BusMessage) => {
    if (msg.role === 'assistant') {
      io.to(msg.conversationId).emit('message:complete', {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        profile: msg.profile,
        timestamp: msg.timestamp,
      });
    }
  });

  return io;
}
