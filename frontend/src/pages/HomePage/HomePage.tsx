import React, { useState, useEffect, useRef } from 'react';
import { CountUp } from 'countup.js';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { useAuth } from '../AuthContext';

interface LoginResponse {
  access_token: string;
  role: number;
  full_name?: string;
  department: string;
}

interface LoginError {
  detail: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const YOUTUBE_URL = import.meta.env.VITE_YOUTUBE_CHANNEL_URL;
const INST_URL = import.meta.env.VITE_INSTAGRAM_URL;

// Улучшенный LoginModal с функцией восстановления пароля
const LoginModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}> = ({ isOpen, onClose, onLogin, isLoading, error }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(username, password);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordError(null);
    
    // Валидация email
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail) {
      setForgotPasswordError('Пожалуйста, введите email');
      return;
    }

    // Проверка домена
    if (!trimmedEmail.endsWith('@minskhleb.by')) {
      setForgotPasswordError('Только почта в домене @minskhleb.by разрешена');
      return;
    }

    setIsForgotPasswordLoading(true);
    
    try {
      const response = await fetch(`${BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        setForgotPasswordSuccess(true);
        
        // Автоматически закрываем через 4 секунды
        setTimeout(() => {
          resetForgotPassword();
        }, 4000);
      } else {
        setForgotPasswordError(data.detail || data.error || 'Ошибка при отправке запроса. Попробуйте позже.');
      }
    } catch (err) {
      console.error('Forgot password error:', err);
      setForgotPasswordError('Ошибка сети. Проверьте подключение и попробуйте позже.');
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const resetForgotPassword = () => {
    setIsForgotPassword(false);
    setEmail('');
    setForgotPasswordError(null);
    setForgotPasswordSuccess(false);
    setIsForgotPasswordLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setPassword('');
      resetForgotPassword();
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/90 backdrop-blur-2xl flex items-center justify-center z-50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // onClick={onClose}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          role="dialog"
          aria-labelledby="login-modal-title"
          aria-modal="true"
        >
          {/* Эффект фонового свечения */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-purple-500/10 animate-pulse" />
          
          <motion.div
            ref={modalRef}
            className="relative w-full max-w-md p-8 rounded-3xl bg-gray-900/40 backdrop-blur-2xl border border-white/20 shadow-2xl shadow-cyan-500/30"
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
            transition={{ duration: 0.4, type: "spring", damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Эффект стеклянной поверхности */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10 backdrop-blur-2xl pointer-events-none" />
            
            {/* Декоративные элементы */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-gray-300 hover:text-cyan-400 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-full p-2 z-11 backdrop-blur-sm bg-white/5 border border-white/10"
              aria-label="Закрыть модальное окно"
              tabIndex={0}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Кнопка назад для режима восстановления пароля */}
            {isForgotPassword && (
              <button
                onClick={resetForgotPassword}
                className="absolute top-5 left-5 text-gray-300 hover:text-cyan-400 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-full p-2 z-10 backdrop-blur-sm bg-white/5 border border-white/10"
                aria-label="Вернуться к входу"
                tabIndex={0}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            )}

            <div className="relative z-10 text-center mb-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-500/30">
                <span className="text-white font-bold text-xl">МХП</span>
              </div>
              <h2 id="login-modal-title" className="text-2xl font-bold text-white">
                {isForgotPassword ? 'Восстановление пароля' : 'Вход в систему'}
              </h2>
              <p className="text-gray-300 mt-2">
                {isForgotPassword 
                  ? 'Укажите вашу корпоративную почту' 
                  : 'Введите ваши учетные данные'}
              </p>
            </div>

            {!isForgotPassword ? (
              // Форма входа
              <form onSubmit={handleSubmit} className="relative z-10 space-y-6 mt-8">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium mb-3 text-gray-200">
                    Логин
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-5 py-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30 focus:border-transparent text-white placeholder-gray-400 transition-all duration-300 focus:outline-none focus:shadow-lg focus:shadow-cyan-500/20"
                    placeholder="Введите логин"
                    disabled={isLoading}
                    aria-required="true"
                    autoComplete="username"
                    aria-describedby="username-help"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-3 text-gray-200">
                    Пароль
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-5 py-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30 focus:border-transparent text-white placeholder-gray-400 transition-all duration-300 focus:outline-none focus:shadow-lg focus:shadow-cyan-500/20"
                    placeholder="Введите пароль"
                    disabled={isLoading}
                    aria-required="true"
                    autoComplete="current-password"
                    aria-describedby="password-help"
                  />
                </div>

                {/* Ссылка "Забыли пароль?" */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/30 rounded-lg px-3 py-1"
                    tabIndex={0}
                  >
                    Забыли пароль?
                  </button>
                </div>

                {error && (
                  <motion.div
                    className="p-4 rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/40 text-red-200 text-sm"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    role="alert"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </div>
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-4 mt-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900 relative overflow-hidden ${
                    isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-cyan-500/25 hover:-translate-y-1'
                  }`}
                  whileHover={!isLoading ? { scale: 1.02 } : {}}
                  whileTap={!isLoading ? { scale: 0.98 } : {}}
                  tabIndex={0}
                  aria-label={isLoading ? 'Загрузка...' : 'Войти в систему'}
                >
                  {/* Эффект блеска при наведении */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-3 relative z-10">
                      <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Загрузка...
                    </span>
                  ) : (
                    <span className="relative z-10">Войти</span>
                  )}
                </motion.button>
              </form>
            ) : (
              // Форма восстановления пароля
              <form onSubmit={handleForgotPasswordSubmit} className="relative z-10 space-y-6 mt-8">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-3 text-gray-200">
                    Корпоративная почта
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-5 py-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30 focus:border-transparent text-white placeholder-gray-400 transition-all duration-300 focus:outline-none focus:shadow-lg focus:shadow-cyan-500/20"
                    placeholder="username@minskhleb.by"
                    disabled={isForgotPasswordLoading || forgotPasswordSuccess}
                    aria-required="true"
                    autoComplete="email"
                    aria-describedby="email-help"
                  />
                  <p id="email-help" className="text-xs text-gray-400 mt-2">
                    Только почта в домене @minskhleb.by
                  </p>
                </div>

                {forgotPasswordError && (
                  <motion.div
                    className="p-4 rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/40 text-red-200 text-sm"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    role="alert"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {forgotPasswordError}
                    </div>
                  </motion.div>
                )}

                {forgotPasswordSuccess && (
                  <motion.div
                    className="p-4 rounded-xl bg-green-500/20 backdrop-blur-md border border-green-500/40 text-green-200 text-sm"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    role="alert"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Инструкции по восстановлению пароля отправлены на вашу почту
                    </div>
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  disabled={isForgotPasswordLoading || forgotPasswordSuccess}
                  className={`w-full py-4 mt-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900 relative overflow-hidden ${
                    isForgotPasswordLoading || forgotPasswordSuccess ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-cyan-500/25 hover:-translate-y-1'
                  }`}
                  whileHover={!(isForgotPasswordLoading || forgotPasswordSuccess) ? { scale: 1.02 } : {}}
                  whileTap={!(isForgotPasswordLoading || forgotPasswordSuccess) ? { scale: 0.98 } : {}}
                  tabIndex={0}
                  aria-label={isForgotPasswordLoading ? 'Отправка...' : 'Восстановить пароль'}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  
                  {isForgotPasswordLoading ? (
                    <span className="flex items-center justify-center gap-3 relative z-10">
                      <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Отправка...
                    </span>
                  ) : forgotPasswordSuccess ? (
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Отправлено!
                    </span>
                  ) : (
                    <span className="relative z-10">Восстановить пароль</span>
                  )}
                </motion.button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const HomePage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalRequestsRef = useRef<HTMLSpanElement>(null);
  const completedRequestsRef = useRef<HTMLSpanElement>(null);
  const completionRateRef = useRef<HTMLSpanElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated, login, logout } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [videoError, setVideoError] = useState(false);

  // Parallax scroll effects
  const { scrollYProgress } = useScroll();
  const heroParallax = useTransform(scrollYProgress, [0, 0.5], [0, -100]);
  const featureParallax = useTransform(scrollYProgress, [0, 1], [0, 50]);

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
    setError(null);
    setIsLoading(false);
  };

  const handleLogin = async (username: string, password: string) => {
    if (isLoading) return;
    if (!username.trim() || !password.trim()) {
      setError('Пожалуйста, заполните логин и пароль.');
      return;
    }
    setError(null);
    setIsLoading(true);
    const maxAttempts = 3;
    const delayMs = 1000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
          const { access_token, role, full_name = username, department } = data as LoginResponse;
          login(access_token, String(role));
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('role', String(role));
          localStorage.setItem('username', full_name);
          localStorage.setItem('department', department);
          closeLoginModal();
          navigate('/dashboard');
          return;
        }
        
        const errorData = data as LoginError;
        const errorMessage = errorData.detail || `Ошибка: ${response.status}`;
        
        if (response.status === 401 && attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        
        setError(
          response.status === 401 ? 'Неверный логин или пароль.' :
          response.status === 422 ? `Ошибка валидации: ${errorMessage}` :
          response.status === 500 ? 'Внутренняя ошибка сервера. Обратитесь к администратору.' :
          errorMessage
        );
        break;
      } catch (err) {
        console.error('Ошибка сети:', err);
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        setError(
          import.meta.env.MODE === 'development'
            ? `Ошибка сети: ${err instanceof Error ? err.message : String(err)}`
            : 'Не удалось подключиться к серверу.'
        );
        break;
      } finally {
        if (attempt === maxAttempts - 1) setIsLoading(false);
      }
    }
  };

  const handleLogout = () => {
    // Полная очистка всех данных пользователя
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('department');
    localStorage.removeItem('refresh_token');
    
    // Вызов logout из контекста для обновления состояния
    logout();
    
    // Навигация на главную страницу
    navigate('/');
    
    // Принудительное обновление для полного сброса состояния
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // Оптимизированная анимация частиц
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();

    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 40 : 80;
    const particles: Array<{
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
      color: string;
    }> = [];

    const colors = ['#06B6D4', '#3B82F6', '#8B5CF6', '#10B981'];

    for (let i = 0; i < particleCount; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 3 + 1,
        speedX: Math.random() * 0.8 - 0.4,
        speedY: Math.random() * 0.8 - 0.4,
        opacity: Math.random() * 0.5 + 0.3,
        color,
      });
    }

    let animationFrameId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Улучшенный градиентный фон
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, 
        canvas.height / 2, 
        0, 
        canvas.width / 2, 
        canvas.height / 2, 
        Math.max(canvas.width, canvas.height) * 0.8
      );
      
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0.8)');
      gradient.addColorStop(0.5, 'rgba(30, 41, 59, 0.6)');
      gradient.addColorStop(1, 'rgba(51, 65, 85, 0.8)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle) => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;

        // Добавляем свечение частицам
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.opacity;
        ctx.fill();
      });

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      resizeCanvas();
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    if (totalRequestsRef.current && completedRequestsRef.current && completionRateRef.current) {
      const totalRequests = new CountUp(totalRequestsRef.current, 1247, { duration: 2.5, separator: ' ' });
      const completedRequests = new CountUp(completedRequestsRef.current, 1182, { duration: 2.5, separator: ' ' });
      const completionRate = new CountUp(completionRateRef.current, 95, { duration: 2.5, suffix: '%' });

      if (!totalRequests.error) totalRequests.start();
      if (!completedRequests.error) completedRequests.start();
      if (!completionRate.error) completionRate.start();
    }
  }, []);

  useEffect(() => {
    const featureCount = features.length;
    if (featureCount === 0) return;
    
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % featureCount);
    }, 6000);
    
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      title: 'Умная система заявок',
      description: 'Интуитивный интерфейс для создания, отслеживания и управления заявками с автоматической маршрутизацией.',
      color: 'from-cyan-500 to-blue-600',
    },
    {
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      title: 'Центр администрирования',
      description: 'Полный контроль над системой, управление пользователями и настройка рабочих процессов.',
      color: 'from-blue-500 to-purple-600',
    },
    {
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      title: 'ИИ-ассистент',
      description: 'Интеллектуальная система для помощи сотрудникам в работе. (В разработке)',
      color: 'from-purple-500 to-pink-600',
    },
    {
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      title: 'Аналитика и отчетность',
      description: 'Подробная аналитика, интерактивные таблицы, отчёты для повышения эффективности. (В разработке)',
      color: 'from-pink-500 to-rose-600',
    },
  ];

  return (
    <div className="min-h-screen font-sans antialiased bg-slate-900 text-gray-100 overflow-x-hidden">
      {/* Header с улучшенным эффектом стекла */}
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="fixed top-0 w-full z-50 py-4 px-6"
      >
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <motion.div
            className="flex items-center gap-3"
            whileHover={{ scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl shadow-cyan-500/20 flex items-center justify-center">
                <span className="text-white font-extrabold text-lg">МХП</span>
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent hidden md:block">
              Портал
            </span>
          </motion.div>

          {/* Кнопка бургер меню для мобильных */}
          <motion.button
            onClick={() => setIsNavOpen(!isNavOpen)}
            className="p-3 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-lg md:hidden z-60"
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.15)', scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Открыть меню"
            aria-expanded={isNavOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isNavOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </motion.button>

          {/* Навигация для десктопа */}
          <nav className="hidden md:flex items-center gap-2">
            {['features', 'stats', 'about'].map((section) => (
              <motion.a
                key={section}
                href={`#${section}`}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-200 hover:text-cyan-400 transition-all duration-300 relative group focus:outline-none focus:ring-2 focus:ring-cyan-500/30 backdrop-blur-sm"
                whileHover={{ y: -2 }}
                whileFocus={{ scale: 1.05 }}
              >
                <div className="absolute inset-0 bg-white/5 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10">
                  {section === 'features' ? 'Возможности' : section === 'stats' ? 'Результаты' : 'О проекте'}
                </span>
                <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 transition-all group-hover:w-3/4"></span>
              </motion.a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <motion.button
                  onClick={() => navigate('/dashboard')}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 relative overflow-hidden"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
                  <svg className="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
                  </svg>
                  <span className="relative z-10">Панель</span>
                </motion.button>
                <motion.button
                  onClick={handleLogout}
                  className="px-6 py-3 rounded-2xl font-medium border transition-all duration-300 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-slate-900 border-white/20 text-gray-200 hover:bg-white/10 backdrop-blur-sm"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Выйти
                </motion.button>
              </>
            ) : (
              <motion.button
                onClick={openLoginModal}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 relative overflow-hidden"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
                <svg className="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span className="relative z-10">Войти</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* Мобильное навигационное меню с эффектом стекла */}
        <AnimatePresence>
          {isNavOpen && (
            <motion.nav
              className="absolute top-0 left-0 w-full h-screen bg-slate-900/95 backdrop-blur-2xl flex flex-col items-center justify-center gap-12 md:hidden z-40"
              initial={{ opacity: 0, y: "-100vh" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "-100vh" }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              {/* Фоновые декоративные элементы */}
              <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
              
              <button 
                onClick={() => setIsNavOpen(false)} 
                className="absolute top-6 right-6 text-2xl text-gray-300 hover:text-cyan-400 p-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20"
                aria-label="Закрыть меню"
              >
                ✕
              </button>
              {['features', 'stats', 'about'].map((section) => (
                <motion.a
                  key={section}
                  href={`#${section}`}
                  className="text-2xl font-medium text-gray-200 hover:text-cyan-400 transition-colors py-4 px-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-cyan-500/30"
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsNavOpen(false)}
                >
                  {section === 'features' ? 'Возможности' : section === 'stats' ? 'Результаты' : 'О проекте'}
                </motion.a>
              ))}
              <div className="flex gap-6 mt-8">
                <motion.a 
                  href={INST_URL} 
                  whileHover={{ scale: 1.2, rotate: 10 }} 
                  className="text-3xl text-gray-300 hover:text-cyan-400 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10"
                  aria-label="Instagram"
                >
                  📸
                </motion.a>
                <motion.a 
                  href={YOUTUBE_URL} 
                  whileHover={{ scale: 1.2, rotate: -10 }} 
                  className="text-3xl text-gray-300 hover:text-red-400 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10"
                  aria-label="YouTube"
                >
                  🎥
                </motion.a>
              </div>
              {!isAuthenticated && (
                <motion.button
                  onClick={() => {
                    setIsNavOpen(false);
                    openLoginModal();
                  }}
                  className="px-8 py-4 mt-8 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-medium text-lg shadow-lg"
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Войти в систему
                </motion.button>
              )}
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Hero Section с улучшенным стеклянным эффектом */}
      <motion.section
        className="min-h-screen flex items-center justify-center relative overflow-hidden pt-20"
        style={{ y: heroParallax }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 z-0" />
        
        {/* Улучшенные градиентные наложения */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent z-5" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-900/60 to-transparent z-5" />
        
        {/* Декоративные светящиеся элементы */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" style={{ animationDelay: '1s' }} />
        
        <motion.div
          className="relative z-20 max-w-6xl mx-auto px-6 text-center"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
        >
          <motion.div
            className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 backdrop-blur-2xl border border-white/20 text-cyan-300 font-medium mb-8"
            animate={{ y: [-3, 3] }}
            transition={{ repeat: Infinity, repeatType: 'reverse', duration: 2, ease: 'easeInOut' }}
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Инновационная платформа 2.0
          </motion.div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black mb-8 leading-tight">
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-gradient-x">
              Корпоративный портал
            </span>
            <br />
            <span className="text-white drop-shadow-2xl">Минскхлебпром</span>
          </h1>

          <p className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto text-gray-200 font-light leading-relaxed">
            Переосмысление эффективности. Единое пространство для ваших идей и задач.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <motion.a
              href="#features"
              className="group px-8 py-4 bg-white/10 backdrop-blur-2xl border border-white/20 text-white rounded-2xl font-semibold shadow-lg hover:shadow-cyan-500/20 transition-all duration-300 flex items-center justify-center gap-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 relative overflow-hidden"
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative z-10">Исследовать возможности</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </motion.a>

            {!isAuthenticated && (
              <motion.button
                onClick={openLoginModal}
                className="group px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 relative overflow-hidden"
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10">Начать работу</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Индикатор скролла */}
        <motion.div
          className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20"
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <div className="w-6 h-10 border-2 border-cyan-500/60 rounded-full flex justify-center backdrop-blur-sm bg-white/5">
            <motion.div
              className="w-1 h-3 bg-cyan-500 rounded-full mt-2"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
            />
          </div>
        </motion.div>
      </motion.section>

      {/* Features Section с улучшенными стеклянными карточками */}
      <motion.section
        id="features"
        className="py-32 relative overflow-hidden"
      >
        {/* Декоративные светящиеся элементы */}
        <div className="absolute top-1/3 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl lg:text-5xl font-black mb-6">
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Возможности</span> будущего
            </h2>
            <p className="text-xl text-gray-200 max-w-3xl mx-auto font-light leading-relaxed">
              Инструменты, которые преобразуют ваш рабочий процесс
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Текстовая часть */}
            <div className="space-y-8">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  className={`p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-500 cursor-pointer group relative overflow-hidden ${
                    activeFeature === index
                      ? `border-cyan-500/50 shadow-2xl shadow-cyan-500/30 bg-gradient-to-r ${feature.color} bg-opacity-20`
                      : 'border-white/20 bg-white/5 hover:border-cyan-500/30 hover:bg-white/10'
                  }`}
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.5, delay: index * 0.2 }}
                  onClick={() => setActiveFeature(index)}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveFeature(index)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Выбрать функцию: ${feature.title}`}
                >
                  {/* Эффект блеска */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  
                  <div className="flex items-start gap-4 relative z-10">
                    <div className={`p-3 rounded-xl backdrop-blur-sm border flex-shrink-0 transition-colors ${
                      activeFeature === index 
                        ? 'bg-white/20 border-white/30 text-white' 
                        : 'bg-white/10 border-white/20 text-cyan-400 group-hover:text-cyan-300'
                    }`}>
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className={`text-xl font-semibold mb-2 transition-colors ${
                        activeFeature === index ? 'text-white' : 'text-white group-hover:text-cyan-100'
                      }`}>
                        {feature.title}
                      </h3>
                      <p className={`font-light leading-relaxed ${
                        activeFeature === index ? 'text-white/90' : 'text-gray-300 group-hover:text-gray-200'
                      }`}>
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Визуальная часть */}
            <motion.div
              className="relative"
              style={{ y: featureParallax }}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.8 }}
            >
              <div className="relative w-full h-[400px] bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 overflow-hidden shadow-2xl shadow-cyan-500/20">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20" />
                <div className="flex items-center justify-center h-full p-4">
                  {!videoError ? (
                    <video
                      src="/mocaup.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover rounded-lg"
                      onError={() => setVideoError(true)}
                      aria-label="Демонстрация функций портала"
                    >
                      Ваш браузер не поддерживает видео.
                    </video>
                  ) : (
                    <div className="flex items-center justify-center text-gray-400">
                      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Stats Section с улучшенным стеклянным дизайном */}
      <motion.section
        id="stats"
        className="py-32 relative bg-gradient-to-b from-slate-900 to-slate-800"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8 }}
      >
        <div className="container mx-auto px-6">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl lg:text-5xl font-black mb-6">
              Наши <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">результаты</span>
            </h2>
            <p className="text-xl text-gray-200 max-w-3xl mx-auto font-light leading-relaxed">
              Реальные показатели эффективности нашей платформы (Демо данные)
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { ref: totalRequestsRef, value: "0", label: "Всего заявок" },
              { ref: completedRequestsRef, value: "0", label: "Выполнено заявок" },
              { ref: completionRateRef, value: "0", label: "Процент выполнения" }
            ].map((stat, index) => (
              <motion.div
                key={index}
                className="p-8 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/20 text-center group hover:border-cyan-500/50 transition-all duration-300 relative overflow-hidden"
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                whileHover={{ y: -5 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <h3 className="text-4xl font-bold text-cyan-400 mb-4 group-hover:text-cyan-300 transition-colors relative z-10">
                  <span ref={stat.ref}>{stat.value}</span>
                </h3>
                <p className="text-gray-200 font-light group-hover:text-white transition-colors relative z-10">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* About Section */}
      <motion.section
        id="about"
        className="py-32 relative"
      >
        <div className="container mx-auto px-6">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl lg:text-5xl font-black mb-6">
              О <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">проекте</span>
            </h2>
            <p className="text-xl text-gray-200 max-w-3xl mx-auto font-light leading-relaxed">
              Инновационная платформа Минскхлебпром для оптимизации процессов и повышения эффективности
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <p className="text-gray-200 mb-6 text-lg leading-relaxed">
                Корпоративный портал Минскхлебпром — это современная платформа, разработанная для автоматизации и упрощения рабочих процессов. Мы стремимся предоставить интуитивно понятные инструменты, которые помогут вам сосредоточиться на главном.
              </p>
              <p className="text-gray-300 font-light leading-relaxed">
                Наша миссия — трансформировать подход к управлению задачами, обеспечивая прозрачность, эффективность и инновации на каждом этапе.
              </p>
              <motion.a
                href="#features"
                className="inline-block mt-8 px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-semibold shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Узнать больше
              </motion.a>
            </motion.div>
            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="relative w-full h-[300px] bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 overflow-hidden shadow-2xl shadow-cyan-500/20">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20" />
                <div className="flex items-center justify-center h-full p-0">
                  {!videoError ? (
                    <video
                      src="/mocaup2.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover rounded-lg"
                      onError={() => setVideoError(true)}
                      aria-label="Демонстрация возможностей системы"
                    >
                      Ваш браузер не поддерживает видео.
                    </video>
                  ) : (
                    <div className="flex items-center justify-center text-gray-400">
                      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Footer с улучшенным стеклянным эффектом */}
      <footer className="py-16 bg-white/10 backdrop-blur-2xl border-t border-white/20">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                  <span className="text-white font-extrabold text-lg">МХП</span>
                </div>
                <span className="text-xl font-bold text-white">Минскхлебпром</span>
              </div>
              <p className="text-gray-300 font-light leading-relaxed">
                Инновационная платформа для управления задачами и повышения эффективности.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Навигация</h3>
              <ul className="space-y-3">
                {['features', 'stats', 'about'].map((section) => (
                  <li key={section}>
                    <a
                      href={`#${section}`}
                      className="text-gray-400 hover:text-cyan-400 transition-colors font-light"
                    >
                      {section === 'features' ? 'Возможности' : section === 'stats' ? 'Результаты' : 'О проекте'}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Связаться с нами</h3>
              <div className="flex gap-6">
                <motion.a
                  href={INST_URL}
                  className="text-gray-300 hover:text-cyan-400 transition-colors p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10"
                  whileHover={{ scale: 1.2, rotate: 5 }}
                  aria-label="Instagram"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849s-.012 3.584-.069 4.849c-.148 3.252-1.691 4.771-4.919 4.919-1.266.058-1.645.069-4.849.069s-3.584-.012-4.849-.069c-3.252-.148-4.771-1.691-4.919-4.919-.058-1.265-.069-1.645-.069-4.849s.012-3.584.069-4.849c.148-3.252 1.691-4.771 4.919-4.919 1.265-.058 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.058 1.281-.073 1.689-.073 4.948s.014 3.667.072 4.947c.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.073 4.948.073s3.667-.014 4.947-.072c4.358-.2 6.78-2.618 6.98-6.98.058-1.281.072-1.689.072-4.948s-.014-3.667-.072-4.947c-.2-4.358-2.618-6.78-6.98-6.98-1.281-.058-1.689-.073-4.947-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.441s.645 1.441 1.441 1.441 1.441-.645 1.441-1.441-.645-1.441-1.441-1.441z" />
                  </svg>
                </motion.a>
                <motion.a
                  href={YOUTUBE_URL}
                  className="text-gray-300 hover:text-red-400 transition-colors p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10"
                  whileHover={{ scale: 1.2, rotate: -5 }}
                  aria-label="YouTube"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                  </svg>
                </motion.a>
              </div>
            </div>
          </div>
          <div className="mt-12 text-center text-gray-400 font-light pt-8 border-t border-white/10">
            &copy; {new Date().getFullYear()} Минскхлебпром. Все права защищены.
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={closeLoginModal}
        onLogin={handleLogin}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
};

export default HomePage;