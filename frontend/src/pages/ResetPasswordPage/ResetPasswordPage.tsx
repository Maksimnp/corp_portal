// src/pages/ResetPasswordPage.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string>('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      validateToken();
    } else {
      setError('Токен восстановления не найден в URL');
      setTokenValid(false);
    }
  }, [token]);

  const validateToken = async () => {
    try {
      const response = await fetch(`/auth/validate-reset-token/${token}`);
      const data = await response.json();
      
      setTokenValid(data.valid);
      setEmail(data.email || '');
      
      if (!data.valid) {
        setError(data.message || 'Недействительный токен восстановления');
      }
    } catch (err) {
      setError('Ошибка проверки токена');
      setTokenValid(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Токен восстановления отсутствует');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (newPassword.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/');
        }, 3000);
      } else {
        setError(data.detail || 'Ошибка при сбросе пароля');
      }
    } catch (err) {
      setError('Ошибка сети. Попробуйте позже.');
    } finally {
      setIsLoading(false);
    }
  };

  if (tokenValid === false) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <motion.div
          className="w-full max-w-md p-8 rounded-3xl bg-gray-900/40 backdrop-blur-2xl border border-white/20 shadow-2xl shadow-cyan-500/30 text-center"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-red-600 to-red-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">!</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Ошибка</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-cyan-600 text-white rounded-2xl font-medium hover:shadow-cyan-500/25 transition-all"
          >
            Вернуться на главную
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md p-8 rounded-3xl bg-gray-900/40 backdrop-blur-2xl border border-white/20 shadow-2xl shadow-cyan-500/30"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">МХП</span>
          </div>
          <h2 className="text-2xl font-bold text-white">
            {success ? 'Пароль изменен!' : 'Сброс пароля'}
          </h2>
          {email && (
            <p className="text-gray-300 mt-2">Для: {email}</p>
          )}
        </div>

        {success ? (
          <motion.div
            className="text-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-400 text-lg mb-2">Пароль успешно изменен!</p>
            <p className="text-gray-300">Вы будете перенаправлены на страницу входа...</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-3 text-gray-200">
                Новый пароль
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30 text-white placeholder-gray-400 transition-all duration-300 focus:outline-none"
                placeholder="Введите новый пароль"
                required
                minLength={6}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-3 text-gray-200">
                Подтвердите пароль
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30 text-white placeholder-gray-400 transition-all duration-300 focus:outline-none"
                placeholder="Повторите новый пароль"
                required
                disabled={isLoading}
              />
            </div>

            {error && (
              <motion.div
                className="p-4 rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/40 text-red-200 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-cyan-600 to-cyan-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Сброс пароля...
                </span>
              ) : (
                'Сбросить пароль'
              )}
            </button>
          </form>
        )}

        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors"
          >
            Вернуться на главную
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPasswordPage;