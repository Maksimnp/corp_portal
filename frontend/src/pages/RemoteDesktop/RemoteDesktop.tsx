import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../hooks/ThemeContext';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ComputerDesktopIcon, 
  EyeIcon, 
  CommandLineIcon,
  SignalIcon,
  SignalSlashIcon,
  PlayIcon,
  StopIcon,
  ArrowLeftIcon,
  CogIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowPathIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

interface PC {
  pc_id: string;
  username: string;
  pc_name: string;
  status: 'online' | 'offline';
  last_seen: string;
  system_info?: {
    hostname?: string;
    os?: string;
    ip_address?: string;
  };
  connection_type?: 'WebSocket' | 'REST'; 
}

interface RemoteSession {
  session_id: string;
  target_pc_id: string;
  session_type: 'view' | 'control';
  status: 'connected' | 'disconnected' | 'error' | 'pending';
}

const RemoteDesktop: React.FC = () => {
  const { theme } = useTheme();
  const [pcs, setPcs] = useState<PC[]>([]);
  const [selectedPc, setSelectedPc] = useState<PC | null>(null);
  const [sessionType, setSessionType] = useState<'view' | 'control'>('view');
  const [isConnected, setIsConnected] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPCs, setIsLoadingPCs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<RemoteSession | null>(null);
  const [userRole, setUserRole] = useState<string>('user');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const eventCleanupRef = useRef<(() => void) | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false);

  const getToken = useCallback(() => {
    try {
      return localStorage.getItem('token') || '';
    } catch (error) {
      console.error('Error getting token from localStorage:', error);
      return '';
    }
  }, []);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://192.1.66.117:8000';
  const WS_BASE = API_BASE.replace(/^http/, 'ws');

  const safeDisconnect = useCallback(() => {
    console.log('Safe disconnect called');
    
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }

    if (eventCleanupRef.current) {
      eventCleanupRef.current();
      eventCleanupRef.current = null;
    }

    if (wsRef.current) {
      const ws = wsRef.current;
      
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      
      (ws as any).disconnecting = true;
      
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        console.log('Sending end_session message');
        try {
          ws.send(JSON.stringify({
            type: 'end_session',
            session_id: activeSession?.session_id,
            reason: 'user_disconnect'
          }));
        } catch (e) {
          console.log('Error sending end_session:', e);
        }
        
        setTimeout(() => {
          try {
            ws.close(1000, 'Normal closure');
          } catch (e) {
            console.log('Error closing WebSocket:', e);
          }
        }, 100);
      } else {
        try {
          ws.close(1000, 'Normal closure');
        } catch (e) {
          console.log('Error closing WebSocket:', e);
        }
      }
      
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsPending(false);
    setIsLoading(false);
    setActiveSession(null);
    
    isConnectingRef.current = false;
    
    console.log('Disconnect completed');
  }, [activeSession]);

  const disconnect = useCallback(() => {
    console.log('UI Disconnect called');
    safeDisconnect();
  }, [safeDisconnect]);

  // useEffect(() => {
  //   isMountedRef.current = true;
  //   return () => {
  //     isMountedRef.current = false;
  //     console.log('Component unmounting, cleaning up...');
  //     safeDisconnect();
  //   };
  // }, [safeDisconnect]);

  const fetchPCs = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      setError(null);
      setIsLoadingPCs(true);
      const token = getToken();
      if (!token) {
        setError('Токен авторизации не найден. Пожалуйста, войдите снова.');
        setIsLoadingPCs(false);
        return;
      }

      console.log('Fetching PCs...');
      const response = await fetch(`${API_BASE}/api/remote/pcs`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('PCs data received:', data.pcs?.length || 0, 'PCs');
        if (isMountedRef.current) {
          setPcs(data.pcs || []);
          setUserRole(data.user_role || 'user');
        }
      } else if (response.status === 401) {
        setError('Ошибка авторизации. Пожалуйста, войдите снова.');
      } else {
        throw new Error(`HTTP error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching PCs:', error);
      setError('Не удалось загрузить список компьютеров');
    } finally {
      if (isMountedRef.current) {
        setIsLoadingPCs(false);
      }
    }
  }, [API_BASE, getToken]);

  const connectToPC = useCallback(async (pc: PC) => {
    if (!pc || pc.status !== 'online' || isConnectingRef.current) {
      setError('Выбранный компьютер недоступен для подключения');
      return;
    }
    isConnectingRef.current = true;

    console.log('Starting connection to PC:', pc.pc_id);
    
    // safeDisconnect();
    
    setIsLoading(true);
    setIsPending(false);
    setError(null);
    setSelectedPc(pc);

    try {
      const token = getToken();
      if (!token) {
        setError('Токен авторизации не найден');
        setIsLoading(false);
        isConnectingRef.current = false;
        return;
      }

      const wsUrl = `${WS_BASE}/api/remote/viewer?token=${encodeURIComponent(token)}`;
      console.log('Connecting to WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'blob';

      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        
        const message = {
          type: 'create_session',
          target_pc_id: pc.pc_id,
          session_type: sessionType,
          timestamp: Date.now()
        };
        
        console.log('Sending create_session:', message);
        ws.send(JSON.stringify(message));

        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 15000);

        connectionTimeoutRef.current = setTimeout(() => {
          if (!isConnected && !isPending) {
            console.log('Connection timeout');
            setError('Таймаут подключения к серверу');
            // safeDisconnect();
          }
        }, 10000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        console.log('WebSocket message received:', event.data);
        
        try {
          let data;
          if (typeof event.data === 'string') {
            data = JSON.parse(event.data);
          } else {
            return;
          }
          console.log('Parsed message:', data);

          if (data.type === 'pong') {
            console.log('Received pong');
            return;
          }

          switch (data.type) {
            case 'session_created':
              console.log('Session created, ID:', data.session_id);
              setIsPending(true);
              setIsLoading(false);
              setActiveSession({
                session_id: data.session_id,
                target_pc_id: pc.pc_id,
                session_type: sessionType,
                status: 'pending'
              });
              setError(null);
              
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
              }
              
              if (pendingTimeoutRef.current) {
                clearTimeout(pendingTimeoutRef.current);
              }
              pendingTimeoutRef.current = setTimeout(() => {
                if (isPending) {
                  console.log('Pending timeout - host did not respond');
                  setError('Таймаут: удалённый компьютер не ответил на запрос подключения (60 секунд)');
                  // safeDisconnect();
                }
              }, 60000);
              break;

            case 'session_accepted':
              console.log('Session accepted by host');
              setIsConnected(true);
              setIsPending(false);
              setIsLoading(false);
              setActiveSession(prev => prev ? { ...prev, status: 'connected' } : null);
              setError(null);
              
              if (pendingTimeoutRef.current) {
                clearTimeout(pendingTimeoutRef.current);
                pendingTimeoutRef.current = null;
              }
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
              }
              
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN && activeSession?.session_id) {
                  console.log('Requesting initial screen');
                  ws.send(JSON.stringify({
                    type: 'request_screen',
                    session_id: activeSession.session_id
                  }));
                }
              }, 500);
              break;

            case 'session_rejected':
              console.log('Session rejected by host:', data.message);
              setError(`Сессия отклонена: ${data.message || 'Неизвестная причина'}`);
              // safeDisconnect();
              break;

            case 'screen_data':
              console.log('Received screen data');
              renderScreen(data.data);
              break;

            case 'session_error':
              console.log('Session error:', data.message);
              setError(`Ошибка сессии: ${data.message || 'Неизвестная ошибка'}`);
              // safeDisconnect();
              break;

            case 'session_ended':
              console.log('Session ended by remote side');
              setError('Сессия завершена удалённой стороной');
              // safeDisconnect();
              break;

            case 'auth_error':
              console.log('Auth error:', data.message);
              setError(`Ошибка авторизации: ${data.message}`);
              // safeDisconnect();
              break;

            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (parseError) {
          console.error('Error parsing WebSocket message:', parseError);
          setError('Ошибка обработки данных от сервера');
        }
      };

      ws.onclose = (event) => {
        if ((ws as any).disconnecting) return;
        console.log('WebSocket closed:', event.code, event.reason);
        
        if (event.code !== 1000) {
          const reason = event.reason || 'Неизвестная ошибка';
          console.log(`Connection closed abnormally: ${event.code} - ${reason}`);
          if (isMountedRef.current) {
            setError(`Соединение прервано: ${reason}`);
          }
        }
        
        if (isMountedRef.current) {
          setIsConnected(false);
          setIsPending(false);
          setIsLoading(false);
        }
        
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        isConnectingRef.current = false;
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (isMountedRef.current) {
          setError('Ошибка подключения к серверу');
        }
        isConnectingRef.current = false;
      };

    } catch (error) {
      console.error('Error in connectToPC:', error);
      setError('Ошибка при подключении к компьютеру');
      setIsLoading(false);
      isConnectingRef.current = false;
    }
  }, [getToken, sessionType, isConnected, isPending, activeSession, safeDisconnect, WS_BASE]);

  const renderScreen = useCallback((screenData: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (screenData && screenData.image && screenData.image !== 'base64_fake_image_data_placeholder') {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      };
      const format = screenData.format || 'jpeg';
      img.src = `data:image/${format};base64,${screenData.image}`;
    } else {
      ctx.fillStyle = theme === 'dark' ? '#1f2937' : '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = theme === 'dark' ? '#6b7280' : '#9ca3af';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Экран удалённого компьютера', canvas.width / 2, canvas.height / 2);
      if (selectedPc) {
        ctx.font = '14px Arial';
        ctx.fillText(selectedPc.pc_name, canvas.width / 2, canvas.height / 2 + 30);
      }
    }
  }, [theme, selectedPc]);

  const refreshPCStatuses = useCallback(async () => {
    if (userRole !== 'admin' && userRole !== 'user' ) return;
    
    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/remote/refresh-status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        setError(`Статусы обновлены: ${result.message}`);
        fetchPCs();
      } else {
        throw new Error('Failed to refresh');
      }
    } catch (error) {
      console.error('Error refreshing status:', error);
      setError('Ошибка при обновлении статусов');
    }
  }, [userRole, getToken, API_BASE, fetchPCs]);

  const getAdminStats = useCallback(async () => {
    if (userRole !== 'admin') return;
    
    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/remote/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        const stats = result.stats.detailed || {};
        setError(`Статистика: ${stats.active_pc_count || 0} активных ПК, ${stats.active_remote_sessions_count || 0} сессий`);
      } else {
        throw new Error('Failed to get stats');
      }
    } catch (error) {
      console.error('Error getting stats:', error);
    }
  }, [userRole, getToken, API_BASE]);

  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (isPending || isConnected) {
      if (!window.confirm('Сессия активна! Отключиться и уйти?')) return;
      // safeDisconnect();
    }
    navigate('/dashboard');
  }, [isPending, isConnected, safeDisconnect, navigate]);

  useEffect(() => {
    fetchPCs();
    
    const interval = setInterval(fetchPCs, 30000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchPCs]);

  useEffect(() => {
    if (!isConnected || !canvasRef.current || !activeSession || !wsRef.current) return;

    const canvas = canvasRef.current;

    const handleMouseEvent = (event: MouseEvent, action: string) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      
      wsRef.current.send(JSON.stringify({
        type: 'remote_command',
        session_id: activeSession.session_id,
        command: {
          type: 'mouse',
          x: Math.round(x),
          y: Math.round(y),
          action: action,
          button: event.button,
          timestamp: Date.now()
        }
      }));
    };

    const handleKeyEvent = (event: KeyboardEvent, action: string) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      
      if (['F1', 'F5', 'F11', 'F12'].includes(event.key)) {
        event.preventDefault();
      }
      
      wsRef.current.send(JSON.stringify({
        type: 'remote_command',
        session_id: activeSession.session_id,
        command: {
          type: 'keyboard',
          key: event.key,
          code: event.code,
          action: action,
          modifiers: {
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey
          },
          timestamp: Date.now()
        }
      }));
    };

    const mouseListeners: Array<[string, (e: MouseEvent) => void]> = [
      ['mousedown', (e) => handleMouseEvent(e, 'mousedown')],
      ['mouseup', (e) => handleMouseEvent(e, 'mouseup')],
      ['mousemove', (e) => handleMouseEvent(e, 'mousemove')],
      ['click', (e) => handleMouseEvent(e, 'click')],
      ['dblclick', (e) => handleMouseEvent(e, 'dblclick')],
    ];

    mouseListeners.forEach(([type, listener]) => canvas.addEventListener(type as any, listener));

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      handleMouseEvent(e, 'contextmenu');
    });
    
    const keyListeners: Array<[string, (e: KeyboardEvent) => void]> = [
      ['keydown', (e) => handleKeyEvent(e, 'keydown')],
      ['keyup', (e) => handleKeyEvent(e, 'keyup')],
    ];

    keyListeners.forEach(([type, listener]) => document.addEventListener(type as any, listener));

    canvas.tabIndex = 0;
    canvas.focus();

    eventCleanupRef.current = () => {
      mouseListeners.forEach(([type, listener]) => canvas.removeEventListener(type as any, listener));
      canvas.removeEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleMouseEvent(e, 'contextmenu');
      });
      
      keyListeners.forEach(([type, listener]) => document.removeEventListener(type as any, listener));
    };

    return () => {
      if (eventCleanupRef.current) {
        eventCleanupRef.current();
        eventCleanupRef.current = null;
      }
    };
  }, [isConnected, activeSession]);

  const sendSpecialCommand = (command: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !activeSession) {
      setError('Нет активного соединения');
      return;
    }
    
    const commands: { [key: string]: any } = {
      'Ctrl+Alt+Del': { type: 'keyboard', keys: ['Control', 'Alt', 'Delete'], action: 'press' },
      'Alt+Tab': { type: 'keyboard', keys: ['Alt', 'Tab'], action: 'press' },
      'ESC': { type: 'keyboard', key: 'Escape', action: 'keydown' },
      'Print Screen': { type: 'keyboard', key: 'PrintScreen', action: 'keydown' }
    };
    
    if (commands[command]) {
      wsRef.current.send(JSON.stringify({
        type: 'remote_command',
        session_id: activeSession.session_id,
        command: commands[command]
      }));
      console.log(`Sent special command: ${command}`);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${
      theme === 'dark'
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white'
        : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50 text-gray-800'
    } py-6 px-4`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-3xl shadow-2xl ${
              theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}>
              <ComputerDesktopIcon className="h-8 w-8 text-cyan-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                Удалённое управление ПК
              </h1>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>
                {userRole === 'admin' 
                  ? 'Администратор: полный доступ ко всем компьютерам' 
                  : 'Удалённый доступ к вашим компьютерам'}
                {userRole === 'admin' && (
                  <span className="ml-2 px-2 py-1 text-xs bg-purple-600 text-white rounded-lg">
                    АДМИНИСТРАТОР
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={handleBack}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
              theme === 'dark'
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            } border shadow-lg`}
          >
            <ArrowLeftIcon className="h-5 w-5" />
            На главную
          </button>
        </div>

        {error && (
          <div className={`mb-6 p-4 rounded-2xl border-l-4 ${
            theme === 'dark'
              ? 'bg-red-900/30 border-red-500 text-red-300'
              : 'bg-red-50/30 border-red-500 text-red-800'
          }`}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ExclamationTriangleIcon className="h-5 w-5" />
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium">{error}</p>
                <div className="mt-2 flex gap-2">
                  <button 
                    onClick={() => setError(null)}
                    className={`text-xs px-3 py-1 rounded-lg ${
                      theme === 'dark' 
                        ? 'bg-red-800 hover:bg-red-700' 
                        : 'bg-red-200 hover:bg-red-300'
                    } transition-colors`}
                  >
                    Скрыть
                  </button>
                  <button 
                    onClick={fetchPCs}
                    className={`text-xs px-3 py-1 rounded-lg ${
                      theme === 'dark' 
                        ? 'bg-blue-800 hover:bg-blue-700' 
                        : 'bg-blue-200 hover:bg-blue-300'
                    } transition-colors`}
                  >
                    Обновить
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={`rounded-3xl p-6 shadow-2xl border-2 ${
            theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>
                {userRole === 'admin' ? 'Все компьютеры' : 'Мои компьютеры'}
                {pcs.length > 0 && (
                  <span className={`text-sm ml-2 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    ({pcs.filter(pc => pc.status === 'online').length}/{pcs.length} онлайн)
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {isLoadingPCs && (
                  <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                )}
                <button
                  onClick={fetchPCs}
                  disabled={isLoadingPCs}
                  className={`p-2 rounded-xl transition-colors ${
                    theme === 'dark'
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50'
                  }`}
                  title="Обновить список"
                >
                  <CogIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {userRole === 'admin' && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={refreshPCStatuses}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    theme === 'dark'
                      ? 'bg-purple-600 text-white hover:bg-purple-500'
                      : 'bg-purple-500 text-white hover:bg-purple-400'
                  }`}
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Обновить статусы
                </button>
                <button
                  onClick={getAdminStats}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    theme === 'dark'
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'bg-blue-500 text-white hover:bg-blue-400'
                  }`}
                >
                  <ChartBarIcon className="h-4 w-4" />
                  Статистика
                </button>
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {pcs.map((pc) => (
                <div
                  key={pc.pc_id}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                    selectedPc?.pc_id === pc.pc_id
                      ? theme === 'dark'
                        ? 'bg-cyan-900 border-cyan-600'
                        : 'bg-blue-100 border-blue-400'
                      : theme === 'dark'
                        ? 'bg-gray-800 border-gray-600 hover:border-cyan-600'
                        : 'bg-gray-50 border-gray-300 hover:border-blue-400'
                  } ${pc.status === 'offline' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => pc.status === 'online' && setSelectedPc(pc)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        pc.status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium truncate">{pc.pc_name}</h3>
                        <p className={`text-sm truncate ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                        }`}>
                          {userRole === 'admin' ? `Пользователь: ${pc.username}` : pc.username}
                        </p>
                      </div>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-2xl ${
                      pc.status === 'online'
                        ? theme === 'dark'
                          ? 'bg-green-900 text-green-200'
                          : 'bg-green-100 text-green-700'
                        : theme === 'dark'
                          ? 'bg-red-900 text-red-200'
                          : 'bg-red-100 text-red-700'
                    }`}>
                      {pc.status === 'online' ? 'Online' : 'Offline'}
                    </div>
                  </div>
                  {pc.system_info && (
  <div className={`text-xs mt-2 ${
    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
  }`}>
    <div>ОС: {pc.system_info.os || 'Неизвестно'}</div>
    <div>IP: {pc.system_info.ip_address || 'Неизвестно'}</div>
    <div>Тип: {pc.connection_type || 'WebSocket'}</div>
    <div>Обновлено: {new Date(pc.last_seen).toLocaleTimeString()}</div>
  </div>
)}
                </div>
              ))}
              {pcs.length === 0 && !isLoadingPCs && (
                <div className={`text-center py-8 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  <ComputerDesktopIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Нет доступных компьютеров</p>
                  <button 
                    onClick={fetchPCs}
                    className={`mt-2 px-4 py-2 rounded-xl ${
                      theme === 'dark' 
                        ? 'bg-gray-700 hover:bg-gray-600' 
                        : 'bg-gray-200 hover:bg-gray-300'
                    } transition-colors`}
                  >
                    Обновить
                  </button>
                </div>
              )}
              {isLoadingPCs && pcs.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
                    Загрузка списка компьютеров...
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className={`rounded-3xl p-6 shadow-2xl border-2 ${
            theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <h2 className={`text-xl font-semibold mb-4 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              Управление сессией
            </h2>
            {selectedPc ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl ${
                  theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                }`}>
                  <h3 className="font-medium mb-2">Выбранный компьютер:</h3>
                  <p className="text-sm opacity-75">{selectedPc.pc_name}</p>
                  <p className="text-xs opacity-60">{selectedPc.username}</p>
                  <p className={`text-xs mt-1 ${
                    selectedPc.status === 'online' 
                      ? theme === 'dark' ? 'text-green-400' : 'text-green-600'
                      : theme === 'dark' ? 'text-red-400' : 'text-red-600'
                  }`}>
                    Статус: {selectedPc.status === 'online' ? 'Онлайн' : 'Офлайн'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Тип подключения:</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSessionType('view')}
                      disabled={isConnected || isPending || selectedPc.status !== 'online'}
                      className={`flex-1 p-3 rounded-2xl border-2 transition-all duration-300 ${
                        sessionType === 'view'
                          ? theme === 'dark'
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'bg-blue-500 border-blue-400 text-white'
                          : theme === 'dark'
                            ? 'bg-gray-800 border-gray-600 text-gray-300 hover:border-cyan-600'
                            : 'bg-gray-100 border-gray-300 text-gray-600 hover:border-blue-400'
                      } ${(isConnected || isPending || selectedPc.status !== 'online') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <EyeIcon className="h-5 w-5 mx-auto mb-1" />
                      <span className="text-xs">Только просмотр</span>
                    </button>
                    <button
                      onClick={() => setSessionType('control')}
                      disabled={isConnected || isPending || selectedPc.status !== 'online'}
                      className={`flex-1 p-3 rounded-2xl border-2 transition-all duration-300 ${
                        sessionType === 'control'
                          ? theme === 'dark'
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'bg-blue-500 border-blue-400 text-white'
                          : theme === 'dark'
                            ? 'bg-gray-800 border-gray-600 text-gray-300 hover:border-cyan-600'
                            : 'bg-gray-100 border-gray-300 text-gray-600 hover:border-blue-400'
                      } ${(isConnected || isPending || selectedPc.status !== 'online') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <CommandLineIcon className="h-5 w-5 mx-auto mb-1" />
                      <span className="text-xs">Полное управление</span>
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isConnected && !isPending ? (
                    <button
                      onClick={() => connectToPC(selectedPc)}
                      disabled={isLoading || selectedPc.status !== 'online'}
                      className={`flex-1 p-4 rounded-2xl border-2 transition-all duration-300 flex items-center justify-center gap-2 ${
                        isLoading || selectedPc.status !== 'online'
                          ? theme === 'dark'
                            ? 'bg-gray-700 border-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed'
                          : theme === 'dark'
                            ? 'bg-green-600 border-green-500 text-white hover:bg-green-500'
                            : 'bg-green-500 border-green-400 text-white hover:bg-green-400'
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Подключение...
                        </>
                      ) : (
                        <>
                          <PlayIcon className="h-5 w-5" />
                          Подключиться
                        </>
                      )}
                    </button>
                  ) : isPending ? (
                    <button
                      disabled
                      className={`flex-1 p-4 rounded-2xl border-2 flex items-center justify-center gap-2 ${
                        theme === 'dark'
                          ? 'bg-yellow-900 border-yellow-700 text-yellow-200'
                          : 'bg-yellow-100 border-yellow-300 text-yellow-700'
                      }`}
                    >
                      <ClockIcon className="h-5 w-5 animate-pulse" />
                      Ожидание подтверждения...
                    </button>
                  ) : (
                    <button
                      onClick={disconnect}
                      className={`flex-1 p-4 rounded-2xl border-2 transition-all duration-300 flex items-center justify-center gap-2 ${
                        theme === 'dark'
                          ? 'bg-red-600 border-red-500 text-white hover:bg-red-500'
                          : 'bg-red-500 border-red-400 text-white hover:bg-red-400'
                      }`}
                    >
                      <StopIcon className="h-5 w-5" />
                      Отключиться
                    </button>
                  )}
                </div>

                <div className={`p-3 rounded-2xl text-center ${
                  isConnected
                    ? theme === 'dark'
                      ? 'bg-green-900 text-green-200'
                      : 'bg-green-100 text-green-700'
                    : isPending
                    ? theme === 'dark'
                      ? 'bg-yellow-900 text-yellow-200'
                      : 'bg-yellow-100 text-yellow-700'
                    : theme === 'dark'
                    ? 'bg-gray-800 text-gray-300'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  <div className="flex items-center justify-center gap-2">
                    {isConnected ? (
                      <>
                        <SignalIcon className="h-4 w-4 animate-pulse" />
                        <span>Подключено к {selectedPc.pc_name}</span>
                        {activeSession && (
                          <span className="text-xs opacity-75">
                            ({activeSession.session_type === 'view' ? 'просмотр' : 'управление'})
                          </span>
                        )}
                      </>
                    ) : isPending ? (
                      <>
                        <ClockIcon className="h-4 w-4 animate-spin" />
                        <span>Ожидание подтверждения...</span>
                      </>
                    ) : (
                      <>
                        <SignalSlashIcon className="h-4 w-4" />
                        <span>Не подключено</span>
                      </>
                    )}
                  </div>
                </div>

                {activeSession && (
                  <div className={`p-3 rounded-2xl ${
                    theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-50/30'
                  }`}>
                    <p className="text-sm text-center break-all">
                      ID сессии: {activeSession.session_id}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className={`text-center py-8 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                <ComputerDesktopIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Выберите компьютер для подключения</p>
                <p className="text-sm mt-2 opacity-75">
                  Нажмите на компьютер из списка слева
                </p>
              </div>
            )}
          </div>

          <div className={`lg:col-span-2 rounded-3xl p-6 shadow-2xl border-2 ${
            theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <h2 className={`text-xl font-semibold mb-4 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              Удалённый экран {selectedPc && `- ${selectedPc.pc_name}`}
            </h2>
            <div className={`rounded-2xl border-2 aspect-video flex items-center justify-center overflow-hidden relative ${
              theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'
            } ${isConnected ? 'cursor-crosshair' : ''}`}>
              {isConnected ? (
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  width={1920}
                  height={1080}
                />
              ) : (
                <div className="text-center p-8">
                  <ComputerDesktopIcon className="h-16 w-16 mx-auto mb-3 opacity-30" />
                  <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
                    {isPending
                      ? 'Ожидание подтверждения от удалённого компьютера...'
                      : selectedPc
                        ? selectedPc.status === 'online'
                          ? 'Нажмите "Подключиться" для начала сессии'
                          : 'Компьютер в настоящее время недоступен'
                        : 'Выберите компьютер для просмотра'}
                  </p>
                  {selectedPc && selectedPc.status === 'offline' && (
                    <p className={`text-sm mt-2 ${
                      theme === 'dark' ? 'text-red-400' : 'text-red-500'
                    }`}>
                      Статус: Офлайн - последняя активность {new Date(selectedPc.last_seen).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            {isConnected && (
              <div className="mt-4 flex flex-wrap gap-2">
                {['Ctrl+Alt+Del', 'Alt+Tab', 'ESC', 'Print Screen'].map((command) => (
                  <button
                    key={command}
                    onClick={() => sendSpecialCommand(command)}
                    className={`px-4 py-2 rounded-2xl border-2 transition-all duration-300 ${
                      theme === 'dark'
                        ? 'bg-gray-800 border-gray-600 text-gray-300 hover:border-cyan-600'
                        : 'bg-gray-100 border-gray-300 text-gray-600 hover:border-blue-400'
                    }`}
                  >
                    {command}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RemoteDesktop;