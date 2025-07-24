// src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login'; 
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Chat } from './pages/Chat/Chat';
import { Contacts } from './pages/Contacts/Contacts';
import { Admin } from './pages/Admin/Admin';
import { RequestList } from './pages/Request/RequestList';
import { AuthProvider, useAuth } from './pages/AuthContext';

const PrivateRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div>Загрузка...</div>;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AdminRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div>Загрузка...</div>;
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <PrivateRoute>
                <Chat />
              </PrivateRoute>
            }
          />
          <Route
            path="/request_list"
            element={
              <PrivateRoute>
                <RequestList />
              </PrivateRoute>
            }
          />
          <Route
            path="/contacts"
            element={
              <PrivateRoute>
                <Contacts />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <PrivateRoute>
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              </PrivateRoute>
            }
          />
          <Route path="*" element={<div>Страница не найдена</div>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;