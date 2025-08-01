import React, { createContext, useContext, useState, useEffect } from 'react';

  interface AuthContextType {
    token: string | null;
    role: string | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
    loading: boolean;
    login: (token: string, role: string) => void;
    logout: () => void;
  }

   const AuthContext = createContext<AuthContextType | undefined>(undefined);

   export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
     const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
     const [role, setRole] = useState<string | null>(localStorage.getItem('role'));
     const [loading, setLoading] = useState(true);

     useEffect(() => {
       const storedToken = localStorage.getItem('token');
       const storedRole = localStorage.getItem('role');
       if (storedToken && storedRole) {
         setToken(storedToken);
         setRole(storedRole);
       }
       setLoading(false);
     }, []);

     const login = (newToken: string, newRole: string) => {
       localStorage.setItem('token', newToken);
       localStorage.setItem('role', newRole);
       setToken(newToken);
       setRole(newRole);
     };

     const logout = () => {
       localStorage.removeItem('token');
       localStorage.removeItem('role');
       setToken(null);
       setRole(null);
     };

     const isAuthenticated = !!token;
     const isAdmin = role === 'admin';

     return (
       <AuthContext.Provider value={{ token, role, isAuthenticated, isAdmin, loading, login, logout }}>
         {children}
       </AuthContext.Provider>
     );
   };

   export const useAuth = () => {
     const context = useContext(AuthContext);
     if (!context) throw new Error('useAuth must be used within an AuthProvider');
     return context;
   };