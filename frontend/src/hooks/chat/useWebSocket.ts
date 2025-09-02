import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import type { Message, Contact } from '../../types/chat';

export const useWebSocket = (
  token: string | null,
  username: string | null,
  activeChat: string | null,
  setMessagesByChat: React.Dispatch<React.SetStateAction<{ [key: string]: Message[] }>>,
  chats: Chat[],
  contactMap: { [key: string]: Contact },
  setContactMap: React.Dispatch<React.SetStateAction<{ [key: string]: Contact }>>,
  refreshToken: (newToken: string) => void
) => {
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://192.1.66.117:8000';

  useEffect(() => {
    if (!token || !username) return;
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseDelay = 3000;
    let reconnectTimeout: NodeJS.Timeout;
    let pingInterval: NodeJS.Timeout;
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;
      setConnectionStatus('connecting');
      try {
        ws = new WebSocket(`${WS_BASE}/chat/ws?token=${encodeURIComponent(token)}`);
        ws.onopen = () => {
          if (!isMounted) {
            ws?.close();
            return;
          }
          console.log('WebSocket connected');
          setConnectionStatus('connected');
          reconnectAttempts = 0;
          setWebsocket(ws);
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 15000);
        };
        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'error') {
              console.error('WS Server Error:', data.error);
              toast.error(`Ошибка WebSocket: ${data.error}`);
              return;
            }
            if (data.type === 'new_message') {
              if (data.data.sender !== username && Notification.permission === 'granted') {
                const isHidden = document.visibilityState === 'hidden';
                const isNotCurrent = activeChat !== data.data.channel_id;
                if (isHidden || isNotCurrent) {
                  const senderName = contactMap[data.data.sender]?.displayName || data.data.sender;
                  const chatName = chats.find(c => c.id === data.data.channel_id)?.name || 'чате';
                  const bodyText = data.data.content || (data.data.file_name ? `Отправлен файл: ${data.data.file_name}` : 'Новое сообщение');
                  new Notification(`Новое сообщение в ${chatName}`, {
                    body: `${senderName}: ${bodyText}`,
                  });
                }
              }
              setMessagesByChat(prev => ({
                ...prev,
                [data.data.channel_id]: [...(prev[data.data.channel_id] || []), data.data],
              }));
            }
            if (data.type === 'typing') {
              setIsTyping(true);
              setTypingUser(data.data.user);
              setTimeout(() => setIsTyping(false), 3000);
            }
            if (data.type === 'message_edited') {
              setMessagesByChat(prev => ({
                ...prev,
                [data.data.channel_id]: prev[data.data.channel_id].map(m =>
                  m.id === data.data.id ? { ...m, content: data.data.content, edited: true } : m
                ),
              }));
            }
            if (data.type === 'message_deleted') {
              setMessagesByChat(prev => ({
                ...prev,
                [data.data.channel_id]: prev[data.data.channel_id].filter(m => m.id !== data.data.id),
              }));
            }
            if (data.type === 'online_status') {
              setOnlineUsers(data.data.users);
              setContactMap((prev) => {
                const updated = { ...prev };
                Object.keys(updated).forEach((user) => {
                  updated[user] = { ...updated[user], is_online: data.data.users.includes(user) };
                });
                return updated;
              });
            }
          } catch (e) {
            console.error('WS parse error:', e);
            toast.error('Ошибка обработки сообщения WebSocket');
          }
        };
        ws.onerror = (e) => {
          if (!isMounted) return;
          console.error('WebSocket error:', e);
          setConnectionStatus('disconnected');
          toast.error('Ошибка соединения с WebSocket');
        };
        ws.onclose = (event) => {
          if (!isMounted) return;
          console.log(`WebSocket closed: ${event.code}, reason: ${event.reason}`);
          setConnectionStatus('disconnected');
          setWebsocket(null);
          clearInterval(pingInterval);
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = baseDelay * Math.pow(1.5, reconnectAttempts - 1);
            console.log(`Reconnecting in ${delay / 1000}s (${reconnectAttempts}/${maxReconnectAttempts})`);
            reconnectTimeout = setTimeout(connect, delay);
          } else {
            console.error('Max reconnect attempts reached');
            toast.error('Не удалось подключиться к чату. Проверьте соединение или попробуйте позже.');
          }
        };
      } catch (error) {
        console.error('WebSocket init error:', error);
        setConnectionStatus('disconnected');
        toast.error('Ошибка инициализации WebSocket');
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = baseDelay * Math.pow(1.5, reconnectAttempts - 1);
          reconnectTimeout = setTimeout(connect, delay);
        }
      }
    };

    connect();
    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pingInterval) clearInterval(pingInterval);
      if (ws) ws.close();
    };
  }, [token, username, activeChat, chats, contactMap, setMessagesByChat, refreshToken]);

  return { websocket, connectionStatus, isTyping, typingUser, onlineUsers };
};