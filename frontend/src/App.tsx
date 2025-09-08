import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import { Dashboard } from './pages/Dashboard/Dashboard';
import Chat from './pages/Chat/Chat';
import Contacts from './pages/Contacts/Contacts';
import { Admin } from './pages/Admin/Admin';
import { RequestList } from './pages/Request/RequestList';
import HomePage from './pages/HomePage/HomePage';
import EditADContacts from './components/EditADContacts';
import DocumentsPage from './components/DocumentsPage';
import { AuthProvider, useAuth } from './pages/AuthContext';
import JitsiWrapper from './pages/meet/JitsiWrapper';
import ServerStats from './pages/ServerStats/ServerStats'; 
import FAQ from './pages/FAQ/faq';

const PrivateRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) return <div>Загрузка...</div>;
    return isAuthenticated ? children : <Navigate to="/" replace />;
};

const AdminRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    const { isAdmin, loading } = useAuth();
    if (loading) return <div>Загрузка...</div>;
    return isAdmin ? children : <Navigate to="/" replace />;
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/login" element={<Login />} />
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
                        path="/requests_list"
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
                    <Route
                        path="/jitsi"
                        element={
                            <PrivateRoute>
                                <JitsiWrapper />
                            </PrivateRoute>
                        }
                    />
                    <Route
                        path="/edit-contacts"
                        element={
                            <PrivateRoute>
                                <EditADContacts />
                            </PrivateRoute>
                        }
                    />
                    <Route
                        path="/docs"
                        element={
                            <PrivateRoute>
                                <DocumentsPage />
                            </PrivateRoute>
                        }
                    />
                <Route
                        path="/FAQ"
                        element={
                            <PrivateRoute>
                                <FAQ />
                            </PrivateRoute>
                        }
                    />
                    <Route
                        path="/serverstats"
                        element={
                            <PrivateRoute>
                                <ServerStats />
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