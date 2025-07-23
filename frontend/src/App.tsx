// src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Chat } from './pages/Chat/Chat';
import { Helpdesk } from './pages/Helpdesk/Helpdesk';
import { Contacts } from './pages/Contacts/Contacts';
import { Admin } from './pages/Admin/Admin';
import { RequestList } from './pages/Request/RequestList';

// Защита маршрутов
const PrivateRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
};

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Главная — перенаправление на dashboard */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />

        {/* Другие защищённые страницы */}
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
              {localStorage.getItem('role') === 'admin' ? <Admin /> : <div>Доступ запрещён</div>}
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;