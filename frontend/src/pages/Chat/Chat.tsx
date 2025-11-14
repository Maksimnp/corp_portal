import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { DotsThreeVertical, MagnifyingGlass, UserCircle, Users, Plus } from 'phosphor-react';
import { toast } from 'react-toastify';
import copy from 'copy-to-clipboard';
import type { Chat, Message, Contact } from '../../types/chat';
import RenderChatWindow  from '../../components/chat_page/ChatWindow';
import { getChatDisplayIcon, getChatDisplayName, normalizeMessages } from '../../utils/chat';
import RenderSidebar from '../../components/chat_page/Sidebar';
import RenderModals from '../../components/chat_page/Modals';
import { useTheme } from '../../hooks/ThemeContext';
import {getAvatarData, setAvatarData} from '../../utils/avatarCache'

const ChatComponent: React.FC = () => {
  // Авторизация и пользователь
  const { token, username } = useAuth();
  const { theme } = useTheme();

  // Основные состояния чата
  const [message, setMessage] = useState('');
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<{ [key: string]: Message[] }>({});
  const [chats, setChats] = useState<Chat[]>([]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactMap, setContactMap] = useState<{ [key: string]: string }>({});

  // Поиск
  const [searchQuery, setSearchQuery] = useState('');
  const [chatsSearchQuery, setChatsSearchQuery] = useState('');
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [showContactSearch, setShowContactSearch] = useState(false);

  // WebSocket и соединение
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  // Загрузка данных
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  // Файлы и медиа
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Редактирование и цитирование
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [quotedMessageData, setQuotedMessageData] = useState<Record<string, Message | null>>({});
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  
  // Удаление и модальные окна
  const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showKickModal, setShowKickModal] = useState(false);
  const [selectedToKick, setSelectedToKick] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<Message | null>(null);
  const [showChatInfoSidebar, setShowChatInfoSidebar] = useState(false);

  // Управление чатами (группы / каналы)
  const [unreadReactionNotifications, setUnreadReactionNotifications] = useState<Record<string, string[]>>({});
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [showEditChatModal, setShowEditChatModal] = useState(false);
  const [editChatName, setEditChatName] = useState('');
  const [editChatDescription, setEditChatDescription] = useState('');
  const [showForwardMessageModal, setShowForwardMessageModal] = useState(false);
  const [showFileDragModal, setShowFileDragModal] = useState(false);
  const [sentReadIds, setSentReadIds] = useState<Set<string>>(new Set());
  const [sentReactionReadIds, setSentReactionReadIds] = useState<Set<string>>(new Set());
  // Контекстные меню
  const [messageContextMenu, setMessageContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    message: Message | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    message: null,
  });
  const [userContextMenu, setUserContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    userId: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    userId: null,
  });

  // Прокрутка и позиционирование
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Окна чатов (для пагинации)
  type ChatWindow = {
    oldestMessageId: string | null;
    newestMessageId: string | null;
    hasOlder: boolean;
    hasNewer: boolean;
  };
  const [chatWindows, setChatWindows] = useState<Record<string, ChatWindow>>({});

  // Статусы и активность
  const [userStatuses, setUserStatuses] = useState<{ [username: string]: string }>({});
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Рефы для DOM и UI
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const createOptionsRef = useRef<HTMLDivElement>(null);
  const chatOptionsRef = useRef<HTMLDivElement>(null);
  const stickerPickerRef = useRef<HTMLDivElement>(null);
  const messageContextMenuRef = useRef<HTMLDivElement>(null);
  const userContextMenuRef = useRef<HTMLDivElement>(null);

  // Прочие
  const [limit] = useState(50);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  const WS_BASE: string = import.meta.env.VITE_WS_BASE ?? (import.meta.env.VITE_ENV === 'production' ? 'wss://192.1.66.117:8000' : 'ws://192.1.66.117:8000');
  const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://192.1.66.117:8000';

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const currentChat = useMemo(() => chats.find(chat => chat.id === activeChat), [chats, activeChat]);

  const currentMessages = useMemo(() => {
    return activeChat ? (messagesByChat[activeChat] || []).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) : [];
  }, [activeChat, messagesByChat]);

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return currentMessages;
    const lowerQuery = searchQuery.toLowerCase();
    return currentMessages.filter(m =>
      m.content?.toLowerCase().includes(lowerQuery) ||
      m.file_name?.toLowerCase().includes(lowerQuery)
    );
  }, [currentMessages, searchQuery]);

  useEffect(() => {
    console.log(unreadReactionNotifications);
  }, [unreadReactionNotifications])

  const unreadCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    chats.forEach((chat) => {
      const chatMessages = messagesByChat[chat.id] || [];
      if (chatMessages.length === 0) {
        counts[chat.id] = chat.unread_count;
      } else {
        counts[chat.id] = chatMessages.filter(
          (m) => !m.is_read && m.sender !== username
        ).length + chat.unread_count;
      }
    });
    return counts;
  }, [messagesByChat, chats, username]);

  const addTypingUser = useCallback((chatId: string, username: string) => {
    setTypingUsers(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(chatId)) {
        newMap.set(chatId, new Set());
      }
      newMap.get(chatId)!.add(username);
      return newMap;
    });
  }, []);

  const removeTypingUser = useCallback((chatId: string, username: string) => {
    setTypingUsers(prev => {
      const newMap = new Map(prev);
      const users = newMap.get(chatId);
      if (users) {
        users.delete(username);
        if (users.size === 0) {
          newMap.delete(chatId);
        }
      }
      return newMap;
    });
  }, []);

  const handleReactToMessage = (messageId: string, messageSender: string | undefined, reaction: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !messageSender) {
      toast.error('Нет соединения с сервером');
      return;
    }
    const payload = {
      type: 'react',
      data: {
        messageSender: messageSender,
        message_id: messageId,
        reaction,
        channel_id: currentChat?.id,
      },
    };
    websocket.send(JSON.stringify(payload));
    setMessageContextMenu(prev => ({ ...prev, visible: false }));
  };

  const refreshTokenAndRetry = useCallback(async <T extends unknown>(apiCall: () => Promise<T>): Promise<T> => {
    try {
      return await apiCall();
    } catch (error: any) {
      if (error.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (refreshRes.ok) {
          const { access_token } = await refreshRes.json();
          // TODO: обновить токен в контексте
          return await apiCall();
        }
        window.location.href = '/login';
        throw new Error('Session expired');
      }
      throw error;
    }
  }, [API_BASE]);

  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (createOptionsRef.current && !createOptionsRef.current.contains(event.target as Node)) {
        setShowCreateOptions(false);
      }
      if (chatOptionsRef.current && !chatOptionsRef.current.contains(event.target as Node)) {
        setShowChatOptions(false);
      }
      if (stickerPickerRef.current && !stickerPickerRef.current.contains(event.target as Node)) {
        setShowStickerPicker(false);
      }
      if (messageContextMenuRef.current && !messageContextMenuRef.current.contains(event.target as Node)) {
        setMessageContextMenu(prev => ({...prev, visible: false}));
      }
      if (userContextMenuRef.current && !userContextMenuRef.current.contains(event.target as Node)) {
        setUserContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (activeChat) {
      setChats(prev => prev.map(chat =>
        chat.id === activeChat
          ? { ...chat }
          : chat
      ));
    }
  }, [activeChat]);

  const handleUserContextMenu = (event: React.MouseEvent, userId: string) => {
    event.preventDefault();
    setUserContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      userId,
    });
  };

  const handleContextMenuSendMessage = () => {
    if (userContextMenu.userId) {
      createPrivateChat(userContextMenu.userId);
      setUserContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const handleMessageContextMenu = (event: React.MouseEvent, msg: Message) => {
    event.preventDefault();
    setMessageContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      message: msg,
    });
  };

  const handleContextMenuEdit = () => {
    if (messageContextMenu.message) {
      startEditMessage(messageContextMenu.message);
      setMessageContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const handleContextMenuDelete = () => {
    if (messageContextMenu.message) {
      setMessageToDelete(messageContextMenu.message);
      setShowDeleteMessageModal(true);
      setMessageContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const handleContextMenuCopy = () => {
    if (messageContextMenu.message?.content) {
      try {
        copy(messageContextMenu.message.content);
        toast.success('Текст скопирован');
      } catch (err) {
        toast.error('Не удалось скопировать текст');
      }
      setMessageContextMenu(prev => ({ ...prev, visible: false }));
    }
  };
  const handleForwardMessage = () => {
    if (messageContextMenu.message) {
      forwardMessageTo(messageContextMenu.message);
      setShowForwardMessageModal(false);
    }
  };

  const handleContextMenuQuote = () => {
    if (messageContextMenu.message) {
      quoteMessage(messageContextMenu.message);
      setMessageContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const handleContextMenuForward = () => {
    if (messageContextMenu.message) {
      setShowForwardMessageModal(true);
      setForwardMessage(messageContextMenu.message);
      setMessageContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  useEffect(() => {
    if (!token || Object.keys(contactMap).length === 0) return;

    const loadMissingAvatars = async () => {
      const userIds = Object.values(contactMap);
      const missingUserIds = userIds.filter(userId => !getAvatarData(userId));

      if (missingUserIds.length === 0) return;

      await Promise.all(
        missingUserIds.map(async (userId) => {
          const avatar = await fetchAvatar(userId);
          if (avatar) {
            setAvatarData(userId, avatar);
          }
        })
      );
    };

    loadMissingAvatars();
  }, [contactMap, token]);

  const fetchAvatar = async (userId: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/avatar`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.warn(`Аватар для ${userId} не найден`);
        } else {
          console.error(`Ошибка загрузки аватара для ${userId}:`, res.status);
        }
        return null;
      }

      const { avatar } = await res.json();
      return avatar;
    } catch (err) {
      console.error(`Не удалось загрузить аватар для ${userId}:`, err);
      return null;
    }
  };

  const fetchChats = useCallback(async () => {
    if (!token) return;
    setIsLoadingChats(true);
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats-with-last-message`, {
          headers: authHeaders(),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to load chats: ${res.status} ${res.statusText}`);
      }
      const data: Chat[] = await res.json();
      // console.log('Fetched chats:', data);
      setChats(data);
      
      const allMembers = new Set<string>();
      data.forEach((chat) => {
        chat.members.forEach((m) => allMembers.add(m));
      });
      
      const newContactEntries: Record<string, string> = {};
      const contactFetchPromises = [...allMembers].map(async (m) => {
        if (!contactMap[m]) {
          try {
            const res = await refreshTokenAndRetry(() =>
              fetch(`${API_BASE}/chat/contacts?query=${encodeURIComponent(m)}`, {
                headers: authHeaders(),
              })
            );
            if (res.ok) {
              const contactsData = await res.json();
              if (contactsData.length > 0) {
                newContactEntries[m] = contactsData[0].displayName;
              }
            }
          } catch (err) {
            console.error(`Failed to fetch contact for ${m}:`, err);
          }
        }
      });
      await Promise.all(contactFetchPromises);
      if (Object.keys(newContactEntries).length > 0) {
        setContactMap((prev) => ({ ...prev, ...newContactEntries }));
      }
    } catch (e: any) {
      console.error('Error fetching chats:', e);
      toast.error('Не удалось загрузить чаты. Попробуйте позже.');
    } finally {
      setIsLoadingChats(false);
    }
  }, [token, contactMap, refreshTokenAndRetry, authHeaders, API_BASE]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const fetchQuotedMessageData = async (quotedMessageId: string): Promise<Message | null> => {
    if (quotedMessageData[quotedMessageId] !== undefined) {
      return quotedMessageData[quotedMessageId];
    }
    try {
      const response = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/messages/${quotedMessageId}`, {
          method: 'GET',
          headers: authHeaders(),
        })
      );
      if (!response.ok) {
        if (response.status === 404) {
          setQuotedMessageData(prev => ({ ...prev, [quotedMessageId]: null }));
          return null;
        } else {
          return null;
        }
      }
      const messageData: Message = await response.json();
      setQuotedMessageData(prev => ({ ...prev, [quotedMessageId]: messageData }));
      return messageData;
    } catch (error) {
      console.error('Error fetching quoted message:', error);
      return null;
    }
  };

  const loadMessagesAround = async (messageId: string) => {
    if (!token || !activeChat) return;

    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/messages/around/${messageId}`, {
          headers: authHeaders(),
        })
      );

      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Сообщение не найдено или недоступно');
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
        return;
      }

      const data: any[] = await res.json();

      const normalizedMessages = data.map(msg => ({
        ...msg,
        id: String(msg.id),
        is_read: Boolean(msg.is_read),
        timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
        file_url: msg.file_url,
        file_name: msg.file_name,
        edited: Boolean(msg.edited),
      })).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      setMessagesByChat(prev => ({
        ...prev,
        [activeChat]: normalizedMessages,
      }));

      const oldest = normalizedMessages[0]?.id || null;
      const newest = normalizedMessages[normalizedMessages.length - 1]?.id || null;

      setChatWindows(prev => ({
        ...prev,
        [activeChat]: {
          oldestMessageId: oldest,
          newestMessageId: newest,
          hasOlder: true,
          hasNewer: true,
        }
      }));

      setTimeout(() => {
        const el = document.querySelector(`[data-message-id="${messageId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } catch (e) {
      console.error('Ошибка загрузки сообщений вокруг:', e);
      toast.error('Не удалось загрузить сообщение и его контекст');
    }
  };

  const markMessageAsReadWhenInView = useCallback(async (messageId: string, channelId: string) => {
  const uniqueId = `${messageId}-${channelId}`;
  if (sentReadIds.has(uniqueId) || !activeChat || activeChat !== channelId || !username) {
    return;
  }

  setMessagesByChat(prev => {
    const chatMessages = prev[channelId];
    if (!chatMessages) return prev;

    const messageIndex = chatMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || chatMessages[messageIndex].sender === username) {
        return prev;
    }

    const updatedMessages = [...chatMessages];
    updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], is_read: true };

    setSentReadIds(prevSet => new Set(prevSet).add(uniqueId));

    return { ...prev, [channelId]: updatedMessages };
  });

  try {
    const res = await refreshTokenAndRetry(() =>
      fetch(`${API_BASE}/chat/messages/batch_read`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          message_ids: [messageId],
          channel_id: channelId
        }),
      })
    );
    if (!res.ok) {
      setSentReadIds(prevSet => {
        const newSet = new Set(prevSet);
        newSet.delete(uniqueId);
        return newSet;
      });
      setMessagesByChat(prev => {
        const chatMessages = prev[channelId];
        if (!chatMessages) return prev;
        const messageIndex = chatMessages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return prev;
        const updatedMessages = [...chatMessages];
        updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], is_read: false };
        return { ...prev, [channelId]: updatedMessages };
      });
    } else {
      setChats(prevChats => prevChats.map(chat =>
        chat.id === channelId ? { ...chat, unread_count: Math.max(0, chat.unread_count - 1) } : chat
      ));
    }
  } catch (e) {
    setSentReadIds(prevSet => {
      const newSet = new Set(prevSet);
      newSet.delete(uniqueId);
      return newSet;
    });
    setMessagesByChat(prev => {
      const chatMessages = prev[channelId];
      if (!chatMessages) return prev;
      const messageIndex = chatMessages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return prev;
      const updatedMessages = [...chatMessages];
      updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], is_read: false };
      return { ...prev, [channelId]: updatedMessages };
    });
  }
}, [activeChat, username, sentReadIds, refreshTokenAndRetry, authHeaders, API_BASE]);

  const markReactionAsReadWhenInView = useCallback(async (messageId: string, channelId: string) => {
    const uniqueId = `${messageId}-${channelId}`;
    if (sentReactionReadIds.has(uniqueId) || !activeChat || activeChat !== channelId) {
      return;
    }

    setUnreadReactionNotifications(prev => {
      const current = prev[channelId] || [];
      const filtered = current.filter(id => id !== messageId);
      const newNotif = { ...prev };
      if (filtered.length === 0) {
        delete newNotif[channelId];
      } else {
        newNotif[channelId] = filtered;
      }
      return newNotif;
    });

    setSentReactionReadIds(prev => new Set(prev).add(uniqueId));

    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/reactions/batch_read`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ message_ids: [messageId] }),
        })
      );
      if (!res.ok) {
        throw new Error('Failed to mark reaction as read');
      }
    } catch (e) {
      console.error('Error marking reaction as read:', e);
      setUnreadReactionNotifications(prev => ({
        ...prev,
        [channelId]: [...(prev[channelId] || []), messageId]
      }));
      setSentReactionReadIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(uniqueId);
        return newSet;
      });
    }
  }, [activeChat, unreadReactionNotifications, sentReactionReadIds, refreshTokenAndRetry, authHeaders, API_BASE]);

  const loadLatestMessages = async () => {
    if (!activeChat || !token) return;
    setIsLoadingMessages(true);
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/${activeChat}/messages?limit=${limit}`, {
          headers: authHeaders(),
        })
      );
      if (!res.ok) throw new Error(`Failed to load messages: ${res.status} ${res.statusText}`);
      const data: any[] = await res.json();
      const normalized = normalizeMessages(data);

      if (normalized.length === 0) {
        setMessagesByChat(prev => ({ ...prev, [activeChat]: [] }));
        setChatWindows(prev => ({
          ...prev,
          [activeChat]: {
            oldestMessageId: null,
            newestMessageId: null,
            hasOlder: false,
            hasNewer: false,
          }
        }));
        return;
      }

      setMessagesByChat(prev => ({ ...prev, [activeChat]: normalized }));

      const oldest = normalized[0]?.id || null;
      const newest = normalized[normalized.length - 1]?.id || null;

      setChatWindows(prev => ({
        ...prev,
        [activeChat]: {
          oldestMessageId: oldest,
          newestMessageId: newest,
          hasOlder: true,
          hasNewer: false,
        }
      }));
    } catch (e) {
      console.error('Error loading messages:', e);
      toast.error('Не удалось загрузить сообщения. Попробуйте позже.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (activeChat) {
      if (!messagesByChat[activeChat] ) {
        loadLatestMessages();
      }
      if (messagesByChat[activeChat] && messagesByChat[activeChat].length < 50) {
        const oldest = messagesByChat[activeChat][0]?.id;
        loadOlderMessages(oldest);
      }
    }
  }, [activeChat, token]);

  // useEffect(() => {
  //   if (!activeChat || !token || !username) return;
    
  //   const unread = currentMessages.filter((m) => !m.is_read && m.sender !== username);
  //   if (unread.length === 0) return;
    
  //   (async () => {
  //     try {
  //       const res = await refreshTokenAndRetry(() =>
  //         fetch(`${API_BASE}/chat/messages/batch_read`, {
  //           method: 'POST',
  //           headers: authHeaders(),
  //           body: JSON.stringify({ 
  //             message_ids: unread.map((m) => m.id),
  //             channel_id: activeChat
  //            }),
  //         })
  //       );
  //       if (res.ok) {
  //         setMessagesByChat((prev) => ({
  //           ...prev,
  //           [activeChat]: prev[activeChat].map((m) =>
  //             unread.some((u) => u.id === m.id) ? { ...m, is_read: true } : m
  //           ),
  //         }));
  //       }
  //     } catch (e) {
  //       console.error('Failed to mark messages as read:', e);
  //     }
  //   })();
  // }, [currentMessages, activeChat, token, username, refreshTokenAndRetry, authHeaders, API_BASE]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        
        if (data.type === 'error') {
            console.error('WebSocket error:', data.error);
            return;
        }

        if (data.type === 'new_message' || data.type === 'forward_message') {
            const channelId = data.data.channel_id;
            console.log("Пришло сообщение", data.type)
            // Обновление последнего сообщения в списке чатов
            setChats(prevChats =>
                prevChats.map(chat => {
                    if (chat.id === channelId) {
                        const newLastMessage = {
                            id: data.data.id,
                            sender: data.data.sender,
                            content: data.data.content,
                            timestamp: data.data.timestamp,
                            file_name: data.data.file_name,
                            is_read: data.data.is_read,
                            forward_message_id: data.data.forward_message_id ?? null,
                        };
                        return {
                            ...chat,
                            last_message: newLastMessage,
                        };
                    }
                    return chat;
                })
            );
            // setChatWindows()
            // Добавление сообщения в историю
            setMessagesByChat(prev => {
                const channelId = data.data.channel_id;
                const currentMsgsInUpdater = prev[channelId] || [];
                const newMsgId = data.data.id;
                
                // Проверяем, нет ли уже такого сообщения
                const existingMsgIndex = currentMsgsInUpdater.findIndex(m => m.id === newMsgId);
                if (existingMsgIndex !== -1) {
                    return prev;
                }

                // Загружаем данные цитируемого сообщения если нужно
                const newMessageQuotedId = data.data.quoted_message_id || data.data.forward_message_id;
                if (newMessageQuotedId) {
                    const isDataAvailableLocally = currentMsgsInUpdater.some(m => m.id === newMessageQuotedId);
                    const isDataAlreadyFetched = quotedMessageData[newMessageQuotedId] !== undefined;
                    if (!isDataAvailableLocally && !isDataAlreadyFetched) {
                        fetchQuotedMessageData(newMessageQuotedId).catch(() => {});
                    }
                }

                // Нормализуем и добавляем сообщение
                const normalizedMessage = {
                    ...data.data,
                    id: String(data.data.id),
                    is_read: Boolean(data.data.is_read),
                    reactions_by_user: data.data.reactions_by_user || {},
                    timestamp: typeof data.data.timestamp === 'string' ? data.data.timestamp : new Date(data.data.timestamp).toISOString(),
                    file_url: data.data.file_url,
                    file_name: data.data.file_name,
                    edited: Boolean(data.data.edited),
                };

                const updatedMessages = [...currentMsgsInUpdater, normalizedMessage]
                    .sort((a, b) => {
                        const timeA = new Date(a.timestamp).getTime();
                        const timeB = new Date(b.timestamp).getTime();
                        if (timeA !== timeB) return timeA - timeB;
                        return a.id.localeCompare(b.id);
                    });

                return {
                    ...prev,
                    [channelId]: updatedMessages
                };
            });
            // Прокрутка к низу если это активный чат
            if (activeChat === data.data.channel_id) {
                setShouldScrollToBottom(true);
            }
        }
        
        // Остальные обработчики...
        else if (data.type === 'typing_start') {
            const { channel_id, user } = data.data;
            addTypingUser(channel_id, user);
        }
        else if (data.type === 'typing_stop') {
            const { channel_id, user } = data.data;
            removeTypingUser(channel_id, user);
        }
        else if (data.type === "group_created" || data.type === "private_chat_created") {
            setChats((prev) => [...prev, data.data]);
        }
        else if (data.type === 'message_edited') {
            setMessagesByChat(prev => ({
                ...prev,
                [data.data.channel_id]: prev[data.data.channel_id].map(m =>
                    m.id === data.data.id ? { ...m, content: data.data.content, edited: true } : m
                ),
            }));
        }
        else if (data.type === "user_status") {
            setUserStatuses(data.data);
        }
        else if (data.type === "reaction_notification") {
          const { message_id, user_id, reaction, channel_id } = data.data;
          setUnreadReactionNotifications(prev => {
            const current = prev[channel_id] || [];
            if (!current.includes(message_id)) {
              return {
                ...prev,
                [channel_id]: [...current, message_id]
              };
            }
            return prev;
          });
        }
        else if (data.type === 'reaction_update') {
          const { message_id, user_id, reaction } = data.data;

          setMessagesByChat(prev => {
            const updated = { ...prev };
            for (const chatId in updated) {
              const msgs = updated[chatId];
              const msgIndex = msgs.findIndex(m => m.id === message_id);
              if (msgIndex !== -1) {
                const msg = { ...msgs[msgIndex] };
                const reactions = { ...msg.reactions_by_user };

                if (reaction === null) {
                  // Удаляем реакцию
                  delete reactions[user_id];
                } else {
                  // reaction — это ReactionInfo
                  reactions[user_id] = reaction;
                }

                updated[chatId][msgIndex] = {
                  ...msg,
                  reactions_by_user: reactions,
                };
                break;
              }
            }
            return updated;
          });
        }
        else if (data.type === "user_left") {
            const left_user = data.data.username;
            const chat_id = data.data.channel_id;
            setChats(prevChats =>
                prevChats.map(chat =>
                    chat.id === chat_id
                        ? {
                            ...chat,
                            members: chat.members.filter(member => member !== left_user)
                        }
                        : chat
                )
            );
        }
        else if (data.type === "batch_read") {
            const msg_ids = data.data.message_ids;
            const chat_id = data.data.channel_id;
            setMessagesByChat(prev => ({
                ...prev,
                [chat_id]: (prev[chat_id] || []).map(msg => 
                    msg_ids.includes(msg.id) ? { ...msg, is_read: true } : msg
                )
            }));
        }
        else if (data.type === "chat_deleted") {
            const chatId = data.data.channel_id;
            setChats(prev => prev.filter(c => c.id !== chatId));
            if (activeChat === chatId) setActiveChat(null);
        }
        else if (data.type === "channel_kick") {
            const kicked_members = data.data.members;
            const channel_id = data.data.channel_id;
            setChats(prevChats =>
                prevChats.map(chat =>
                    chat.id === channel_id
                        ? {
                            ...chat,
                            members: chat.members.filter(member => !kicked_members.includes(member))
                        }
                        : chat
                )
            );
        }
        else if (data.type === 'message_deleted') {
            const deletedMessageId = data.data.id;
            const channelId = data.data.channel_id;
            setMessagesByChat(prev => {
                const currentMessages = prev[channelId] || [];
                const updatedMessages = currentMessages.filter(msg => msg.id !== deletedMessageId);
                return {
                    ...prev,
                    [channelId]: updatedMessages
                };
            });
            setQuotedMessageData(prev => {
                const newState = { ...prev };
                if (newState[deletedMessageId] !== undefined) {
                    delete newState[deletedMessageId];
                }
                return newState;
            });
        }
        else if (data.type === 'pong') {
            // Обработка pong сообщения
            console.log('WebSocket pong received');
        }
        else {
            console.log('Unhandled WebSocket message type:', data.type);
        }
    } catch (e) {
        console.error('Ошибка обработки сообщения WebSocket:', e);
    }
}, [username, activeChat, contactMap, chats, quotedMessageData, addTypingUser, removeTypingUser]);

const markReactionAsRead = async (messageId: string, channelId: string) => {
  if (!unreadReactionNotifications[messageId]) return;

  try {
    const res = await refreshTokenAndRetry(() =>
      fetch(`${API_BASE}/chat/reactions/batch_read`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message_ids: [messageId] }),
      })
    );
    if (res.ok) {
      setUnreadReactionNotifications(prev => {
        const current = prev[channelId] || [];
        const filtered = current.filter(id => id !== messageId);

        if (filtered.length === 0) {
          const newNotif = { ...prev };
          delete newNotif[channelId];
          return newNotif;
        }

        return {
          ...prev,
          [channelId]: filtered
        };
      });
    }
  } catch (e) {
    console.error('Failed to mark reaction as read:', e);
  }
};

  useEffect(() => {
    if (!token || !username) return;
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseDelay = 3000;
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
          setConnectionStatus('connected');
          reconnectAttempts = 0;
          setWebsocket(ws);
          pingIntervalRef.current = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 15000);
        };
        ws.onmessage = (event) => {
          if (!isMounted) return;
          handleWebSocketMessage(event);
        };
        ws.onerror = (e) => {
          if (!isMounted) return;
          setConnectionStatus('disconnected');
          console.error('Ошибка соединения с WebSocket');
        };
        ws.onclose = (event) => {
          if (!isMounted) return;
          setConnectionStatus('disconnected');
          setWebsocket(null);
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = baseDelay * Math.pow(1.5, reconnectAttempts - 1);
            reconnectTimeoutRef.current = setTimeout(connect, delay);
          } else {
            console.error('Не удалось подключиться к чату. Проверьте соединение или попробуйте позже.');
          }
        };
      } catch (error) {
        setConnectionStatus('disconnected');
        console.error('Ошибка инициализации WebSocket');
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = baseDelay * Math.pow(1.5, reconnectAttempts - 1);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      }
    };
    
    connect();
    
    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (ws) ws.close();
    };
  }, [token, username, handleWebSocketMessage, WS_BASE]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  
  // useEffect(() => {
  //     setTimeout(() => {
  //       if (messagesEndRef.current && shouldScrollToBottom) {
  //         messagesEndRef.current.scrollIntoView({ block: 'end', behavior: 'auto' });
  //         setShouldScrollToBottom(false);
  //       }
  //     }, 100);
  // }, [shouldScrollToBottom]);
  
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const container = messagesContainerRef.current;
    if (!container || !activeChat) return;

    const window = chatWindows[activeChat];
    if (!window) return;

    if (target.scrollTop <= 200 && window.hasOlder && !isLoadingMessages) {
      loadOlderMessages();
    }

    if (!isAutoScrolling) {
      const isNearBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
      setIsAtBottom(isNearBottom);
      if (isNearBottom && window.hasNewer && !isLoadingMessages) {
        loadNewerMessages();
      }
    }
  };

  const loadNewerMessages = async () => {
    if (!activeChat || isLoadingMessages) return;
    const window = chatWindows[activeChat];
    if (!window?.hasNewer || !window.newestMessageId) return;

    setIsLoadingMessages(true);
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/${activeChat}/messages/after/${window.newestMessageId}?limit=50`, {
          headers: authHeaders(),
        })
      );

      if (!res.ok) throw new Error('Failed to load newer');

      const data: any[] = await res.json();
      const normalized = normalizeMessages(data);

      if (normalized.length === 0) {
        setChatWindows(prev => ({
          ...prev,
          [activeChat]: { ...prev[activeChat], hasNewer: false }
        }));
        return;
      }

      setMessagesByChat(prev => {
        const current = prev[activeChat] || [];
        const currentIds = new Set(current.map(m => m.id));
        const uniqueNew = normalized.filter(m => !currentIds.has(m.id));
        const combined = [...current, ...uniqueNew];
        return { ...prev, [activeChat]: combined };
      });

      setChatWindows(prev => {
        const newest = normalized[normalized.length - 1]?.id || prev[activeChat].newestMessageId;
        return {
          ...prev,
          [activeChat]: {
            ...prev[activeChat],
            newestMessageId: newest,
            hasNewer: normalized.length === 50,
          }
        };
      });

    } catch (e) {
      console.error('Load newer failed', e);
      toast.error('Не удалось загрузить новые сообщения');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const loadOlderMessages = async (oldestMessageId?: string) => {
    if (!activeChat || isLoadingMessages) return;
    const window = chatWindows[activeChat];
    // if (oldestMessageId || !window?.hasOlder || !window.oldestMessageId) return;
    const oldestMessage = (oldestMessageId) ? oldestMessageId : window.oldestMessageId;
    setIsLoadingMessages(true);
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/${activeChat}/messages/before/${oldestMessage}?limit=50`, {
          headers: authHeaders(),
        })
      );

      if (!res.ok) throw new Error('Failed to load older');

      const data: any[] = await res.json();
      const normalized = normalizeMessages(data);

      if (normalized.length === 0) {
        setChatWindows(prev => ({
          ...prev,
          [activeChat]: { ...prev[activeChat], hasOlder: false }
        }));
        return;
      }

      setMessagesByChat(prev => {
        const current = prev[activeChat] || [];
        const currentIds = new Set(current.map(m => m.id));
        const uniqueNew = normalized.filter(m => !currentIds.has(m.id));
        const combined = [...uniqueNew, ...current];
        return { ...prev, [activeChat]: combined };
      });

      setChatWindows(prev => {
        const oldest = normalized[0]?.id || prev[activeChat].oldestMessageId;
        return {
          ...prev,
          [activeChat]: {
            ...prev[activeChat],
            oldestMessageId: oldest,
            hasOlder: normalized.length === 50,
          }
        };
      });

    } catch (e) {
      console.error('Load older failed', e);
      toast.error('Не удалось загрузить старые сообщения');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        audioChunksRef.current = [];
        sendVoiceMessage(audioBlob);
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (e) {
      console.error('Error starting recording:', e);
      toast.error('Не удалось начать запись');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendVoiceMessage = async (audioBlob: Blob) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !activeChat) {
      toast.error('Нет соединения с сервером');
      return;
    }
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice_message.ogg');
    try {
      const uploadRes = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
      );
      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();
      const payload = {
        type: 'send_message',
        data: {
          channel_id: activeChat,
          content: '',
          file_url: uploadData.url,
          file_name: 'Голосовое сообщение.ogg',
        },
      };
      websocket.send(JSON.stringify(payload));
    } catch (e) {
      console.error('Error sending voice message:', e);
      toast.error('Не удалось отправить голосовое сообщение');
    }
  };

  const quoteMessage = (msg: Message) => {
    filteredChats
    setQuotedMessage(msg);
    inputRef.current?.focus();
  };

  const forwardMessageTo = async (msg: Message) => {
    if (!username) return;
    
    const user = selectedContacts[0].id;
    const existingChat = filteredChats.find(chat => 
      !chat.is_group && 
      !chat.is_channel && 
      chat.members.includes(user) && 
      chat.members.includes(username)
    );

    let targetChatId = existingChat?.id;

    if (targetChatId === undefined) {
      await createPrivateChat(user);
      const newChat = filteredChats.find(chat => 
        !chat.is_group && 
        !chat.is_channel && 
        chat.members.includes(user) && 
        chat.members.includes(username)
      );
      targetChatId = newChat?.id;
    }

    if (targetChatId) {
      setActiveChat(targetChatId);
      setForwardMessage(msg);
      inputRef.current?.focus();
    }
  };

  const cancelQuote = () => {
    setQuotedMessage(null);
  };

  const startEditMessage = (msg: Message) => {
    if (msg.sender === username) {
      setEditingMessage(msg);
      setMessage(msg.content || '');
      inputRef.current?.focus();
    }
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setMessage('');
  };

  const cancelForward = () => {
    setForwardMessage(null);
    setMessage('');
  }

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;
    if (messageToDelete.sender !== username) {
      toast.error('Вы можете удалять только свои сообщения');
      return;
    }
    if (!token || !websocket || websocket.readyState !== WebSocket.OPEN) {
      toast.error('Нет соединения с сервером');
      return;
    }
    
    const messageIdToDelete = messageToDelete.id;
    const channelId = messageToDelete.channel_id;
    
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/message/${messageToDelete.id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        })
      );
      
      if (res.ok) {
        setMessagesByChat(prev => {
          const currentMessages = prev[channelId] || [];
          const updatedMessages = currentMessages.filter(m => m.id !== messageIdToDelete);
          return {
            ...prev,
            [channelId]: updatedMessages
          };
        });
        
        setQuotedMessageData(prev => {
          const newState = { ...prev };
          if (newState[messageIdToDelete] !== undefined) {
            delete newState[messageIdToDelete];
          }
          return newState;
        });
        
        toast.success('Сообщение удалено');
      } else {
        throw new Error('Delete failed');
      }
    } catch (e: any) {
      console.error('Error deleting message:', e);
      toast.error('Не удалось удалить сообщение');
    } finally {
      setShowDeleteMessageModal(false);
      setMessageToDelete(null);
    }
  };

  const deleteMessage = async (msg: Message) => {
    if (msg.sender !== username) {
      toast.error('Вы можете удалять только свои сообщения');
      return;
    }
    setMessageToDelete(msg);
    setShowDeleteMessageModal(true);
  };

  const handleSendMessage = async () => {
    console.log('Send message check:', { 
        hasMessage: !!message.trim(), 
        hasFile: !!selectedFile, 
        isRecording, 
        hasForward: !!forwardMessage 
    });
    
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !activeChat) {
        console.error('WebSocket not ready or no active chat');
        toast.error('Нет соединения с сервером');
        return;
    }
    
    if (!forwardMessage && !message.trim() && !selectedFile && !isRecording) {
        console.log('No content to send');
        toast.error('Сообщение не может быть пустым');
        return;
    }
    
    if (isRecording) {
        stopRecording();
        return;
    }
    
    try {
        let fileUrl = '';
        let fileName = '';
        
        if (selectedFile) {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const uploadRes = await refreshTokenAndRetry(() =>
                fetch(`${API_BASE}/chat/upload`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                })
            );
            if (!uploadRes.ok) throw new Error('Upload failed');
            const uploadData = await uploadRes.json();
            fileUrl = uploadData.url;
            fileName = selectedFile.name;
        }
        
        const payload = {
            type: editingMessage ? 'edit_message' : 'send_message',
            data: {
                channel_id: activeChat,
                content: message.trim() || undefined,
                ...(selectedContacts.length > 0 && { members: selectedContacts.map(c => ({ id: c.id })) }),
                ...(forwardMessage && { forward_message_id: forwardMessage.id }),
                ...(quotedMessage && { quoted_message_id: quotedMessage.id }),
                ...(editingMessage && { message_id: editingMessage.id }),
                ...(fileUrl && { file_url: fileUrl, file_name: fileName }),
            },
        };
        
        console.log('Sending WebSocket message:', payload);
        websocket.send(JSON.stringify(payload));
        
        // Сброс состояния
        setMessage('');
        setSelectedFile(null);
        setForwardMessage(null);
        setShowForwardMessageModal(false);
        setSelectedContacts([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        if (!editingMessage) {
            setQuotedMessage(null);
        }
        if (editingMessage) {
            setEditingMessage(null);
        }
        
        toast.success('Сообщение отправлено');
        
    } catch (e) {
        console.error('Не удалось отправить сообщение:', e);
        toast.error('Не удалось отправить сообщение');
    } finally {
        stopTyping();
    }
};

  const startTyping = () => {
    if (!websocket || !activeChat) {
      return;
    }
    websocket.send(JSON.stringify({ type: 'typing_start', data: { channel_id: activeChat } }));

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 3000);
  };

  const stopTyping = () => {
    if (!websocket || !activeChat) return;

    websocket.send(JSON.stringify({ type: 'typing_stop', data: { channel_id: activeChat } }));
  };

  const lastTypingSent = useRef<number>(0);
  const handleTyping = () => {
    if (websocket && activeChat && connectionStatus === 'connected') {
      const now = Date.now();
      if (now - lastTypingSent.current > 2000) {
        startTyping();
        lastTypingSent.current = now;
      }
    } else {
      stopTyping();
    }
  };

  const searchContacts = async (query: string) => {
    if (!token) return;
    setIsLoadingContacts(true);
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/contacts?query=${encodeURIComponent(query)}`, {
          headers: authHeaders(),
        })
      );
      if (!res.ok) {
        throw new Error(`Не удалось найти контакты: ${res.status} ${res.statusText}`);
      }
      const data: Contact[] = await res.json();
      setContacts(data);
    } catch (e: any) {
      console.error('Error searching contacts:', e);
      toast.error('Не удалось найти контакты. Попробуйте позже.');
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const createPrivateChat = async (contactId: string) => {
    if (!token) return;
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats/private/${encodeURIComponent(contactId)}`, {
          method: 'POST',
          headers: authHeaders(),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to create private chat: ${res.status} ${res.statusText}`);
      }
      const newChat: Chat = await res.json();
      setChats(prev => [...prev, newChat]);
      setActiveChat(newChat.id);
      setShowContactSearch(false);
      setContactSearchQuery('');
      setContacts([]);
      toast.success('Чат создан');
    } catch (e) {
      console.error('Не удалось создать личный чат');
      toast.error('Не удалось создать личный чат.');
    }
  };

  const createGroupChat = async () => {
    if (!token) {
      toast.error('Необходима авторизация');
      return;
    }
    if (selectedContacts.length < 1) {
      toast.error('Выберите хотя бы одного участника');
      return;
    }
    
    const finalGroupName = groupName.trim() || 'Chat';
    
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats/group`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            name: finalGroupName,
            members: selectedContacts.map(c => c.id),
          }),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to create group chat: ${res.status} ${res.statusText}`);
      }
      const newChat: Chat = await res.json();
      setChats(prev => [...prev, newChat]);
      setActiveChat(newChat.id);
      setShowCreateGroup(false);
      setGroupName('');
      setSelectedContacts([]);
      setShowContactSearch(false);
      toast.success('Групповой чат создан');
    } catch (e: any) {
      console.error(`Не удалось создать групповой чат: ${e.message}`);
      toast.error('Не удалось создать групповой чат.');
    }
  };

  const createChannel = async () => {
    if (!token) {
      toast.error('Необходима авторизация');
      return;
    }
    if (!channelName.trim()) {
      toast.error('Введите название канала');
      return;
    }
    
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats/channel`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            name: channelName,
            description: channelDescription,
          }),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to create channel: ${res.status} ${res.statusText}`);
      }
      const newChat: Chat = await res.json();
      setChats((prev) => [...prev, newChat]);
      setActiveChat(newChat.id);
      setShowCreateChannel(false);
      setChannelName('');
      setChannelDescription('');
      toast.success('Канал создан');
    } catch (e: any) {
      console.error(`Не удалось создать канал: ${e.message}`);
      toast.error('Не удалось создать канал.');
    }
  };

  const inviteToChat = async (chatId: string, members: string[]) => {
    if (!token) return;
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats/${chatId}/invite`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ members }),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to invite to chat: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (data && Array.isArray(data.members)) {
        setChats(prevChats =>
          prevChats.map(chat =>
            chat.id === chatId
              ? { ...chat, members: data.members }
              : chat
          )
        );
      }
      setSelectedContacts([]);
      setContactSearchQuery('');
      setContacts([]);
      setShowInviteModal(false);
      toast.success('Пользователи приглашены');
    } catch (e) {
      console.error('Не удалось пригласить пользователей');
      toast.error('Не удалось пригласить пользователей.');
    }
  };

  const kickFromChat = async (chatId: string, members: string[]) => {
    if (!token) return;
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats/${chatId}/kick`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ members }),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to kick from chat: ${res.status} ${res.statusText}`);
      }
      setSelectedToKick([]);
      setShowKickModal(false);
      toast.success('Пользователи исключены');
    } catch (e) {
      console.error('Не удалось исключить пользователей');
      toast.error('Не удалось исключить пользователей.');
    }
  };

  const leaveChat = async (chatId: string) => {
    if (!token) return;
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats/${chatId}/leave`, {
          method: 'POST',
          headers: authHeaders(),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to leave chat: ${res.status} ${res.statusText}`);
      }
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChat === chatId) setActiveChat(null);
      setShowLeaveModal(false);
      toast.success('Вы покинули чат');
    } catch (e) {
      console.error('Не удалось покинуть чат');
      toast.error('Не удалось покинуть чат.');
    }
  };

  const deleteChat = async (chatId: string) => {
    if (!token) return;
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats/${chatId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to delete chat: ${res.status} ${res.statusText}`);
      }
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChat === chatId) setActiveChat(null);
      setShowDeleteModal(false);
      toast.success('Чат удален');
    } catch (e) {
      console.error('Не удалось удалить чат');
      toast.error('Не удалось удалить чат.');
    }
  };

  const filteredChats = useMemo(() => {
    const filtered = chats.filter(chat => {
      if (!chat.members || !Array.isArray(chat.members)) {
        return false;
      }
      const chatName = chat.is_group || chat.is_channel 
        ? (chat.name ?? 'Без названия').toLowerCase()
        : (contactMap[chat.members.find(m => m !== username)!] ?? 'Личный чат').toLowerCase();
      return chatName.includes(chatsSearchQuery.toLowerCase());
    });
    return filtered.sort((a, b) => {
      const timeA = a.last_message ? new Date(a.last_message.timestamp).getTime() : 0;
      const timeB = b.last_message ? new Date(b.last_message.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [chats, chatsSearchQuery, contactMap, username]);

  const toggleContactSelection = (contact: Contact) => {
    setSelectedContacts(prev =>
      prev.some(c => c.id === contact.id)
        ? prev.filter(c => c.id !== contact.id)
        : [...prev, contact]
    );
  };

  const toggleKickSelection = (member: string) => {
    setSelectedToKick(prev =>
      prev.includes(member)
        ? prev.filter(m => m !== member)
        : [...prev, member]
    );
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showChatInfoSidebar) {
      setIsSidebarVisible(true);
    } else {
      timer = setTimeout(() => {
        setIsSidebarVisible(false);
      }, 300);
    }
    return () => clearTimeout(timer);
  }, [showChatInfoSidebar]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showEditChatModal) {
      setIsEditModalVisible(true);
    } else {
      timer = setTimeout(() => {
        setIsEditModalVisible(false);
      }, 300);
    }
    return () => clearTimeout(timer);
  }, [showEditChatModal]);

  const handleStickerClick = (stickerUrl: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !activeChat) {
      console.error('Нет соединения с сервером');
      toast.error('Нет соединения с сервером');
      return;
    }
    const stickerName = stickerUrl.split('/').pop() || 'sticker.png';
    const payload = {
      type: 'send_message',
      data: {
        channel_id: activeChat,
        content: '',
        file_url: stickerUrl,
        file_name: stickerName,
      },
    };
    websocket.send(JSON.stringify(payload));
    setShowStickerPicker(false);
    toast.success('Стикер отправлен');
  };

  const openEditChatModal = () => {
    if (currentChat) {
      setEditChatName(currentChat.name || '');
      setEditChatDescription(currentChat.description || '');
    }
    setIsEditModalVisible(true);
    setTimeout(() => {
      setShowEditChatModal(true);
    }, 10);
  };

  const closeEditModal = () => {
    setShowEditChatModal(false);
  };

  return (
    <div className={`flex justify-center ${theme === 'light' ? 'bg-gray-200': 'bg-slate-800'}`}>
      <div className={`flex h-screen w-[1700px] overflow-hidden border ${theme === 'light' ? 'border-gray-200': 'border-slate-900'}`}>
        <RenderSidebar
          unreadReactionNotifications={unreadReactionNotifications}
          searchQuery={chatsSearchQuery}
          setSearchQuery={setChatsSearchQuery}
          setShowCreateOptions={setShowCreateOptions}
          showCreateOptions={showCreateOptions}
          createOptionsRef={createOptionsRef}
          setShowContactSearch={setShowContactSearch}
          setShowCreateGroup={setShowCreateGroup}
          setShowCreateChannel={setShowCreateChannel}
          isLoadingChats={isLoadingChats}
          filteredChats={filteredChats}
          setActiveChat={setActiveChat}
          userStatuses={userStatuses}
          contactMap={contactMap}
          unreadCounts={unreadCounts}
          messagesByChat={messagesByChat}
          activeChat={activeChat}
          username={username}
          typingUsers={typingUsers}
          currentChat={currentChat}
          setShouldScrollToBottom={setShouldScrollToBottom}
          quotedMessageData={quotedMessageData}
          fetchQuotedMessageData={fetchQuotedMessageData}
        />
        <RenderChatWindow
          cancelForward={cancelForward}
          forwardMessage={forwardMessage}
          onReactionInView={markReactionAsReadWhenInView}
          unreadReactionNotifications={unreadReactionNotifications}
          handleReactToMessage={handleReactToMessage}
          showFileDragModal={showFileDragModal}
          setShowFileDragModal={setShowFileDragModal}
          unreadCounts={unreadCounts}
          activeChat={activeChat}
          searchContacts={searchContacts}
          currentChat={currentChat}
          showChatInfoSidebar={showChatInfoSidebar}
          typingUsers={typingUsers}
          username={username}
          userStatuses={userStatuses}
          showChatOptions={showChatOptions}
          setShowChatOptions={setShowChatOptions}
          setShowInviteModal={setShowInviteModal}
          setShowKickModal={setShowKickModal}
          setShowLeaveModal={setShowLeaveModal}
          setShowDeleteModal={setShowDeleteModal}
          showStickerPicker={showStickerPicker}
          isLoadingMessages={isLoadingMessages}
          setShowStickerPicker={setShowStickerPicker}
          chatOptionsRef={chatOptionsRef}
          messagesEndRef={messagesEndRef}
          stickerPickerRef={stickerPickerRef}
          fileInputRef={fileInputRef}
          message={message}
          setMessage={setMessage}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          setShowDeleteMessageModal={setShowDeleteMessageModal}
          setMessageToDelete={setMessageToDelete}
          messageToDelete={messageToDelete}
          showDeleteMessageModal={showDeleteMessageModal}
          isRecording={isRecording}
          inputRef={inputRef}
          editingMessage={editingMessage}
          cancelEdit={cancelEdit}
          handleSendMessage={handleSendMessage}
          handleTyping={handleTyping}
          handleStickerClick={handleStickerClick}
          handleScroll={handleScroll}
          isSidebarVisible={isSidebarVisible}
          setIsSidebarVisible={setIsSidebarVisible}
          setShowChatInfoSidebar={setShowChatInfoSidebar}
          contactMap={contactMap}
          cancelQuote={cancelQuote}
          quotedMessage={quotedMessage}
          filteredMessages={filteredMessages}
          quotedMessageData={quotedMessageData}
          handleMessageContextMenu={handleMessageContextMenu}
          fetchQuotedMessageData={fetchQuotedMessageData}
          messageContextMenu={messageContextMenu}
          messageContextMenuRef={messageContextMenuRef}
          handleContextMenuEdit={handleContextMenuEdit}
          handleContextMenuDelete={handleContextMenuDelete}
          handleContextMenuCopy={handleContextMenuCopy}
          handleContextMenuForward={handleContextMenuForward}
          handleContextMenuQuote={handleContextMenuQuote}
          openEditChatModal={openEditChatModal}
          handleUserContextMenu={handleUserContextMenu}
          leaveChat={leaveChat}
          userContextMenu={userContextMenu}
          userContextMenuRef={userContextMenuRef}
          handleContextMenuSendMessage={handleContextMenuSendMessage}
          stopRecording={stopRecording}
          startRecording={startRecording}
          confirmDeleteMessage={confirmDeleteMessage}
          isEditModalVisible={isEditModalVisible}
          closeEditModal={closeEditModal}
          showEditChatModal={showEditChatModal}
          editChatName={editChatName}
          setEditChatName={setEditChatName}
          editChatDescription={editChatDescription}
          setEditChatDescription={setEditChatDescription}
          setChats={setChats}
          setShowEditChatModal={setShowEditChatModal}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setShowImageModal={setShowImageModal}
          messagesContainerRef={messagesContainerRef}
          isAtBottom={isAtBottom}
          loadMessagesAround={loadMessagesAround}
          setIsAutoScrolling={setIsAutoScrolling}
          setImageUrl={setImageUrl}
          onMessageInView={markMessageAsReadWhenInView}
        />
        <RenderModals
          handleContextMenuQuote={handleContextMenuQuote}
          showContactSearch={showContactSearch}
          showCreateGroup={showCreateGroup}
          contactSearchQuery={contactSearchQuery}
          setContactSearchQuery={setContactSearchQuery}
          searchContacts={searchContacts}
          setContacts={setContacts}
          isLoadingContacts={isLoadingContacts}
          contacts={contacts}
          showCreateChannel={showCreateChannel}
          showInviteModal={showInviteModal}
          toggleContactSelection={toggleContactSelection}
          createPrivateChat={createPrivateChat}
          selectedContacts={selectedContacts}
          setShowContactSearch={setShowContactSearch}
          setShowCreateGroup={setShowCreateGroup}
          setShowCreateChannel={setShowCreateChannel}
          setShowInviteModal={setShowInviteModal}
          setSelectedContacts={setSelectedContacts}
          createGroupChat={createGroupChat}
          createChannel={createChannel}
          activeChat={activeChat}
          inviteToChat={inviteToChat}
          groupName={groupName}
          setGroupName={setGroupName}
          channelName={channelName}
          setChannelName={setChannelName}
          channelDescription={channelDescription}
          setChannelDescription={setChannelDescription}
          currentChat={currentChat}
          contactMap={contactMap}
          username={username}
          selectedToKick={selectedToKick}
          toggleKickSelection={toggleKickSelection}
          showKickModal={showKickModal}
          setShowKickModal={setShowKickModal}
          setSelectedToKick={setSelectedToKick}
          kickFromChat={kickFromChat}
          showLeaveModal={showLeaveModal}
          setShowLeaveModal={setShowLeaveModal}
          leaveChat={leaveChat}
          showDeleteModal={showDeleteModal}
          setShowDeleteModal={setShowDeleteModal}
          deleteChat={deleteChat}
          showImageModal={showImageModal}
          setShowImageModal={setShowImageModal}
          imageUrl={imageUrl}
          setImageUrl={setImageUrl}
          deleteMessage={deleteMessage}
          showDeleteMessageModal={showDeleteMessageModal}
          setShowDeleteMessageModal={setShowDeleteMessageModal}
          messageToDelete={messageToDelete}
          setMessageToDelete={setMessageToDelete}
          confirmDeleteMessage={confirmDeleteMessage}
          setQuotedMessage={setQuotedMessage}
          showForwardMessageModal={showForwardMessageModal}
          setShowForwardMessageModal={setShowForwardMessageModal}
          handleSendMessage={handleSendMessage}
          handleForwardMessage={handleForwardMessage}
        />
      </div>
    </div>
  );
};

export default ChatComponent;