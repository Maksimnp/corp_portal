// components/ResetPasswordModal.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  resetToken: string;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ 
  isOpen, 
  onClose, 
  resetToken 
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (isOpen && resetToken) {
      validateToken();
    }
  }, [isOpen, resetToken]);

  const validateToken = async () => {
    try {
      const response = await fetch(`/api/auth/validate-reset-token/${resetToken}`);
      const data = await response.json();
      
      setTokenValid(data.valid);
      if (!data.valid) {
        setError(data.message);
      }
    } catch (err) {
      setError('Ошибка проверки токена');
      setTokenValid(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: resetToken,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          // Перенаправление на страницу входа
          window.location.href = '/';
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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/90 backdrop-blur-2xl flex items-center justify-center z-50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-full max-w-md p-8 rounded-3xl bg-gray-900/40 backdrop-blur-2xl border border-white/20 shadow-2xl shadow-cyan-500/30"
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
          >
            <div className="relative z-10 text-center mb-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-600 flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-xl">МХП</span>
              </div>
              <h2 className="text-2xl font-bold text-white">
                Сброс пароля
              </h2>
            </div>

            {tokenValid === false && (
              <div className="text-center text-red-400 mb-4">
                {error || 'Недействительный токен сброса'}
              </div>
            )}

            {tokenValid === true && !success && (
              <form onSubmit={handleSubmit} className="space-y-6 mt-8">
                <div>
                  <label className="block text-sm font-medium mb-3 text-gray-200">
                    Новый пароль
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-5 py-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/20 focus:border-cyan-500/50 text-white placeholder-gray-400 transition-all duration-300 focus:outline-none"
                    placeholder="Введите новый пароль"
                    required
                    minLength={6}
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
                    className="w-full px-5 py-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/20 focus:border-cyan-500/50 text-white placeholder-gray-400 transition-all duration-300 focus:outline-none"
                    placeholder="Повторите новый пароль"
                    required
                  />
                </div>

                {error && (
                  <div className="p-4 rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/40 text-red-200 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-cyan-600 to-cyan-600 text-white rounded-xl font-semibold shadow-lg transition-all duration-300 disabled:opacity-70"
                >
                  {isLoading ? 'Сброс пароля...' : 'Сбросить пароль'}
                </button>
              </form>
            )}

            {success && (
              <div className="text-center p-6">
                <div className="text-green-400 text-lg mb-4">
                  Пароль успешно изменен!
                </div>
                <p className="text-gray-300">
                  Вы будете перенаправлены на страницу входа...
                </p>
              </div>
            )}

            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-gray-300 hover:text-cyan-400 transition-colors"
            >
              ✕
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ResetPasswordModal;