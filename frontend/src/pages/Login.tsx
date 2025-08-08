// src/pages/Login.tsx
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface LoginResponse {
  access_token: string;
  role: number;
  full_name?: string;
}

interface LoginError {
  detail?: string;
  status?: number;
}

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = useCallback(async () => {
    if (isLoading) return;
    if (!username.trim() || !password.trim()) {
      setError('Пожалуйста, заполните логин и пароль.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('http://192.1.66.117:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const { access_token, role, full_name = username } = await response.json<LoginResponse>();
        login(access_token, String(role));
        localStorage.setItem('token', access_token);
        localStorage.setItem('role', String(role));
        localStorage.setItem('username', full_name);
        navigate('/dashboard');
        return;
      }

      const data = await response.json<LoginError>();
      let errorMessage = `Ошибка: ${response.status}`;
      if (data.detail) {
        errorMessage = typeof data.detail === 'string' ? data.detail : errorMessage;
      }

      if (response.status === 401) {
        setError('Неверный логин или пароль. Превышено количество попыток.');
      } else if (response.status === 422) {
        setError(`Ошибка валидации: ${errorMessage}`);
      } else if (response.status === 500) {
        setError('Внутренняя ошибка сервера. Обратитесь к администратору.');
      } else {
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Ошибка сети:', err);
      setError(
        process.env.NODE_ENV === 'development'
          ? `Ошибка сети: ${err instanceof Error ? err.message : String(err)}`
          : 'Не удалось подключиться к серверу. Проверьте его доступность.'
      );
    } finally {
      setLoading(false);
    }
  }, [username, password, isLoading, navigate, login]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      handleLogin();
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
            onKeyPress={handleKeyPress}
            placeholder="Логин"
            disabled={isLoading}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition"
            autoFocus
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Пароль"
            disabled={isLoading}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition"
          />

          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-400 text-white font-medium rounded-lg transition duration-200 flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
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

export default Login;
