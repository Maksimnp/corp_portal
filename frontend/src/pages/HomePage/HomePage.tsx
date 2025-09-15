import React, { useState, useEffect, useRef } from 'react';
import { CountUp } from 'countup.js';
import { useNavigate } from 'react-router-dom';
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
const YOUTUBE_URL = import.meta.env.YOUTUBE_CHANEL_URL;
const INST_URL = import.meta.env.INSTAGRAM_URL;

const HomePage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalRequestsRef = useRef<HTMLSpanElement>(null);
  const completedRequestsRef = useRef<HTMLSpanElement>(null);
  const completionRateRef = useRef<HTMLSpanElement>(null);
  const progressCircleRef = useRef<SVGCircleElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated, login, logout } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('darkMode');
      return savedMode !== null ? savedMode === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [activeFeature, setActiveFeature] = useState(0);

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
  };

  // Apply dark mode class to body
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    document.body.classList.toggle('light', !darkMode);
  }, [darkMode]);

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
    setUsername('');
    setPassword('');
    setError(null);
    setIsLoading(false);
  };
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => {
    setIsModalOpen(false);
    setUsername('');
    setPassword('');
    setError(null);
  };

  const handleLogin = async () => {
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
          localStorage.setItem('token', access_token);
          localStorage.setItem('role', String(role));
          localStorage.setItem('username', full_name);
          localStorage.setItem('department', department);
          closeModal();
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
          response.status === 401 ? 'Неверный логин или пароль. Превышено количество попыток.' :
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
            : 'Не удалось подключиться к серверу. Проверьте его доступность.'
        );
        break;
      } finally {
        if (attempt === maxAttempts - 1) setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      handleLogin();
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Initialize animations and effects
  useEffect(() => {
    const totalRequests = new CountUp(totalRequestsRef.current!, 1247, { duration: 2 });
    const completedRequests = new CountUp(completedRequestsRef.current!, 1182, { duration: 2 });
    const completionRate = new CountUp(completionRateRef.current!, 95, { duration: 2, suffix: '%' });
    if (!totalRequests.error) totalRequests.start();
    if (!completedRequests.error) completedRequests.start();
    if (!completionRate.error) completionRate.start();

    if (progressCircleRef.current) {
      const circumference = 2 * Math.PI * 54;
      const completionRateValue = 95;
      const offset = circumference - (completionRateValue / 100) * circumference;
      progressCircleRef.current.style.strokeDasharray = `${circumference}`;
      progressCircleRef.current.style.strokeDashoffset = `${offset}`;
      progressCircleRef.current.style.transition = 'stroke-dashoffset 2s ease-in-out';
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const particles: Array<{
        x: number;
        y: number;
        size: number;
        speedX: number;
        speedY: number;
        opacity: number;
        color: string;
      }> = [];
      
      const colors = darkMode 
        ? ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9c74f', '#ffafcc'] 
        : ['#e63946', '#2a9d8f', '#1d3557', '#f4a261', '#e76f51'];
      
      for (let i = 0; i < 100; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 3 + 1,
          speedX: Math.random() * 2 - 1,
          speedY: Math.random() * 2 - 1,
          opacity: Math.random() * 0.6 + 0.2,
          color
        });
      }
      
      let animationFrameId: number;
      const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Create gradient background
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        if (darkMode) {
          gradient.addColorStop(0, '#0f172a');
          gradient.addColorStop(1, '#1e293b');
        } else {
          gradient.addColorStop(0, '#f8fafc');
          gradient.addColorStop(1, '#e2e8f0');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach((particle) => {
          particle.x += particle.speedX;
          particle.y += particle.speedY;
          
          if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
          if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;
          
          // Draw glow effect
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
          const glowGradient = ctx.createRadialGradient(
            particle.x, particle.y, 0, 
            particle.x, particle.y, particle.size * 2
          );
          glowGradient.addColorStop(0, `${particle.color}40`);
          glowGradient.addColorStop(1, 'transparent');
          ctx.fillStyle = glowGradient;
          ctx.fill();
          
          // Draw particle
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fillStyle = particle.color;
          ctx.fill();
        });
        
        animationFrameId = requestAnimationFrame(animate);
      };
      
      animate();
      
      const handleResize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationFrameId);
      };
    }
  }, [darkMode]);

  // Auto-rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 4);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <header className={`py-4 px-6 sticky top-0 z-50 ${darkMode ? 'bg-gray-900/95' : 'bg-white/95'} border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} backdrop-blur-md`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center shadow-lg animate-pulse-slow">
              <span className="text-white font-bold text-lg">MXP</span>
            </div>
            <span className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              Минскхлебпром
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className={`text-sm font-semibold hover:text-red-500 transition-all duration-300 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Возможности
            </a>
            <a href="#stats" className={`text-sm font-semibold hover:text-red-500 transition-all duration-300 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Результаты
            </a>
            <a href={INST_URL} className={`text-sm font-semibold hover:text-red-500 transition-all duration-300 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Instagram
            </a>
            <a href={YOUTUBE_URL} className={`text-sm font-semibold hover:text-red-500 transition-all duration-300 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              YouTube
            </a>
          </nav>
          
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-300 hover:scale-105 shadow-md"
                >
                  Панель управления
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 border border-gray-300 text-gray-700 dark:text-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300"
                >
                  Выйти
                </button>
              </>
            ) : (
              <button
                onClick={openLoginModal}
                className="px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-300 hover:scale-105 shadow-md"
              >
                Войти
              </button>
            )}
            <button
              onClick={toggleDarkMode}
              className={`p-3 rounded-xl ${darkMode ? 'bg-gray-800 text-yellow-400' : 'bg-gray-200 text-gray-700'} transition-all duration-300 hover:scale-110`}
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center relative overflow-hidden pt-16">
        <div id="bg-canvas" className="absolute inset-0 z-0">
          <canvas ref={canvasRef} id="canvas" className="w-full h-full" />
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/80 dark:to-gray-900/90 z-1"></div>
        
        <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
          <div className="inline-block px-6 py-3 rounded-full bg-red-500/10 dark:bg-red-500/20 backdrop-blur-sm mb-8 border border-red-500/30 animate-float">
            <span className="text-red-500 dark:text-red-400 font-semibold">Инновационная платформа</span>
          </div>
          
          <h1 className={`text-5xl sm:text-6xl md:text-7xl font-bold mb-8 ${darkMode ? 'text-white' : 'text-gray-800'} leading-tight`}>
            Корпоративный портал{' '}
            <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent animate-gradient">
              Минскхлебпром
            </span>
          </h1>
          
          <p className={`text-xl md:text-2xl mb-12 max-w-3xl mx-auto ${darkMode ? 'text-gray-300' : 'text-gray-600'} leading-relaxed`}>
            Современное решение для автоматизации бизнес-процессов и повышения эффективности работы предприятия
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <a
              href="#features"
              className="px-8 py-4 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl font-semibold hover:shadow-2xl transition-all duration-300 hover:scale-105 shadow-lg flex items-center justify-center gap-3 group"
            >
              <span>Узнать больше</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
            
            {!isAuthenticated && (
              <button
                onClick={openLoginModal}
                className={`px-8 py-4 rounded-xl font-semibold border-2 transition-all duration-300 hover:scale-105 flex items-center justify-center gap-3 group ${
                  darkMode 
                    ? 'border-red-500 text-white hover:bg-red-500' 
                    : 'border-red-500 text-red-500 hover:bg-red-500 hover:text-white'
                }`}
              >
                <span>Войти в систему</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
        </div>
        
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-10 animate-bounce">
          <div className={`w-8 h-12 border-2 rounded-full flex justify-center ${darkMode ? 'border-red-500' : 'border-red-500'}`}>
            <div className={`w-1 h-3 rounded-full mt-2 ${darkMode ? 'bg-red-500' : 'bg-red-500'} animate-ping`}></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 lg:py-28 bg-white dark:bg-gray-900 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-gray-50 to-transparent dark:from-gray-900"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-gray-800 dark:text-white">
              Наши <span className="text-red-500">возможности</span>
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Современные инструменты для автоматизации и оптимизации рабочих процессов
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-6xl mx-auto">
            <div className="flex group" data-aos="fade-up">
              <div className={`mr-6 mt-2 w-14 h-14 rounded-xl flex items-center justify-center ${darkMode ? 'bg-red-500/20' : 'bg-red-100'} text-red-500 group-hover:scale-110 transition-transform duration-300`}>
                <span className="text-2xl">📝</span>
              </div>
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white group-hover:text-red-500 transition-colors duration-300">Умная система заявок</h3>
                <p className="text-gray-600 dark:text-gray-300 text-lg">
                  Интуитивный интерфейс для создания, отслеживания и управления заявками с автоматической маршрутизацией и приоритизацией
                </p>
              </div>
            </div>
            
            <div className="flex group" data-aos="fade-up" data-aos-delay="100">
              <div className={`mr-6 mt-2 w-14 h-14 rounded-xl flex items-center justify-center ${darkMode ? 'bg-blue-500/20' : 'bg-blue-100'} text-blue-500 group-hover:scale-110 transition-transform duration-300`}>
                <span className="text-2xl">👨‍💼</span>
              </div>
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white group-hover:text-blue-500 transition-colors duration-300">Центр администрирования</h3>
                <p className="text-gray-600 dark:text-gray-300 text-lg">
                  Полный контроль над системой, управление пользователями, ролями и настройка сложных рабочих процессов
                </p>
              </div>
            </div>
            
            <div className="flex group" data-aos="fade-up" data-aos-delay="200">
              <div className={`mr-6 mt-2 w-14 h-14 rounded-xl flex items-center justify-center ${darkMode ? 'bg-green-500/20' : 'bg-green-100'} text-green-500 group-hover:scale-110 transition-transform duration-300`}>
                <span className="text-2xl">🤖</span>
              </div>
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white group-hover:text-green-500 transition-colors duration-300">ИИ-ассистент</h3>
                <p className="text-gray-600 dark:text-gray-300 text-lg">
                  Интеллектуальная система для автоматической категоризации, анализа и обработки обращений с машинным обучением
                </p>
              </div>
            </div>
            
            <div className="flex group" data-aos="fade-up" data-aos-delay="300">
              <div className={`mr-6 mt-2 w-14 h-14 rounded-xl flex items-center justify-center ${darkMode ? 'bg-yellow-500/20' : 'bg-yellow-100'} text-yellow-500 group-hover:scale-110 transition-transform duration-300`}>
                <span className="text-2xl">📊</span>
              </div>
              <div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white group-hover:text-yellow-500 transition-colors duration-300">Аналитика и отчетность</h3>
                <p className="text-gray-600 dark:text-gray-300 text-lg">
                  Детальная аналитика, customizable отчеты и интерактивные дашборды для мониторинга эффективности бизнес-процессов
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="py-20 lg:py-28 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl lg:text-5xl font-bold mb-16 text-center text-gray-800 dark:text-white">
              Наши <span className="text-red-500">результаты</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className="text-center group" data-aos="zoom-in">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl transform transition-all duration-500 group-hover:-translate-y-3">
                  <span
                    ref={totalRequestsRef}
                    className="text-6xl font-bold text-red-500 block mb-4"
                  >
                    0
                  </span>
                  <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-white">Всего запросов</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Обработано системой с момента запуска платформы
                  </p>
                </div>
              </div>
              
              <div className="text-center group" data-aos="zoom-in" data-aos-delay="150">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl transform transition-all duration-500 group-hover:-translate-y-3">
                  <span
                    ref={completedRequestsRef}
                    className="text-6xl font-bold text-green-500 block mb-4"
                  >
                    0
                  </span>
                  <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-white">Выполнено</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Успешно закрытых и выполненных запросов пользователей
                  </p>
                </div>
              </div>
              
              <div className="text-center group" data-aos="zoom-in" data-aos-delay="300">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl transform transition-all duration-500 group-hover:-translate-y-3">
                  <span
                    ref={completionRateRef}
                    className="text-6xl font-bold text-blue-500 block mb-4"
                  >
                    0%
                  </span>
                  <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-white">Эффективность</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Общий показатель эффективности работы системы и сотрудников
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-gradient-to-r from-red-500 to-orange-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-dot-pattern opacity-20"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-white">
            Готовы начать работу?
          </h2>
          <p className="text-xl mb-10 max-w-2xl mx-auto text-red-100">
            Присоединяйтесь к платформе для эффективной организации рабочих процессов и повышения производительности
          </p>
          {!isAuthenticated ? (
            <button
              onClick={openLoginModal}
              className="px-10 py-5 bg-white text-red-500 rounded-2xl font-bold text-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 shadow-lg"
            >
              Войти в систему
            </button>
          ) : (
            <button
              onClick={() => navigate('/dashboard')}
              className="px-10 py-5 bg-gray-800 text-white rounded-2xl font-bold text-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 shadow-lg"
            >
              Перейти в панель управления
            </button>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="py-16 bg-gray-900 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">MXP</span>
                </div>
                <span className="text-2xl font-bold">Минскхлебпром</span>
              </div>
              <p className="text-gray-400 mb-6 text-lg">
                Корпоративный портал для автоматизации бизнес-процессов и эффективного взаимодействия сотрудников предприятия. 
                Инновационные решения для повышения производительности и оптимизации workflows.
              </p>
              <div className="flex items-center gap-6">
                <a
                  href={INST_URL}
                  aria-label="Instagram"
                  className="text-2xl hover:text-red-400 transition-all duration-300 hover:scale-110"
                >
                  📸
                </a>
                <a
                  href={YOUTUBE_URL}
                  aria-label="YouTube"
                  className="text-2xl hover:text-red-400 transition-all duration-300 hover:scale-110"
                >
                  ▶️
                </a>
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-6">Разделы</h3>
              <ul className="space-y-4">
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors text-lg">Возможности</a></li>
                <li><a href="#stats" className="text-gray-400 hover:text-white transition-colors text-lg">Результаты</a></li>
                <li><button onClick={openModal} className="text-gray-400 hover:text-white transition-colors text-lg">О проекте</button></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-6">Контакты</h3>
              <ul className="space-y-4 text-gray-400 text-lg">
                <li className="flex items-center gap-3">
                  <span className="text-red-500">📞</span> +375 (17) 123-45-67
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-red-500">✉️</span> info@minskhliebprom.by
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-red-500">📍</span> г. Минск, ул. Примерная, 123
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400 text-lg">
            <p>© 2025 Корпоративный портал Минскхлебпром. Все права защищены.</p>
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4" role="dialog" aria-labelledby="login-modal-title">
          <div className={`p-10 rounded-3xl shadow-2xl max-w-md w-full relative ${darkMode ? 'bg-gray-800' : 'bg-white'} animate-modal-in`}>
            <button
              onClick={closeLoginModal}
              className={`absolute top-5 right-5 text-2xl transition-all duration-300 hover:scale-110 ${darkMode ? 'text-gray-400 hover:text-red-500' : 'text-gray-500 hover:text-red-500'}`}
              aria-label="Закрыть"
            >
              ×
            </button>
            <h2 id="login-modal-title" className={`text-3xl font-bold text-center mb-8 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                Вход в систему
              </span>
            </h2>
            {error && (
              <div className={`mb-6 p-4 rounded-xl text-lg ${darkMode ? 'bg-red-900/50 border border-red-700 text-red-100' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {error}
              </div>
            )}
            <div className="space-y-6">
              <div>
                <label htmlFor="login-username" className={`block text-lg font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Логин
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Введите ваш логин"
                  disabled={isLoading}
                  className={`w-full p-4 border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-red-500/30 transition ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 disabled:bg-gray-600' : 'border-gray-300 text-gray-900 placeholder-gray-400 disabled:bg-gray-100'}`}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="login-password" className={`block text-lg font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Пароль
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Введите ваш пароль"
                  disabled={isLoading}
                  className={`w-full p-4 border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-red-500/30 transition ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 disabled:bg-gray-600' : 'border-gray-300 text-gray-900 placeholder-gray-400 disabled:bg-gray-100'}`}
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full py-4 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-bold rounded-xl transition-all duration-300 flex items-center justify-center disabled:opacity-50 hover:shadow-xl"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-6 w-6 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Входим...
                  </>
                ) : (
                  'Войти'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {isModalOpen && (
        <div id="about-modal" className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4" role="dialog" aria-labelledby="about-modal-title">
          <div className={`p-10 rounded-3xl shadow-2xl max-w-2xl w-full relative ${darkMode ? 'bg-gray-800' : 'bg-white'} animate-modal-in`}>
            <button
              onClick={closeModal}
              className={`absolute top-5 right-5 text-2xl transition-all duration-300 hover:scale-110 ${darkMode ? 'text-gray-400 hover:text-red-500' : 'text-gray-500 hover:text-red-500'}`}
              aria-label="Закрыть"
            >
              ×
            </button>
            <h2 id="about-modal-title" className={`text-3xl font-bold mb-8 text-center ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                О проекте
              </span>
            </h2>
            <div className="space-y-6">
              <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Корпоративный портал Минскхлебпром — это интеллектуальная система поддержки сотрудников и клиентов компании МинскХлеб. 
                Мы создали современную платформу для автоматизации бизнес-процессов и повышения эффективности работы предприятия.
              </p>
              <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Наша цель — сделать техническую помощь доступной каждому, автоматизировать процессы обработки запросов 
                и предоставить инструменты для анализа и оптимизации workflows. Мы используем передовые технологии, 
                включая искусственный интеллект, для улучшения пользовательского опыта.
              </p>
              <div className={`p-6 rounded-2xl border-2 ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Основные возможности:
                </h3>
                <ul className={`grid grid-cols-1 md:grid-cols-2 gap-4 text-lg ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li className="flex items-center gap-3">
                    <span className="text-red-500">✓</span> Умная система создания заявок
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-red-500">✓</span> Автоматическая маршрутизация
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-red-500">✓</span> ИИ-ассистент для обработки
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-red-500">✓</span> Детальная аналитика и отчетность
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-red-500">✓</span> Мобильная адаптивность
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-red-500">✓</span> Интеграция с внешними системами
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes modalIn {
          0% { opacity: 0; transform: scale(0.8) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        .animate-gradient {
          background: linear-gradient(-45deg, #e63946, #f4a261, #2a9d8f, #1d3557);
          background-size: 400% 400%;
          animation: gradient 5s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .animate-modal-in {
          animation: modalIn 0.3s ease-out forwards;
        }
        .animate-pulse-slow {
          animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .bg-grid-pattern {
          background-image: linear-gradient(to right, #80808012 1px, transparent 1px),
                            linear-gradient(to bottom, #80808012 1px, transparent 1px);
          background-size: 50px 50px;
        }
        .bg-dot-pattern {
          background-image: radial-gradient(#ffffff22 1px, transparent 1px);
          background-size: 25px 25px;
        }
      `}</style>
    </div>
  );
};

export default HomePage;