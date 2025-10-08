import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../hooks/ThemeContext';

interface SoftwareItem {
  id: string;
  title: string;
  description: string;
  filePath: string;
  category?: string;
  created_at: string;
  downloads_count: number;
}

interface SoftwareCategory {
  name: string;
  count: number;
}

interface SoftwareStats {
  total_software: number;
  total_downloads: number;
  top_categories: { name: string; count: number; downloads: number }[];
}

interface UserInfo {
  username: string;
  full_name: string;
  email: string;
  department?: string;
  isAdmin: boolean;
}

const Software: React.FC = () => {
  const { theme } = useTheme();
  const [softwareList, setSoftwareList] = useState<SoftwareItem[]>([]);
  const [categories, setCategories] = useState<SoftwareCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [stats, setStats] = useState<SoftwareStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newSoftware, setNewSoftware] = useState({
    title: '',
    description: '',
    category: '',
    file: null as File | null,
  });
  const [ws, setWs] = useState<WebSocket | null>(null);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.1.66.117:8000';

  useEffect(() => {
    fetchUserInfo();
  }, []);

  useEffect(() => {
    if (userInfo) {
      fetchSoftware();
      if (userInfo.isAdmin) {
        fetchStats();
      }
      setupWebSocket();
    }
  }, [userInfo, selectedCategory, searchTerm]);

  const fetchUserInfo = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        mode: 'cors',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения данных пользователя: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }
      const userData = await response.json();
      setUserInfo(userData);
    } catch (err) {
      console.error('Ошибка получения данных пользователя:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить информацию о пользователе.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSoftware = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const params = new URLSearchParams({
        ...(selectedCategory !== 'all' && { category: selectedCategory }),
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await fetch(`${API_BASE_URL}/software?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения ПО: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const data = await response.json();
      setSoftwareList(data.software || []);
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Ошибка получения ПО:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список ПО');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/software/stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения статистики: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const statsData = await response.json();
      setStats(statsData);
    } catch (err) {
      console.error('Ошибка получения статистики:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику ПО');
      setStats(null);
    }
  };

  const setupWebSocket = () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const wsUrl = `ws://${window.location.hostname}:8000/software/ws?token=${encodeURIComponent(token)}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket for software connected');
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'software_updated') {
          fetchSoftware();
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket for software disconnected');
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  };

  const handleUploadSoftware = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const formData = new FormData();
      formData.append('title', newSoftware.title);
      formData.append('description', newSoftware.description);
      formData.append('category', newSoftware.category || '');
      if (newSoftware.file) {
        formData.append('file', newSoftware.file);
      }

      const response = await fetch(`${API_BASE_URL}/software/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка загрузки ПО: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      setNewSoftware({ title: '', description: '', category: '', file: null });
      setShowUploadForm(false);
      fetchSoftware();
    } catch (err) {
      console.error('Ошибка загрузки ПО:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить ПО');
    }
  };

  const handleDownload = async (id: string, filePath: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/software/${id}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка скачивания: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'software';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Обновляем статистику загрузок
      fetchSoftware();
    } catch (err) {
      console.error('Ошибка скачивания:', err);
      setError(err instanceof Error ? err.message : 'Не удалось скачать ПО');
    }
  };

  const toggleItem = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const filteredSoftware = useMemo(() => {
    return softwareList;
  }, [softwareList]);

  const themeClasses = {
    background: theme === 'dark' 
      ? 'bg-gradient-to-br from-gray-900 to-gray-950' 
      : 'bg-gradient-to-br from-blue-50 to-indigo-100',
    card: theme === 'dark' 
      ? 'bg-gray-800 border-gray-700 text-white' 
      : 'bg-white border-gray-200 text-gray-900',
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-500',
    },
    button: {
      primary: theme === 'dark' 
        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
        : 'bg-blue-600 hover:bg-blue-700 text-white',
      secondary: theme === 'dark' 
        ? 'bg-gray-700 hover:bg-gray-600 text-white' 
        : 'bg-gray-200 hover:bg-gray-300 text-gray-700',
    },
    input: theme === 'dark' 
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
      : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500',
    badge: {
      category: theme === 'dark' 
        ? 'bg-blue-900 text-blue-200' 
        : 'bg-blue-100 text-blue-800',
    },
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${themeClasses.background} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <span className={`ml-3 text-lg font-medium ${themeClasses.text.secondary}`}>Загрузка ПО...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${themeClasses.background} flex items-center justify-center`}>
        <div className={`rounded-xl shadow-lg p-6 max-w-md w-full mx-4 ${themeClasses.card}`}>
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h3 className="font-bold text-xl mb-2">Ошибка загрузки</h3>
          <p className={`mb-4 ${themeClasses.text.secondary}`}>{error}</p>
          <button
            onClick={() => {
              setError('');
              fetchUserInfo();
            }}
            className={`w-full px-4 py-3 rounded-lg transition-colors font-medium ${themeClasses.button.primary}`}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${themeClasses.background} py-8`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Кнопка Назад */}
        <div className="mb-6">
          <Link
            to="/dashboard"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              theme === 'dark' 
                ? 'bg-gray-800 hover:bg-gray-700 text-white' 
                : 'bg-white hover:bg-gray-100 text-gray-700'
            } shadow-lg border ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
            }`}
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Назад на Dashboard
          </Link>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div>
            <h1 className={`text-3xl font-bold mb-2 ${themeClasses.text.primary}`}>Программное обеспечение</h1>
            <p className={themeClasses.text.secondary}>Скачивайте корпоративное ПО</p>
            {userInfo && (
              <div className="mt-2 space-y-1">
                <p className={`text-sm ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
                  Пользователь: <span className="font-medium">{userInfo.full_name}</span>
                </p>
                {userInfo.department && (
                  <p className={`text-sm ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                    Ваш отдел: <span className="font-medium">{userInfo.department}</span>
                  </p>
                )}
              </div>
            )}
          </div>
          {userInfo?.isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowStats(!showStats)}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${themeClasses.button.primary}`}
              >
                {showStats ? '📊 Скрыть статистику' : '📊 Показать статистику'}
              </button>
              <button
                onClick={() => setShowUploadForm(true)}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  theme === 'dark' ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'
                } text-white`}
              >
                ➕ Добавить ПО
              </button>
            </div>
          )}
        </div>

        {showStats && stats && userInfo?.isAdmin && (
          <div className={`rounded-xl shadow-lg p-6 mb-6 ${themeClasses.card}`}>
            <h2 className={`text-xl font-bold mb-4 ${themeClasses.text.primary}`}>📈 Статистика ПО</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className={`p-4 rounded-lg border ${
                theme === 'dark' ? 'bg-blue-900 border-blue-800' : 'bg-blue-50 border-blue-100'
              }`}>
                <div className={`text-2xl font-bold ${
                  theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                }`}>{stats.total_software}</div>
                <div className={themeClasses.text.secondary}>Всего программ</div>
              </div>
              <div className={`p-4 rounded-lg border ${
                theme === 'dark' ? 'bg-green-900 border-green-800' : 'bg-green-50 border-green-100'
              }`}>
                <div className={`text-2xl font-bold ${
                  theme === 'dark' ? 'text-green-300' : 'text-green-600'
                }`}>{stats.total_downloads}</div>
                <div className={themeClasses.text.secondary}>Скачивания</div>
              </div>
            </div>
          </div>
        )}

        {showUploadForm && userInfo?.isAdmin && (
          <div className={`rounded-xl shadow-lg p-6 mb-6 ${themeClasses.card}`}>
            <h3 className={`text-lg font-bold mb-4 ${themeClasses.text.primary}`}>Загрузить новое ПО</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Название *"
                value={newSoftware.title}
                onChange={e => setNewSoftware({ ...newSoftware, title: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${themeClasses.input}`}
                required
              />
              <textarea
                placeholder="Описание *"
                value={newSoftware.description}
                onChange={e => setNewSoftware({ ...newSoftware, description: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${themeClasses.input}`}
                rows={4}
                required
              />
              <input
                type="text"
                placeholder="Категория (необязательно)"
                value={newSoftware.category}
                onChange={e => setNewSoftware({ ...newSoftware, category: e.target.value })}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${themeClasses.input}`}
              />
              <input
                type="file"
                onChange={e => setNewSoftware({ ...newSoftware, file: e.target.files ? e.target.files[0] : null })}
                className={`w-full px-4 py-3 border rounded-lg ${themeClasses.input}`}
                required
              />
              <div className="flex space-x-2 pt-4">
                <button
                  onClick={handleUploadSoftware}
                  disabled={!newSoftware.title || !newSoftware.description || !newSoftware.file}
                  className={`px-6 py-2 rounded-lg transition-colors font-medium ${
                    !newSoftware.title || !newSoftware.description || !newSoftware.file
                      ? 'bg-gray-400 cursor-not-allowed'
                      : themeClasses.button.primary
                  }`}
                >
                  Загрузить
                </button>
                <button
                  onClick={() => setShowUploadForm(false)}
                  className={`px-6 py-2 rounded-lg transition-colors font-medium ${themeClasses.button.secondary}`}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`rounded-xl shadow-lg p-6 mb-6 ${themeClasses.card}`}>
          <div className="mb-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className={`h-5 w-5 ${themeClasses.text.muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Поиск программ..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${themeClasses.input}`}
              />
            </div>
          </div>

          <div className="flex-1">
            <h4 className={`text-sm font-medium mb-2 ${themeClasses.text.secondary}`}>Категории</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === 'all' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : theme === 'dark'
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Все ({softwareList.length})
              </button>
              {categories.map(category => (
                <button
                  key={category.name}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === category.name
                      ? 'bg-blue-600 text-white shadow-md'
                      : theme === 'dark'
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category.name} ({category.count})
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {filteredSoftware.length === 0 ? (
            <div className={`text-center py-12 rounded-xl shadow-lg ${themeClasses.card}`}>
              <div className="text-6xl mb-4">🔍</div>
              <h3 className={`text-xl font-medium mb-2 ${themeClasses.text.primary}`}>Программы не найдены</h3>
              <p className={themeClasses.text.secondary}>Попробуйте изменить параметры поиска или фильтры</p>
            </div>
          ) : (
            filteredSoftware.map(software => (
              <div 
                key={software.id} 
                className={`rounded-xl shadow-lg overflow-hidden transition-all hover:shadow-xl ${
                  theme === 'dark' 
                    ? 'bg-gray-800 border-gray-700 hover:border-gray-600' 
                    : 'bg-white border-gray-200 hover:border-gray-300'
                } border`}
              >
                <button
                  onClick={() => toggleItem(software.id)}
                  className={`w-full px-6 py-5 text-left focus:outline-none transition-colors ${
                    theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ComputerDesktopIcon className={`h-6 w-6 ${theme === 'dark' ? 'text-violet-400' : 'text-violet-600'}`} />
                      <div>
                        <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>{software.title}</h3>
                        {software.category && (
                          <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full ${themeClasses.badge.category}`}>
                            {software.category}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg
                      className={`w-6 h-6 transition-transform ${expandedItems.has(software.id) ? 'rotate-180' : ''} ${
                        themeClasses.text.muted
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedItems.has(software.id) && (
                  <div className={`px-6 py-4 border-t ${
                    theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                  }`}>
                    <p className={themeClasses.text.secondary}>{software.description}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <div>
                        <p className={`text-sm ${themeClasses.text.muted}`}>
                          Добавлено: {new Date(software.created_at).toLocaleDateString('ru-RU')}
                        </p>
                        <p className={`text-sm ${themeClasses.text.muted}`}>
                          Скачиваний: {software.downloads_count}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDownload(software.id, software.filePath)}
                        className={`px-4 py-2 rounded-lg transition-colors font-medium ${themeClasses.button.primary}`}
                      >
                        Скачать
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Software;