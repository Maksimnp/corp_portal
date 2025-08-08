import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Интерфейс контакта
export interface Contact {
  id: string;
  displayName?: string;
  position?: string;
  department?: string;
  phone_internal?: string;
  phone_city?: string;
  phone_mobile?: string;
  email?: string;
  sam_account_name?: string;
  isFrozen?: boolean;
  groups?: string[];
}

// Функция для форматирования номера телефона
const formatPhoneNumber = (phone: string | undefined): string | undefined => {
  if (!phone) return undefined;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length >= 8) {
    if (cleaned.startsWith('+375') && cleaned.length === 13) {
      return `+375 (${cleaned.slice(4, 6)}) ${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}-${cleaned.slice(11, 13)}`;
    } else if (cleaned.startsWith('375') && cleaned.length === 12) {
      return `+375 (${cleaned.slice(3, 5)}) ${cleaned.slice(5, 8)}-${cleaned.slice(8, 10)}-${cleaned.slice(10, 12)}`;
    }
  }
  return phone; 
};

// Функция для получения инициалов
const getInitials = (contact: Contact): string => {
  if (!contact || !contact.displayName || !contact.displayName.trim()) return '?';

  const nameParts = contact.displayName.split(' ').filter(part => part.length > 0);
  if (nameParts.length >= 2) {
    return `${nameParts[0][0] || ''}${nameParts[1][0] || ''}`.toUpperCase();
  }
  if (nameParts.length === 1) {
    return nameParts[0][0]?.toUpperCase() || '?';
  }
  return '?';
};

export default function ContactsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLimited, setIsLimited] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  const [isPrintMode, setIsPrintMode] = useState(false);

  // Размеры шрифтов
  const fontSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
    xlarge: 'text-xl'
  };

  // Загрузка контактов
  const fetchAllContacts = async () => {
    setError(null);
    setLoading(true);
    setIsLimited(false);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден. Пожалуйста, войдите снова.');
      }

      const baseUrl = process.env.VITE_API_URL || 'http://192.1.66.117:8000';
      const url = `${baseUrl}/contacts?query=*`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });

      if (!response.ok) {
        let errorMessage = `Ошибка HTTP: ${response.status}`;
        let errorDetail = null;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.message || null;
        } catch (e) {}

        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('username');
          errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
          navigate('/');
        } else if (response.status === 403) {
          errorMessage = 'Доступ запрещен.';
        } else if (response.status === 500) {
          errorMessage = 'Внутренняя ошибка сервера. Попробуйте позже.';
        } else if (errorDetail) {
          errorMessage = `Ошибка: ${errorDetail}`;
        }

        throw new Error(errorMessage);
      }

      const data: Contact[] = await response.json();
      console.log('Fetched contacts:', data); // Debugging log
      const formattedData = data
        .filter(contact => contact.displayName && contact.displayName.trim()) // Filter out invalid contacts
        .map(contact => ({
          ...contact,
          phone_mobile: formatPhoneNumber(contact.phone_mobile),
          phone_internal: formatPhoneNumber(contact.phone_internal),
          phone_city: formatPhoneNumber(contact.phone_city)
        }));
      setContacts(formattedData);
      if (data.length === 100) {
        setIsLimited(true);
      }
    } catch (err: any) {
      console.error('[ContactsPage] Ошибка при загрузке контактов:', err);
      if (err instanceof TypeError && err.message.includes('apifetch')) {
        setError('Не удалось подключиться к серверу. Проверьте сетевое соединение и доступность сервера.');
      } else {
        setError(err.message || 'Неизвестная ошибка при загрузке контактов.');
      }
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  // Поиск контактов
  const handleSearch = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      fetchAllContacts();
      return;
    }

    setLoading(true);
    setIsLimited(false);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Токен аутентификации не найден.');

      const baseUrl = 'http://192.1.66.117:8000';
      const searchParams = new URLSearchParams({ query: searchQuery.trim() });
      const url = `${baseUrl}/contacts?${searchParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        let errorMessage = `Ошибка HTTP: ${response.status}`;
        let errorDetail = null;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.message || null;
        } catch (e) {}

        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('username');
          errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
          navigate('/login');
        } else if (response.status === 403) {
          errorMessage = 'Доступ запрещен.';
        } else if (response.status === 500) {
          errorMessage = 'Внутренняя ошибка сервера. Попробуйте позже.';
        } else if (errorDetail) {
          errorMessage = `Ошибка: ${errorDetail}`;
        }

        throw new Error(errorMessage);
      }

      const data: Contact[] = await response.json();
      console.log('Search results:', data); // Debugging log
      const formattedData = data
        .filter(contact => contact.displayName && contact.displayName.trim()) // Filter out invalid contacts
        .map(contact => ({
          ...contact,
          phone_mobile: formatPhoneNumber(contact.phone_mobile),
          phone_internal: formatPhoneNumber(contact.phone_internal),
          phone_city: formatPhoneNumber(contact.phone_city)
        }));
      setContacts(formattedData);
      if (data.length === 50) {
        setIsLimited(true);
      }
    } catch (err: any) {
      console.error('[ContactsPage] Ошибка при поиске:', err);
      setError(err.message || 'Ошибка при поиске контактов.');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  // Печать страницы
  const handlePrint = () => {
    setIsPrintMode(true);
    setTimeout(() => {
      window.print();
      setIsPrintMode(false);
    }, 100);
  };

  useEffect(() => {
    fetchAllContacts();
    const urlSearch = searchParams.get('search');
    if (urlSearch) {
      setQuery(decodeURIComponent(urlSearch));
    }
  }, [searchParams]);

  useEffect(() => {
    const timeoutId = setTimeout(() => handleSearch(query), 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <div
      className={`min-h-screen p-4 md:p-6 transition-colors duration-200 ${
        highContrast ? 'bg-black text-white' : 'bg-gray-100 text-gray-900'
      } ${fontSizeClasses[fontSize]}`}
    >
      <div className={`max-w-7xl mx-auto ${isPrintMode ? 'print:max-w-none' : ''}`}>
        {/* Панель управления (скрывается при печати) */}
        <div
          className={`flex flex-wrap items-center justify-between mb-6 gap-4 print:hidden ${
            highContrast ? 'text-yellow-400' : 'text-gray-800'
          }`}
        >
          <button
            onClick={() => navigate('/dashboard')}
            className={`flex items-center hover:underline ${
              highContrast ? 'text-yellow-400 hover:text-yellow-300' : 'text-blue-600 hover:text-blue-800'
            }`}
          >
            ← Назад в Dashboard
          </button>

          <h1 className="text-2xl md:text-3xl font-bold">Телефонный справочник</h1>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setHighContrast(!highContrast)}
              className={`px-3 py-1 rounded ${
                highContrast
                  ? 'bg-yellow-400 text-black hover:bg-yellow-300'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {highContrast ? 'Обычный режим' : 'Высокая контрастность'}
            </button>

            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as 'small' | 'medium' | 'large' | 'xlarge')}
              className={`p-1 border rounded ${
                highContrast
                  ? 'bg-black border-yellow-400 text-yellow-400'
                  : 'bg-white border-gray-300 text-gray-800'
              }`}
            >
              <option value="small">Мелкий</option>
              <option value="medium">Средний</option>
              <option value="large">Крупный</option>
              <option value="xlarge">Очень крупный</option>
            </select>

            <button
              onClick={handlePrint}
              className={`px-3 py-1 rounded ${
                highContrast
                  ? 'bg-yellow-400 text-black hover:bg-yellow-300'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              Печать
            </button>
          </div>
        </div>

        {/* Поле поиска (скрывается при печати) */}
        <div className={`relative mb-6 print:hidden`}>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className={highContrast ? 'text-yellow-400' : 'text-gray-400'}>🔍</span>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchParams({ search: e.target.value });
            }}
            className={`block w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-all ${
              highContrast
                ? 'bg-black border-yellow-400 text-white focus:ring-yellow-400'
                : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-transparent'
            }`}
            placeholder="Поиск по сотрудникам (имя, email, телефон, логин)..."
          />
        </div>

        {/* Состояние загрузки */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div
              className={`animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 ${
                highContrast ? 'border-yellow-400' : 'border-blue-500'
              }`}
            ></div>
          </div>
        )}

        {/* Ошибки */}
        {error && (
          <div
            className={`p-4 mb-6 rounded-lg border-l-4 ${
              highContrast ? 'bg-gray-900 border-red-500 text-red-300' : 'bg-red-50 border-red-500 text-red-800'
            }`}
          >
            <div className="flex">
              <div className="flex-shrink-0">
                <span>⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="font-medium">Ошибка</h3>
                <p>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Предупреждение о лимите */}
        {isLimited && !error && !loading && (
          <div
            className={`p-4 mb-6 rounded-lg border-l-4 ${
              highContrast ? 'bg-gray-900 border-yellow-500 text-yellow-300' : 'bg-yellow-50 border-yellow-400 text-yellow-800'
            }`}
          >
            <div className="flex">
              <div className="flex-shrink-0">
                <span>ℹ️</span>
              </div>
              <div className="ml-3">
                <h3 className="font-medium">Внимание</h3>
                <p>Отображено максимум 50 контактов. Используйте поиск для уточнения.</p>
              </div>
            </div>
          </div>
        )}

        {/* Список контактов */}
        {!loading && !error && contacts.length > 0 && (
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${isPrintMode ? 'print:grid-cols-3 print:gap-4' : ''}`}>
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className={`contact-card rounded-lg shadow-md hover:shadow-lg transition-shadow border overflow-hidden ${
                  highContrast
                    ? 'border-yellow-400 bg-gray-900 hover:border-yellow-300'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${isPrintMode ? 'print:shadow-none print:border print:p-2' : ''}`}
              >
                <div className="p-6 print:p-2">
                  {/* Заголовок карточки */}
                  <div className="flex items-start gap-4">
                    <div
                      className={`rounded-full w-12 h-12 flex items-center justify-center text-lg font-semibold ${
                        highContrast ? 'bg-yellow-400 text-black' : 'bg-blue-100 text-blue-600'
                      }`}
                    >
                      {getInitials(contact)}
                    </div>
                    <div className="flex-1">
                      <h3
                        className={`text-lg font-semibold ${
                          highContrast ? 'text-yellow-400' : 'text-gray-900'
                        }`}
                      >
                        {contact.displayName || 'Не указано'}
                      </h3>
                    </div>
                  </div>

                  {/* Контактные телефоны */}
                  {(contact.phone_internal || contact.phone_city || contact.phone_mobile) && (
                    <div
                      className={`mt-4 p-4 rounded-md ${
                        highContrast ? 'bg-gray-800' : 'bg-gray-50'
                      }`}
                    >
                      <h4
                        className={`text-sm font-medium ${
                          highContrast ? 'text-yellow-400' : 'text-gray-700'
                        }`}
                      >
                        Контактные телефоны
                      </h4>
                      <div className="mt-2 space-y-2">
                        {contact.phone_internal && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm ${
                                highContrast ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              Внутренний:
                            </span>
                            <span
                              className={`font-mono font-medium ${
                                highContrast ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {contact.phone_internal}
                            </span>
                          </div>
                        )}
                        {contact.phone_city && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm ${
                                highContrast ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              Городской:
                            </span>
                            <span
                              className={`font-mono font-medium ${
                                highContrast ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {contact.phone_city}
                            </span>
                          </div>
                        )}
                        {contact.phone_mobile && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm ${
                                highContrast ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              Мобильный:
                            </span>
                            <span
                              className={`font-mono font-medium ${
                                highContrast ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {contact.phone_mobile}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Электронная почта */}
                  {contact.email && (
                    <div
                      className={`mt-4 p-4 rounded-md ${
                        highContrast ? 'bg-gray-800' : 'bg-gray-50'
                      }`}
                    >
                      <h4
                        className={`text-sm font-medium ${
                          highContrast ? 'text-yellow-400' : 'text-gray-700'
                        }`}
                      >
                        Электронная почта
                      </h4>
                      <div className="mt-2">
                        <a
                          href={`mailto:${contact.email}`}
                          className={`hover:underline ${
                            highContrast ? 'text-yellow-400' : 'text-blue-600'
                          }`}
                          title="Отправить письмо"
                        >
                          {contact.email}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Дополнительная информация */}
                  {(contact.position || contact.department || contact.sam_account_name) && (
                    <div
                      className={`mt-4 p-4 rounded-md ${
                        highContrast ? 'bg-gray-800' : 'bg-gray-50'
                      }`}
                    >
                      <h4
                        className={`text-sm font-medium ${
                          highContrast ? 'text-yellow-400' : 'text-gray-700'
                        }`}
                      >
                        Дополнительная информация
                      </h4>
                      <div className="mt-2 space-y-2">
                        {contact.position && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm ${
                                highContrast ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              Должность:
                            </span>
                            <span
                              className={`font-medium ${
                                highContrast ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {contact.position}
                            </span>
                          </div>
                        )}
                        {contact.department && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm ${
                                highContrast ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              Отдел:
                            </span>
                            <span
                              className={`font-medium ${
                                highContrast ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {contact.department}
                            </span>
                          </div>
                        )}
                        {contact.sam_account_name && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm ${
                                highContrast ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              Логин:
                            </span>
                            <span
                              className={`font-medium ${
                                highContrast ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {contact.sam_account_name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Пустой результат */}
        {!loading && !error && contacts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">😕</div>
            <h3
              className={`text-lg font-medium ${
                highContrast ? 'text-yellow-400' : 'text-gray-900'
              }`}
            >
              {query ? 'Контакты не найдены' : 'Нет доступных контактов'}
            </h3>
            <p
              className={`mt-1 ${highContrast ? 'text-gray-300' : 'text-gray-500'}`}
            >
              {query
                ? 'Попробуйте изменить параметры поиска'
                : 'Попробуйте обновить страницу или обратитесь к администратору'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}