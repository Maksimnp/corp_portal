import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
  username: string;
  full_name: string;
  email: string;
  department: string;
}

interface Channel {
  id: string;
  name: string;
  creator: string;
  members: string[];
  is_private: boolean;
}

interface Message {
  id?: string;
  sender: string;
  sender_full_name: string;
  content: string;
  file_url?: string;
  timestamp: string;
  is_private?: boolean;
  system?: boolean;
}

export const Chat: React.FC = () => {
  // Состояния
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [contacts, setContacts] = useState<User[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelMembers, setNewChannelMembers] = useState<string[]>([]);
  const [newChannelIsPrivate, setNewChannelIsPrivate] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const themeClass = darkMode 
    ? 'dark bg-gray-900 text-white' 
    : 'bg-gray-50 text-gray-900';

  // Функция загрузки сообщений
  const loadMessages = async () => {
    if (!selectedUser && !selectedChannel) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (selectedUser) params.append('user', selectedUser.username);
      if (selectedChannel) params.append('channel', selectedChannel.id);

      const response = await fetch(`http://192.1.66.117:8000/chat/messages?${params.toString()}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (response.status === 404) {
        setMessages([]);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading messages:', err);
      setError('Failed to load messages');
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Функция загрузки контактов
  const loadContacts = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `http://192.1.66.117:8000/chat/contacts?search=${encodeURIComponent(searchQuery)}`, 
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading contacts:', err);
      setError('Failed to load contacts');
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Функция загрузки каналов
  const loadChannels = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://192.1.66.117:8000/chat/channels', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setChannels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading channels:', err);
      setError('Failed to load channels');
      setChannels([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Эффекты
  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    loadContacts();
    loadChannels();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const timer = setTimeout(() => {
        loadContacts();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadMessages();
  }, [selectedUser, selectedChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Отправка сообщения
  const sendMessage = async () => {
    if (!token) {
      setError('Authentication required');
      return;
    }

    if (!newMessage.trim() && !file) return;

    const formData = new FormData();
    if (newMessage.trim()) formData.append('content', newMessage);
    if (file) formData.append('file', file);

    try {
      const params = new URLSearchParams();
      if (selectedUser) params.append('user', selectedUser.username);
      if (selectedChannel) params.append('channel', selectedChannel.id);

      const response = await fetch(`http://192.1.66.117:8000/chat/send?${params.toString()}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setNewMessage('');
      setFile(null);
      loadMessages();
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
    }
  };

  // Создание канала
  const createChannel = async () => {
    if (!token) {
      setError('Authentication required');
      return;
    }

    if (!newChannelName.trim()) return;

    try {
      const response = await fetch('http://192.1.66.117:8000/chat/channels', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newChannelName,
          members: newChannelMembers,
          is_private: newChannelIsPrivate
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setIsModalOpen(false);
      setNewChannelName('');
      setNewChannelMembers([]);
      loadChannels();
    } catch (err) {
      console.error('Error creating channel:', err);
      setError('Failed to create channel');
    }
  };

  // Переключение выбора участника
  const toggleMemberSelection = (username: string) => {
    setNewChannelMembers(prev => 
      prev.includes(username) 
        ? prev.filter(u => u !== username) 
        : [...prev, username]
    );
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${themeClass}`}>
      {/* Уведомления об ошибках */}
      {error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {error}
        </div>
      )}

      {/* Индикатор загрузки */}
      {isLoading && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          Loading...
        </div>
      )}

      {/* Уведомление о новом сообщении */}
      {showNotification && (
        <div className="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-bounce">
          New message!
        </div>
      )}

      {/* Модальное окно создания канала */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-2xl ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} w-96`}>
            <h2 className="text-lg font-semibold mb-4">Create Channel</h2>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Channel name"
              className={`w-full p-3 mb-4 rounded-xl border focus:outline-none focus:ring-2 ${
                darkMode ? 'bg-gray-700 border-gray-600 focus:ring-blue-500' : 'bg-gray-100 border-gray-300 focus:ring-blue-500'
              }`}
            />
            
            <div className="mb-4">
              <label className="flex items-center mb-2">
                <input
                  type="checkbox"
                  checked={newChannelIsPrivate}
                  onChange={(e) => setNewChannelIsPrivate(e.target.checked)}
                  className="mr-2"
                />
                Private channel
              </label>
            </div>
            
            <h3 className="text-sm font-medium mb-2">Add Members</h3>
            <div className="max-h-40 overflow-y-auto mb-4">
              {contacts.map(user => (
                <div key={user.username} className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    id={`member-${user.username}`}
                    checked={newChannelMembers.includes(user.username)}
                    onChange={() => toggleMemberSelection(user.username)}
                    className="mr-2"
                  />
                  <label htmlFor={`member-${user.username}`}>
                    {user.full_name} ({user.username})
                  </label>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className={`px-4 py-2 rounded-xl ${darkMode ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'}`}
              >
                Cancel
              </button>
              <button
                onClick={createChannel}
                disabled={!newChannelName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-xl text-white"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex h-screen gap-6 p-6">
        {/* Левая панель */}
        <div className="w-72 flex-shrink-0">
          <div className={`bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-5 h-full border ${darkMode ? 'border-gray-700' : 'border-white/30'}`}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(-1)}
                  className={`p-2 rounded-full ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                >
                  ←
                </button>
                <h2 className="text-xl font-bold">Chat</h2>
              </div>
              <button
                onClick={() => setDarkMode(prev => !prev)}
                className={`text-sm px-3 py-1 rounded-full ${darkMode ? 'bg-gray-700 text-yellow-300' : 'bg-gray-200 text-gray-800'}`}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
            </div>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full p-3 rounded-2xl border focus:outline-none focus:ring-2 ${
                  darkMode ? 'bg-gray-800 border-gray-600 focus:ring-blue-500' : 'bg-white border-gray-300 focus:ring-blue-500'
                }`}
              />
            </div>

            <div className="mb-6">
              <h3 className={`text-sm font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Contacts</h3>
              <ul className="space-y-1">
                {contacts.map(c => (
                  <li key={c.username}>
                    <button
                      onClick={() => { setSelectedUser(c); setSelectedChannel(null); }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-3 hover:bg-blue-50 transition ${
                        selectedUser?.username === c.username ? 'bg-blue-100 text-blue-800 font-medium' : darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      <img 
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name)}&background=random`} 
                        alt="avatar" 
                        className="w-8 h-8 rounded-full object-cover" 
                      />
                      {c.full_name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Channels</h3>
                <button onClick={() => setIsModalOpen(true)} className="text-blue-500 hover:text-blue-400">+ Create</button>
              </div>
              <ul className="space-y-1">
                {channels.map(ch => (
                  <li key={ch.id}>
                    <button
                      onClick={() => { setSelectedChannel(ch); setSelectedUser(null); }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-3 hover:bg-blue-50 transition ${
                        selectedChannel?.id === ch.id ? 'bg-blue-100 text-blue-800 font-medium' : darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        darkMode ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                        #
                      </span>
                      {ch.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Область чата */}
        <div className={`flex-1 bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl border ${darkMode ? 'border-gray-700' : 'border-white/30'} flex flex-col overflow-hidden`}>
          {(!selectedUser && !selectedChannel) ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a chat
            </div>
          ) : (
            <>
              <div className={`p-5 border-b ${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-white/30 bg-white/50'}`}>
                <h2 className="text-lg font-semibold">
                  {selectedUser ? selectedUser.full_name : `#${selectedChannel?.name}`}
                  {selectedChannel && (
                    <span className="text-sm ml-2 text-gray-500">
                      {selectedChannel.members.length} members
                    </span>
                  )}
                </h2>
              </div>

              <div className="flex-1 p-5 overflow-y-auto space-y-4">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-500 mt-10">No messages yet</p>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.system ? 'justify-center' : ''}`}>
                      {msg.system ? (
                        <p className="text-sm text-gray-500 italic">{msg.content}</p>
                      ) : (
                        <>
                          <img 
                            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(msg.sender_full_name)}&background=random`} 
                            alt="avatar" 
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0" 
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span className="font-medium">{msg.sender_full_name}</span>
                              <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                              {msg.is_private && <span className="text-blue-500">(private)</span>}
                            </div>
                            <p className={`mt-1 rounded-2xl px-4 py-2 inline-block max-w-xs break-words ${
                              darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'
                            }`}>
                              {msg.content}
                            </p>
                            {msg.file_url && (
                              <a 
                                href={msg.file_url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="block mt-2 text-blue-600 hover:underline text-sm"
                              >
                                📎 {msg.file_url.split('/').pop()}
                              </a>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className={`p-5 bg-white/50 border-t ${darkMode ? 'border-gray-700' : 'border-white/30'}`}>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className={`flex-1 p-3 rounded-2xl focus:outline-none focus:ring-2 transition ${
                      darkMode ? 'bg-gray-800 border-gray-600 focus:ring-blue-500' : 'bg-white border border-white/50 focus:ring-blue-500'
                    }`}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <input 
                    type="file" 
                    onChange={(e) => setFile(e.target.files?.[0] || null)} 
                    className="hidden" 
                    id="file-upload" 
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                      darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                    }`}>
                      📎
                    </div>
                  </label>
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() && !file}
                    className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-2xl flex items-center justify-center text-white transition"
                  >
                    ✉️
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};