import React, { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BellIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
  MagnifyingGlassIcon,
  ArrowRightOnRectangleIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  TicketIcon,
  PhoneIcon,
  VideoCameraIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  ChartBarIcon,
  GlobeAltIcon,
  QuestionMarkCircleIcon,
  UsersIcon,
  ComputerDesktopIcon,
  ClockIcon,
  CalendarIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  CameraIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
  PhoneArrowUpRightIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '../../hooks/ThemeContext';
import { SupportModal } from '../../components/SupportModal';
import { getAvatarData, setAvatarData } from '../../utils/avatarCache';
import "./Dashboard.css";

// Функция для получения приветствия в зависимости от времени суток
const getGreeting = (): string => {
  const currentHour = new Date().getHours();

  if (currentHour >= 5 && currentHour < 12) {
    return 'Доброе утро';
  } else if (currentHour >= 12 && currentHour < 18) {
    return 'Добрый день';
  } else if (currentHour >= 18 && currentHour < 23) {
    return 'Добрый вечер';
  } else {
    return 'Доброй ночи';
  }
};

// Сервисы
const services = [
  { title: 'Чат', description: 'Общайтесь с коллегами в каналах и личных сообщениях', to: '/chat', icon: <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-emerald-500 to-teal-500' },
  { title: 'Служба поддержки', description: 'Создавайте и отслеживайте заявки в IT-поддержку', to: '/requests_list', icon: <TicketIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-purple-500 to-indigo-500' },
  { title: 'Контакты', description: 'Поиск сотрудников по имени, отделу или должности', to: '/contacts', icon: <PhoneIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-indigo-500 to-blue-500' },
  { title: 'Видеоконференции', description: 'Проводите онлайн-встречи и совещания', to: '/jitsi', icon: <VideoCameraIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-red-500 to-orange-500' },
  { title: 'Удалённое управление', description: 'Удалённый доступ и управление компьютерами сотрудников', to: '/remote-desktop', icon: <ComputerDesktopIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-cyan-500 to-blue-500' },
  { title: 'Редактирование контактов', description: 'Управление контактами Active Directory', to: '/edit-contacts', icon: <PencilSquareIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-orange-500 to-amber-500', isAdminOnly: true },
  { title: 'Админ-панель', description: 'Управление пользователями и настройками системы', to: '/admin', icon: <ShieldCheckIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-gray-700 to-gray-900', isAdminOnly: true },
  { title: 'Документы', description: 'Центр хранения внутренних документов и инструкций', to: '/docs', icon: <DocumentTextIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-cyan-500 to-blue-500' },
  { title: 'Статистика серверов', description: 'Просмотр статистики серверов', to: '/serverstats', icon: <ChartBarIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-blue-500 to-indigo-500', isAdminOnly: true },
  { title: 'VPN Управление', description: 'Управление подключениями и профилями OpenVPN', to: '/VPNManagement', icon: <GlobeAltIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-fuchsia-500 to-purple-500', isAdminOnly: true },
  { title: 'Часто задаваемые вопросы', description: 'Ответы на популярные вопросы', to: '/faq', icon: <QuestionMarkCircleIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-amber-500 to-yellow-500' },
  { title: 'Статистика персонала', description: 'Статистика персонала', to: '/EmployeeTrackerApp', icon: <UsersIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-lime-500 to-emerald-500', isAdminOnly: true },
  { title: 'Программное обеспечение', description: 'Установка и управление корпоративным ПО', to: '/software', icon: <Cog6ToothIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-violet-500 to-purple-600' },
];

const JITSI_URL = import.meta.env.VITE_API_JITSI_URL;
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: string;
  displayName?: string;
  givenName?: string;
  sn?: string;
  initials?: string;
  title?: string;
  department?: string;
  company?: string;
  office?: string;
  physicalDeliveryOfficeName?: string;
  manager?: string;
  managerName?: string;
  phone?: string;
  telephoneNumber?: string;
  mobile?: string;
  ipPhone?: string;
  homePhone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  employeeID?: string;
  employeeNumber?: string;
  description?: string;
  whenCreated?: string;
  whenChanged?: string;
  lastLogon?: string;
  accountExpires?: string;
  pwdLastSet?: string;
  distinguishedName?: string;
  avatar?: string;
  lastLogin?: string;
  createdAt?: string;
}

// Интерфейс для уведомлений
interface Notification {
  id: string;
  title: string;
  description: string;
  type: 'info' | 'warning' | 'error' | 'message' | 'request';
  date: string;
  isRead: boolean;
  source?: 'chat' | 'requests';
  link?: string;
}

interface SnowfallProps {
  intensity?: number;
  speed?: number;
  wind?: number;
  color?: string;
  size?: number;
  zIndex?: number;
  className?: string;
}

interface Snowflake {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  sway: number;
  opacity: number;
}

const Snowfall: React.FC<SnowfallProps> = ({
  intensity = 50,
  speed = 1,
  wind = 2,
  color = '#FFFFFF',
  size = 3,
  zIndex = 1,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

  useEffect(() => {
    const newSnowflakes: Snowflake[] = [];
    for (let i = 0; i < intensity; i++) {
      newSnowflakes.push({
        id: i,
        left: Math.random() * 100,
        size: Math.random() * size + 1,
        duration: Math.random() * 10 + 5,
        delay: Math.random() * 5,
        sway: (Math.random() * wind * 2) - wind,
        opacity: Math.random() * 0.5 + 0.3
      });
    }
    setSnowflakes(newSnowflakes);
  }, [intensity, size, wind]);

  const getSnowflakeStyle = (flake: Snowflake): CSSProperties => ({
    left: `${flake.left}%`,
    width: `${flake.size}px`,
    height: `${flake.size}px`,
    background: color,
    opacity: flake.opacity,
    animationDuration: `${flake.duration / speed}s`,
    animationDelay: `${flake.delay}s`,
    ['--sway' as any]: `${flake.sway}px`,
  });

  return (
    <div
      ref={containerRef}
      className={`snowfall-container ${className}`}
      style={{ zIndex }}
      role="presentation"
      aria-hidden="true"
    >
      {snowflakes.map(flake => (
        <div
          key={flake.id}
          className="snowflake"
          style={getSnowflakeStyle(flake)}
          data-testid="snowflake"
        />
      ))}
    </div>
  );
};

const UserAvatar: React.FC<{ userId: string; size?: number; mod?: string }> = ({ userId, size = 50, mod }) => {
  const [avatarsData, setAvatarsData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getAvatarData(userId);
    if (cached) {
      setAvatarsData(cached);
      setLoading(false);
      return;
    }

    const fetchAndCache = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${BASE_URL}/api/users/${userId}/avatar`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Аватар не найден');

        const { avatar } = await res.json();

        setAvatarData(userId, avatar);
        setAvatarsData(avatar);
      } catch (err) {
        console.warn('Не удалось загрузить аватар:', err);
        setAvatarsData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAndCache();
  }, [userId]);

  if (loading) return <div className={`${mod === 'square' ? 'rounded-1' : 'rounded-full'} bg-gray-300 animate-pulse`} style={{ width: size, height: size }} />;

  if (!avatarsData) return <UserIcon className="text-gray-500" style={{ width: size, height: size }} />;

  return <img
    src={avatarsData}
    alt="avatar"
    className={`${mod === 'square' ? 'rounded-1' : 'rounded-2xl'} object-cover`}
    style={{ width: size, height: size }}
  />;
};

const ProfileModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  theme: string;
  userProfile: UserProfile;
  onAvatarUpdate: (newAvatarUrl: string) => void;
  username: string;
}> = ({ isOpen, onClose, theme, userProfile, onAvatarUpdate, username }) => {
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsEditingAvatar(false);
      setAvatarFile(null);
      setAvatarPreview(null);
    }
  }, [isOpen]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите файл изображения');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5MB');
        return;
      }

      setAvatarFile(file);
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
      setIsEditingAvatar(true);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSaveAvatar = async () => {
    if (!avatarFile) return;
    setIsUploading(true);

    try {
      const base64 = await fileToBase64(avatarFile);
      const userId = localStorage.getItem('username') || 'unknown';

      const formData = new FormData();
      formData.append('avatar', avatarFile);
      formData.append('userId', userId);

      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/users/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Сервер не сохранил аватар');

      setAvatarData(userId, base64);

      onAvatarUpdate(base64);
      setIsEditingAvatar(false);
      setAvatarFile(null);
    } catch (error) {
      console.error('Ошибка:', error);
      alert('Не удалось сохранить аватар');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingAvatar(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  function formatBYPhoneNumber(raw: string): string {
    const num = raw.replace(/\D/g, '');
    if (num.startsWith('375') && num.length === 12) {
      return `+375 ${num.slice(3, 5)} ${num.slice(5, 8)}-${num.slice(8, 10)}-${num.slice(10)}`;
    }
    if (num.startsWith('80') && num.length === 11) {
      return `+375 ${num.slice(2, 4)} ${num.slice(4, 7)}-${num.slice(7, 9)}-${num.slice(9)}`;
    }
    return raw;
  }

  const formatADField = (value: string | undefined): string => {
    return value || 'Не указано';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-4xl rounded-3xl shadow-2xl border-2 transform transition-all duration-300 scale-100 ${
          theme === 'dark'
            ? 'bg-gray-900 border-gray-700'
            : 'bg-white border-gray-200'
        }`}
      >
        <div className={`flex items-center justify-between p-6 border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <h2 className={`text-2xl font-bold ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            Профиль пользователя
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-all duration-200 hover:scale-110 ${
              theme === 'dark'
                ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative group">
                <div
                  className={`w-32 h-32 rounded-3xl border-4 overflow-hidden cursor-pointer transition-all duration-300 group-hover:scale-105 ${
                    theme === 'dark' ? 'border-cyan-600' : 'border-blue-400'
                  }`}
                  onClick={handleAvatarClick}
                >
                  <UserAvatar userId={username} size={120} mod='square'/>
                </div>

                <div className="absolute bottom-2 right-2">
                  <button
                    onClick={handleAvatarClick}
                    className={`p-2 rounded-2xl shadow-lg border-2 transition-all duration-300 hover:scale-110 ${
                      theme === 'dark'
                        ? 'bg-gray-800 border-gray-600 text-white hover:bg-gray-700 hover:border-cyan-500'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-blue-400'
                    }`}
                  >
                    <CameraIcon className="h-4 w-4" />
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {isEditingAvatar && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveAvatar}
                    disabled={isUploading}
                    className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 ${
                      isUploading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    {isUploading ? 'Загрузка...' : 'Сохранить'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isUploading}
                    className={`px-4 py-2 rounded-2xl text-sm font-medium border transition-all duration-300 ${
                      theme === 'dark'
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Отмена
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-6">
              <div>
                <h3 className={`text-lg font-semibold mb-4 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Основная информация
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-sm font-medium flex items-center gap-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <UserIcon className="h-4 w-4" />
                      Полное имя
                    </label>
                    <p className={`text-lg font-semibold mt-1 ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      {formatADField(userProfile.full_name)}
                    </p>
                  </div>

                  <div>
                    <label className={`text-sm font-medium flex items-center gap-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <EnvelopeIcon className="h-4 w-4" />
                      Логин
                    </label>
                    <p className={`mt-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {formatADField(userProfile.username)}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className={`text-lg font-semibold mb-4 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Контактная информация
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-sm font-medium flex items-center gap-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <EnvelopeIcon className="h-4 w-4" />
                      Email
                    </label>
                    <p className={`mt-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {formatADField(userProfile.email)}
                    </p>
                  </div>

                  <div>
                    <label className={`text-sm font-medium flex items-center gap-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <PhoneArrowUpRightIcon className="h-4 w-4" />
                      Телефон
                    </label>
                    <p className={`mt-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {formatBYPhoneNumber(formatADField(userProfile.mobile))}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className={`text-lg font-semibold mb-4 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Рабочая информация
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-sm font-medium flex items-center gap-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <BuildingOfficeIcon className="h-4 w-4" />
                      Должность
                    </label>
                    <p className={`mt-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {formatADField(userProfile.title)}
                    </p>
                  </div>

                  <div>
                    <label className={`text-sm font-medium flex items-center gap-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <UsersIcon className="h-4 w-4" />
                      Отдел
                    </label>
                    <p className={`mt-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {formatADField(userProfile.department)}
                    </p>
                  </div>

                  <div>
                    <label className={`text-sm font-medium flex items-center gap-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <BuildingOfficeIcon className="h-4 w-4" />
                      Компания
                    </label>
                    <p className={`mt-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {formatADField(userProfile.company)}
                    </p>
                  </div>

                  <div>
                    <label className={`text-sm font-medium flex items-center gap-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <BuildingOfficeIcon className="h-4 w-4" />
                      Офис
                    </label>
                    <p className={`mt-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {formatADField(userProfile.office)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                <div>
                  <label className={`text-sm font-medium mr-2 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Роль в системе
                  </label>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-2xl text-sm font-medium ${
                    userProfile.role === 'admin'
                      ? theme === 'dark'
                        ? 'bg-red-900 text-red-200 border border-red-700'
                        : 'bg-red-100 text-red-700 border border-red-300'
                      : theme === 'dark'
                      ? 'bg-gray-700 text-gray-300 border border-gray-600'
                      : 'bg-gray-200 text-gray-700 border border-gray-300'
                  }`}>
                    {userProfile.role === 'admin' ? 'Администратор' : 'Пользователь'}
                  </span>
                </div>

                <div>
                  <label className={`text-sm font-medium ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Последний вход
                  </label>
                  <p className={`mt-1 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    {userProfile.lastLogin ? new Date(userProfile.lastLogin).toLocaleString('ru-RU') : 'Неизвестно'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`flex justify-end p-6 border-t ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <button
            onClick={onClose}
            className={`px-6 py-3 rounded-2xl font-medium transition-all duration-300 ${
              theme === 'dark'
                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

const DateTimeWidget: React.FC<{ theme: string; availableServices: number }> = React.memo(({ theme, availableServices }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="relative group z-10">
      <div
        className={`relative p-6 rounded-3xl shadow-2xl border border-white/20 h-full transition-all duration-500 hover:shadow-3xl hover:-translate-y-1 backdrop-blur-xl ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-gray-900/80 via-cyan-900/20 to-gray-800/80 hover:from-cyan-900/30 hover:via-gray-900/40 hover:to-blue-900/30'
            : 'bg-gradient-to-br from-white/60 via-blue-50/50 to-white/40 hover:from-blue-100/60 hover:via-white/50 hover:to-cyan-100/50'
        }`}
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(135deg, rgba(17,24,39,0.8) 0%, rgba(12,74,110,0.2) 50%, rgba(31,41,55,0.8) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(219,234,254,0.5) 50%, rgba(255,255,255,0.4) 100%)'
        }}
      >
        <div className={`absolute inset-0 rounded-3xl bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 transform opacity-20 group-hover:opacity-30 transition-opacity duration-500 ${
          theme === 'dark' ? 'via-cyan-500/10' : 'via-blue-500/10'
        }`} />

        <div className="text-center h-full flex flex-col justify-center space-y-3 relative z-10">
          <div className="space-y-1">
            <div
              className={`text-4xl font-bold font-bold tracking-tight leading-none drop-shadow-lg ${
                theme === 'dark'
                  ? 'text-white bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent'
                  : 'text-gray-900 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent'
              }`}
            >
              {formatTime(currentTime)}
            </div>
          </div>

          <div
            className={`text-sm font-medium leading-tight px-2 ${
              theme === 'dark'
                ? 'text-cyan-100/90'
                : 'text-blue-700/90'
            }`}
          >
            {formatDate(currentTime)}
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <div className={`px-3 py-1.5 rounded-2xl text-xs text-center border border-white/20 backdrop-blur-sm ${
              theme === 'dark'
                ? 'bg-cyan-500/20 text-cyan-100'
                : 'bg-blue-500/20 text-blue-800'
            }`}>
              {availableServices} сервисов доступно
            </div>
            <div className={`px-3 py-1.5 rounded-2xl text-xs text-center border border-white/20 backdrop-blur-sm ${
              theme === 'dark'
                ? 'bg-emerald-500/20 text-emerald-100'
                : 'bg-emerald-500/20 text-emerald-800'
            }`}>
              Все системы активны
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const ServiceCard: React.FC<{ service: typeof services[number]; theme: string }> = React.memo(({ service, theme }) => {
  const role = localStorage.getItem('role') || 'user';
  const isAdmin = role === 'admin';
  const isDisabled = service.isAdminOnly && !isAdmin;
  const isVideoConf = service.title === 'Видеоконференции';
  const isVPNManagement = service.title === 'VPN Управление';

  const handleClick = (e: React.MouseEvent) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }

    if (isVideoConf) {
      window.open(JITSI_URL, '_blank', 'noopener,noreferrer');
    } else if (isVPNManagement) {
      window.open('https://192.1.66.10:943/admin', '_blank', 'noopener,noreferrer');
    }
  };

  const cardContent = (
    <div className="relative group/card h-full">
      <div className="flex items-start mb-4">
        <div
          className={`flex items-center justify-center w-12 h-12 rounded-2xl ${service.color} text-white mr-4 shadow-2xl transition-all duration-300 group-hover/card:scale-110 group-hover/card:shadow-3xl`}
        >
          {service.icon}
        </div>
        <div className="flex-1">
          <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {service.title}
          </h3>
          <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
            {service.description}
          </p>
        </div>
      </div>
      {isDisabled && (
        <div
          className={`text-xs px-3 py-1 rounded-2xl inline-flex items-center gap-1 mt-2 border ${
            theme === 'dark'
              ? 'bg-gray-800 text-gray-300 border-gray-600'
              : 'bg-gray-100 text-gray-600 border-gray-300'
          }`}
        >
          <ShieldCheckIcon className="h-3 w-3" />
          Требуются права администратора
        </div>
      )}
    </div>
  );

  const cardClassName = `relative block p-6 rounded-3xl shadow-2xl transition-all duration-500 border-2 group overflow-hidden ${
    isDisabled
      ? 'opacity-50 cursor-not-allowed'
      : 'cursor-pointer hover:shadow-3xl hover:-translate-y-2'
  } ${
    theme === 'dark'
      ? 'bg-gray-900 border-gray-700 hover:border-cyan-600'
      : 'bg-white border-gray-200 hover:border-blue-400'
  }`;

  if (isVideoConf || isVPNManagement) {
    return (
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (isDisabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick(e as any);
          }
        }}
        className={cardClassName}
        aria-disabled={isDisabled}
        aria-label={`Открыть ${service.title}`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      to={isDisabled ? '#' : service.to}
      className={cardClassName}
      onClick={(e) => isDisabled && e.preventDefault()}
      aria-disabled={isDisabled}
      aria-label={`Перейти к ${service.title}`}
    >
      {cardContent}
    </Link>
  );
});

const NotificationsDropdown: React.FC<{
  notifications: Notification[];
  theme: string;
  onMarkAsRead: (id: string) => void;
}> = ({ notifications, theme, onMarkAsRead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: Notification) => {
    onMarkAsRead(notification.id);

    if (notification.link) {
      navigate(notification.link);
      setIsOpen(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'message':
        return <ChatBubbleOvalLeftEllipsisIcon className="h-4 w-4" />;
      case 'request':
        return <TicketIcon className="h-4 w-4" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      case 'error':
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      default:
        return <BellIcon className="h-4 w-4" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'message':
        return 'bg-blue-500';
      case 'request':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-cyan-500';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-3 rounded-2xl transition-all duration-300 hover:scale-105 border-2 ${
          theme === 'dark'
            ? 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700 hover:border-cyan-600'
            : 'bg-gray-100 border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-200 hover:border-blue-400'
        }`}
      >
        <BellIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full min-w-5 h-5 shadow-lg">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsOpen(false)}
          />

          <div
            className={`absolute right-0 top-full mt-2 w-96 rounded-3xl shadow-2xl z-50 overflow-hidden border-2 ${
              theme === 'dark'
                ? 'bg-gray-900 border-gray-700'
                : 'bg-white border-gray-300'
            } max-h-96 overflow-y-auto`}
          >
            <div className={`p-4 border-b ${
              theme === 'dark' ? 'border-gray-700' : 'border-gray-300'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`text-lg font-semibold flex items-center gap-2 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>
                  <BellIcon className="h-5 w-5" />
                  Уведомления
                  {unreadCount > 0 && (
                    <span className="px-2 py-1 text-xs bg-cyan-500 text-white rounded-full">
                      {unreadCount} новых
                    </span>
                  )}
                </h3>
              </div>
            </div>

            <div className="p-2">
              {notifications.length === 0 ? (
                <div className={`text-center py-8 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  <BellIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Нет новых уведомлений</p>
                </div>
              ) : (
                <>
                  <div className={`px-3 py-2 mb-3 rounded-2xl text-xs ${
                    theme === 'dark'
                      ? 'bg-gray-800 text-gray-300'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span>
                        Показано {notifications.length} уведомлений
                      </span>
                    </div>
                  </div>

                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 mb-2 rounded-2xl duration-300 cursor-pointer border group ${
                        notification.isRead
                          ? theme === 'dark'
                            ? 'bg-gray-800 hover:bg-gray-700 border-gray-600'
                            : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
                          : theme === 'dark'
                            ? 'bg-cyan-900 hover:bg-cyan-800 border-cyan-600'
                            : 'bg-blue-100 hover:bg-blue-200 border-blue-400'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-2xl flex items-center justify-center mt-1 flex-shrink-0 text-white shadow-lg ${getNotificationColor(notification.type)}`}
                        >
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className={`text-sm font-medium ${
                              theme === 'dark' ? 'text-white' : 'text-gray-800'
                            }`}>
                              {notification.title}
                            </h4>
                            <div className="flex items-center gap-2">
                              {!notification.isRead && (
                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-lg" />
                              )}
                              {notification.link && (
                                <div className="text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                  {theme === 'dark' ? 'Перейти →' : 'Перейти →'}
                                </div>
                              )}
                            </div>
                          </div>
                          <p className={`text-sm mb-2 ${
                            theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                          }`}>
                            {notification.description}
                          </p>
                          <p className={`text-xs ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                          }`}>
                            {new Date(notification.date).toLocaleString('ru-RU')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const role = localStorage.getItem('role') || 'user';
  const isAdmin = role === 'admin';
  const username = localStorage.getItem('username') || '';
  const userId = localStorage.getItem('userId') || 'unknown';
  const token = localStorage.getItem('token') || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [greeting, setGreeting] = useState(getGreeting());
  const [userAvatar, setUserAvatar] = useState<string | null>(localStorage.getItem(`avatar:${username}`));
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!username) return;

      setIsLoadingProfile(true);
      try {
        const response = await fetch(`${BASE_URL}/api/user/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const userData = await response.json();
          console.log('userData:', userData)
          setUserProfile(userData);
        } else {
          console.warn('Не удалось загрузить профиль пользователя из AD');
          setUserProfile({
            id: userId,
            username: username,
            full_name: localStorage.getItem('full_name') || username,
            email: localStorage.getItem('email') || `${username}@mhp.net`,
            role: role,
            department: localStorage.getItem('department') || 'Не указан',
            title: localStorage.getItem('title') || 'Не указана',
            phone: localStorage.getItem('phone') || 'Не указан',
            avatar: userAvatar || undefined,
            lastLogin: localStorage.getItem('lastLogin') || new Date().toISOString(),
            createdAt: localStorage.getItem('createdAt') || new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Ошибка при загрузке профиля:', error);
        setUserProfile({
          id: userId,
          username: username,
          full_name: localStorage.getItem('full_name') || username,
          email: localStorage.getItem('email') || `${username}@mhp.net`,
          role: role,
          department: localStorage.getItem('department') || 'Не указан',
          title: localStorage.getItem('title') || 'Не указана',
          phone: localStorage.getItem('phone') || 'Не указан',
          avatar: userAvatar || undefined,
          lastLogin: localStorage.getItem('lastLogin') || new Date().toISOString(),
          createdAt: localStorage.getItem('createdAt') || new Date().toISOString(),
        });
      } finally {
        setIsLoadingProfile(false);
      }
    };

    if (isProfileModalOpen) {
      fetchUserProfile();
    }
  }, [isProfileModalOpen, username, token, userId, role, userAvatar]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const filteredServices = useMemo(() => {
    return services
      .filter(({ isAdminOnly }) => !isAdminOnly || isAdmin)
      .filter(
        (service) =>
          service.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          service.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [searchQuery, isAdmin]);

  const fetchUnreadMessages = async () => {
    try {
      const response = await fetch(`${BASE_URL}/chat/unread/total`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const unreadCount = data.total_unread || 0;
      setUnreadMessages(unreadCount);

      if (unreadCount > 0) {
        const messageNotification: Notification = {
          id: `messages-${Date.now()}`,
          title: 'Новые сообщения',
          description: `У вас ${unreadCount} непрочитанных сообщений`,
          type: 'message',
          date: new Date().toISOString(),
          isRead: false,
          source: 'chat',
          link: '/chat'
        };

        setNotifications(prev => {
          const filtered = prev.filter(n => n.source !== 'chat');
          return [messageNotification, ...filtered];
        });
      } else {
        setNotifications(prev => prev.filter(n => n.source !== 'chat'));
      }
    } catch (error) {
      console.error('Error fetching unread messages:', error);
    }
  };

  const checkServerAvailability = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      console.error('Server health check failed:', error);
      return false;
    }
  };

  const getWebSocketUrl = (): string => {
    if (BASE_URL) {
      return BASE_URL.replace('http', 'ws') + '/chat/ws?token=' + encodeURIComponent(token);
    }

    return `ws://${window.location.hostname}:8000/chat/ws?token=${encodeURIComponent(token)}`;
  };

  useEffect(() => {
    let websocket: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    const reconnectDelay = 3000;
    let reconnectTimeout: NodeJS.Timeout;
    let pollingInterval: NodeJS.Timeout;

    const connectWebSocket = async () => {
      const isServerAvailable = await checkServerAvailability();
      if (!isServerAvailable) {
        console.warn('❌ Server is not available, skipping WebSocket connection');
        setWsConnectionStatus('error');
        return;
      }

      if (websocket) {
        websocket.close(1000, 'Reconnecting');
      }

      setWsConnectionStatus('connecting');

      const wsUrl = getWebSocketUrl();
      console.log('🔄 Connecting to WebSocket:', wsUrl);

      try {
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
          console.log('✅ WebSocket connected successfully');
          reconnectAttempts = 0;
          setWsConnectionStatus('connected');
        };

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📨 WebSocket message received:', data);

            if (data.type === 'notification') {
              setNotifications((prev) => [...prev, data.data]);
            }
            if (data.type === 'user_status' || data.type === 'new_message') {
              fetchUnreadMessages();
            }
          } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error);
          }
        };

        websocket.onclose = (event) => {
          console.log('🔴 WebSocket disconnected:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });

          setWsConnectionStatus('disconnected');

          const fatalCodes = [1000, 1001, 1002, 1003, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 4001, 4003, 4004];
          if (fatalCodes.includes(event.code) || event.wasClean) {
            console.log('ℹ️  WebSocket closed cleanly, not reconnecting');
            setWsConnectionStatus('error');
            return;
          }

          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = reconnectDelay * Math.pow(1.5, reconnectAttempts);
            console.log(`🔄 Reconnecting in ${delay}ms, attempt ${reconnectAttempts + 1}/${maxReconnectAttempts}`);

            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              connectWebSocket();
            }, delay);
          } else {
            console.error('❌ Max reconnection attempts reached');
            setWsConnectionStatus('error');
          }
        };

        websocket.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setWsConnectionStatus('error');
        };

        setWs(websocket);
      } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        setWsConnectionStatus('error');
      }
    };

    const disconnectWebSocket = () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      if (websocket) {
        websocket.close(1000, 'Component unmounting');
        websocket = null;
      }
    };

    const startPolling = () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      pollingInterval = setInterval(() => {
        if (token) {
          fetchUnreadMessages();
        }
      }, 30000);
    };

    if (token && token.length > 10) {
      console.log('🟡 Starting WebSocket connection');
      connectWebSocket();
      fetchUnreadMessages();

      startPolling();
    } else {
      console.warn('🟡 No valid token for WebSocket connection');
      setWsConnectionStatus('error');
      startPolling();
    }

    return () => {
      console.log('🟡 Cleaning up WebSocket connection');
      disconnectWebSocket();
    };
  }, [token]);

  const handleAvatarUpdate = (newAvatarUrl: string) => {
    setUserAvatar(newAvatarUrl);
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        avatar: newAvatarUrl
      });
    }
  };

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, isRead: true } : notification
      )
    );
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    localStorage.removeItem('theme');
    localStorage.removeItem('userAvatar');
    localStorage.removeItem('full_name');
    localStorage.removeItem('email');
    localStorage.removeItem('department');
    localStorage.removeItem('position');
    localStorage.removeItem('phone');
    localStorage.removeItem('lastLogin');
    localStorage.removeItem('createdAt');
    window.location.href = '/';
  };

  const displayName = userProfile?.full_name || username;

  return (
    <div
      className={`min-h-screen transition-colors duration-500 ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white'
          : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50 text-gray-800'
      } py-6 px-4 relative hide-scrollbar`} style={{ overflow: 'hidden' }}
    >
      <Snowfall />
      <div className="max-w-7xl mx-auto relative z-10 hide-scrollbar" style={{ overflow: 'hidden' }}>
        <header
          className={`flex justify-between items-center mb-8 p-6 rounded-3xl shadow-2xl border-2 transition-all duration-500 ${
            theme === 'dark'
              ? 'bg-gray-900 border-gray-700 hover:border-cyan-600'
              : 'bg-white border-gray-200 hover:border-blue-400'
          }`}
        >
          <div className="flex items-center">
            <div className="relative">
              <img src={`${BASE_URL}/chat-fonts/santa.png`} className='w-10 absolute -top-3 -left-4'/>
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mr-4 shadow-2xl ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-700 border border-gray-600'
                    : 'bg-gradient-to-r from-cyan-500 to-indigo-600 border border-gray-300'
                }`}
              >
                <span className="font-bold text-xl text-white">КП</span>
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-indigo-600 bg-clip-text text-transparent">
                Корпоративный Портал
              </h1>
              <p className={`text-sm mt-1 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Все сервисы в одном месте
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <MagnifyingGlassIcon
                className={`absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                }`}
              />
              <input
                type="text"
                placeholder="Поиск сервисов..."
                className={`pl-12 pr-4 py-3 border-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent transition-all duration-300 ${
                  theme === 'dark'
                    ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-300 hover:bg-gray-700 hover:border-cyan-600'
                    : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500 hover:bg-gray-50 hover:border-blue-400'
                }`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <button
              onClick={toggleTheme}
              className={`p-3 rounded-2xl transition-all duration-300 hover:scale-105 border-2 ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-600 text-yellow-300 hover:bg-gray-700 hover:border-yellow-500'
                  : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200 hover:border-yellow-500'
              }`}
              title={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
            >
              {theme === 'dark' ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
            </button>

            <NotificationsDropdown
              notifications={notifications}
              theme={theme}
              onMarkAsRead={handleMarkAsRead}
            />

            <div className="relative">
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className={`flex items-center space-x-4 rounded-2xl py-2 px-4 border-2 transition-all duration-300 hover:scale-105 ${
                  theme === 'dark'
                    ? 'bg-gray-800 border-gray-600 hover:border-cyan-600'
                    : 'bg-gray-100 border-gray-300 hover:border-blue-400'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden ${
                    theme === 'dark'
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-700 border border-gray-600'
                      : 'bg-gradient-to-r from-cyan-500 to-indigo-600 border border-gray-300'
                  }`}
                >
                  <UserAvatar userId={username}/>
                </div>
                <div className="hidden md:block">
                  <p className="text-sm text-left font-medium">{displayName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-1 rounded-2xl border ${
                        isAdmin
                          ? theme === 'dark'
                            ? 'bg-red-900 text-red-200 border-red-700'
                            : 'bg-red-100 text-red-700 border-red-300'
                          : theme === 'dark'
                          ? 'bg-gray-700 text-gray-300 border-gray-600'
                          : 'bg-gray-200 text-gray-700 border-gray-300'
                      }`}
                    >
                      {role === 'admin' ? 'Администратор' : 'Пользователь'}
                    </span>
                  </div>
                </div>
              </button>
            </div>

            <button
              onClick={handleLogout}
              className={`p-3 rounded-2xl transition-all duration-300 hover:scale-105 border-2 ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-600 text-gray-300 hover:text-red-400 hover:bg-gray-700 hover:border-red-500'
                  : 'bg-gray-100 border-gray-300 text-gray-500 hover:text-red-500 hover:bg-gray-200 hover:border-red-400'
              }`}
              title="Выйти"
            >
              <ArrowRightOnRectangleIcon className="h-6 w-6" />
            </button>
          </div>
        </header>

        <main>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <div
                className={`rounded-3xl p-6 shadow-2xl border-2 transition-all duration-500 hover:shadow-3xl ${
                  theme === 'dark'
                    ? 'bg-gray-900 border-gray-700 hover:border-cyan-600'
                    : 'bg-white border-gray-200 hover:border-blue-400'
                }`}
              >
                <h2
                  className={`text-4xl font-bold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  {greeting}, {displayName}!
                </h2>
                <p className={`text-base ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  Все корпоративные сервисы в одном месте для эффективной работы
                </p>
              </div>
            </div>

            <div className="lg:col-span-1">
              <DateTimeWidget theme={theme} availableServices={filteredServices.length} />
            </div>
          </div>

          {filteredServices.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredServices.map((service) => (
                <ServiceCard
                  key={service.title}
                  service={service}
                  theme={theme}
                />
              ))}
            </div>
          ) : (
            <div
              className={`rounded-3xl p-12 text-center shadow-2xl border-2 ${
                theme === 'dark'
                  ? 'bg-gray-900 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex justify-center mb-6">
                <div
                  className={`p-6 rounded-3xl border ${
                    theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'
                  }`}
                >
                  <MagnifyingGlassIcon className="h-16 w-16 mx-auto text-gray-400" />
                </div>
              </div>
              <h3 className={`text-xl font-medium mb-3 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>Сервисы не найдены</h3>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>
                Попробуйте изменить поисковый запрос
              </p>
            </div>
          )}
        </main>

        <footer
          className={`mt-8 pt-4 border-t text-center text-sm rounded-3xl p-3 border-2 ${
            theme === 'dark'
              ? 'border-gray-700 text-gray-300 bg-gray-800'
              : 'border-gray-300 text-gray-600 bg-gray-100'
          }`}
        >
          <div className="flex items-center justify-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse shadow-lg ${
                wsConnectionStatus === 'connected' ? 'bg-green-500' :
                wsConnectionStatus === 'connecting' ? 'bg-yellow-500' :
                'bg-red-500'
              }`} />
              <span>
                {wsConnectionStatus === 'connected' ? 'Сервис доступен' :
                 wsConnectionStatus === 'connecting' ? 'Подключение...' :
                 'Сервис временно недоступен'}
              </span>
            </div>
            <div className="w-px h-4 bg-current opacity-30" />
            <div>Версия 2.0</div>
            <div className="w-px h-4 bg-current opacity-30" />
            <button
              onClick={() => setIsSupportModalOpen(true)}
              className={`text-sm transition-all duration-200 hover:scale-105 ${
                theme === 'dark'
                  ? 'text-cyan-400 hover:text-cyan-300'
                  : 'text-cyan-600 hover:text-cyan-500'
              }`}
            >
              Поддержка
            </button>
          </div>
          <p className="text-gray-400">© 2025 Все права защищены. Разработка портала ТЭРиОВТ</p>
        </footer>
      </div>

      <SupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        theme={theme}
      />

      {userProfile && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          theme={theme}
          userProfile={userProfile}
          onAvatarUpdate={handleAvatarUpdate}
          username={username}
        />
      )}
    </div>
  );
};