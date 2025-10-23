import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../../hooks/ThemeContext';
import { Moon, Sun, MagnifyingGlass, ArrowLeft, Cards, Table } from 'phosphor-react';

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

// Компонент для отображения контакта в виде карточки
const ContactCard = ({ contact, theme }: { contact: Contact, theme: string }) => {
  const hasPhone = contact.phone_internal || contact.phone_city || contact.phone_mobile;
  const hasEmail = contact.email;
  const hasPosition = contact.position;
  const hasDepartment = contact.department;
  const hasLogin = contact.sam_account_name;
  const hasData = hasPhone || hasEmail || hasPosition || hasDepartment || hasLogin;

  return (
    <div
      key={contact.id}
      className={`relative rounded-2xl backdrop-blur-md border-2 shadow-2xl hover:shadow-2xl transition-all duration-500 overflow-hidden hover:scale-105 ${
        theme === 'dark' 
          ? 'bg-gray-900/30 border-gray-600/50 hover:border-blue-400/50' 
          : 'bg-white/30 border-white/50 hover:border-blue-400/50'
      }`}
      style={{
        border: '3px solid',
        borderColor: theme === 'dark' ? 'rgba(0, 44, 100, 5)' : 'rgba(255, 255, 255, 0.5)'
      }}
    >
      {/* Gradient Border Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
      
      <div className="relative p-5 z-10">
        {/* Заголовок карточки */}
        <div className="flex items-center gap-4 mb-4">
          <div
            className={`rounded-full w-14 h-14 flex items-center justify-center text-xl font-bold shadow-lg ${
              theme === 'dark' 
                ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white' 
                : 'bg-gradient-to-br from-blue-400 to-purple-400 text-white'
            }`}
          >
            {getInitials(contact)}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className={`text-xl font-bold break-words ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}
            >
              {contact.displayName || 'Не указано'}
            </h3>
            {contact.position && (
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}>
                {contact.position}
              </p>
            )}
          </div>
        </div>

        {/* Если нет данных */}
        {!hasData && (
          <div className={`mt-4 p-3 rounded-xl text-center backdrop-blur-md ${
            theme === 'dark' ? 'bg-gray-800/50 text-gray-400' : 'bg-white/50 text-gray-500'
          }`}>
            <p>Нет контактных данных</p>
          </div>
        )}

        {/* Контактные телефоны */}
        {hasPhone && (
          <div className="mt-4">
            <h4 className={`text-xs uppercase tracking-wider mb-3 ${
              theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
            }`}>
              Телефоны
            </h4>
            <div className="space-y-3">
              {contact.phone_internal && (
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl backdrop-blur-md ${
                    theme === 'dark' ? 'bg-gray-800/50' : 'bg-white/50'
                  }`}>
                    <PhoneIcon className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-500'}`} />
                  </div>
                  <div>
                    <p className={`text-xs ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Внутренний
                    </p>
                    <p className={`font-bold font-medium ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      {contact.phone_internal}
                    </p>
                  </div>
                </div>
              )}
              {contact.phone_city && (
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl backdrop-blur-md ${
                    theme === 'dark' ? 'bg-gray-800/50' : 'bg-white/50'
                  }`}>
                    <PhoneIcon className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-500'}`} />
                  </div>
                  <div>
                    <p className={`text-xs ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Городской
                    </p>
                    <p className={`font-bold font-medium ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      {contact.phone_city}
                    </p>
                  </div>
                </div>
              )}
              {contact.phone_mobile && (
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl backdrop-blur-md ${
                    theme === 'dark' ? 'bg-gray-800/50' : 'bg-white/50'
                  }`}>
                    <PhoneIcon className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-500'}`} />
                  </div>
                  <div>
                    <p className={`text-xs ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Мобильный
                    </p>
                    <p className={`font-bold font-medium ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
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
            <h4 className={`text-xs uppercase tracking-wider mb-3 ${
              theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
            }`}>
              Email
            </h4>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl backdrop-blur-md ${
                theme === 'dark' ? 'bg-gray-800/50' : 'bg-white/50'
              }`}>
                <EmailIcon className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-500'}`} />
              </div>
              <a
                href={`mailto:${contact.email}`}
                className={`break-all hover:underline transition-colors duration-200 ${
                  theme === 'dark' ? 'text-blue-300 hover:text-blue-200' : 'text-blue-600 hover:text-blue-500'
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
            <h4 className={`text-xs uppercase tracking-wider mb-3 ${
              theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
            }`}>
              Отдел
            </h4>
            <div className={`p-3 rounded-xl backdrop-blur-md ${
              theme === 'dark' ? 'bg-gray-800/50' : 'bg-white/50'
            }`}>
              <div className="space-y-2">
                {contact.department && (
                  <div className="flex items-start gap-2">
                    <BuildingIcon className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-500'}`} />
                    <span className={`text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {contact.department}
                    </span>
                  </div>
                )}
                {contact.sam_account_name && (
                  <div className="flex items-start gap-2">
                    <UserIcon className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-500'}`} />
                    <span className={`text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {contact.sam_account_name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Компонент для отображения контакта в виде строки таблицы
const ContactTableRow = ({ contact, theme }: { contact: Contact, theme: string }) => {
  return (
    <tr className={`border-b ${
      theme === 'dark' 
        ? 'border-gray-700 hover:bg-gray-800/50' 
        : 'border-gray-200 hover:bg-gray-50/50'
    } transition-colors`}>
      <td className={`py-3 px-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
        {contact.displayName || 'Не указано'}
      </td>
      <td className={`py-3 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
        {contact.position || '-'}
      </td>
      <td className={`py-3 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
        {contact.department || '-'}
      </td>
      <td className={`py-3 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
        {contact.phone_internal || '-'}
      </td>
      <td className={`py-3 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
        {contact.phone_city || '-'}
      </td>
      <td className={`py-3 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
        {contact.phone_mobile || '-'}
      </td>
      <td className={`py-3 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
        {contact.email ? (
          <a 
            href={`mailto:${contact.email}`}
            className={`hover:underline ${
              theme === 'dark' ? 'text-blue-300 hover:text-blue-200' : 'text-blue-600 hover:text-blue-500'
            }`}
          >
            {contact.email}
          </a>
        ) : '-'}
      </td>
    </tr>
  );
};

export default function ContactsPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLimited, setIsLimited] = useState(false);
  
  // Загрузка сохраненных настроек из localStorage
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    const savedViewMode = localStorage.getItem('contactsViewMode');
    return (savedViewMode as 'cards' | 'table') || 'cards';
  });
  
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>(() => {
    const savedFontSize = localStorage.getItem('contactsFontSize');
    return (savedFontSize as 'small' | 'medium' | 'large' | 'xlarge') || 'medium';
  });

  // Размеры шрифтов
  const fontSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
    xlarge: 'text-xl'
  };

  // Учётные записи, которые нужно скрыть
  const HIDDEN_USERS = [
    'ServiceReader',
    'asu',
    'test',
    'jibri',
    'jigasi',
    'focus',
    'admin.test',
    'backup.user',
    'gbsuser',
    'hz2_test',
    'jira'
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

  // Функция для фильтрации контактов
  const filterContacts = (contactsToFilter: Contact[]): Contact[] => {
    return contactsToFilter.filter(contact => {
      // Проверяем логин пользователя
      const userLogin = contact.sam_account_name?.toLowerCase().trim();
      const isHiddenByLogin = HIDDEN_USERS.some(hiddenUser => 
        userLogin === hiddenUser.toLowerCase().trim()
      );

      // Проверяем email пользователя
      const userEmail = contact.email?.toLowerCase().trim();
      const isHiddenByEmail = HIDDEN_EMAILS.some(hiddenEmail => 
        userEmail === hiddenEmail.toLowerCase().trim()
      );

      // Проверяем имя пользователя
      const userName = contact.displayName?.toLowerCase().trim();
      const isHiddenByName = HIDDEN_USERS.some(hiddenUser => 
        userName?.includes(hiddenUser.toLowerCase().trim())
      );

      // Пропускаем контакт если он должен быть скрыт по любому из критериев
      if (isHiddenByLogin || isHiddenByEmail || isHiddenByName) {
        console.log('Скрыт контакт:', {
          name: contact.displayName,
          login: contact.sam_account_name,
          email: contact.email,
          reason: isHiddenByLogin ? 'логин' : isHiddenByEmail ? 'email' : 'имя'
        });
        return false;
      }

      // Также пропускаем контакты без имени
      if (!contact.displayName || !contact.displayName.trim()) {
        return false;
      }

      return true;
    });
  };

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
    setLoading(true);

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

      console.log('Получено контактов с сервера:', data.length);
      
      // Фильтрация и форматирование контактов
      const filteredData = filterContacts(data)
        .map(contact => ({
          ...contact,
          phone_mobile: formatPhoneNumber(contact.phone_mobile),
          phone_internal: formatPhoneNumber(contact.phone_internal),
          phone_city: formatPhoneNumber(contact.phone_city)
        }));

      console.log('После фильтрации осталось:', filteredData.length);
      
      const sortedData = sortContacts(filteredData);
      setContacts(sortedData);

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
    
    setIsLimited(false);
    setLoading(true);
    
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

      console.log('Найдено контактов по поиску:', data.length);

      const filteredData = filterContacts(data)
        .map(contact => ({
          ...contact,
          phone_mobile: formatPhoneNumber(contact.phone_mobile),
          phone_internal: formatPhoneNumber(contact.phone_internal),
          phone_city: formatPhoneNumber(contact.phone_city)
        }));

      console.log('После фильтрации поиска осталось:', filteredData.length);

      const sortedData = sortContacts(filteredData);
      setContacts(sortedData);

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

  // Сохранение настроек в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('contactsViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('contactsFontSize', fontSize);
  }, [fontSize]);

  // Обработчики для изменения настроек
  const handleViewModeChange = (mode: 'cards' | 'table') => {
    setViewMode(mode);
  };

  const handleFontSizeChange = (size: 'small' | 'medium' | 'large' | 'xlarge') => {
    setFontSize(size);
  };

  useEffect(() => {
    if (query.length < 2) {
      fetchAllContacts();
    }
    const urlSearch = searchParams.get('search');
    if (urlSearch) {
      setQuery(decodeURIComponent(urlSearch));
    }
  }, [searchParams]);
  
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.length >= 2) {
        handleSearch(query);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <>
      {/* Glassmorphism Background */}
      <div className={`min-h-screen transition-colors duration-500 ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white'
          : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50 text-gray-800'
      } py-6 px-4 relative overflow-hidden ${fontSizeClasses[fontSize]}`}>
        
        <div className="max-w-7xl mx-auto relative z-10">
          
          {/* Glassmorphism Header */}
          <div className={`backdrop-blur-xl rounded-2xl p-6 mb-6 border ${
            theme === 'dark' 
              ? 'bg-gray-900/30 border-gray-700/50 text-white' 
              : 'bg-white/30 border-white/50 text-gray-800'
          } shadow-2xl`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link
                to="/dashboard"
                className={`flex text-sm items-center rounded-lg gap-2 px-4 py-2  transition-colors ${theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} shadow-lg`}
              >
                <ArrowLeft size={16} />Вернуться на главную
              </Link>

              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent">
                Телефонный справочник
              </h1>

              <div className="flex items-center gap-3">
                {/* Переключатель режима просмотра */}
                <div className={`flex rounded-xl p-1 backdrop-blur-md border ${
                  theme === 'dark'
                    ? 'bg-gray-800/50 border-gray-600/50'
                    : 'bg-white/50 border-white/70'
                }`}>
                  <button
                    onClick={() => handleViewModeChange('cards')}
                    className={`p-2 rounded-lg transition-colors ${
                      viewMode === 'cards'
                        ? theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                        : theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title="Карточки"
                  >
                    <Cards size={20} />
                  </button>
                  <button
                    onClick={() => handleViewModeChange('table')}
                    className={`p-2 rounded-lg transition-colors ${
                      viewMode === 'table'
                        ? theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                        : theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title="Таблица"
                  >
                    <Table size={20} />
                  </button>
                </div>

                <button
                  onClick={toggleTheme}
                  className={`w-12 h-12 rounded-2xl backdrop-blur-md border transition-all duration-300 flex items-center justify-center ${
                    theme === 'dark'
                      ? 'bg-gray-800/50 border-gray-600/50 text-yellow-300 hover:bg-gray-700/50 hover:border-gray-500'
                      : 'bg-white/50 border-white/70 text-gray-700 hover:bg-white/70 hover:border-white'
                  }`}
                  title={theme === 'dark' ? 'Светлая тема' : 'Темная тема'}
                >
                  {theme === 'dark' ? <Sun size={24} weight="regular" /> : <Moon size={24} weight="regular" />}
                </button>

                <select
                  value={fontSize}
                  onChange={(e) => handleFontSizeChange(e.target.value as 'small' | 'medium' | 'large' | 'xlarge')}
                  className={`p-2 rounded-xl backdrop-blur-md border transition-all duration-300 ${
                    theme === 'dark'
                      ? 'bg-gray-800/50 border-gray-600/50 text-gray-200'
                      : 'bg-white/50 border-white/70 text-gray-700'
                  }`}
                >
                  <option value="small">Мелкий</option>
                  <option value="medium">Средний</option>
                  <option value="large">Крупный</option>
                  <option value="xlarge">Очень крупный</option>
                </select>
              </div>
            </div>
          </div>

          {/* Glassmorphism Search */}
          <div className="relative mb-6">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlass 
                size={20} 
                className={theme === 'dark' ? 'text-blue-400' : 'text-blue-600'} 
              />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchParams({ search: e.target.value });
              }}
              className={`block w-full pl-12 pr-3 py-4 rounded-2xl backdrop-blur-md border shadow-lg focus:outline-none focus:ring-2 transition-all ${
                theme === 'dark'
                  ? 'bg-gray-800/30 border-gray-600/50 text-white focus:ring-blue-400 focus:border-blue-400'
                  : 'bg-white/30 border-white/50 text-gray-900 focus:ring-blue-500 focus:border-blue-500'
              }`}
              placeholder="Поиск по сотрудникам (имя, email, телефон, логин)..."
            />
          </div>

          {/* Состояние загрузки */}
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div
                className={`animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 ${
                  theme === 'dark' ? 'border-blue-400' : 'border-blue-500'
                }`}
              ></div>
            </div>
          )}

          {/* Ошибки */}
          {error && (
            <div
              className={`p-4 mb-6 rounded-2xl backdrop-blur-md border-l-4 ${
                theme === 'dark' 
                  ? 'bg-red-900/30 border-red-500 text-red-300' 
                  : 'bg-red-50/30 border-red-500 text-red-800'
              }`}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <span className="text-xl">⚠️</span>
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
              className={`p-4 mb-6 rounded-2xl backdrop-blur-md border-l-4 ${
                theme === 'dark' 
                  ? 'bg-blue-900/30 border-blue-500 text-blue-300' 
                  : 'bg-blue-50/30 border-blue-400 text-blue-800'
              }`}
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <span className="text-xl">ℹ️</span>
                </div>
                <div className="ml-3">
                  <h3 className="font-medium">Внимание</h3>
                  <p>Отображено максимум 50 контактов. Используйте поиск для уточнения.</p>
                </div>
              </div>
            </div>
          )}

          {/* Отображение контактов в виде карточек */}
          {!loading && !error && contacts.length > 0 && viewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {contacts.map((contact) => (
                <ContactCard 
                  key={contact.id} 
                  contact={contact} 
                  theme={theme} 
                />
              ))}
            </div>
          )}

          {/* Отображение контактов в виде таблицы */}
          {!loading && !error && contacts.length > 0 && viewMode === 'table' && (
            <div className={`rounded-2xl backdrop-blur-md border shadow-2xl overflow-hidden ${
              theme === 'dark' 
                ? 'bg-gray-900/30 border-gray-600/50' 
                : 'bg-white/30 border-white/50'
            }`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`${
                      theme === 'dark' 
                        ? 'bg-gray-800/50 border-b border-gray-700' 
                        : 'bg-white/50 border-b border-gray-200'
                    }`}>
                      <th className={`py-3 px-4 text-left font-semibold ${
                        theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        ФИО
                      </th>
                      <th className={`py-3 px-4 text-left font-semibold ${
                        theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        Должность
                      </th>
                      <th className={`py-3 px-4 text-left font-semibold ${
                        theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        Отдел
                      </th>
                      <th className={`py-3 px-4 text-left font-semibold ${
                        theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        Внутренний
                      </th>
                      <th className={`py-3 px-4 text-left font-semibold ${
                        theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        Городской
                      </th>
                      <th className={`py-3 px-4 text-left font-semibold ${
                        theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        Мобильный
                      </th>
                      <th className={`py-3 px-4 text-left font-semibold ${
                        theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
                      }`}>
                        Email
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <ContactTableRow 
                        key={contact.id} 
                        contact={contact} 
                        theme={theme} 
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Пустой результат */}
          {!loading && !error && contacts.length === 0 && (
            <div className={`text-center py-12 rounded-2xl backdrop-blur-md border ${
              theme === 'dark' 
                ? 'bg-gray-900/30 border-gray-600/50' 
                : 'bg-white/30 border-white/50'
            }`}>
              <div className="text-5xl mb-4">😕</div>
              <h3
                className={`text-lg font-medium ${
                  theme === 'dark' ? 'text-blue-400' : 'text-gray-900'
                }`}
              >
                {query ? 'Контакты не найдены' : 'Нет доступных контактов'}
              </h3>
              <p
                className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}
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