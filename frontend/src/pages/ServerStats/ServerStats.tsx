import { ArrowLeft } from 'phosphor-react';
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { useTheme } from '../../hooks/ThemeContext';

// Интерфейсы данных (остаются без изменений)
interface ServerData {
  ip: string;
  status: 'online' | 'offline';
  onlineTime: string;
  offlineTime: string;
  trafficIn: string;
  trafficOut: string;
  failedTests: number;
  latency: string;
  packetLoss: string;
}

interface TimeSeriesData {
  timestamp: string;
  value: number;
}

interface TrafficData {
  ip: string;
  bytesIn: TimeSeriesData[];
  bytesOut: TimeSeriesData[];
  packetsIn: TimeSeriesData[];
  packetsOut: TimeSeriesData[];
}

interface LatencyData {
  ip: string;
  latency: TimeSeriesData[];
  packetLoss: TimeSeriesData[];
}

interface SystemInfo {
  cpuLoad: string;
  memoryUsage: string;
  uptime: string;
  version: string;
}

interface InterfaceStats {
  name: string;
  type: string;
  rx_bytes: string;
  tx_bytes: string;
  rx_packets: string;
  tx_packets: string;
  status: 'up' | 'down';
}

// Иконки с улучшенным дизайном
const StatusIcon = ({ status, className }: { status: 'online' | 'offline'; className?: string }) => (
  <div className={`rounded-full p-1.5 ${status === 'online' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} ${className}`}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-3.5 h-3.5"
      aria-hidden="true"
    >
      {status === 'online' ? (
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      ) : (
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
          clipRule="evenodd"
        />
      )}
    </svg>
  </div>
);

const TrafficIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`w-4 h-4 ${className}`}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-2.625 6c-.54 0-.988.42-1.125.75l-2.25 6a1.125 1.125 0 002.25.375l.656-1.757h3.938l.656 1.757a1.125 1.125 0 002.25-.375l-2.25-6c-.137-.33-.585-.75-1.125-.75h-2.25zm1.5 2.25h-.75l1.125 3h-1.5l1.125-3z"
      clipRule="evenodd"
    />
  </svg>
);

const RefreshIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`w-5 h-5 ${className}`}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z"
      clipRule="evenodd"
    />
  </svg>
);

const ConnectionStatus = ({ isConnected }: { isConnected: boolean }) => (
  <div className="flex items-center text-sm font-medium">
    <div className={`w-2.5 h-2.5 rounded-full mr-2 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
    <span className={isConnected ? 'text-emerald-700' : 'text-rose-700'}>
      {isConnected ? 'Подключено' : 'Нет подключения'}
    </span>
  </div>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`w-5 h-5 ${className}`}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M2.25 13.5a8.25 8.25 0 018.25-8.25.75.75 0 01.75.75v6.75H18a.75.75 0 01.75.75 8.25 8.25 0 01-16.5 0z"
      clipRule="evenodd"
    />
    <path
      fillRule="evenodd"
      d="M12.75 3a.75.75 0 01.75-.75 8.25 8.25 0 018.25 8.25.75.75 0 01-.75.75h-7.5a.75.75 0 01-.75-.75V3z"
      clipRule="evenodd"
    />
  </svg>
);

const SystemIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`w-5 h-5 ${className}`}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm14.25 6a.75.75 0 01-.75.75H7.5a.75.75 0 010-1.5h9a.75.75 0 01.75.75zm0 4.5a.75.75 0 01-.75.75H7.5a.75.75 0 010-1.5h9a.75.75 0 01.75.75z"
      clipRule="evenodd"
    />
  </svg>
);

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function ServerStats() {
  const navigate = useNavigate();
  const [data, setData] = useState<ServerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null);
  const [latencyData, setLatencyData] = useState<LatencyData | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [interfaceStats, setInterfaceStats] = useState<InterfaceStats[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'traffic' | 'latency' | 'system'>('overview');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const { theme } = useTheme();
  // Функция проверки соединения
  const checkConnection = useCallback(async () => {
    try {
      setConnectionStatus('checking');
      const response = await fetch(`${BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        setConnectionStatus('connected');
        return true;
      } else {
        setConnectionStatus('disconnected');
        return false;
      }
    } catch (error) {
      setConnectionStatus('disconnected');
      return false;
    }
  }, []);

  // Загрузка данных с повторными попытками
  const fetchServerStats = useCallback(async (retries = 3, delay = 2000) => {
    setError(null);
    setLoading(true);

    // Сначала проверяем соединение
    const isConnected = await checkConnection();
    if (!isConnected) {
      setError('Нет подключения к серверу. Проверьте сетевое соединение.');
      setLoading(false);
      return;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Токен аутентификации не найден. Пожалуйста, войдите снова.');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${BASE_URL}/serverstats`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `Ошибка HTTP: ${response.status}`;
          let errorDetail = null;
          
          try {
            const errorData = await response.json();
            errorDetail = errorData.detail || errorData.message || null;
          } catch (e) {
            // Ignore JSON parsing errors
          }

          if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('username');
            errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
            navigate('/');
          } else if (response.status === 403) {
            errorMessage = 'Доступ запрещён. Недостаточно прав.';
          } else if (response.status === 500) {
            if (errorDetail?.includes('аутентификации') || errorDetail?.includes('роутер')) {
              errorMessage = 'Ошибка подключения к сетевому оборудованию. Попробуйте позже.';
            } else {
              errorMessage = 'Внутренняя ошибка сервера. Попробуйте позже.';
            }
          } else if (response.status === 502) {
            errorMessage = 'Сервер временно недоступен. Попробуйте позже.';
          } else if (response.status === 503) {
            errorMessage = 'Сервер перегружен. Попробуйте позже.';
          } else if (errorDetail) {
            errorMessage = errorDetail;
          }

          throw new Error(errorMessage);
        }

        const result: ServerData[] = await response.json();
        setData(result);
        setLastUpdate(new Date());
        setLoading(false);
        setConnectionStatus('connected');
        return;
      } catch (err: any) {
        console.error(`[ServerStats] Попытка ${attempt} не удалась:`, err);
        
        if (attempt === retries) {
          if (err.name === 'AbortError') {
            setError('Таймаут запроса. Сервер не отвечает.');
          } else if (err instanceof TypeError && err.message.includes('fetch')) {
            setError('Не удалось подключиться к серверу. Проверьте сетевое соединение.');
            setConnectionStatus('disconnected');
          } else {
            setError(err.message || 'Неизвестная ошибка при загрузке данных.');
          }
          setData([]);
          setLoading(false);
        } else {
          const nextDelay = delay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, nextDelay));
        }
      }
    }
  }, [navigate, checkConnection]);

  // Загрузка данных трафика для выбранного сервера
  const fetchTrafficData = useCallback(async (ip: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
      const response = await fetch(`${BASE_URL}/serverstats/traffic/${ip}?hours=${hours}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: TrafficData = await response.json();
        setTrafficData(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных трафика:', error);
    }
  }, [timeRange]);

  // Загрузка данных задержек для выбранного сервера
  const fetchLatencyData = useCallback(async (ip: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
      const response = await fetch(`${BASE_URL}/serverstats/latency/${ip}?hours=${hours}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: LatencyData = await response.json();
        setLatencyData(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных задержек:', error);
    }
  }, [timeRange]);

  // Загрузка системной информации
  const fetchSystemInfo = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${BASE_URL}/serverstats/system`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: SystemInfo = await response.json();
        setSystemInfo(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки системной информации:', error);
    }
  }, []);

  // Загрузка статистики интерфейсов
  const fetchInterfaceStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${BASE_URL}/serverstats/interfaces`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: InterfaceStats[] = await response.json();
        setInterfaceStats(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики интерфейсов:', error);
    }
  }, []);

  // Обработчик выбора сервера
  const handleServerSelect = (ip: string) => {
    setSelectedServer(ip);
    setActiveTab('traffic');
    fetchTrafficData(ip);
    fetchLatencyData(ip);
  };

  // Автоматическое обновление каждые 30 секунд
  useEffect(() => {
    fetchServerStats();
    fetchSystemInfo();
    fetchInterfaceStats();

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchServerStats(1);
        fetchSystemInfo();
        fetchInterfaceStats();
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [fetchServerStats, fetchSystemInfo, fetchInterfaceStats]);

  // Обновление данных при изменении выбранного сервера или диапазона времени
  useEffect(() => {
    if (selectedServer) {
      fetchTrafficData(selectedServer);
      fetchLatencyData(selectedServer);
    }
  }, [selectedServer, timeRange, fetchTrafficData, fetchLatencyData]);

  // Обработчик видимости страницы
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchServerStats(1);
        fetchSystemInfo();
        fetchInterfaceStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchServerStats, fetchSystemInfo, fetchInterfaceStats]);

  // Форматирование времени последнего обновления
  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'никогда';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    
    return date.toLocaleTimeString();
  };

  // Преобразование данных для графиков
  const formatTrafficDataForChart = (data: TrafficData | null) => {
    if (!data) return [];
    
    return data.bytesIn.map((item, index) => ({
      timestamp: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bytesIn: item.value / 1024 / 1024, // MB
      bytesOut: data.bytesOut[index]?.value / 1024 / 1024 || 0,
    }));
  };

  const formatLatencyDataForChart = (data: LatencyData | null) => {
    if (!data) return [];
    
    return data.latency.map((item, index) => ({
      timestamp: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      latency: item.value,
      packetLoss: data.packetLoss[index]?.value || 0,
    }));
  };

  // Подготовка данных для диаграммы статусов
  const getStatusData = () => {
    const onlineCount = data.filter(item => item.status === 'online').length;
    const offlineCount = data.filter(item => item.status === 'offline').length;
    
    return [
      { name: 'Онлайн', value: onlineCount, color: '#10B981' },
      { name: 'Оффлайн', value: offlineCount, color: '#EF4444' },
    ];
  };

  // Подготовка данных для диаграммы трафика
  const getTrafficData = () => {
    const totalIn = data.reduce((sum, item) => {
      const value = parseFloat(item.trafficIn) || 0;
      return sum + value;
    }, 0);
    
    const totalOut = data.reduce((sum, item) => {
      const value = parseFloat(item.trafficOut) || 0;
      return sum + value;
    }, 0);
    
    return [
      { name: 'Входящий', value: totalIn, color: '#6366F1' },
      { name: 'Исходящий', value: totalOut, color: '#10B981' },
    ];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6" role="main">
      <div className="max-w-7xl mx-auto">
        {/* Панель управления - новый дизайн */}
        <div className="flex flex-wrap items-center justify-between mb-8 gap-4 p-6 bg-white rounded-2xl shadow-sm border border-gray-100" role="toolbar">
        <Link
					to="/dashboard"
					className={`flex text-sm items-center gap-2 px-4 py-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} shadow-lg`}
				>
					<ArrowLeft size={16} />Вернуться на главную
				</Link>

          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              Статистика серверов
            </h1>
            {lastUpdate && (
              <p className="text-xs text-gray-500 mt-1.5">
                Обновлено: {formatLastUpdate(lastUpdate)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ConnectionStatus isConnected={connectionStatus === 'connected'} />
            <button
              onClick={() => fetchServerStats()}
              disabled={loading}
              className="flex items-center px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:shadow-xs transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              aria-label="Обновить данные"
            >
              <RefreshIcon className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>
        </div>

        {/* Навигация по вкладкам - новый дизайн */}
        <div className="mb-6 bg-white rounded-2xl p-1.5 shadow-xs border border-gray-100">
          <nav className="flex space-x-1">
            {(['overview', 'traffic', 'latency', 'system'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                disabled={tab !== 'overview' && tab !== 'system' && !selectedServer}
                className={`py-2.5 px-4 rounded-xl font-medium text-sm transition-all duration-200 flex items-center ${
                  activeTab === tab
                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                } ${(tab !== 'overview' && tab !== 'system' && !selectedServer) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {tab === 'overview' && <ChartIcon className="w-4 h-4 mr-2" />}
                {tab === 'traffic' && <TrafficIcon className="w-4 h-4 mr-2" />}
                {tab === 'latency' && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {tab === 'system' && <SystemIcon className="w-4 h-4 mr-2" />}
                {tab === 'overview' && 'Обзор'}
                {tab === 'traffic' && 'Трафик'}
                {tab === 'latency' && 'Задержки'}
                {tab === 'system' && 'Система'}
              </button>
            ))}
          </nav>
        </div>

        {/* Состояние загрузки - новый дизайн */}
        {loading && (
          <div className="flex flex-col justify-center items-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100" role="status">
            <div
              className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-blue-500 mb-4"
              aria-label="Загрузка данных"
            ></div>
            <p className="text-gray-600 font-medium">Подключение к оборудованию...</p>
            <p className="text-sm text-gray-500 mt-2">Это может занять несколько секунд</p>
          </div>
        )}

        {/* Ошибки - новый дизайн */}
        {error && (
          <div
            className="p-4 mb-6 rounded-xl border border-red-100 bg-red-50 text-red-800 shadow-xs"
            role="alert"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <span className="text-red-600 text-lg" aria-hidden="true">⚠️</span>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="font-medium text-sm">Ошибка подключения</h3>
                <p className="mt-1 text-sm">{error}</p>
                <div className="mt-3">
                  <button
                    onClick={() => fetchServerStats()}
                    className="text-sm bg-red-100 text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-200 transition-colors font-medium"
                  >
                    Попробовать снова
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Вкладка обзора */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Сводка - новый дизайн */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                <div className="flex items-center">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-medium text-gray-500">Всего серверов</h3>
                    <p className="text-2xl font-bold text-gray-900">{data.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                <div className="flex items-center">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-medium text-gray-500">Онлайн</h3>
                    <p className="text-2xl font-bold text-gray-900">
                      {data.filter(item => item.status === 'online').length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                <div className="flex items-center">
                  <div className="p-2 rounded-lg bg-rose-100 text-rose-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-medium text-gray-500">Оффлайн</h3>
                    <p className="text-2xl font-bold text-gray-900">
                      {data.filter(item => item.status === 'offline').length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                <div className="flex items-center">
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-medium text-gray-500">Средняя задержка</h3>
                    <p className="text-2xl font-bold text-gray-900">
                      {data.length > 0 
                        ? `${(data.reduce((sum, item) => {
                            const latency = parseFloat(item.latency) || 0;
                            return sum + latency;
                          }, 0) / data.length).toFixed(1)}ms` 
                        : '0ms'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Диаграммы - новый дизайн */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Статус серверов</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getStatusData()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent?.toFixed(0) || 0)}%`}
                      >
                        {getStatusData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value, 'Серверы']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Общий трафик</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={getTrafficData()}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`${value} MB`, 'Трафик']} />
                      <Legend />
                      <Bar dataKey="value" fill="#8884d8">
                        {getTrafficData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Таблица данных - новый дизайн */}
            {!loading && !error && data.length > 0 && (
              <div className="bg-white rounded-xl shadow-xs overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                  <table
                    className="min-w-full divide-y divide-gray-200"
                    aria-label="Таблица статистики серверов"
                  >
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="py-3.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">
                          IP-адрес
                        </th>
                        <th className="py-3.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">
                          Статус
                        </th>
                        <th className="py-3.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">
                          Время онлайн
                        </th>
                        <th className="py-3.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">
                          Трафик (вх/исх)
                        </th>
                        <th className="py-3.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">
                          Задержка
                        </th>
                        <th className="py-3.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">
                          Потери
                        </th>
                        <th className="py-3.5 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {data.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50/50 transition-colors duration-150">
                          <td className="py-3 px-4 text-sm font-mono text-gray-900 font-medium">
                            {item.ip}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                item.status === 'online'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                              aria-label={`Статус сервера: ${item.status === 'online' ? 'Онлайн' : 'Оффлайн'}`}
                            >
                              <StatusIcon
                                status={item.status}
                                className="mr-1.5"
                              />
                              {item.status === 'online' ? 'Онлайн' : 'Оффлайн'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            <div className="flex flex-col">
                              <span className="font-medium">↑ {item.onlineTime}</span>
                              <span className="text-xs text-gray-400">↓ {item.offlineTime}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            <div className="flex flex-col">
                              <span className="font-mono flex items-center">
                                <TrafficIcon className="text-blue-500 mr-1.5" />
                                {item.trafficIn}
                              </span>
                              <span className="font-mono flex items-center text-xs text-gray-400">
                                <TrafficIcon className="text-blue-500 mr-1.5" />
                                {item.trafficOut}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 font-mono">
                            {item.latency}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 font-mono">
                            {item.packetLoss}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <button
                              onClick={() => handleServerSelect(item.ip)}
                              className="text-blue-600 hover:text-blue-800 font-medium text-sm py-1 px-2.5 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                              Графики
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Статистика интерфейсов - новый дизайн */}
            {interfaceStats.length > 0 && (
              <div className="bg-white rounded-xl shadow-xs overflow-hidden border border-gray-100">
                <div className="px-5 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Сетевые интерфейсы</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Интерфейс</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Входящий</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Исходящий</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {interfaceStats.map((iface, index) => (
                        <tr key={index} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {iface.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {iface.type}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              iface.status === 'up' 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {iface.status === 'up' ? 'UP' : 'DOWN'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {(parseInt(iface.rx_bytes) / 1024 / 1024).toFixed(2)} MB
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {(parseInt(iface.tx_bytes) / 1024 / 1024).toFixed(2)} MB
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Вкладка трафика */}
        {activeTab === 'traffic' && selectedServer && (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Трафик для {selectedServer}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {timeRange === '24h' && 'За последние 24 часа'}
                  {timeRange === '7d' && 'За последние 7 дней'}
                  {timeRange === '30d' && 'За последние 30 дней'}
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as any)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="24h">24 часа</option>
                  <option value="7d">7 дней</option>
                  <option value="30d">30 дней</option>
                </select>
                <button
                  onClick={() => {
                    fetchTrafficData(selectedServer);
                    fetchLatencyData(selectedServer);
                  }}
                  className="flex items-center px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <RefreshIcon className="w-4 h-4 mr-1" />
                  Обновить
                </button>
              </div>
            </div>
            
            {trafficData ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Трафик (MB)</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={formatTrafficDataForChart(trafficData)}
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="timestamp" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '8px', 
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            border: '1px solid #e5e7eb'
                          }} 
                          formatter={(value) => [`${value} MB`, 'Трафик']}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="bytesIn" stackId="1" stroke="#6366f1" fill="#818cf8" fillOpacity={0.2} name="Входящий" />
                        <Area type="monotone" dataKey="bytesOut" stackId="2" stroke="#10b981" fill="#34d399" fillOpacity={0.2} name="Исходящий" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Пакеты</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={formatTrafficDataForChart(trafficData)}
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="timestamp" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '8px', 
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            border: '1px solid #e5e7eb'
                          }} 
                          formatter={(value) => [value, 'Пакеты']}
                        />
                        <Legend />
                        <Bar dataKey="bytesIn" fill="#6366f1" name="Входящие пакеты" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="bytesOut" fill="#10b981" name="Исходящие пакеты" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center items-center h-64 bg-white rounded-xl shadow-xs border border-gray-100">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-600">Загрузка данных трафика...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Вкладка задержек */}
        {activeTab === 'latency' && selectedServer && (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Задержки для {selectedServer}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {timeRange === '24h' && 'За последние 24 часа'}
                  {timeRange === '7d' && 'За последние 7 дней'}
                  {timeRange === '30d' && 'За последние 30 дней'}
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as any)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="24h">24 часа</option>
                  <option value="7d">7 дней</option>
                  <option value="30d">30 дней</option>
                </select>
                <button
                  onClick={() => {
                    fetchTrafficData(selectedServer);
                    fetchLatencyData(selectedServer);
                  }}
                  className="flex items-center px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <RefreshIcon className="w-4 h-4 mr-1" />
                  Обновить
                </button>
              </div>
            </div>
            
            {latencyData ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Задержка (ms)</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={formatLatencyDataForChart(latencyData)}
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="timestamp" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '8px', 
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            border: '1px solid #e5e7eb'
                          }} 
                          formatter={(value, name) => [
                            name === 'latency' ? `${value} ms` : `${value}%`,
                            name === 'latency' ? 'Задержка' : 'Потери пакетов'
                          ]}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="latency" 
                          stroke="#f59e0b" 
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          activeDot={{ r: 6 }}
                          name="Задержка" 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Потери пакетов (%)</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={formatLatencyDataForChart(latencyData)}
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="timestamp" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '8px', 
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            border: '1px solid #e5e7eb'
                          }} 
                          formatter={(value) => [`${value}%`, 'Потери пакетов']}
                        />
                        <Legend />
                        <Bar 
                          dataKey="packetLoss" 
                          fill="#ef4444" 
                          name="Потери пакетов" 
                          radius={[4, 4, 0, 0]} 
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center items-center h-64 bg-white rounded-xl shadow-xs border border-gray-100">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-600">Загрузка данных задержек...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Вкладка системы */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">Системная информация</h2>
              <p className="text-sm text-gray-500 mt-1">Информация о сетевом оборудовании</p>
            </div>
            
            {/* Системная информация - новый дизайн */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Загрузка CPU', value: systemInfo?.cpuLoad || '0%', color: 'text-blue-600', bg: 'bg-blue-50', icon: '💻' },
                { title: 'Память', value: systemInfo?.memoryUsage || '0%', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: '💾' },
                { title: 'Аптайм', value: systemInfo?.uptime || '0s', color: 'text-purple-600', bg: 'bg-purple-50', icon: '⏱️' },
                { title: 'Версия', value: systemInfo?.version || 'Unknown', color: 'text-amber-600', bg: 'bg-amber-50', icon: '🔧' },
              ].map((item, index) => (
                <div key={index} className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">{item.title}</h3>
                    <span className="text-lg">{item.icon}</span>
                  </div>
                  <p className={`text-2xl font-bold ${item.color}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Статистика интерфейсов - новый дизайн */}
            {interfaceStats.length > 0 && (
              <div className="bg-white rounded-xl shadow-xs overflow-hidden border border-gray-100">
                <div className="px-5 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Сетевые интерфейсы</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Интерфейс</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Входящий трафик</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Исходящий трафик</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Пакеты (вх/исх)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {interfaceStats.map((iface, index) => (
                        <tr key={index} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {iface.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {iface.type}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              iface.status === 'up' 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {iface.status === 'up' ? 'UP' : 'DOWN'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {(parseInt(iface.rx_bytes) / 1024 / 1024).toFixed(2)} MB
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {(parseInt(iface.tx_bytes) / 1024 / 1024).toFixed(2)} MB
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex flex-col">
                              <span>{iface.rx_packets}</span>
                              <span className="text-xs text-gray-400">{iface.tx_packets}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Дополнительная информация */}
            <div className="bg-white rounded-xl shadow-xs p-5 border border-gray-100">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Дополнительная информация</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Общее количество серверов</h4>
                  <p className="text-2xl font-bold text-gray-900">{data.length}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Средняя задержка</h4>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.length > 0 
                      ? `${(data.reduce((sum, item) => {
                          const latency = parseFloat(item.latency) || 0;
                          return sum + latency;
                        }, 0) / data.length).toFixed(1)}ms` 
                      : '0ms'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Общий трафик</h4>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.length > 0 
                      ? `${(data.reduce((sum, item) => {
                          const trafficIn = parseFloat(item.trafficIn) || 0;
                          const trafficOut = parseFloat(item.trafficOut) || 0;
                          return sum + trafficIn + trafficOut;
                        }, 0)).toFixed(2)} MB` 
                      : '0 MB'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Пустой результат */}
        {!loading && !error && data.length === 0 && activeTab === 'overview' && (
          <div className="text-center py-16 bg-white rounded-xl shadow-lg border border-gray-200" role="alert">
            <div className="text-6xl mb-4 text-gray-400" aria-hidden="true">📊</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Нет данных о серверах
            </h3>
            <p className="text-gray-500 mb-4">
              Серверы не найдены или данные временно недоступны.
            </p>
            <button
              onClick={() => fetchServerStats()}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <RefreshIcon className="w-4 h-4 mr-2" />
              Попробовать снова
            </button>
          </div>
        )}

        {/* Подсказка */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Данные автоматически обновляются каждые 30 секунд
        </div>
      </div>
    </div>
  );
}