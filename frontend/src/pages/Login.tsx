import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch('http://192.1.66.117:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('username', data.full_name); // Сохраняем ФИО вместо username
        navigate('/dashboard');
      } else {
        let errorMessage = `Ошибка: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {
          // Если JSON не пришел
        }

        if (response.status === 500) {
          setError('Внутренняя ошибка сервера. Проверьте логи backend.');
        } else if (response.status === 401) {
          setError('Неверный логин или пароль.');
        } else {
          setError(errorMessage);
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(
        process.env.NODE_ENV === 'development'
          ? `Ошибка сети: ${err instanceof Error ? err.message : String(err)}`
          : 'Не удалось подключиться к серверу. Проверьте его доступность.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Вход в систему</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Логин"
            disabled={isLoading}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            disabled={isLoading}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition"
          />

          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition duration-200 flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Входим...
              </>
            ) : (
              'Войти'
            )}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Используйте свои корпоративные учетные данные
        </p>
      </div>
    </div>
  );
};