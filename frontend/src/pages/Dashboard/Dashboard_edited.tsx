import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GridLayout from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
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
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  CameraIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
  PhoneArrowUpRightIcon,
  SparklesIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
  CloudIcon,
  MapPinIcon,
  LockClosedIcon,
  LockOpenIcon,
  ArrowPathIcon,
  Bars3Icon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '../../hooks/ThemeContext';
import { SupportModal } from '../../components/SupportModal';
import { getAvatarData, setAvatarData } from '../../utils/avatarCache';
import "./Dashboard.css";

// ==================== CONSTANTS ====================
const JITSI_URL = import.meta.env.VITE_API_JITSI_URL;
const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY || '';
const DEFAULT_CITY = 'Minsk';
const LAYOUT_STORAGE_KEY = 'dashboard_unified_layout_v2';

// ==================== UTILITY FUNCTIONS ====================
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

const getGreetingEmoji = (): string => {
  const currentHour = new Date().getHours();

  if (currentHour >= 5 && currentHour < 12) {
    return '☀️';
  } else if (currentHour >= 12 && currentHour < 18) {
    return '🌤️';
  } else if (currentHour >= 18 && currentHour < 23) {
    return '🌆';
  } else {
    return '🌙';
  }
};

// ==================== WIDGET TYPES & DATA ====================
interface BaseWidgetData {
  id: string;
  type: 'welcome' | 'clock-weather' | 'service';
  title: string;
  iconName: string;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
}

interface ServiceWidgetData extends BaseWidgetData {
  type: 'service';
  serviceId: string;
}

// Icon mapping
const ICON_MAP: Record<string, React.ReactNode> = {
  'SparklesIcon': <SparklesIcon className="h-4 w-4" />,
  'ClockIcon': <ClockIcon className="h-4 w-4" />,
  'ChatBubbleOvalLeftEllipsisIcon': <ChatBubbleOvalLeftEllipsisIcon className="h-4 w-4" />,
  'TicketIcon': <TicketIcon className="h-4 w-4" />,
  'PhoneIcon': <PhoneIcon className="h-4 w-4" />,
  'VideoCameraIcon': <VideoCameraIcon className="h-4 w-4" />,
  'ComputerDesktopIcon': <ComputerDesktopIcon className="h-4 w-4" />,
  'PencilSquareIcon': <PencilSquareIcon className="h-4 w-4" />,
  'ShieldCheckIcon': <ShieldCheckIcon className="h-4 w-4" />,
  'DocumentTextIcon': <DocumentTextIcon className="h-4 w-4" />,
  'ChartBarIcon': <ChartBarIcon className="h-4 w-4" />,
  'GlobeAltIcon': <GlobeAltIcon className="h-4 w-4" />,
  'QuestionMarkCircleIcon': <QuestionMarkCircleIcon className="h-4 w-4" />,
  'UsersIcon': <UsersIcon className="h-4 w-4" />,
  'Cog6ToothIcon': <Cog6ToothIcon className="h-4 w-4" />,
};

// All available widgets data (without React elements)
const ALL_WIDGETS_DATA: (BaseWidgetData | ServiceWidgetData)[] = [
  {
    id: 'welcome',
    type: 'welcome',
    title: 'Приветствие',
    iconName: 'SparklesIcon',
    minW: 4,
    minH: 2,
    maxH: 3,
    maxW: 3
  },
  {
    id: 'clock-weather',
    type: 'clock-weather',
    title: 'Время и погода',
    iconName: 'ClockIcon',
    minW: 3,
    minH: 2,
    maxH: 3,
    maxW: 3
  }
];

// Available services data
const ALL_SERVICES = [
  { 
    id: 'chat',
    title: 'Чат', 
    description: 'Общайтесь с коллегами в реальном времени', 
    to: '/chat', 
    icon: <ChatBubbleOvalLeftEllipsisIcon className="h-6 w-6" />, 
    color: 'from-emerald-400 to-cyan-500', 
    shadowColor: 'shadow-emerald-500/25' 
  },
  { 
    id: 'support',
    title: 'Служба поддержки', 
    description: 'Создавайте и отслеживайте заявки', 
    to: '/requests_list', 
    icon: <TicketIcon className="h-6 w-6" />, 
    color: 'from-violet-400 to-purple-500', 
    shadowColor: 'shadow-violet-500/25' 
  },
  { 
    id: 'contacts',
    title: 'Контакты', 
    description: 'Поиск сотрудников компании', 
    to: '/contacts', 
    icon: <PhoneIcon className="h-6 w-6" />, 
    color: 'from-blue-400 to-indigo-500', 
    shadowColor: 'shadow-blue-500/25' 
  },
  { 
    id: 'videoconf',
    title: 'Видеоконференции', 
    description: 'Онлайн-встречи и совещания', 
    to: '/jitsi', 
    icon: <VideoCameraIcon className="h-6 w-6" />, 
    color: 'from-rose-400 to-pink-500', 
    shadowColor: 'shadow-rose-500/25' 
  },
  { 
    id: 'remote',
    title: 'Удалённый доступ', 
    description: 'Управление компьютерами', 
    to: '/remote-desktop', 
    icon: <ComputerDesktopIcon className="h-6 w-6" />, 
    color: 'from-cyan-400 to-blue-500', 
    shadowColor: 'shadow-cyan-500/25' 
  },
  { 
    id: 'edit-contacts',
    title: 'Редактирование контактов', 
    description: 'Управление Active Directory', 
    to: '/edit-contacts', 
    icon: <PencilSquareIcon className="h-6 w-6" />, 
    color: 'from-amber-400 to-orange-500', 
    shadowColor: 'shadow-amber-500/25', 
    isAdminOnly: true 
  },
  { 
    id: 'admin',
    title: 'Админ-панель', 
    description: 'Управление системой', 
    to: '/admin', 
    icon: <ShieldCheckIcon className="h-6 w-6" />, 
    color: 'from-slate-400 to-gray-600', 
    shadowColor: 'shadow-slate-500/25', 
    isAdminOnly: true 
  },
  { 
    id: 'docs',
    title: 'Документы', 
    description: 'Внутренние документы и инструкции', 
    to: '/docs', 
    icon: <DocumentTextIcon className="h-6 w-6" />, 
    color: 'from-teal-400 to-emerald-500', 
    shadowColor: 'shadow-teal-500/25' 
  },
  { 
    id: 'serverstats',
    title: 'Статистика серверов', 
    description: 'Мониторинг серверов', 
    to: '/serverstats', 
    icon: <ChartBarIcon className="h-6 w-6" />, 
    color: 'from-indigo-400 to-blue-600', 
    shadowColor: 'shadow-indigo-500/25', 
    isAdminOnly: true 
  },
  { 
    id: 'vpn',
    title: 'VPN Управление', 
    description: 'Профили OpenVPN', 
    to: '/VPNManagement', 
    icon: <GlobeAltIcon className="h-6 w-6" />, 
    color: 'from-fuchsia-400 to-purple-600', 
    shadowColor: 'shadow-fuchsia-500/25', 
    isAdminOnly: true 
  },
  { 
    id: 'faq',
    title: 'FAQ', 
    description: 'Ответы на частые вопросы', 
    to: '/faq', 
    icon: <QuestionMarkCircleIcon className="h-6 w-6" />, 
    color: 'from-yellow-400 to-amber-500', 
    shadowColor: 'shadow-yellow-500/25' 
  },
  { 
    id: 'employeetracker',
    title: 'Статистика персонала', 
    description: 'Аналитика сотрудников', 
    to: '/EmployeeTrackerApp', 
    icon: <UsersIcon className="h-6 w-6" />, 
    color: 'from-lime-400 to-green-500', 
    shadowColor: 'shadow-lime-500/25', 
    isAdminOnly: true 
  },
  { 
    id: 'software',
    title: 'Программное обеспечение', 
    description: 'Корпоративное ПО', 
    to: '/software', 
    icon: <Cog6ToothIcon className="h-6 w-6" />, 
    color: 'from-purple-400 to-indigo-600', 
    shadowColor: 'shadow-purple-500/25' 
  },
];

// Service icon name mapping
const SERVICE_ICON_MAP: Record<string, string> = {
  'chat': 'ChatBubbleOvalLeftEllipsisIcon',
  'support': 'TicketIcon',
  'contacts': 'PhoneIcon',
  'videoconf': 'VideoCameraIcon',
  'remote': 'ComputerDesktopIcon',
  'edit-contacts': 'PencilSquareIcon',
  'admin': 'ShieldCheckIcon',
  'docs': 'DocumentTextIcon',
  'serverstats': 'ChartBarIcon',
  'vpn': 'GlobeAltIcon',
  'faq': 'QuestionMarkCircleIcon',
  'employeetracker': 'UsersIcon',
  'software': 'Cog6ToothIcon',
};

// ==================== INTERFACES ====================
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

interface WeatherData {
  temp: number;
  feels_like: number;
  description: string;
  icon: string;
  city: string;
  humidity: number;
  wind_speed: number;
  pressure: number;
}

// ==================== SNOWFALL COMPONENT ====================
const Snowfall: React.FC<{
  intensity?: number;
  speed?: number;
  wind?: number;
  color?: string;
  size?: number;
  zIndex?: number;
  className?: string;
}> = ({
  intensity = 40,
  speed = 1,
  wind = 2,
  color = '#FFFFFF',
  size = 4,
  zIndex = 1,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [snowflakes, setSnowflakes] = useState<Array<{
    id: number;
    left: number;
    size: number;
    duration: number;
    delay: number;
    sway: number;
    opacity: number;
  }>>([]);

  useEffect(() => {
    const newSnowflakes = [];
    for (let i = 0; i < intensity; i++) {
      newSnowflakes.push({
        id: i,
        left: Math.random() * 100,
        size: Math.random() * size + 1,
        duration: Math.random() * 10 + 8,
        delay: Math.random() * 5,
        sway: (Math.random() * wind * 2) - wind,
        opacity: Math.random() * 0.6 + 0.2
      });
    }
    setSnowflakes(newSnowflakes);
  }, [intensity, size, wind]);

  return (
    <div
      ref={containerRef}
      className={`snowfall-container ${className}`}
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        pointerEvents: 'none',
        zIndex,
        overflow: 'hidden'
      }}
      role="presentation"
      aria-hidden="true"
    >
      {snowflakes.map(flake => (
        <div
          key={flake.id}
          className="snowflake"
          style={{
            position: 'absolute',
            left: `${flake.left}%`,
            top: '-20px',
            width: `${flake.size}px`,
            height: `${flake.size}px`,
            background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
            opacity: flake.opacity,
            borderRadius: '50%',
            animation: `fall ${flake.duration / speed}s linear ${flake.delay}s infinite, sway ${(flake.duration / 2) / speed}s ease-in-out ${flake.delay}s infinite alternate`,
            transform: `translateX(${flake.sway * 20}px)`
          }}
        />
      ))}
    </div>
  );
};

// ==================== ANIMATED BACKGROUND COMPONENT ====================
const AnimatedBackground: React.FC<{ theme: string }> = ({ theme }) => {
  return (
    <div className="animated-bg" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      pointerEvents: 'none',
      overflow: 'hidden'
    }}>
      <div className={`absolute inset-0 transition-opacity duration-1000 ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 opacity-100' 
          : 'bg-gradient-to-br from-blue-50 via-gray-50 to-indigo-50 opacity-50'
      }`} />
    </div>
  );
};

// ==================== FLOATING PARTICLES COMPONENT ====================
const FloatingParticles: React.FC = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 15,
      duration: 15 + Math.random() * 10,
      size: 2 + Math.random() * 4,
    }));
  }, []);

  return (
    <div className="particles" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 1,
      pointerEvents: 'none',
      overflow: 'hidden'
    }}>
      {particles.map(p => (
        <div
          key={p.id}
          className="particle"
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '-20px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: 'radial-gradient(circle, rgba(120, 119, 198, 0.3) 0%, transparent 70%)',
            borderRadius: '50%',
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
};

// ==================== WEATHER DATA HOOK ====================
const useWeather = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeatherData = useCallback(async () => {
    try {
      if (navigator.geolocation && WEATHER_API_KEY) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            await fetchWeatherByCoords(latitude, longitude);
          },
          async () => {
            await fetchWeatherByCity(DEFAULT_CITY);
          }
        );
      } else if (WEATHER_API_KEY) {
        await fetchWeatherByCity(DEFAULT_CITY);
      } else {
        // Mock data for development
        setWeather({
          temp: -5,
          feels_like: -9,
          description: 'Снег',
          icon: '13d',
          city: 'Минск',
          humidity: 85,
          wind_speed: 3.5,
          pressure: 1015
        });
        setLoading(false);
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError('Не удалось загрузить погоду');
      setLoading(false);
    }
  }, []);

  const fetchWeatherByCoords = async (lat: number, lon: number) => {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=ru&appid=${WEATHER_API_KEY}`
      );
      if (!response.ok) throw new Error('Weather API error');
      const data = await response.json();
      setWeather({
        temp: Math.round(data.main.temp),
        feels_like: Math.round(data.main.feels_like),
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        city: data.name,
        humidity: data.main.humidity,
        wind_speed: data.wind.speed,
        pressure: data.main.pressure
      });
    } catch (err) {
      setError('Ошибка загрузки погоды');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeatherByCity = async (city: string) => {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=ru&appid=${WEATHER_API_KEY}`
      );
      if (!response.ok) throw new Error('Weather API error');
      const data = await response.json();
      setWeather({
        temp: Math.round(data.main.temp),
        feels_like: Math.round(data.main.feels_like),
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        city: data.name,
        humidity: data.main.humidity,
        wind_speed: data.wind.speed,
        pressure: data.main.pressure
      });
    } catch (err) {
      setError('Ошибка загрузки погоды');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherData();
    const interval = setInterval(fetchWeatherData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeatherData]);

  const getWeatherEmoji = (icon: string): string => {
    const iconMap: Record<string, string> = {
      '01d': '☀️', '01n': '🌙',
      '02d': '⛅', '02n': '☁️',
      '03d': '☁️', '03n': '☁️',
      '04d': '☁️', '04n': '☁️',
      '09d': '🌧️', '09n': '🌧️',
      '10d': '🌦️', '10n': '🌧️',
      '11d': '⛈️', '11n': '⛈️',
      '13d': '❄️', '13n': '❄️',
      '50d': '🌫️', '50n': '🌫️',
    };
    return iconMap[icon] || '🌡️';
  };

  return { weather, loading, error, getWeatherEmoji };
};

// ==================== USER AVATAR COMPONENT ====================
const UserAvatar: React.FC<{ userId: string; size?: number; mod?: string; className?: string }> = ({ 
  userId, 
  size = 50, 
  mod,
  className = ''
}) => {
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

  if (loading) {
    return (
      <div 
        className={`animate-pulse ${mod === 'square' ? 'rounded-2xl' : 'rounded-full'} bg-gray-300 dark:bg-gray-700 ${className}`} 
        style={{ width: size, height: size }} 
      />
    );
  }

  if (!avatarsData) {
    return (
      <div 
        className={`${mod === 'square' ? 'rounded-2xl' : 'rounded-full'} bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <UserIcon className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} />
      </div>
    );
  }

  return (
    <img
      src={avatarsData}
      alt="avatar"
      className={`${mod === 'square' ? 'rounded-2xl' : 'rounded-full'} object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

// ==================== PROFILE MODAL COMPONENT ====================
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
      setAvatarPreview(null);
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      <div
        className={`modal-content relative w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden ${
          theme === 'dark'
            ? 'bg-gray-900/95 border border-white/10'
            : 'bg-white/95 border border-gray-200'
        }`}
      >
        {/* Header with gradient */}
        <div className={`relative px-8 py-6 ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-fuchsia-600/20'
            : 'bg-gradient-to-r from-violet-100 via-purple-100 to-fuchsia-100'
        }`}>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${theme === 'dark' ? 'bg-white/10' : 'bg-white/50'}`}>
                <UserIcon className={`h-6 w-6 ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`} />
              </div>
              <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Профиль пользователя
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all duration-200 hover:scale-110 ${
                theme === 'dark'
                  ? 'text-white/70 hover:text-white hover:bg-white/10'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Avatar Section */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative group">
                <div className="avatar-ring rounded-3xl p-1">
                  <div
                    className={`w-36 h-36 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group-hover:scale-105 ${
                      theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                    }`}
                    onClick={handleAvatarClick}
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <UserAvatar userId={username} size={144} mod='square'/>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleAvatarClick}
                  className={`absolute -bottom-2 -right-2 p-3 rounded-xl shadow-lg transition-all duration-300 hover:scale-110 ${
                    theme === 'dark'
                      ? 'bg-violet-600 text-white hover:bg-violet-500'
                      : 'bg-violet-500 text-white hover:bg-violet-600'
                  }`}
                >
                  <CameraIcon className="h-5 w-5" />
                </button>

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
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                      isUploading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-lg shadow-emerald-500/25'
                    }`}
                  >
                    {isUploading ? 'Загрузка...' : 'Сохранить'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isUploading}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                      theme === 'dark'
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Отмена
                  </button>
                </div>
              )}

              {/* Role Badge */}
              <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                userProfile.role === 'admin'
                  ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-500/25'
                  : theme === 'dark'
                  ? 'bg-white/10 text-gray-300'
                  : 'bg-gray-200 text-gray-700'
              }`}>
                {userProfile.role === 'admin' ? '👑 Администратор' : '👤 Пользователь'}
              </div>
            </div>

            {/* Info Section */}
            <div className="flex-1 space-y-6">
              {/* Basic Info */}
              <div className={`p-5 rounded-2xl ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  <UserIcon className="h-4 w-4" />
                  Основная информация
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Полное имя
                    </label>
                    <p className={`text-lg font-semibold mt-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {formatADField(userProfile.full_name)}
                    </p>
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Логин
                    </label>
                    <p className={`text-lg font-mono mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatADField(userProfile.username)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className={`p-5 rounded-2xl ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  <EnvelopeIcon className="h-4 w-4" />
                  Контакты
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Email
                    </label>
                    <p className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatADField(userProfile.email)}
                    </p>
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Телефон
                    </label>
                    <p className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatBYPhoneNumber(formatADField(userProfile.mobile))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Work Info */}
              <div className={`p-5 rounded-2xl ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  <BuildingOfficeIcon className="h-4 w-4" />
                  Рабочая информация
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Должность
                    </label>
                    <p className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatADField(userProfile.title)}
                    </p>
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Отдел
                    </label>
                    <p className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatADField(userProfile.department)}
                    </p>
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Компания
                    </label>
                    <p className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatADField(userProfile.company)}
                    </p>
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Офис
                    </label>
                    <p className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatADField(userProfile.office)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Last Login */}
              <div className={`flex items-center justify-between p-4 rounded-xl ${
                theme === 'dark' ? 'bg-white/5' : 'bg-gray-50'
              }`}>
                <div className="flex items-center gap-3">
                  <ClockIcon className={`h-5 w-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
                  <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    Последний вход
                  </span>
                </div>
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  {userProfile.lastLogin ? new Date(userProfile.lastLogin).toLocaleString('ru-RU') : 'Неизвестно'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-8 py-4 border-t ${
          theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-300 hover:scale-105"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== CLOCK & WEATHER WIDGET ====================
const ClockWeatherWidget: React.FC<{ theme: string }> = ({ theme }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { weather, loading, error, getWeatherEmoji } = useWeather();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <div className="h-full flex flex-col justify-center">
      {/* Clock Section */}
      <div className="mb-6">
        <div className={`time-display text-4xl font-bold tracking-tight mb-1 ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-transparent'
            : 'bg-gradient-to-r from-gray-900 via-violet-700 to-indigo-700 bg-clip-text text-transparent'
        }`}>
          {formatTime(currentTime)}
        </div>
        <p className={`text-sm font-medium capitalize ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          {formatDate(currentTime)}
        </p>
      </div>

      {/* Weather Section */}
      <div className={`pt-4 border-t ${theme === 'dark' ? 'border-white/10' : 'border-gray-200'}`}>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-pulse w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700" />
          </div>
        ) : error || !weather ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <CloudIcon className={`h-6 w-6 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
            <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Погода недоступна
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="weather-icon text-3xl">
                {getWeatherEmoji(weather.icon)}
              </div>
              <div>
                <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {weather.temp}°C
                </div>
                <p className={`text-xs capitalize ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {weather.description}
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <div className={`flex items-center gap-1 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                <MapPinIcon className="h-3 w-3" />
                {weather.city}
              </div>
              <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                Ощущается: {weather.feels_like}°C
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== WELCOME WIDGET ====================
const WelcomeWidget: React.FC<{ 
  theme: string; 
  displayName: string; 
  greeting: string;
}> = ({ theme, displayName, greeting }) => {
  return (
    <div className="h-full flex flex-col justify-center">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-3xl">{getGreetingEmoji()}</span>
        <span className={`text-sm font-medium px-3 py-1 rounded-full ${
          theme === 'dark'
            ? 'bg-white/10 text-gray-300'
            : 'bg-gray-100 text-gray-600'
        }`}>
          {new Date().toLocaleDateString('ru-RU', { weekday: 'long' })}
        </span>
      </div>
      
      <h1 className={`text-3xl font-bold mb-2 ${
        theme === 'dark'
          ? 'text-white'
          : 'text-gray-900'
      }`}>
        {greeting}, <span className="gradient-text">{displayName}</span>!
      </h1>
      
      <p className={`text-base ${
        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
      }`}>
        Добро пожаловать в корпоративный портал. Все сервисы доступны для работы.
      </p>
    </div>
  );
};

// ==================== SERVICE WIDGET ====================
const ServiceWidget: React.FC<{ 
  serviceId: string;
  theme: string;
  isEditMode: boolean;
}> = ({ serviceId, theme, isEditMode }) => {
  const service = ALL_SERVICES.find(s => s.id === serviceId);
  const role = localStorage.getItem('role') || 'user';
  const isAdmin = role === 'admin';
  
  if (!service) return null;

  const isDisabled = service.isAdminOnly && !isAdmin;
  const isVideoConf = service.title === 'Видеоконференции';
  const isVPNManagement = service.title === 'VPN Управление';

  const handleClick = (e: React.MouseEvent) => {
    if (isDisabled || isEditMode) {
      e.preventDefault();
      return;
    }

    if (isVideoConf) {
      e.preventDefault();
      window.open(JITSI_URL, '_blank', 'noopener,noreferrer');
    } else if (isVPNManagement) {
      e.preventDefault();
      window.open('https://192.1.66.10:943/admin', '_blank', 'noopener,noreferrer');
    }
  };

  const cardContent = (
    <div className="h-full flex flex-col">
      <div className={`absolute inset-0 bg-gradient-to-br ${service.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500 rounded-2xl`} />
      
      <div className="flex-1 flex flex-col">
        <div className="flex items-start gap-3 mb-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center text-white shadow-lg ${service.shadowColor}`}>
            {service.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-lg font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {service.title}
            </h3>
            <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {service.description}
            </p>
          </div>
        </div>
        
        {isDisabled && (
          <div className="mt-2 flex items-center gap-1">
            <ShieldCheckIcon className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
            <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
              Только для администраторов
            </span>
          </div>
        )}

        {!isDisabled && !isEditMode && (
          <div className="mt-auto pt-4 border-t border-white/10">
            <div className={`flex items-center justify-between ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              <span className="text-sm">Перейти к сервису</span>
              <ArrowTrendingUpIcon className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const cardClassName = `relative block p-4 rounded-2xl transition-all duration-500 group overflow-hidden h-full ${
    isDisabled
      ? 'opacity-50 cursor-not-allowed'
      : isEditMode
      ? 'cursor-default'
      : 'cursor-pointer hover:scale-[1.02]'
  } ${
    theme === 'dark'
      ? 'bg-gray-800/50 border border-white/5 hover:border-white/20'
      : 'bg-white/50 border border-gray-200 hover:border-gray-300 shadow-sm'
  }`;

  if (isVideoConf || isVPNManagement) {
    return (
      <button
        onClick={handleClick}
        className={`${cardClassName} w-full h-full text-left`}
        disabled={isDisabled || isEditMode}
      >
        {cardContent}
      </button>
    );
  }

  return (
    <Link
      to={isDisabled ? '#' : service.to}
      className={cardClassName}
      onClick={(e) => (isDisabled || isEditMode) && e.preventDefault()}
      aria-disabled={isDisabled}
    >
      {cardContent}
    </Link>
  );
};

// ==================== WIDGET WRAPPER ====================
const WidgetWrapper: React.FC<{
  widget: BaseWidgetData | ServiceWidgetData;
  theme: string;
  isEditMode: boolean;
  displayName: string;
  greeting: string;
  onRemove: (widgetId: string) => void;
}> = ({ widget, theme, isEditMode, displayName, greeting, onRemove }) => {
  const widgetRef = useRef<HTMLDivElement>(null);

  const getIcon = (iconName: string): React.ReactNode => {
    return ICON_MAP[iconName] || <SparklesIcon className="h-4 w-4" />;
  };

  const renderWidgetContent = () => {
    switch (widget.type) {
      case 'welcome':
        return <WelcomeWidget theme={theme} displayName={displayName} greeting={greeting} />;
      case 'clock-weather':
        return <ClockWeatherWidget theme={theme} />;
      case 'service':
        return <ServiceWidget serviceId={(widget as ServiceWidgetData).serviceId} theme={theme} isEditMode={isEditMode} />;
      default:
        return null;
    }
  };

  return (
    <div 
      ref={widgetRef}
      className={`widget-wrapper h-full ${
        theme === 'dark'
          ? 'bg-gray-900/70 border border-white/10'
          : 'bg-white/70 border border-gray-200 shadow-lg'
      } backdrop-blur-xl rounded-2xl overflow-hidden`}
    >
      <div className={`widget-header p-4 flex items-center justify-between ${
        theme === 'dark' ? 'border-b border-white/10 bg-gray-900/80' : 'border-b border-gray-200 bg-white/80'
      }`}>
        <div className="flex items-center gap-2">
          <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>{getIcon(widget.iconName)}</span>
          <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            {widget.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode && widget.id !== 'welcome' && widget.id !== 'clock-weather' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(widget.id);
              }}
              className={`p-1.5 rounded-lg transition-all duration-200 hover:scale-110 ${
                theme === 'dark'
                  ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                  : 'bg-red-100 text-red-500 hover:bg-red-200'
              }`}
              title="Удалить виджет"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
          {isEditMode && (
            <Bars3Icon className={`h-4 w-4 ${theme === 'dark' ? 'text-violet-400' : 'text-violet-500'} cursor-move`} />
          )}
        </div>
      </div>
      <div className="widget-content p-4 h-[calc(100%-60px)]">
        {renderWidgetContent()}
      </div>
    </div>
  );
};

// ==================== ADD WIDGET MODAL ====================
const AddWidgetModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  theme: string;
  currentWidgets: (BaseWidgetData | ServiceWidgetData)[];
  onAddWidget: (widget: BaseWidgetData | ServiceWidgetData) => void;
}> = ({ isOpen, onClose, theme, currentWidgets, onAddWidget }) => {
  const role = localStorage.getItem('role') || 'user';
  const isAdmin = role === 'admin';

  // Get available widgets (not already added)
  const availableWidgets = useMemo(() => {
    const currentIds = currentWidgets.map(w => w.id);
    
    // Basic widgets that can be added multiple times
    const basicWidgets = ALL_WIDGETS_DATA
      .filter(widget => !currentIds.includes(widget.id) || widget.type === 'service');
    
    // Available services
    const availableServices = ALL_SERVICES
      .filter(service => !service.isAdminOnly || isAdmin)
      .filter(service => {
        const serviceWidgetId = `service-${service.id}`;
        return !currentIds.includes(serviceWidgetId);
      })
      .map(service => ({
        id: `service-${service.id}`,
        type: 'service' as const,
        serviceId: service.id,
        title: service.title,
        iconName: SERVICE_ICON_MAP[service.id] || 'Cog6ToothIcon',
        minW: 3,
        minH: 2,
        maxW: 4,
        maxH: 3
      }));
    
    return [...basicWidgets, ...availableServices];
  }, [currentWidgets, isAdmin]);

  const getIcon = (iconName: string): React.ReactNode => {
    return ICON_MAP[iconName] || <SparklesIcon className="h-4 w-4" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      <div
        className={`modal-content relative w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden ${
          theme === 'dark'
            ? 'bg-gray-900/95 border border-white/10'
            : 'bg-white/95 border border-gray-200'
        }`}
      >
        <div className={`px-8 py-6 ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-fuchsia-600/20'
            : 'bg-gradient-to-r from-violet-100 via-purple-100 to-fuchsia-100'
        }`}>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${theme === 'dark' ? 'bg-white/10' : 'bg-white/50'}`}>
                <PlusIcon className={`h-6 w-6 ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`} />
              </div>
              <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Добавить виджет
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all duration-200 hover:scale-110 ${
                theme === 'dark'
                  ? 'text-white/70 hover:text-white hover:bg-white/10'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {availableWidgets.length === 0 ? (
            <div className="text-center py-12">
              <p className={`text-lg ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                Все виджеты уже добавлены
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableWidgets.map((widget) => {
                const service = ALL_SERVICES.find(s => s.id === (widget as ServiceWidgetData).serviceId);
                
                return (
                  <div
                    key={widget.id}
                    className={`p-4 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] ${
                      theme === 'dark'
                        ? 'bg-white/5 border border-white/5 hover:border-violet-500/50'
                        : 'bg-gray-50 border border-gray-200 hover:border-violet-400'
                    }`}
                    onClick={() => {
                      onAddWidget(widget);
                      onClose();
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${
                        service ? `bg-gradient-to-br ${service.color} ${service.shadowColor}` : 
                        'bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25'
                      } flex items-center justify-center text-white`}>
                        {getIcon(widget.iconName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-sm font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {widget.title}
                        </h3>
                        <p className={`text-xs mt-0.5 truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          {service?.description || 
                           (widget.type === 'welcome' ? 'Приветствие и информация о пользователе' :
                            'Время, дата и погода')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`px-8 py-4 border-t ${
          theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-300 hover:scale-105"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== NOTIFICATIONS DROPDOWN ====================
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
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
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
        return 'from-blue-500 to-cyan-500';
      case 'request':
        return 'from-emerald-500 to-green-500';
      case 'warning':
        return 'from-amber-500 to-yellow-500';
      case 'error':
        return 'from-red-500 to-rose-500';
      default:
        return 'from-violet-500 to-purple-500';
    }
  };

  return (
    <div className="notifications-wrapper relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-3 rounded-2xl transition-all duration-300 hover:scale-105 ${
          theme === 'dark'
            ? 'bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 hover:border-white/20'
            : 'bg-gray-100 border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-200'
        }`}
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="notification-badge absolute -top-1 -right-1 flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold text-white bg-gradient-to-r from-red-500 to-rose-500 rounded-full shadow-lg shadow-red-500/30">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="notifications-overlay fixed inset-0 bg-transparent"
            onClick={() => setIsOpen(false)}
          />

          <div
            className={`notifications-dropdown dropdown-enter absolute right-0 top-full mt-3 w-96 rounded-2xl shadow-2xl overflow-hidden z-50 ${
              theme === 'dark'
                ? 'bg-gray-900/95 border border-white/10 backdrop-blur-xl'
                : 'bg-white/95 border border-gray-200 backdrop-blur-xl shadow-xl'
            }`}
          >
            <div className={`px-5 py-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-base font-semibold flex items-center gap-2 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  <BellIcon className="h-5 w-5" />
                  Уведомления
                </h3>
                {unreadCount > 0 && (
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                    theme === 'dark'
                      ? 'bg-violet-500/20 text-violet-300'
                      : 'bg-violet-100 text-violet-700'
                  }`}>
                    {unreadCount} новых
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto custom-scrollbar p-2">
              {notifications.length === 0 ? (
                <div className={`text-center py-12 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  <BellIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Нет уведомлений</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 mb-2 rounded-xl cursor-pointer transition-all duration-300 group ${
                      notification.isRead
                        ? theme === 'dark'
                          ? 'bg-white/5 hover:bg-white/10'
                          : 'bg-gray-50 hover:bg-gray-100'
                        : theme === 'dark'
                          ? 'bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20'
                          : 'bg-violet-50 hover:bg-violet-100 border border-violet-200'
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${getNotificationColor(notification.type)} flex items-center justify-center text-white shadow-lg`}>
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`text-sm font-medium truncate ${
                            theme === 'dark' ? 'text-white' : 'text-gray-900'
                          }`}>
                            {notification.title}
                          </h4>
                          {!notification.isRead && (
                            <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                          )}
                        </div>
                        <p className={`text-xs line-clamp-2 mb-2 ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {notification.description}
                        </p>
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                          {new Date(notification.date).toLocaleString('ru-RU')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ==================== MAIN DASHBOARD COMPONENT ====================
export const Dashboard: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const role = localStorage.getItem('role') || 'user';
  const isAdmin = role === 'admin';
  const username = localStorage.getItem('username') || '';
  const userId = localStorage.getItem('userId') || 'unknown';
  const token = localStorage.getItem('token') || '';
  
  // State
  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', title: 'Добро пожаловать', description: 'Вы успешно вошли в систему', type: 'info', date: new Date().toISOString(), isRead: false }
  ]);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAddWidgetModalOpen, setIsAddWidgetModalOpen] = useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [greeting, setGreeting] = useState(getGreeting());
  const [userAvatar, setUserAvatar] = useState<string | null>(localStorage.getItem(`avatar:${username}`));
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);

  // Unified widgets state (store only data, not React elements)
  const [widgets, setWidgets] = useState<(BaseWidgetData | ServiceWidgetData)[]>(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY + '_widgets');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed;
      }
      // Default widgets (using data only)
      return [
        {
          id: 'welcome',
          type: 'welcome',
          title: 'Приветствие',
          iconName: 'SparklesIcon',
          minW: 4,
          minH: 2,
          maxH: 3
        },
        {
          id: 'clock-weather',
          type: 'clock-weather',
          title: 'Время и погода',
          iconName: 'ClockIcon',
          minW: 3,
          minH: 2,
          maxH: 3
        },
        {
          id: 'service-chat',
          type: 'service',
          serviceId: 'chat',
          title: 'Чат',
          iconName: 'ChatBubbleOvalLeftEllipsisIcon',
          minW: 3,
          minH: 2,
          maxW: 4,
          maxH: 3
        },
        {
          id: 'service-support',
          type: 'service',
          serviceId: 'support',
          title: 'Служба поддержки',
          iconName: 'TicketIcon',
          minW: 3,
          minH: 2,
          maxW: 4,
          maxH: 3
        }
      ];
    } catch {
      return [];
    }
  });

  // Layout state
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((item: any) => ({
          ...item,
          static: !isEditMode
        }));
      }
      return widgets.map((widget, index) => ({
        i: widget.id,
        x: (index % 4) * 3,
        y: Math.floor(index / 4) * 2,
        w: widget.minW,
        h: widget.minH,
        minW: widget.minW,
        minH: widget.minH,
        maxW: widget.maxW,
        maxH: widget.maxH,
        static: !isEditMode
      }));
    } catch {
      return [];
    }
  });

  // Update layout when edit mode changes
  useEffect(() => {
    const updatedLayout = layout.map(item => ({
      ...item,
      static: !isEditMode
    }));
    setLayout(updatedLayout);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(updatedLayout));
  }, [isEditMode, layout]);

  // Save widgets when they change
  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY + '_widgets', JSON.stringify(widgets));
  }, [widgets]);

  // Container width observer
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    
    return () => {
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  // Fetch user profile
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
          setUserProfile(userData);
        } else {
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

  // Greeting update
  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Fetch unread messages
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
    } catch (error) {
      console.error('Error fetching unread messages:', error);
    }
  };

  // Check server availability
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

  // Get WebSocket URL
  const getWebSocketUrl = (): string => {
    if (BASE_URL) {
      return BASE_URL.replace('http', 'ws') + '/chat/ws?token=' + encodeURIComponent(token);
    }
    return `ws://${window.location.hostname}:8000/chat/ws?token=${encodeURIComponent(token)}`;
  };

  // WebSocket connection
  useEffect(() => {
    let websocket: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    const reconnectDelay = 3000;
    let reconnectTimeout: NodeJS.Timeout;

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

      try {
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
          reconnectAttempts = 0;
          setWsConnectionStatus('connected');
        };

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

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
          setWsConnectionStatus('disconnected');

          const fatalCodes = [1000, 1001, 1002, 1003, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 4001, 4003, 4004];
          if (fatalCodes.includes(event.code) || event.wasClean) {
            setWsConnectionStatus('error');
            return;
          }

          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = reconnectDelay * Math.pow(1.5, reconnectAttempts);

            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              connectWebSocket();
            }, delay);
          } else {
            setWsConnectionStatus('error');
          }
        };

        websocket.onerror = () => {
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
      if (websocket) {
        websocket.close(1000, 'Component unmounting');
        websocket = null;
      }
    };

    if (token && token.length > 10) {
      connectWebSocket();
      fetchUnreadMessages();
    } else {
      setWsConnectionStatus('error');
    }

    return () => {
      disconnectWebSocket();
    };
  }, [token]);

  // Layout handlers
  const handleLayoutChange = useCallback((newLayout: Layout) => {
    const updatedLayout = newLayout.map(item => ({
      ...item,
      static: !isEditMode
    }));
    setLayout(updatedLayout);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(updatedLayout));
  }, [isEditMode]);

  const resetLayout = useCallback(() => {
    // Reset to default widgets and layout
    const defaultWidgets: (BaseWidgetData | ServiceWidgetData)[] = [
      {
        id: 'welcome',
        type: 'welcome',
        title: 'Приветствие',
        iconName: 'SparklesIcon',
        minW: 4,
        minH: 2,
        maxH: 3,
        maxW: 3
      },
      {
        id: 'clock-weather',
        type: 'clock-weather',
        title: 'Время и погода',
        iconName: 'ClockIcon',
        minW: 3,
        minH: 2,
        maxH: 3,
        maxW: 3
      },
      {
        id: 'service-chat',
        type: 'service',
        serviceId: 'chat',
        title: 'Чат',
        iconName: 'ChatBubbleOvalLeftEllipsisIcon',
        minW: 3,
        minH: 2,
        maxW: 4,
        maxH: 3
      },
      {
        id: 'service-support',
        type: 'service',
        serviceId: 'support',
        title: 'Служба поддержки',
        iconName: 'TicketIcon',
        minW: 3,
        minH: 2,
        maxW: 4,
        maxH: 3
      }
    ];

    setWidgets(defaultWidgets);
    localStorage.setItem(LAYOUT_STORAGE_KEY + '_widgets', JSON.stringify(defaultWidgets));

    const defaultLayout = defaultWidgets.map((widget, index) => ({
      i: widget.id,
      x: (index % 4) * 3,
      y: Math.floor(index / 4) * 2,
      w: widget.minW,
      h: widget.minH,
      minW: widget.minW,
      minH: widget.minH,
      maxW: widget.maxW,
      maxH: widget.maxH,
      static: !isEditMode
    }));

    setLayout(defaultLayout);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(defaultLayout));
  }, [isEditMode]);

  // Widget management
  const handleAddWidget = useCallback((widget: BaseWidgetData | ServiceWidgetData) => {
    setWidgets(prev => [...prev, widget]);
    
    // Add to layout
    const newLayoutItem = {
      i: widget.id,
      x: 0,
      y: Math.max(...layout.map(item => item.y + item.h), 0),
      w: widget.minW,
      h: widget.minH,
      minW: widget.minW,
      minH: widget.minH,
      maxW: widget.maxW,
      maxH: widget.maxH,
      static: !isEditMode
    };
    
    setLayout(prev => [...prev, newLayoutItem]);
  }, [layout, isEditMode]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    if (widgetId === 'welcome' || widgetId === 'clock-weather') {
      // Don't allow removing essential widgets
      return;
    }
    
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
    setLayout(prev => prev.filter(item => item.i !== widgetId));
  }, []);

  // Toggle edit mode
  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  // Avatar update handler
  const handleAvatarUpdate = (newAvatarUrl: string) => {
    setUserAvatar(newAvatarUrl);
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        avatar: newAvatarUrl
      });
    }
  };

  // Mark notification as read
  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, isRead: true } : notification
      )
    );
  };

  // Logout handler
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

  // Filter widgets based on search query
  const filteredWidgets = useMemo(() => {
    if (!searchQuery.trim()) return widgets;

    return widgets.filter(widget => {
      const widgetTitle = widget.title.toLowerCase();
      const widgetDescription = widget.type === 'service' 
        ? ALL_SERVICES.find(s => s.id === (widget as ServiceWidgetData).serviceId)?.description?.toLowerCase() || ''
        : '';
      
      return widgetTitle.includes(searchQuery.toLowerCase()) || 
             widgetDescription.includes(searchQuery.toLowerCase());
    });
  }, [widgets, searchQuery]);

  return (
    <div
      className={`min-h-screen transition-colors duration-500 relative overflow-hidden ${
        theme === 'dark'
          ? 'bg-gray-950 text-white'
          : 'bg-gray-50 text-gray-900'
      }`}
    >
      {/* Animated Background */}
      <AnimatedBackground theme={theme} />
      
      {/* Floating Particles */}
      <FloatingParticles />
      
      {/* Snow Effect */}
      <Snowfall intensity={30} />

      {/* Main Content */}
      <div ref={containerRef} className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <header className={`header-container flex flex-wrap justify-between items-center gap-4 mb-6 p-5 rounded-3xl backdrop-blur-xl transition-all duration-500 ${
          theme === 'dark'
            ? 'bg-gray-900/70 border border-white/10'
            : 'bg-white/70 border border-gray-200 shadow-xl shadow-gray-200/20'
        }`}>
          {/* Logo Section */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <img 
                src={`${BASE_URL}/chat-fonts/santa.png`} 
                className='w-8 absolute -top-3 -left-3 z-10'
                alt="santa"
              />
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                theme === 'dark'
                  ? 'bg-gradient-to-br from-violet-600 to-purple-700'
                  : 'bg-gradient-to-br from-violet-500 to-purple-600'
              }`}>
                <span className="font-bold text-xl text-white">КП</span>
              </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold gradient-text">
                Корпоративный Портал
              </h1>
              <p className={`text-xs ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                Единая точка доступа к сервисам
              </p>
            </div>
          </div>

          {/* Actions Section */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative hidden md:block">
              <MagnifyingGlassIcon className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`} />
              <input
                type="text"
                placeholder="Поиск виджетов..."
                className={`search-input w-64 pl-11 pr-4 py-2.5 rounded-xl transition-all duration-300 focus:w-80 ${
                  theme === 'dark'
                    ? 'bg-white/5 border border-white/10 text-white placeholder-gray-400 focus:bg-white/10 focus:border-violet-500/50'
                    : 'bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-violet-400'
                }`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Edit Mode Toggle */}
            <button
              onClick={toggleEditMode}
              className={`p-3 rounded-xl transition-all duration-300 hover:scale-105 ${
                isEditMode
                  ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
                  : theme === 'dark'
                    ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                    : 'bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200'
              }`}
              title={isEditMode ? 'Заблокировать виджеты' : 'Редактировать виджеты'}
            >
              {isEditMode ? <LockOpenIcon className="h-5 w-5" /> : <LockClosedIcon className="h-5 w-5" />}
            </button>

            {/* Reset Layout */}
            {isEditMode && (
              <button
                onClick={resetLayout}
                className={`p-3 rounded-xl transition-all duration-300 hover:scale-105 ${
                  theme === 'dark'
                    ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                    : 'bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200'
                }`}
                title="Сбросить расположение"
              >
                <ArrowPathIcon className="h-5 w-5" />
              </button>
            )}

            {/* Add Widget */}
            {isEditMode && (
              <button
                onClick={() => setIsAddWidgetModalOpen(true)}
                className={`p-3 rounded-xl transition-all duration-300 hover:scale-105 ${
                  theme === 'dark'
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600'
                }`}
                title="Добавить виджет"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            )}

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-3 rounded-xl transition-all duration-300 hover:scale-105 ${
                theme === 'dark'
                  ? 'bg-white/5 border border-white/10 text-amber-400 hover:bg-white/10 hover:border-amber-400/50'
                  : 'bg-gray-100 border border-gray-200 text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-500'
              }`}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>

            {/* Notifications */}
            <NotificationsDropdown
              notifications={notifications}
              theme={theme}
              onMarkAsRead={handleMarkAsRead}
            />

            {/* Profile */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className={`flex items-center gap-3 p-2 pr-4 rounded-xl transition-all duration-300 hover:scale-[1.02] ${
                theme === 'dark'
                  ? 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
                  : 'bg-gray-100 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              <div className="relative">
                <UserAvatar userId={username} size={40} className="ring-2 ring-violet-500/50" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-gray-900" />
              </div>
              <div className="hidden lg:block text-left">
                <p className={`text-sm font-medium ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  {displayName}
                </p>
                <p className={`text-xs ${
                  isAdmin
                    ? 'text-rose-400'
                    : theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {role === 'admin' ? '👑 Администратор' : 'Пользователь'}
                </p>
              </div>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className={`p-3 rounded-xl transition-all duration-300 hover:scale-105 ${
                theme === 'dark'
                  ? 'bg-white/5 border border-white/10 text-gray-400 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400'
                  : 'bg-gray-100 border border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-500'
              }`}
              title="Выйти"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Edit Mode Banner */}
        {isEditMode && (
          <div className={`edit-banner mb-6 p-4 rounded-xl text-center text-sm font-medium ${
            theme === 'dark' 
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' 
              : 'bg-violet-100 text-violet-700 border border-violet-200'
          }`}>
            🎨 Режим редактирования: перетаскивайте виджеты за заголовок и изменяйте их размер
          </div>
        )}

        {/* Mobile Search */}
        <div className="md:hidden mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`} />
            <input
              type="text"
              placeholder="Поиск виджетов..."
              className={`w-full pl-11 pr-4 py-3 rounded-xl transition-all duration-300 ${
                theme === 'dark'
                  ? 'bg-white/5 border border-white/10 text-white placeholder-gray-400'
                  : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-500'
              }`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Main Grid */}
        <main>
          {filteredWidgets.length === 0 ? (
            <div className={`text-center py-12 rounded-2xl ${
              theme === 'dark' ? 'bg-gray-900/50 border border-white/10' : 'bg-white/50 border border-gray-200'
            }`}>
              <MagnifyingGlassIcon className={`h-12 w-12 mx-auto mb-2 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
                {searchQuery ? 'Виджеты не найдены' : 'Добавьте виджеты для отображения'}
              </p>
              {isEditMode && (
                <button
                  onClick={() => setIsAddWidgetModalOpen(true)}
                  className={`mt-4 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 ${
                    theme === 'dark'
                      ? 'bg-violet-500 text-white hover:bg-violet-600'
                      : 'bg-violet-500 text-white hover:bg-violet-600'
                  }`}
                >
                  Добавить виджет
                </button>
              )}
            </div>
          ) : (
            <GridLayout
              className="layout"
              layout={layout.filter(item => 
                filteredWidgets.some(widget => widget.id === item.i)
              )}
              width={containerWidth}
              onLayoutChange={handleLayoutChange}
            >
              {filteredWidgets.map((widget) => (
                <div key={widget.id}>
                  <WidgetWrapper 
                    widget={widget}
                    theme={theme}
                    isEditMode={isEditMode}
                    displayName={displayName}
                    greeting={greeting}
                    onRemove={handleRemoveWidget}
                  />
                </div>
              ))}
            </GridLayout>
          )}
        </main>

        {/* Footer */}
        <footer className={`mt-12 py-6 px-6 rounded-3xl text-center backdrop-blur-xl ${
          theme === 'dark'
            ? 'bg-gray-900/50 border border-white/10'
            : 'bg-white/50 border border-gray-200'
        }`}>
          <div className="flex flex-wrap items-center justify-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                wsConnectionStatus === 'connected' ? 'bg-emerald-500 animate-pulse' :
                wsConnectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
                'bg-red-500'
              }`} />
              <span className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {wsConnectionStatus === 'connected' ? 'Подключено' :
                 wsConnectionStatus === 'connecting' ? 'Подключение...' :
                 'Офлайн'}
              </span>
            </div>
            
            <div className={`w-px h-4 ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
            }`} />
            
            <span className={`text-sm ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              Версия 2.0
            </span>
            
            <div className={`w-px h-4 ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
            }`} />
            
            <button
              onClick={() => setIsSupportModalOpen(true)}
              className={`text-sm font-medium transition-colors ${
                theme === 'dark'
                  ? 'text-violet-400 hover:text-violet-300'
                  : 'text-violet-600 hover:text-violet-500'
              }`}
            >
              Поддержка
            </button>
          </div>
          
          <p className={`text-xs ${
            theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
          }`}>
            © 2025 Корпоративный Портал. Разработка ТЭРиОВТ
          </p>
        </footer>
      </div>

      {/* Modals */}
      <SupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        theme={theme}
      />

      <AddWidgetModal
        isOpen={isAddWidgetModalOpen}
        onClose={() => setIsAddWidgetModalOpen(false)}
        theme={theme}
        currentWidgets={widgets}
        onAddWidget={handleAddWidget}
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