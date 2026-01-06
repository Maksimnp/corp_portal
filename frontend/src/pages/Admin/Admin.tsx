import React, { useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../hooks/ThemeContext';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://cloud.mhp.net';

// Define interface for error response data
interface ErrorResponse {
  detail?: string;
}

interface Admin {
  id: number;
  username: string;
  service_id: number;
  permissions: Permission;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  email?: string;
  display_name?: string;
  department?: string;
}

interface Service {
  id: number;
  name: string;
}

interface Permission {
  read: boolean;
  write: boolean;
  delete: boolean;
  manage_admins?: boolean;
  role?: string;
}

interface ADUser {
  username: string;
  email: string;
  display_name: string;
  department: string;
  title: string;
  is_admin: boolean;
}

interface TokenSettings {
  access_token_expire_minutes: number;
  refresh_token_expire_days: number;
  algorithm: string;
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  adminUsername: string;
  loading: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  adminUsername,
  loading
}) => {
  const { theme } = useTheme();
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[8px] flex items-center justify-center p-4 z-50">
      <div className={`rounded-xl shadow-2xl max-w-md w-full transform transition-all hover:scale-[1.02] ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/60'
          : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
      }`}>
        <div className={`flex flex-col items-center justify-center p-6 rounded-t-2xl ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-red-900/30 to-orange-900/30'
            : 'bg-gradient-to-r from-red-50 to-orange-50'
        }`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            theme === 'dark'
              ? 'bg-red-900/60'
              : 'bg-red-100'
          }`}>
            <svg className={`w-8 h-8 ${
              theme === 'dark' ? 'text-red-400' : 'text-red-600'
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h3 className={`text-xl font-bold mb-2 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            Подтверждение удаления
          </h3>
          <p className={`text-center mb-6 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            Вы уверены, что хотите удалить администратора <span className="font-semibold">{adminUsername}</span>? 
            Это действие нельзя отменить.
          </p>
          <div className="flex space-x-4 w-full">
            <button
              onClick={onClose}
              disabled={loading}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                theme === 'dark'
                  ? 'bg-gray-600/80 text-white border border-gray-500/60 hover:bg-gray-600 hover:border-gray-400/80 disabled:opacity-50'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 border border-gray-300 disabled:opacity-50'
              }`}
            >
              Отмена
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                theme === 'dark'
                  ? 'bg-red-600/80 text-white border border-red-500/60 hover:bg-red-600 hover:border-red-400/80 disabled:opacity-50'
                  : 'bg-red-600 hover:bg-red-700 text-white border border-red-600 disabled:opacity-50'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Удаление...
                </div>
              ) : 'Подтвердить удаление'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Admin: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [adUsers, setAdUsers] = useState<ADUser[]>([]);
  const [newAdmin, setNewAdmin] = useState<{
    username: string;
    service_id: number;
    permissions: Permission;
    email: string;
  }>({
    username: '',
    service_id: 0,
    permissions: {
      read: true,
      write: true,
      delete: true,
      manage_admins: false
    },
    email: ''
  });
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [adLoading, setAdLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [showActiveAdmins, setShowActiveAdmins] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<ADUser | null>(null);
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState<'admins' | 'tokens'>('admins');
  const [tokenSettings, setTokenSettings] = useState<TokenSettings>({
    access_token_expire_minutes: 1440,
    refresh_token_expire_days: 7,
    algorithm: 'HS256'
  });
  const [tokenSettingsLoading, setTokenSettingsLoading] = useState<boolean>(false);
  // Новые состояния для модального окна удаления
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [adminToDelete, setAdminToDelete] = useState<number | null>(null);

  const token = localStorage.getItem('access_token');

  useEffect(() => {
    fetchAdmins();
    fetchServices();
    fetchTokenSettings();

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, []);

  const handleApiError = (err: unknown, defaultMessage: string) => {
    const error = err as AxiosError<ErrorResponse>;
    console.error('API Error:', error);

    if (error.response?.status === 403) {
      const errorMessage = 'У вас недостаточно прав для выполнения этого действия';
      setError(errorMessage);
    } else if (error.response?.status === 401) {
      const errorMessage = 'Сессия истекла. Пожалуйста, войдите заново.';
      setError(errorMessage);
      setTimeout(() => {
        localStorage.removeItem('access_token');
        navigate('/login');
      }, 2000);
    } else {
      const errorDetail = error.response?.data?.detail || defaultMessage;
      setError(errorDetail);
    }
  };

  const fetchTokenSettings = async () => {
    try {
      setTokenSettingsLoading(true);
      setError('');

      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите заново.');
        return;
      }

      const cachedSettings = localStorage.getItem('tokenSettings');
      if (cachedSettings) {
        const parsedSettings = JSON.parse(cachedSettings);
        setTokenSettings(parsedSettings);
      }

      const response = await axios.get(`${API_BASE_URL}/admin/token-settings`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      if (response.data && response.data.settings) {
        const newSettings = {
          access_token_expire_minutes: response.data.settings.access_token_expire_minutes || 1440,
          refresh_token_expire_days: response.data.settings.refresh_token_expire_days || 7,
          algorithm: response.data.settings.algorithm || 'HS256'
        };

        setTokenSettings(newSettings);
        localStorage.setItem('tokenSettings', JSON.stringify(newSettings));
      }
    } catch (err) {
      console.error('Ошибка получения настроек токенов:', err);
      const cachedSettings = localStorage.getItem('tokenSettings');
      if (cachedSettings) {
        const parsedSettings = JSON.parse(cachedSettings);
        setTokenSettings(parsedSettings);
      }
    } finally {
      setTokenSettingsLoading(false);
    }
  };

  const updateTokenSettings = async () => {
    try {
      setTokenSettingsLoading(true);
      setError('');
      setSuccess('');

      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите заново.');
        return;
      }

      if (tokenSettings.access_token_expire_minutes < 5) {
        setError('Access Token должен быть не менее 5 минут');
        return;
      }
      if (tokenSettings.refresh_token_expire_days < 1) {
        setError('Refresh Token должен быть не менее 1 дня');
        return;
      }

      const response = await axios.post(
        `${API_BASE_URL}/admin/token-settings`,
        tokenSettings,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        }
      );

      if (response.data.settings) {
        setTokenSettings({
          access_token_expire_minutes: response.data.settings.access_token_expire_minutes || 1440,
          refresh_token_expire_days: response.data.settings.refresh_token_expire_days || 7,
          algorithm: response.data.settings.algorithm || 'HS256'
        });
      }

      setSuccess('Настройки токенов успешно обновлены');
      setTimeout(() => setSuccess(''), 5000);
      localStorage.setItem('tokenSettings', JSON.stringify(tokenSettings));

    } catch (err) {
      handleApiError(err, 'Ошибка обновления настроек токенов');
    } finally {
      setTokenSettingsLoading(false);
    }
  };

  const resetTokenSettings = async () => {
    try {
      setTokenSettingsLoading(true);
      setError('');
      setSuccess('');

      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите заново.');
        return;
      }

      const response = await axios.post(
        `${API_BASE_URL}/admin/token-settings/reset`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        }
      );

      if (response.data.settings) {
        const resetSettings = {
          access_token_expire_minutes: response.data.settings.access_token_expire_minutes || 1440,
          refresh_token_expire_days: response.data.settings.refresh_token_expire_days || 7,
          algorithm: response.data.settings.algorithm || 'HS256'
        };

        setTokenSettings(resetSettings);
        localStorage.setItem('tokenSettings', JSON.stringify(resetSettings));
      }

      setSuccess('Настройки токенов сброшены к значениям по умолчанию');
      setTimeout(() => setSuccess(''), 5000);

    } catch (err) {
      handleApiError(err, 'Ошибка сброса настроек токенов');
    } finally {
      setTokenSettingsLoading(false);
    }
  };

  const fetchADUsers = async (search: string = '') => {
    try {
      setAdLoading(true);
      setError('');

      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите заново.');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/admin/ad-users`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: { search }
      });

      setAdUsers(response.data.users || []);
    } catch (err) {
      handleApiError(err, 'Ошибка получения списка пользователей из AD');
      setAdUsers([]);
    } finally {
      setAdLoading(false);
    }
  };

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      setError('');

      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите заново.');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/admin/admin`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      const adminsData = response.data.admins || response.data;

      if (Array.isArray(adminsData)) {
        const processedAdmins = adminsData.map(admin => {
          let permissions: Permission;

          if (typeof admin.permissions === 'string') {
            try {
              permissions = JSON.parse(admin.permissions);
            } catch (e) {
              console.error('Error parsing permissions:', e);
              permissions = { read: true, write: true, delete: true, manage_admins: false };
            }
          } else {
            permissions = admin.permissions || { read: true, write: true, delete: true, manage_admins: false };
          }

          return {
            ...admin,
            permissions,
            id: admin.id || 0,
            email: admin.email || `${admin.username}@minskhleb.by`
          };
        });

        setAdmins(processedAdmins);
      } else {
        console.error('Admins is not an array:', adminsData);
        setAdmins([]);
      }
    } catch (err) {
      handleApiError(err, 'Ошибка получения списка админов');
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    try {
      setError('');

      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите заново.');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/admin/services`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      const servicesData = response.data.services || response.data;

      if (Array.isArray(servicesData)) {
        setServices(servicesData);
      } else {
        console.error('Services is not an array:', servicesData);
        setServices([]);
      }
    } catch (err) {
      handleApiError(err, 'Ошибка получения списка сервисов');
      setServices([]);
    }
  };

  const openUserModal = () => {
    setShowUserModal(true);
    setSearchTerm('');
    setAdUsers([]);
    setSelectedUser(null);
    setNewAdmin({
      username: '',
      service_id: 0,
      permissions: {
        read: true,
        write: true,
        delete: true,
        manage_admins: false
      },
      email: ''
    });
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setSearchTerm('');
    setAdUsers([]);
    setSelectedUser(null);

    if (searchTimeout) {
      clearTimeout(searchTimeout);
      setSearchTimeout(null);
    }
  };

  const openEditModal = (admin: Admin) => {
    setEditingAdmin({
      ...admin,
      email: admin.email || `${admin.username}@minskhleb.by`
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingAdmin(null);
  };

  const selectUserFromAD = (user: ADUser) => {
    setSelectedUser(user);
    setNewAdmin({
      ...newAdmin,
      username: user.username,
      email: user.email
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (value.trim().length >= 3) {
      const timeout = setTimeout(() => {
        fetchADUsers(value);
      }, 500);
      setSearchTimeout(timeout);
    } else if (value.trim().length === 0) {
      setAdUsers([]);
    }
  };

  const handleSearchSubmit = () => {
    if (searchTerm.trim().length >= 3) {
      fetchADUsers(searchTerm);
    } else {
      setError('Введите минимум 3 символа для поиска');
      setTimeout(() => setError(''), 3000);
    }
  };

  const addAdmin = async () => {
    if (!newAdmin.username.trim()) {
      setError('Введите имя пользователя');
      setTimeout(() => setError(''), 3000);
      return;
    }
    if (!newAdmin.email.trim() || !newAdmin.email.endsWith('@minskhleb.by')) {
      setError('Введите корректный email с доменом @minskhleb.by');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const adminToSend = {
        username: newAdmin.username,
        service_id: newAdmin.service_id,
        permissions: newAdmin.permissions,
        email: newAdmin.email
      };

      const response = await axios.post(`${API_BASE_URL}/admin/admin_add`, adminToSend, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const newAdminData = response.data.admin || response.data;
      let permissions: Permission = newAdminData.permissions;

      if (typeof newAdminData.permissions === 'string') {
        permissions = JSON.parse(newAdminData.permissions);
      }

      const processedAdmin = {
        ...newAdminData,
        permissions,
        id: newAdminData.id || Date.now(),
        email: newAdminData.email || `${newAdminData.username}@minskhleb.by`
      };

      setAdmins(prev => [...prev, processedAdmin]);

      setNewAdmin({
        username: '',
        service_id: 0,
        permissions: {
          read: true,
          write: true,
          delete: true,
          manage_admins: false
        },
        email: ''
      });
      setSelectedUser(null);
      setSuccess('Администратор успешно добавлен');
      setTimeout(() => setSuccess(''), 3000);
      closeUserModal();
    } catch (err) {
      handleApiError(err, 'Ошибка добавления админа');
    } finally {
      setLoading(false);
    }
  };

  const updateAdmin = async () => {
    if (!editingAdmin) return;
    if (!editingAdmin.username.trim()) {
      setError('Введите имя пользователя');
      setTimeout(() => setError(''), 3000);
      return;
    }
    if (!editingAdmin.email?.trim() || !editingAdmin.email.endsWith('@minskhleb.by')) {
      setError('Введите корректный email с доменом @minskhleb.by');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const adminToSend = {
        username: editingAdmin.username,
        service_id: editingAdmin.service_id,
        is_active: editingAdmin.is_active,
        permissions: editingAdmin.permissions,
        email: editingAdmin.email
      };

      const response = await axios.put(
        `${API_BASE_URL}/admin/admin/${editingAdmin.id}`,
        adminToSend,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const updatedAdminData = response.data.admin || response.data;
      let permissions: Permission = updatedAdminData.permissions;

      if (typeof updatedAdminData.permissions === 'string') {
        permissions = JSON.parse(updatedAdminData.permissions);
      }

      const processedAdmin = {
        ...updatedAdminData,
        permissions,
        id: updatedAdminData.id || editingAdmin.id,
        email: updatedAdminData.email || `${updatedAdminData.username}@minskhleb.by`
      };

      setAdmins(admins.map(admin =>
        admin.id === editingAdmin.id ? processedAdmin : admin
      ));
      setEditingAdmin(null);
      setSuccess('Администратор успешно обновлен');
      setTimeout(() => setSuccess(''), 3000);
      closeEditModal();
    } catch (err) {
      handleApiError(err, 'Ошибка обновления админа');
    } finally {
      setLoading(false);
    }
  };

  const deleteAdmin = async () => {
    if (adminToDelete === null) return;

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите заново.');
        return;
      }
      
      await axios.delete(`${API_BASE_URL}/admin/admin/${adminToDelete}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setAdmins(admins.filter(admin => admin.id !== adminToDelete));
      setSuccess('Администратор успешно удален');
      setTimeout(() => setSuccess(''), 3000);
      setShowDeleteModal(false);
      setAdminToDelete(null);
    } catch (err) {
      handleApiError(err, 'Ошибка удаления админа');
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminStatus = async (admin: Admin) => {
    try {
      setLoading(true);
      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите заново.');
        return;
      }
      const response = await axios.put(
        `${API_BASE_URL}/admin/admin/${admin.id}`,
        {
          username: admin.username,
          service_id: admin.service_id,
          is_active: !admin.is_active,
          permissions: admin.permissions,
          email: admin.email || `${admin.username}@minskhleb.by`
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const updatedAdminData = response.data.admin || response.data;
      let permissions: Permission = updatedAdminData.permissions;

      if (typeof updatedAdminData.permissions === 'string') {
        permissions = JSON.parse(updatedAdminData.permissions);
      }

      const processedAdmin = {
        ...updatedAdminData,
        permissions,
        id: updatedAdminData.id || admin.id,
        email: updatedAdminData.email || `${updatedAdminData.username}@minskhleb.by`
      };

      setAdmins(admins.map(a =>
        a.id === admin.id ? processedAdmin : a
      ));
      setSuccess(`Администратор ${!admin.is_active ? 'активирован' : 'деактивирован'}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      handleApiError(err, 'Ошибка изменения статуса');
    } finally {
      setLoading(false);
    }
  };

  const formatPermissions = (permissions: Permission): string => {
    if (!permissions) return 'Нет прав';

    try {
      return Object.entries(permissions)
        .filter(([_, value]) => value === true || typeof value === 'string')
        .map(([key]) => {
          switch (key) {
            case 'read': return 'Чтение';
            case 'write': return 'Запись';
            case 'delete': return 'Удаление';
            case 'manage_admins': return 'Управление админами';
            case 'role': return permissions.role === 'superadmin' ? 'Супер-админ' : 'Админ';
            default: return key;
          }
        })
        .join(', ') || 'Нет прав';
    } catch {
      return 'Неверный формат';
    }
  };

  const handlePermissionChange = (permission: keyof Permission, isEditing: boolean = false) => {
    if (isEditing && editingAdmin) {
      setEditingAdmin({
        ...editingAdmin,
        permissions: {
          ...editingAdmin.permissions,
          [permission]: !editingAdmin.permissions[permission]
        }
      });
    } else {
      setNewAdmin({
        ...newAdmin,
        permissions: {
          ...newAdmin.permissions,
          [permission]: !newAdmin.permissions[permission]
        },
        email: newAdmin.email || `${newAdmin.username}@minskhleb.by`
      });
    }
  };

  const getPermissionLevel = (permissions: Permission): string => {
    if (!permissions) return 'Неизвестно';

    try {
      if (permissions.manage_admins) return 'Супер-админ';
      if (permissions.role === 'superadmin') return 'Супер-админ';
      if (permissions.delete && permissions.write) return 'Полный доступ';
      if (permissions.write) return 'Редактор';
      if (permissions.read) return 'Просмотр';
      return 'Ограниченный';
    } catch {
      return 'Неизвестно';
    }
  };

  const cancelEdit = () => {
    setEditingAdmin(null);
    closeEditModal();
  };

  const getServiceName = (serviceId: number): string => {
    if (!Array.isArray(services)) return 'Глобальный';
    const service = services.find(s => s.id === serviceId);
    return service ? service.name : 'Глобальный';
  };

  const getSafeAdminId = (admin: Admin): string => {
    return admin?.id?.toString() || `admin-${Math.random().toString(36).substring(2, 9)}`;
  };

  const filteredAdmins = showActiveAdmins
    ? admins.filter(admin => admin.is_active)
    : admins;

  const handleBackToMain = () => {
    navigate('/dashboard');
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} мин`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
    } else {
      const days = Math.floor(minutes / 1440);
      const hours = Math.floor((minutes % 1440) / 60);
      if (hours > 0) {
        return `${days} д ${hours} ч`;
      }
      return `${days} д`;
    }
  };

  const handleModalBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeUserModal();
      closeEditModal();
    }
  };

  const openDeleteModal = (adminId: number, adminUsername: string) => {
    setAdminToDelete(adminId);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setAdminToDelete(null);
  };

  return (
    <div className={`min-h-screen p-6 transition-colors duration-500 ${
      theme === 'dark'
        ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white'
        : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50 text-gray-800'
    }`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 p-6 rounded-3xl shadow-2xl border-2 transition-all duration-500 ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-gray-700/60 hover:border-cyan-600/60'
            : 'bg-white border-gray-200 hover:border-blue-400'
        }`}>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBackToMain}
              className={`flex items-center px-4 py-2 rounded-lg transition-all duration-300 ${
                theme === 'dark'
                  ? 'bg-gray-800/70 text-white border border-gray-700/60 hover:bg-gray-700/80 hover:border-gray-600/80 transform hover:translate-y-[-1px]'
                  : 'bg-gray-600 text-white hover:bg-gray-700 border border-gray-600 transform hover:translate-y-[-1px]'
              }`}
              style={{ boxShadow: theme === 'dark' ? '0 10px 30px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.15)' }}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Назад на главную
            </button>
            <div>
              <h2 className={`text-3xl font-bold mb-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Управление администраторами
              </h2>
              <span className={`${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Управление правами доступа и настройками системы
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={fetchAdmins}
              disabled={loading}
              className={`flex items-center px-4 py-2 rounded-lg transition-all duration-300 ${
                theme === 'dark'
                  ? 'bg-blue-600/80 text-white border border-blue-500/60 hover:bg-blue-600 hover:border-blue-400/80 disabled:opacity-50 disabled:cursor-not-allowed transform hover:translate-y-[-1px]'
                  : 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transform hover:translate-y-[-1px]'
              }`}
              style={{ boxShadow: theme === 'dark' ? '0 10px 30px rgba(29,78,216,0.3)' : '0 10px 30px rgba(29,78,216,0.4)' }}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? 'Загрузка...' : 'Обновить список'}
            </button>
            <button
              onClick={toggleTheme}
              className={`p-3 rounded-2xl transition-all duration-300 border-2 ${
                theme === 'dark'
                  ? 'bg-gray-800/80 border-gray-600/60 text-yellow-300 hover:bg-gray-700/90 hover:border-yellow-500/80 transform hover:scale-105'
                  : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200 hover:border-yellow-500 transform hover:scale-105'
              }`}
              title={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
              style={{ boxShadow: theme === 'dark' ? '0 8px 25px rgba(0,0,0,0.3)' : '0 8px 25px rgba(0,0,0,0.1)' }}
            >
              {theme === 'dark' ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className={`mb-6 flex items-center p-4 rounded-lg border shadow-lg transition-all duration-300 ${
            theme === 'dark'
              ? 'bg-red-900/20 border-red-700/60 text-red-200 hover:bg-red-900/30'
              : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
          }`}>
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 001.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">{error}</div>
            <button onClick={() => setError('')} className={`ml-auto hover:text-red-500 transition-colors ${
              theme === 'dark' ? 'text-red-300 hover:bg-red-900/40' : 'text-red-500 hover:bg-red-200'
            } rounded-lg p-1`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {success && (
          <div className={`mb-6 flex items-center p-4 rounded-lg border shadow-lg transition-all duration-300 ${
            theme === 'dark'
              ? 'bg-green-900/20 border-green-700/60 text-green-200 hover:bg-green-900/30'
              : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
          }`}>
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">{success}</div>
            <button onClick={() => setSuccess('')} className={`ml-auto hover:text-green-500 transition-colors ${
              theme === 'dark' ? 'text-green-300 hover:bg-green-900/40' : 'text-green-500 hover:bg-green-200'
            } rounded-lg p-1`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className={`bg-white rounded-xl shadow-sm p-2 mb-8 transition-colors duration-300 ${
          theme === 'dark' ? 'bg-gray-800/80 border-gray-700/60' : 'bg-white border-gray-200'
        }`}>
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('admins')}
              className={`flex-1 px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-300 ${
                activeTab === 'admins'
                  ? theme === 'dark'
                    ? 'bg-blue-900/60 text-blue-300 border border-blue-700/60 shadow-lg shadow-blue-900/20'
                    : 'bg-blue-100 text-blue-700 border border-blue-200 shadow-lg shadow-blue-200/50'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:text-white hover:bg-gray-700/80'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Администраторы
            </button>
            <button
              onClick={() => setActiveTab('tokens')}
              className={`flex-1 px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-300 ${
                activeTab === 'tokens'
                  ? theme === 'dark'
                    ? 'bg-blue-900/60 text-blue-300 border border-blue-700/60 shadow-lg shadow-blue-900/20'
                    : 'bg-blue-100 text-blue-700 border border-blue-200 shadow-lg shadow-blue-200/50'
                  : theme === 'dark'
                    ? 'text-gray-300 hover:text-white hover:bg-gray-700/80'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Настройки токенов
            </button>
          </div>
        </div>

        {/* Admins Management Tab */}
        {activeTab === 'admins' && (
          <>
            {/* Add Admin Section */}
            <div className={`rounded-xl shadow-sm p-6 mb-8 transition-colors duration-300 ${
              theme === 'dark' ? 'bg-gray-800/80 border-gray-700/60' : 'bg-white border-gray-200'
            }`}>
              <h3 className={`text-xl font-semibold mb-6 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Добавить нового администратора
              </h3>

              <div className="mb-6">
                <button
                  onClick={openUserModal}
                  className={`flex items-center px-4 py-2 rounded-lg transition-all duration-300 ${
                    theme === 'dark'
                      ? 'bg-blue-600/80 text-white border border-blue-500/60 hover:bg-blue-600 hover:border-blue-400/80 transform hover:translate-y-[-1px]'
                      : 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-600 transform hover:translate-y-[-1px]'
                  }`}
                  style={{ boxShadow: theme === 'dark' ? '0 10px 30px rgba(29,78,216,0.3)' : '0 10px 30px rgba(29,78,216,0.4)' }}
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                  Выбрать пользователя из Active Directory
                </button>
              </div>
            </div>

            {/* Admins Table */}
            <div className={`rounded-xl shadow-sm p-6 transition-colors duration-300 ${
              theme === 'dark' ? 'bg-gray-800/80 border-gray-700/60' : 'bg-white border-gray-200'
            }`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <h3 className={`text-xl font-semibold mb-4 sm:mb-0 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>Список администраторов</h3>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showActiveAdmins}
                      onChange={e => setShowActiveAdmins(e.target.checked)}
                      className={`w-4 h-4 border rounded focus:ring-2 ${
                        theme === 'dark'
                          ? 'text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-400'
                          : 'text-blue-600 bg-white border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    <span className={`ml-2 text-sm ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>Показывать только активных</span>
                  </label>
                  <div className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                    {showActiveAdmins ? (
                      <>
                        Показано: {filteredAdmins.length} из {admins.length}
                      </>
                    ) : (
                      <>
                        Всего: {admins.length}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className={`flex justify-center items-center py-12 rounded-xl ${
                  theme === 'dark' ? 'bg-gray-900/40' : 'bg-gray-50'
                }`}>
                  <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : filteredAdmins.length === 0 ? (
                <div className={`text-center py-12 rounded-xl ${
                  theme === 'dark' ? 'bg-gray-900/40' : 'bg-gray-50'
                }`}>
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                  <p className={`mt-4 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                    {showActiveAdmins ? 'Нет активных администраторов' : 'Нет данных об администраторах'}
                  </p>
                </div>
              ) : (
                <div className={`overflow-x-auto rounded-xl ${
                  theme === 'dark' ? 'bg-gray-900/30' : 'bg-white'
                }`}>
                  <table className="w-full">
                    <thead className={`bg-gradient-to-r ${
                      theme === 'dark'
                        ? 'from-gray-800/80 to-gray-700/80'
                        : 'from-gray-100 to-gray-50'
                    }`}>
                      <tr className={`border-b ${
                        theme === 'dark' ? 'border-gray-600/60' : 'border-gray-200'
                      }`}>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                        }`}>Пользователь</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                        }`}>Email</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                        }`}>Сервис</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                        }`}>Уровень доступа</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                        }`}>Права</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                        }`}>Статус</th>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                        }`}>Действия</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${
                      theme === 'dark' ? 'divide-gray-700/60' : 'divide-gray-200'
                    }`}>
                      {filteredAdmins.map(admin => (
                        <tr
                          key={getSafeAdminId(admin)}
                          id={getSafeAdminId(admin)}
                          className={`transition-all hover:bg-opacity-50 ${
                            !admin.is_active
                              ? theme === 'dark'
                                ? 'bg-gray-900/40 hover:bg-gray-800/40'
                                : 'bg-gray-50 hover:bg-gray-100'
                              : theme === 'dark'
                                ? 'hover:bg-gray-900/30'
                                : 'hover:bg-blue-50'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center">
                              <span className={`font-medium ${
                                theme === 'dark' ? 'text-white' : 'text-gray-900'
                              }`}>{admin.username}</span>
                              {admin.permissions?.manage_admins && (
                                <span className="ml-2 px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">
                                  Супер-админ
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm ${
                              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                            }`}>{admin.email || `${admin.username}@minskhleb.by`}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`${
                              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                            }`}>{getServiceName(admin.service_id)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              getPermissionLevel(admin.permissions) === 'Супер-админ' ? 'bg-purple-100 text-purple-800' :
                              getPermissionLevel(admin.permissions) === 'Полный доступ' ? 'bg-green-100 text-green-800' :
                              getPermissionLevel(admin.permissions) === 'Редактор' ? 'bg-blue-100 text-blue-800' :
                              getPermissionLevel(admin.permissions) === 'Просмотр' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {getPermissionLevel(admin.permissions)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm ${
                              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                            }`} title={formatPermissions(admin.permissions)}>
                              {formatPermissions(admin.permissions)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleAdminStatus(admin)}
                              disabled={loading}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                admin.is_active
                                  ? theme === 'dark'
                                    ? 'bg-green-700/80 text-green-100 border border-green-600/60 hover:bg-green-700 hover:border-green-500/80'
                                    : 'bg-green-100 text-green-800 hover:bg-green-200'
                                  : theme === 'dark'
                                    ? 'bg-red-700/80 text-red-100 border border-red-600/60 hover:bg-red-700 hover:border-red-500/80'
                                    : 'bg-red-100 text-red-800 hover:bg-red-200'
                              } disabled:opacity-50`}
                            >
                              {admin.is_active ? 'Активен' : 'Неактивен'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => openEditModal(admin)}
                                disabled={loading}
                                className={`inline-flex items-center px-3 py-1.5 border text-sm font-medium rounded-md transition-colors ${
                                  theme === 'dark'
                                    ? 'border-gray-600/60 text-gray-300 bg-gray-800/80 hover:bg-gray-700/90'
                                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                                } disabled:opacity-50`}
                              >
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Редактировать
                              </button>
                              <button
                                onClick={() => openDeleteModal(admin.id, admin.username)}
                                disabled={loading}
                                className={`inline-flex items-center px-3 py-1.5 border text-sm font-medium rounded-md text-white transition-colors ${
                                  theme === 'dark'
                                    ? 'bg-red-600/80 border border-red-500/60 hover:bg-red-600 hover:border-red-400/80'
                                    : 'bg-red-600 hover:bg-red-700 border border-red-600'
                                } disabled:opacity-50`}
                              >
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Token Settings Tab */}
        {activeTab === 'tokens' && (
          <div className={`rounded-xl shadow-sm p-6 mb-8 transition-colors duration-300 ${
            theme === 'dark' ? 'bg-gray-800/80 border-gray-700/60' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-semibold ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>Настройки времени жизни токенов</h3>
              <button
                onClick={fetchTokenSettings}
                disabled={tokenSettingsLoading}
                className={`flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-700/80 text-gray-300 border border-gray-600/60 hover:bg-gray-600/90'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                } disabled:opacity-50`}
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Обновить
              </button>
            </div>

            {tokenSettingsLoading ? (
              <div className={`flex justify-center items-center py-12 rounded-xl ${
                theme === 'dark' ? 'bg-gray-900/40' : 'bg-gray-50'
              }`}>
                <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className={`p-6 rounded-xl border transition-all hover:shadow-lg ${
                    theme === 'dark'
                      ? 'bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border-blue-700/50 hover:border-blue-600/60'
                      : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 hover:border-blue-300'
                  }`}>
                    <h4 className={`text-lg font-semibold mb-4 flex items-center ${
                      theme === 'dark' ? 'text-blue-300' : 'text-blue-900'
                    }`}>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      Access Token
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${
                          theme === 'dark' ? 'text-blue-200' : 'text-blue-800'
                        }`}>
                          Время жизни (минуты)
                        </label>
                        <input
                          type="number"
                          min="5"
                          max="10080"
                          value={tokenSettings.access_token_expire_minutes}
                          onChange={e => setTokenSettings({
                            ...tokenSettings,
                            access_token_expire_minutes: parseInt(e.target.value) || 1440
                          })}
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            theme === 'dark'
                              ? 'bg-gray-700/80 border-blue-600/60 text-white'
                              : 'bg-white border-blue-300 text-gray-900'
                          }`}
                        />
                        <p className={`text-sm mt-2 ${
                          theme === 'dark' ? 'text-blue-200' : 'text-blue-700'
                        }`}>
                          Текущее значение: {formatTime(tokenSettings.access_token_expire_minutes)}
                        </p>
                        <p className={`text-xs mt-1 ${
                          theme === 'dark' ? 'text-blue-100' : 'text-blue-600'
                        }`}>
                          Минимум: 5 минут, Максимум: 10080 минут (7 дней)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={`p-6 rounded-xl border transition-all hover:shadow-lg ${
                    theme === 'dark'
                      ? 'bg-gradient-to-br from-green-900/20 to-emerald-900/20 border-green-700/50 hover:border-green-600/60'
                      : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 hover:border-green-300'
                  }`}>
                    <h4 className={`text-lg font-semibold mb-4 flex items-center ${
                      theme === 'dark' ? 'text-green-300' : 'text-green-900'
                    }`}>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Token
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${
                          theme === 'dark' ? 'text-green-200' : 'text-green-800'
                        }`}>
                          Время жизни (дни)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={tokenSettings.refresh_token_expire_days}
                          onChange={e => setTokenSettings({
                            ...tokenSettings,
                            refresh_token_expire_days: parseInt(e.target.value) || 7
                          })}
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                            theme === 'dark'
                              ? 'bg-gray-700/80 border-green-600/60 text-white'
                              : 'bg-white border-green-300 text-gray-900'
                          }`}
                        />
                        <p className={`text-sm mt-2 ${
                          theme === 'dark' ? 'text-green-200' : 'text-green-700'
                        }`}>
                          Текущее значение: {tokenSettings.refresh_token_expire_days} дней
                        </p>
                        <p className={`text-xs mt-1 ${
                          theme === 'dark' ? 'text-green-100' : 'text-green-600'
                        }`}>
                          Минимум: 1 день, Максимум: 365 дней
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`p-6 rounded-xl border transition-all hover:shadow-lg ${
                  theme === 'dark'
                    ? 'bg-gradient-to-br from-purple-900/20 to-violet-900/20 border-purple-700/50 hover:border-purple-600/60'
                    : 'bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200 hover:border-purple-300'
                }`}>
                  <h4 className={`text-lg font-semibold mb-4 flex items-center ${
                    theme === 'dark' ? 'text-purple-300' : 'text-purple-900'
                  }`}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    Алгоритм шифрования
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        theme === 'dark' ? 'text-purple-200' : 'text-purple-800'
                      }`}>
                        Алгоритм подписи
                      </label>
                      <select
                        value={tokenSettings.algorithm}
                        onChange={e => setTokenSettings({
                          ...tokenSettings,
                          algorithm: e.target.value
                        })}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                          theme === 'dark'
                            ? 'bg-gray-700/80 border-purple-600/60 text-white'
                            : 'bg-white border-purple-300 text-gray-900'
                        }`}
                      >
                        <option value="HS256">HS256</option>
                        <option value="HS384">HS384</option>
                        <option value="HS512">HS512</option>
                        <option value="RS256">RS256</option>
                      </select>
                      <p className={`text-sm mt-2 ${
                        theme === 'dark' ? 'text-purple-200' : 'text-purple-700'
                      }`}>
                        Текущий алгоритм: {tokenSettings.algorithm}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-4 pt-4">
                    <button
                      onClick={updateTokenSettings}
                      disabled={tokenSettingsLoading}
                      className={`px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 ${
                        theme === 'dark'
                          ? 'bg-blue-600/80 text-white border border-blue-500/60 hover:bg-blue-600 hover:border-blue-400/80 disabled:opacity-50 disabled:cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 disabled:opacity-50 disabled:cursor-not-allowed'
                      }`}
                      style={{ boxShadow: theme === 'dark' ? '0 12px 35px rgba(29,78,216,0.3)' : '0 12px 35px rgba(29,78,216,0.4)' }}
                    >
                      {tokenSettingsLoading ? (
                        <div className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Сохранение...
                        </div>
                      ) : 'Сохранить настройки'}
                    </button>
                    <button
                      onClick={resetTokenSettings}
                      disabled={tokenSettingsLoading}
                      className={`px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 ${
                        theme === 'dark'
                          ? 'bg-gray-600/80 text-white border border-gray-500/60 hover:bg-gray-600 hover:border-gray-400/80 disabled:opacity-50'
                          : 'bg-gray-600 hover:bg-gray-700 text-white border border-gray-600 disabled:opacity-50'
                      }`}
                      style={{ boxShadow: theme === 'dark' ? '0 12px 35px rgba(31,41,55,0.3)' : '0 12px 35px rgba(31,41,55,0.4)' }}
                    >
                      Сбросить к значениям по умолчанию
                    </button>
                  </div>

                  {/* Information */}
                  <div className={`p-4 rounded-lg border mt-6 ${
                    theme === 'dark'
                      ? 'bg-gradient-to-r from-yellow-900/15 to-orange-900/15 border-yellow-700/50 text-yellow-200'
                      : 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200 text-yellow-700'
                  }`}>
                    <h5 className="font-medium mb-2">Информация о токенах:</h5>
                    <ul className="text-sm space-y-1">
                      <li>• <strong>Access Token</strong> - используется для доступа к API, короткое время жизни</li>
                      <li>• <strong>Refresh Token</strong> - используется для обновления Access Token, длительное время жизни</li>
                      <li>• При изменении настроек все существующие токены продолжат работать до истечения их срока</li>
                      <li>• Новые настройки применяются только к вновь созданным токенам</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно подтверждения удаления */}
      {showDeleteModal && (
        <DeleteConfirmationModal
          isOpen={showDeleteModal}
          onClose={closeDeleteModal}
          onConfirm={deleteAdmin}
          adminUsername={admins.find(admin => admin.id === adminToDelete)?.username || ''}
          loading={loading}
        />
      )}

      {/* Модальное окно выбора пользователя из AD */}
      {showUserModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[8px] flex items-center justify-center p-4 z-50"
          onClick={handleModalBackdropClick}
        >
          <div className={`rounded-xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden border-2 transform transition-all hover:scale-[1.02] ${
            theme === 'dark'
              ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/60'
              : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
          }`}>
            <div className={`flex items-center justify-between p-6 border-b ${
              theme === 'dark'
                ? 'border-gray-700/60 bg-gradient-to-r from-blue-900/30 to-indigo-900/30'
                : 'border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50'
            }`}>
              <h3 className={`text-2xl font-bold ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Добавление администратора из Active Directory
              </h3>
              <button
                onClick={closeUserModal}
                className={`text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-lg ${
                  theme === 'dark' ? 'hover:bg-gray-700' : ''
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(95vh-200px)]">
              {/* Поиск пользователей */}
              <div className={`p-4 rounded-xl ${
                theme === 'dark' ? 'bg-gradient-to-br from-gray-900/90 to-gray-800/90' : 'bg-gradient-to-br from-gray-50 to-white'
              }`}>
                <label className={`block text-sm font-medium mb-3 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Поиск пользователей в Active Directory
                </label>
                <div className="flex space-x-3">
                  <input
                    type="text"
                    placeholder="Введите имя, фамилию или логин пользователя..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className={`flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg ${
                      theme === 'dark'
                        ? 'bg-gray-800/80 border-gray-600/60 text-white placeholder-gray-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  <button
                    onClick={handleSearchSubmit}
                    disabled={adLoading || searchTerm.trim().length < 3}
                    className={`px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 ${
                      theme === 'dark'
                        ? 'bg-blue-600/80 text-white border border-blue-500/60 hover:bg-blue-600 hover:border-blue-400/80 disabled:opacity-50'
                        : 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 disabled:opacity-50'
                    }`}
                    style={{ boxShadow: theme === 'dark' ? '0 10px 30px rgba(29,78,216,0.3)' : '0 10px 30px rgba(29,78,216,0.4)' }}
                  >
                    {adLoading ? (
                      <div className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Поиск...
                      </div>
                    ) : 'Найти'}
                  </button>
                </div>
                {searchTerm.trim().length > 0 && searchTerm.trim().length < 3 && (
                  <p className={`mt-2 text-sm text-amber-600 ${
                    theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
                  }`}>
                    Введите минимум 3 символа для поиска
                  </p>
                )}
                {searchTerm.trim().length >= 3 && (
                  <p className={`mt-2 text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Поиск выполняется автоматически при вводе...
                  </p>
                )}
              </div>

              {/* Результаты поиска и форма добавления */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Результаты поиска */}
                <div className="space-y-4">
                  <h4 className={`text-lg font-semibold ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>Результаты поиска</h4>

                  {adLoading ? (
                    <div className={`flex justify-center items-center py-12 rounded-xl ${
                      theme === 'dark' ? 'bg-gray-900/40' : 'bg-gray-50'
                    }`}>
                      <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  ) : adUsers.length > 0 ? (
                    <div className="overflow-y-auto max-h-96 space-y-3">
                      {adUsers.map(user => (
                        <div
                          key={user.username}
                          className={`p-4 border rounded-xl cursor-pointer transition-all ${
                            selectedUser?.username === user.username
                              ? theme === 'dark'
                                ? 'border-blue-500/80 bg-blue-900/20 ring-2 ring-blue-500/60 shadow-lg shadow-blue-900/20'
                                : 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-lg shadow-blue-200/50'
                              : theme === 'dark'
                                ? 'border-gray-600/60 hover:border-blue-400/80 hover:bg-blue-900/15'
                                : 'border-gray-200 hover:border-blue-300 hover:bg-blue-25'
                          }`}
                          onClick={() => selectUserFromAD(user)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h5 className={`font-semibold ${
                                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                                }`}>{user.display_name}</h5>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  user.is_admin
                                    ? theme === 'dark'
                                      ? 'bg-green-900/60 text-green-200 border border-green-700/80'
                                      : 'bg-green-100 text-green-800 border border-green-300'
                                    : theme === 'dark'
                                      ? 'bg-gray-700/80 text-gray-300 border border-gray-600/80'
                                      : 'bg-gray-100 text-gray-800 border border-gray-300'
                                }`}>
                                  {user.is_admin ? 'Администратор' : 'Пользователь'}
                                </span>
                              </div>
                              <div className={`text-sm space-y-1 ${
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                              }`}>
                                <div><strong>Логин:</strong> {user.username}</div>
                                <div><strong>Email:</strong> {user.email}</div>
                                <div><strong>Отдел:</strong> {user.department}</div>
                                <div><strong>Должность:</strong> {user.title}</div>
                              </div>
                            </div>
                            {selectedUser?.username === user.username && (
                              <div className={`text-green-500 ${
                                theme === 'dark' ? 'text-green-400' : ''
                              }`}>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : searchTerm ? (
                    <div className={`text-center py-12 rounded-xl ${
                      theme === 'dark' ? 'bg-gray-900/40' : 'bg-gray-50'
                    }`}>
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="mt-4">Пользователи не найдены</p>
                    </div>
                  ) : (
                    <div className={`text-center py-12 rounded-xl ${
                      theme === 'dark' ? 'bg-gray-900/40' : 'bg-gray-50'
                    }`}>
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p className="mt-4">Введите поисковый запрос для отображения пользователей</p>
                    </div>
                  )}
                </div>

                {/* Форма добавления администратора */}
                <div className="space-y-4">
                  <h4 className={`text-lg font-semibold ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>Настройки администратора</h4>

                  {selectedUser ? (
                    <div className="space-y-6">
                      {/* Информация о выбранном пользователе */}
                      <div className={`p-4 rounded-xl border ${
                        theme === 'dark'
                          ? 'bg-gradient-to-br from-blue-900/15 to-cyan-900/15 border-blue-700/60'
                          : 'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200'
                      }`}>
                        <h5 className={`font-medium mb-3 ${
                          theme === 'dark' ? 'text-blue-300' : 'text-blue-900'
                        }`}>Выбранный пользователь:</h5>
                        <div className={`space-y-2 ${
                          theme === 'dark' ? 'text-blue-200' : 'text-blue-800'
                        }`}>
                          <div><strong>Имя:</strong> {selectedUser.display_name}</div>
                          <div><strong>Логин:</strong> {selectedUser.username}</div>
                          <div><strong>Email:</strong> {selectedUser.email}</div>
                          <div><strong>Отдел:</strong> {selectedUser.department}</div>
                          <div><strong>Должность:</strong> {selectedUser.title}</div>
                        </div>
                      </div>

                      {/* Настройки прав доступа */}
                      <div className="space-y-4">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Сервис
                          </label>
                          <select
                            value={newAdmin.service_id}
                            onChange={e => setNewAdmin({ ...newAdmin, service_id: parseInt(e.target.value) })}
                            disabled={loading}
                            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              theme === 'dark'
                                ? 'bg-gray-700/80 border-gray-600/60 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                          >
                            <option value={0}>Глобальный администратор</option>
                            {Array.isArray(services) && services.map(service => (
                              <option key={service.id} value={service.id}>{service.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-3 ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Права доступа
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            {(['read', 'write', 'delete', 'manage_admins'] as const).map((permission) => (
                              <label key={permission} className={`flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-all ${
                                theme === 'dark'
                                  ? 'border-gray-600/60 hover:bg-gray-700/80'
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={!!newAdmin.permissions?.[permission]}
                                  onChange={() => handlePermissionChange(permission)}
                                  disabled={loading}
                                  className={`w-4 h-4 rounded focus:ring-2 ${
                                    theme === 'dark'
                                      ? 'text-blue-500 bg-gray-700/80 border-gray-600/60 focus:ring-blue-400'
                                      : 'text-blue-600 bg-white border-gray-300 focus:ring-blue-500'
                                  }`}
                                />
                                <span className={`text-sm font-medium ${
                                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                                }`}>
                                  {permission === 'read' && 'Чтение'}
                                  {permission === 'write' && 'Запись'}
                                  {permission === 'delete' && 'Удаление'}
                                  {permission === 'manage_admins' && 'Управление админами'}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="flex space-x-3 pt-4">
                          <button
                            onClick={addAdmin}
                            disabled={loading}
                            className={`flex-1 px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 ${
                              theme === 'dark'
                                ? 'bg-green-600/80 text-white border border-green-500/60 hover:bg-green-600 hover:border-green-400/80 disabled:opacity-50'
                                : 'bg-green-600 hover:bg-green-700 text-white border border-green-600 disabled:opacity-50'
                            }`}
                            style={{ boxShadow: theme === 'dark' ? '0 10px 30px rgba(16,185,129,0.3)' : '0 10px 30px rgba(16,185,129,0.4)' }}
                          >
                            {loading ? (
                              <div className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Добавление...
                              </div>
                            ) : 'Добавить администратора'}
                          </button>
                          <button
                            onClick={() => setSelectedUser(null)}
                            disabled={loading}
                            className={`px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 ${
                              theme === 'dark'
                                ? 'bg-gray-600/80 text-white border border-gray-500/60 hover:bg-gray-600 hover:border-gray-400/80 disabled:opacity-50'
                                : 'bg-gray-600 hover:bg-gray-700 text-white border border-gray-600 disabled:opacity-50'
                            }`}
                            style={{ boxShadow: theme === 'dark' ? '0 10px 30px rgba(31,41,55,0.3)' : '0 10px 30px rgba(31,41,55,0.4)' }}
                          >
                            Сбросить
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`text-center py-12 rounded-xl ${
                      theme === 'dark' ? 'bg-gray-900/40' : 'bg-gray-50'
                    }`}>
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <p className="mt-4">Выберите пользователя из списка для настройки прав доступа</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`flex justify-end p-6 border-t ${
              theme === 'dark' ? 'border-gray-700/60 bg-gray-800/80' : 'border-gray-200 bg-gray-100'
            }`}>
              <button
                onClick={closeUserModal}
                className={`px-6 py-2 rounded-lg font-medium transition-all transform hover:scale-105 ${
                  theme === 'dark'
                    ? 'bg-gray-600/80 text-white border border-gray-500/60 hover:bg-gray-600 hover:border-gray-400/80'
                    : 'bg-gray-600 hover:bg-gray-700 text-white border border-gray-600'
                }`}
                style={{ boxShadow: theme === 'dark' ? '0 8px 25px rgba(31,41,55,0.3)' : '0 8px 25px rgba(31,41,55,0.4)' }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно редактирования администратора */}
      {showEditModal && editingAdmin && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[8px] flex items-center justify-center p-4 z-50"
          onClick={handleModalBackdropClick}
        >
          <div className={`rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden border-2 transform transition-all hover:scale-[1.02] ${
            theme === 'dark'
              ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/60'
              : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
          }`}>
            <div className={`flex items-center justify-between p-6 border-b ${
              theme === 'dark'
                ? 'border-gray-700/60 bg-gradient-to-r from-yellow-900/30 to-orange-900/30'
                : 'border-gray-200 bg-gradient-to-r from-yellow-50 to-orange-50'
            }`}>
              <h3 className={`text-2xl font-bold ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Редактирование администратора
              </h3>
              <button
                onClick={closeEditModal}
                className={`text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-lg ${
                  theme === 'dark' ? 'hover:bg-gray-700' : ''
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(95vh-200px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Имя пользователя *
                  </label>
                  <input
                    type="text"
                    placeholder="Введите имя пользователя"
                    value={editingAdmin.username}
                    onChange={e => setEditingAdmin({ ...editingAdmin, username: e.target.value })}
                    disabled={loading}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      theme === 'dark'
                        ? 'bg-gray-700/80 border-gray-600/60 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Email *
                  </label>
                  <input
                    type="email"
                    placeholder="username@minskhleb.by"
                    value={editingAdmin.email || ''}
                    onChange={e => setEditingAdmin({ ...editingAdmin, email: e.target.value })}
                    disabled={loading}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      theme === 'dark'
                        ? 'bg-gray-700/80 border-gray-600/60 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Сервис
                  </label>
                  <select
                    value={editingAdmin.service_id}
                    onChange={e => setEditingAdmin({ ...editingAdmin, service_id: parseInt(e.target.value) })}
                    disabled={loading}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      theme === 'dark'
                        ? 'bg-gray-700/80 border-gray-600/60 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value={0}>Глобальный администратор</option>
                    {Array.isArray(services) && services.map(service => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className={`block text-sm font-medium mb-2 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Права доступа
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(['read', 'write', 'delete', 'manage_admins'] as const).map((permission) => (
                      <label key={permission} className={`flex items-center ${
                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        <input
                          type="checkbox"
                          checked={!!editingAdmin.permissions?.[permission]}
                          onChange={() => handlePermissionChange(permission, true)}
                          disabled={loading}
                          className={`w-4 h-4 rounded focus:ring-2 mr-2 ${
                            theme === 'dark'
                              ? 'text-blue-500 bg-gray-700/80 border-gray-600/60 focus:ring-blue-400'
                              : 'text-blue-600 bg-white border-gray-300 focus:ring-blue-500'
                          }`}
                        />
                        <span className={`text-sm ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {permission === 'read' && 'Чтение'}
                          {permission === 'write' && 'Запись'}
                          {permission === 'delete' && 'Удаление'}
                          {permission === 'manage_admins' && 'Управление админами'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={updateAdmin}
                  disabled={loading || !editingAdmin.username.trim() || !editingAdmin.email?.trim()}
                  className={`px-6 py-2 rounded-lg font-medium transition-all transform hover:scale-105 ${
                    theme === 'dark'
                      ? 'bg-green-600/80 text-white border border-green-500/60 hover:bg-green-600 hover:border-green-400/80 disabled:opacity-50'
                      : 'bg-green-600 hover:bg-green-700 text-white border border-green-600 disabled:opacity-50'
                  }`}
                  style={{ boxShadow: theme === 'dark' ? '0 8px 25px rgba(16,185,129,0.3)' : '0 8px 25px rgba(16,185,129,0.4)' }}
                >
                  {loading ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={loading}
                  className={`px-6 py-2 rounded-lg font-medium transition-all transform hover:scale-105 ${
                    theme === 'dark'
                      ? 'bg-gray-600/80 text-white border border-gray-500/60 hover:bg-gray-600 hover:border-gray-400/80 disabled:opacity-50'
                      : 'bg-gray-600 hover:bg-gray-700 text-white border border-gray-600 disabled:opacity-50'
                  }`}
                  style={{ boxShadow: theme === 'dark' ? '0 8px 25px rgba(31,41,55,0.3)' : '0 8px 25px rgba(31,41,55,0.4)' }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;