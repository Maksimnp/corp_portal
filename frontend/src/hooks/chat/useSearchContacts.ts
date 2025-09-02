import { useState } from 'react';
import { toast } from 'react-toastify';
import type { Contact } from '../../types/chat';

export const useSearchContacts = (token: string | null, refreshToken: (newToken: string) => void) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://192.1.66.117:8000';

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const searchContacts = async (query: string) => {
    if (!token) return;
    setIsLoadingContacts(true);
    try {
      const res = await fetch(`${API_BASE}/chat/contacts?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`, { headers: authHeaders() });
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (refreshRes.ok) {
          const { access_token } = await refreshRes.json();
          refreshToken(access_token);
          return searchContacts(query);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('Не удалось найти контакты');
      const data: Contact[] = await res.json();
      setContacts((prev) => [...prev, ...data]);
      setHasMore(data.length === limit);
      setOffset((prev) => prev + limit);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const resetSearch = () => {
    setContacts([]);
    setOffset(0);
    setHasMore(true);
  };

  return { contacts, setContacts, isLoadingContacts, searchContacts, resetSearch, hasMore };
};