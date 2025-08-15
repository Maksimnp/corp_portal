import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { CaretDownOutlined, CaretUpOutlined } from '@ant-design/icons';
import { Space } from 'antd';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
// === Типы ===
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
  list_requests?: T; // Для search_request_id
  order?: 'asc' | 'desc';
  message?: string;
}

export const RequestList: React.FC = () => {
  const { isAuthenticated } = useAuth();
  
  const navigate = useNavigate();
  const role = localStorage.getItem('role') || 'user';
  const user_fullname = localStorage.getItem('username') || '';
  const [activeTab, setActiveTab] = useState<'rovt' | 'asu'>('rovt');
  const [activeButtonTable, setActiveButtonTable] = useState<'my' | 'get'>('my')
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

  const [newRequestStatus, setNewRequestStatus] = useState<string>('')
  const [expandedRequest, setExpandedRequest] = useState<Request | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const [highContrast, setHighContrast] = useState(false);
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

  const departmentOptions = {
    'rovt': ' ТЭРиОВТ',
    'asu': 'АСУ'
  }

  const fontSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
    xlarge: 'text-xl'
  };

  const serviceOptions = [
    { id: 'new-service', value: 'new-service', label: 'Новая услуга' },
    { id: 'not-related', value: 'not-related', label: 'Не связан с услугами' },
    { id: 'virtual-hosting', value: 'virtual-hosting', label: 'Виртуальный хостинг' },
    { id: 'secure-email', value: 'secure-email', label: 'Защищенная почта' }
  ];

  const loadRequests = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Требуется авторизация');
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error("Ошибка авторизации. Поробуйте войти заново");
        return;
      }
      const response = await fetch(`/api/request_list/get_requests`, {
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
        } catch (e) {
          // Если JSON не получен
        }
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
    if (role !== "admin") {
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`api/request_list/admins`, {
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
        } catch (e) {
          // Если JSON не получен
        }
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
  }, [isAuthenticated]);

  useEffect(() => {
    loadRequests();
    loadAdmins();
  }, [loadRequests, loadAdmins]);

  const sendRequestAdmin = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `/api/request_list/send_admin?admin=${selectedAdmin}&request_id=${expandedRequest?.request_id}`,
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
        } catch (e) {
          // Если JSON не получен
        }
        throw new Error(errorMessage);
      }
      const result: ApiResponse<Request[]> = await response.json();
      if (result.status === 'success') {
        toast.success("Изменения успешно внесены");
        loadRequests();
      } else {
        toast.error(result.message || 'Ошибка отправки администратору');
      }
    } catch (err) {
      console.error('Sort error:', err);
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
      `/api/request_list/sort_requests?field=${field}&order=${newOrder}&list_type=${listType}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      let errorMessage = `Ошибка: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
      }
      throw new Error(errorMessage);
    }

    const result: ApiResponse<Request[]> = await response.json();
    console.log(result.data)
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
         setCurrentPage(1);
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
            `/api/request_list/search_request_id?query=${encodeURIComponent(searchQuery)}`,
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
            } catch (e) {
              // Если JSON не получен
            }
            throw new Error(errorMessage);
          }
          const result: ApiResponse<Request[]> = await response.json();
          if (result.status === 'success') {
            setRequests(result.list_requests || []);
            setCurrentPage(1);
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
      setCurrentPage(1);
    }
  }, [searchQuery, allRequests]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const previews: string[] = [];
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          previews.push(URL.createObjectURL(file));
        }
      });
      setPreviewImages(prev => [...prev, ...previews]);
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
      const response = await fetch('/api/request_list/request_repair', {
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
        } catch (e) {
          //
        }
        if (response.status === 500) {
          console.error('Ошибка сервера:', result.detail);
          throw new Error('Внутрення ошибка сервера. Обратитесь к администратору');
        } else if (response.status === 401) {
          throw new Error('Требуется авторизация. Пожалуйста, войдите снова.')
        } else {
          throw new Error(errorMessage);
        }
      }
      if (result.status === 'success') {
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
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `/api/request_list/change_status?new_status=${newRequestStatus}&request_id=${expandedRequest?.request_id}`,
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
        } catch (e) {
          // Если JSON не получен
        }
        throw new Error(errorMessage);
      }
      const result: ApiResponse<Request[]> = await response.json();
      if (result.status === 'success') {
        toast.success("Изменения успешно внесены");
        loadRequests();
      } else {
        toast.error(result.message || 'Ошибка обновления статуса запроса');
      }
    } catch (err) {
      console.error('Sort error:', err);
      toast.error(
        process.env.NODE_ENV === 'development'
          ? `Ошибка обновления статуса запроса: ${err instanceof Error ? err.message : String(err)}`
          : 'Ошибка обновления статуса запроса. Попробуйте снова.'
      );
    }
  }
  const getServiceLabel = (value: string): string => {
    const service = serviceOptions.find(option => option.value === value);
    return service ? service.label : 'Неизвестная услуга';
  };

  const removeImage = (index: number) => {
    setPreviewImages(prev => prev.filter((_, i) => i !== index));
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
  }

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setSelectedService('');
    setComment('');
    setPreviewImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const showImage = (comment: string, imagesPath: string[] | null, index: number) => {
    const paths = Array.isArray(imagesPath) ? imagesPath : [];
    setImageData({ images: paths, index, comment });
    setIsImageModalOpen(true);
  };

  const closeImageModal = () => {
    setIsImageModalOpen(false);
    setImageData({ images: [], index: 0, comment: '' });
  };

  const changeImage = (direction: 'next' | 'prev') => {
    if (!imageData.images.length) return;
    let newIndex = imageData.index;
    if (direction === 'next' && newIndex < imageData.images.length - 1) newIndex++;
    if (direction === 'prev' && newIndex > 0) newIndex--;
    setImageData((prev) => ({ ...prev, index: newIndex }));
  };

  const getStatusStyles = (status: string, highContrast: boolean) => {
    const baseClasses = 'inline-block px-3 py-1 rounded-full text-xs font-semibold';

    switch (status) {
      case 'завершено':
        return `${baseClasses} ${
          highContrast
            ? 'bg-green-900 text-green-200'
            : 'bg-green-100 text-green-800'
        }`;
      case 'в обработке':
        return `${baseClasses} ${
          highContrast
            ? 'bg-yellow-900 text-yellow-200'
            : 'bg-yellow-100 text-yellow-800'
        }`;
      case 'не просмотрено':
        return `${baseClasses} ${
          highContrast
            ? 'bg-red-900 text-red-200'
            : 'bg-red-100 text-red-800'
        }`;
      default:
        return `${baseClasses} ${
          highContrast
            ? 'bg-gray-700 text-gray-300'
            : 'bg-gray-100 text-gray-800'
        }`;
    }
  };

  const renderSortableHeader = (
    label: string,
    field: string,
    onClick: () => void
  ) => {
    const isActive = currentSortField === field;
    let sortIcon = <CaretDownOutlined />;

    if (isActive) {
      sortIcon = currentSortOrder === 'asc' ? <CaretUpOutlined /> : <CaretDownOutlined />;
    }

    return (
      <th
        onClick={onClick}
        className={`p-3 text-left font-semibold cursor-pointer transition-colors ${highContrast ? 'border-b border-yellow-400 hover:bg-gray-600' : 'border-b border-gray-200 hover:bg-gray-200'}`}
      >
        <div className="flex items-center">
          <span>{label}</span>
          <span className="ml-1">{sortIcon}</span>
        </div>
      </th>
    );
  };

  const paginatedRequests = (
    activeButtonTable === 'my' ? requests : processingRequests
  ).slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className={`p-4 sm:p-6 md:p-7 m-auto max-w-[1400px] min-h-screen duration-200 transition-colors ${highContrast ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'} ${fontSizeClasses[fontSize]}`}>
      <ToastContainer position="top-right" autoClose={3000} />
      <button
        onClick={() => navigate('/dashboard')}
        className={`flex items-center mb-3 px-4 py-2 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 
          ${highContrast ? 'border-yellow-300  text-yellow-300 hover:bg-gray-700 focus:ring-blue-500':'border-gray-300  text-gray-700 hover:bg-gray-50 focus:ring-blue-500'} `}
      >
        <svg className={`h-5 w-5 mr-2 ${highContrast ? 'text-yellow-500':'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Назад в Dashboard
      </button>
      <div className={`rounded-xl shadow-lg p-4 sm:p-6 md:p-8 ${highContrast ? 'bg-gray-800' : 'bg-white'}`}>
        {/* Toast сообщение */}
        {toastMessage && (
          <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fadeIn">
            {toastMessage}
          </div>
        )}

        {/* Заголовок и элементы управления */}
        <div className={`flex flex-wrap items-center justify-between mb-6 gap-3 print:hidden ${
          highContrast ? 'text-yellow-400' : 'text-gray-800'
        }`}>
          <div>
            {requests.length !== 0 && (
              <button
                onClick={() => setActiveButtonTable('my')}
                className={`py-2 rounded-lg mr-6 transition-colors text-2xl md:text-3xl font-bold ${
                  activeButtonTable === 'my'
                    ? (highContrast ? 'underline decoration-yellow-600' : 'underline decoration-blue-600')
                    : ('')
                  }
                `}
              >
                Отправленные заявки
              </button>
            )}
            {processingRequests.length !== 0 && (
              <button
                onClick={() => setActiveButtonTable('get')}
                className={`py-2 rounded-lg transition-colors text-2xl md:text-3xl font-bold ${
                  activeButtonTable === 'get'
                    ? (highContrast ? 'underline decoration-yellow-600' : 'underline decoration-blue-600')
                    : ('')
                  }
                `}
              >
                Полученные заявки
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setHighContrast(!highContrast)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                highContrast
                  ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-300'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
            >
              {highContrast ? 'Обычный режим' : 'Высокая контрастность'}
            </button>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as any)}
              className={`p-1.5 border rounded-lg text-sm ${
                highContrast
                  ? 'bg-gray-800 border-yellow-400 text-yellow-400'
                  : 'bg-white border-gray-300 text-gray-800'
                }`}
            >
              <option value="small">Мелкий</option>
              <option value="medium">Средний</option>
              <option value="large">Крупный</option>
              <option value="xlarge">Очень крупный</option>
            </select>
          </div>
        </div>

        {/* Поиск */}
        <input
          type="text"
          placeholder="Поиск по ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`mb-4 p-2.5 border rounded-lg w-full transition-colors focus:ring-2 focus:outline-none ${
            highContrast
              ? 'bg-gray-700 border-yellow-400 text-white focus:ring-yellow-400'
              : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-transparent'
            }`}
        />

        {/* Таблица с заявками */}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className={`min-w-full ${highContrast ? 'border-yellow-400' : 'border-gray-200'}`}>
                <thead className={`${highContrast ? 'bg-gray-700 text-yellow-400' : 'bg-gray-100 text-gray-700'}`}>
                  <tr>
                    <th
                      className={`p-3 text-left font-semibold ${highContrast ? 'border-b border-yellow-400' : 'border-b border-gray-200'}`}
                    >
                      № заявки
                    </th>
                    {renderSortableHeader('Дата', 'date', () => sortTable('date'))}
                    {renderSortableHeader('Отправитель', 'fio', () => sortTable('fio'))}
                    <th
                      className={`p-3 text-left font-semibold ${highContrast ? 'border-b border-yellow-400' : 'border-b border-gray-200'}`}
                    >
                      Тема
                    </th>
                    {renderSortableHeader('Отдел', 'processing_depart', () => sortTable('processing_depart'))}
                    {renderSortableHeader('Статус', 'status', () => sortTable('status'))}
                    <th
                      className={`p-3 text-left font-semibold ${highContrast ? 'border-b border-yellow-400' : 'border-b border-gray-200'}`}
                    >
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRequests.map((request) => (
                    <React.Fragment key={request.request_id}>
                      {/* Основная строка */}
                      <tr className={`${highContrast ? 'border-b border-gray-600 hover:bg-yellow-800' : 'border-b border-gray-200 hover:bg-gray-100'}`}>
                        <td className="p-3">{request.request_id}</td>
                        <td className="p-3">{request.send_date}</td>
                        <td className="p-3 hover:cursor-pointer hover:underline" onClick={()=>navigate(`/contacts?search=${request.sender_fullname}`)}>{request.sender_fullname}</td>
                        <td className="p-3">{request.theme || '–'}</td>
                        <td className="p-3">{request.processing_depart || '–'}</td>
                        <td className="p-3">
                          <span className={getStatusStyles(request.status, highContrast)}>
                            {request.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              setExpandedRequest(expandedRequest?.request_id === request.request_id ? null : request);
                              setNewRequestStatus('');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              highContrast ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                          >
                            {expandedRequest?.request_id === request.request_id ? 
                              <Space>
                                <CaretUpOutlined />
                                <span>Скрыть</span>
                              </Space> 
                            : <Space>
                                <CaretDownOutlined />
                                <span>Показать</span>
                              </Space>}
                          </button>
                        </td>
                      </tr>

                      {/* Раскрывающаяся строка */}
                      {expandedRequest?.request_id === request.request_id && (
                        <tr>
                          <td colSpan={7} className={`p-6 ${highContrast ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'} rounded-lg`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <h4 className="font-semibold text-lg mb-2">Информация о заявке</h4>
                                <div className="space-y-2">
                                  <p><strong>Должность:</strong> {request.sender_job_title}</p>
                                  <p><strong>Отдел:</strong> {request.sender_depart}</p>
                                  <p><strong>Почта:</strong> {request.sender_email || '–'}</p>
                                  <p><strong>Телефон:</strong> {request.sender_phone || '–'}</p>
                                  {(expandedRequest.owner_fullname === user_fullname || role === "admin") && (<p><strong>Изменить статус:</strong>
                                      <select 
                                        className={getStatusStyles(request.status, highContrast)}
                                        value={newRequestStatus}
                                        onChange={(e) => setNewRequestStatus(e.target.value)}  
                                      >
                                       <option value=''>{newRequestStatus || request.status}</option>
                                       <option value='в обработке'>в обработке</option>
                                       <option value='завершено'>завершено</option>
                                      </select>
                                      <button
                                        className={`px-4 py-2 ml-8 rounded-lg text-sm font-medium transition-colors ${
                                        highContrast ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' : 'bg-blue-500 hover:bg-blue-600 text-white'
                                        }`}
                                      onClick={() => updateNewRequestStatus()}
                                      >
                                        Сохранить
                                      </button>
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div>
                                <h4 className="font-semibold text-lg mb-1">Обработчик</h4>

                                  <strong>ФИО:</strong>{' '}
                                  {request.owner_fullname === 'нет' && role === "admin" ? (
                                    <div className='flex justify-between'>
                                      <select
                                        value={selectedAdmin}
                                        key={selectedAdmin}
                                        onChange={(e) => setSelectedAdmin(e.target.value)}
                                        className={`w-full max-w-80 p-2.5 border rounded-lg focus:ring-2 focus:outline-none ${
                                          highContrast
                                            ? 'bg-gray-700 focus:ring-yellow-500 focus:border-yellow-500 border-yellow-400'
                                            : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                                        }`}
                                        required
                                      >
                                        <option value="">Выберите обработчика запроса</option>
                                        {allAdmins.map((admin, index) => (
                                          <option
                                            key={index}
                                            value={admin}
                                          >
                                            {admin}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        highContrast ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' : 'bg-blue-500 hover:bg-blue-600 text-white'
                                        }`}
                                      onClick={() => sendRequestAdmin()}
                                      >  
                                        Сохранить
                                      </button>
                                    </div>
                                  ) : (
                                    request.owner_fullname
                                  )}

                                <h4 className="font-semibold text-lg mt-3">Дополнительная информация</h4>
                                <div className="space-y-2">
                                  <p><strong>Комментарий:</strong> {request.comment || 'Не назначен'}</p>
                                  {request.images_path && request.images_path.length > 0 && (
                                    <div>
                                      <strong>Фото:</strong>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {request.images_path.map((img, i) => (
                                          <img
                                            key={i}
                                            src={`http://192.1.66.117:8000/static/images/${img}`}
                                            alt={`Фото ${i + 1}`}
                                            className="w-32 h-32 object-cover rounded border"
                                            onClick={() =>
                                              showImage(request.comment, request.images_path, i)
                                            }
                                            style={{ cursor: 'pointer' }}
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

            {/* Пагинация и кнопка создания */}
            <div className='flex flex-wrap items-center justify-between mt-4 gap-4'>
              <div id="pagination" className="flex flex-wrap items-center gap-1">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''} ${highContrast ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                >
                  {'<<'}
                </button>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''} ${highContrast ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
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
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page ? (highContrast ? 'bg-yellow-500 text-gray-900' : 'bg-blue-500 text-white') : (highContrast ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800')
                        }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''} ${highContrast ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                >
                  {'>'}
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''} ${highContrast ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                >
                  {'>>'}
                </button>
              </div>
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  highContrast ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                onClick={() => openCreateModal()}
              >
                Создать запрос
              </button>
            </div>

            {/* Модальное окно создания запроса */}
            {isCreateModalOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className={`rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto ${highContrast ? 'bg-gray-800 text-yellow-400 border border-yellow-400' : 'bg-white'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Создание запроса</h2>
                    <button
                      onClick={closeCreateModal}
                      className={`text-2xl font-bold rounded-full w-8 h-8 flex items-center justify-center transition-colors ${highContrast ? 'text-yellow-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                      &times;
                    </button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Тип обращения</h3>
                      <div className="flex gap-2 mb-4">
                        <button
                          type="button"
                          onClick={() => setActiveTab('rovt')}
                          className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                            activeTab === 'rovt'
                              ? (highContrast ? 'bg-yellow-600 text-gray-900' : 'bg-blue-600 text-white')
                              : (highContrast ? 'border border-yellow-400 bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300')
                            }`}
                        >
                          ТЭРиОВТ
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('asu')}
                          className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                            activeTab === 'asu'
                              ? (highContrast ? 'bg-yellow-600 text-gray-900' : 'bg-blue-600 text-white')
                              : (highContrast ? 'border border-yellow-400 bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300')
                            }`}
                        >
                          АСУ
                        </button>
                      </div>
                      <p className="mb-2 text-sm">
                        Проконсультируем по услугам и тарифам, решим вопросы оплаты, переоформления, доступа в личный кабинет.
                      </p>
                      <p className="text-sm">
                        График работы – Пн-Пт: 8:00 - 20:00<br />
                        Сб: 10:00 - 16:00, Вс: выходной
                      </p>
                    </div>
                    <div>
                      <label htmlFor="service-type" className="block font-medium mb-2">
                        С какой услугой связан ваш запрос*
                      </label>
                      <select
                        id="service-type"
                        value={selectedService}
                        onChange={(e) => setSelectedService(e.target.value)}
                        className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:outline-none ${
                          highContrast ? 'bg-gray-700 focus:ring-yellow-500 focus:border-yellow-500 border-yellow-400' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                          }`}
                        required
                      >
                        <option value="">Выберите тип услуги</option>
                        {serviceOptions.map(option => (
                          <option
                            key={option.value}
                            value={option.value}
                            className={`${highContrast ? 'hover:bg-yellow-900' : ''}`}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Оставьте комментарий для описания проблемы:</h3>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className={`w-full p-3 border rounded-lg resize-none h-32 focus:ring-2 focus:outline-none ${
                          highContrast ? 'bg-gray-700 border-yellow-400 focus:ring-yellow-500' : 'border-gray-300 focus:ring-blue-500'
                          }`}
                        required
                      />
                    </div>
                    <div>
                      <div id="image-preview-container" className="space-y-2">
                        {previewImages.map((src, index) => (
                          <div key={index} className="relative inline-block mr-2">
                            <img
                              src={src}
                              alt={`Preview ${index}`}
                              className="w-20 h-20 object-cover rounded-lg border"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-sm flex items-center justify-center hover:bg-red-600 transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-between items-center gap-3">
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
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium ${
                          highContrast ? 'bg-gray-700 border border-yellow-400 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                        title="Чтобы сделать скриншот, нажмите клавишу PrintScreen на клавиатуре"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 35" className={`w-5 h-5 ${highContrast ? 'text-yellow-400' : 'text-gray-700'}`}>
                          <path d="M17.5,22.131a1.249,1.249,0,0,1-1.25-1.25V2.187a1.25,1.25,0,0,1,2.5,0V20.881A1.25,1.25,0,0,1,17.5,22.131Z"></path>
                          <path d="M17.5,22.693a3.189,3.189,0,0,1-2.262-.936L8.487,15.006a1.249,1.249,0,0,1,1.767-1.767l6.751,6.751a.7.7,0,0,0,.99,0l6.751-6.751a1.25,1.25,0,0,1,1.768,1.767l-6.752,6.751A3.191,3.191,0,0,1,17.5,22.693Z"></path>
                          <path d="M31.436,34.063H3.564A3.318,3.318,0,0,1,.25,30.749V22.011a1.25,1.25,0,0,1,2.5,0v8.738a.815.815,0,0,0,.814.814H31.436a.815.815,0,0,0,.814-.814V22.011a1.25,1.25,0,1,1,2.5,0v8.738A3.318,3.318,0,0,1,31.436,34.063Z"></path>
                        </svg>
                        <span>Прикрепить файл</span>
                      </button>
                      <button
                        type="submit"
                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                          highContrast ? 'bg-gray-700 border border-yellow-400 hover:bg-yellow-700 text-yellow-400' : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                      >
                        Создать запрос
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Модальное окно просмотра изображения */}
            {isImageModalOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className={`rounded-xl shadow-2xl p-4 w-full max-w-4xl max-h-[90vh] overflow-hidden ${highContrast ? 'bg-gray-800 border border-yellow-400' : 'bg-white'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-bold">Фото</h3>
                    <button
                      onClick={closeImageModal}
                      className={`text-2xl font-bold rounded-full w-8 h-8 flex items-center justify-center transition-colors ${highContrast ? 'text-yellow-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                      &times;
                    </button>
                  </div>
                  <div className="relative flex items-center justify-center h-[70vh]">
                    {imageData.images.length > 0 && (
                      <img
                        src={`http://192.1.66.117:8000/static/images/${imageData.images[imageData.index]}`}
                        alt="Увеличенное фото"
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                    <button
                      onClick={() => changeImage('prev')}
                      disabled={imageData.index === 0}
                      className={`absolute left-4 rounded-full w-10 h-10 flex items-center justify-center text-2xl font-bold transition-opacity duration-200 ${imageData.index === 0 ? 'opacity-30 cursor-not-allowed' : 'opacity-70 hover:opacity-100'} ${highContrast ? 'bg-gray-700 text-yellow-400' : 'bg-white text-gray-800'}`}
                    >
                      ◄
                    </button>
                    <button
                      onClick={() => changeImage('next')}
                      disabled={imageData.index === imageData.images.length - 1}
                      className={`absolute right-4 rounded-full w-10 h-10 flex items-center justify-center text-2xl font-bold transition-opacity duration-200 ${imageData.index === imageData.images.length - 1 ? 'opacity-30 cursor-not-allowed' : 'opacity-70 hover:opacity-100'} ${highContrast ? 'bg-gray-700 text-yellow-400' : 'bg-white text-gray-800'}`}
                    >
                      ►
                    </button>
                  </div>
                  <p className="mt-2 text-center">{imageData.comment}</p>
                  <div className="flex justify-center mt-2 text-sm text-gray-500">
                    {imageData.index + 1} из {imageData.images.length}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};