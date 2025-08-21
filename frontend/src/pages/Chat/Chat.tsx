import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { format, isValid } from 'date-fns';
import { ru } from 'date-fns/locale';
import { PaperPlaneRight, Paperclip, Smiley, DotsThreeVertical, MagnifyingGlass, UserCircle, Users, Plus, X, Pencil, Trash, SignOut } from 'phosphor-react';
import { toast } from 'react-toastify';
import EmojiPicker from 'emoji-picker-react';

// Define EmojiClickData type for emoji-picker-react
type EmojiClickData = {
  emoji: string;
  imageUrl: string;
  unified: string;
  originalUnified: string;
  names: string[];
  activeSkinTone: 'neutral' | 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark';
};

interface Message {
  id: string;
  channel_id: string;
  sender: string;
  content: string;
  timestamp: string;
  is_read: boolean;
  file_url?: string;
  file_name?: string;
}

interface Chat {
  id: string;
  name: string | null;
  description: string | null;
  is_group: boolean;
  is_channel: boolean;
  creator_username: string;
  members: string[];
}

interface Contact {
  id: string;
  displayName?: string;
  position?: string;
  department?: string;
  phone_internal?: string;
  phone_city?: string;
  phone_mobile?: string;
  email?: string;
  sam_account_name?: string;
}

// Utility to get avatar (you can replace with real image URL logic)
const getAvatar = (contact: Contact) => {
  // Example: if you have a user image API
  // return `https://api.example.com/avatar/${contact.id}`;
  return null; // No real image, use initials
};

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const ChatComponent: React.FC = () => {
  const { token, username, refreshToken } = useAuth();
  const [message, setMessage] = useState('');
  const [messagesByChat, setMessagesByChat] = useState<{ [key: string]: Message[] }>({});
  const [hasMoreByChat, setHasMoreByChat] = useState<{ [key: string]: boolean }>({});
  const [offsetByChat, setOffsetByChat] = useState<{ [key: string]: number }>({});
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState('');
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [limit] = useState(50);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [groupName, setGroupName] = useState('');
  const [channelName, setChannelName] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelDescription, setChannelDescription] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showKickModal, setShowKickModal] = useState(false);
  const [showEditChatModal, setShowEditChatModal] = useState(false); // New modal
  const [editChatName, setEditChatName] = useState('');
  const [editChatDescription, setEditChatDescription] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createOptionsRef = useRef<HTMLDivElement>(null);

  const WS_BASE = import.meta.env.VITE_WS_BASE || (import.meta.env.VITE_ENV === 'production' ? 'wss://192.1.66.117:8000' : 'ws://192.1.66.117:8000');
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://192.1.66.117:8000';

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const currentChat = chats.find((c) => c.id === activeChat);

  const currentMessages = useMemo(() => {
    return activeChat ? (messagesByChat[activeChat] || []).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) : [];
  }, [activeChat, messagesByChat]);

  const contactMap = useMemo(() => {
    const map: { [key: string]: Contact } = {};
    contacts.forEach(c => {
      map[c.id] = c;
    });
    return map;
  }, [contacts]);

  const getDisplayName = useCallback((username: string) => {
    const contact = Object.values(contactMap).find(c => c.sam_account_name === username);
    return contact?.displayName || username;
  }, [contactMap]);

  const unreadCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    chats.forEach((chat) => {
      const chatMessages = messagesByChat[chat.id] || [];
      counts[chat.id] = chatMessages.filter(
        (m) => !m.is_read && m.sender !== username
      ).length;
    });
    return counts;
  }, [messagesByChat, chats, username]);

  // Handle click outside for create options
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (createOptionsRef.current && !createOptionsRef.current.contains(event.target as Node)) {
        setShowCreateOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchChats = useCallback(async () => {
    if (!token) return;
    setIsLoadingChats(true);
    try {
      const res = await fetch(`${API_BASE}/chat/chats`, {
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
      if (data.length > 0 && activeChat === null) {
        setActiveChat(data[0].id);
      }
    } catch (e: any) {
      console.error('Error loading chats:', e);
      toast.error('Не удалось загрузить чаты');
    } finally {
      setIsLoadingChats(false);
    }
  }, [token, activeChat, refreshToken]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const loadMessages = async () => {
    if (!activeChat || !token) return;
    setIsLoadingMessages(true);
    try {
      const currentOffset = offsetByChat[activeChat] || 0;
      const res = await fetch(`${API_BASE}/chat/${activeChat}/messages?offset=${currentOffset}&limit=${limit}`, {
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
          return loadMessages();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to load messages: ${res.status} ${res.statusText}`);
      const data: any[] = await res.json();
      const parsed = data.map((msg) => ({
        ...msg,
        id: String(msg.id),
        channel_id: String(msg.channel_id),
        is_read: Boolean(msg.is_read),
        timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
        file_url: msg.file_url,
        file_name: msg.file_name,
      }));
      if (data.length < limit) {
        setHasMoreByChat(prev => ({ ...prev, [activeChat]: false }));
      }
      setMessagesByChat(prev => ({
        ...prev,
        [activeChat]: [...parsed, ...(prev[activeChat] || [])],
      }));
      setOffsetByChat(prev => ({ ...prev, [activeChat]: currentOffset + parsed.length }));
    } catch (e) {
      console.error('Error loading messages:', e);
      toast.error('Не удалось загрузить сообщения');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (activeChat) {
      if (!messagesByChat[activeChat]) {
        setOffsetByChat(prev => ({ ...prev, [activeChat]: 0 }));
        setHasMoreByChat(prev => ({ ...prev, [activeChat]: true }));
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
    if (!activeChat || !token || !username) return;
    (async () => {
      const unread = currentMessages.filter((m) => !m.is_read && m.sender !== username);
      if (unread.length === 0) return;
      try {
        const res = await fetch(`${API_BASE}/chat/messages/batch_read`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ message_ids: unread.map((m) => m.id) }),
        });
        if (res.ok) {
          setMessagesByChat((prev) => ({
            ...prev,
            [activeChat]: prev[activeChat].map((m) =>
              unread.some((u) => u.id === m.id) ? { ...m, is_read: true } : m
            ),
          }));
        }
      } catch (e) {
        console.error('Batch mark read error:', e);
      }
    })();
  }, [currentMessages, activeChat, token, username]);

  // WebSocket connection
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
              setMessagesByChat(prev => ({
                ...prev,
                [data.data.channel_id]: [...(prev[data.data.channel_id] || []), data.data],
              }));
            } else if (data.type === 'typing') {
              setIsTyping(true);
              setTypingUser(data.data.user);
              setTimeout(() => setIsTyping(false), 3000);
            } else if (data.type === 'user_left') {
              if (data.data.channel_id === activeChat) {
                setChats((prev) =>
                  prev.map((c) =>
                    c.id === data.data.channel_id
                      ? { ...c, members: c.members.filter((m) => m !== data.data.username) }
                      : c
                  )
                );
                toast.info(`${data.data.username} покинул чат`);
              }
            } else if (data.type === 'chat_deleted') {
              if (data.data.channel_id === activeChat) {
                setActiveChat(null);
              }
              setChats((prev) => prev.filter((c) => c.id !== data.data.channel_id));
              toast.info('Чат был удален');
            } else if (data.type === 'channel_invite') {
              if (data.data.channel_id === activeChat) {
                setChats((prev) =>
                  prev.map((c) =>
                    c.id === data.data.channel_id
                      ? { ...c, members: [...c.members, ...data.data.members] }
                      : c
                  )
                );
                toast.info(`Приглашены: ${data.data.members.join(', ')}`);
              }
            } else if (data.type === 'channel_kick') {
              if (data.data.channel_id === activeChat) {
                setChats((prev) =>
                  prev.map((c) =>
                    c.id === data.data.channel_id
                      ? { ...c, members: c.members.filter((m) => !data.data.members.includes(m)) }
                      : c
                  )
                );
                toast.info(`Исключены: ${data.data.members.join(', ')}`);
              }
            } else if (data.type === 'chat_renamed') {
              setChats((prev) =>
                prev.map((c) =>
                  c.id === data.data.channel_id
                    ? { ...c, name: data.data.name, description: data.data.description }
                    : c
                )
              );
              toast.info(`Чат переименован: ${data.data.name}`);
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
            reconnectTimeout = setTimeout(connect, delay);
          } else {
            toast.error('Не удалось подключиться к чату.');
          }
        };
      } catch (error) {
        console.error('WebSocket init error:', error);
        setConnectionStatus('disconnected');
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
  }, [token, username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleSendMessage = async () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !activeChat) {
      toast.error('Нет соединения с сервером');
      return;
    }
    if (!message.trim() && !selectedFile) return;

    try {
      let fileUrl = '';
      let fileName = '';
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const uploadRes = await fetch(`${API_BASE}/chat/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const uploadData = await uploadRes.json();
        fileUrl = uploadData.url;
        fileName = selectedFile.name;
      }

      const payload = {
        type: 'send_message',
        data: {
          channel_id: activeChat,
          content: message.trim(),
          file_url: fileUrl,
          file_name: fileName,
        },
      };
      websocket.send(JSON.stringify(payload));
      setMessage('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      console.error('Send message error:', e);
      toast.error('Не удалось отправить сообщение');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTyping = () => {
    if (websocket && activeChat && connectionStatus === 'connected') {
      websocket.send(JSON.stringify({ type: 'typing', data: { channel_id: activeChat } }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Файл слишком большой (макс. 10 МБ)');
        return;
      }
      setSelectedFile(file);
    }
  };

  const searchContacts = async (query: string) => {
    if (!token) return;
    setIsLoadingContacts(true);
    try {
      const res = await fetch(`${API_BASE}/chat/contacts?query=${encodeURIComponent(query)}`, {
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
          return searchContacts(query);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to search contacts: ${res.status} ${res.statusText}`);
      const data: Contact[] = await res.json();
      setContacts(data);
    } catch (e: any) {
      console.error('Error searching contacts:', e);
      toast.error(`Не удалось найти контакты: ${e.message}`);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const createPrivateChat = async (contactId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/private/${encodeURIComponent(contactId)}`, {
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
          return createPrivateChat(contactId);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to create private chat: ${res.status} ${res.statusText}`);
      const newChat: Chat = await res.json();
      setChats((prev) => [...prev, newChat]);
      setActiveChat(newChat.id);
      setShowContactSearch(false);
      setContactSearchQuery('');
      setContacts([]);
    } catch (e) {
      console.error('Error creating private chat:', e);
      toast.error('Не удалось создать личный чат');
    }
  };

  const createGroupChat = async () => {
    if (!token || selectedContacts.length < 2) {
      toast.error('Выберите минимум двух участников для группы');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/chat/chats/group`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: groupName,
          members: selectedContacts.map(c => c.id),
        }),
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
          return createGroupChat();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to create group chat: ${res.status} ${res.statusText}`);
      const newChat: Chat = await res.json();
      setChats((prev) => [...prev, newChat]);
      setActiveChat(newChat.id);
      setShowCreateGroup(false);
      setGroupName('');
      setSelectedContacts([]);
      toast.success('Группа создана');
    } catch (e: any) {
      console.error('Error creating group chat:', e);
      toast.error(`Не удалось создать группу: ${e.message}`);
    }
  };

  const createChannel = async () => {
    if (!token || !channelName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/channel`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: channelName,
          description: channelDescription,
        }),
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
          return createChannel();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to create channel: ${res.status} ${res.statusText}`);
      const newChat: Chat = await res.json();
      setChats((prev) => [...prev, newChat]);
      setActiveChat(newChat.id);
      setShowCreateChannel(false);
      setChannelName('');
      setChannelDescription('');
      toast.success('Канал создан');
    } catch (e: any) {
      console.error('Error creating channel:', e);
      toast.error(`Не удалось создать канал: ${e.message}`);
    }
  };

  const inviteToChannel = async (channelId: string, contactIds: string[]) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${channelId}/invite`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ members: contactIds }),
      });
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (refreshRes.ok) {
          const { access_token } = await res.json();
          refreshToken(access_token);
          return inviteToChannel(channelId, contactIds);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to invite: ${res.status} ${res.statusText}`);
      toast.success('Приглашены');
      setSelectedContacts([]);
      setShowInviteModal(false);
    } catch (e) {
      console.error('Error inviting:', e);
      toast.error('Не удалось пригласить');
    }
  };

  const kickFromChannel = async (channelId: string, contactIds: string[]) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${channelId}/kick`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ members: contactIds }),
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
          return kickFromChannel(channelId, contactIds);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to kick: ${res.status} ${res.statusText}`);
      toast.success('Исключены');
      setSelectedContacts([]);
      setShowKickModal(false);
    } catch (e) {
      console.error('Error kicking:', e);
      toast.error('Не удалось исключить');
    }
  };

  const renameChat = async () => {
    if (!token || !editChatName.trim() || !activeChat) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${activeChat}/rename`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: editChatName,
          description: editChatDescription,
        }),
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
          return renameChat();
        }
        toast.error('Сессия истекла.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('Failed to rename chat');
      const updatedChat = await res.json();
      setChats(chats.map(c => (c.id === activeChat ? updatedChat : c)));
      toast.success('Название обновлено');
      setShowEditChatModal(false);
    } catch (e) {
      toast.error('Не удалось переименовать');
    }
  };

  const deleteChat = async () => {
    if (!token || !activeChat) return;
    if (!window.confirm('Вы уверены, что хотите удалить этот чат?')) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${activeChat}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setChats(chats.filter(c => c.id !== activeChat));
        if (activeChat === activeChat) setActiveChat(null);
        toast.success('Чат удалён');
        setShowEditChatModal(false);
      } else {
        toast.error('Не удалось удалить чат');
      }
    } catch (e) {
      toast.error('Ошибка при удалении');
    }
  };

  const leaveChat = async () => {
    if (!token || !activeChat) return;
    if (!window.confirm('Покинуть этот чат?')) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${activeChat}/leave`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        setChats(chats.filter(c => c.id !== activeChat));
        if (activeChat === activeChat) setActiveChat(null);
        toast.success('Вы покинули чат');
        setShowEditChatModal(false);
      } else {
        toast.error('Не удалось покинуть');
      }
    } catch (e) {
      toast.error('Ошибка при выходе');
    }
  };

  const toggleContactSelection = (contact: Contact) => {
    setSelectedContacts(prev =>
      prev.some(c => c.id === contact.id)
        ? prev.filter(c => c.id !== contact.id)
        : [...prev, contact]
    );
  };

  const filteredChats = chats.filter((chat) => {
    const query = searchQuery.toLowerCase();
    const nameMatch = chat.name ? chat.name.toLowerCase().includes(query) : false;
    const memberMatch = chat.members.some((m) => m.toLowerCase().includes(query));
    return nameMatch || memberMatch;
  });

  const formatTimestamp = (ts: string): string => {
    const d = new Date(ts);
    return isValid(d) ? format(d, 'HH:mm', { locale: ru }) : '—';
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Connection status */}
      <div
        className={`fixed bottom-4 left-4 px-3 py-1 rounded-full text-xs font-medium z-50 ${
          connectionStatus === 'connected'
            ? 'bg-green-100 text-green-800'
            : connectionStatus === 'connecting'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-red-100 text-red-800'
        }`}
      >
        {connectionStatus === 'connected' ? 'Подключено' : connectionStatus === 'connecting' ? 'Подключение...' : 'Отключено'}
      </div>

      {/* Left panel */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Поиск чатов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative ml-2" ref={createOptionsRef}>
            <button
              onClick={() => setShowCreateOptions(!showCreateOptions)}
              className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus size={20} />
            </button>
            {showCreateOptions && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-10 w-48">
                <button
                  onClick={() => {
                    setShowCreateGroup(true);
                    setShowCreateOptions(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center transition-colors"
                >
                  <Users size={16} className="mr-2" />
                  Создать группу
                </button>
                <button
                  onClick={() => {
                    setShowCreateChannel(true);
                    setShowCreateOptions(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center transition-colors"
                >
                  <Users size={16} className="mr-2" />
                  Создать канал
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Contact search */}
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Поиск контактов..."
              value={contactSearchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setContactSearchQuery(val);
                if (val.trim()) {
                  searchContacts(val);
                  setShowContactSearch(true);
                } else {
                  setContacts([]);
                  setShowContactSearch(false);
                }
              }}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {showContactSearch && contactSearchQuery && (
            <div className="border-b border-gray-200">
              <div className="p-3 bg-gray-50">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Результаты:</h4>
                {isLoadingContacts ? (
                  <div className="text-center text-sm text-gray-500">Поиск...</div>
                ) : contacts.length > 0 ? (
                  contacts.map((contact) => (
                    <div
                      key={contact.id}
                      onClick={() => (showInviteModal || showKickModal ? toggleContactSelection(contact) : createPrivateChat(contact.id))}
                      className={`p-2 cursor-pointer hover:bg-blue-50 rounded-lg transition-colors flex items-center ${
                        selectedContacts.some((c) => c.id === contact.id) ? 'bg-blue-100' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-2">
                        <span className="text-xs font-medium">{getInitials(contact.displayName || contact.id)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{contact.displayName}</div>
                        <div className="text-xs text-gray-500 truncate">{contact.position}</div>
                      </div>
                      {(showInviteModal || showKickModal) && (
                        <input
                          type="checkbox"
                          checked={selectedContacts.some((c) => c.id === contact.id)}
                          onChange={() => toggleContactSelection(contact)}
                          className="mr-2"
                        />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowContactSearch(false);
                          setContactSearchQuery('');
                          setContacts([]);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-sm text-gray-500">Не найдено</div>
                )}
              </div>
            </div>
          )}

          {isLoadingChats ? (
            <div className="p-4 text-center text-gray-500">Загрузка...</div>
          ) : filteredChats.length === 0 ? (
            <div className="p-4 text-center text-gray-500">Чаты не найдены</div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setActiveChat(chat.id)}
                className={`flex items-center p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  activeChat === chat.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  {chat.is_channel ? <Users size={24} /> : <UserCircle size={24} />}
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {chat.name || chat.members.filter((m) => m !== username).map(m => getDisplayName(m)).join(', ')}
                      {chat.is_channel && ' 📢'}
                    </h3>
                    {unreadCounts[chat.id] > 0 && (
                      <span className="text-xs bg-red-500 text-white rounded-full px-2 py-1">
                        {unreadCounts[chat.id]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {chat.is_channel ? 'Канал' : chat.is_group ? 'Группа' : 'Личный чат'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {isLoadingMessages && activeChat ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center p-6">Загрузка сообщений...</div>
          </div>
        ) : currentChat ? (
          <>
            <div className="flex items-center p-3 border-b border-gray-200 bg-white">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                {currentChat.is_channel ? <Users size={24} /> : <UserCircle size={24} />}
              </div>
              <div className="ml-3 flex-1">
                <h2 className="text-lg font-medium">
                  {currentChat.name || currentChat.members.filter((m) => m !== username).map(m => getDisplayName(m)).join(', ')}
                  {currentChat.is_channel && ' 📢'}
                </h2>
                <p className="text-xs text-gray-500">Создатель: {getDisplayName(currentChat.creator_username)}</p>
                <p className="text-xs text-gray-500">Участники: {currentChat.members.map(m => getDisplayName(m)).join(', ')}</p>
                {isTyping && <p className="text-xs text-gray-500">{getDisplayName(typingUser)} печатает…</p>}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  className="p-2 text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    setEditChatName(currentChat.name || '');
                    setEditChatDescription(currentChat.description || '');
                    setShowEditChatModal(true);
                  }}
                  title="Настройки"
                >
                  <DotsThreeVertical size={20} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-4 bg-gray-50"
              onScroll={handleScroll}
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z\' fill=\'%239C92AC\' fill-opacity=\'0.05\' fill-rule=\'evenodd\'/%3E%3C/svg%3E")',
              }}
            >
              {currentMessages.map((msg) => {
                const isOwn = msg.sender === username;
                const senderName = getDisplayName(msg.sender);
                return (
                  <div key={msg.id} className={`mb-4 flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        isOwn
                          ? 'bg-blue-500 text-white rounded-br-none'
                          : 'bg-white border border-gray-200 rounded-bl-none'
                      }`}
                    >
                      {!isOwn && (
                        <div className="text-xs font-medium text-gray-700 mb-1">{senderName}</div>
                      )}
                      {msg.file_url && (
                        <div className="mb-2">
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                            {msg.file_name}
                          </a>
                        </div>
                      )}
                      <div className="text-sm">{msg.content}</div>
                      <div className="flex items-center justify-end mt-1 space-x-1">
                        <span className="text-xs opacity-70">{formatTimestamp(msg.timestamp)}</span>
                        {isOwn && (
                          <span className={`text-xs ${msg.is_read ? 'text-blue-300' : 'text-gray-200'}`}>
                            ✓{msg.is_read && '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white relative">
              {showEmojiPicker && (
                <div className="absolute bottom-16 left-4 z-10">
                  <EmojiPicker onEmojiClick={handleEmojiClick} />
                </div>
              )}
              <div className="flex items-center">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                <button
                  className="p-2 text-gray-500 hover:text-gray-700"
                  title="Прикрепить файл"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={20} />
                </button>
                <button
                  className="p-2 text-gray-500 hover:text-gray-700"
                  title="Эмодзи"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smiley size={20} />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Напишите сообщение..."
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    handleTyping();
                  }}
                  onKeyDown={handleKeyDown}
                  className="flex-1 mx-2 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={(!message.trim() && !selectedFile) || connectionStatus !== 'connected'}
                  className={`p-2 rounded-full ${
                    (message.trim() || selectedFile) && connectionStatus === 'connected'
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <PaperPlaneRight size={20} />
                </button>
              </div>
              {selectedFile && (
                <div className="mt-2 text-sm text-gray-600">
                  Файл: {selectedFile.name}
                  <button
                    className="ml-2 text-red-500"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center p-6 max-w-md">
              <UserCircle size={48} className="mx-auto text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">Выберите чат</h3>
              <p className="mt-2 text-sm text-gray-500">Выберите чат или создайте новый</p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Chat Modal */}
      {showEditChatModal && currentChat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Настройки чата</h3>
              <button onClick={() => setShowEditChatModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Название"
              value={editChatName}
              onChange={(e) => setEditChatName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-4"
            />
            <textarea
              placeholder="Описание"
              value={editChatDescription}
              onChange={(e) => setEditChatDescription(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-4"
            />
            <div className="flex flex-col space-y-2">
              <button onClick={renameChat} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                Сохранить
              </button>
              {currentChat.creator_username === username && (
                <button onClick={deleteChat} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center">
                  <Trash size={16} className="mr-1" /> Удалить чат
                </button>
              )}
              {!currentChat.is_channel && (
                <button onClick={leaveChat} className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 flex items-center justify-center">
                  <SignOut size={16} className="mr-1" /> Покинуть
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals: Invite, Kick, Create Group/Channel */}
      {/* ... (оставлены без изменений, но можно улучшить аналогично) */}
    </div>
  );
};

export default ChatComponent;