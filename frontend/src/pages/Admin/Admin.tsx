import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.1.66.117:8000';

interface Admin {
  id: number;
  username: string;
  service_id: number;
  permissions: string;
  is_active: boolean;
}

interface Service {
  id: number;
  name: string;
}

interface Permission {
  read: boolean;
  write: boolean;
  delete: boolean;
}

const Admin: React.FC = () => {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [newAdmin, setNewAdmin] = useState({
    username: '',
    service_id: 0,
    permissions: JSON.stringify({ read: true, write: true, delete: true })
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchAdmins();
    fetchServices();
  }, []);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axios.get(`${API_BASE_URL}/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAdmins(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка получения списка админов');
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    try {
      setError('');
      const response = await axios.get(`${API_BASE_URL}/services`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setServices(response.data);
    } catch (err: any) {
      setError('Ошибка получения списка сервисов');
    }
  };

  const addAdmin = async () => {
    if (!newAdmin.username.trim()) {
      setError('Введите имя пользователя');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const response = await axios.post(`${API_BASE_URL}/admin`, newAdmin, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAdmins([...admins, response.data]);
      setNewAdmin({ 
        username: '', 
        service_id: 0, 
        permissions: JSON.stringify({ read: true, write: true, delete: true }) 
      });
      setSuccess('Администратор успешно добавлен');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка добавления админа');
    } finally {
      setLoading(false);
    }
  };

  const deleteAdmin = async (id: number) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого администратора?')) return;
    
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      await axios.delete(`${API_BASE_URL}/admin/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAdmins(admins.filter(admin => admin.id !== id));
      setSuccess('Администратор успешно удален');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка удаления админа');
    } finally {
      setLoading(false);
    }
  };

  const formatPermissions = (permissions: string): string => {
    try {
      const permObj: Permission = JSON.parse(permissions);
      return Object.entries(permObj)
        .filter(([_, value]) => value)
        .map(([key]) => {
          switch (key) {
            case 'read': return 'Чтение';
            case 'write': return 'Запись';
            case 'delete': return 'Удаление';
            default: return key;
          }
        })
        .join(', ') || 'Нет прав';
    } catch {
      return 'Неверный формат';
    }
  };

  const handlePermissionChange = (permission: keyof Permission) => {
    const perms = JSON.parse(newAdmin.permissions);
    perms[permission] = !perms[permission];
    setNewAdmin({ ...newAdmin, permissions: JSON.stringify(perms) });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4 sm:mb-0">
            Управление администраторами
          </h2>
          <button 
            onClick={fetchAdmins}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Обновить
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 flex items-center p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 text-red-700 flex-1">{error}</div>
            <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 text-green-700 flex-1">{success}</div>
            <button onClick={() => setSuccess('')} className="ml-auto text-green-500 hover:text-green-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Add Admin Form */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Добавить нового администратора</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Имя пользователя *
              </label>
              <input
                type="text"
                placeholder="Введите имя пользователя"
                value={newAdmin.username}
                onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })}
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Сервис
              </label>
              <select
                value={newAdmin.service_id}
                onChange={e => setNewAdmin({ ...newAdmin, service_id: parseInt(e.target.value) })}
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                <option value={0}>Глобальный администратор</option>
                {services.map(service => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Права доступа
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['read', 'write', 'delete'] as const).map((permission) => {
                  const perms = JSON.parse(newAdmin.permissions);
                  return (
                    <label key={permission} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={perms[permission]}
                        onChange={() => handlePermissionChange(permission)}
                        disabled={loading}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        {permission === 'read' && 'Чтение'}
                        {permission === 'write' && 'Запись'}
                        {permission === 'delete' && 'Удаление'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <button 
            onClick={addAdmin}
            disabled={loading || !newAdmin.username.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Добавление...
              </div>
            ) : (
              'Добавить администратора'
            )}
          </button>
        </div>

        {/* Admins Table */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Список администраторов</h3>
          
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : admins.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <p className="mt-4 text-gray-500">Нет данных об администраторах</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Пользователь</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Сервис</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Права доступа</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {admins.map(admin => (
                    <tr key={admin.id} className={!admin.is_active ? 'opacity-60' : ''}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{admin.username}</span>
                      </td>
                      <td className="px-4 py-3">
                        {admin.service_id === 0 
                          ? 'Глобальный' 
                          : services.find(s => s.id === admin.service_id)?.name || admin.service_id
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {formatPermissions(admin.permissions)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          admin.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {admin.is_active ? 'Активен' : 'Неактивен'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => deleteAdmin(admin.id)}
                          disabled={loading}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;