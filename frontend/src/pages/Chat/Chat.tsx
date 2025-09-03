import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { format, isValid, previousDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { PaperPlaneRight, Paperclip, Smiley, DotsThreeVertical, MagnifyingGlass, UserCircle, Users, Plus, X, Microphone, Sticker } from 'phosphor-react';
import { toast } from 'react-toastify';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { marked } from 'marked';
import { CommentOutlined, CopyOutlined, DeleteOutlined, EditOutlined, FileExcelOutlined, FileImageOutlined, FileOutlined, FilePdfOutlined, FileTextOutlined, FileWordOutlined, FileZipOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { BsFiletypeTxt } from "react-icons/bs";
import copy from 'copy-to-clipboard';

interface Message {
  id: string;
  channel_id: string;
  sender: string;
  content: string;
  timestamp: string;
  is_read: boolean;
  file_url?: string;
  file_name?: string;
  edited?: boolean;
  quoted_message_id: string | null;
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

const stickers = [
  'https://example.com/stickers/happy.png',
  'https://example.com/stickers/sad.png',
  'https://example.com/stickers/laugh.png',
  'https://example.com/stickers/thumbsup.png',
];

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
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createOptionsRef = useRef<HTMLDivElement>(null);
  const chatOptionsRef = useRef<HTMLDivElement>(null);
  const stickerPickerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    message: Message | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    message: null,
  })
  const contextMenuRef = useRef<HTMLDivElement>(null);
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

  const WS_BASE = import.meta.env.VITE_WS_BASE || (import.meta.env.VITE_ENV === 'production' ? 'wss://192.1.66.117:8000' : 'ws://192.1.66.117:8000');
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://192.1.66.117:8000';

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const currentChat = useMemo(() => chats.find(chat => chat.id === activeChat), [chats, activeChat]);

  const currentMessages = useMemo(() => {
    return activeChat ? (messagesByChat[activeChat] || []).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) : [];
  }, [activeChat, messagesByChat]);

  const sortedMessages = useMemo(() => {
    return [...currentMessages].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    if (timeA !== timeB) {
      return timeA - timeB; // По возрастанию времени
    }
    return a.id.localeCompare(b.id);
  });
}, [currentMessages]);

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return sortedMessages;
    const lowerQuery = searchQuery.toLowerCase();
    return sortedMessages.filter(m =>
      m.content?.toLowerCase().includes(lowerQuery) ||
      m.file_name?.toLowerCase().includes(lowerQuery)
    );
  }, [sortedMessages, searchQuery]);

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
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // -----------------------------
  // Контекстное меню сообщения
  // -----------------------------
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(prev => ({...prev, visible: false}));
      }
    }
    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.visible]);

  const handleMessageContextMenu = (event: React.MouseEvent, msg: Message) => {
    event.preventDefault();
    const react = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      visible:true,
      x: event.clientX,
      y: event.clientY,
      message: msg,
    });
  };

  const handleContextMenuEdit = () => {
    if (contextMenu.message) {
      startEditMessage(contextMenu.message);
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const handleContextMenuDelete = () => {
    if (contextMenu.message) {
      deleteMessage(contextMenu.message);
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  };


  const handleContextMenuCopy = () => {
    if (contextMenu.message?.content) {
      try {
        copy(contextMenu.message.content);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  };
  
  const handleContextMenuQuote = () => {
    if (contextMenu.message) {
      quoteMessage(contextMenu.message);
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  const renderContextMenu = () => {
    if (!contextMenu.visible || !contextMenu.message) return null;

    return (
      <div
        ref={contextMenuRef}
        className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 py-1 min-w-[150px]" // Добавлен z-index
        style={{
          top: `${contextMenu.y}px`,
          left: `${contextMenu.x}px`,
          transform: 'translate(0, 0)',
        }}
      >
        {contextMenu.message.sender === username && (
          <>
            <button
              onClick={handleContextMenuEdit}
              className="w-full text-left font-semibold gap-4 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
            >
              <EditOutlined className="text-xl" />
              Редактировать
            </button>
            <button
              onClick={handleContextMenuDelete}
              className="w-full text-left font-semibold gap-4 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center"
            >
              <DeleteOutlined className="text-xl"/>
              Удалить
            </button>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
          </>
        )}
        <button
          onClick={handleContextMenuCopy}
          className="w-full text-left font-semibold gap-4 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
        >
          <CopyOutlined className="text-xl"/>
          Копировать
        </button>
        <button
          onClick={handleContextMenuQuote}
          className="w-full text-left font-semibold gap-4 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
        >
          <CommentOutlined className="text-xl"/>
          Ответить
        </button>
      </div>
    );
  };

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
           
          toast.info('Токен обновлен');
          return fetchChats();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load chats: ${res.status} ${res.statusText}`);
      }
      const data: Chat[] = await res.json();
      console.log(`fetchChats ${data}`);
      setChats(data);
      if (data.length > 0 && activeChat === null) {
        setActiveChat(data[0].id);
      }
      const allMembers = new Set<string>();
      data.forEach((chat) => {
        chat.members.forEach((m) => allMembers.add(m));
      });
      const newContactEntries: Record<string, string> = {};
      const contactFetchPromises = [...allMembers].map(async (m) => {
        if (!contactMap[m]) { 
          try {
            const res = await fetch(`${API_BASE}/chat/contacts?query=${encodeURIComponent(m)}`, {
              headers: authHeaders(),
            });
            if (res.ok) {
              const contactsData = await res.json();
              if (contactsData.length > 0) {
                newContactEntries[m] = contactsData[0].displayName; 
              }
            }
          } catch (err) {
            console.error(`Error fetching display name for ${m}:`, err);
          }
        }
      });
      await Promise.all(contactFetchPromises);
      if (Object.keys(newContactEntries).length > 0) {
        setContactMap((prev) => ({ ...prev, ...newContactEntries }));
      }
    } catch (e: any) {
      console.error('Error loading chats:', e);
      toast.error('Не удалось загрузить чаты');
    } finally {
      setIsLoadingChats(false);
    }
  }, [token]); {/*, activeChat, refreshToken, contactMap*/}

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const fetchQuotedMessageData = async (quotedMessageId: string): Promise<Message | null> => {
    if (quotedMessageData[quotedMessageId] !== undefined) {
      return quotedMessageData[quotedMessageId];
    }

    try {
      const response = await fetch(`${API_BASE}/chat/messages/${quotedMessageId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Quoted message ${quotedMessageId} not found on server.`);
          setQuotedMessageData(prev => ({ ...prev, [quotedMessageId]: null }));
          return null;
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error(`Ошибка загрузки сообщения ${quotedMessageId}:`, response.status, errorData);
          return null;
        }
      }

      const messageData: Message = await response.json();
      setQuotedMessageData(prev => ({ ...prev, [quotedMessageId]: messageData }));
      return messageData;

    } catch (error) {
      console.error(`Ошибка загрузки сообщения ${quotedMessageId}:`, error);
      return null;
    }
  };

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
           
          return loadMessages();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Failed to load messages: ${res.status} ${res.statusText}`);
      const data: any[] = await res.json();
      console.log(`loadMessages ${data}`);
      if (data.length < limit) {
        setHasMoreByChat(prev => ({ ...prev, [activeChat]: false }));
      }
      
      setMessagesByChat(prev => {
        const currentMessages = prev[activeChat] || [];
        const currentIds = new Set(currentMessages.map(m => m.id));
        console.log(`loadMessages: Загружено ${data.length} сообщений.`);

        const uniqueNewMessages = data.filter(msg => {
            const msgId = String(msg.id);
            const isDuplicate = currentIds.has(msgId);
            if (isDuplicate) {
                console.warn(`loadMessages: Пропущен дубликат сообщения с ID ${msgId}`);
            }
            return !isDuplicate; 
        }).map(msg => ({
            ...msg,
            id: String(msg.id),
            is_read: Boolean(msg.is_read),
            timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
            file_url: msg.file_url,
            file_name: msg.file_name,
            edited: Boolean(msg.edited),
        }));

        console.log(`loadMessages: Добавлено ${uniqueNewMessages.length} новых сообщений.`);

        const combinedMessages = [...uniqueNewMessages, ...currentMessages];
        
        combinedMessages.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            if (timeA !== timeB) {
                return timeA - timeB;
            }
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
  }, [currentMessages, activeChat, token, username, refreshToken]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

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
              const channelId = data.data.channel_id;
              const newMsgId = data.data.id;
              console.groupCollapsed(`WS New Message: ${newMsgId} (Channel: ${channelId})`);
              console.log("Полученные данные:", data.data);
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
                      fetchQuotedMessageData(newMessageQuotedId).catch(err => {
                          console.warn(`Фоновая загрузка цитируемого сообщения ${newMessageQuotedId} не удалась:`, err);
                      });
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

              console.log(`Сообщение ${deletedMessageId} удалено из канала ${channelId} (WebSocket)`);
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
  }, [token, username, activeChat, chats, contactMap, refreshToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredMessages]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleStickerClick = (stickerUrl: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !activeChat) {
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
      toast.info('Начата запись голосового сообщения...');
    } catch (e) {
      console.error('Error starting recording:', e);
      toast.error('Не удалось начать запись. Проверьте разрешение на микрофон.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.info('Запись остановлена. Сообщение отправляется...');
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
      const uploadRes = await fetch(`${API_BASE}/chat/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
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
      toast.success('Голосовое сообщение отправлено');
    } catch (e) {
      console.error('Voice message send error:', e);
      toast.error('Не удалось отправить голосовое сообщение');
    }
  };

  const quoteMessage = (msg: Message) => {
    // const senderName = contactMap[msg.sender] || msg.sender;
    // const quote = `> ${senderName}: ${msg.content}\n\n`;
    // setMessage(prev => prev + quote);
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
      toast.error('Вы можете удалить только свое сообщение');
      return;
    }
    if (!token || !websocket || websocket.readyState !== WebSocket.OPEN) {
      toast.error('Нет соединения с сервером');
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
      const res = await fetch(`${API_BASE}/chat/message/${messageToDelete.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      if (res.ok) {
        toast.success('Сообщение удалено');
        console.log(`Сообщение ${messageIdToDelete} успешно удалено с сервера`);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Ошибка удаления сообщения на сервере:', res.status, errorData);
        toast.error(`Не удалось удалить сообщение: ${errorData.detail || res.statusText}`);
      }
    } catch (e: any) {
      console.error('Ошибка сети при удалении сообщения:', e);
      toast.error('Ошибка сети при удалении сообщения');
    }
    finally {
      setShowDeleteMessageModal(false);
      setMessageToDelete(null);
    }
  };

  const deleteMessage = async (msg: Message) => {
    if (msg.sender !== username) {
      toast.error('Вы можете удалить только свое сообщение');
      return;
    }
    
    setMessageToDelete(msg);
    setShowDeleteMessageModal(true);
  };

  const handleSendMessage = async () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN || !activeChat) {
      toast.error('Нет соединения с сервером');
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
    if (e.key === 'Escape' && editingMessage) {
      e.preventDefault();
      cancelEdit();
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
           
          return searchContacts(query);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        let errorDetail = 'Неизвестная ошибка';
        try {
          const errorData = await res.json();
          errorDetail = errorData.detail || `${res.status} ${res.statusText}`;
        } catch {
          errorDetail = `${res.status} ${res.statusText}`;
        }
        throw new Error(`Не удалось найти контакты: ${errorDetail}`);
      }
      const data: Contact[] = await res.json();
      setContacts(data);
    } catch (e: any) {
      console.error('Error searching contacts:', e);
      toast.error(e.message);
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
           
          return createPrivateChat(contactId);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to create private chat: ${res.status} ${res.statusText}`);
      }
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
      toast.error('Выберите минимум двух участников для создания группы');
      return;
    }
    if (groupName.length === 0) {
      setGroupName('Chat');
    }
    try {
      console.log(groupName);
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
           
          return createGroupChat();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`Failed to create group chat: ${res.status} ${res.statusText} - ${errorData.detail || 'Unknown error'}`);
      }
      const newChat: Chat = await res.json();
      setChats((prev) => [...prev, newChat]);
      setActiveChat(newChat.id);
      setShowCreateGroup(false);
      setGroupName('');
      setSelectedContacts([]);
      setShowContactSearch(false);
      toast.success('Групповой чат создан');
    } catch (e: any) {
      console.error('Error creating group chat:', e);
      toast.error(`Не удалось создать групповой чат: ${e.message}`);
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
           
          return createChannel();
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`Failed to create channel: ${res.status} ${res.statusText} - ${errorData.detail || 'Unknown error'}`);
      }
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

  const inviteToChat = async (chatId: string, members: string[]) => {
    if (!token) return;
    try {
      console.log(chatId);
      console.log(members);

      const res = await fetch(`${API_BASE}/chat/chats/${chatId}/invite`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ members }),
      });
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (refreshRes.ok) {
          const { access_token } = await refreshRes.json();
           
          return inviteToChat(chatId, members);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
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
        toast.success('Пользователи приглашены в чат');
      } else {
        console.error('Invalid data structure received from server:', data);
        toast.error('Получены некорректные данные от сервера');
      }
      toast.success('Пользователи приглашены в чат');
      setSelectedContacts([]);
      setContactSearchQuery('');
      setContacts([]);
      setShowInviteModal(false);
    } catch (e) {
      console.error('Error inviting to chat:', e);
      toast.error('Не удалось пригласить пользователей');
    }
  };

  const kickFromChat = async (chatId: string, members: string[]) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${chatId}/kick`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ members }),
      });
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (refreshRes.ok) {
          const { access_token } = await refreshRes.json();
           
          return kickFromChat(chatId, members);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to kick from chat: ${res.status} ${res.statusText}`);
      }
      const updatedChat: Chat = await res.json();
      setChats(prev => prev.map(c => c.id === chatId ? updatedChat : c));
      toast.success('Пользователи исключены');
      setSelectedToKick([]);
      setShowKickModal(false);
    } catch (e) {
      console.error('Error kicking from chat:', e);
      toast.error('Не удалось исключить пользователей');
    }
  };

  const leaveChat = async (chatId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${chatId}/leave`, {
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
           
          return leaveChat(chatId);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to leave chat: ${res.status} ${res.statusText}`);
      }
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChat === chatId) setActiveChat(null);
      toast.success('Вы покинули чат');
      setShowLeaveModal(false);
    } catch (e) {
      console.error('Error leaving chat:', e);
      toast.error('Не удалось покинуть чат');
    }
  };

  const deleteChat = async (chatId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/chat/chats/${chatId}`, {
        method: 'DELETE',
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
           
          return deleteChat(chatId);
        }
        toast.error('Сессия истекла. Войдите снова.');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to delete chat: ${res.status} ${res.statusText}`);
      }
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChat === chatId) setActiveChat(null);
      toast.success('Чат удален');
      setShowDeleteModal(false);
    } catch (e) {
      console.error('Error deleting chat:', e);
      toast.error('Не удалось удалить чат');
    }
  };

  const filteredChats = useMemo(() => {
      console.log(`filteredChats ${chats}`);
    return chats.filter(chat => {
      if (!chat.members || !Array.isArray(chat.members)) {
      // Если members нет или это не массив, можно:
      // 1. Пропустить этот чат (return false)
      // 2. Обработать иначе
      // 3. Залогировать предупреждение
      console.warn('Chat object is missing members array or members is not an array:', chat);
      return false; // Пропускаем такой чат
  }
      const chatName = chat.is_group || chat.is_channel ? chat.name?.toLowerCase() : contactMap[chat.members.find(m => m !== username)!]?.toLowerCase() || 'личный чат';
      return chatName?.includes(searchQuery.toLowerCase());
    });
  }, [chats, searchQuery, contactMap, username]);

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

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp || !isValid(new Date(timestamp))) return 'Неизвестно';
    return format(new Date(timestamp), 'HH:mm', { locale: ru });
  };

  const formatDate = (timestamp: string) => {
    if (!timestamp || !isValid(new Date(timestamp))) return 'Неизвестно';
    const today = new Date();
    const messageDate = new Date(timestamp);
    if (format(today, 'yyyy-MM-dd') === format(messageDate, 'yyyy-MM-dd')) {
      return 'Сегодня';
    }
    if (format(today, 'yyyy-MM-dd') === format(new Date(messageDate.setDate(messageDate.getDate() + 1)), 'yyyy-MM-dd')) {
      return 'Вчера';
    }
    return format(new Date(timestamp), 'dd MMMM yyyy', { locale: ru });
  };

  const renderContent = (content: string) => {
    if (!content) return null;
    return <span dangerouslySetInnerHTML={{ __html: marked.parseInline(content) }} />;
  };

  const getChatDisplayName = (chat: Chat) => {
    if (chat.is_group || chat.is_channel) {
      return chat.name || `Чат ${chat.id.slice(0, 4)}`;
    }
    const otherMember = chat.members.find(m => m !== username);
    return otherMember ? contactMap[otherMember] || otherMember : 'Личный чат';
  };

  const getChatDisplayIcon = (chat: Chat, size: number = 20) => {
    if (chat.is_group) return <Users size={size} />;
    if (chat.is_channel) return <DotsThreeVertical size={size} />;
    return <UserCircle size={size} />;
  };

  const getFileIcon = (fileName: string) => {
    const iconStyle = { fontSize: '50px' };
    if (!fileName) return <FileOutlined />;

    const extension = fileName.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
      case 'svg':
      case 'bmp':
      case 'tiff':
        return <FileImageOutlined style={iconStyle}/>;
      case 'pdf':
        return <FilePdfOutlined style={iconStyle}/>;
      case 'doc':
      case 'docx':
        return <FileWordOutlined style={iconStyle}/>;
      case 'xls':
      case 'xlsx':
        return <FileExcelOutlined style={iconStyle}/>;
      case 'txt':
        return <BsFiletypeTxt  style={iconStyle}/>
      case 'md':
      case 'rtf':
        return <FileTextOutlined style={iconStyle}/>;
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return <FileZipOutlined style={iconStyle}/>;
      default:
        return <FileOutlined style={iconStyle}/>; 
    }
  };

  const scrollToMessage = (messageId: string | null) => {
    if (!messageId) {
      return null;
    }
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-yellow-200', 'dark:bg-yellow-400/30');
      setTimeout(() => {
        element.classList.remove('bg-yellow-200', 'dark:bg-yellow-400/30');
      }, 2000);
    } else {
      toast.info('Цитируемое сообщение не найдено в текущем списке.');
    }
  };

  const renderMessageItem = (msg: Message) => {
    const messageDate = formatDate(msg.timestamp);

    const getQuotedMessagePreview = (quotedId: string): { sender: string; content: string } | null => {
      const fullQuotedMsg = quotedMessageData[quotedId];
      if (fullQuotedMsg) {
        const senderName = contactMap[fullQuotedMsg.sender] || fullQuotedMsg.sender;
        let contentPreview = 'Сообщение';
        if (fullQuotedMsg.content) {
          contentPreview = fullQuotedMsg.content.substring(0, 50) + (fullQuotedMsg.content.length > 50 ? '...' : '');
        } else if (fullQuotedMsg.file_name) {
          contentPreview = `📎 ${fullQuotedMsg.file_name}`;
        }

        return {
          sender: senderName,
          content: contentPreview
        };
      }
      return null;
    };

    const isMyMessage = msg.sender === username;
    const messageClass = isMyMessage
      ? 'bg-indigo-500 text-white self-end'
      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 self-start';
    
    return (
      <div
        key={msg.id}
        id={`message-${msg.id}`}
        className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} group`}
        onContextMenu={(e) => handleMessageContextMenu(e, msg)}
      >
        <div className={`relative max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl px-4 py-2 rounded-lg ${messageClass} break-words word-break`}>
          {!isMyMessage && (
            <div className="font-semibold text-sm mb-1">{contactMap[msg.sender] || msg.sender}</div>
          )}
          {/* Ответ */}
          {msg.quoted_message_id && (
            (() => {
              const isDataLoaded = quotedMessageData[msg.quoted_message_id!] !== undefined;
              const previewText = getQuotedMessagePreview(msg.quoted_message_id!);
              if (!isDataLoaded) { 
                fetchQuotedMessageData(msg.quoted_message_id!).catch(err => {
                  console.warn(`Фоновая загрузка цитаты ${msg.quoted_message_id!} провалилась:`, err);
                });
              }

              return (
                <div 
                  className="mb-2 p-2 bg-black/10 dark:bg-white/10 border-l-4 border-purple-500 rounded text-sm cursor-pointer hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                  onClick={() => {scrollToMessage(msg.quoted_message_id)}}
                >
                  <span className="italic opacity-80 flex items-center">
                    <CommentOutlined size={14} className="mr-1" />
                    {previewText?.sender}
                  </span>
                  <span className="italic opacity-80 flex items-center">
                    {previewText?.content}
                  </span>
                </div>
              );
            })()
          )}
          <div className="text-sm">
            {renderContent(msg.content)}
            {msg.file_url && (
              <div className="mt-2">
                {msg.file_name ? (
                  <div className="flex flex-col">
                    <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="text-black hover:underline flex items-center">
                      {getFileIcon(msg.file_name)}
                      {msg.file_name}
                    </a>
                    {(msg.file_url.endsWith('.png') || msg.file_url.endsWith('.jpg') || msg.file_url.endsWith('.jpeg') || msg.file_url.endsWith('.gif') || msg.file_url.endsWith('.webp')) ? (
                      <img src={msg.file_url} alt={msg.file_name} className="mt-2 rounded max-h-48 object-contain" />
                    ) : null}
                  </div>
                ) : (
                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center">
                    <Paperclip size={16} className="mr-1" />
                    Файл
                  </a>
                )}
              </div>
            )}
            {msg.edited && <span className="text-xs text-black ml-2">(ред.)</span>}
          </div>
          <div className={`text-right text-xs mt-1 ${isMyMessage ? 'text-gray-300' : 'text-gray-500'}`}>
            {formatTimestamp(msg.timestamp)}
          </div>
          
          <div className="absolute top-0 left-0 right-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <button
              onClick={(e) => { e.stopPropagation(); quoteMessage(msg); }}
              className="absolute bottom-1 right-1/2 transform translate-x-1/2 bg-gray-500 hover:bg-gray-600 text-white rounded-full p-1 text-xs pointer-events-auto"
            >
              <PaperPlaneRight size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMessages = () => {
    let lastDate = '';
    const messagesToRender = filteredMessages || [];

    return messagesToRender.map((msg) => {
      const messageDate = formatDate(msg.timestamp);
      const showDateHeader = messageDate !== lastDate;
      lastDate = messageDate;

      return (
        <React.Fragment key={`fragment-${msg.id}`}>
          {showDateHeader && (
            <div className="text-center my-2">
              <span className="inline-block bg-gray-300 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
                {messageDate}
              </span>
            </div>
          )}
          {renderMessageItem(msg)}
        </React.Fragment>
      );
    });
  };

  const renderSidebar = () => (
    <div className="flex flex-col w-full md:w-1/3 border-r border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Чаты</h2>
        <div className="relative">
          <button onClick={() => setShowCreateOptions(!showCreateOptions)} className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <Plus size={24} />
          </button>
          {showCreateOptions && (
            <div ref={createOptionsRef} className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
              <a onClick={() => { setShowContactSearch(true); setShowCreateOptions(false); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                Новый личный чат
              </a>
              <a onClick={() => { setShowCreateGroup(true); setShowCreateOptions(false); setShowContactSearch(true); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                Новая группа
              </a>
              <a onClick={() => { setShowCreateChannel(true); setShowCreateOptions(false); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                Новый канал
              </a>
            </div>
          )}
        </div>
      </div>
      <div className="p-4 border-b border-gray-300 dark:border-gray-800">
        <div className="relative">
          <MagnifyingGlass size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск чатов..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoadingChats ? (
          <div className="p-4 text-center text-gray-500">Загрузка чатов...</div>
        ) : filteredChats.length > 0 ? (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveChat(chat.id)}
              className={`flex items-center p-4 border-b border-gray-300 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${activeChat === chat.id ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
            >
              <div className="flex-shrink-0 mr-3 text-gray-500 dark:text-gray-400">
                {getChatDisplayIcon(chat)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{getChatDisplayName(chat)}</div>
                  {unreadCounts[chat.id] > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
                      {unreadCounts[chat.id]}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {messagesByChat[chat.id] && messagesByChat[chat.id].length > 0
                    ? messagesByChat[chat.id][messagesByChat[chat.id].length - 1].content?.split('\n')[0] || 'Новый файл'
                    : 'Нет сообщений'}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-gray-500">Нет чатов.</div>
        )}
      </div>
    </div>
  );

  const renderEditingMessage = () => {
    if (!editingMessage) return null;

    return (
      <div className="w-full max-w-full overflow-hidden">
        <div className="flex items-start max-w-full w-full mb-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-t-lg border border-gray-200 dark:border-gray-700">
          <EditOutlined className="text-3xl text-purple-500 mt-1 flex-shrink-0 mr-2" />
          
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-start w-full">
              <div className="border-l-[4px] border-purple-500 pl-3 rounded-sm flex-1 min-w-0 w-full max-w-full overflow-hidden" style={{wordBreak: 'break-word'}}>
                <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-1 truncate">
                  Редактирование
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 w-full max-w-full overflow-hidden">
                  <div className="line-clamp-2 break-words">
                    {editingMessage.content ? (
                      editingMessage.content
                    ) : editingMessage.file_name ? (
                      `📎 ${editingMessage.file_name}`
                    ) : (
                      'Сообщение'
                    )}
                  </div>
                </div>
              </div>
              
              <button
                onClick={cancelEdit}
                className="ml-2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                aria-label="Отменить цитирование"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderQuotedMessage = () => {
    if (!quotedMessage) return null;

    return (
      <div className="w-full max-w-full overflow-hidden">
        <div className="flex items-start max-w-full w-full mb-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-t-lg border border-gray-200 dark:border-gray-700">
          <CommentOutlined className="text-xl text-purple-500 mt-1 flex-shrink-0 mr-2" />
          
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-start w-full">
              <div className="border-l-[4px] border-purple-500 pl-3 rounded-sm flex-1 min-w-0 w-full max-w-full overflow-hidden">
                <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-1 truncate">
                  Ответ {contactMap[quotedMessage.sender] || quotedMessage.sender}:
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 w-full max-w-full overflow-hidden">
                  <div className="line-clamp-2 break-words">
                    {quotedMessage.content ? (
                      quotedMessage.content
                    ) : quotedMessage.file_name ? (
                      `📎 ${quotedMessage.file_name}`
                    ) : (
                      'Сообщение'
                    )}
                  </div>
                </div>
              </div>
              
              <button
                onClick={cancelQuote}
                className="ml-2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                aria-label="Отменить цитирование"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    let timer;
    if (showChatInfoSidebar) {
      setIsSidebarVisible(true);
      timer = setTimeout(() => {
      }, 10);
    } else {
      timer = setTimeout(() => {
        setIsSidebarVisible(false);
      }, 300);
    }
    return () => clearTimeout(timer);
  }, [showChatInfoSidebar]);

  const openSidebar = () => {
    setIsSidebarVisible(true);
    setTimeout(() => {
      setShowChatInfoSidebar(true);
    }, 10);
  };

  const renderChatInfoSidebar = () => {
    if (!currentChat || !isSidebarVisible) {
      return null;
    }

    return (
      <div 
      className={`h-full w-[420px] bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out ${
        showChatInfoSidebar ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ 
        position: 'absolute',
        right: 0,
        top: 0,
        zIndex: 40,
        height: '100%'
      }}
    >
      {renderEditChatModal()}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Информация о чате</h3>
        <div className=''>
          <button
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={openEditChatModal}
          >
            <EditOutlined className="text-2xl mr-4" />
          </button>
          <button 
            onClick={() => setShowChatInfoSidebar(false)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Закрыть"
          >
            <X size={24} />
          </button>
        </div>
      </div>
      <div className="p-4 overflow-y-auto h-[calc(100%-65px)]">
            
            <div className="mb-6">
              <div className="flex flex-col items-center mb-4">
                <div className="mb-2 text-gray-500 dark:text-gray-400 text-9xl">
                  {getChatDisplayIcon(currentChat, 180)}
                </div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {getChatDisplayName(currentChat)}
                </h4>
                <div className="text-sm">
                  <div className="text-gray-500 dark:text-gray-400">Участники ({currentChat.members?.length || 0})</div>
                </div>
                {currentChat.description && (
                  <div className='flex justify-start w-full gap-8 pl-5 pb-2 mt-12 rounded-xl hover:bg-gray-100'>
                    <InfoCircleOutlined className='text-2xl text-gray-600'/>
                    <div>
                      <p className="text-black text-lg dark:text-gray-400 mt-1">{currentChat.description}</p>
                      <p className="text-gray-600 text-xs dark:text-gray-400">Информация</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-6">
              <h5 className="text-md font-semibold mb-2 text-gray-900 dark:text-gray-100">Участники</h5>
              <div className="space-y-2 max-h-1/2 overflow-y-auto">
                {currentChat.members && currentChat.members.length > 0 ? (
                  currentChat.members.map((member, index) => (
                    <div key={index} className="flex items-center p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                      <UserCircle size={20} className="mr-2 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <span className="truncate">{contactMap[member] || member}</span>
                      {currentChat.creator_username === member && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 rounded">
                          Админ
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Нет участников</p>
                )}
              </div>
            </div>

            {currentChat.is_group || currentChat.is_channel ? (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                {currentChat.creator_username !== username ? (
                  <button
                    onClick={() => {
                      console.info('Функция пока не реализована.');
                    }}
                    className="w-full py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                  >
                    Покинуть чат
                  </button>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                    Вы являетесь создателем этого чата.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
    );
  };

  const handleEditChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChat || !token) return;

    const trimmedName = editChatName.trim();
    if (!trimmedName) {
      toast.error('Название чата не может быть пустым');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/chat/chats/${currentChat.id}`, {
        method: 'PATCH',   
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          description: editChatDescription.trim() || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Ошибка редактирования чата:', res.status, errorData);
        let errorMsg = 'Не удалось обновить чат';
        if (errorData.detail) {
          if (typeof errorData.detail === 'string') {
            errorMsg = errorData.detail;
          } else if (Array.isArray(errorData.detail) && errorData.detail[0]?.msg) {
            errorMsg = errorData.detail[0].msg;
          }
        }
        toast.error(errorMsg);
        return;
      }

      const updatedChatData: Partial<Chat> = await res.json();
      console.log('Чат успешно обновлен:', updatedChatData);

      setChats(prevChats =>
        prevChats.map(chat =>
          chat.id === currentChat.id
            ? { ...chat, ...updatedChatData }
            : chat
        )
      );
      // setCurrentChat(prev => prev ? { ...prev, ...updatedChatData } : null);

      toast.success('Чат успешно обновлен');
      setShowEditChatModal(false);
    } catch (err: any) {
      console.error('Ошибка сети при редактировании чата:', err);
      toast.error('Ошибка сети при обновлении чата');
    }
  };

  useEffect(() => {
    let timer;
    if (showEditChatModal) {
      setIsEditModalVisible(true);
      timer = setTimeout(() => {
      }, 10);
    } else {
      timer = setTimeout(() => {
        setIsEditModalVisible(false);
      }, 300);
    }
    return () => clearTimeout(timer);
  }, [showEditChatModal]);

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

  const renderEditChatModal = () => {
    if (!isEditModalVisible || !currentChat) {
      return null;
    }

    return (
      <div 
        className="fixed inset-0 transition-opacity duration-300 ease-in-out z-[101]"
        onClick={closeEditModal}
      >
        <div 
          className={`h-full w-[420px] bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col ${
            showEditChatModal ? 'translate-x-0' : 'translate-x-full'
          }`}
          onClick={(e) => e.stopPropagation()}
          style={{ marginLeft: 'auto' }}
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Редактировать чат</h3>
            <button 
              onClick={closeEditModal}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Закрыть"
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleEditChatSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="flex flex-col items-center mb-6">
                <div className="mb-2 text-gray-500 dark:text-gray-400 text-6xl">
                  {getChatDisplayIcon(currentChat, 96)}
                </div>
                <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 text-center">
                  {currentChat.is_group || currentChat.is_channel
                    ? (currentChat.name || 'Без названия')
                    : 'Личный чат'}
                </h4>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-chat-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Название
                  </label>
                  <input
                    type="text"
                    id="edit-chat-name"
                    value={editChatName}
                    onChange={(e) => setEditChatName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Введите название чата"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="edit-chat-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Описание
                  </label>
                  <textarea
                    id="edit-chat-description"
                    value={editChatDescription}
                    onChange={(e) => setEditChatDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Введите описание чата (необязательно)"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  };

const renderChatWindow = () => {
  if (!activeChat || !currentChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <div className="text-gray-500 dark:text-gray-400 text-lg">Выберите чат для начала общения</div>
      </div>
    );
  }
  
  return (
    <div className="relative flex flex-1 bg-gray-100 dark:bg-gray-800 h-full overflow-hidden">
      <div className={`flex flex-col flex-1 transition-all duration-300 ease-in-out ${
        showChatInfoSidebar ? 'mr-[420px]' : ''
      }`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900">
          {/*  */}
          <div className="flex items-center hover:cursor-pointer"> 
            <div className="flex-shrink-0 mr-3 text-gray-500 dark:text-gray-400"
              onClick={() => {openSidebar()}}
            >
              {getChatDisplayIcon(currentChat)}
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{getChatDisplayName(currentChat)}</h2>
              {currentChat.is_channel && (
                <div className="text-sm text-gray-500 dark:text-gray-400">{currentChat.description}</div>
              )}
            </div>
          </div>
          <div className="relative">
            <button onClick={() => setShowChatOptions(!showChatOptions)} className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <DotsThreeVertical size={24} />
            </button>
            {showChatOptions && (
              <div ref={chatOptionsRef} className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
                {(currentChat.is_group || currentChat.is_channel) && (
                  <>
                    <a onClick={() => { setShowInviteModal(true); setShowChatOptions(false); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                      Пригласить пользователей
                    </a>
                    {currentChat.creator_username === username && (
                      <a onClick={() => { setShowKickModal(true); setShowChatOptions(false); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                        Исключить пользователей
                      </a>
                    )}
                  </>
                )}
                <a onClick={() => { setShowLeaveModal(true); setShowChatOptions(false); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  Покинуть чат
                </a>
                {currentChat.creator_username === username && (
                  <a onClick={() => { setShowDeleteModal(true); setShowChatOptions(false); }} className="block px-4 py-2 text-sm text-red-600 hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer">
                    Удалить чат
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-2 messages-container relative" onScroll={handleScroll}>
          {hasMoreByChat[activeChat] && isLoadingMessages && (
            <div className="text-center text-gray-500">Загрузка старых сообщений...</div>
          )}
          {renderMessages()}
          <div ref={messagesEndRef} />
          {renderContextMenu()}
        </div>
        {isTyping && typingUser !== username && (
          <div className="p-2 text-sm text-gray-500 dark:text-gray-400">
            {contactMap[typingUser] || typingUser} печатает...
          </div>
        )}
        {/* INPUT BAR */}
        <div className="p-4 border-t border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900 relative">
          {renderQuotedMessage()}
          {renderEditingMessage()}
          {showEmojiPicker && (
            <div className="absolute bottom-16 left-0 z-10">
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
          {showStickerPicker && (
            <div ref={stickerPickerRef} className="absolute bottom-16 left-0 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 grid grid-cols-4 gap-2">
              {stickers.map((sticker, index) => (
                <button key={index} onClick={() => handleStickerClick(sticker)} className="w-12 h-12">
                  <img src={sticker} alt={`Sticker ${index + 1}`} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center space-x-2">
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <Smiley size={24} />
            </button>
            <button onClick={() => setShowStickerPicker(!showStickerPicker)} className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <Sticker size={24} />
            </button>
            <label className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer">
              <Paperclip size={24} />
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleTyping}
              placeholder={editingMessage ? 'Редактировать сообщение...' : 'Напишите сообщение...'}
              className="flex-1 px-4 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              ref={inputRef}
            />
            {editingMessage ? (
              <button onClick={cancelEdit} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 rounded-full transition-colors">
                <X size={24} />
              </button>
            ) : (
              <button onClick={handleSendMessage} className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                <PaperPlaneRight size={24} />
              </button>
            )}
            <button onClick={isRecording ? stopRecording : startRecording} className={`p-2 rounded-full ${isRecording ? 'bg-red-600' : 'bg-gray-200 dark:bg-gray-700'} text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors`}>
              <Microphone size={24} color={isRecording ? 'white' : 'currentColor'} />
            </button>
          </div>
          {selectedFile && (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 flex items-center">
              <Paperclip size={16} className="mr-1" />
              <span>Выбран файл: {selectedFile.name}</span>
              <button onClick={() => setSelectedFile(null)} className="ml-2 text-red-500 hover:text-red-700">
                <X size={16} />
              </button>
            </div>
          )}
        </div>
        {showDeleteMessageModal && messageToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                Удалить сообщение
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                Вы уверены, что хотите удалить это сообщение? Это действие нельзя отменить.
              </p>
              {/* Опционально: показать превью удаляемого сообщения */}
              {/* 
              <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded text-sm break-words">
                {messageToDelete.content || messageToDelete.file_name || 'Файл'}
              </div>
              */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteMessageModal(false);
                    setMessageToDelete(null);
                  }}
                  className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDeleteMessage}
                  className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {renderChatInfoSidebar()}
    </div>
  );
};

  const renderModals = () => {
    if (showContactSearch) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Начать чат с контактом</h3>
            <div className="relative mb-4">
              <MagnifyingGlass size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск по ФИО или логину..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={contactSearchQuery}
                onChange={(e) => {
                  setContactSearchQuery(e.target.value);
                  if (e.target.value.length > 2) {
                    searchContacts(e.target.value);
                  } else {
                    setContacts([]);
                  }
                }}
              />
            </div>
            {isLoadingContacts ? (
              <div className="text-center text-gray-500">Поиск...</div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {contacts.length > 0 ? (
                  contacts.map(contact => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                      onClick={() => {
                        if (showCreateGroup || showCreateChannel || showInviteModal) {
                          toggleContactSelection(contact);
                        } else {
                          createPrivateChat(contact.id);
                        }
                      }}
                    >
                      <div className="flex items-center">
                        <UserCircle size={24} className="mr-3 text-gray-500" />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{contact.displayName}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{contact.id}</div>
                        </div>
                      </div>
                      {(showCreateGroup || showCreateChannel || showInviteModal) && (
                        <input
                          type="checkbox"
                          checked={selectedContacts.some(c => c.id === contact.id)}
                          onChange={() => toggleContactSelection(contact)}
                          className="form-checkbox text-indigo-600 h-5 w-5"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500">Контакты не найдены</div>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowContactSearch(false);
                  setContactSearchQuery('');
                  setContacts([]);
                  if (showCreateGroup || showCreateChannel) {
                    setShowCreateGroup(false);
                    setShowCreateChannel(false);
                  }
                  if (showInviteModal) {
                    setShowInviteModal(false);
                    setSelectedContacts([]);
                  }
                }}
                className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Отмена
              </button>
              {(showCreateGroup || showCreateChannel || showInviteModal) && (
                <button
                  onClick={() => {
                    if (showCreateGroup) createGroupChat();
                    if (showCreateChannel) createChannel();
                    if (showInviteModal && activeChat) inviteToChat(activeChat, selectedContacts.map(c => c.id));
                  }}
                  className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  disabled={selectedContacts.length === 0}
                >
                  Готово
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    if (showCreateGroup) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Создать новую группу</h3>
            <input
              type="text"
              placeholder="Название группы"
              className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <div className="relative mb-4">
              <MagnifyingGlass size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск контактов для добавления..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={contactSearchQuery}
                onChange={(e) => {
                  setContactSearchQuery(e.target.value);
                  if (e.target.value.length > 2) {
                    searchContacts(e.target.value);
                  } else {
                    setContacts([]);
                  }
                }}
              />
            </div>
            {isLoadingContacts ? (
              <div className="text-center text-gray-500">Поиск...</div>
            ) : (
              <div className="max-h-40 overflow-y-auto mb-4">
                {contacts.map(contact => (
                  <div key={contact.id} className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors" onClick={() => toggleContactSelection(contact)}>
                    <div className="flex items-center">
                      <UserCircle size={24} className="mr-3 text-gray-500" />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{contact.displayName}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{contact.id}</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedContacts.some(c => c.id === contact.id)}
                      onChange={() => toggleContactSelection(contact)}
                      className="form-checkbox text-indigo-600 h-5 w-5"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowCreateGroup(false);
                  setGroupName('');
                  setSelectedContacts([]);
                  setContactSearchQuery('');
                  setContacts([]);
                }}
                className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={createGroupChat}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                disabled={!groupName.trim() || selectedContacts.length < 1}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (showCreateChannel) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Создать новый канал</h3>
            <input
              type="text"
              placeholder="Название канала"
              className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
            <textarea
              placeholder="Описание канала (необязательно)"
              className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={channelDescription}
              onChange={(e) => setChannelDescription(e.target.value)}
            />
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowCreateChannel(false);
                  setChannelName('');
                  setChannelDescription('');
                }}
                className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={createChannel}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                disabled={!channelName.trim()}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (showInviteModal && currentChat) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Пригласить в {getChatDisplayName(currentChat)}</h3>
            <div className="relative mb-4">
              <MagnifyingGlass size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск контактов..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={contactSearchQuery}
                onChange={(e) => {
                  setContactSearchQuery(e.target.value);
                  if (e.target.value.length > 2) {
                    searchContacts(e.target.value);
                  } else {
                    setContacts([]);
                  }
                }}
              />
            </div>
            {isLoadingContacts ? (
              <div className="text-center text-gray-500">Поиск...</div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {contacts.filter(c => !currentChat.members.includes(c.id)).length > 0 ? (
                  contacts.filter(c => !currentChat.members.includes(c.id)).map(contact => (
                    <div key={contact.id} className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors" onClick={() => toggleContactSelection(contact)}>
                      <div className="flex items-center">
                        <UserCircle size={24} className="mr-3 text-gray-500" />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{contact.displayName}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{contact.id}</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedContacts.some(c => c.id === contact.id)}
                        onChange={() => toggleContactSelection(contact)}
                        className="form-checkbox text-indigo-600 h-5 w-5"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500">Все подходящие контакты уже в чате</div>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => { setShowInviteModal(false); setSelectedContacts([]); setContactSearchQuery(''); setContacts([]); }}
                className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => inviteToChat(currentChat.id, selectedContacts.map(c => c.id))}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                disabled={selectedContacts.length === 0}
              >
                Пригласить
              </button>
            </div>
          </div>
        </div>
      );
    }
    // Kick Modal
    if (showKickModal && currentChat) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Исключить из {getChatDisplayName(currentChat)}</h3>
            <div className="max-h-60 overflow-y-auto mb-4">
              {currentChat.members.filter(member => member !== username).map(member => (
                <div key={member} className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors" onClick={() => toggleKickSelection(member)}>
                  <div className="flex items-center">
                    <UserCircle size={24} className="mr-3 text-gray-500" />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{contactMap[member] || member}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{member}</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedToKick.includes(member)}
                    onChange={() => toggleKickSelection(member)}
                    className="form-checkbox text-red-600 h-5 w-5"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => { setShowKickModal(false); setSelectedToKick([]); }}
                className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => kickFromChat(currentChat.id, selectedToKick)}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={selectedToKick.length === 0}
              >
                Исключить
              </button>
            </div>
          </div>
        </div>
      );
    }
    // Leave modal
    if (showLeaveModal && currentChat) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg text-center">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Покинуть чат</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Вы уверены, что хотите покинуть чат "{getChatDisplayName(currentChat)}"?
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => leaveChat(currentChat.id)}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Покинуть
              </button>
            </div>
          </div>
        </div>
      );
    }
    // Delete modal
    if (showDeleteModal && currentChat) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg text-center">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Удалить чат</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Вы уверены, что хотите навсегда удалить чат "{getChatDisplayName(currentChat)}"? Это действие нельзя отменить.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => deleteChat(currentChat.id)}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-screen w-full bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {renderSidebar()}
      {renderChatWindow()}
      {renderModals()}
    </div>
  );
};

export default ChatComponent;