import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../AuthContext'; 

interface Channel {
  id: string;
  display_name: string;
  type: string;
}

interface Post {
  id: string;
  message: string;
  user_id: string;
  create_at: number;
}

const Chat: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState('');
  const [mattermostToken, setMattermostToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth(); // Получаем токен из контекста

  // Получение Mattermost-токена
  useEffect(() => {
    const fetchMattermostToken = async () => {
      try {
        const response = await axios.post('http://192.1.66.117:9000/auth/mattermost-token', {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMattermostToken(response.data.mattermost_token);
      } catch (err) {
        setError('Не удалось получить токен Mattermost. Используется запасной токен.');
        console.error(err);
        setMattermostToken('rihpjwkpyjndzm8qozpfwygf4r'); // Запасной токен для тестирования
      }
    };
    if (token) fetchMattermostToken();
  }, [token]);

  // Настройка axios с Mattermost-токеном
  const api = axios.create({
    baseURL: 'http://192.1.66.117:8065/api/v4',
    headers: {
      Authorization: `Bearer ${mattermostToken || 'rihpjwkpyjndzm8qozpfwygf4r'}`, // Используем запасной токен, если нет Mattermost-токена
    },
  });

  // Получение списка каналов
  useEffect(() => {
    if (mattermostToken || true) { // Продолжаем, даже если токен еще не получен
      const fetchChannels = async () => {
        try {
          const response = await api.get('/users/me/channels');
          setChannels(response.data);
          if (response.data.length > 0) {
            setSelectedChannel(response.data[0].id);
          }
        } catch (err) {
          setError('Не удалось загрузить каналы. Проверьте права пользователя.');
          console.error(err);
        }
      };
      fetchChannels();
    }
  }, [mattermostToken]);

  // Получение сообщений для выбранного канала
  useEffect(() => {
    if (selectedChannel && (mattermostToken || true)) {
      const fetchPosts = async () => {
        try {
          const response = await api.get(`/channels/${selectedChannel}/posts`);
          setPosts(response.data.posts ? Object.values(response.data.posts) : []);
        } catch (err) {
          setError('Не удалось загрузить сообщения');
          console.error(err);
        }
      };
      fetchPosts();
    }
  }, [selectedChannel, mattermostToken]);

  // Отправка сообщения
  const sendMessage = async () => {
    if (!message.trim() || !selectedChannel) return;
    try {
      await api.post('/posts', {
        channel_id: selectedChannel,
        message,
      });
      setMessage('');
      const response = await api.get(`/channels/${selectedChannel}/posts`);
      setPosts(response.data.posts ? Object.values(response.data.posts) : []);
    } catch (err) {
      setError('Не удалось отправить сообщение');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Корпоративный чат</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <div className="flex">
        {/* Список каналов */}
        <div className="w-1/4 bg-white p-4 rounded-lg shadow-md mr-4">
          <h2 className="text-lg font-semibold mb-2">Каналы</h2>
          <ul>
            {channels.map((channel) => (
              <li
                key={channel.id}
                className={`p-2 cursor-pointer rounded ${
                  selectedChannel === channel.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                }`}
                onClick={() => setSelectedChannel(channel.id)}
              >
                {channel.display_name}
              </li>
            ))}
          </ul>
        </div>
        {/* Сообщения и ввод */}
        <div className="w-3/4 bg-white p-4 rounded-lg shadow-md">
          <div className="h-96 overflow-y-auto mb-4">
            {posts
              .sort((a, b) => a.create_at - b.create_at)
              .map((post) => (
                <div key={post.id} className="mb-2">
                  <p className="text-gray-600 text-sm">
                    {new Date(post.create_at).toLocaleString()} (ID: {post.user_id})
                  </p>
                  <p>{post.message}</p>
                </div>
              ))}
          </div>
          <div className="flex">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1 p-2 border rounded-l"
              placeholder="Введите сообщение..."
            />
            <button
              onClick={sendMessage}
              className="p-2 bg-blue-600 text-white rounded-r hover:bg-blue-700"
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;