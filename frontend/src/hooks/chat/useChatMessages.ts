import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import type { Message } from '../../types/chat';

export const useChatMessages = (
  activeChat: string | null,
  token: string | null,
  username: string | null,
  refreshToken: (newToken: string) => void
) => {
  const [messagesByChat, setMessagesByChat] = useState<{ [key: string]: Message[] }>({});
  const [hasMoreByChat, setHasMoreByChat] = useState<{ [key: string]: boolean }>({});
  const [offsetByChat, setOffsetByChat] = useState<{ [key: string]: number }>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [limit] = useState(50);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://192.1.66.117:8000';

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const loadMessages = async () => {
    if (!activeChat || !token) return;
    setIsLoadingMessages(true);
    try {
      const currentOffset = offsetByChat[activeChat] || 0;
      const res = await fetch(`${API_BASE}/chat/${activeChat}/messages?offset=${currentOffset}&limit=${limit}`, { headers: authHeaders() });
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (refreshRes.ok) {
          const { access_token } = await refreshRes.json();
          refreshToken(access_token);
          return loadMessages();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to load messages`);
      const data: Message[] = await res.json();
      if (data.length < limit) setHasMoreByChat((prev) => ({ ...prev, [activeChat]: false }));
      setMessagesByChat((prev) => ({
        ...prev,
        [activeChat]: [
          ...data.map((msg) => ({ ...msg, id: String(msg.id), is_read: Boolean(msg.is_read), timestamp: msg.timestamp, edited: Boolean(msg.edited) })),
          ...(prev[activeChat] || []),
        ],
      }));
      setOffsetByChat((prev) => ({ ...prev, [activeChat]: currentOffset + limit }));
    } catch (e) {
      toast.error('Не удалось загрузить сообщения');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const forwardMessage = async (messageId: string, targetChatId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/messages/${messageId}/forward`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ target_chat_id: targetChatId }),
      });
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (refreshRes.ok) {
          const { access_token } = await refreshRes.json();
          refreshToken(access_token);
          return forwardMessage(messageId, targetChatId);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('Failed to forward message');
      toast.success('Сообщение пересыллено');
    } catch (e: any) {
      console.error('Error forwarding message:', e);
      toast.error('Не удалось переслать сообщение');
    }
  };

  useEffect(() => {
    if (activeChat) {
      if (!messagesByChat[activeChat]) {
        setOffsetByChat((prev) => ({ ...prev, [activeChat]: 0 }));
        setHasMoreByChat((prev) => ({ ...prev, [activeChat]: true }));
        loadMessages();
      }
    }
  }, [activeChat, token]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    if (target.scrollTop === 0 && hasMoreByChat[activeChat!] && !isLoadingMessages) {
      loadMessages();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesByChat[activeChat ?? '']]);

  return { messagesByChat, setMessagesByChat, hasMoreByChat, isLoadingMessages, loadMessages, handleScroll, messagesEndRef, forwardMessage };
};