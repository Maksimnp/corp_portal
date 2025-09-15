import React, { useState, useEffect, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

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
  isAdmin: boolean; // Исправлено с isAdmin на isAdmin
}

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

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.1.66.117:8000';

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
      console.log('Received userData from /auth/me:', userData);
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
      console.log('Received FAQs:', data.faqs);
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
      const response = await fetch(`${API_BASE_URL}/faq`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          question: newFaq.question,
          content_html: newFaq.content_html,
          category: newFaq.category || null,
          department: newFaq.is_general ? null : newFaq.department || userInfo?.department || null,
          is_general: newFaq.is_general,
        }),
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка создания FAQ: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      setNewFaq({ question: '', content_html: '', category: '', department: userInfo?.department || '', is_general: false });
      setShowCreateForm(false);
      fetchFAQs();
    } catch (err) {
      console.error('Ошибка создания FAQ:', err);
      setError(err instanceof Error ? err.message : 'Не удалось создать FAQ');
    }
  };

  const handleEditFAQ = async () => {
    if (!editingFaq) return;

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/faq/${editingFaq.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          question: editingFaq.question,
          content_html: editingFaq.content_html,
          category: editingFaq.category || null,
          department: editingFaq.is_general ? null : editingFaq.department || userInfo?.department || null,
          is_general: editingFaq.is_general,
        }),
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

  const startEdit = (faq: FAQItem) => {
    setEditingFaq(faq);
    setShowEditForm(true);
  };

  const filteredFaqs = useMemo(() => {
    if (!userInfo || userInfo.isAdmin) {
      return faqs; // Администраторы видят все FAQ
    }
    return faqs.filter(faq => 
      faq.is_general || faq.department === userInfo.department
    ); // Не-администраторы видят только общие FAQ или FAQ их отдела
  }, [faqs, userInfo]);

  const getAvailableDepartments = () => {
    return allDepartments;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <span className="ml-3 text-gray-600 text-lg font-medium">Загрузка FAQ...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h3 className="font-bold text-xl text-gray-900 mb-2">Ошибка загрузки</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setError('');
              fetchUserInfo();
            }}
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Часто задаваемые вопросы</h1>
            <p className="text-gray-600">Найдите ответы на популярные вопросы</p>
            {userInfo && (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-blue-600">
                  Пользователь: <span className="font-medium">{userInfo.full_name}</span>
                </p>
                {userInfo.department && (
                  <p className="text-sm text-purple-600">
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
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                {showStats ? '📊 Скрыть статистику' : '📊 Показать статистику'}
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                ➕ Добавить FAQ
              </button>
            </div>
          )}
        </div>

        {showStats && stats && userInfo?.isAdmin && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">📈 Статистика FAQ</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <div className="text-2xl font-bold text-blue-600">{stats.total_faqs}</div>
                <div className="text-sm text-gray-600">Всего вопросов</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                <div className="text-2xl font-bold text-green-600">{stats.total_views}</div>
                <div className="text-sm text-gray-600">Просмотры</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                <div className="text-2xl font-bold text-purple-600">{stats.total_helpful}</div>
                <div className="text-sm text-gray-600">Полезные оценки</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                <div className="text-2xl font-bold text-red-600">{stats.total_not_helpful}</div>
                <div className="text-sm text-gray-600">Неполезные оценки</div>
              </div>
            </div>
          </div>
        )}

        {showCreateForm && userInfo?.isAdmin && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Создать новый FAQ</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Вопрос *"
                value={newFaq.question}
                onChange={e => setNewFaq({ ...newFaq, question: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Категория (необязательно)"
                  value={newFaq.category}
                  onChange={e => setNewFaq({ ...newFaq, category: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />

                <select
                  value={newFaq.is_general ? '' : newFaq.department}
                  onChange={e => setNewFaq({ ...newFaq, department: e.target.value })}
                  disabled={newFaq.is_general}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">Выберите отдел (необязательно)</option>
                  {getAvailableDepartments().map(dept => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
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
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_general" className="text-sm text-gray-600">
                  Общий FAQ (видимый для всех отделов)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ответ *</label>
                <ReactQuill
                  theme="snow"
                  value={newFaq.content_html}
                  onChange={val => setNewFaq({ ...newFaq, content_html: val })}
                  modules={{
                    toolbar: [
                      [{ header: [1, 2, 3, 4, 5, 6, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ color: [] }, { background: [] }],
                      [{ list: 'ordered' }, { list: 'bullet' }],
                      ['link', 'image', 'video'],
                      ['clean'],
                    ],
                  }}
                  placeholder="Введите подробный ответ..."
                  className="bg-white rounded-lg border border-gray-300"
                />
              </div>

              <div className="flex space-x-2 pt-4">
                <button
                  onClick={handleCreateFAQ}
                  disabled={!newFaq.question || !newFaq.content_html}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
                >
                  Создать
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {showEditForm && editingFaq && userInfo?.isAdmin && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Редактировать FAQ</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Вопрос *"
                value={editingFaq.question}
                onChange={e => setEditingFaq({ ...editingFaq, question: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Категория (необязательно)"
                  value={editingFaq.category || ''}
                  onChange={e => setEditingFaq({ ...editingFaq, category: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />

                <select
                  value={editingFaq.is_general ? '' : editingFaq.department || ''}
                  onChange={e => setEditingFaq({ ...editingFaq, department: e.target.value })}
                  disabled={editingFaq.is_general}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">Выберите отдел (необязательно)</option>
                  {getAvailableDepartments().map(dept => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
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
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="edit_is_general" className="text-sm text-gray-600">
                  Общий FAQ (видимый для всех отделов)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ответ *</label>
                <ReactQuill
                  theme="snow"
                  value={editingFaq.content_html || ''}
                  onChange={val => setEditingFaq({ ...editingFaq, content_html: val })}
                  modules={{
                    toolbar: [
                      [{ header: [1, 2, 3, 4, 5, 6, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ color: [] }, { background: [] }],
                      [{ list: 'ordered' }, { list: 'bullet' }],
                      ['link', 'image', 'video'],
                      ['clean'],
                    ],
                  }}
                  placeholder="Введите подробный ответ..."
                  className="bg-white rounded-lg border border-gray-300"
                />
              </div>

              <div className="flex space-x-2 pt-4">
                <button
                  onClick={handleEditFAQ}
                  disabled={!editingFaq.question || !editingFaq.content_html}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => setShowEditForm(false)}
                  className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="mb-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Поиск вопросов..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Категории</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Все ({faqs.length})
                </button>

                {categories.map(category => (
                  <button
                    key={category.name}
                    onClick={() => setSelectedCategory(category.name)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedCategory === category.name ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category.name} ({category.count})
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Тип FAQ</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedDepartment('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedDepartment === 'all' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Все
                </button>
                <button
                  onClick={() => setSelectedDepartment('general')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedDepartment === 'general' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Общие
                </button>
                {userInfo?.department && (
                  <button
                    onClick={() => setSelectedDepartment(userInfo.department ?? '')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedDepartment === userInfo.department ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Мой отдел
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl shadow-lg">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Вопросы не найдены</h3>
              <p className="text-gray-600">Попробуйте изменить параметры поиска или фильтры</p>
            </div>
          ) : (
            filteredFaqs.map(faq => (
              <div key={faq.id} className="bg-white rounded-xl shadow-lg overflow-hidden transition-all hover:shadow-xl">
                <button
                  onClick={() => toggleItem(faq.id)}
                  className="w-full px-6 py-5 text-left focus:outline-none hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900 pr-4">{faq.question}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {faq.category && (
                          <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                            {faq.category}
                          </span>
                        )}
                        {faq.is_general ? (
                          <span className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                            🌐 Общий FAQ
                          </span>
                        ) : (
                          faq.department && (
                            <span className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full">
                              🏢 {faq.department}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    <svg
                      className={`w-6 h-6 text-gray-400 transition-transform ${expandedItems.has(faq.id) ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedItems.has(faq.id) && (
                  <div className="px-6 py-4 border-t border-gray-200">
                    <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: faq.content_html || '' }} />
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFeedback(faq.id, true)}
                          className="text-green-600 hover:text-green-800 flex items-center gap-1"
                        >
                          👍 Полезно ({faq.helpful_count})
                        </button>
                        <button
                          onClick={() => handleFeedback(faq.id, false)}
                          className="text-red-600 hover:text-red-800 flex items-center gap-1"
                        >
                          👎 Не полезно ({faq.not_helpful_count})
                        </button>
                      </div>
                      {userInfo?.isAdmin && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(faq)}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            ✏️ Редактировать
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(faq.id)}
                            className="text-red-600 hover:text-red-800 flex items-center gap-1"
                          >
                            🗑️ Удалить
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {deleteConfirm === faq.id && (
                  <div className="px-6 py-4 border-t border-gray-200 bg-red-50">
                    <p className="text-red-700 mb-4">Вы уверены, что хотите удалить этот FAQ?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteFAQ(faq.id)}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Удалить
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
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