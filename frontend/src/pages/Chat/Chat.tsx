import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { DotsThreeVertical, MagnifyingGlass, UserCircle, Users, Plus } from 'phosphor-react';
import { toast } from 'react-toastify';
import copy from 'copy-to-clipboard';
import type { Chat, Message, Contact } from '../../types/chat';
import RenderChatWindow  from '../../components/chat_page/ChatWindow';
import { getChatDisplayIcon, getChatDisplayName } from '../../utils/chat';
import RenderSidebar from '../../components/chat_page/Sidebar';
import RenderModals from '../../components/chat_page/Modals';
import { useTheme } from '../../hooks/ThemeContext';

const ChatComponent: React.FC = () => {
  const { token, username, refreshToken } = useAuth();
  const [message, setMessage] = useState('');
  const [messagesByChat, setMessagesByChat] = useState<{ [key: string]: Message[] }>({});
  const [hasMoreByChat, setHasMoreByChat] = useState<{ [key: string]: boolean }>({});
  const [offsetByChat, setOffsetByChat] = useState<{ [key: string]: number }>({});
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatsSearchQuery, setChatsSearchQuery] = useState('');
  const [userStatuses, setUserStatuses] = useState<{ [username: string]: string }>({});
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [showImageModal, setShowImageModal] = useState(false);
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
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
  const [contactMap, setContactMap] = useState<{ [key: string]: string }>({});
  const [selectedToKick, setSelectedToKick] = useState<string[]>([]);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createOptionsRef = useRef<HTMLDivElement>(null);
  const chatOptionsRef = useRef<HTMLDivElement>(null);
  const stickerPickerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
  const messageContextMenuRef = useRef<HTMLDivElement>(null);
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [quotedMessageData, setQuotedMessageData] = useState<Record<string, Message | null>>({});
  const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [showChatInfoSidebar, setShowChatInfoSidebar] = useState(false);
  const [showEditChatModal, setShowEditChatModal] = useState(false);
  const [editChatName, setEditChatName] = useState('');
  const [editChatDescription, setEditChatDescription] = useState('');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  const userContextMenuRef = useRef<HTMLDivElement>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const WS_BASE: string = import.meta.env.VITE_WS_BASE ?? (import.meta.env.VITE_ENV === 'production' ? 'wss://192.1.66.117:8000' : 'ws://192.1.66.117:8000');
  const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://192.1.66.117:8000';

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

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

  const addTypingUser = (chatId: string, username: string) => {
    setTypingUsers(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(chatId)) {
        newMap.set(chatId, new Set());
      }
      newMap.get(chatId)!.add(username);
      return newMap;
    });
  };

  const removeTypingUser = (chatId: string, username: string) => {
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
  };

  const refreshTokenAndRetry = async <T extends unknown>(apiCall: () => Promise<T>): Promise<T> => {
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
          return await apiCall();
        }
        window.location.href = '/login';
        throw new Error('Session expired');
      }
      throw error;
    }
  };

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
          ? { ...chat, unread_count: 0 }
          : chat
      ));
      setShouldScrollToBottom(true);
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
      visible:true,
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
      deleteMessage(messageContextMenu.message);
      setMessageContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const handleContextMenuCopy = () => {
    if (messageContextMenu.message?.content) {
      try {
        copy(messageContextMenu.message.content);
      } catch (err) {
        // Silent error
      }
      setMessageContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const handleContextMenuQuote = () => {
    if (messageContextMenu.message) {
      quoteMessage(messageContextMenu.message);
      setMessageContextMenu(prev => ({ ...prev, visible: false }));
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
      setChats(data);
      // if (data.length > 0 && activeChat === null) {
      //   setActiveChat(data[0].id);
      // }
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
  }, [token, contactMap]);

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
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
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

  const loadMessages = async () => {
    if (!activeChat || !token) return;
    setIsLoadingMessages(true);
    try {
      const currentOffset = offsetByChat[activeChat] || 0;
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/${activeChat}/messages?offset=${currentOffset}&limit=${limit}`, {
          headers: authHeaders(),
        })
      );
      if (!res.ok) throw new Error(`Failed to load messages: ${res.status} ${res.statusText}`);
      const data: any[] = await res.json();
      if (data.length < limit) {
        setHasMoreByChat(prev => ({ ...prev, [activeChat]: false }));
      }
      setMessagesByChat(prev => {
        const currentMessages = prev[activeChat] || [];
        const currentIds = new Set(currentMessages.map(m => m.id));
        const uniqueNewMessages = data.filter(msg => !currentIds.has(String(msg.id))).map(msg => ({
          ...msg,
          id: String(msg.id),
          is_read: Boolean(msg.is_read),
          timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
          file_url: msg.file_url,
          file_name: msg.file_name,
          edited: Boolean(msg.edited),
        }));
        const combinedMessages = [...uniqueNewMessages, ...currentMessages];
        combinedMessages.sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });
        return {
          ...prev,
          [activeChat]: combinedMessages
        };
      });
      setOffsetByChat(prev => ({ ...prev, [activeChat]: currentOffset + limit }));
    } catch (e) {
      console.error('Error loading messages:', e);
      toast.error('Не удалось загрузить сообщения. Попробуйте позже.');
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

  useEffect(() => {
    if (!activeChat || !token || !username) return;
    (async () => {
      const unread = currentMessages.filter((m) => !m.is_read && m.sender !== username);
      if (unread.length === 0) return;
      try {
        const res = await refreshTokenAndRetry(() =>
          fetch(`${API_BASE}/chat/messages/batch_read`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ 
              message_ids: unread.map((m) => m.id),
              channel_id: activeChat
             }),
          })
        );
        if (res.ok) {
          setMessagesByChat((prev) => ({
            ...prev,
            [activeChat]: prev[activeChat].map((m) =>
              unread.some((u) => u.id === m.id) ? { ...m, is_read: true } : m
            ),
          }));
        }
      } catch (e) {
        console.error('Failed to mark messages as read:', e);
      }
    })();
  }, [currentMessages, activeChat, token, username]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleWebSocketMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'error') {
        return;
      }
      if (data.type === 'new_message') {
        const channelId = data.data.channel_id;
        if (data.data.sender !== username && Notification.permission === "granted") {
          const isHidden = document.visibilityState === 'hidden';
          const isNotCurrent = activeChat !== data.data.channel_id;
          if (isHidden || isNotCurrent) {
            const senderName = contactMap[data.data.sender] || data.data.sender;
            const chatName = chats.find(c => c.id === data.data.channel_id)?.name || 'чате';
            const bodyText = data.data.content || (data.data.file_name ? `Отправлен файл: ${data.data.file_name}` : 'Новое сообщение');
            new Notification(`Новое сообщение в ${chatName}`, {
              body: `${senderName}: ${bodyText}`,
            });
          }
        }
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
              };
              return {
                ...chat,
                last_message: newLastMessage,
              };
            }
            return chat;
          })
        );
        setMessagesByChat(prev => {
          const channelId = data.data.channel_id;
          const currentMsgsInUpdater = prev[channelId] || [];
          const newMsgId = data.data.id;
          const existingMsgIndex = currentMsgsInUpdater.findIndex(m => m.id === newMsgId);
          if (existingMsgIndex !== -1) {
            return prev;
          }
          const newMessageQuotedId = data.data.quoted_message_id ? String(data.data.quoted_message_id) : null;
          if (newMessageQuotedId) {
            const isDataAvailableLocally = currentMsgsInUpdater.some(m => m.id === newMessageQuotedId);
            const isDataAlreadyFetched = quotedMessageData[newMessageQuotedId] !== undefined;
            if (!isDataAvailableLocally && !isDataAlreadyFetched) {
              fetchQuotedMessageData(newMessageQuotedId).catch(() => {});
            }
          }
          const updatedMessages = [...currentMsgsInUpdater, data.data].map(msg => ({
            ...msg,
            id: String(msg.id),
            is_read: Boolean(msg.is_read),
            timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
            file_url: msg.file_url,
            file_name: msg.file_name,
            edited: Boolean(msg.edited),
          }));
          updatedMessages.sort((a, b) => {
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
        setShouldScrollToBottom(true);
      }
      if (data.type === 'typing_start') {
        const { channel_id, user } = data.data;
        addTypingUser(channel_id, user);
      }
      if (data.type === 'typing_stop') {
        const { channel_id, user } = data.data;
        removeTypingUser(channel_id, user);
      }
      if (data.type === "group_created" || data.type === "private_chat_created") {
        setChats((prev) => [...prev, data.data]);
      }
      if (data.type === 'message_edited') {
        setMessagesByChat(prev => ({
          ...prev,
          [data.data.channel_id]: prev[data.data.channel_id].map(m =>
            m.id === data.data.id ? { ...m, content: data.data.content, edited: true } : m
          ),
        }));
      }
      if (data.type === "user_status") {
        setUserStatuses(data.data);
      }
      if (data.type === "user_left") {
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
      if (data.type === "batch_read") {
        const msg_ids = data.data.message_ids;
        const chat_id = data.data.channel_id;
        setMessagesByChat(prev => ({
          ...prev,
          [chat_id]: (prev[chat_id] || []).map(msg => 
            msg_ids.includes(msg.id) ? { ...msg, is_read: true } : msg
          )
        }));
      }
      if (data.type === "chat_deleted") {
        const chatId = data.data.channel_id;
        setChats(prev => prev.filter(c => c.id !== chatId));
        if (activeChat === chatId) setActiveChat(null);
      }
      if (data.type === "channel_kick") {
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
      if (data.type === 'message_deleted') {
        const deletedMessageId = data.data.id;
        const channelId = data.data.channel_id;
        setMessagesByChat(prev => {
          const currentMessages = prev[channelId] || [];
          const updatedMessages = currentMessages.filter(msg => msg.id !== deletedMessageId);
          if (updatedMessages.length === 0) {
            return { ...prev, [channelId]: [] };
          }
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
    } catch (e) {
      console.error('Ошибка обработки сообщения WebSocket');
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
  }, [token, username]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (shouldScrollToBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShouldScrollToBottom(false);
    }
  }, [shouldScrollToBottom, filteredMessages]);

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
    }
  };

  const quoteMessage = (msg: Message) => {
    setQuotedMessage(msg);
    inputRef.current?.focus();
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

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;
    if (messageToDelete.sender !== username) {
      return;
    }
    if (!token || !websocket || websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    const messageIdToDelete = messageToDelete.id;
    const channelId = messageToDelete.channel_id;
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
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/message/${messageToDelete.id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        })
      );
    } catch (e: any) {
      console.error('Error deleting message:', e);
    }
    finally {
      setShowDeleteMessageModal(false);
      setMessageToDelete(null);
    }
  };

  const deleteMessage = async (msg: Message) => {
    if (msg.sender !== username) {
      return;
    }
    setMessageToDelete(msg);
    setShowDeleteMessageModal(true);
  };

  const handleSendMessage = async () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !activeChat) {
      return;
    }
    if (!message.trim() && !selectedFile && !isRecording) return;
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
          content: message || undefined,
          ...(quotedMessage && { quoted_message_id: quotedMessage.id }),
          ...(editingMessage && { message_id: editingMessage.id }),
          ...(fileUrl && { file_url: fileUrl, file_name: fileName }),
        },
      };
      websocket.send(JSON.stringify(payload));
      setMessage('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!editingMessage) {
        setQuotedMessage(null);
      }
      if (editingMessage) {
        setEditingMessage(null);
      }
      setShouldScrollToBottom(true);
    } catch (e) {
      console.error('Не удалось отправить сообщение');
    } finally {
      stopTyping();
    }
  };

  const startTyping = () => {
    if (!websocket) {
      return null;
    }
    websocket.send(JSON.stringify({ type: 'typing_start', data: { channel_id: activeChat } }));

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 3000);
  };

  const stopTyping = () => {
    if (!websocket) return;

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
      setActiveChat(newChat.id);
      setShowContactSearch(false);
      setContactSearchQuery('');
      setContacts([]);
    } catch (e) {
      console.error('Не удалось создать личный чат');
      toast.error('Не удалось создать личный чат.');
    }
  };

  const createGroupChat = async () => {
    if (!token || selectedContacts.length < 1) {
      return;
    }
    if (groupName.length === 0) {
      setGroupName('Chat');
    }
    try {
      const res = await refreshTokenAndRetry(() =>
        fetch(`${API_BASE}/chat/chats/group`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            name: groupName,
            members: selectedContacts.map(c => c.id),
          }),
        })
      );
      if (!res.ok) {
        throw new Error(`Failed to create group chat: ${res.status} ${res.statusText}`);
      }
      const newChat: Chat = await res.json();
      setActiveChat(newChat.id);
      setShowCreateGroup(false);
      setGroupName('');
      setSelectedContacts([]);
      setShowContactSearch(false);
    } catch (e: any) {
      console.error(`Не удалось создать групповой чат: ${e.message}`);
      toast.error('Не удалось создать групповой чат.');
    }
  };

  const createChannel = async () => {
    if (!token || !channelName.trim()) return;
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
      const updatedChat: Chat = await res.json();
      setSelectedToKick([]);
      setShowKickModal(false);
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
      setShowDeleteModal(false);
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
    let timer;
    if (showChatInfoSidebar) {
      setIsSidebarVisible(true);
      timer = setTimeout(() => {}, 10);
    } else {
      timer = setTimeout(() => {
        setIsSidebarVisible(false);
      }, 300);
    }
    return () => clearTimeout(timer);
  }, [showChatInfoSidebar]);

  useEffect(() => {
    let timer;
    if (showEditChatModal) {
      setIsEditModalVisible(true);
      timer = setTimeout(() => {}, 10);
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
  };
    
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    if (target.scrollTop === 0 && hasMoreByChat[activeChat!] && !isLoadingMessages) {
      loadMessages();
    }
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
        />
        <RenderChatWindow 
          activeChat={activeChat}
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
          hasMoreByChat={hasMoreByChat}
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
        />
        <RenderModals
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
        />
      </div>
    </div>
  );
};

export default ChatComponent;