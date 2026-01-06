import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { CaretDownOutlined, CaretUpOutlined } from '@ant-design/icons';
import { Space } from 'antd';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Moon, Sun, ArrowLeft, Plus, MagnifyingGlass, Printer } from 'phosphor-react';

// === Types ===
interface Request {
  request_id: string;
  sender_fullname: string;
  theme: string | null;
  owner: string | null;
  owner_fullname: string | null;
  processing_depart: string | null;
  status: 'не просмотрено' | 'в обработке' | 'завершено';
  sender_job_title: string;
  sender_depart: string;
  sender_email: string;
  sender_phone: string;
  comment: string;
  send_date: string;
  images_path: string[] | null;
}

interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  list_requests?: T;
  order?: 'asc' | 'desc';
  message?: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const RequestList: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const role = localStorage.getItem('role') || 'user';
  const user_fullname = localStorage.getItem('username') || '';
  
  // Получение темы из localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  const [activeTab, setActiveTab] = useState<'rovt' | 'asu'>('rovt');
  const [activeButtonTable, setActiveButtonTable] = useState<'my' | 'get'>('my');
  const [selectedService, setSelectedService] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [processingRequests, setProcessingRequests] = useState<Request[]>([]);
  const ITEMS_PER_PAGE = 10;
  const [currentPageMy, setCurrentPageMy] = useState(1);
  const [currentPageGet, setCurrentPageGet] = useState(1);
  const [currentSortField, setCurrentSortField] = useState<string | null>(null);
  const [currentSortOrder, setCurrentSortOrder] = useState<'asc' | 'desc'>('asc');
  const [newRequestStatus, setNewRequestStatus] = useState<string>('');
  const [expandedRequest, setExpandedRequest] = useState<Request | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  const [selectedAdmin, setSelectedAdmin] = useState<string>('');
  const [imageData, setImageData] = useState<{ images: string[]; index: number; comment: string }>({
    images: [],
    index: 0,
    comment: '',
  });
  const [allAdmins, setAllAdmins] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Слушатель изменений темы
  useEffect(() => {
    const handleStorageChange = () => {
      const currentTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
      setTheme(currentTheme);
    };

    window.addEventListener('storage', handleStorageChange);
    
    const interval = setInterval(() => {
      const currentTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
      if (currentTheme !== theme) {
        setTheme(currentTheme);
      }
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [theme]);

  const departmentOptions = {
    rovt: ' ТЭРиОВТ',
    asu: 'АСУ',
  };

  const fontSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
    xlarge: 'text-xl',
  };

  const serviceOptions = [
    { id: 'new-service', value: 'new-service', label: 'Новая услуга' },
    { id: 'not-related', value: 'not-related', label: 'Не связан с услугами' },
    { id: 'virtual-hosting', value: 'virtual-hosting', label: 'Виртуальный хостинг' },
    { id: 'secure-email', value: 'secure-email', label: 'Защищенная почта' },
  ];

  // Улучшенные стили с серо-черным градиентом
  const glassClasses = {
    background: theme === 'dark' 
      ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-black' 
      : 'bg-gradient-to-br from-gray-100 via-gray-50 to-gray-200',
    card: theme === 'dark' 
      ? 'bg-gray-800/90 backdrop-blur-md border border-gray-700 text-gray-100 shadow-2xl' 
      : 'bg-white/95 border border-gray-200 text-gray-800 shadow-2xl',
    button: {
      primary: theme === 'dark' 
        ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500' 
        : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500',
      secondary: theme === 'dark' 
        ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600' 
        : 'bg-gray-200 hover:bg-gray-300 text-gray-700 border border-gray-300',
      danger: theme === 'dark' 
        ? 'bg-red-600 hover:bg-red-500 text-white border border-red-500' 
        : 'bg-red-600 hover:bg-red-500 text-white border border-red-500',
    },
    input: theme === 'dark' 
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400' 
      : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-400',
    table: {
      header: theme === 'dark' 
        ? 'bg-gray-700 text-gray-200 border-gray-600' 
        : 'bg-gray-100 text-gray-700 border-gray-300',
      row: theme === 'dark' 
        ? 'border-gray-700 hover:bg-gray-700' 
        : 'border-gray-200 hover:bg-gray-50',
    },
    modal: theme === 'dark'
      ? 'bg-gray-800/95 backdrop-blur-lg border border-gray-700 text-gray-100 shadow-2xl'
      : 'bg-white/95 backdrop-blur-lg border border-gray-200 text-gray-800 shadow-2xl',
    text: {
      primary: theme === 'dark' ? 'text-gray-100' : 'text-gray-800',
      secondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-500',
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    window.dispatchEvent(new Event('storage'));
  };

  const loadRequests = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Требуется авторизация');
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('Ошибка авторизации. Попробуйте войти заново');
        return;
      }
      const response = await fetch(`${BASE_URL}/request_list/get_requests`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = `Ошибка: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {}
        if (response.status === 500) {
          throw new Error('Внутренняя ошибка сервера. Обратитесь к администратору.');
        } else if (response.status === 401) {
          throw new Error('Требуется авторизация. Пожалуйста, войдите снова.');
        } else {
          throw new Error(errorMessage);
        }
      }
      const result: ApiResponse<Request[]> = await response.json();
      if (result.status === 'success') {
        setRequests(result.data || []);
        setAllRequests(result.data || []);
        setProcessingRequests(result.list_requests || []);
      } else {
        toast.error(result.message || 'Ошибка загрузки данных');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error(
        process.env.NODE_ENV === 'development'
          ? `Ошибка сети: ${err instanceof Error ? err.message : String(err)}`
          : 'Не удалось загрузить запросы. Проверьте соединение или обратитесь к администратору.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const loadAdmins = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Требуется авторизация');
      return;
    }
    if (role !== 'admin') {
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${BASE_URL}/request_list/admins`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = `Ошибка: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {}
        if (response.status === 500) {
          throw new Error('Внутренняя ошибка сервера. Обратитесь к администратору.');
        } else if (response.status === 401) {
          throw new Error('Требуется авторизация. Пожалуйста, войдите снова.');
        } else {
          throw new Error(errorMessage);
        }
      }
      const result: ApiResponse<string[]> = await response.json();
      if (result.status === 'success' && Array.isArray(result.data)) {
        setAllAdmins(result.data);
      } else {
        toast.error(result.message || 'Ошибка загрузки данных');
        setAllAdmins([]);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error(
        process.env.NODE_ENV === 'development'
          ? `Ошибка сети: ${err instanceof Error ? err.message : String(err)}`
          : 'Не удалось загрузить запросы. Проверьте соединение или обратитесь к администратору.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, role]);

  useEffect(() => {
    loadRequests();
    loadAdmins();
  }, [loadRequests, loadAdmins]);

  // Остальные функции остаются без изменений...
  const sendRequestAdmin = async () => {
    if (!expandedRequest) {
      toast.error('Заявка не выбрана');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${BASE_URL}/request_list/send_admin?admin=${selectedAdmin}&request_id=${expandedRequest.request_id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        let errorMessage = `Ошибка: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
      }
      const result: ApiResponse<Request[]> = await response.json();
      if (result.status === 'success') {
        toast.success('Изменения успешно внесены');
        loadRequests();
        setSelectedAdmin('');
      } else {
        toast.error(result.message || 'Ошибка отправки администратору');
      }
    } catch (err) {
      console.error('Send admin error:', err);
      toast.error(
        process.env.NODE_ENV === 'development'
          ? `Ошибка отправки администратору: ${err instanceof Error ? err.message : String(err)}`
          : 'Ошибка отправки администратору. Попробуйте снова.'
      );
    }
  };

  const sortTable = async (field: string) => {
    const newOrder = currentSortField === field && currentSortOrder === 'asc' ? 'desc' : 'asc';
    setCurrentSortField(field);
    setCurrentSortOrder(newOrder);

    try {
      const token = localStorage.getItem('token');
      const listType = activeButtonTable === 'get' ? 'get_requests' : 'my_requests';
      const response = await fetch(
        `${BASE_URL}/request_list/sort_requests?field=${field}&order=${newOrder}&list_type=${listType}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        let errorMessage = `Ошибка: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
      }
      const result: ApiResponse<Request[]> = await response.json();
      console.log(result.data);
      if (result.status === 'success') {
        if (activeButtonTable === 'get') {
          setProcessingRequests(result.data || []);
        } else {
          setRequests(result.data || []);
          setAllRequests(result.data || []);
        }
        if (activeButtonTable === 'get') {
          setCurrentPageGet(1);
        } else {
          setCurrentPageMy(1);
        }
      } else {
        toast.error(result.message || 'Ошибка сортировки таблицы');
      }
    } catch (err) {
      console.error('Sort error:', err);
      toast.error(
        process.env.NODE_ENV === 'development'
          ? `Ошибка сортировки: ${err instanceof Error ? err.message : String(err)}`
          : 'Ошибка сортировки. Попробуйте снова.'
      );
    }
  };

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timer = setTimeout(async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(
            `${BASE_URL}/request_list/search_request_id?query=${encodeURIComponent(searchQuery)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!response.ok) {
            let errorMessage = `Ошибка: ${response.status}`;
            try {
              const errorData = await response.json();
              errorMessage = errorData.detail || errorMessage;
            } catch (e) {}
            throw new Error(errorMessage);
          }
          const result: ApiResponse<Request[]> = await response.json();
          if (result.status === 'success') {
            setRequests(result.list_requests || []);
            setCurrentPageMy(1);
            setCurrentPageGet(1);
          } else {
            setRequests([]);
            toast.error(result.message || 'Ничего не найдено');
          }
        } catch (err) {
          console.error('Search error:', err);
          toast.error(
            process.env.NODE_ENV === 'development'
              ? `Ошибка поиска: ${err instanceof Error ? err.message : String(err)}`
              : 'Ошибка поиска. Попробуйте снова.'
          );
        }
      }, 300);

      return () => clearTimeout(timer);
    } else {
      setRequests(allRequests);
      setCurrentPageMy(1);
      setCurrentPageGet(1);
    }
  }, [searchQuery, allRequests]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const previews: string[] = [];
      Array.from(files).forEach((file) => {
        if (file.type.startsWith('image/')) {
          previews.push(URL.createObjectURL(file));
        }
      });
      setPreviewImages((prev) => [...prev, ...previews]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData();
    formData.append('serviceType', getServiceLabel(selectedService));
    formData.append('comment', comment);
    formData.append('department', departmentOptions[activeTab]);
    if (fileInputRef.current?.files) {
      Array.from(fileInputRef.current.files).forEach((file, index) => {
        formData.append(`images`, file);
      });
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${BASE_URL}/request_list/request_repair`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        let errorMessage = `Ошибка ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {}
        if (response.status === 500) {
          console.error('Ошибка сервера:', result.detail);
          throw new Error('Внутренняя ошибка сервера. Обратитесь к администратору');
        } else if (response.status === 401) {
          throw new Error('Требуется авторизация. Пожалуйста, войдите снова.');
        } else {
          throw new Error(errorMessage);
        }
      }
      if (result.status === 'success') {
        toast.success('Заявка создана успешно');
        loadRequests();
      } else {
        toast.error(result.message || 'Ошибка загрузки данных');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error(
        process.env.NODE_ENV === 'development'
          ? `Ошибка сети: ${err instanceof Error ? err.message : String(err)}`
          : 'Не удалось загрузить запросы. Проверьте соединение или обратитесь к администратору.'
      );
    } finally {
      setIsLoading(false);
      closeCreateModal();
    }
  };

  const updateNewRequestStatus = async () => {
    if (!expandedRequest) {
      toast.error('Заявка не выбрана');
      return;
    }
    if (!newRequestStatus) {
      toast.error('Статус не выбран');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${BASE_URL}/request_list/change_status?new_status=${newRequestStatus}&request_id=${expandedRequest.request_id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        let errorMessage = `Ошибка: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {}
        throw new Error(errorMessage);
      }
      const result: ApiResponse<Request[]> = await response.json();
      if (result.status === 'success') {
        toast.success('Изменения успешно внесены');
        loadRequests();
        setNewRequestStatus('');
      } else {
        toast.error(result.message || 'Ошибка обновления статуса запроса');
      }
    } catch (err) {
      console.error('Update status error:', err);
      toast.error(
        process.env.NODE_ENV === 'development'
          ? `Ошибка обновления статуса запроса: ${err instanceof Error ? err.message : String(err)}`
          : 'Ошибка обновления статуса запроса. Попробуйте снова.'
      );
    }
  };

  const getServiceLabel = (value: string): string => {
    const service = serviceOptions.find((option) => option.value === value);
    return service ? service.label : 'Неизвестная услуга';
  };

  const removeImage = (index: number) => {
    setPreviewImages((prev) => prev.filter((_, i) => i !== index));
  };

  const getStatusStyles = (status: string) => {
    const baseClasses = 'inline-block px-3 py-1 rounded-full text-xs font-semibold border';
    switch (status) {
      case 'завершено':
        return `${baseClasses} ${
          theme === 'dark'
            ? 'bg-green-700 text-green-100 border-green-600'
            : 'bg-green-100 text-green-800 border-green-200'
        }`;
      case 'в обработке':
        return `${baseClasses} ${
          theme === 'dark'
            ? 'bg-yellow-600 text-yellow-100 border-yellow-500'
            : 'bg-yellow-100 text-yellow-800 border-yellow-200'
        }`;
      case 'не просмотрено':
        return `${baseClasses} ${
          theme === 'dark'
            ? 'bg-red-700 text-red-100 border-red-600'
            : 'bg-red-100 text-red-800 border-red-200'
        }`;
      default:
        return `${baseClasses} ${
          theme === 'dark'
            ? 'bg-gray-600 text-gray-200 border-gray-500'
            : 'bg-gray-100 text-gray-800 border-gray-200'
        }`;
    }
  };

  const renderSortableHeader = (label: string, field: string, onClick: () => void) => {
    const isActive = currentSortField === field;
    let sortIcon = <CaretDownOutlined />;
    if (isActive) {
      sortIcon = currentSortOrder === 'asc' ? <CaretUpOutlined /> : <CaretDownOutlined />;
    }

    return (
      <th
        onClick={onClick}
        className={`p-3 text-left font-semibold cursor-pointer transition-all duration-300 ${
          theme === 'dark' 
            ? 'hover:bg-gray-600 text-gray-200' 
            : 'hover:bg-gray-200 text-gray-700'
        }`}
      >
        <div className="flex items-center">
          <span>{label}</span>
          <span className="ml-1">{sortIcon}</span>
        </div>
      </th>
    );
  };

  const totalPages = Math.ceil(
    (activeButtonTable === 'my' ? requests : processingRequests).length / ITEMS_PER_PAGE
  );
  const currentPage = activeButtonTable === 'my' ? currentPageMy : currentPageGet;
  const setCurrentPage = activeButtonTable === 'my' ? setCurrentPageMy : setCurrentPageGet;
  const goToPage = (page: number) => {
    const validPage = Math.min(Math.max(1, page), totalPages || 1);
    setCurrentPage(validPage);
  };

  const openCreateModal = () => {
    setIsCreateModalOpen(true);
    // Блокируем скролл body при открытии модалки
    document.body.style.overflow = 'hidden';
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setSelectedService('');
    setComment('');
    setPreviewImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Восстанавливаем скролл body
    document.body.style.overflow = 'unset';
  };

  const showImage = (comment: string, imagesPath: string[] | null, index: number) => {
    const paths = Array.isArray(imagesPath) ? imagesPath : [];
    setImageData({ images: paths, index, comment });
    setIsImageModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeImageModal = () => {
    setIsImageModalOpen(false);
    setImageData({ images: [], index: 0, comment: '' });
    document.body.style.overflow = 'unset';
  };

  const changeImage = (direction: 'next' | 'prev') => {
    if (!imageData.images.length) return;
    let newIndex = imageData.index;
    if (direction === 'next' && newIndex < imageData.images.length - 1) newIndex++;
    if (direction === 'prev' && newIndex > 0) newIndex--;
    setImageData((prev) => ({ ...prev, index: newIndex }));
  };

  const paginatedRequests = (
    activeButtonTable === 'my' ? requests : processingRequests
  ).slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className={`min-h-screen transition-colors duration-300 ${glassClasses.background} relative`}>
      {/* Улучшенный анимированный фон с серо-черным градиентом */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute -top-40 -right-32 w-80 h-80 rounded-full blur-3xl opacity-20 ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-gray-300'
        } animate-pulse`}></div>
        <div className={`absolute -bottom-40 -left-32 w-80 h-80 rounded-full blur-3xl opacity-20 ${
          theme === 'dark' ? 'bg-gray-900' : 'bg-gray-400'
        } animate-pulse delay-1000`}></div>
        <div className={`absolute top-1/2 left-1/2 w-96 h-96 rounded-full blur-3xl opacity-10 ${
          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-500'
        } animate-pulse delay-500`}></div>
      </div>

      <div className={`p-4 sm:p-6 md:p-7 m-auto max-w-[1400px] relative z-10 ${fontSizeClasses[fontSize]}`}>
        <ToastContainer 
          position="top-right" 
          autoClose={3000}
          theme={theme}
        />
        
        {/* Кнопка Назад */}
        <Link
          to="/dashboard"
          className={`flex text-sm w-fit mb-3 items-center rounded-lg gap-2 px-4 py-2  transition-colors ${theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} shadow-lg`}
        >
          <ArrowLeft size={16} />Вернуться на главную
        </Link>

        <div className={`rounded-2xl min-h-[90vh] p-4 sm:p-6 md:p-8 ${glassClasses.card}`}>
          
          {/* Header and controls */}
          <div className={`flex flex-wrap items-center justify-between mb-6 gap-3 print:hidden`}>
            <div className="flex flex-wrap gap-4">
              {requests.length !== 0 && (
                <button
                  onClick={() => setActiveButtonTable('my')}
                  className={`py-2 px-4 rounded-lg transition-all duration-300 text-xl md:text-2xl font-bold ${
                    activeButtonTable === 'my'
                      ? theme === 'dark'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-blue-600 text-white shadow-lg'
                      : theme === 'dark'
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Отправленные заявки
                </button>
              )}
              {processingRequests.length !== 0 && (
                <button
                  onClick={() => setActiveButtonTable('get')}
                  className={`py-2 px-4 rounded-lg transition-all duration-300 text-xl md:text-2xl font-bold ${
                    activeButtonTable === 'get'
                      ? theme === 'dark'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-blue-600 text-white shadow-lg'
                      : theme === 'dark'
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Полученные заявки
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleTheme}
                className={`w-12 h-12 rounded-2xl transition-all duration-300 flex items-center justify-center ${
                  theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-yellow-300 border border-gray-600'
                    : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
                } backdrop-blur-sm`}
                title={theme === 'dark' ? 'Светлая тема' : 'Темная тема'}
              >
                {theme === 'dark' ? <Sun size={24} weight="regular" /> : <Moon size={24} weight="regular" />}
              </button>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as any)}
                className={`p-2 rounded-xl transition-all duration-300 border ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-gray-200'
                    : 'bg-white border-gray-300 text-gray-700'
                }`}
              >
                <option value="small">Мелкий</option>
                <option value="medium">Средний</option>
                <option value="large">Крупный</option>
                <option value="xlarge">Очень крупный</option>
              </select>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlass 
                size={20} 
                className={theme === 'dark' ? 'text-blue-400' : 'text-blue-600'} 
              />
            </div>
            <input
              type="text"
              placeholder="Поиск по ID заявки..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-10 pr-4 py-3 rounded-xl w-full transition-all duration-300 focus:ring-2 focus:outline-none border ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-400 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-400'
              }`}
            />
          </div>

          {/* Requests table */}
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border">
                <table className={`min-w-full rounded-2xl overflow-hidden ${
                  theme === 'dark' ? 'border-gray-600' : 'border-gray-300'
                }`}>
                  <thead className={glassClasses.table.header}>
                    <tr>
                      <th className="p-4 text-left font-semibold border-b">
                        № заявки
                      </th>
                      {renderSortableHeader('Дата', 'date', () => sortTable('date'))}
                      {renderSortableHeader('Отправитель', 'fio', () => sortTable('fio'))}
                      <th className="p-4 text-left font-semibold border-b">
                        Тема
                      </th>
                      {renderSortableHeader('Отдел', 'processing_depart', () => sortTable('processing_depart'))}
                      {renderSortableHeader('Статус', 'status', () => sortTable('status'))}
                      <th className="p-4 text-left font-semibold border-b">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRequests.map((request) => (
                      <React.Fragment key={request.request_id}>
                        {/* Main row */}
                        <tr className={`${glassClasses.table.row} transition-all duration-300`}>
                          <td className="p-4 font-mono">
                            <span className={glassClasses.text.primary}>{request.request_id}</span>
                          </td>
                          <td className="p-4">
                            <span className={glassClasses.text.primary}>{request.send_date}</span>
                          </td>
                          <td
                            className="p-4 hover:cursor-pointer transition-colors duration-200"
                            onClick={() => navigate(`/contacts?search=${request.sender_fullname}`)}
                          >
                            <span className={`${glassClasses.text.primary} hover:text-blue-400 hover:underline`}>
                              {request.sender_fullname}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={glassClasses.text.primary}>{request.theme || '–'}</span>
                          </td>
                          <td className="p-4">
                            <span className={glassClasses.text.primary}>{request.processing_depart || '–'}</span>
                          </td>
                          <td className="p-4">
                            <span className={getStatusStyles(request.status)}>{request.status}</span>
                          </td>
                          <td className="p-4">
                            <button
                              onClick={() => {
                                setExpandedRequest(
                                  expandedRequest?.request_id === request.request_id ? null : request
                                );
                                setNewRequestStatus('');
                              }}
                              className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium ${
                                theme === 'dark'
                                  ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500'
                                  : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500'
                              }`}
                            >
                              {expandedRequest?.request_id === request.request_id ? (
                                <Space>
                                  <CaretUpOutlined />
                                  <span>Скрыть</span>
                                </Space>
                              ) : (
                                <Space>
                                  <CaretDownOutlined />
                                  <span>Показать</span>
                                </Space>
                              )}
                            </button>
                          </td>
                        </tr>
                        {/* Expandable row */}
                        {expandedRequest?.request_id === request.request_id && (
                          <tr>
                            <td
                              colSpan={7}
                              className={`p-6 rounded-2xl ${
                                theme === 'dark' 
                                  ? 'bg-gray-700 border-gray-600' 
                                  : 'bg-gray-100 border-gray-300'
                              } border`}
                            >
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                  <h4 className={`font-semibold text-lg mb-4 ${glassClasses.text.primary}`}>
                                    Информация о заявке
                                  </h4>
                                  <div className="space-y-3">
                                    <p className={glassClasses.text.primary}>
                                      <strong>Должность:</strong> {request.sender_job_title}
                                    </p>
                                    <p className={glassClasses.text.primary}>
                                      <strong>Отдел:</strong> {request.sender_depart}
                                    </p>
                                    <p className={glassClasses.text.primary}>
                                      <strong>Почта:</strong> {request.sender_email || '–'}
                                    </p>
                                    <p className={glassClasses.text.primary}>
                                      <strong>Телефон:</strong> {request.sender_phone || '–'}
                                    </p>
                                    {(expandedRequest.owner_fullname === user_fullname || role === 'admin') && (
                                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-4">
                                        <strong className={glassClasses.text.primary}>Изменить статус:</strong>
                                        <select
                                          className={`p-2 rounded-xl border ${
                                            theme === 'dark'
                                              ? 'bg-gray-600 border-gray-500 text-white'
                                              : 'bg-white border-gray-300 text-gray-800'
                                          }`}
                                          value={newRequestStatus}
                                          onChange={(e) => setNewRequestStatus(e.target.value)}
                                        >
                                          <option value="">{request.status}</option>
                                          <option value="в обработке">в обработке</option>
                                          <option value="завершено">завершено</option>
                                        </select>
                                        <button
                                          className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium ${
                                            theme === 'dark'
                                              ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500'
                                              : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500'
                                          }`}
                                          onClick={() => updateNewRequestStatus()}
                                        >
                                          Сохранить
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <h4 className={`font-semibold text-lg mb-3 ${glassClasses.text.primary}`}>
                                    Обработчик
                                  </h4>
                                  <div className="mb-4">
                                    <strong className={glassClasses.text.primary}>ФИО:</strong>{' '}
                                    {request.owner_fullname === 'нет' && role === 'admin' ? (
                                      <div className="flex flex-col sm:flex-row gap-3 mt-2">
                                        <select
                                          value={selectedAdmin}
                                          onChange={(e) => setSelectedAdmin(e.target.value)}
                                          className={`flex-1 p-2.5 rounded-xl border focus:ring-2 focus:outline-none ${
                                            theme === 'dark'
                                              ? 'bg-gray-600 border-gray-500 text-white focus:ring-blue-400'
                                              : 'bg-white border-gray-300 text-gray-800 focus:ring-blue-500'
                                          }`}
                                          required
                                        >
                                          <option value="">Выберите обработчика запроса</option>
                                          {allAdmins.map((admin, index) => (
                                            <option key={index} value={admin}>
                                              {admin}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium ${
                                            theme === 'dark'
                                              ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500'
                                              : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500'
                                          }`}
                                          onClick={() => sendRequestAdmin()}
                                        >
                                          Сохранить
                                        </button>
                                      </div>
                                    ) : (
                                      <span className={glassClasses.text.primary}>{request.owner_fullname}</span>
                                    )}
                                  </div>
                                  <h4 className={`font-semibold text-lg mt-4 mb-3 ${glassClasses.text.primary}`}>
                                    Дополнительная информация
                                  </h4>
                                  <div className="space-y-3">
                                    <p className={glassClasses.text.primary}>
                                      <strong>Комментарий:</strong> {request.comment || 'Не назначен'}
                                    </p>
                                    {request.images_path && request.images_path.length > 0 && (
                                      <div>
                                        <strong className={glassClasses.text.primary}>Фото:</strong>
                                        <div className="flex flex-wrap gap-3 mt-2">
                                          {request.images_path.map((img, i) => (
                                            <img
                                              loading="lazy"
                                              key={i}
                                              src={`http://cloud.mhp.net/static/images/${img}`}
                                              alt={`Фото ${i + 1}`}
                                              className="w-24 h-24 object-cover rounded-xl border-2 border-transparent hover:border-blue-400 transition-all duration-300 cursor-pointer shadow-lg"
                                              onClick={() =>
                                                showImage(request.comment, request.images_path, i)
                                              }
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination and create button */}
              <div className="flex flex-wrap items-center justify-between mt-6 gap-4">
                <div id="pagination" className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1}
                    className={`px-3 py-2 rounded-xl transition-all duration-300 font-medium ${
                      currentPage === 1 
                        ? 'opacity-50 cursor-not-allowed bg-gray-400 text-gray-600' 
                        : glassClasses.button.secondary
                    }`}
                  >
                    {'<<'}
                  </button>
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`px-3 py-2 rounded-xl transition-all duration-300 font-medium ${
                      currentPage === 1 
                        ? 'opacity-50 cursor-not-allowed bg-gray-400 text-gray-600' 
                        : glassClasses.button.secondary
                    }`}
                  >
                    {'<'}
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else {
                      if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => goToPage(page)}
                        className={`px-4 py-2 rounded-xl transition-all duration-300 font-medium ${
                          currentPage === page
                            ? glassClasses.button.primary
                            : glassClasses.button.secondary
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-2 rounded-xl transition-all duration-300 font-medium ${
                      currentPage === totalPages 
                        ? 'opacity-50 cursor-not-allowed bg-gray-400 text-gray-600' 
                        : glassClasses.button.secondary
                    }`}
                  >
                    {'>'}
                  </button>
                  <button
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-2 rounded-xl transition-all duration-300 font-medium ${
                      currentPage === totalPages 
                        ? 'opacity-50 cursor-not-allowed bg-gray-400 text-gray-600' 
                        : glassClasses.button.secondary
                    }`}
                  >
                    {'>>'}
                  </button>
                </div>
                <button
                  className={`px-6 py-3 rounded-xl transition-all duration-300 font-medium flex items-center gap-2 hover:scale-105 ${
                    glassClasses.button.primary
                  }`}
                  onClick={() => openCreateModal()}
                >
                  <Plus size={20} />
                  Создать запрос
                </button>
              </div>

              {/* Create request modal */}
              {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                  <div
                    className={`rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto ${glassClasses.modal}`}
                  >
                    <div className="flex justify-between items-center mb-6">
                      <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-900'}`}>
                        Создание запроса
                      </h2>
                      <button
                        onClick={closeCreateModal}
                        className={`text-2xl font-bold rounded-full w-10 h-10 flex items-center justify-center transition-all duration-300 ${
                          theme === 'dark' 
                            ? 'text-gray-400 hover:bg-gray-700 hover:text-white' 
                            : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                        }`}
                      >
                        &times;
                      </button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div>
                        <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-900'}`}>Тип обращения</h3>
                        <div className="flex gap-3 mb-4">
                          <button
                            type="button"
                            onClick={() => setActiveTab('rovt')}
                            className={`px-5 py-3 rounded-xl transition-all duration-300 font-medium ${
                              activeTab === 'rovt'
                                ? glassClasses.button.primary
                                : glassClasses.button.secondary
                            }`}
                          >
                            ТЭРиОВТ
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('asu')}
                            className={`px-5 py-3 rounded-xl transition-all duration-300 font-medium ${
                              activeTab === 'asu'
                                ? glassClasses.button.primary
                                : glassClasses.button.secondary
                            }`}
                          >
                            АСУ
                          </button>
                        </div>
                        <p className={`mb-3 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-900'}`}>
                          Проконсультируем по услугам и тарифам, решим вопросы оплаты, переоформления, доступа в личный кабинет.
                        </p>
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-900'}`}>
                          График работы – Пн-Пт: 8:00 - 20:00<br />
                          Сб: 10:00 - 16:00, Вс: выходной
                        </p>
                      </div>
                      <div>
                        <label htmlFor="service-type" className={`block font-medium mb-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-900'}`}>
                          С какой услугой связан ваш запрос*
                        </label>
                        <select
                          id="service-type"
                          value={selectedService}
                          onChange={(e) => setSelectedService(e.target.value)}
                          className={`w-full p-3 rounded-xl border focus:ring-2 focus:outline-none transition-all duration-300 ${
                            theme === 'dark'
                              ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-400 focus:ring-blue-400'
                              : 'bg-white border-gray-300 text-gray-800 focus:border-blue-400 focus:ring-blue-400'
                          }`}
                          required
                        >
                          <option value="">Выберите тип услуги</option>
                          {serviceOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              className={theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <h3 className={`text-lg font-semibold mb-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-900'}`}>Оставьте комментарий для описания проблемы:</h3>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          className={`w-full p-4 rounded-xl border resize-none h-32 focus:ring-2 focus:outline-none transition-all duration-300 ${
                            theme === 'dark'
                              ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-400 focus:ring-blue-400'
                              : 'bg-white border-gray-300 text-gray-800 focus:border-blue-400 focus:ring-blue-400'
                          }`}
                          required
                        />
                      </div>
                      <div>
                        <div id="image-preview-container" className="flex flex-wrap gap-3">
                          {previewImages.map((src, index) => (
                            <div key={index} className="relative group">
                              <img
                                src={src}
                                loading="lazy"
                                alt={`Preview ${index}`}
                                className="w-20 h-20 object-cover rounded-xl border-2 border-transparent group-hover:border-red-400 transition-all duration-300 shadow-lg"
                              />
                              <button
                                type="button"
                                onClick={() => removeImage(index)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-sm flex items-center justify-center hover:bg-red-600 transition-all duration-300 shadow-lg"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-between items-center gap-4">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept="image/*"
                          multiple
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`flex items-center gap-3 px-5 py-3 rounded-xl transition-all duration-300 font-medium ${glassClasses.button.secondary}`}
                          title="Чтобы сделать скриншот, нажмите клавишу PrintScreen на клавиатуре"
                        >
                          <Printer size={20} />
                          <span>Прикрепить файл</span>
                        </button>
                        <button
                          type="submit"
                          className={`px-6 py-3 rounded-xl transition-all duration-300 font-medium flex items-center gap-2 hover:scale-105 ${
                            glassClasses.button.primary
                          }`}
                        >
                          <Plus size={20} />
                          Создать запрос
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Image viewer modal */}
              {isImageModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
                  <div
                    className={`rounded-2xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden ${glassClasses.modal}`}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-gray-900">
                        Просмотр фото
                      </h3>
                      <button
                        onClick={closeImageModal}
                        className={`text-2xl font-bold rounded-full w-10 h-10 flex items-center justify-center transition-all duration-300 ${
                          theme === 'dark' 
                            ? 'text-gray-400 hover:bg-gray-700 hover:text-white' 
                            : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                        }`}
                      >
                        &times;
                      </button>
                    </div>
                    <div className="relative flex items-center justify-center h-[70vh]">
                      {imageData.images.length > 0 && (
                        <img
                          src={`http://cloud.mhp.net/static/images/${imageData.images[imageData.index]}`}
                          alt="Увеличенное фото"
                          loading="lazy"
                          className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
                        />
                      )}
                      <button
                        onClick={() => changeImage('prev')}
                        disabled={imageData.index === 0}
                        className={`absolute left-4 rounded-full w-12 h-12 flex items-center justify-center text-2xl font-bold transition-all duration-300 ${
                          imageData.index === 0
                            ? 'opacity-30 cursor-not-allowed bg-gray-400'
                            : 'opacity-80 hover:opacity-100 hover:scale-110 bg-gray-600 text-white'
                        } border border-gray-500`}
                      >
                        ◄
                      </button>
                      <button
                        onClick={() => changeImage('next')}
                        disabled={imageData.index === imageData.images.length - 1}
                        className={`absolute right-4 rounded-full w-12 h-12 flex items-center justify-center text-2xl font-bold transition-all duration-300 ${
                          imageData.index === imageData.images.length - 1
                            ? 'opacity-30 cursor-not-allowed bg-gray-400'
                            : 'opacity-80 hover:opacity-100 hover:scale-110 bg-gray-600 text-white'
                        } border border-gray-500`}
                      >
                        ►
                      </button>
                    </div>
                    <p className="mt-4 text-center text-lg text-gray-900">{imageData.comment}</p>
                    <div className="flex justify-center mt-3 text-sm text-gray-600">
                      {imageData.index + 1} из {imageData.images.length}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ToastContainer />
    </div>
  );
};