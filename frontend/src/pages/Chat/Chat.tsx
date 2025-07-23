import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

interface Contact {
  id: string;
  username: string;
}

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState('general');
  const [channels, setChannels] = useState<string[]>(['general']);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const navigate = useNavigate();
  const maxReconnectAttempts = 5;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  const token = localStorage.getItem('token');

  const isTokenExpired = (token: string) => {
    try {
      const decoded: { exp: number } = jwtDecode(token);
      return decoded.exp * 1000 < Date.now();
    } catch (e) {
      console.error('❌ Invalid token format:', e);
      return true;
    }
  };

  const connectWebSocket = () => {
    if (!token) {
      console.error('🔐 No token found, redirecting to login');
      setMessages(prev => [...prev, 'Токен отсутствует, перенаправление на страницу входа']);
      navigate('/login');
      return;
    }

    if (isTokenExpired(token)) {
      console.error('🔐 Token expired, redirecting to login');
      localStorage.removeItem('token');
      setMessages(prev => [...prev, 'Токен истек, перенаправление на страницу входа']);
      navigate('/login');
      return;
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('🔄 Max reconnect attempts reached');
      setMessages(prev => [...prev, 'Превышено количество попыток подключения']);
      navigate('/login');
      return;
    }

    if (isConnectingRef.current) {
      console.log('🔌 Already connecting, skipping...');
      return;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log('🔌 Closing previous WebSocket connection');
      wsRef.current.close(1000, 'Closing for reconnect');
      wsRef.current = null;
    }

    isConnectingRef.current = true;
    const wsUrl = `ws://192.1.66.117:8000/chat/ws/${channel}?token=${token}`;
    console.log(`🌐 Connecting to WebSocket: ${wsUrl}`);
    const websocket = new WebSocket(wsUrl);
    wsRef.current = websocket;

    websocket.onopen = () => {
      console.log('✅ Connected to WebSocket');
      setMessages(prev => [...prev, 'Подключено к серверу']);
      setReconnectAttempts(0);
      isConnectingRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    websocket.onmessage = (event) => {
      console.log(`📩 Received message: ${event.data}`);
      setMessages(prev => [...prev, event.data]);
    };

    websocket.onerror = (event) => {
      console.error('❌ WebSocket error:', event);
      setMessages(prev => [...prev, 'Ошибка подключения к WebSocket']);
      isConnectingRef.current = false;
    };

    websocket.onclose = (event) => {
      console.log(`🔌 WebSocket closed: code=${event.code}, reason=${event.reason}`);
      setMessages(prev => [...prev, `Отключено: ${event.reason || 'Неизвестная причина'}`]);
      wsRef.current = null;
      isConnectingRef.current = false;
      if (event.code === 1008) {
        console.error('🔐 Invalid or expired token, redirecting to login');
        localStorage.removeItem('token');
        navigate('/login');
      } else if (!reconnectTimeoutRef.current) {
        console.log(`🔄 Attempting to reconnect (${reconnectAttempts + 1}/${maxReconnectAttempts})`);
        setReconnectAttempts(prev => prev + 1);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      }
    };
  };

  const fetchChannels = async () => {
    console.log('🌐 Fetching channels');
    try {
      const res = await fetch('http://192.1.66.117:8000/chat/channels', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        console.error('🔐 Unauthorized, redirecting to login');
        localStorage.removeItem('token');
        navigate('/login');
        throw new Error('Unauthorized');
      }
      const data = await res.json();
      console.log(`📋 Channels loaded: ${JSON.stringify(data.channels)}`);
      if (Array.isArray(data.channels) && data.channels.length > 0) {
        setChannels(data.channels);
        if (!data.channels.includes(channel)) {
          setChannel(data.channels[0]);
        }
      } else {
        console.warn('⚠️ No channels available, using default');
        setChannels(['general']);
        setChannel('general');
      }
    } catch (err) {
      console.error('⚠️ Failed to load channels:', err);
      setMessages(prev => [...prev, 'Не удалось загрузить каналы']);
      setChannels(['general']);
      setChannel('general');
    }
  };

  const fetchContacts = async () => {
    console.log('🌐 Fetching contacts');
    try {
      const res = await fetch('http://192.1.66.117:8000/contacts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        console.error('🔐 Unauthorized, redirecting to login');
        localStorage.removeItem('token');
        navigate('/login');
        throw new Error('Unauthorized');
      }
      const data = await res.json();
      console.log(`📋 Contacts loaded: ${JSON.stringify(data.contacts)}`);
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('⚠️ Failed to load contacts:', err);
      setMessages(prev => [...prev, 'Не удалось загрузить контакты']);
    }
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) {
      setMessages(prev => [...prev, 'Имя канала не может быть пустым']);
      return;
    }
    try {
      const res = await fetch('http://192.1.66.117:8000/chat/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newChannelName }),
      });
      if (res.status === 401) {
        console.error('🔐 Unauthorized, redirecting to login');
        localStorage.removeItem('token');
        navigate('/login');
        throw new Error('Unauthorized');
      }
      if (res.ok) {
        console.log(`✅ Channel ${newChannelName} created`);
        setMessages(prev => [...prev, `Канал ${newChannelName} создан`]);
        setNewChannelName('');
        await fetchChannels();
      } else {
        const error = await res.json();
        setMessages(prev => [...prev, `Ошибка создания канала: ${error.message || 'Неизвестная ошибка'}`]);
      }
    } catch (err) {
      console.error('⚠️ Failed to create channel:', err);
      setMessages(prev => [...prev, 'Не удалось создать канал']);
    }
  };

  const createPrivateChat = async (contactId: string) => {
    try {
      const res = await fetch('http://192.1.66.117:8000/chat/private', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contact_id: contactId }),
      });
      if (res.status === 401) {
        console.error('🔐 Unauthorized, redirecting to login');
        localStorage.removeItem('token');
        navigate('/login');
        throw new Error('Unauthorized');
      }
      if (res.ok) {
        const data = await res.json();
        console.log(`✅ Private chat created with ${contactId}`);
        setMessages(prev => [...prev, `Личный чат с ${contactId} создан`]);
        setChannel(data.channel);
        await fetchChannels();
      } else {
        const error = await res.json();
        setMessages(prev => [...prev, `Ошибка создания личного чата: ${error.message || 'Неизвестная ошибка'}`]);
      }
    } catch (err) {
      console.error('⚠️ Failed to create private chat:', err);
      setMessages(prev => [...prev, 'Не удалось создать личный чат']);
    }
  };

  useEffect(() => {
    if (!token) {
      console.error('🔐 No token found, redirecting to login');
      setMessages(prev => [...prev, 'Токен отсутствует, перенаправление на страницу входа']);
      navigate('/login');
      return;
    }

    connectWebSocket();
    fetchChannels();
    fetchContacts();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        console.log('🔌 Closing WebSocket on cleanup');
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [token, navigate, channel]);

  const sendMessage = () => {
    if (wsRef.current && message.trim() && wsRef.current.readyState === WebSocket.OPEN) {
      console.log(`📤 Sending message: ${message}`);
      wsRef.current.send(message);
      setMessage('');
    } else {
      console.error('❌ Cannot send message: WebSocket not connected');
      setMessages(prev => [...prev, 'Не удалось отправить сообщение: соединение не активно']);
      if (!isConnectingRef.current && reconnectAttempts < maxReconnectAttempts) {
        connectWebSocket();
      }
    }
  };

  const changeChannel = (newChannel: string) => {
    if (newChannel !== channel) {
      setChannel(newChannel);
      setMessages([]); // Очищаем сообщения при смене канала
      connectWebSocket();
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    if (wsRef.current) {
      wsRef.current.close(1000, 'User logout');
      wsRef.current = null;
    }
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans w-screen">
      <div className="w-1/6 bg-white shadow-lg p-6 overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Чат</h2>
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Создать канал</h3>
          <div className="flex space-x-2">
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Введите имя канала"
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={createChannel}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200"
            >
              Создать
            </button>
          </div>
        </div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Каналы</h3>
        <ul className="mb-6">
          {channels.map(ch => (
            <li
              key={ch}
              onClick={() => changeChannel(ch)}
              className={`cursor-pointer p-2 rounded-lg ${channel === ch ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'} transition duration-200`}
            >
              #{ch}
            </li>
          ))}
        </ul>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Контакты</h3>
        <ul>
          {contacts.map(contact => (
            <li
              key={contact.id}
              onClick={() => createPrivateChat(contact.id)}
              className="cursor-pointer p-2 rounded-lg hover:bg-gray-100 transition duration-200"
            >
              {contact.username}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <button
            onClick={logout}
            className="bg-red-600 text-white w-full py-2 rounded-lg hover:bg-red-700 transition duration-200"
          >
            Выйти
          </button>
        </div>
      </div>

      <div className="w-5/6 flex flex-col p-6">
        <div className="bg-white shadow-lg p-4 rounded-lg flex-1 overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Канал: #{channel}</h3>
          <div className="space-y-2">
            {messages.map((msg, idx) => (
              <div key={idx} className="text-sm text-gray-800 p-2 bg-gray-50 rounded-lg">
                {msg}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex space-x-2">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Введите сообщение..."
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyPress={e => e.key === 'Enter' && sendMessage()}
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200"
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
};