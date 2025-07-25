// src/pages/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Проверка состояния авторизации (например, из localStorage или токена)
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
      // Здесь можно добавить проверку роли (isAdmin)
    }
    setLoading(false);
  }, []);

  const login = () => {
    setIsAuthenticated(true);
    // Пример: установить токен или роль
    localStorage.setItem('token', 'dummy-token');
    // setIsAdmin(true); // Установите в зависимости от роли
  };

  const logout = () => {
    setIsAuthenticated(false);
    setIsAdmin(false);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};