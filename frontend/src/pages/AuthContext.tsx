import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'react-toastify';

type AuthContextType = {
  token: string | null;
  role: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (token: string, role: string, refreshToken: string) => void;
  logout: () => void;
  refreshToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseJwtUsername(token: string | null): string | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = JSON.parse(decodeURIComponent(atob(payload.replace(/-/g, '+').replace(/_/g, '/')).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('')));
    return typeof json?.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('role'));
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(localStorage.getItem('refresh_token'));
  const [username, setUsername] = useState<string | null>(parseJwtUsername(localStorage.getItem('token')));
  const [loading, setLoading] = useState(true);

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://192.1.66.117:3000';

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedRole = localStorage.getItem('role');
    const storedRefreshToken = localStorage.getItem('refresh_token');
    setToken(storedToken);
    setRole(storedRole);
    setRefreshTokenValue(storedRefreshToken);
    setUsername(parseJwtUsername(storedToken));
    setLoading(false);
  }, []);

  const login = (newToken: string, newRole: string, newRefreshToken: string) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('role', newRole);
    localStorage.setItem('refresh_token', newRefreshToken);
    setToken(newToken);
    setRole(newRole);
    setRefreshTokenValue(newRefreshToken);
    setUsername(parseJwtUsername(newToken));
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setRole(null);
    setRefreshTokenValue(null);
    setUsername(null);
  };

  const refreshToken = async (): Promise<string | null> => {
    if (!refreshTokenValue) {
      toast.error('Нет refresh token для обновления');
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
      localStorage.setItem('token', newAccessToken);
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

  return (
    <AuthContext.Provider value={{ token, role, username, isAuthenticated, isAdmin, loading, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};