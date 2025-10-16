import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Import Quill styles

interface FAQItem {
  id: number;
  question: string;
  content_html?: string;
  category?: string;
  department?: string | null;
  is_general?: boolean;
  created_at: string;
  updated_at: string;
  views_count: number;
  helpful_count: number;
  not_helpful_count: number;
  user_feedback?: 'helpful' | 'not_helpful' | null;
}

interface FAQCategory {
  name: string;
  count: number;
}

interface FAQStats {
  total_faqs: number;
  total_views: number;
  total_helpful: number;
  total_not_helpful: number;
  top_categories: { name: string; count: number; views: number }[];
  recent_activity: { id: number; question: string; updated_at: string }[];
}

interface UserInfo {
  username: string;
  full_name: string;
  email: string;
  department?: string;
  isAdmin: boolean;
}

const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['link', 'image'],
    [{ 'align': [] }],
    [{ 'font': [] }],
    [{ 'size': ['small', false, 'large', 'huge'] }],
    ['clean']
  ]
};

const quillFormats = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'list', 'bullet',
  'link', 'image',
  'align',
  'font',
  'size'
];

const FAQ: React.FC = () => {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [categories, setCategories] = useState<FAQCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [stats, setStats] = useState<FAQStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [allDepartments, setAllDepartments] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFaq, setNewFaq] = useState({
    question: '',
    content_html: '',
    category: '',
    department: '',
    is_general: false,
  });
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.1.66.117:8000';

  useEffect(() => {
    const handleStorageChange = () => {
      const currentTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
      setTheme(currentTheme);
    };

    window.addEventListener('storage', handleStorageChange);
    
    const interval = setInterval(() => {
      const currentTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
      if (currentTheme !== theme) {
        setTheme(currentTheme);
      }
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [theme]);

  useEffect(() => {
    fetchUserInfo();
  }, []);

  useEffect(() => {
    if (userInfo) {
      fetchFAQs();
      if (userInfo.isAdmin) {
        fetchStats();
        fetchAllDepartments();
      }
    }
  }, [userInfo, selectedCategory, selectedDepartment, searchTerm]);

  useEffect(() => {
    if (userInfo?.department && !newFaq.is_general) {
      setNewFaq(prev => ({ ...prev, department: userInfo.department ?? '' }));
    }
  }, [userInfo, newFaq.is_general]);

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
      setError(err instanceof Error ? err.message : 'Не удалось загрузить информацию о пользователе. Пожалуйста, войдите снова.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFAQs = async () => {
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
        ...(selectedDepartment !== 'all' && selectedDepartment !== 'general' && { department: selectedDepartment }),
      });

      const response = await fetch(`${API_BASE_URL}/faq?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения FAQ: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const data = await response.json();
      setFaqs(data.faqs || []);
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Ошибка получения FAQ:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить FAQ');
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
      const response = await fetch(`${API_BASE_URL}/faq/stats-overview`, {
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
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику FAQ');
      setStats(null);
    }
  };

  const fetchAllDepartments = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/faq/all-departments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        mode: 'cors',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения списка отделов: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }
      const data = await response.json();
      setAllDepartments(data.departments || []);
    } catch (err) {
      console.error('Ошибка получения списка всех отделов:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список отделов');
      setAllDepartments([]);
    }
  };

  const handleFeedback = async (faqId: number, helpful: boolean) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/faq/${faqId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ helpful }),
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка отправки отзыва: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      await fetchFAQs();
    } catch (err) {
      console.error('Ошибка отправки отзыва:', err);
      setError(err instanceof Error ? err.message : 'Не удалось отправить отзыв');
    }
  };

  const toggleItem = async (id: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Токен аутентификации не найден');
        }
        const response = await fetch(`${API_BASE_URL}/faq/${id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          mode: 'cors',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Ошибка обновления просмотров: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
        }

        const updatedFaq = await response.json();
        setFaqs(prev => prev.map(faq => (faq.id === id ? updatedFaq : faq)));
      } catch (err) {
        console.error('Ошибка обновления просмотров:', err);
        setError(err instanceof Error ? err.message : 'Не удалось обновить просмотры');
      }
    }
    setExpandedItems(newExpanded);
  };

  const handleCreateFAQ = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      
      const createData = {
        question: newFaq.question,
        content_html: newFaq.content_html,
        category: newFaq.category || null,
        department: newFaq.is_general ? null : newFaq.department || userInfo?.department || null,
        is_general: newFaq.is_general,
      };

      const response = await fetch(`${API_BASE_URL}/faq`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(createData),
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка создания FAQ: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      setNewFaq({ 
        question: '', 
        content_html: '', 
        category: '', 
        department: userInfo?.department || '', 
        is_general: false 
      });
      setShowCreateForm(false);
      fetchFAQs();
    } catch (err) {
      console.error('Ошибка создания FAQ:', err);
      setError(err instanceof Error ? err.message : 'Не удалось создать FAQ');
    }
  };

  const startEdit = (faq: FAQItem) => {
    setEditingFaq(faq);
    setShowEditForm(true);
  };

  const handleEditFAQ = async () => {
    if (!editingFaq) return;

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      
      const updateData = {
        question: editingFaq.question,
        content_html: editingFaq.content_html,
        category: editingFaq.category || null,
        department: editingFaq.is_general ? null : editingFaq.department || userInfo?.department || null,
        is_general: editingFaq.is_general,
      };

      const response = await fetch(`${API_BASE_URL}/faq/${editingFaq.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(updateData),
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка обновления FAQ: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      setEditingFaq(null);
      setShowEditForm(false);
      fetchFAQs();
    } catch (err) {
      console.error('Ошибка обновления FAQ:', err);
      setError(err instanceof Error ? err.message : 'Не удалось обновить FAQ');
    }
  };

  const handleDeleteFAQ = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/faq/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка удаления FAQ: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      setDeleteConfirm(null);
      fetchFAQs();
    } catch (err) {
      console.error('Ошибка удаления FAQ:', err);
      setError(err instanceof Error ? err.message : 'Не удалось удалить FAQ');
    }
  };

  const filteredFaqs = useMemo(() => {
    if (!userInfo || userInfo.isAdmin) {
      return faqs;
    }
    return faqs.filter(faq => 
      faq.is_general || faq.department === userInfo.department
    );
  }, [faqs, userInfo]);

  const getAvailableDepartments = () => {
    return allDepartments;
  };

  // Стили для стеклянного дизайна
  const glassClasses = {
    background: theme === 'dark' 
      ? 'bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900' 
      : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100',
    card: theme === 'dark' 
      ? 'bg-black/20 backdrop-blur-lg border border-white/10 shadow-2xl text-white' 
      : 'bg-white/70 backdrop-blur-lg border border-white/20 shadow-2xl text-gray-900',
    overlay: theme === 'dark' 
      ? 'bg-black/30 backdrop-blur-md' 
      : 'bg-white/50 backdrop-blur-md',
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-700',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-600',
    },
    button: {
      primary: theme === 'dark' 
        ? 'bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-white backdrop-blur-sm' 
        : 'bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-700 backdrop-blur-sm',
      secondary: theme === 'dark' 
        ? 'bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400/30 text-white backdrop-blur-sm' 
        : 'bg-gray-300/50 hover:bg-gray-300/70 border border-gray-400/30 text-gray-700 backdrop-blur-sm',
      danger: theme === 'dark' 
        ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-white backdrop-blur-sm' 
        : 'bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-700 backdrop-blur-sm',
      success: theme === 'dark'
        ? 'bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 text-white backdrop-blur-sm'
        : 'bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 text-green-700 backdrop-blur-sm',
    },
    input: theme === 'dark' 
      ? 'bg-black/30 border-white/20 text-white placeholder-gray-400 backdrop-blur-sm' 
      : 'bg-white/50 border-gray-300/50 text-gray-800 placeholder-gray-500 backdrop-blur-sm',
    badge: {
      category: theme === 'dark' 
        ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30' 
        : 'bg-blue-100/70 text-blue-800 border border-blue-200/50',
      department: theme === 'dark' 
        ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30' 
        : 'bg-purple-100/70 text-purple-800 border border-purple-200/50',
      general: theme === 'dark' 
        ? 'bg-green-500/20 text-green-300 border border-green-400/30' 
        : 'bg-green-100/70 text-green-800 border border-green-200/50',
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${glassClasses.background} flex items-center justify-center`}>
        <div className={`rounded-2xl p-8 ${glassClasses.card}`}>
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <span className={`ml-3 text-lg font-medium ${glassClasses.text.secondary} mt-4 block text-center`}>
            Загрузка FAQ...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${glassClasses.background} flex items-center justify-center`}>
        <div className={`rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 ${glassClasses.card}`}>
          <div className="text-6xl mb-4 text-center">⚠️</div>
          <h3 className="font-bold text-xl mb-4 text-center">Ошибка загрузки</h3>
          <p className={`mb-6 text-center ${glassClasses.text.secondary}`}>{error}</p>
          <button
            onClick={() => {
              setError('');
              fetchUserInfo();
            }}
            className={`w-full px-6 py-3 rounded-xl transition-all font-medium ${glassClasses.button.primary} hover:scale-105 transform duration-200`}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${glassClasses.background} py-8`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Кнопка Назад */}
        <div className="mb-8">
          <Link
            to="/dashboard"
            className={`inline-flex items-center gap-3 px-6 py-3 rounded-xl transition-all ${glassClasses.button.secondary} hover:scale-105 transform duration-200 backdrop-blur-sm`}
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Вернуться на главную
          </Link>
        </div>

        {/* Заголовок и кнопки */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div className={`rounded-2xl p-6 ${glassClasses.card} backdrop-blur-lg`}>
            <h1 className={`text-4xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent`}>
              Часто задаваемые вопросы
            </h1>
            <p className={`text-lg ${glassClasses.text.secondary}`}>Найдите ответы на популярные вопросы</p>
            {userInfo && (
              <div className="mt-4 space-y-2">
                <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'}`}>
                  👤 Пользователь: <span className="font-semibold">{userInfo.full_name}</span>
                </p>
                {userInfo.department && (
                  <p className={`text-sm ${theme === 'dark' ? 'text-purple-300' : 'text-purple-600'}`}>
                    🏢 Ваш отдел: <span className="font-semibold">{userInfo.department}</span>
                  </p>
                )}
              </div>
            )}
          </div>
          
          {userInfo?.isAdmin && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowStats(!showStats)}
                className={`px-6 py-3 rounded-xl transition-all flex items-center gap-3 ${glassClasses.button.primary} hover:scale-105 transform duration-200 backdrop-blur-sm`}
              >
                {showStats ? '📊 Скрыть статистику' : '📊 Показать статистику'}
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className={`px-6 py-3 rounded-xl transition-all flex items-center gap-3 ${glassClasses.button.success} hover:scale-105 transform duration-200 backdrop-blur-sm`}
              >
                ➕ Добавить FAQ
              </button>
            </div>
          )}
        </div>

        {/* Статистика */}
        {showStats && stats && userInfo?.isAdmin && (
          <div className={`rounded-2xl p-6 mb-8 ${glassClasses.card} backdrop-blur-lg`}>
            <h2 className={`text-2xl font-bold mb-6 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent`}>
              📈 Статистика FAQ
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className={`p-5 rounded-xl border ${glassClasses.overlay} backdrop-blur-sm text-center transition-all hover:scale-105`}>
                <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'}`}>
                  {stats.total_faqs}
                </div>
                <div className={glassClasses.text.secondary}>Всего вопросов</div>
              </div>
              <div className={`p-5 rounded-xl border ${glassClasses.overlay} backdrop-blur-sm text-center transition-all hover:scale-105`}>
                <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-green-300' : 'text-green-600'}`}>
                  {stats.total_views}
                </div>
                <div className={glassClasses.text.secondary}>Просмотры</div>
              </div>
              <div className={`p-5 rounded-xl border ${glassClasses.overlay} backdrop-blur-sm text-center transition-all hover:scale-105`}>
                <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-purple-300' : 'text-purple-600'}`}>
                  {stats.total_helpful}
                </div>
                <div className={glassClasses.text.secondary}>Полезные оценки</div>
              </div>
              <div className={`p-5 rounded-xl border ${glassClasses.overlay} backdrop-blur-sm text-center transition-all hover:scale-105`}>
                <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`}>
                  {stats.total_not_helpful}
                </div>
                <div className={glassClasses.text.secondary}>Неполезные оценки</div>
              </div>
            </div>
          </div>
        )}

        {/* Форма создания */}
        {showCreateForm && userInfo?.isAdmin && (
          <div className={`rounded-2xl p-6 mb-8 ${glassClasses.card} backdrop-blur-lg`}>
            <h3 className={`text-xl font-bold mb-6 ${glassClasses.text.primary}`}>Создать новый FAQ</h3>
            <div className="space-y-5">
              <input
                type="text"
                placeholder="Вопрос *"
                value={newFaq.question}
                onChange={e => setNewFaq({ ...newFaq, question: e.target.value })}
                className={`w-full px-5 py-4 border-2 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all ${glassClasses.input} backdrop-blur-sm`}
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Категория (необязательно)"
                  value={newFaq.category}
                  onChange={e => setNewFaq({ ...newFaq, category: e.target.value })}
                  className={`w-full px-5 py-4 border-2 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all ${glassClasses.input} backdrop-blur-sm`}
                />

                <select
                  value={newFaq.is_general ? '' : newFaq.department}
                  onChange={e => setNewFaq({ ...newFaq, department: e.target.value })}
                  disabled={newFaq.is_general}
                  className={`w-full px-5 py-4 border-2 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all ${
                    glassClasses.input
                  } ${newFaq.is_general ? 'opacity-50 cursor-not-allowed' : ''} backdrop-blur-sm`}
                >
                  <option value="">Выберите отдел (необязательно)</option>
                  {getAvailableDepartments().map(dept => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_general"
                  checked={newFaq.is_general}
                  onChange={e =>
                    setNewFaq({
                      ...newFaq,
                      is_general: e.target.checked,
                      department: e.target.checked ? '' : userInfo?.department || '',
                    })
                  }
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500/50"
                />
                <label htmlFor="is_general" className={glassClasses.text.secondary}>
                  Общий FAQ (видимый для всех отделов)
                </label>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-3 ${glassClasses.text.secondary}`}>
                  Ответ *
                </label>
                <ReactQuill
                  theme="snow"
                  value={newFaq.content_html}
                  onChange={(content) => setNewFaq({ ...newFaq, content_html: content })}
                  modules={quillModules}
                  formats={quillFormats}
                  className={`${theme === 'dark' ? 'ql-dark' : ''}`}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleCreateFAQ}
                  disabled={!newFaq.question || !newFaq.content_html}
                  className={`px-8 py-3 rounded-xl transition-all font-medium ${
                    !newFaq.question || !newFaq.content_html
                      ? 'bg-gray-400 cursor-not-allowed'
                      : `${glassClasses.button.primary} hover:scale-105`
                  }`}
                >
                  Создать
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className={`px-8 py-3 rounded-xl transition-all font-medium ${glassClasses.button.secondary} hover:scale-105`}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Форма редактирования */}
        {showEditForm && editingFaq && userInfo?.isAdmin && (
          <div className={`rounded-2xl p-6 mb-8 ${glassClasses.card} backdrop-blur-lg`}>
            <h3 className={`text-2xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent`}>
              ✏️ Редактировать FAQ
            </h3>
            <div className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${glassClasses.text.secondary}`}>
                  Вопрос *
                </label>
                <input
                  type="text"
                  placeholder="Введите вопрос"
                  value={editingFaq.question}
                  onChange={e => setEditingFaq({ ...editingFaq, question: e.target.value })}
                  className={`w-full px-5 py-4 border-2 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all ${glassClasses.input} backdrop-blur-sm text-lg`}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${glassClasses.text.secondary}`}>
                    Категория
                  </label>
                  <input
                    type="text"
                    placeholder="Категория (необязательно)"
                    value={editingFaq.category || ''}
                    onChange={e => setEditingFaq({ ...editingFaq, category: e.target.value })}
                    className={`w-full px-5 py-4 border-2 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all ${glassClasses.input} backdrop-blur-sm`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${glassClasses.text.secondary}`}>
                    Отдел
                  </label>
                  <select
                    value={editingFaq.is_general ? '' : editingFaq.department || ''}
                    onChange={e => setEditingFaq({ ...editingFaq, department: e.target.value })}
                    disabled={editingFaq.is_general}
                    className={`w-full px-5 py-4 border-2 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all ${
                      glassClasses.input
                    } ${editingFaq.is_general ? 'opacity-50 cursor-not-allowed' : ''} backdrop-blur-sm`}
                  >
                    <option value="">Выберите отдел</option>
                    {getAvailableDepartments().map(dept => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <input
                  type="checkbox"
                  id="edit_is_general"
                  checked={editingFaq.is_general || false}
                  onChange={e =>
                    setEditingFaq({
                      ...editingFaq,
                      is_general: e.target.checked,
                      department: e.target.checked ? '' : userInfo?.department || '',
                    })
                  }
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500/50"
                />
                <label htmlFor="edit_is_general" className={`font-medium ${glassClasses.text.primary}`}>
                  🌐 Общий FAQ (видимый для всех отделов)
                </label>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-3 ${glassClasses.text.secondary}`}>
                  Ответ *
                </label>
                <ReactQuill
                  theme="snow"
                  value={editingFaq.content_html || ''}
                  onChange={(content) => setEditingFaq({ ...editingFaq, content_html: content })}
                  modules={quillModules}
                  formats={quillFormats}
                  className={`${theme === 'dark' ? 'ql-dark' : ''}`}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleEditFAQ}
                  disabled={!editingFaq.question || !editingFaq.content_html}
                  className={`px-8 py-3 rounded-xl transition-all font-medium flex items-center gap-2 ${
                    !editingFaq.question || !editingFaq.content_html
                      ? 'bg-gray-400 cursor-not-allowed'
                      : `${glassClasses.button.success} hover:scale-105`
                  }`}
                >
                  <span>💾</span>
                  Сохранить изменения
                </button>
                <button
                  onClick={() => setShowEditForm(false)}
                  className={`px-8 py-3 rounded-xl transition-all font-medium flex items-center gap-2 ${glassClasses.button.secondary} hover:scale-105`}
                >
                  <span>❌</span>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Поиск и фильтры */}
        <div className={`rounded-2xl p-6 mb-8 ${glassClasses.card} backdrop-blur-lg`}>
          <div className="mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className={`h-6 w-6 ${glassClasses.text.muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Поиск вопросов..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className={`w-full pl-12 pr-5 py-4 border-2 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all ${glassClasses.input} backdrop-blur-sm`}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex-1">
              <h4 className={`text-sm font-medium mb-3 ${glassClasses.text.secondary}`}>Категории</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                    selectedCategory === 'all' 
                      ? `${glassClasses.button.primary} shadow-lg` 
                      : glassClasses.button.secondary
                  } hover:scale-105 backdrop-blur-sm`}
                >
                  Все ({faqs.length})
                </button>

                {categories.map(category => (
                  <button
                    key={category.name}
                    onClick={() => setSelectedCategory(category.name)}
                    className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                      selectedCategory === category.name
                        ? `${glassClasses.button.primary} shadow-lg`
                        : glassClasses.button.secondary
                    } hover:scale-105 backdrop-blur-sm`}
                  >
                    {category.name} ({category.count})
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <h4 className={`text-sm font-medium mb-3 ${glassClasses.text.secondary}`}>Тип FAQ</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedDepartment('all')}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                    selectedDepartment === 'all'
                      ? `${glassClasses.button.success} shadow-lg`
                      : glassClasses.button.secondary
                  } hover:scale-105 backdrop-blur-sm`}
                >
                  Все
                </button>
                <button
                  onClick={() => setSelectedDepartment('general')}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                    selectedDepartment === 'general'
                      ? `${glassClasses.button.success} shadow-lg`
                      : glassClasses.button.secondary
                  } hover:scale-105 backdrop-blur-sm`}
                >
                  Общие
                </button>
                {userInfo?.department && (
                  <button
                    onClick={() => setSelectedDepartment(userInfo.department ?? '')}
                    className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                      selectedDepartment === userInfo.department
                        ? `${glassClasses.button.success} shadow-lg`
                        : glassClasses.button.secondary
                    } hover:scale-105 backdrop-blur-sm`}
                  >
                    Мой отдел
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Список FAQ */}
        <div className="space-y-4">
          {filteredFaqs.length === 0 ? (
            <div className={`text-center py-16 rounded-2xl ${glassClasses.card} backdrop-blur-lg`}>
              <div className="text-8xl mb-6">🔍</div>
              <h3 className={`text-2xl font-medium mb-3 ${glassClasses.text.primary}`}>Вопросы не найдены</h3>
              <p className={glassClasses.text.secondary}>Попробуйте изменить параметры поиска или фильтры</p>
            </div>
          ) : (
            filteredFaqs.map(faq => (
              <div 
                key={faq.id} 
                className={`rounded-2xl overflow-hidden transition-all hover:scale-[1.02] ${
                  theme === 'dark' 
                    ? 'bg-black/20 backdrop-blur-lg border border-white/10 hover:border-white/20' 
                    : 'bg-white/70 backdrop-blur-lg border border-white/20 hover:border-gray-300/50'
                } border shadow-2xl`}
              >
                <button
                  onClick={() => toggleItem(faq.id)}
                  className={`w-full px-8 py-6 text-left focus:outline-none transition-colors ${
                    theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className={`text-xl font-semibold pr-6 ${glassClasses.text.primary}`}>{faq.question}</h3>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {faq.category && (
                          <span className={`inline-flex items-center px-4 py-1.5 text-sm font-medium rounded-full ${glassClasses.badge.category} backdrop-blur-sm`}>
                            {faq.category}
                          </span>
                        )}
                        {faq.is_general ? (
                          <span className={`inline-flex items-center px-4 py-1.5 text-sm font-medium rounded-full ${glassClasses.badge.general} backdrop-blur-sm`}>
                            🌐 Общий FAQ
                          </span>
                        ) : (
                          faq.department && (
                            <span className={`inline-flex items-center px-4 py-1.5 text-sm font-medium rounded-full ${glassClasses.badge.department} backdrop-blur-sm`}>
                              🏢 {faq.department}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    <svg
                      className={`w-7 h-7 transition-transform ${expandedItems.has(faq.id) ? 'rotate-180' : ''} ${
                        glassClasses.text.muted
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedItems.has(faq.id) && (
                  <div className={`px-8 py-6 border-t ${
                    theme === 'dark' ? 'border-white/10' : 'border-gray-200/50'
                  }`}>
                    <ReactQuill
                      theme="snow"
                      value={faq.content_html || ''}
                      readOnly={true}
                      modules={{ toolbar: false }} // Отключаем тулбар для просмотра
                      formats={quillFormats}
                      className={`${theme === 'dark' ? 'ql-dark' : ''}`}
                    />
                    
                    <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex gap-4">
                        <button
                          onClick={() => handleFeedback(faq.id, true)}
                          disabled={faq.user_feedback === 'helpful'}
                          className={`flex items-center gap-2 transition-all ${
                            faq.user_feedback === 'helpful'
                              ? 'text-green-500 cursor-default scale-110'
                              : theme === 'dark'
                                ? 'text-green-400 hover:text-green-300 hover:scale-110'
                                : 'text-green-600 hover:text-green-800 hover:scale-110'
                          }`}
                        >
                          <span className="text-lg">👍</span>
                          <span className={faq.user_feedback === 'helpful' ? 'font-semibold' : ''}>
                            Полезно ({faq.helpful_count})
                          </span>
                          {faq.user_feedback === 'helpful' && ' ✓'}
                        </button>
                        <button
                          onClick={() => handleFeedback(faq.id, false)}
                          disabled={faq.user_feedback === 'not_helpful'}
                          className={`flex items-center gap-2 transition-all ${
                            faq.user_feedback === 'not_helpful'
                              ? 'text-red-500 cursor-default scale-110'
                              : theme === 'dark'
                                ? 'text-red-400 hover:text-red-300 hover:scale-110'
                                : 'text-red-600 hover:text-red-800 hover:scale-110'
                          }`}
                        >
                          <span className="text-lg">👎</span>
                          <span className={faq.user_feedback === 'not_helpful' ? 'font-semibold' : ''}>
                            Не полезно ({faq.not_helpful_count})
                          </span>
                          {faq.user_feedback === 'not_helpful' && ' ✓'}
                        </button>
                      </div>
                      {userInfo?.isAdmin && (
                        <div className="flex gap-4">
                          <button
                            onClick={() => startEdit(faq)}
                            className={`flex items-center gap-2 transition-all ${
                              theme === 'dark'
                                ? 'text-blue-400 hover:text-blue-300 hover:scale-110'
                                : 'text-blue-600 hover:text-blue-800 hover:scale-110'
                            }`}
                          >
                            <span className="text-lg">✏️</span>
                            Редактировать
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(faq.id)}
                            className={`flex items-center gap-2 transition-all ${
                              theme === 'dark'
                                ? 'text-red-400 hover:text-red-300 hover:scale-110'
                                : 'text-red-600 hover:text-red-800 hover:scale-110'
                            }`}
                          >
                            <span className="text-lg">🗑️</span>
                            Удалить
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {deleteConfirm === faq.id && (
                  <div className={`px-8 py-6 border-t ${
                    theme === 'dark' ? 'border-red-500/30 bg-red-500/10' : 'border-red-200 bg-red-50/50'
                  }`}>
                    <p className={`mb-4 ${theme === 'dark' ? 'text-red-200' : 'text-red-700'}`}>
                      Вы уверены, что хотите удалить этот FAQ?
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDeleteFAQ(faq.id)}
                        className={`px-6 py-2.5 rounded-xl transition-all ${glassClasses.button.danger} hover:scale-105`}
                      >
                        Удалить
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className={`px-6 py-2.5 rounded-xl transition-all ${glassClasses.button.secondary} hover:scale-105`}
                      >
                        Отмена
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

export default FAQ;