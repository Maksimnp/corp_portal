import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';

type AuthContextType = {
  token: string | null;
  role: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (token: string, role: string, refreshToken?: string) => void;
  logout: () => void;
  refreshToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseJwtUsername(token: string | null): string | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    );
    return typeof json?.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://192.1.66.117:8000';

  // Функция полной очистки состояния
  const clearAuthState = useCallback(() => {
    setToken(null);
    setRole(null);
    setRefreshTokenValue(null);
    setUsername(null);
  }, []);

  // Функция полной очистки localStorage
  const clearLocalStorage = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('department');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token'); // На всякий случай удаляем старый ключ
  }, []);

  // Инициализация состояния из localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('access_token');
    const storedRole = localStorage.getItem('role');
    const storedRefreshToken = localStorage.getItem('refresh_token');
    const storedUsername = localStorage.getItem('username');
    
    if (storedToken && storedRole) {
      setToken(storedToken);
      setRole(storedRole);
      setRefreshTokenValue(storedRefreshToken);
      setUsername(storedUsername || parseJwtUsername(storedToken));
    } else {
      // Если нет токена или роли, очищаем всё
      clearAuthState();
      clearLocalStorage();
    }
    
    setLoading(false);
  }, [clearAuthState, clearLocalStorage]);

  const login = useCallback((newToken: string, newRole: string, newRefreshToken?: string) => {
    localStorage.setItem('access_token', newToken);
    localStorage.setItem('role', newRole);
    if (newRefreshToken) {
      localStorage.setItem('refresh_token', newRefreshToken);
    }
    
    setToken(newToken);
    setRole(newRole);
    setRefreshTokenValue(newRefreshToken || null);
    setUsername(parseJwtUsername(newToken));
  }, []);

  const logout = useCallback(() => {
    // Полная очистка состояния и localStorage
    clearAuthState();
    clearLocalStorage();
    
    // Дополнительная очистка на случай кеширования
    sessionStorage.clear();
    
    toast.info('Вы успешно вышли из системы');
  }, [clearAuthState, clearLocalStorage]);

  const refreshToken = async (): Promise<string | null> => {
    if (!refreshTokenValue) {
      toast.error('Нет refresh token для обновления');
      logout();
      return null;
    }
    
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshTokenValue }),
      });
      
      if (!response.ok) {
        throw new Error(`Refresh token failed: ${response.status}`);
      }
      
      const data = await response.json();
      const newAccessToken = data.access_token;
      
      localStorage.setItem('access_token', newAccessToken);
      setToken(newAccessToken);
      setUsername(parseJwtUsername(newAccessToken));
      
      toast.info('Токен успешно обновлен');
      return newAccessToken;
    } catch (error) {
      console.error('Refresh token error:', error);
      toast.error('Не удалось обновить токен. Пожалуйста, войдите снова.');
      logout();
      return null;
    }
  };

  const isAuthenticated = !!token;
  const isAdmin = role === 'admin';

  const value = {
    token,
    role,
    username,
    isAuthenticated,
    isAdmin,
    loading,
    login,
    logout,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};