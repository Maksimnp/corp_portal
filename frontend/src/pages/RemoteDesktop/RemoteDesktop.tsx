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
  ChartBarIcon,
  FolderIcon,
  DocumentIcon,
  //TerminalIcon,
  ClipboardIcon,
  SpeakerWaveIcon,
  WrenchIcon,
  UserGroupIcon,
  TrashIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  //ComputerIcon,
  XMarkIcon
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
    cpu_cores?: number;
    total_memory?: number;
  };
  connection_type?: 'WebSocket' | 'REST';
  capabilities?: {
    file_transfer?: boolean;
    audio_transfer?: boolean;
    clipboard_sync?: boolean;
    remote_shell?: boolean;
    multi_monitor?: boolean;
  };
}

interface RemoteSession {
  session_id: string;
  target_pc_id: string;
  session_type: 'view' | 'control';
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  capabilities?: {
    file_transfer?: boolean;
    remote_shell?: boolean;
    clipboard_sync?: boolean;
  };
}

interface FileItem {
  name: string;
  is_directory: boolean;
  size: number;
  modified: number;
  permissions?: string;
}

const RemoteDesktop: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  
  // State management
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
  
  // Advanced features state
  const [activeTab, setActiveTab] = useState<'remote' | 'files' | 'shell' | 'clipboard'>('remote');
  const [fileManagerPath, setFileManagerPath] = useState('/');
  const [fileManagerFiles, setFileManagerFiles] = useState<FileItem[]>([]);
  const [shellOutput, setShellOutput] = useState<string>('');
  const [shellCommand, setShellCommand] = useState<string>('');
  const [clipboardContent, setClipboardContent] = useState<string>('');
  const [transferProgress, setTransferProgress] = useState<number>(0);
  const [selectedMonitor, setSelectedMonitor] = useState<number>(1);
  const [availableMonitors, setAvailableMonitors] = useState<number[]>([1]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shellEndRef = useRef<HTMLDivElement>(null);
  const remoteScreenRef = useRef<HTMLDivElement>(null);
  
  // WebSocket and connection management
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

  // Enhanced connection management
  const safeDisconnect = useCallback(() => {
    console.log('Safe disconnect called');
    
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
      
      if (ws.readyState === WebSocket.OPEN) {
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
    setActiveTab('remote');
    setFileManagerPath('/');
    setFileManagerFiles([]);
    setShellOutput('');
    setShellCommand('');
    setClipboardContent('');
    
    isConnectingRef.current = false;
    
    console.log('Disconnect completed');
  }, [activeSession]);

  const disconnect = useCallback(() => {
    console.log('UI Disconnect called');
    safeDisconnect();
  }, [safeDisconnect]);

  

  // Enhanced PC management
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

  // Enhanced connection handler
  const connectToPC = useCallback(async (pc: PC) => {
    if (!pc || pc.status !== 'online' || isConnectingRef.current) {
      setError('Выбранный компьютер недоступен для подключения');
      return;
    }
    
    isConnectingRef.current = true;
    safeDisconnect();
    
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

      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        
        const message = {
          type: 'create_session',
          target_pc_id: pc.pc_id,
          session_type: sessionType,
          timestamp: Date.now(),
          requested_capabilities: {
            file_transfer: true,
            remote_shell: true,
            clipboard_sync: true
          }
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
            safeDisconnect();
          }
        }, 10000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
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
  }, [getToken, sessionType, isConnected, isPending, safeDisconnect, WS_BASE]);

  // Enhanced message handler
  const handleWebSocketMessage = useCallback((data: any) => {
    console.log('WebSocket message received:', data);

    switch (data.type) {
      case 'session_created':
        console.log('Session created, ID:', data.session_id);
        setIsPending(true);
        setIsLoading(false);
        setActiveSession({
          session_id: data.session_id,
          target_pc_id: selectedPc?.pc_id || '',
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
            safeDisconnect();
          }
        }, 60000);
        break;

      case 'session_accepted':
        console.log('Session accepted by host');
        setIsConnected(true);
        setIsPending(false);
        setIsLoading(false);
        setActiveSession(prev => prev ? { 
          ...prev, 
          status: 'connected',
          capabilities: data.allowed_capabilities 
        } : null);
        setError(null);
        
        if (pendingTimeoutRef.current) {
          clearTimeout(pendingTimeoutRef.current);
          pendingTimeoutRef.current = null;
        }
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        
        if (data.monitors) {
          setAvailableMonitors(data.monitors.map((m: any) => m.id));
        }
        
        // Request initial screen
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && activeSession?.session_id) {
            console.log('Requesting initial screen');
            wsRef.current.send(JSON.stringify({
              type: 'request_screen',
              session_id: activeSession.session_id,
              monitor_id: selectedMonitor
            }));
          }
        }, 500);
        break;

      case 'session_rejected':
        console.log('Session rejected by host:', data.message);
        setError(`Сессия отклонена: ${data.message || 'Неизвестная причина'}`);
        safeDisconnect();
        break;

      case 'screen_data':
        console.log('Received screen data');
        renderScreen(data.data);
        break;

      case 'file_transfer_response':
        handleFileTransferResponse(data);
        break;

      case 'remote_shell_response':
        setShellOutput(prev => 
          prev + `\n$ ${data.command || 'command'}\n${data.output}${data.error ? `\nError: ${data.error}` : ''}\n`
        );
        break;

      case 'clipboard_update':
        setClipboardContent(data.content?.content || '');
        break;

      case 'session_error':
        console.log('Session error:', data.message);
        setError(`Ошибка сессии: ${data.message || 'Неизвестная ошибка'}`);
        safeDisconnect();
        break;

      case 'session_ended':
        console.log('Session ended by remote side');
        setError('Сессия завершена удалённой стороной');
        safeDisconnect();
        break;

      case 'auth_error':
        console.log('Auth error:', data.message);
        setError(`Ошибка авторизации: ${data.message}`);
        safeDisconnect();
        break;

      case 'pong':
        console.log('Received pong');
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }, [selectedPc, sessionType, isPending, activeSession, selectedMonitor, safeDisconnect]);

  // Enhanced file transfer handling
  const handleFileTransferResponse = useCallback((data: any) => {
    switch (data.operation) {
      case 'list_directory':
        if (data.success) {
          setFileManagerFiles(data.items || []);
        } else {
          setError(`Ошибка чтения директории: ${data.error}`);
        }
        break;
        
      case 'download':
        if (data.success && data.file_data) {
          // Download file
          const fileData = data.file_data;
          const blob = new Blob([
            new Uint8Array(atob(fileData.content).split('').map(char => char.charCodeAt(0)))
          ]);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileData.name;
          a.click();
          URL.revokeObjectURL(url);
          setError(`Файл "${fileData.name}" успешно скачан`);
        } else {
          setError(`Ошибка скачивания: ${data.error}`);
        }
        break;
        
      case 'upload':
        if (data.success) {
          listDirectory(fileManagerPath); // Refresh file list
          setError(`Файл успешно загружен в ${data.path}`);
          setShowFileUpload(false);
          setUploadFile(null);
        } else {
          setError(`Ошибка загрузки: ${data.error}`);
        }
        break;

      case 'create_directory':
        if (data.success) {
          listDirectory(fileManagerPath);
          setError(`Директория создана: ${data.path}`);
        } else {
          setError(`Ошибка создания директории: ${data.error}`);
        }
        break;

      case 'delete':
        if (data.success) {
          listDirectory(fileManagerPath);
          setError('Элемент успешно удален');
        } else {
          setError(`Ошибка удаления: ${data.error}`);
        }
        break;
    }
  }, [fileManagerPath]);

  // Enhanced screen rendering
  const renderScreen = useCallback((screenData: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (screenData && screenData.image) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      };
      
      img.src = `data:image/jpeg;base64,${screenData.image}`;
    } else {
      // Placeholder when no data
      ctx.fillStyle = theme === 'dark' ? '#1f2937' : '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = theme === 'dark' ? '#6b7280' : '#9ca3af';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Экран удалённого компьютера', canvas.width / 2, canvas.height / 2);
    }
  }, [theme]);

  // Enhanced file operations
  const listDirectory = useCallback((path: string = '/') => {
    if (!activeSession || !wsRef.current) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'file_transfer',
      session_id: activeSession.session_id,
      operation: 'list_directory',
      directory_path: path
    }));
    
    setFileManagerPath(path);
  }, [activeSession]);

  const handleFileUpload = useCallback(() => {
    if (!activeSession || !wsRef.current || !uploadFile) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target?.result as ArrayBuffer;
      const base64Content = btoa(
        new Uint8Array(fileContent).reduce(
          (data, byte) => data + String.fromCharCode(byte), ''
        )
      );
      
      wsRef.current?.send(JSON.stringify({
        type: 'file_transfer',
        session_id: activeSession.session_id,
        operation: 'upload',
        file_data: {
          name: uploadFile.name,
          size: uploadFile.size,
          content: base64Content
        },
        remote_path: fileManagerPath
      }));
    };
    reader.readAsArrayBuffer(uploadFile);
  }, [activeSession, fileManagerPath, uploadFile]);

  const downloadFile = useCallback((filePath: string, fileName: string) => {
    if (!activeSession || !wsRef.current) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'file_transfer',
      session_id: activeSession.session_id,
      operation: 'download',
      file_path: filePath
    }));
  }, [activeSession]);

  const createDirectory = useCallback((dirName: string) => {
    if (!activeSession || !wsRef.current) return;
    
    const newPath = `${fileManagerPath}/${dirName}`.replace('//', '/');
    wsRef.current.send(JSON.stringify({
      type: 'file_transfer',
      session_id: activeSession.session_id,
      operation: 'create_directory',
      directory_path: newPath
    }));
  }, [activeSession, fileManagerPath]);

  const deleteItem = useCallback((itemPath: string) => {
    if (!activeSession || !wsRef.current) return;
    
    if (window.confirm(`Вы уверены, что хотите удалить ${itemPath}?`)) {
      wsRef.current.send(JSON.stringify({
        type: 'file_transfer',
        session_id: activeSession.session_id,
        operation: 'delete',
        path: itemPath
      }));
    }
  }, [activeSession]);

  // Enhanced shell operations
  const executeShellCommand = useCallback((command: string) => {
    if (!activeSession || !wsRef.current) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'remote_shell',
      session_id: activeSession.session_id,
      command: command
    }));
    setShellCommand('');
  }, [activeSession]);

  // Enhanced clipboard operations
  const syncClipboard = useCallback((content: string) => {
    if (!activeSession || !wsRef.current) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'clipboard_sync',
      session_id: activeSession.session_id,
      operation: 'set',
      content: {
        type: 'text',
        content: content
      }
    }));
    setError('Буфер обмена синхронизирован');
  }, [activeSession]);

  // Enhanced input handlers
  const handleMouseEvent = useCallback((event: MouseEvent, action: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN || !activeSession) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let x = (event.clientX - rect.left) * scaleX;
    let y = (event.clientY - rect.top) * scaleY;
    
    x = Math.max(0, Math.min(x, canvas.width - 1));
    y = Math.max(0, Math.min(y, canvas.height - 1));
    
    const normalizedX = Math.round(x);
    const normalizedY = Math.round(y);
    
    console.log(`Mouse ${action} at canvas(${normalizedX}, ${normalizedY})`);
    
    wsRef.current.send(JSON.stringify({
      type: 'remote_command',
      session_id: activeSession.session_id,
      command: {
        type: 'mouse',
        x: normalizedX,
        y: normalizedY,
        action: action,
        button: event.button,
        timestamp: Date.now()
      }
    }));
  }, [activeSession]);

  const handleKeyEvent = useCallback((event: KeyboardEvent, action: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN || !activeSession) return;
    
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
  }, [activeSession]);

  // Admin functions
  const refreshPCStatuses = useCallback(async () => {
    if (userRole !== 'admin') return;
    
    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/remote/admin/refresh-status`, {
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
        const stats = result.stats || {};
        setError(`Статистика: ${stats.active_sessions || 0} активных сессий, ${stats.online_pcs || 0} ПК онлайн`);
      } else {
        throw new Error('Failed to get stats');
      }
    } catch (error) {
      console.error('Error getting stats:', error);
    }
  }, [userRole, getToken, API_BASE]);

  // Special commands
  const sendSpecialCommand = (command: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !activeSession) {
      setError('Нет активного соединения');
      return;
    }
    
    const commands: { [key: string]: any } = {
      'Ctrl+Alt+Del': { type: 'keyboard', keys: ['Control', 'Alt', 'Delete'], action: 'press' },
      'Alt+Tab': { type: 'keyboard', keys: ['Alt', 'Tab'], action: 'press' },
      'ESC': { type: 'keyboard', key: 'Escape', action: 'press' },
      'Print Screen': { type: 'keyboard', key: 'PrintScreen', action: 'press' },
      'Win+L': { type: 'keyboard', keys: ['Win', 'L'], action: 'press' }
    };
    
    if (commands[command]) {
      wsRef.current.send(JSON.stringify({
        type: 'remote_command',
        session_id: activeSession.session_id,
        command: commands[command]
      }));
      console.log(`Sent special command: ${command}`);
      setError(`Команда отправлена: ${command}`);
    }
  };

  // Request screen update
  const requestScreenUpdate = useCallback(() => {
    if (!activeSession || !wsRef.current) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'request_screen',
      session_id: activeSession.session_id,
      monitor_id: selectedMonitor
    }));
  }, [activeSession, selectedMonitor]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!remoteScreenRef.current) return;
    
    if (!isFullscreen) {
      if (remoteScreenRef.current.requestFullscreen) {
        remoteScreenRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Navigation
  const handleBack = useCallback(() => {
    if (isPending || isConnected) {
      if (!window.confirm('Сессия активна! Отключиться и уйти?')) return;
      safeDisconnect();
    }
    navigate('/dashboard');
  }, [isPending, isConnected, safeDisconnect, navigate]);

  // Initialize
  useEffect(() => {
    fetchPCs();
    
    const interval = setInterval(fetchPCs, 30000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchPCs]);

  // Setup input handlers when connected
  useEffect(() => {
    if (!isConnected || !canvasRef.current || !activeSession) return;

    const canvas = canvasRef.current;

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
  }, [isConnected, activeSession, handleMouseEvent, handleKeyEvent]);

  // Auto-scroll shell output
  useEffect(() => {
    shellEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [shellOutput]);

  // File Manager Component
  const FileManager = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => listDirectory('/')}
            className={`p-2 rounded-lg ${
              theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Корневая директория"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => listDirectory(fileManagerPath.split('/').slice(0, -1).join('/') || '/')}
            className={`p-2 rounded-lg ${
              theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            title="Назад"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
          <span className="text-sm font-mono bg-opacity-50 px-2 py-1 rounded">
            {fileManagerPath}
          </span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowFileUpload(true)}
            className={`flex items-center space-x-1 px-3 py-2 rounded-lg ${
              theme === 'dark' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-400'
            } text-white`}
          >
            <PlusIcon className="h-4 w-4" />
            <span>Загрузить</span>
          </button>
          <button
            onClick={() => {
              const dirName = prompt('Введите название директории:');
              if (dirName) createDirectory(dirName);
            }}
            className={`flex items-center space-x-1 px-3 py-2 rounded-lg ${
              theme === 'dark' ? 'bg-green-600 hover:bg-green-500' : 'bg-green-500 hover:bg-green-400'
            } text-white`}
          >
            <FolderIcon className="h-4 w-4" />
            <span>Папка</span>
          </button>
        </div>
      </div>

      {/* File Upload Modal */}
      {showFileUpload && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50`}>
          <div className={`rounded-lg p-6 max-w-md w-full mx-4 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Загрузка файла</h3>
              <button
                onClick={() => setShowFileUpload(false)}
                className={`p-1 rounded ${
                  theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
                }`}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full mb-4"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowFileUpload(false)}
                className={`px-4 py-2 rounded-lg ${
                  theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
                }`}
              >
                Отмена
              </button>
              <button
                onClick={handleFileUpload}
                disabled={!uploadFile}
                className={`px-4 py-2 rounded-lg ${
                  uploadFile
                    ? theme === 'dark' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-400'
                    : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'
                } text-white`}
              >
                Загрузить
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-lg border ${
        theme === 'dark' ? 'border-gray-600' : 'border-gray-300'
      }`}>
        {fileManagerFiles.map((file, index) => (
          <div
            key={index}
            className={`flex items-center justify-between p-3 border-b ${
              theme === 'dark' ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-200'
            }`}
          >
            <div 
              className="flex items-center space-x-3 flex-1 cursor-pointer"
              onClick={() => file.is_directory && listDirectory(`${fileManagerPath}/${file.name}`.replace('//', '/'))}
            >
              {file.is_directory ? (
                <FolderIcon className="h-5 w-5 text-yellow-500" />
              ) : (
                <DocumentIcon className="h-5 w-5 text-blue-500" />
              )}
              <span className="flex-1">{file.name}</span>
            </div>
            <div className="flex items-center space-x-2">
              {!file.is_directory && (
                <span className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              )}
              <div className="flex space-x-1">
                {!file.is_directory && (
                  <button
                    onClick={() => downloadFile(`${fileManagerPath}/${file.name}`.replace('//', '/'), file.name)}
                    className={`p-2 rounded ${
                      theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    title="Скачать"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => deleteItem(`${fileManagerPath}/${file.name}`.replace('//', '/'))}
                  className={`p-2 rounded ${
                    theme === 'dark' ? 'bg-red-600 hover:bg-red-500' : 'bg-red-500 hover:bg-red-400'
                  } text-white`}
                  title="Удалить"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {fileManagerFiles.length === 0 && (
          <div className="p-4 text-center text-gray-500">
            Директория пуста
          </div>
        )}
      </div>
    </div>
  );

  // Remote Shell Component
  const RemoteShell = () => (
    <div className="space-y-4">
      <div className={`rounded-lg border ${
        theme === 'dark' ? 'border-gray-600 bg-black' : 'border-gray-300 bg-white'
      }`}>
        <div className="p-4 h-64 overflow-y-auto font-mono text-sm">
          <pre className={`whitespace-pre-wrap ${theme === 'dark' ? 'text-green-400' : 'text-green-800'}`}>
            {shellOutput || 'Remote shell session started...\nДля начала введите команду ниже.'}
          </pre>
          <div ref={shellEndRef} />
        </div>
      </div>
      
      <div className="flex space-x-2">
        <input
          type="text"
          value={shellCommand}
          onChange={(e) => setShellCommand(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && executeShellCommand(shellCommand)}
          placeholder="Введите команду..."
          className={`flex-1 px-3 py-2 rounded-lg border ${
            theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300 text-black'
          }`}
        />
        <button
          onClick={() => executeShellCommand(shellCommand)}
          className={`px-4 py-2 rounded-lg ${
            theme === 'dark' ? 'bg-green-600 hover:bg-green-500' : 'bg-green-500 hover:bg-green-400'
          } text-white`}
        >
          Выполнить
        </button>
      </div>
    </div>
  );

  // Clipboard Manager Component
  const ClipboardManager = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Синхронизация буфера обмена</h3>
        <button
          onClick={() => navigator.clipboard.readText().then(setClipboardContent)}
          className={`px-3 py-1 rounded text-sm ${
            theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
          }`}
        >
          Вставить
        </button>
      </div>
      <textarea
        value={clipboardContent}
        onChange={(e) => setClipboardContent(e.target.value)}
        onBlur={() => syncClipboard(clipboardContent)}
        placeholder="Содержимое буфера обмена..."
        className={`w-full h-48 px-3 py-2 rounded-lg border ${
          theme === 'dark' 
            ? 'bg-gray-700 border-gray-600 text-white' 
            : 'bg-white border-gray-300 text-black'
        }`}
      />
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">
          {clipboardContent.length} символов
        </span>
        <button
          onClick={() => syncClipboard(clipboardContent)}
          className={`px-4 py-2 rounded-lg ${
            theme === 'dark' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-400'
          } text-white`}
        >
          Синхронизировать
        </button>
      </div>
    </div>
  );

  // Monitor Selector Component
  const MonitorSelector = () => (
    <div className="flex items-center space-x-2">
      <span className="text-sm">Монитор:</span>
      <select
        value={selectedMonitor}
        onChange={(e) => setSelectedMonitor(Number(e.target.value))}
        className={`px-2 py-1 rounded border ${
          theme === 'dark' 
            ? 'bg-gray-700 border-gray-600 text-white' 
            : 'bg-white border-gray-300 text-black'
        }`}
      >
        {availableMonitors.map(monitor => (
          <option key={monitor} value={monitor}>
            Монитор {monitor}
          </option>
        ))}
      </select>
    </div>
  );

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
          <div className="flex items-center gap-4">
            {isConnected && <MonitorSelector />}
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
          {/* Computers List */}
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
                    <div className="flex items-center gap-2">
                      {pc.capabilities && (
                        <div className="flex gap-1">
                          {pc.capabilities.file_transfer && (
                            <FolderIcon className="h-4 w-4 text-blue-500" title="Файловый менеджер" />
                          )}
                          {pc.capabilities.remote_shell && (
                            <TerminalIcon className="h-4 w-4 text-green-500" title="Удаленная консоль" />
                          )}
                          {pc.capabilities.clipboard_sync && (
                            <ClipboardIcon className="h-4 w-4 text-purple-500" title="Синхронизация буфера" />
                          )}
                        </div>
                      )}
                      {pc.connection_type && (
                        <span className={`text-xs px-2 py-1 rounded-2xl ${
                          theme === 'dark' 
                            ? 'bg-blue-900 text-blue-200' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {pc.connection_type}
                        </span>
                      )}
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
                  </div>
                  {pc.system_info && (
                    <div className={`text-xs mt-2 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <div>ОС: {pc.system_info.os || 'Неизвестно'}</div>
                      <div>IP: {pc.system_info.ip_address || 'Неизвестно'}</div>
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

          {/* Session Management */}
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
                  <div className="flex items-center gap-2 mt-1">
                    <p className={`text-xs ${
                      selectedPc.status === 'online' 
                        ? theme === 'dark' ? 'text-green-400' : 'text-green-600'
                        : theme === 'dark' ? 'text-red-400' : 'text-red-600'
                    }`}>
                      Статус: {selectedPc.status === 'online' ? 'Онлайн' : 'Офлайн'}
                    </p>
                    {selectedPc.connection_type && (
                      <p className={`text-xs ${
                        theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                      }`}>
                        Тип: {selectedPc.connection_type}
                      </p>
                    )}
                  </div>
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

                {/* Feature Tabs when connected */}
                {isConnected && activeSession?.capabilities && (
                  <div className="border-t pt-4">
                    <div className="flex space-x-1 mb-4">
                      {[
                        { id: 'remote', name: 'Экран', icon: ComputerDesktopIcon },
                        activeSession.capabilities.file_transfer && { id: 'files', name: 'Файлы', icon: FolderIcon },
                        activeSession.capabilities.remote_shell && { id: 'shell', name: 'Консоль', icon: TerminalIcon },
                        activeSession.capabilities.clipboard_sync && { id: 'clipboard', name: 'Буфер', icon: ClipboardIcon }
                      ].filter(Boolean).map((tab: any) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === tab.id
                              ? theme === 'dark'
                                ? 'bg-cyan-600 text-white'
                                : 'bg-blue-500 text-white'
                              : theme === 'dark'
                              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          <tab.icon className="h-4 w-4" />
                          <span>{tab.name}</span>
                        </button>
                      ))}
                    </div>

                    <div className="min-h-[200px]">
                      {activeTab === 'files' && <FileManager />}
                      {activeTab === 'shell' && <RemoteShell />}
                      {activeTab === 'clipboard' && <ClipboardManager />}
                      {activeTab === 'remote' && (
                        <div className="text-center py-8 text-gray-500">
                          Используйте вкладку "Удалённый экран" для просмотра
                        </div>
                      )}
                    </div>
                  </div>
                )}

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

          {/* Remote Screen */}
          <div className={`lg:col-span-2 rounded-3xl p-6 shadow-2xl border-2 ${
            theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>
                Удалённый экран {selectedPc && `- ${selectedPc.pc_name}`}
                {selectedPc?.connection_type && (
                  <span className={`text-sm ml-2 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                  }`}>
                    ({selectedPc.connection_type})
                  </span>
                )}
              </h2>
              {isConnected && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={requestScreenUpdate}
                    className={`px-3 py-2 rounded-lg ${
                      theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                  >
                    Обновить экран
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className={`px-3 py-2 rounded-lg ${
                      theme === 'dark' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-purple-500 hover:bg-purple-400'
                    } text-white`}
                  >
                    {isFullscreen ? 'Выйти' : 'Полный экран'}
                  </button>
                </div>
              )}
            </div>
            
            <div 
              ref={remoteScreenRef}
              className={`rounded-2xl border-2 aspect-video flex items-center justify-center overflow-hidden relative ${
                theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'
              } ${isConnected ? 'cursor-crosshair' : ''}`}
            >
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
              <div className="mt-4 flex flex-wrap gap-2 justify-between">
                <div className="flex flex-wrap gap-2">
                  {['Ctrl+Alt+Del', 'Alt+Tab', 'ESC', 'Print Screen', 'Win+L'].map((command) => (
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
                <div className="text-sm text-gray-500">
                  Используйте мышь и клавиатуру для управления
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RemoteDesktop;