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

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Иконки
const PhoneIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 ${className}`}>
    <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
  </svg>
);

const EmailIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 ${className}`}>
    <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
    <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
  </svg>
);

const UserIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 ${className}`}>
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
  </svg>
);

const BuildingIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 ${className}`}>
    <path fillRule="evenodd" d="M4.5 2.25a.75.75 0 000 1.5v16.5h-.75a.75.75 0 000 1.5h16.5a.75.75 0 000-1.5h-.75V3.75a.75.75 0 000-1.5h-15zM9 6a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5H9zm-.75 3.75A.75.75 0 019 9h1.5a.75.75 0 010 1.5H9a.75.75 0 01-.75-.75zM9 12a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5H9zm3.75-5.25A.75.75 0 0113.5 6H15a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zM13.5 9a.75.75 0 000 1.5H15A.75.75 0 0015 9h-1.5zm-.75 3.75a.75.75 0 01.75-.75H15a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zM9 19.5v-2.25a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v2.25a.75.75 0 01-.75.75h-4.5A.75.75 0 019 19.5z" clipRule="evenodd" />
  </svg>
);

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
  console.log(contacts)
  // Размеры шрифтов
  const fontSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
    xlarge: 'text-xl'
  };

  // Учётные записи, которые нужно скрыть
  const HIDDEN_USERS = [
    'service_reader',
    'test.user',
    'temp.user',
    'jibri',
    'jigasi',
    'focus',
    'admin.test',
    'backup.user'
  ];

  const HIDDEN_EMAILS = [
    'bot@minskhleb.by',
    'no-reply@minskhleb.by'
  ];

  // Список закреплённых сотрудников
  const PINNED_NAMES = [
    'Забелло Александр Леонидович',
    'Воложинец Татьяна Викторовна',
    'Озик Елена Владимировна',
    'Люторевич Андрей Александрович'
  ];

  const PINNED_EMAILS = [
    'a.zabello@minskhleb.by',
    'mhp@minskhleb.by',
    'a.lutorevich@minskhleb.by'
  ];

  // Функция сортировки контактов
  const sortContacts = (contactsToSort: Contact[]): Contact[] => {
    const pinned: Contact[] = [];
    const filled: Contact[] = [];
    const empty: Contact[] = [];

    contactsToSort.forEach(contact => {
      const byName = PINNED_NAMES.includes(contact.displayName || '');
      const byEmail = PINNED_EMAILS.includes(contact.email || '');

      if (byName || byEmail) {
        pinned.push(contact);
        return;
      }

      const hasData = !!contact.phone_internal || !!contact.phone_city || !!contact.phone_mobile ||
                     !!contact.email || !!contact.position || !!contact.department || 
                     !!contact.sam_account_name;

      if (hasData) {
        filled.push(contact);
      } else {
        empty.push(contact);
      }
    });

    const sortedFilled = filled.sort((a, b) => 
      (a.displayName?.trim().toLowerCase() || '').localeCompare(b.displayName?.trim().toLowerCase() || '', 'ru', { sensitivity: 'base' })
    );

    const sortedEmpty = empty.sort((a, b) => 
      (a.displayName?.trim().toLowerCase() || '').localeCompare(b.displayName?.trim().toLowerCase() || '', 'ru', { sensitivity: 'base' })
    );

    return [...pinned, ...sortedFilled, ...sortedEmpty];
  };

  // Загрузка всех контактов
  const fetchAllContacts = async () => {
    setError(null);
    setIsLimited(false);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден. Пожалуйста, войдите снова.');
      }

      const url = `${BASE_URL}/contacts?query=*`;

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

      // Фильтрация и форматирование контактов
      const filteredData = data
        .filter(contact => {
          const isHiddenByLogin = HIDDEN_USERS.includes(contact.sam_account_name || '');
          const isHiddenByEmail = HIDDEN_EMAILS.includes(contact.email || '');
          return !isHiddenByLogin && !isHiddenByEmail;
        })
        .filter(contact => contact.displayName && contact.displayName.trim())
        .map(contact => ({
          ...contact,
          phone_mobile: formatPhoneNumber(contact.phone_mobile),
          phone_internal: formatPhoneNumber(contact.phone_internal),
          phone_city: formatPhoneNumber(contact.phone_city)
        }));

      setContacts(sortContacts(filteredData));

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
      return;
    }
    
    setIsLimited(false);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Токен аутентификации не найден.');

      const searchParams = new URLSearchParams({ query: searchQuery.trim() });
      const url = `${BASE_URL}/contacts?${searchParams.toString()}`;

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

      const filteredData = data
        .filter(contact => {
          const isHiddenByLogin = HIDDEN_USERS.includes(contact.sam_account_name || '');
          const isHiddenByEmail = HIDDEN_EMAILS.includes(contact.email || '');
          return !isHiddenByLogin && !isHiddenByEmail;
        })
        .filter(contact => contact.displayName && contact.displayName.trim())
        .map(contact => ({
          ...contact,
          phone_mobile: formatPhoneNumber(contact.phone_mobile),
          phone_internal: formatPhoneNumber(contact.phone_internal),
          phone_city: formatPhoneNumber(contact.phone_city)
        }));

      setContacts(sortContacts(filteredData));

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
    if (query.length < 2) {
      fetchAllContacts();
    }
    console.log(query);
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
    <>
      <style>
        {`
          @media print {
            body {
              margin: 1cm;
              font-family: Arial, sans-serif;
              font-size: 10pt;
              color: #000;
              background: #fff;
            }
            .no-print {
              display: none !important;
            }
            .contact-card {
              page-break-inside: avoid;
              border: 1px solid #000;
              margin-bottom: 0.5cm;
              padding: 0.5cm;
              background: #fff;
              box-shadow: none;
            }
            .contact-grid {
              display: block;
              column-count: 2;
              column-gap: 0.5cm;
              break-inside: avoid;
            }
            .contact-header {
              font-size: 12pt;
              font-weight: bold;
              margin-bottom: 0.3cm;
            }
            .contact-section-title {
              font-size: 10pt;
              font-weight: bold;
              text-transform: uppercase;
              margin-top: 0.3cm;
              margin-bottom: 0.2cm;
            }
            .contact-info {
              font-size: 10pt;
              margin-bottom: 0.2cm;
            }
            .contact-icon {
              display: inline-block;
              width: 12pt;
              height: 12pt;
              vertical-align: middle;
              margin-right: 0.2cm;
            }
            .initials-circle {
              display: none;
            }
            a[href^="mailto:"] {
              text-decoration: none;
              color: #000;
            }
            .break-words {
              word-break: break-all;
            }
          }
        `}
      </style>
      <div className={`min-h-screen p-4 md:p-6 transition-colors duration-200 ${
        highContrast ? 'bg-black text-white' : 'bg-gray-50 text-gray-900'
      } ${fontSizeClasses[fontSize]}`}>
        <div className={`max-w-7xl mx-auto ${isPrintMode ? 'print:max-w-none' : ''}`}>
          {/* Панель управления */}
          <div className={`flex flex-wrap items-center justify-between mb-6 gap-4 no-print ${
            highContrast ? 'text-yellow-400' : 'text-gray-800'
          }`}>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Назад в Dashboard
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

          {/* Поле поиска */}
          <div className={`relative mb-6 no-print`}>
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
            <div className="flex justify-center items-center py-12 no-print">
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
              className={`p-4 mb-6 rounded-lg border-l-4 no-print ${
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
              className={`p-4 mb-6 rounded-lg border-l-4 no-print ${
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
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 contact-grid ${
              isPrintMode ? 'print:grid-cols-3 print:gap-4' : ''
            }`}>
              {contacts.map((contact) => {
                const hasPhone = contact.phone_internal || contact.phone_city || contact.phone_mobile;
                const hasEmail = contact.email;
                const hasPosition = contact.position;
                const hasDepartment = contact.department;
                const hasLogin = contact.sam_account_name;
                const hasData = hasPhone || hasEmail || hasPosition || hasDepartment || hasLogin;

                return (
                  <div
                    key={contact.id}
                    className={`relative rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border-2 border-blue-400 contact-card ${
                      highContrast ? 'bg-gray-900' : 'bg-white'
                    } ${isPrintMode ? 'print:shadow-none print:border print:p-2' : ''}`}
                  >
                    <div className="p-5 print:p-3">
                      {/* Заголовок карточки */}
                      <div className="flex items-center gap-4">
                        <div
                          className={`rounded-full w-14 h-14 flex items-center justify-center text-xl font-bold initials-circle ${
                            highContrast ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600'
                          }`}
                        >
                          {getInitials(contact)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`text-xl font-bold break-words contact-header ${
                              highContrast ? 'text-white' : 'text-gray-900'
                            }`}
                          >
                            {contact.displayName || 'Не указано'}
                          </h3>
                          {contact.position && (
                            <p className={`text-sm contact-info ${
                              highContrast ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              {contact.position}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Если нет данных */}
                      {!hasData && (
                        <div className={`mt-4 p-3 rounded-lg text-center contact-info ${
                          highContrast ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                        }`}>
                          <p>Нет контактных данных</p>
                        </div>
                      )}

                      {/* Контактные телефоны */}
                      {hasPhone && (
                        <div className="mt-4">
                          <h4 className={`text-xs uppercase tracking-wider mb-2 contact-section-title ${
                            highContrast ? 'text-blue-300' : 'text-blue-600'
                          }`}>
                            Телефоны
                          </h4>
                          <div className="space-y-2">
                            {contact.phone_internal && (
                              <div className="flex items-center gap-3 contact-info">
                                <div className={`p-2 rounded-lg ${
                                  highContrast ? 'bg-gray-800' : 'bg-blue-50'
                                }`}>
                                  <PhoneIcon className={`contact-icon ${highContrast ? 'text-blue-300' : 'text-blue-500'}`} />
                                </div>
                                <div>
                                  <p className={`text-xs ${
                                    highContrast ? 'text-gray-400' : 'text-gray-500'
                                  }`}>
                                    Внутренний
                                  </p>
                                  <p className={`font-mono font-medium ${
                                    highContrast ? 'text-white' : 'text-gray-900'
                                  }`}>
                                    {contact.phone_internal}
                                  </p>
                                </div>
                              </div>
                            )}
                            {contact.phone_city && (
                              <div className="flex items-center gap-3 contact-info">
                                <div className={`p-2 rounded-lg ${
                                  highContrast ? 'bg-gray-800' : 'bg-blue-50'
                                }`}>
                                  <PhoneIcon className={`contact-icon ${highContrast ? 'text-blue-300' : 'text-blue-500'}`} />
                                </div>
                                <div>
                                  <p className={`text-xs ${
                                    highContrast ? 'text-gray-400' : 'text-gray-500'
                                  }`}>
                                    Городской
                                  </p>
                                  <p className={`font-mono font-medium ${
                                    highContrast ? 'text-white' : 'text-gray-900'
                                  }`}>
                                    {contact.phone_city}
                                  </p>
                                </div>
                              </div>
                            )}
                            {contact.phone_mobile && (
                              <div className="flex items-center gap-3 contact-info">
                                <div className={`p-2 rounded-lg ${
                                  highContrast ? 'bg-gray-800' : 'bg-blue-50'
                                }`}>
                                  <PhoneIcon className={`contact-icon ${highContrast ? 'text-blue-300' : 'text-blue-500'}`} />
                                </div>
                                <div>
                                  <p className={`text-xs ${
                                    highContrast ? 'text-gray-400' : 'text-gray-500'
                                  }`}>
                                    Мобильный
                                  </p>
                                  <p className={`font-mono font-medium ${
                                    highContrast ? 'text-white' : 'text-gray-900'
                                  }`}>
                                    {contact.phone_mobile}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Электронная почта */}
                      {contact.email && (
                        <div className="mt-4">
                          <h4 className={`text-xs uppercase tracking-wider mb-2 contact-section-title ${
                            highContrast ? 'text-blue-300' : 'text-blue-600'
                          }`}>
                            Email
                          </h4>
                          <div className="flex items-center gap-3 contact-info">
                            <div className={`p-2 rounded-lg ${
                              highContrast ? 'bg-gray-800' : 'bg-blue-50'
                            }`}>
                              <EmailIcon className={`contact-icon ${highContrast ? 'text-blue-300' : 'text-blue-500'}`} />
                            </div>
                            <a
                              href={`mailto:${contact.email}`}
                              className={`break-all hover:underline ${
                                highContrast ? 'text-blue-300' : 'text-blue-600'
                              }`}
                            >
                              {contact.email}
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Дополнительная информация */}
                      {(hasPosition || hasDepartment || hasLogin) && (
                        <div className="mt-4">
                          <h4 className={`text-xs uppercase tracking-wider mb-2 contact-section-title ${
                            highContrast ? 'text-blue-300' : 'text-blue-600'
                          }`}>
                            Отдел
                          </h4>
                          <div className={`p-3 rounded-lg ${
                            highContrast ? 'bg-gray-800' : 'bg-blue-50'
                          }`}>
                            <div className="space-y-2">
                              {contact.department && (
                                <div className="flex items-start gap-2 contact-info">
                                  <BuildingIcon className={`contact-icon ${highContrast ? 'text-blue-300' : 'text-blue-500'}`} />
                                  <span className="text-sm">{contact.department}</span>
                                </div>
                              )}
                              {contact.sam_account_name && (
                                <div className="flex items-start gap-2 contact-info">
                                  <UserIcon className={`contact-icon ${highContrast ? 'text-blue-300' : 'text-blue-500'}`} />
                                  <span className="text-sm">{contact.sam_account_name}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Пустой результат */}
          {!loading && !error && contacts.length === 0 && (
            <div className="text-center py-12 no-print">
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
    </>
  );
}