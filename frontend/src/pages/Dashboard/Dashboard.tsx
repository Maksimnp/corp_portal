import React, { useState, useEffect, useMemo, useRef } from 'react';
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
} from '@heroicons/react/24/outline';
import { useTheme } from '../../hooks/ThemeContext';

// Сервисы
const services = [
  { title: 'Чат', description: 'Общайтесь с коллегами в каналах и личных сообщениях', to: '/chat', icon: <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-emerald-500 to-teal-500' },
  { title: 'Служба поддержки', description: 'Создавайте и отслеживайте заявки в IT-поддержку', to: '/requests_list', icon: <TicketIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-purple-500 to-indigo-500' },
  { title: 'Контакты', description: 'Поиск сотрудников по имени, отделу или должности', to: '/contacts', icon: <PhoneIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-indigo-500 to-blue-500' },
  { title: 'Видеоконференции', description: 'Проводите онлайн-встречи и совещания', to: '/jitsi', icon: <VideoCameraIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-red-500 to-orange-500' },
  { title: 'Редактирование контактов', description: 'Управление контактами Active Directory', to: '/edit-contacts', icon: <PencilSquareIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-orange-500 to-amber-500', isAdminOnly: true },
  { title: 'Админ-панель', description: 'Управление пользователями и настройками системы', to: '/admin', icon: <ShieldCheckIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-gray-700 to-gray-900', isAdminOnly: true },
  { title: 'Документы', description: 'Центр хранения внутренних документов и инструкций', to: '/docs', icon: <DocumentTextIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-cyan-500 to-blue-500' },
  { title: 'Статистика серверов', description: 'Просмотр статистики серверов', to: '/serverstats', icon: <ChartBarIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-blue-500 to-indigo-500', isAdminOnly: true },
  { title: 'VPN Управление', description: 'Управление подключениями и профилями OpenVPN', to: '/VPNManagement', icon: <GlobeAltIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-fuchsia-500 to-purple-500', isAdminOnly: true },
  { title: 'Часто задаваемые вопросы', description: 'Ответы на популярные вопросы', to: '/faq', icon: <QuestionMarkCircleIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-amber-500 to-yellow-500' },
  { title: 'Статистика персонала', description: 'Статистика персонала', to: '/EmployeeTrackerApp', icon: <UsersIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-lime-500 to-emerald-500', isAdminOnly: true },
  { title: 'Программное обеспечение', description: 'Установка и управление корпоративным ПО', to: '/software', icon: <ComputerDesktopIcon className="h-5 w-5" />, color: 'bg-gradient-to-r from-violet-500 to-purple-600' },
];

const JITSI_URL = import.meta.env.VITE_API_JITSI_URL;
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Компонент часов и даты с улучшенным стеклянным эффектом
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
        className={`relative p-10 rounded-3xl shadow-lg border backdrop-blur-sm bg-opacity-95 h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-slate-800/80 to-blue-900/40 border-white/10 hover:border-cyan-500/20'
            : 'bg-gradient-to-br from-white/80 to-blue-50/60 border-white/20 hover:border-blue-300/30'
        }`}
        style={{ willChange: 'transform, box-shadow, border-color' }}
      >
        <div className="text-center h-full flex flex-col justify-center space-y-4">
          <div className="space-y-1">
            <div
              className={`text-7xl font-bold font-black tracking-tight leading-none drop-shadow-md ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}
            >
              {formatTime(currentTime)}
            </div>
          </div>
          <div
            className={`text-lg font-semibold leading-tight px-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
            }`}
          >
            {formatDate(currentTime)}
          </div>
          
          {/* Информация о сервисах и активности системы */}
          <div className="flex flex-col gap-3 mt-4">
            <div className={`px-3 py-2 rounded-full text-xxl text-center ${
              theme === 'dark' 
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30' 
                : 'bg-blue-500/20 text-blue-700 border border-blue-500/30'
            }`}>
              {availableServices} сервисов доступно
            </div>
            <div className={`px-3 py-2 rounded-full text-xll text-center ${
              theme === 'dark' 
                ? 'bg-green-500/20 text-green-200 border border-green-500/30' 
                : 'bg-green-500/20 text-green-700 border border-green-500/30'
            }`}>
              Все сервисы доступны
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
      {/* Упрощенный эффект блеска */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500"
        style={{ willChange: 'opacity' }}
      />
      
      <div className="flex items-start mb-4 relative z-10">
        <div
          className={`flex items-center justify-center w-12 h-12 rounded-2xl ${service.color} text-white mr-4 shadow-lg transition-transform duration-300 group-hover/card:scale-105`}
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
          className={`text-xs px-3 py-1 rounded-full inline-flex items-center gap-1 mt-2 ${
            theme === 'dark'
              ? 'bg-gray-700/50 text-gray-300 border border-gray-600/50'
              : 'bg-gray-100/80 text-gray-600 border border-gray-200/80'
          }`}
        >
          <ShieldCheckIcon className="h-3 w-3" />
          Требуются права администратора
        </div>
      )}
    </div>
  );

  const cardClassName = `relative block p-6 rounded-3xl shadow-lg transition-all duration-300 border backdrop-blur-sm group ${
    isDisabled
      ? 'opacity-50 cursor-not-allowed'
      : 'cursor-pointer hover:shadow-xl hover:-translate-y-1'
  } ${
    theme === 'dark'
      ? 'bg-gray-800/60 border-white/10 hover:border-cyan-500/20'
      : 'bg-white/80 border-white/20 hover:border-blue-300/30'
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
    
    // Если есть ссылка - переходим по ней
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
        className={`relative p-3 rounded-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm border ${
          theme === 'dark'
            ? 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
            : 'bg-black/5 border-black/10 text-gray-600 hover:text-gray-900 hover:bg-black/10'
        }`}
      >
        <BellIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full min-w-5 h-5">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 z-40 bg-transparent" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div
            className={`absolute right-0 top-full mt-2 w-96 rounded-3xl shadow-2xl z-50 overflow-hidden backdrop-blur-2xl border ${
              theme === 'dark'
                ? 'bg-gray-800/95 border-white/10'
                : 'bg-white/95 border-white/20'
            } max-h-96 overflow-y-auto`}
          >
            <div className="p-4 border-b border-white/10">
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
            
            <div className="p-2">
              {notifications.length === 0 ? (
                <div className={`text-center py-8 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  <BellIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Нет новых уведомлений</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 mb-2 rounded-2xl transition-all duration-200 cursor-pointer backdrop-blur-sm group ${
                      notification.isRead
                        ? theme === 'dark'
                          ? 'bg-white/5 hover:bg-white/10'
                          : 'bg-black/5 hover:bg-black/10'
                        : theme === 'dark'
                          ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30'
                          : 'bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30'
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center mt-1 flex-shrink-0 text-white ${getNotificationColor(notification.type)}`}
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
                              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                            )}
                            {notification.link && (
                              <div className="text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                        }`}>
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

export const Dashboard: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const role = localStorage.getItem('role') || 'user';
  const isAdmin = role === 'admin';
  const fullName = localStorage.getItem('username') || 'Пользователь';
  const userId = localStorage.getItem('userId') || 'unknown';
  const token = localStorage.getItem('token') || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const filteredServices = useMemo(() => {
    return services
      .filter(({ isAdminOnly }) => !isAdminOnly || isAdmin)
      .filter(
        (service) =>
          service.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          service.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [searchQuery, isAdmin]);

  // Функция для получения уведомлений о заявках
  const fetchRequestNotifications = async () => {
    try {
      const response = await fetch(`${BASE_URL}/request_list/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.status === 'success' && result.data) {
        const requestNotifications: Notification[] = result.data.map((request: any) => ({
          id: `request-${request.request_id}`,
          title: 'Новая заявка',
          description: `Заявка #${request.request_id} от ${request.sender_fullname}: ${request.theme || 'Без темы'}`,
          type: 'request' as const,
          date: request.send_date,
          isRead: false,
          source: 'requests',
          link: '/requests_list'
        }));

        setNotifications(prev => {
          // Фильтруем старые уведомления о заявках и добавляем новые
          const filtered = prev.filter(n => n.source !== 'requests');
          return [...filtered, ...requestNotifications];
        });
      }
    } catch (error) {
      console.error('Error fetching request notifications:', error);
    }
  };

  // Функция для получения уведомлений о сообщениях
  const fetchUnreadMessages = async () => {
    try {
      const response = await fetch('/chat/unread/total', {
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

      // Если есть непрочитанные сообщения, добавляем уведомление
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
        // Убираем уведомление о сообщениях, если нет непрочитанных
        setNotifications(prev => prev.filter(n => n.source !== 'chat'));
      }
    } catch (error) {
      console.error('Error fetching unread messages:', error);
    }
  };

  // Подключение к WebSocket
  useEffect(() => {
    let websocket: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 5000;

    const connectWebSocket = () => {
      const wsUrl = `ws://${window.location.hostname}:8000/chat/ws?token=${encodeURIComponent(token)}`;
      websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          if (data.type === 'notification') {
            setNotifications((prev) => [...prev, data.data]);
          }
          if (data.type === 'user_status' || data.type === 'new_message') {
            fetchUnreadMessages();
          }
          if (data.type === 'new_request') {
            fetchRequestNotifications();
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        if (reconnectAttempts < maxReconnectAttempts) {
          setTimeout(() => {
            reconnectAttempts++;
            console.log(`Reconnecting WebSocket, attempt ${reconnectAttempts}`);
            connectWebSocket();
          }, reconnectDelay * Math.pow(2, reconnectAttempts));
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      setWs(websocket);
    };

    if (token) {
      connectWebSocket();
      fetchRequestNotifications();
      fetchUnreadMessages();
    }

    return () => {
      websocket?.close();
    };
  }, [userId, role, token]);

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
    window.location.href = '/';
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-500 ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 text-white'
          : 'bg-gradient-to-br from-blue-50/80 via-purple-50/40 to-gray-50 text-gray-800'
      } py-6 px-4 relative overflow-hidden`}
    >
      {/* Анимированный фон */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl opacity-20 ${
          theme === 'dark' ? 'bg-cyan-500' : 'bg-cyan-300'
        }`} />
        <div className={`absolute -bottom-40 -left-40 w-80 h-80 rounded-full blur-3xl opacity-20 ${
          theme === 'dark' ? 'bg-fuchsia-500' : 'bg-fuchsia-300'
        }`} />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Шапка */}
        <header
          className={`flex justify-between items-center mb-8 p-6 rounded-3xl shadow-2xl border backdrop-blur-2xl bg-opacity-90 transition-all duration-500 relative z-30 ${
            theme === 'dark' 
              ? 'bg-gray-800/80 border-white/10 hover:border-cyan-500/30' 
              : 'bg-white/80 border-white/20 hover:border-blue-300/50'
          }`}
        >
          <div className="flex items-center">
            <div className="relative">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mr-4 shadow-2xl backdrop-blur-sm border ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-700 border-white/20'
                    : 'bg-gradient-to-r from-cyan-500 to-indigo-600 border-white/30'
                }`}
              >
                <span className="font-bold text-xl text-white">КП</span>
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/10 to-transparent pointer-events-none" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-indigo-600 bg-clip-text text-transparent">
                Корпоративный Портал
              </h1>
              <p className={`text-sm mt-1 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Все сервисы в одном месте
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Поиск */}
            <div className="relative">
              <MagnifyingGlassIcon
                className={`absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-black'
                }`}
              />
              <input
                type="text"
                placeholder="Поиск сервисов..."
                className={`pl-12 pr-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent transition-all duration-300 backdrop-blur-sm ${
                  theme === 'dark'
                    ? 'bg-white/5 border-white/10 text-white placeholder-gray-400 hover:bg-white/10'
                    : 'bg-white/60 border-gray-300 text-gray-800 placeholder-gray-500 hover:bg-white/80'
                }`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Переключение темы */}
            <button
              onClick={toggleTheme}
              className={`p-3 rounded-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm border ${
                theme === 'dark'
                  ? 'bg-white/5 border-white/10 text-yellow-300 hover:bg-white/10'
                  : 'bg-black/5 border-black/10 text-gray-600 hover:bg-black/10'
              }`}
              title={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
            >
              {theme === 'dark' ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
            </button>

            {/* Уведомления */}
            <NotificationsDropdown
              notifications={notifications}
              theme={theme}
              onMarkAsRead={handleMarkAsRead}
            />

            {/* Чат */}
            <div className="relative">
              <Link to="/chat">
                <button
                  className={`p-3 rounded-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm border ${
                    theme === 'dark'
                      ? 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      : 'bg-black/5 border-black/10 text-gray-600 hover:text-gray-900 hover:bg-black/10'
                  }`}
                >
                  <ChatBubbleOvalLeftEllipsisIcon className="h-6 w-6" />
                  {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full min-w-5 h-5">
                      {unreadMessages}
                    </span>
                  )}
                </button>
              </Link>
            </div>

            {/* Профиль пользователя */}
            <div
              className={`flex items-center space-x-4 rounded-2xl py-2 px-4 backdrop-blur-sm border ${
                theme === 'dark' 
                  ? 'bg-white/5 border-white/10' 
                  : 'bg-black/5 border-black/10'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600'
                    : 'bg-gradient-to-r from-cyan-500 to-indigo-600'
                }`}
              >
                <UserIcon className="h-6 w-6 text-white" />
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium">{fullName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      isAdmin
                        ? theme === 'dark'
                          ? 'bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-300 border border-red-500/30'
                          : 'bg-gradient-to-r from-red-100 to-red-200 text-red-700 border border-red-200'
                        : theme === 'dark'
                        ? 'bg-gradient-to-r from-gray-600/50 to-gray-700/50 text-gray-300 border border-gray-600/50'
                        : 'bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700 border border-gray-300'
                    }`}
                  >
                    {role === 'admin' ? 'Администратор' : 'Пользователь'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className={`p-2 rounded-xl transition-all duration-300 hover:scale-110 ${
                  theme === 'dark'
                    ? 'text-gray-400 hover:text-red-400 hover:bg-white/10'
                    : 'text-gray-500 hover:text-red-500 hover:bg-black/10'
                }`}
                title="Выйти"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Основной контент */}
        <main>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Приветственный блок */}
            <div className="lg:col-span-2 relative z-10">
              <div
                className={`rounded-3xl p-6 shadow-2xl backdrop-blur-2xl bg-opacity-90 h-full border transition-all duration-500 hover:shadow-3xl ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-gray-800/80 to-gray-900/80 border-white/10 hover:border-cyan-500/30'
                    : 'bg-gradient-to-r from-white/80 to-blue-50/80 border-white/20 hover:border-blue-300/50'
                }`}
              >
                <h2
                  className={`text-4xl font-bold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  Добро пожаловать, {fullName}!
                </h2>
                <p className={`text-base ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  Все корпоративные сервисы в одном месте для эффективной работы
                </p>
              </div>
            </div>

            {/* Блок с часами и датой */}
            <div className="lg:col-span-1">
              <DateTimeWidget theme={theme} availableServices={filteredServices.length} />
            </div>
          </div>

          {/* Сетка сервисов */}
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
              className={`rounded-3xl p-12 text-center shadow-2xl backdrop-blur-sm border ${
                theme === 'dark' 
                  ? 'bg-gray-800/60 border-white/10' 
                  : 'bg-white/80 border-white/20'
              }`}
            >
              <div className="flex justify-center mb-6">
                <div
                  className={`p-6 rounded-3xl ${
                    theme === 'dark' ? 'bg-white/5' : 'bg-black/5'
                  }`}
                >
                  <MagnifyingGlassIcon className="h-16 w-16 mx-auto text-gray-400" />
                </div>
              </div>
              <h3 className={`text-xl font-medium mb-3 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>Сервисы не найдены</h3>
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                Попробуйте изменить поисковый запрос
              </p>
            </div>
          )}
        </main>

        {/* Футер */}
        <footer
          className={`mt-8 pt-4 border-t text-center text-sm backdrop-blur-sm rounded-3xl p-3 ${
            theme === 'dark' 
              ? 'border-white/10 text-black-400 bg-white/5' 
              : 'border-black/10 text-black-500 bg-black/5'
          }`}
        >
          <div className="flex items-center justify-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Сервис доступен</span>
            </div>
            <div className="w-px h-4 bg-current opacity-30" />
            <div>Версия 2.0</div>
            <div className="w-px h-4 bg-current opacity-30" />
            <div>Поддержка</div>
          </div>
          <p>© {new Date().getFullYear()} Корпоративный Портал. Все права защищены.</p>
        </footer>
      </div>
    </div>
  );
};