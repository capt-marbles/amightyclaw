import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../socket.js';
import { MessageBubble } from './MessageBubble.js';
import { TypingIndicator } from './TypingIndicator.js';
import { ProfileSwitcher } from './ProfileSwitcher.js';
import { Sidebar } from './Sidebar.js';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  profile?: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface Profile {
  name: string;
  provider: string;
  model: string;
}

interface Props {
  token: string;
  onLogout: () => void;
}

export function ChatWindow({ token, onLogout }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText, scrollToBottom]);

  useEffect(() => {
    const socket = getSocket(token);

    socket.on('connect', () => {
      // Load profiles
      socket.emit('profile:list', (profs: Profile[]) => {
        setProfiles(profs);
        if (profs.length > 0 && !currentProfile) {
          setCurrentProfile(profs[0].name);
        }
      });

      // Load conversations
      socket.emit('conversation:list', (convs: Conversation[]) => {
        setConversations(convs);
      });
    });

    socket.on('message:stream', (chunk: string) => {
      setStreaming(true);
      setStreamText((prev) => prev + chunk);
    });

    socket.on('message:stream:end', () => {
      setStreaming(false);
    });

    socket.on('message:complete', (msg: Message) => {
      setStreamText('');
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('conversation:created', (conv: Conversation) => {
      setCurrentConvId(conv.id);
      setConversations((prev) => [conv, ...prev]);
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'Authentication failed') {
        onLogout();
      }
    });

    return () => {
      socket.off('message:stream');
      socket.off('message:stream:end');
      socket.off('message:complete');
      socket.off('conversation:created');
      socket.off('connect_error');
    };
  }, [token, onLogout, currentProfile]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;

    const socket = getSocket(token);
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    socket.emit('message:send', text);
    inputRef.current?.focus();
  }, [input, streaming, token]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewChat = useCallback(() => {
    const socket = getSocket(token);
    socket.emit('conversation:new', (conv: Conversation) => {
      setCurrentConvId(conv.id);
      setMessages([]);
      setConversations((prev) => [conv, ...prev]);
    });
  }, [token]);

  const handleSelectConversation = useCallback((id: string) => {
    const socket = getSocket(token);
    socket.emit('conversation:join', id, (data: { conversation: Conversation; messages: Message[] } | { error: string }) => {
      if ('error' in data) return;
      setCurrentConvId(id);
      setMessages(data.messages);
    });
  }, [token]);

  const handleProfileChange = useCallback((name: string) => {
    const socket = getSocket(token);
    socket.emit('profile:set', name, () => {
      setCurrentProfile(name);
    });
  }, [token]);

  return (
    <div className="h-screen flex bg-gray-950">
      <Sidebar
        conversations={conversations}
        currentId={currentConvId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-white">AMightyClaw</h1>
            <ProfileSwitcher
              profiles={profiles}
              current={currentProfile}
              onChange={handleProfileChange}
            />
          </div>
          <button
            onClick={onLogout}
            className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && !streaming && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="text-4xl mb-4">🐾</p>
                <p className="text-lg font-medium">Start a conversation</p>
                <p className="text-sm mt-1">Type a message below to begin</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              profile={msg.profile}
            />
          ))}

          {streaming && streamText && (
            <MessageBubble role="assistant" content={streamText} profile={currentProfile} />
          )}

          {streaming && !streamText && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 p-4 bg-gray-900/50">
          <div className="max-w-4xl mx-auto flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Shift+Enter for new line)"
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              disabled={streaming}
              autoFocus
            />
            <button
              onClick={sendMessage}
              disabled={streaming || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl px-5 py-3 font-medium transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
