import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { 
  ArrowPathIcon, 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  GlobeAltIcon, 
  ServerIcon, 
  DevicePhoneMobileIcon,
  WifiIcon,
  ComputerDesktopIcon,
  PrinterIcon,
  CameraIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  ClockIcon,
  MapPinIcon,
  CpuChipIcon,
  SignalIcon
} from '@heroicons/react/24/outline';

interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  check_type: 'http' | 'https' | 'tcp';
  path: string;
  location: string;
  timeout?: number;
  retries?: number;
}

interface ServerStatus extends Server {
  status: 'online' | 'offline' | 'checking' | 'error';
  latency: number;
  timestamp: string;
  last_check: string;
  message?: string;
}

interface Statistics {
  total_checks: number;
  success_rate: number;
  avg_response_time: number;
  local_devices: number;
  remote_devices: number;
  port_distribution: Record<string, number>;
  error_devices?: number;
}

interface StatusResponse {
  servers: ServerStatus[];
  updated_at: string;
  total_online: number;
  total_offline: number;
  total_checking: number;
  statistics: Statistics;
}

const API_BASE_URL = 'http://192.1.66.117:8000';

const ServerMonitor: React.FC = () => {
  const { token } = useAuth();
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [offlineCount, setOfflineCount] = useState(0);
  const [checkingCount, setCheckingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statistics, setStatistics] = useState<Statistics>({
    total_checks: 0,
    success_rate: 100,
    avg_response_time: 0,
    local_devices: 0,
    remote_devices: 0,
    port_distribution: {}
  });

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Server | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  const [form, setForm] = useState({
    name: '',
    host: '',
    port: 443,
    check_type: 'https' as 'http' | 'https' | 'tcp',
    path: '/',
    location: 'Локальная сеть',
    timeout: 5.0,
    retries: 2
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const fetchStatus = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setRefreshing(true);
      setError(null);
      
      console.log('🔄 Запрос статуса серверов...');
      
      const res = await fetch(`${API_BASE_URL}/servers/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('📡 Ответ получен, статус:', res.status);
      
      if (res.ok) {
        const data: StatusResponse = await res.json();
        console.log(data);
        console.log('✅ Данные получены:', {
          serversCount: data.servers?.length,
          onlineCount: data.total_online,
          updatedAt: data.updated_at,
          statistics: data.statistics
        });

        const validServers = Array.isArray(data.servers) ? data.servers : [];
        setServers(validServers);
        setUpdatedAt(data.updated_at || new Date().toLocaleTimeString());
        setOnlineCount(data.total_online || 0);
        setOfflineCount(data.total_offline || 0);
        setCheckingCount(data.total_checking || 0);

        if (data.statistics) {
          setStatistics(data.statistics);
        } else {
          // Рассчитываем статистику вручную
          const total = validServers.length;
          const online = data.total_online || 0;
          const avgLatency = validServers
            .filter(s => s.status === 'online')
            .reduce((acc, s) => acc + s.latency, 0) / online || 0;

          const localDevices = validServers.filter(s => 
            s.host.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|localhost)/)
          ).length;

          setStatistics({
            total_checks: total,
            success_rate: total > 0 ? Math.round((online / total) * 100) : 100,
            avg_response_time: Math.round(avgLatency),
            local_devices: localDevices,
            remote_devices: total - localDevices,
            port_distribution: {}
          });
        }

      } else {
        const errorText = await res.text();
        console.error('❌ Ошибка сервера:', res.status, errorText);
        setError(`Ошибка сервера: ${res.status} - ${errorText || 'Неизвестная ошибка'}`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки статуса:', err);
      setError('Не удалось подключиться к серверу мониторинга. Проверьте подключение.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const testConnection = async (host: string, port: number, type: 'http' | 'https' | 'tcp' = 'tcp', path: string = '/') => {
    try {
      setTestingConnection(true);
      const url = `${API_BASE_URL}/servers/check/${host}/${port}?check_type=${type}&path=${encodeURIComponent(path)}`;
      console.log('🔍 Тестирование подключения:', url);
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        alert(`Тест подключения к ${host}:${port}\nТип: ${type}\nСтатус: ${data.status}\nЗадержка: ${data.latency > 0 ? data.latency + ' мс' : 'нет ответа'}\n${data.message || ''}`);
        return data.status === 'online';
      }
      return false;
    } catch (err) {
      console.error('Ошибка тестирования:', err);
      alert('Ошибка при тестировании подключения. Проверьте консоль для подробностей.');
      return false;
    } finally {
      setTestingConnection(false);
    }
  };

  const saveServer = async () => {
    if (!form.name || !form.host) {
      alert('Заполните название и хост');
      return;
    }

    // Проверяем формат хоста
    const hostRegex = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$|^(\d{1,3}\.){3}\d{1,3}$|^localhost$/;
    if (!hostRegex.test(form.host)) {
      alert('Некорректный формат хоста. Используйте IP-адрес или доменное имя.');
      return;
    }

    // Автокоррекция порта для локальных устройств
    if (isLocalNetwork(form.host)) {
      if (form.port === 443 && form.check_type === 'https') {
        if (!confirm('Локальные устройства редко используют HTTPS. Использовать HTTP (порт 80) вместо этого?')) {
          form.port = 80;
          form.check_type = 'http';
        }
      }
    }

    const method = editing ? 'PUT' : 'POST';
    const url = editing
      ? `${API_BASE_URL}/servers/edit/${editing.id}`
      : `${API_BASE_URL}/servers/add`;

    const payload = {
      name: form.name,
      host: form.host,
      port: form.port,
      check_type: form.check_type,
      path: form.check_type !== 'tcp' ? (form.path || '/') : '',
      location: form.location || 'Локальная сеть',
      timeout: form.timeout || 5.0,
      retries: form.retries || 2
    };

    try {
      console.log('💾 Сохранение сервера:', payload);
      const res = await fetch(url, { 
        method, 
        headers, 
        body: JSON.stringify(payload) 
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || `Ошибка сохранения: ${res.status}`);
      }
      
      const result = await res.json();
      console.log('✅ Сервер сохранен:', result);
      
      setShowModal(false);
      setEditing(null);
      setForm({ 
        name: '', 
        host: '', 
        port: 443, 
        check_type: 'https', 
        path: '/', 
        location: 'Локальная сеть',
        timeout: 5.0,
        retries: 2
      });
      
      // Обновляем статус
      await fetchStatus(false);
      
      alert(result.message || (editing ? 'Сервер обновлен!' : 'Сервер добавлен!'));
    } catch (err: any) {
      console.error('Ошибка сохранения:', err);
      alert(`Ошибка сохранения сервера: ${err.message}`);
    }
  };

  const deleteServer = async (id: string, name: string) => {
    if (!confirm(`Удалить устройство "${name}" из мониторинга?`)) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/servers/delete/${id}`, { 
        method: 'DELETE', 
        headers 
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || `Ошибка удаления: ${res.status}`);
      }
      
      await fetchStatus(false);
      alert('Устройство удалено!');
    } catch (err: any) {
      console.error('Ошибка удаления:', err);
      alert(`Ошибка удаления сервера: ${err.message}`);
    }
  };

  const openEdit = (server: ServerStatus) => {
    setEditing(server);
    setForm({
      name: server.name,
      host: server.host,
      port: server.port,
      check_type: server.check_type,
      path: server.path || '/',
      location: server.location,
      timeout: server.timeout || 5.0,
      retries: server.retries || 2
    });
    setShowModal(true);
  };

  const handleTestConnection = async () => {
    if (!form.host) {
      alert('Введите хост для тестирования');
      return;
    }
    
    const isOnline = await testConnection(form.host, form.port, form.check_type, form.path);
    if (isOnline) {
      alert(`✅ Устройство ${form.host}:${form.port} доступно!`);
    } else {
      alert(`❌ Устройство ${form.host}:${form.port} недоступно.\nПроверьте:\n1. Правильность IP/домена\n2. Работает ли сервис на порту ${form.port}\n3. Нет ли блокировки брандмауэром\n4. Для HTTP/HTTPS: доступен ли путь ${form.path}`);
    }
  };

  const refreshCache = async () => {
    try {
      setRefreshing(true);
      await fetch(`${API_BASE_URL}/servers/clear-cache`, { 
        method: 'POST',
        headers 
      });
      await fetchStatus(false);
      alert('Кэш очищен, данные обновлены');
    } catch (err) {
      console.error('Ошибка обновления кэша:', err);
      alert('Ошибка при обновлении кэша');
    } finally {
      setRefreshing(false);
    }
  };

  const getDeviceIcon = (server: ServerStatus) => {
    const name = server.name.toLowerCase();
    const port = server.port;
    
    if (server.status === 'error') {
      return <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />;
    } else if (server.status === 'checking') {
      return <ClockIcon className="h-6 w-6 text-yellow-400 animate-pulse" />;
    } else if (name.includes('роутер') || name.includes('router') || port === 80 || port === 443) {
      return <WifiIcon className="h-6 w-6 text-blue-400" />;
    } else if (name.includes('камер') || name.includes('camera') || port === 554) {
      return <CameraIcon className="h-6 w-6 text-purple-400" />;
    } else if (name.includes('принтер') || name.includes('printer') || port === 9100) {
      return <PrinterIcon className="h-6 w-6 text-yellow-400" />;
    } else if (port === 22 || port === 3389 || port === 5900) {
      return <ComputerDesktopIcon className="h-6 w-6 text-green-400" />;
    } else if (server.check_type === 'http' || server.check_type === 'https') {
      return <GlobeAltIcon className="h-6 w-6 text-cyan-400" />;
    } else {
      return <ServerIcon className="h-6 w-6 text-gray-400" />;
    }
  };

  const getPortName = (port: number) => {
    const ports: Record<number, string> = {
      80: 'HTTP',
      443: 'HTTPS',
      22: 'SSH',
      3389: 'RDP',
      21: 'FTP',
      25: 'SMTP',
      110: 'POP3',
      143: 'IMAP',
      3306: 'MySQL',
      5432: 'PostgreSQL',
      27017: 'MongoDB',
      554: 'RTSP (камера)',
      9100: 'Принтер',
      515: 'LPR (принтер)',
      161: 'SNMP',
      389: 'LDAP',
      636: 'LDAPS',
      8080: 'HTTP Alt',
      8443: 'HTTPS Alt'
    };
    return ports[port] || `Порт ${port}`;
  };

  const getCheckTypeName = (type: string) => {
    const types: Record<string, string> = {
      'http': 'HTTP',
      'https': 'HTTPS',
      'tcp': 'TCP'
    };
    return types[type] || type;
  };

  const isLocalNetwork = (host: string) => {
    return host.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|localhost)/) !== null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-400 bg-green-900/20 border-green-700/30';
      case 'offline': return 'text-red-400 bg-red-900/20 border-red-700/30';
      case 'checking': return 'text-yellow-400 bg-yellow-900/20 border-yellow-700/30';
      case 'error': return 'text-orange-400 bg-orange-900/20 border-orange-700/30';
      default: return 'text-gray-400 bg-gray-900/20 border-gray-700/30';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Доступно';
      case 'offline': return 'Недоступно';
      case 'checking': return 'Проверяется';
      case 'error': return 'Ошибка';
      default: return 'Неизвестно';
    }
  };

  useEffect(() => {
    if (token) {
      fetchStatus();
      const interval = setInterval(() => {
        fetchStatus(false);
      }, 30000); // Обновление каждые 30 секунд
      
      return () => clearInterval(interval);
    }
  }, [token, fetchStatus]);

  // Автоматически определяем тип проверки по порту
  useEffect(() => {
    if (form.port === 443) {
      setForm(prev => ({ ...prev, check_type: 'https' }));
    } else if (form.port === 80) {
      setForm(prev => ({ ...prev, check_type: 'http' }));
    } else if ([22, 3389, 9100, 554].includes(form.port)) {
      setForm(prev => ({ ...prev, check_type: 'tcp' }));
    }
  }, [form.port]);

  if (loading && !refreshing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-xl text-gray-300">Загрузка мониторинга...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Заголовок и ошибки */}
        <div className="mb-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                Мониторинг устройств
              </h1>
              <p className="text-xl text-gray-300 mt-2">
                Веб-сайты • Серверы • Роутеры • Камеры • Принтеры • Любые TCP-порты
              </p>
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setForm({ 
                  name: '', 
                  host: '', 
                  port: 443, 
                  check_type: 'https', 
                  path: '/', 
                  location: 'Локальная сеть',
                  timeout: 5.0,
                  retries: 2
                });
                setShowModal(true);
              }}
              className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-2xl hover:opacity-90 transition-all shadow-xl hover:shadow-2xl font-medium"
            >
              <PlusIcon className="h-6 w-6" />
              Добавить устройство
            </button>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 mb-6 flex items-center gap-3">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-red-300 font-medium">{error}</p>
                <button 
                  onClick={() => fetchStatus(false)}
                  className="text-red-400 hover:text-red-300 text-sm mt-1 underline"
                >
                  Попробовать снова
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-green-500/20 text-center hover:border-green-500/40 transition-all">
            <div className="text-4xl font-bold text-green-400">{onlineCount}</div>
            <div className="text-gray-400 mt-2 flex items-center justify-center gap-2">
              <CheckCircleIcon className="h-5 w-5" />
              Онлайн
            </div>
          </div>
          <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-red-500/20 text-center hover:border-red-500/40 transition-all">
            <div className="text-4xl font-bold text-red-400">{offlineCount}</div>
            <div className="text-gray-400 mt-2 flex items-center justify-center gap-2">
              <XCircleIcon className="h-5 w-5" />
              Оффлайн
            </div>
          </div>
          <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-yellow-500/20 text-center hover:border-yellow-500/40 transition-all">
            <div className="text-4xl font-bold text-yellow-400">{checkingCount}</div>
            <div className="text-gray-400 mt-2 flex items-center justify-center gap-2">
              <ClockIcon className="h-5 w-5" />
              Проверяется
            </div>
          </div>
          <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-cyan-500/20 text-center hover:border-cyan-500/40 transition-all">
            <div className="text-4xl font-bold text-cyan-400">{servers.length}</div>
            <div className="text-gray-400 mt-2 flex items-center justify-center gap-2">
              <ServerIcon className="h-5 w-5" />
              Всего устройств
            </div>
          </div>
          <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-purple-500/20 text-center hover:border-purple-500/40 transition-all">
            <div className="text-4xl font-bold text-purple-400">{statistics.success_rate}%</div>
            <div className="text-gray-400 mt-2 flex items-center justify-center gap-2">
              <SignalIcon className="h-5 w-5" />
              Доступность
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Средняя задержка: {statistics.avg_response_time}мс
            </div>
          </div>
        </div>

        {/* Дополнительная статистика */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700/50">
            <div className="flex items-center gap-3 mb-3">
              <MapPinIcon className="h-5 w-5 text-blue-400" />
              <span className="text-gray-300 font-medium">Распределение по сетям</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-blue-900/20 rounded-xl">
                <div className="text-2xl font-bold text-blue-300">{statistics.local_devices}</div>
                <div className="text-xs text-blue-400/80">Локальных</div>
              </div>
              <div className="text-center p-3 bg-purple-900/20 rounded-xl">
                <div className="text-2xl font-bold text-purple-300">{statistics.remote_devices}</div>
                <div className="text-xs text-purple-400/80">Удаленных</div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700/50">
            <div className="flex items-center gap-3 mb-3">
              <CpuChipIcon className="h-5 w-5 text-green-400" />
              <span className="text-gray-300 font-medium">Производительность</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Средняя задержка:</span>
                <span className="text-cyan-300">{statistics.avg_response_time} мс</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Проверок всего:</span>
                <span className="text-cyan-300">{statistics.total_checks}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Ошибок:</span>
                <span className="text-orange-300">{statistics.error_devices || 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700/50">
            <div className="flex items-center gap-3 mb-3">
              <ServerIcon className="h-5 w-5 text-cyan-400" />
              <span className="text-gray-300 font-medium">Популярные порты</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(statistics.port_distribution)
                .slice(0, 4)
                .map(([port, count]) => (
                  <div key={port} className="px-3 py-1 bg-gray-700/50 rounded-lg text-sm">
                    <span className="text-gray-300">{port}:</span>
                    <span className="ml-1 font-bold text-cyan-300">{count}</span>
                  </div>
                ))}
              {Object.keys(statistics.port_distribution).length > 4 && (
                <div className="px-3 py-1 bg-gray-700/30 rounded-lg text-sm text-gray-500">
                  +{Object.keys(statistics.port_distribution).length - 4} еще
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Панель управления */}
        <div className="flex justify-between items-center mb-8 p-4 bg-gray-800/50 rounded-2xl">
          <div className="text-gray-400">
            Последнее обновление: <span className="text-cyan-300 font-medium">{updatedAt}</span>
            <span className="mx-4">•</span>
            <span className="text-gray-500">Автообновление каждые 30 сек</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={refreshCache}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-300 rounded-xl hover:bg-purple-600/30 transition-all disabled:opacity-50"
              title="Очистить кэш и обновить"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Очистить кэш
            </button>
            <button
              onClick={() => fetchStatus(false)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl transition-all disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Обновление...' : 'Обновить'}
            </button>
          </div>
        </div>

        {/* Список устройств */}
        <div className="space-y-4">
          {servers.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-gray-800/30 rounded-3xl border border-gray-700/50">
              <DevicePhoneMobileIcon className="h-24 w-24 mx-auto mb-6 opacity-30" />
              <p className="text-2xl mb-2">Нет добавленных устройств</p>
              <p className="text-gray-600 max-w-md mx-auto">
                Добавьте ваши серверы, роутеры, камеры или принтеры для начала мониторинга
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-6 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl hover:opacity-90 transition-all"
              >
                <PlusIcon className="h-5 w-5 inline-block mr-2" />
                Добавить первое устройство
              </button>
            </div>
          ) : (
            servers.map((server) => (
              <div
                key={server.id}
                className={`bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border-2 transition-all hover:scale-[1.01] ${
                  server.status === 'online' 
                    ? 'border-green-500/30 hover:border-green-500/50' 
                    : server.status === 'checking'
                    ? 'border-yellow-500/30 hover:border-yellow-500/50'
                    : server.status === 'error'
                    ? 'border-orange-500/30 hover:border-orange-500/50'
                    : 'border-red-500/30 hover:border-red-500/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full mb-2 ${
                        server.status === 'online' ? 'bg-green-400' :
                        server.status === 'checking' ? 'bg-yellow-400 animate-pulse' :
                        server.status === 'error' ? 'bg-orange-400' :
                        'bg-red-400'
                      }`} />
                      {getDeviceIcon(server)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-white">
                          {server.name}
                        </h3>
                        <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${getStatusColor(server.status)}`}>
                          {getStatusText(server.status)}
                        </span>
                        {isLocalNetwork(server.host) && (
                          <span className="px-2 py-1 bg-blue-900/30 text-blue-300 text-xs rounded-lg border border-blue-700/50">
                            Локальный
                          </span>
                        )}
                      </div>
                      
                      <div className="text-gray-400 space-y-1">
                        <div className="flex items-center gap-4">
                          <span className="font-mono bg-gray-900/50 px-3 py-1 rounded-lg">
                            {server.host}:{server.port}
                          </span>
                          <span className="text-sm">
                            {getPortName(server.port)} • {getCheckTypeName(server.check_type)}
                            {server.check_type !== 'tcp' && server.path !== '/' && ` • ${server.path}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <MapPinIcon className="h-4 w-4" />
                            {server.location}
                          </span>
                          <span>•</span>
                          <span className="text-gray-500">
                            Последняя проверка: {new Date(server.last_check).toLocaleTimeString()}
                          </span>
                          {server.message && (
                            <>
                              <span>•</span>
                              <span className="text-orange-400/80 text-xs max-w-xs truncate" title={server.message}>
                                {server.message}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      {server.status === 'online' ? (
                        <>
                          <div className="text-3xl font-bold text-green-400">
                            {server.latency > 0 ? `${server.latency.toFixed(0)} мс` : 'Доступно'}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center justify-end gap-1">
                            <CheckCircleIcon className="h-4 w-4" /> 
                            {new Date(server.timestamp).toLocaleTimeString()}
                          </div>
                        </>
                      ) : server.status === 'checking' ? (
                        <div className="text-xl font-bold text-yellow-400 animate-pulse">
                          Проверяется...
                        </div>
                      ) : server.status === 'error' ? (
                        <div className="text-lg font-bold text-orange-400">
                          Ошибка проверки
                        </div>
                      ) : (
                        <div className="text-lg font-bold text-red-400">
                          Нет ответа
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(server)}
                        className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-xl hover:bg-blue-600/30 transition-all hover:border-blue-500/50"
                        title="Редактировать"
                      >
                        <PencilIcon className="h-5 w-5 text-blue-300" />
                      </button>
                      <button
                        onClick={() => testConnection(server.host, server.port, server.check_type, server.path)}
                        className="p-3 bg-green-600/20 border border-green-500/30 rounded-xl hover:bg-green-600/30 transition-all hover:border-green-500/50"
                        title="Проверить соединение"
                        disabled={testingConnection}
                      >
                        {testingConnection ? (
                          <div className="animate-spin h-5 w-5 border-2 border-green-300 border-t-transparent rounded-full"></div>
                        ) : (
                          <WifiIcon className="h-5 w-5 text-green-300" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteServer(server.id, server.name)}
                        className="p-3 bg-red-600/20 border border-red-500/30 rounded-xl hover:bg-red-600/30 transition-all hover:border-red-500/50"
                        title="Удалить"
                      >
                        <TrashIcon className="h-5 w-5 text-red-300" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Подсказки */}
        <div className="mt-12 p-6 bg-gray-800/50 rounded-2xl border border-gray-700/50">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <InformationCircleIcon className="h-6 w-6 text-cyan-400" />
            Советы по мониторингу
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-800/30 rounded-xl">
              <div className="text-cyan-400 font-medium mb-2">Типы проверок</div>
              <p className="text-gray-400 text-sm">
                <span className="text-green-400">HTTPS</span> - для защищенных сайтов (порт 443)<br/>
                <span className="text-blue-400">HTTP</span> - для обычных сайтов (порт 80)<br/>
                <span className="text-purple-400">TCP</span> - для любых других служб
              </p>
            </div>
            <div className="p-4 bg-gray-800/30 rounded-xl">
              <div className="text-cyan-400 font-medium mb-2">Локальные устройства</div>
              <p className="text-gray-400 text-sm">
                Для устройств в локальной сети используйте HTTP вместо HTTPS. Проверьте доступность портов в настройках брандмауэра устройства.
              </p>
            </div>
            <div className="p-4 bg-gray-800/30 rounded-xl">
              <div className="text-cyan-400 font-medium mb-2">Оптимальные настройки</div>
              <p className="text-gray-400 text-sm">
                • Таймаут: 3-5 сек для локальных, 5-10 сек для удаленных<br/>
                • Попытки: 2-3 для повышения надежности<br/>
                • Используйте тест подключения перед добавлением
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно добавления/редактирования */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-3xl p-8 max-w-2xl w-full border border-white/20 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold text-white">
                {editing ? 'Редактировать устройство' : 'Добавить устройство'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setEditing(null); }}
                className="p-2 hover:bg-gray-700 rounded-lg transition-all"
              >
                <XCircleIcon className="h-6 w-6 text-gray-400" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Название устройства *
                </label>
                <input
                  type="text"
                  placeholder="Например: Роутер в офисе, Веб-камера склада, Принтер бухгалтерии"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 text-lg focus:border-cyan-500 focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    IP адрес или домен *
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.1.1 или camera.local"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 text-lg focus:border-cyan-500 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Порт *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 80 })}
                    className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-xl text-white text-lg focus:border-cyan-500 focus:outline-none transition-all"
                  />
                  <div className="text-xs text-gray-500 mt-2">
                    {getPortName(form.port)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Тип проверки
                  </label>
                  <select
                    value={form.check_type}
                    onChange={(e) => setForm({ ...form, check_type: e.target.value as 'http' | 'https' | 'tcp' })}
                    className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-xl text-white text-lg focus:border-cyan-500 focus:outline-none transition-all"
                  >
                    <option value="https">HTTPS (веб-сайты с SSL)</option>
                    <option value="http">HTTP (обычные веб-сайты)</option>
                    <option value="tcp">TCP (любой порт, SSH, RDP, принтеры)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Локация
                  </label>
                  <input
                    type="text"
                    placeholder="Офис, ЦОД, Дом, Склад"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 text-lg focus:border-cyan-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {form.check_type !== 'tcp' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Путь (для HTTP/HTTPS проверки)
                  </label>
                  <input
                    type="text"
                    placeholder="/ или /status.html"
                    value={form.path}
                    onChange={(e) => setForm({ ...form, path: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 text-lg focus:border-cyan-500 focus:outline-none transition-all"
                  />
                  <div className="text-xs text-gray-500 mt-2">
                    Оставьте "/" для проверки главной страницы
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Таймаут (секунды)
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    max="30"
                    step="0.5"
                    value={form.timeout}
                    onChange={(e) => setForm({ ...form, timeout: parseFloat(e.target.value) || 5.0 })}
                    className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-xl text-white text-lg focus:border-cyan-500 focus:outline-none transition-all"
                  />
                  <div className="text-xs text-gray-500 mt-2">
                    3-5 сек для локальных, 5-10 для удаленных
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Количество попыток
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={form.retries}
                    onChange={(e) => setForm({ ...form, retries: parseInt(e.target.value) || 2 })}
                    className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-xl text-white text-lg focus:border-cyan-500 focus:outline-none transition-all"
                  />
                  <div className="text-xs text-gray-500 mt-2">
                    Повторные попытки при неудачной проверке
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-gray-700">
                <button
                  onClick={handleTestConnection}
                  disabled={!form.host || testingConnection}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600/20 border border-green-500/30 text-green-300 rounded-xl hover:bg-green-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingConnection ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-green-300 border-t-transparent rounded-full"></div>
                      Тестирование...
                    </>
                  ) : (
                    <>
                      <WifiIcon className="h-5 w-5" />
                      Проверить соединение
                    </>
                  )}
                </button>

                <div className="flex gap-4">
                  <button
                    onClick={() => { setShowModal(false); setEditing(null); }}
                    className="px-8 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-all font-medium"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={saveServer}
                    disabled={!form.name || !form.host}
                    className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl hover:opacity-90 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editing ? 'Сохранить' : 'Добавить устройство'}
                  </button>
                </div>
              </div>

              {isLocalNetwork(form.host) && (
                <div className="p-4 bg-blue-900/20 border border-blue-700/30 rounded-xl">
                  <div className="flex items-start gap-3">
                    <InformationCircleIcon className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-blue-300 font-medium mb-1">Локальное устройство</p>
                      <p className="text-blue-400/80 text-sm">
                        Убедитесь, что устройство включено и находится в той же сети, что и сервер мониторинга.
                        Для локальных адресов используйте порты 80 (HTTP) или стандартные порты служб.
                        HTTPS может не работать на локальных устройствах без SSL-сертификата.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerMonitor;