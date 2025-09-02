import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import type { Chat, Contact, Message } from '../../types/chat';

export const useChats = (
  token: string | null,
  username: string | null,
  refreshToken: (newToken: string) => void,
  setMessagesByChat: React.Dispatch<React.SetStateAction<{ [key: string]: Message[] }>>
) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [contactMap, setContactMap] = useState<{ [key: string]: string }>({});
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://192.1.66.117:8000';

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const fetchChats = useCallback(async () => {
    if (!token) return;
    setIsLoadingChats(true);
    try {
      const res = await fetch(`${API_BASE}/chat/chats`, { headers: authHeaders() });
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (refreshRes.ok) {
          const { access_token } = await refreshRes.json();
          refreshToken(access_token);
          toast.info('Токен обновлен');
          return fetchChats();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to load chats: ${res.status} ${res.statusText}`);
      const data: Chat[] = await res.json();
      setChats(data);
      if (data.length > 0 && activeChat === null) setActiveChat(data[0].id);

      const allMembers = new Set<string>();
      data.forEach((chat) => chat.members.forEach((m) => allMembers.add(m)));
      allMembers.forEach(async (m) => {
        if (!contactMap[m]) {
          const res = await fetch(`${API_BASE}/chat/contacts?query=${encodeURIComponent(m)}`, { headers: authHeaders() });
          if (res.ok) {
            const contactsData: Contact[] = await res.json();
            if (contactsData.length > 0) {
              setContactMap((prev) => ({ ...prev, [m]: contactsData[0].displayName || m }));
            }
          }
        }
      });
    } catch (e: any) {
      console.error('Error loading chats:', e);
      toast.error('Не удалось загрузить чаты');
    } finally {
      setIsLoadingChats(false);
    }
  }, [token, activeChat, refreshToken, contactMap]);

  const clearChatHistory = async (chatId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${chatId}/clear`, {
        method: 'POST',
        headers: authHeaders(),
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
          return clearChatHistory(chatId);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('Failed to clear chat history');
      setMessagesByChat((prev: { [key: string]: Message[] }) => ({ ...prev, [chatId]: [] }));
      toast.success('История чата очищена');
    } catch (e: any) {
      console.error('Error clearing chat:', e);
      toast.error('Не удалось очистить историю чата');
    }
  };

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  return { chats, setChats, activeChat, setActiveChat, isLoadingChats, contactMap, fetchChats, clearChatHistory };
};