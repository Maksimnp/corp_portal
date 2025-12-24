import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.1.66.117:8000';
const WS_BASE_URL = API_BASE_URL.replace('http', 'ws');

interface PC {
  pc_id: string;
  username: string;
  pc_name: string;
  status: string;
  last_seen: string;
  system_info: {
    hostname: string;
    os: string;
    platform: string;
    ip_address?: string;
  };
}

const RemoteDesktop: React.FC = () => {
  const [pcs, setPcs] = useState<PC[]>([]);
  const [selectedPC, setSelectedPC] = useState<PC | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const token = localStorage.getItem('access_token');

  // Загрузка списка ПК
  const fetchPCs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/remote/pcs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPcs(response.data.pcs || []);
    } catch (err) {
      console.error('Error fetching PCs:', err);
      setError('Ошибка загрузки списка ПК');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPCs();
  }, []);

  // Подключение к ПК
  const connectToPC = (pc: PC) => {
    if (!token) {
      setError('Токен не найден');
      return;
    }

    setSelectedPC(pc);
    setError(null);

    // Создаём WebSocket соединение
    const ws = new WebSocket(`${WS_BASE_URL}/api/remote/viewer?token=${token}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      
      // Запрашиваем создание сессии
      ws.send(JSON.stringify({
        type: 'create_session',
        target_pc_id: pc.pc_id,
        session_type: 'view'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Ошибка соединения');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setConnected(false);
      sessionIdRef.current = null;
    };

    wsRef.current = ws;
  };

  const handleWebSocketMessage = (message: any) => {
    const { type, data } = message;

    switch (type) {
      case 'session_created':
        sessionIdRef.current = message.session_id;
        console.log('Session created:', message.session_id);
        break;

      case 'session_accepted':
        setConnected(true);
        console.log('Session accepted');
        break;

      case 'session_rejected':
        setError('Соединение отклонено удалённым пользователем');
        disconnect();
        break;

      case 'screen_data':
        // Отрисовка данных экрана
        if (data && data.image) {
          drawScreen(data.image);
        }
        break;

      case 'session_ended':
        setError('Сессия завершена');
        disconnect();
        break;

      case 'ping':
        wsRef.current?.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  };

  const drawScreen = (imageData: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${imageData}`;
  };

  const sendMouseEvent = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!connected || !wsRef.current || !sessionIdRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));

    wsRef.current.send(JSON.stringify({
      type: 'remote_command',
      session_id: sessionIdRef.current,
      command: {
        type: 'mouse',
        action: event.type === 'click' ? 'click' : 'move',
        button: event.button,
        x,
        y
      }
    }));
  };

  const sendKeyboardEvent = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!connected || !wsRef.current || !sessionIdRef.current) return;

    wsRef.current.send(JSON.stringify({
      type: 'remote_command',
      session_id: sessionIdRef.current,
      command: {
        type: 'keyboard',
        action: event.type === 'keydown' ? 'press' : 'release',
        key: event.key,
        keyCode: event.keyCode
      }
    }));
  };

  const disconnect = () => {
    if (wsRef.current && sessionIdRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'end_session',
        session_id: sessionIdRef.current
      }));
    }

    wsRef.current?.close();
    wsRef.current = null;
    sessionIdRef.current = null;
    setConnected(false);
    setSelectedPC(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Удалённый рабочий стол</h1>
          <button
            onClick={fetchPCs}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Обновить
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {!selectedPC ? (
          // Список доступных ПК
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full text-center py-12">Загрузка...</div>
            ) : pcs.length === 0 ? (
              <div className="col-span-full text-center py-12 text-gray-500">
                Нет доступных ПК
              </div>
            ) : (
              pcs.map((pc) => (
                <div
                  key={pc.pc_id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{pc.pc_name}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      pc.status === 'online' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {pc.status === 'online' ? 'В сети' : 'Не в сети'}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <div><strong>Пользователь:</strong> {pc.username}</div>
                    <div><strong>ОС:</strong> {pc.system_info?.os || 'Неизвестно'}</div>
                    <div><strong>IP:</strong> {pc.system_info?.ip_address || 'Неизвестно'}</div>
                  </div>

                  <button
                    onClick={() => connectToPC(pc)}
                    disabled={pc.status !== 'online'}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Подключиться
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          // Экран удалённого просмотра
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedPC.pc_name}</h2>
                <p className="text-sm text-gray-600">
                  {connected ? '🟢 Подключено' : '🟡 Подключение...'}
                </p>
              </div>
              <button
                onClick={disconnect}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Отключиться
              </button>
            </div>

            <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-black">
              <canvas
                ref={canvasRef}
                onClick={sendMouseEvent}
                onMouseMove={sendMouseEvent}
                onKeyDown={sendKeyboardEvent}
                onKeyUp={sendKeyboardEvent}
                tabIndex={0}
                className="w-full h-auto cursor-crosshair focus:outline-none"
                style={{ maxHeight: 'calc(100vh - 300px)' }}
              />
            </div>

            {!connected && (
              <div className="mt-4 text-center text-gray-500">
                Ожидание подтверждения от удалённого ПК...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RemoteDesktop;