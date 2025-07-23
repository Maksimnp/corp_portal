import { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean | null;
  isAdmin: boolean | null;
  login: (token: string, role: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('token');
      const role = localStorage.getItem('role');
      if (!token) {
        setIsAuthenticated(false);
        setIsAdmin(false);
        return;
      }
      try {
        const response = await fetch('http://192.1.66.117:8000/auth/verify', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        setIsAuthenticated(response.ok);
        setIsAdmin(response.ok && data.role === 'admin');
      } catch (error) {
        setIsAuthenticated(false);
        setIsAdmin(false);
      }
    };
    verifyToken();
  }, []);

  const login = (token: string, role: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    setIsAuthenticated(true);
    setIsAdmin(role === 'admin');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isAdmin, login, logout }}>
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