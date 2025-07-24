import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
  username: string;
  full_name: string;
  avatar_url?: string;
  status: 'online' | 'away' | 'offline';
}

interface Channel {
  id: string;
  name: string;
  type: 'public' | 'private';
  image_url?: string;
}

interface Message {
  id: string;
  sender: string;
  sender_full_name: string;
  content: string;
  file_url?: string;
  timestamp: string;
}

export const Chat: React.FC = () => {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
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
  const [newChannelImage, setNewChannelImage] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const themeClass = darkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-50 text-gray-900';

  // Save theme preference
  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // WebSocket
  useEffect(() => {
    if (!selectedUser && !selectedChannel) return;

    const identifier = selectedUser?.username || selectedChannel?.id;
    const ws = new WebSocket(`ws://192.1.66.117:8000/chat/ws/${identifier}?token=${token}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages(prev => [...prev, data]);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 3000);
      } catch (e) {
        console.error('Ошибка парсинга сообщения:', e);
      }
    };

    return () => ws.close();
  }, [selectedUser, selectedChannel, token]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load contacts
  const loadContacts = async () => {
    try {
      const response = await fetch('http://192.1.66.117:8000/chat/search_contacts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.status === 'success') setContacts(data.data);
    } catch (err) {
      console.error('Ошибка загрузки контактов:', err);
    }
  };

  // Load channels
  const loadChannels = async () => {
    try {
      const response = await fetch('http://192.1.66.117:8000/chat/channels', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.status === 'success') setChannels(data.data);
    } catch (err) {
      console.error('Ошибка загрузки каналов:', err);
    }
  };

  // Load messages
  const loadMessages = async () => {
    if (!selectedUser && !selectedChannel) return;

    const url = selectedUser
      ? `http://192.1.66.117:8000/chat/messages?user=${selectedUser.username}`
      : `http://192.1.66.117:8000/chat/messages?channel=${selectedChannel?.id}`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.status === 'success') setMessages(data.data);
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err);
    }
  };

  useEffect(() => {
    loadContacts();
    loadChannels();
  }, []);

  useEffect(() => {
    loadMessages();
  }, [selectedUser, selectedChannel]);

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() && !file) return;

    const formData = new FormData();
    if (newMessage.trim()) formData.append('content', newMessage);
    if (file) formData.append('file', file);

    const url = selectedUser
      ? `http://192.1.66.117:8000/chat/send?user=${selectedUser.username}`
      : `http://192.1.66.117:8000/chat/send?channel=${selectedChannel?.id}`;

    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    setNewMessage('');
    setFile(null);
  };

  // Create channel
  const createChannel = async () => {
    if (!newChannelName.trim()) return;

    const formData = new FormData();
    formData.append('name', newChannelName);
    if (newChannelImage) formData.append('image', newChannelImage);

    try {
      const response = await fetch('http://192.1.66.117:8000/chat/create_channel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.status === 'success') {
        setIsModalOpen(false);
        setNewChannelName('');
        setNewChannelImage(null);
        loadChannels();
      }
    } catch (err) {
      console.error('Ошибка создания канала:', err);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${themeClass}`}>
      {/* Notification */}
      {showNotification && (
        <div className="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-bounce">
          Новое сообщение!
        </div>
      )}

      {/* Channel creation modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-2xl ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} w-96`}>
            <h2 className="text-lg font-semibold mb-4">Создать канал</h2>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Название канала"
              className={`w-full p-3 mb-4 rounded-xl border focus:outline-none focus:ring-2 ${
                darkMode ? 'bg-gray-700 border-gray-600 focus:ring-blue-500 text-white' : 'bg-gray-100 border-gray-300 focus:ring-blue-500'
              }`}
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setNewChannelImage(e.target.files?.[0] || null)}
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className={`px-4 py-2 rounded-xl ${darkMode ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'}`}
              >
                Отмена
              </button>
              <button
                onClick={createChannel}
                disabled={!newChannelName.trim()}
                className="px-4 py-2 bg specifici-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-xl text-white"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex h-screen gap-6 p-6">
        {/* Left panel */}
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
                <h2 className="text-xl font-bold">Чат</h2>
              </div>
              <button
                onClick={() => setDarkMode(prev => !prev)}
                className={`text-sm px-3 py-1 rounded-full ${darkMode ? 'bg-gray-700 text-yellow-300' : 'bg-gray-200 text-gray-800'}`}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Поиск контакта..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full p-3 rounded-2xl border focus:outline-none focus:ring-2 ${
                  darkMode ? 'bg-gray-800 border-gray-600 focus:ring-blue-500 text-white' : 'bg-white border-gray-300 focus:ring-blue-500'
                }`}
              />
            </div>

            {/* Contacts */}
            <div className="mb-6">
              <h3 className={`text-sm font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Личные</h3>
              <ul className="space-y-1">
                {contacts.map(c => (
                  <li key={c.username}>
                    <button
                      onClick={() => { setSelectedUser(c); setSelectedChannel(null); }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-3 hover:bg-blue-50 transition ${
                        selectedUser?.username === c.username ? 'bg-blue-100 text-blue-800 font-medium' : darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      <div className="relative">
                        <img src={c.avatar_url || "https://via.placeholder.com/32"} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${c.status === 'online' ? 'bg-green-500' : c.status === 'away' ? 'bg-yellow-500' : 'bg-gray-500'} ${darkMode ? 'border-gray-900' : 'border-white'}`}></span>
                      </div>
                      {c.full_name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Channels */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Каналы</h3>
                <button onClick={() => setIsModalOpen(true)} className="text-blue-500 hover:text-blue-400">+ Создать</button>
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
                      {ch.image_url ? (
                        <img src={ch.image_url} alt="channel" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <span className="text-blue-600">#</span>
                      )}
                      {ch.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className={`flex-1 bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl border ${darkMode ? 'border-gray-700' : 'border-white/30'} flex flex-col overflow-hidden`}>
          {(!selectedUser && !selectedChannel) ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Выберите чат
            </div>
          ) : (
            <>
              {/* Header */}
              <div className={`p-5 border-b ${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-white/30 bg-white/50'}`}>
                <h2 className="text-lg font-semibold">
                  {selectedUser ? selectedUser.full_name : `#${selectedChannel?.name}`}
                </h2>
              </div>

              {/* Messages */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-500 mt-10">Нет сообщений</p>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className="flex gap-3 animate-fade-in">
                      <img src="https://via.placeholder.com/32" alt="avatar" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="font-medium">{msg.sender_full_name}</span>
                          <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className={`mt-1 bg-white/70 rounded-2xl px-4 py-2 inline-block max-w-xs break-words ${darkMode ? 'bg-gray-800 text-white' : 'text-gray-800'}`}>
                          {msg.content}
                        </p>
                        {msg.file_url && (
                          <a href={`http://192.1.66.117:8000${msg.file_url}`} target="_blank" rel="noopener noreferrer" className="block mt-2 text-blue-600 hover:underline text-sm">
                            📎 {msg.file_url.split('/').pop()}
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className={`p-5 bg-white/50 border-t ${darkMode ? 'border-gray-700' : 'border-white/30'}`}>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Введите сообщение..."
                    className={`flex-1 p-3 rounded-2xl focus:outline-none focus:ring-2 transition ${darkMode ? 'bg-gray-800 border-gray-600 text-white focus:ring-blue-500' : 'bg-white border border-white/50 focus:ring-blue-500'}`}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" id="file-upload" />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-2xl flex items-center justify-center text-blue-600">
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