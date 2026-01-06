// components/AdminDashboardManager.tsx
import React, { useState, useEffect } from 'react';
import { 
  Cog6ToothIcon,
  UserGroupIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

interface UserDashboard {
  username: string;
  full_name: string;
  department: string;
  has_custom_dashboard: boolean;
  card_count: number;
  last_modified: string;
  modified_by: string;
}

interface AdminDashboardManagerProps {
  theme: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AdminDashboardManager: React.FC<AdminDashboardManagerProps> = ({
  theme,
  isOpen,
  onClose
}) => {
  const [users, setUsers] = useState<UserDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserDashboard | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/admin/dashboard/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch users');
      
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditUserDashboard = (user: UserDashboard) => {
    // Здесь будет логика редактирования дашборда пользователя
    console.log('Edit dashboard for:', user.username);
  };

  const handleResetUserDashboard = async (username: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/admin/dashboard/user/${username}/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to reset dashboard');
      
      await loadUsers(); // Перезагружаем список
    } catch (error) {
      console.error('Error resetting dashboard:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative w-full max-w-6xl rounded-3xl shadow-2xl border backdrop-blur-2xl transform transition-all ${
            theme === 'dark'
              ? 'bg-gray-800/95 border-white/10'
              : 'bg-white/95 border-white/20'
          }`}
        >
          {/* Заголовок */}
          <div className={`p-6 border-b ${
            theme === 'dark' ? 'border-white/10' : 'border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <UserGroupIcon className="h-8 w-8 text-cyan-500" />
                <div>
                  <h2 className="text-2xl font-bold">Управление дашбордами пользователей</h2>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Настройте дашборды для всех пользователей системы
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  theme === 'dark'
                    ? 'hover:bg-white/10 text-gray-400 hover:text-white'
                    : 'hover:bg-black/10 text-gray-500 hover:text-gray-800'
                }`}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Поиск и фильтры */}
          <div className={`p-6 border-b ${
            theme === 'dark' ? 'border-white/10' : 'border-gray-200'
          }`}>
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <MagnifyingGlassIcon
                  className={`absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}
                />
                <input
                  type="text"
                  placeholder="Поиск пользователей..."
                  className={`w-full pl-12 pr-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 backdrop-blur-sm ${
                    theme === 'dark'
                      ? 'bg-white/5 border-white/10 text-white placeholder-gray-400'
                      : 'bg-white/60 border-gray-300 text-gray-800 placeholder-gray-500'
                  }`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                onClick={loadUsers}
                className={`p-3 rounded-2xl transition-all duration-200 border backdrop-blur-sm ${
                  theme === 'dark'
                    ? 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                    : 'bg-black/5 border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-black/10'
                }`}
              >
                <ArrowPathIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Список пользователей */}
          <div className="p-6 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
                <p className={`mt-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Загрузка пользователей...
                </p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className={`text-center py-8 rounded-2xl ${
                theme === 'dark' ? 'bg-white/5' : 'bg-black/5'
              }`}>
                <UserGroupIcon className="h-16 w-16 mx-auto mb-3 text-gray-400" />
                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  {searchQuery ? 'Пользователи не найдены' : 'Нет пользователей для отображения'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredUsers.map((user) => (
                  <div
                    key={user.username}
                    className={`p-4 rounded-2xl border backdrop-blur-sm ${
                      theme === 'dark'
                        ? 'bg-white/5 border-white/10'
                        : 'bg-black/5 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className={`text-lg font-semibold ${
                            theme === 'dark' ? 'text-white' : 'text-gray-900'
                          }`}>
                            {user.full_name}
                          </h3>
                          {user.has_custom_dashboard && (
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              theme === 'dark'
                                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                : 'bg-green-500/20 text-green-700 border border-green-500/30'
                            }`}>
                              Настроен
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                              Логин:
                            </span>
                            <p className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                              {user.username}
                            </p>
                          </div>
                          <div>
                            <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                              Отдел:
                            </span>
                            <p className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                              {user.department || 'Не указан'}
                            </p>
                          </div>
                          <div>
                            <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                              Карточек:
                            </span>
                            <p className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                              {user.card_count}
                            </p>
                          </div>
                          <div>
                            <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                              Изменен:
                            </span>
                            <p className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                              {user.last_modified ? new Date(user.last_modified).toLocaleDateString('ru-RU') : 'Никогда'}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleEditUserDashboard(user)}
                          className={`p-2 rounded-xl transition-all duration-200 ${
                            theme === 'dark'
                              ? 'hover:bg-cyan-500/20 text-cyan-400'
                              : 'hover:bg-cyan-500/10 text-cyan-600'
                          }`}
                          title="Редактировать дашборд"
                        >
                          <Cog6ToothIcon className="h-5 w-5" />
                        </button>
                        
                        <button
                          onClick={() => handleResetUserDashboard(user.username)}
                          className={`p-2 rounded-xl transition-all duration-200 ${
                            theme === 'dark'
                              ? 'hover:bg-yellow-500/20 text-yellow-400'
                              : 'hover:bg-yellow-500/10 text-yellow-600'
                          }`}
                          title="Сбросить к настройкам по умолчанию"
                        >
                          <ArrowPathIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Футер */}
          <div className={`p-6 border-t ${
            theme === 'dark' ? 'border-white/10' : 'border-gray-200'
          }`}>
            <div className="flex justify-between items-center">
              <div>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Всего пользователей: {users.length}
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className={`px-6 py-2 rounded-2xl font-medium transition-all duration-200 ${
                    theme === 'dark'
                      ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                      : 'bg-black/5 border border-gray-300 text-gray-700 hover:bg-black/10 hover:text-gray-900'
                  }`}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};