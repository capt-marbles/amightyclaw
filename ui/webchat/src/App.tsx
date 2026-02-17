import { useState, useCallback } from 'react';
import { LoginForm } from './components/LoginForm.js';
import { ChatWindow } from './components/ChatWindow.js';
import { disconnectSocket } from './socket.js';

export function App() {
  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem('amightyclaw_token');
  });

  const handleLogin = useCallback((t: string) => {
    sessionStorage.setItem('amightyclaw_token', t);
    setToken(t);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('amightyclaw_token');
    disconnectSocket();
    setToken(null);
  }, []);

  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return <ChatWindow token={token} onLogout={handleLogout} />;
}
