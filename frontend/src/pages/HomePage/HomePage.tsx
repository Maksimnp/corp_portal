// src/pages/HomePage/HomePage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { CountUp } from 'countup.js';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

interface LoginResponse {
  access_token: string;
  role: number;
  full_name?: string;
}

interface LoginError {
  detail?: string;
  status?: number;
}

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
      if (savedMode !== null) return savedMode === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
  };

  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }
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

    let attempt = 0;
    const maxAttempts = 3;
    const delayMs = 1000;

    try {
      while (attempt < maxAttempts) {
        try {
          const response = await fetch('http://192.1.66.117:8000/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });

          const data = await response.json() as LoginResponse | LoginError;

          if (response.ok) {
            const { access_token, role, full_name = username } = data;
            login(access_token, String(role));
            localStorage.setItem('token', access_token);
            localStorage.setItem('role', String(role));
            localStorage.setItem('username', full_name);
            closeModal();
            navigate('/dashboard');
            return;
          }

          let errorMessage = `Ошибка: ${response.status}`;
          if (data.detail) {
            errorMessage = typeof data.detail === 'string' ? data.detail : errorMessage;
          }

          if (response.status === 401) {
            attempt++;
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              continue;
            }
            setError('Неверный логин или пароль. Превышено количество попыток.');
          } else if (response.status === 422) {
            setError(`Ошибка валидации: ${errorMessage}`);
          } else if (response.status === 500) {
            setError('Внутренняя ошибка сервера. Обратитесь к администратору.');
          } else {
            setError(errorMessage);
          }
          break;
        } catch (err) {
          console.error('Ошибка сети:', err);
          if (attempt < maxAttempts - 1) {
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          setError(
            process.env.NODE_ENV === 'development'
              ? `Ошибка сети: ${err instanceof Error ? err.message : String(err)}`
              : 'Не удалось подключиться к серверу. Проверьте его доступность.'
          );
          break;
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    const totalRequests = new CountUp(totalRequestsRef.current!, 1000, { duration: 2 });
    const completedRequests = new CountUp(completedRequestsRef.current!, 950, { duration: 2 });
    const completionRate = new CountUp(completionRateRef.current!, 95, { duration: 2, suffix: '%' });

    if (!totalRequests.error) totalRequests.start();
    if (!completedRequests.error) completedRequests.start();
    if (!completionRate.error) completionRate.start();

    if (progressCircleRef.current) {
      const circumference = 2 * Math.PI * 54;
      const completionRate = 95;
      const offset = circumference - (completionRate / 100) * circumference;
      progressCircleRef.current.style.strokeDasharray = circumference.toString();
      progressCircleRef.current.style.strokeDashoffset = offset.toString();
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
      }> = [];

      for (let i = 0; i < 100; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 3 + 1,
          speedX: Math.random() * 1 - 0.5,
          speedY: Math.random() * 1 - 0.5,
        });
      }

      const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((particle) => {
          particle.x += particle.speedX;
          particle.y += particle.speedY;

          if (particle.x < 0 || particle.x > canvas.width || particle.y < 0 || particle.y > canvas.height) {
            particle.x = Math.random() * canvas.width;
            particle.y = Math.random() * canvas.height;
          }

          ctx.fillStyle = darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 111, 97, 0.1)';
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fill();
        });
        requestAnimationFrame(animate);
      };
      animate();

      const handleResize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [darkMode]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark bg-gray-900 text-gray-100' : 'light bg-gray-50 text-gray-900'}`}>
      <header className={`flex justify-between items-center p-4 shadow-md sticky top-0 z-50 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="text-2xl font-bold text-red-500 flex items-center gap-2">
          <span className="text-3xl">🍞</span>
          <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
            МинскХлебHelp
          </span>
        </div>
        <nav>
          <ul className="flex items-center gap-6">
            <li>
              <a
                href="#features"
                className={`hover:text-red-500 transition-colors duration-200 font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                Функции
              </a>
            </li>
            <li>
              <a
                href="#about-modal"
                onClick={openModal}
                className={`hover:text-red-500 transition-colors duration-200 font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                О проекте
              </a>
            </li>
            <li className="relative group">
              <a
                href="#"
                className={`flex items-center gap-2 hover:text-red-500 transition-colors duration-200 font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                <span>Соцсети</span>
                <svg
                  className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180"
                  viewBox="0 0 360 360"
                  xmlSpace="preserve"
                >
                  <path
                    fill={darkMode ? '#e5e7eb' : '#4b5563'}
                    d="M325.607,79.393c-5.857-5.857-15.355-5.858-21.213,0.001l-139.39,139.393L25.607,79.393c-5.857-5.857-15.355-5.858-21.213,0.001c-5.858,5.858-5.858,15.355,0,21.213l150.004,150c2.813,2.813,6.628,4.393,10.606,4.393s7.794-1.581,10.606-4.394l149.996-150C331.465,94.749,331.465,85.251,325.607,79.393z"
                  />
                </svg>
              </a>
              <ul
                className={`absolute top-full left-0 mt-2 border rounded-lg shadow-lg hidden group-hover:flex flex-col w-48 opacity-0 group-hover:opacity-100 transition-all duration-300 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-200 text-gray-800'}`}
              >
                <li className={`p-2 rounded transition-colors duration-200 ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}>
                  <a href="https://www.instagram.com/minskhleb_by/" className="flex items-center gap-2" aria-label="Instagram">
                    <span className="text-red-500">📸</span> Instagram
                  </a>
                </li>
                <li className={`p-2 rounded transition-colors duration-200 ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}>
                  <a
                    href="https://www.youtube.com/channel/UCJuS4Sxf8AOCIxRjlNxxffA"
                    className="flex items-center gap-2"
                    aria-label="Youtube"
                  >
                    <span className="text-red-500">▶️</span> Youtube
                  </a>
                </li>
              </ul>
            </li>
            {isAuthenticated ? (
              <>
                <li>
                  <button
                    onClick={handleLogout}
                    className="bg-gradient-to-r from-red-500 to-orange-500 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all duration-300 hover:scale-105"
                  >
                    Выйти
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all duration-300 hover:scale-105"
                  >
                    Назад
                  </button>
                </li>
              </>
            ) : (
              <li>
                <button
                  onClick={openLoginModal}
                  className="bg-gradient-to-r from-red-500 to-orange-500 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all duration-300 hover:scale-105"
                >
                  Войти
                </button>
              </li>
            )}
            <li>
              <button
                onClick={toggleDarkMode}
                aria-label={darkMode ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
                className="text-2xl hover:rotate-180 transition-transform duration-500 hover:text-red-500"
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
            </li>
          </ul>
        </nav>
      </header>

      <main>
        <section className="relative h-[80vh] flex items-center justify-center overflow-hidden">
          <div id="bg-canvas" className="absolute inset-0">
            <canvas ref={canvasRef} id="canvas" className="w-full h-full"></canvas>
          </div>

          <div className="welcome-container relative z-10 max-w-4xl mx-auto p-8 md:p-12">
            <div
              className={`rounded-2xl p-8 md:p-12 border-2 transition-all duration-500 hover:shadow-2xl relative overflow-hidden group ${darkMode ? 'bg-gray-800 bg-opacity-90 hover:border-red-400' : 'bg-white bg-opacity-90 hover:border-red-300'}`}
            >
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-red-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-100"></div>
                <div className="absolute bottom-0 right-0 w-0.5 h-full bg-gradient-to-t from-transparent via-blue-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-200"></div>
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-300"></div>
                <div className="absolute top-0 right-0 w-0.5 h-full bg-gradient-to-b from-transparent via-green-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-400"></div>
              </div>

              <div
                className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${darkMode ? 'bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900' : 'bg-gradient-to-br from-red-50 via-blue-50 to-yellow-50'}`}
              ></div>

              <div className="relative z-10">
                <h1
                  className={`text-4xl md:text-5xl font-bold mb-6 transition-colors duration-300 group-hover:text-red-500 ${darkMode ? 'text-white' : 'text-gray-800'}`}
                >
                  Добро пожаловать в <span className="text-red-500">МинскХлебHelp!</span>
                </h1>

                <p
                  className={`text-lg md:text-xl mb-8 max-w-2xl mx-auto transition-colors duration-300 ${darkMode ? 'text-gray-300 group-hover:text-gray-100' : 'text-gray-600 group-hover:text-gray-800'}`}
                >
                  Ваш помощник в трудную минуту. Поддержка, помощь и искусственный интеллект — всегда рядом.
                </p>

                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <a
                    href="#features"
                    className="px-8 py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg font-medium hover:shadow-lg hover:scale-105 transition-all duration-300 shadow-md"
                  >
                    Возможности проекта
                  </a>

                  {!isAuthenticated && (
                    <button
                      onClick={openLoginModal}
                      className={`px-8 py-3 rounded-lg font-medium hover:scale-[1.02] transition-all duration-300 shadow-sm hover:shadow-md ${darkMode ? 'bg-gray-700 text-white border border-gray-600 hover:bg-gray-600' : 'bg-white text-red-500 border border-red-300 hover:bg-red-50'}`}
                    >
                      Вход для сотрудников
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className={`py-16 text-center ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <h2 className={`text-3xl font-bold mb-10 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Возможности проекта</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto px-4">
            <div
              className={`p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border ${darkMode ? 'bg-gray-700 border-gray-600 hover:border-red-400' : 'bg-white border-transparent hover:border-red-100'}`}
            >
              <div className="flex flex-col items-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${darkMode ? 'bg-gray-600' : 'bg-red-50'}`}>
                  <span className="text-2xl text-red-500">📝</span>
                </div>
                <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>Создание запросов</h3>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Пользователям доступна возможность направления заявок...</p>
              </div>
            </div>

            <div
              className={`p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border ${darkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-white border-transparent hover:border-blue-100'}`}
            >
              <div className="flex flex-col items-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${darkMode ? 'bg-gray-600' : 'bg-blue-50'}`}>
                  <span className="text-2xl text-blue-500">👨‍💼</span>
                </div>
                <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>Администрирование</h3>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Полный контроль над системой для администраторов...</p>
              </div>
            </div>

            <div
              className={`p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border ${darkMode ? 'bg-gray-700 border-gray-600 hover:border-green-400' : 'bg-white border-transparent hover:border-green-100'}`}
            >
              <div className="flex flex-col items-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${darkMode ? 'bg-gray-600' : 'bg-green-50'}`}>
                  <span className="text-2xl text-green-500">🤖</span>
                </div>
                <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>ИИ помощник</h3>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Интеллектуальная система для автоматической обработки...</p>
              </div>
            </div>

            <div
              className={`p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border ${darkMode ? 'bg-gray-700 border-gray-600 hover:border-yellow-400' : 'bg-white border-transparent hover:border-yellow-100'}`}
            >
              <div className="flex flex-col items-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${darkMode ? 'bg-gray-600' : 'bg-yellow-50'}`}>
                  <span className="text-2xl text-yellow-500">📊</span>
                </div>
                <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>Статистика</h3>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Детальная аналитика и отчетность по всем процессам...</p>
              </div>
            </div>
          </div>
        </section>

        <section className={`py-16 text-center ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
          <h2 className={`text-3xl font-bold mb-10 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Наши достижения</h2>
          <div className="flex justify-center gap-8 flex-wrap px-4">
            <div
              className={`p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105 border ${darkMode ? 'bg-gray-800 border-gray-700 hover:border-red-400' : 'bg-white border-transparent hover:border-red-100'}`}
            >
              <span
                ref={totalRequestsRef}
                className="text-4xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent"
              >
                0
              </span>
              <p className={darkMode ? 'text-gray-300 mt-2' : 'text-gray-600 mt-2'}>Всего запросов</p>
            </div>

            <div
              className={`p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105 border ${darkMode ? 'bg-gray-800 border-gray-700 hover:border-blue-400' : 'bg-white border-transparent hover:border-blue-100'}`}
            >
              <span
                ref={completedRequestsRef}
                className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-green-500 bg-clip-text text-transparent"
              >
                0
              </span>
              <p className={darkMode ? 'text-gray-300 mt-2' : 'text-gray-600 mt-2'}>Выполнено</p>
            </div>

            <div
              className={`p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105 border relative ${darkMode ? 'bg-gray-800 border-gray-700 hover:border-purple-400' : 'bg-white border-transparent hover:border-purple-100'}`}
            >
              <svg className="w-32 h-32">
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke={darkMode ? '#374151' : '#f3f4f6'}
                  strokeWidth="12"
                />
                <circle
                  ref={progressCircleRef}
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray="339.292"
                  strokeDashoffset="339.292"
                  transform="rotate(-90 60 60)"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#f97316" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  ref={completionRateRef}
                  className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}
                >
                  0%
                </span>
              </div>
              <p className={darkMode ? 'text-gray-300 mt-2' : 'text-gray-600 mt-2'}>Процент выполнения</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="text-center p-6 bg-gradient-to-r from-gray-800 to-gray-900 text-white">
        <p>© 2025 MinskXlebHelp. Все права защищены.</p>
        <div className="flex justify-center gap-4 mt-4">
          <a
            href="https://www.instagram.com/minskhleb_by/"
            aria-label="Instagram"
            className="text-white hover:text-red-400 transition-colors duration-200 text-2xl"
          >
            📸
          </a>
          <a
            href="https://www.youtube.com/channel/UCJuS4Sxf8AOCIxRjlNxxffA"
            aria-label="Youtube"
            className="text-white hover:text-red-400 transition-colors duration-200 text-2xl"
          >
            ▶️
          </a>
        </div>
      </footer>

      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className={`p-8 rounded-xl shadow-2xl max-w-md w-full relative ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <button
              onClick={closeLoginModal}
              className={`absolute top-4 right-4 transition-colors duration-200 text-2xl ${darkMode ? 'text-gray-400 hover:text-red-500' : 'text-gray-500 hover:text-red-500'}`}
            >
              ×
            </button>
            <h2 className={`text-2xl font-bold text-center mb-6 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                Вход в систему
              </span>
            </h2>

            {error && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${darkMode ? 'bg-red-900 border border-red-700 text-red-100' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor="login-username" className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Логин
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleLogin()}
                  placeholder="Введите ваш логин"
                  disabled={isLoading}
                  className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 disabled:bg-gray-600' : 'border-gray-300 disabled:bg-gray-100'}`}
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="login-password" className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Пароль
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleLogin()}
                  placeholder="Введите ваш пароль"
                  disabled={isLoading}
                  className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 disabled:bg-gray-600' : 'border-gray-300 disabled:bg-gray-100'}`}
                />
              </div>

              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-medium rounded-lg transition duration-200 flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
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

      {isModalOpen && (
        <div id="about-modal" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className={`p-8 rounded-xl shadow-2xl max-w-md w-full relative ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <button
              onClick={closeModal}
              className={`absolute top-4 right-4 transition-colors duration-200 text-2xl ${darkMode ? 'text-gray-400 hover:text-red-500' : 'text-gray-500 hover:text-red-500'}`}
            >
              ×
            </button>

            <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                О проекте
              </span>
            </h2>

            <div className="space-y-4">
              <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                MinskXlebHelp — это интеллектуальная система поддержки сотрудников и клиентов компании МинскХлеб.
              </p>

              <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                Наша цель — сделать техническую помощь доступной каждому, автоматизировать процессы обработки запросов и повысить эффективность работы.
              </p>

              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>Основные возможности:</h3>
                <ul className={`list-disc list-inside space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <li>Быстрое создание и отслеживание запросов</li>
                  <li>Интеллектуальная система категоризации</li>
                  <li>Автоматизированная обработка обращений</li>
                  <li>Детальная аналитика и отчетность</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;