import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { 
  FiArrowLeft, 
  FiMoon, 
  FiSun, 
  FiSearch, 
  FiPlus, 
  FiPaperclip, 
  FiSend, 
  FiX,
  FiMessageSquare,
  FiUsers,
  FiHash,
  FiTrash2
} from 'react-icons/fi';

interface User {
  username: string;
  full_name: string;
  profile_image?: string;
}

interface Channel {
  id: string;
  name: string;
  is_private: boolean;
  members: User[];
  created_by: string;
  last_message?: {
    content: string;
    timestamp: string;
  };
  unread_count: number;
}

interface Message {
  id: string;
  sender: User;
  content: string;
  timestamp: string;
  is_file: boolean;
}

const ChatApp: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [newMessage, setNewMessage] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCreateChatModal, setShowCreateChatModal] = useState<boolean>(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState<boolean>(false);
  const [contacts, setContacts] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [channelName, setChannelName] = useState<string>('');
  const [contactSearch, setContactSearch] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectAttempts = useRef<number>(0);
  const maxReconnectAttempts = 5;
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Запрашиваем разрешение на уведомления при загрузке
  useEffect(() => {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  const connectWebSocket = useCallback((selectedChannelId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `ws://192.1.66.117:8000/api/chat/ws/${selectedChannelId}?token=${token}`;
    console.log(`Подключение к WebSocket: ${wsUrl}`);

    const attemptConnection = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket соединение открыто');
        reconnectAttempts.current = 0; // Сбрасываем счетчик попыток при успешном подключении
        toast.dismiss(); // Удаляем уведомления об ошибках
      };

      ws.onmessage = (event) => {
        console.log('Получено сообщение:', event.data);
        // Здесь можно добавить обработку входящих сообщений, если сервер отправляет их через WebSocket
      };

      ws.onerror = (error) => {
        console.error(`Ошибка WebSocket для канала ${selectedChannelId}:`, error);
        wsRef.current = null;
      };

      ws.onclose = (event) => {
        console.log(`WebSocket соединение закрыто. Код: ${event.code}, Причина: ${event.reason}`);
        wsRef.current = null;

        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.pow(2, reconnectAttempts.current) * 1000; // Экспоненциальная задержка
          reconnectAttempts.current += 1;
          console.log(`Попытка переподключения ${reconnectAttempts.current}/${maxReconnectAttempts} через ${delay}мс`);
          toast.warn(`Потеряно соединение с сервером. Переподключение (${reconnectAttempts.current}/${maxReconnectAttempts})...`, {
            position: 'top-right',
            autoClose: 5000,
          });
          setTimeout(attemptConnection, delay);
        } else {
          console.error('Исчерпаны все попытки переподключения');
          toast.error('Не удалось подключиться к серверу. Проверьте соединение или обратитесь к администратору.', {
            position: 'top-right',
            autoClose: false,
          });
        }
      };
    };

    // Проверка доступности сервера перед подключением
    fetch('http://192.1.66.117:8000/api/health', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(response => {
        if (response.ok) {
          attemptConnection();
        } else {
          throw new Error('Сервер недоступен');
        }
      })
      .catch(error => {
        console.error('Ошибка проверки сервера:', error);
        toast.error('Сервер недоступен. Пожалуйста, проверьте соединение.', {
          position: 'top-right',
          autoClose: false,
        });
      });
  }, [token]);

  // Инициализация WebSocket и получение данных
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      try {
        // Получение данных пользователя (раскомментировать, когда API будет готов)
        /*
        const userResponse = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (userResponse.ok) setUser(await userResponse.json());
        */

        // Получение каналов пользователя
        const channelsResponse = await fetch('/api/chat/channels', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (channelsResponse.ok) setChannels(await channelsResponse.json());

        // Получение контактов
        const contactsResponse = await fetch('/api/chat/contacts', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (contactsResponse.ok) setContacts(await contactsResponse.json());
      } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        toast.error('Не удалось загрузить данные', {
          position: 'top-right',
          autoClose: 3000,
        });
      }
    };

    fetchData();

    if (selectedChannel && token) {
      connectWebSocket(selectedChannel.id);
    } else if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    socketRef.current = io('/ws', {
      auth: { token },
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => console.log('Подключено к WebSocket'));

    socketRef.current.on('new_message', (message: Message & { channel_id: string }) => {
      if (message.channel_id === selectedChannel?.id) {
        setMessages(prev => [...prev, message]);
      } else {
        if (Notification.permission === 'granted') {
          new Notification(`Новое сообщение в ${channels.find(c => c.id === message.channel_id)?.name || 'канале'}`, {
            body: `${message.sender.full_name}: ${message.content}`,
            icon: '/favicon.ico',
          });
        }
        toast.info(`Новое сообщение в ${channels.find(c => c.id === message.channel_id)?.name || 'канале'}: ${message.content}`, {
          position: 'top-right',
          autoClose: 3000,
        });
      }

      setChannels(prev => prev.map(channel => {
        if (channel.id === message.channel_id) {
          return {
            ...channel,
            last_message: {
              content: message.content,
              timestamp: message.timestamp
            },
            unread_count: channel.id === selectedChannel?.id ? 0 : channel.unread_count + 1
          };
        }
        return channel;
      }));
    });

    socketRef.current.on('channel_deleted', (channelId: string) => {
      setChannels(prev => prev.filter(c => c.id !== channelId));
      if (selectedChannel?.id === channelId) {
        setSelectedChannel(null);
        toast.info('Канал удален', {
          position: 'top-right',
          autoClose: 3000,
        });
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (wsRef.current) wsRef.current.close();
    };
  }, [token, navigate, selectedChannel, channels]);

  // Получение сообщений при смене канала
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedChannel) return;
      try {
        const response = await fetch(`/api/chat/messages/${selectedChannel.id}?limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          setMessages(await response.json());
          setChannels(prev => prev.map(channel => 
            channel.id === selectedChannel.id 
              ? { ...channel, unread_count: 0 } 
              : channel
          ));
        } else {
          toast.error('Не удалось загрузить сообщения', {
            position: 'top-right',
            autoClose: 3000,
          });
        }
      } catch (error) {
        console.error('Ошибка при загрузке сообщений:', error);
        toast.error('Не удалось загрузить сообщения', {
          position: 'top-right',
          autoClose: 3000,
        });
      }
    };
    fetchMessages();
  }, [selectedChannel, token]);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!selectedChannel || (!newMessage.trim() && !file)) return;
    try {
      const formData = new FormData();
      if (newMessage.trim()) formData.append('content', newMessage);
      if (file) formData.append('file', file);

      const response = await fetch(`/api/chat/messages/${selectedChannel.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        setNewMessage('');
        setFile(null);
        toast.success('Сообщение отправлено', {
          position: 'top-right',
          autoClose: 2000,
        });
      } else {
        toast.error('Не удалось отправить сообщение', {
          position: 'top-right',
          autoClose: 3000,
        });
      }
    } catch (error) {
      console.error('Ошибка при отправке сообщения:', error);
      toast.error('Не удалось отправить сообщение', {
        position: 'top-right',
        autoClose: 3000,
      });
    }
  }, [selectedChannel, newMessage, file, token]);

  const createNewChat = useCallback(async () => {
    if (selectedUsers.length === 0) return;
    try {
      const response = await fetch('/api/chat/channels', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `${selectedUsers.map(u => u.full_name).join(', ')}`,
          is_private: true,
          members: selectedUsers.map(u => u.username)
        }),
      });

      if (response.ok) {
        const newChannel = await response.json();
        setChannels(prev => [...prev, newChannel]);
        setSelectedChannel(newChannel);
        setShowCreateChatModal(false);
        setSelectedUsers([]);
        toast.success('Приватный чат создан', {
          position: 'top-right',
          autoClose: 2000,
        });
      } else {
        toast.error('Не удалось создать чат', {
          position: 'top-right',
          autoClose: 3000,
        });
      }
    } catch (error) {
      console.error('Ошибка при создании чата:', error);
      toast.error('Не удалось создать чат', {
        position: 'top-right',
        autoClose: 3000,
      });
    }
  }, [selectedUsers, token]);

  const createNewChannel = useCallback(async () => {
    if (selectedUsers.length === 0 || !channelName.trim()) return;
    try {
      const response = await fetch('/api/chat/channels', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: channelName,
          is_private: false,
          members: selectedUsers.map(u => u.username)
        }),
      });

      if (response.ok) {
        const newChannel = await response.json();
        setChannels(prev => [...prev, newChannel]);
        setSelectedChannel(newChannel);
        setShowCreateChannelModal(false);
        setSelectedUsers([]);
        setChannelName('');
        toast.success('Канал создан', {
          position: 'top-right',
          autoClose: 2000,
        });
      } else {
        toast.error('Не удалось создать канал', {
          position: 'top-right',
          autoClose: 3000,
        });
      }
    } catch (error) {
      console.error('Ошибка при создании канала:', error);
      toast.error('Не удалось создать канал', {
        position: 'top-right',
        autoClose: 3000,
      });
    }
  }, [selectedUsers, channelName, token]);

  const deleteChannel = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      const response = await fetch(`/api/chat/channels/${selectedChannel.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        setChannels(prev => prev.filter(c => c.id !== selectedChannel.id));
        setSelectedChannel(null);
        toast.success('Канал удален', {
          position: 'top-right',
          autoClose: 2000,
        });
      } else {
        toast.error('Не удалось удалить канал', {
          position: 'top-right',
          autoClose: 3000,
        });
      }
    } catch (error) {
      console.error('Ошибка при удалении канала:', error);
      toast.error('Не удалось удалить канал', {
        position: 'top-right',
        autoClose: 3000,
      });
    }
  }, [selectedChannel, token]);

  const toggleUserSelection = (user: User) => {
    setSelectedUsers(prev => 
      prev.some(u => u.username === user.username) 
        ? prev.filter(u => u.username !== user.username) 
        : [...prev, user]
    );
  };

  const filteredChannels = channels.filter((channel: Channel) =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredContacts = contacts.filter((contact: User) =>
    contact.full_name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    contact.username.toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <div className={`flex h-screen ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <ToastContainer />
      <div className={`w-80 border-r ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center">
            <button 
              onClick={() => navigate('/dashboard')}
              className="mr-3 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <FiArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold">Чаты</h1>
          </div>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {darkMode ? <FiSun className="w-5 h-5" /> : <FiMoon className="w-5 h-5" />}
          </button>
        </div>

        <div className="p-4">
          <div className={`relative mb-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="Поиск чатов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full py-2 pl-10 pr-4 rounded-lg ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          <div className="flex gap-2 mb-4">
            <button 
              onClick={() => setShowCreateChatModal(true)}
              className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg ${darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white transition-colors`}
            >
              <FiUsers className="mr-2" />
              Новый чат
            </button>
            <button 
              onClick={() => setShowCreateChannelModal(true)}
              className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg ${darkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} text-white transition-colors`}
            >
              <FiHash className="mr-2" />
              Новый канал
            </button>
          </div>

          <div className="space-y-1">
            {filteredChannels.map((channel: Channel) => (
              <div 
                key={channel.id}
                onClick={() => setSelectedChannel(channel)}
                className={`p-3 rounded-lg cursor-pointer flex items-center justify-between ${
                  darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                } ${
                  selectedChannel?.id === channel.id ? (darkMode ? 'bg-gray-800' : 'bg-gray-200') : ''
                }`}
              >
                <div className="flex items-center overflow-hidden">
                  {channel.is_private ? (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      {channel.members.find(m => m.username !== user?.username)?.full_name[0].toUpperCase()}
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      <FiHash className="w-5 h-5" />
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="font-medium truncate">
                      {channel.is_private
                        ? channel.members.find(m => m.username !== user?.username)?.full_name
                        : channel.name}
                    </p>
                    {channel.last_message && (
                      <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {channel.last_message.content}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end ml-2">
                  {channel.last_message && (
                    <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {new Date(channel.last_message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {channel.unread_count > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center mt-1">
                      {channel.unread_count}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedChannel ? (
          <>
            <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center">
                {selectedChannel.is_private ? (
                  <>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      {selectedChannel.members.find(m => m.username !== user?.username)?.full_name[0].toUpperCase()}
                    </div>
                    <div>
                      <h2 className="font-semibold">
                        {selectedChannel.members.find(m => m.username !== user?.username)?.full_name}
                      </h2>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Онлайн
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      <FiHash className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold">{selectedChannel.name}</h2>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {selectedChannel.members.length} участников
                      </p>
                    </div>
                  </>
                )}
              </div>
              {selectedChannel.created_by === user?.username && (
                <button 
                  onClick={deleteChannel}
                  className={`p-2 rounded-full ${darkMode ? 'hover:bg-gray-800 text-red-400' : 'hover:bg-gray-100 text-red-500'}`}
                  title="Удалить канал"
                >
                  <FiTrash2 className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message: Message) => (
                <div key={message.id} className={`flex items-start gap-3 ${message.sender.username === user?.username ? 'justify-end' : ''}`}>
                  {message.sender.username !== user?.username && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      {message.sender.full_name[0].toUpperCase()}
                    </div>
                  )}
                  <div className={`max-w-xs md:max-w-md lg:max-w-lg rounded-lg p-3 ${
                    message.sender.username === user?.username 
                      ? darkMode ? 'bg-blue-600' : 'bg-blue-500 text-white' 
                      : darkMode ? 'bg-gray-800' : 'bg-gray-100'
                  }`}>
                    {message.sender.username !== user?.username && (
                      <div className="font-semibold text-sm mb-1">
                        {message.sender.full_name}
                      </div>
                    )}
                    {message.is_file ? (
                      <a 
                        href={message.content} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`inline-block ${message.sender.username === user?.username ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-800'}`}
                      >
                        <div className="flex items-center">
                          <FiPaperclip className="mr-1" />
                          {message.content.split('/').pop()}
                        </div>
                      </a>
                    ) : (
                      <p>{message.content}</p>
                    )}
                    <div className={`text-xs mt-1 ${message.sender.username === user?.username ? 'text-blue-200' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className={`p-4 border-t ${darkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
              {file && (
                <div className="flex items-center justify-between mb-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                  <span className="text-sm truncate">{file.name}</span>
                  <button 
                    onClick={() => setFile(null)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <FiX />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <label className={`p-2 rounded-lg cursor-pointer ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                  <FiPaperclip className="w-5 h-5" />
                  <input
                    type="file"
                    id="file-upload"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Напишите сообщение..."
                  className={`flex-1 p-2 rounded-lg ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() && !file}
                  className={`p-2 rounded-lg ${darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white transition-colors disabled:opacity-50`}
                >
                  <FiSend className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
              <FiMessageSquare className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Чат не выбран</h2>
            <p className={`max-w-md ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Выберите чат из боковой панели или создайте новый
            </p>
          </div>
        )}
      </div>

      {showCreateChatModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-900' : 'bg-white'} w-full max-w-md`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Новый приватный чат</h2>
              <button
                onClick={() => {
                  setShowCreateChatModal(false);
                  setSelectedUsers([]);
                  setContactSearch('');
                }}
                className={`p-1 rounded-full ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className={`relative mb-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiSearch className="text-gray-500" />
                </div>
                <input
                  type="text"
                  placeholder="Поиск контактов..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className={`w-full py-2 pl-10 pr-4 rounded-lg ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>

              <div className={`max-h-96 overflow-y-auto p-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                {filteredContacts.map((contact: User) => (
                  <div 
                    key={contact.username} 
                    className={`flex items-center p-2 rounded-lg cursor-pointer ${
                      selectedUsers.some(u => u.username === contact.username) 
                        ? (darkMode ? 'bg-blue-900/30' : 'bg-blue-100') 
                        : ''
                    }`}
                    onClick={() => toggleUserSelection(contact)}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      {contact.full_name[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{contact.full_name}</p>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>@{contact.username}</p>
                    </div>
                    {selectedUsers.some(u => u.username === contact.username) && (
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white">
                        <FiX className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => {
                    setShowCreateChatModal(false);
                    setSelectedUsers([]);
                    setContactSearch('');
                  }}
                  className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'} transition-colors`}
                >
                  Отмена
                </button>
                <button
                  onClick={createNewChat}
                  disabled={selectedUsers.length === 0}
                  className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white transition-colors disabled:opacity-50`}
                >
                  Создать чат
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateChannelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-900' : 'bg-white'} w-full max-w-md`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Новый канал</h2>
              <button
                onClick={() => {
                  setShowCreateChannelModal(false);
                  setSelectedUsers([]);
                  setContactSearch('');
                  setChannelName('');
                }}
                className={`p-1 rounded-full ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="mb-4">
                <label className="block mb-2 font-medium">Название канала</label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className={`w-full p-2 rounded-lg ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Введите название канала"
                />
              </div>

              <div className={`relative mb-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiSearch className="text-gray-500" />
                </div>
                <input
                  type="text"
                  placeholder="Поиск контактов..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className={`w-full py-2 pl-10 pr-4 rounded-lg ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>

              <div className={`max-h-96 overflow-y-auto p-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                {filteredContacts.map((contact: User) => (
                  <div 
                    key={contact.username} 
                    className={`flex items-center p-2 rounded-lg cursor-pointer ${
                      selectedUsers.some(u => u.username === contact.username) 
                        ? (darkMode ? 'bg-blue-900/30' : 'bg-blue-100') 
                        : ''
                    }`}
                    onClick={() => toggleUserSelection(contact)}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      {contact.full_name[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{contact.full_name}</p>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>@{contact.username}</p>
                    </div>
                    {selectedUsers.some(u => u.username === contact.username) && (
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white">
                        <FiX className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => {
                    setShowCreateChannelModal(false);
                    setSelectedUsers([]);
                    setContactSearch('');
                    setChannelName('');
                  }}
                  className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'} transition-colors`}
                >
                  Отмена
                </button>
                <button
                  onClick={createNewChannel}
                  disabled={selectedUsers.length === 0 || !channelName.trim()}
                  className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} text-white transition-colors disabled:opacity-50`}
                >
                  Создать канал
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatApp;