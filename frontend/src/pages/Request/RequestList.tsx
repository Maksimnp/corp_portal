import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';

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
  const ITEMS_PER_PAGE = 10;
  const [activeTab, setActiveTab] = useState<'rovt' | 'asu'>('rovt');
  const [selectedService, setSelectedService] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSortField, setCurrentSortField] = useState<string | null>(null);
  const [currentSortOrder, setCurrentSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentRequest, setCurrentRequest] = useState<Request | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageData, setImageData] = useState<{ images: string[]; index: number; comment: string }>({
    images: [],
    index: 0,
    comment: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const departmentOptions = {
    'rovt': ' ТЭРиОВТ',
    'asu': 'АСУ'
  }

  const serviceOptions = [
    { id: 'new-service', value: 'new-service', label: 'Новая услуга' },
    { id: 'not-related', value: 'not-related', label: 'Не связан с услугами' },
    { id: 'virtual-hosting', value: 'virtual-hosting', label: 'Виртуальный хостинг' },
    { id: 'secure-email', value: 'secure-email', label: 'Защищенная почта' }
  ];
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadRequests = useCallback(async () => {
    if (!isAuthenticated) {
      showToast('Требуется авторизация');
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://192.1.66.117:8000/request_list/get_requests`, {
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
      } else {
        showToast(result.message || 'Ошибка загрузки данных');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      showToast(
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
  }, [loadRequests]);

  const sortTable = async (field: string) => {
    const newOrder = currentSortField === field && currentSortOrder === 'asc' ? 'desc' : 'asc';
    setCurrentSortField(field);
    setCurrentSortOrder(newOrder);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://192.1.66.117:8000/request_list/sort_requests?field=${field}&order=${newOrder}`,
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
        } catch (e) {
          // Если JSON не получен
        }
        throw new Error(errorMessage);
      }

      const result: ApiResponse<Request[]> = await response.json();
      if (result.status === 'success') {
        setRequests(result.data || []);
        setCurrentPage(1);
      } else {
        showToast(result.message || 'Ошибка сортировки');
      }
    } catch (err) {
      console.error('Sort error:', err);
      showToast(
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
            `http://192.1.66.117:8000/request_list/search_request_id?query=${encodeURIComponent(searchQuery)}`,
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
            showToast(result.message || 'Ничего не найдено');
          }
        } catch (err) {
          console.error('Search error:', err);
          showToast(
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

      const response = await fetch('http://192.1.66.117:8000/request_list/request_repair', {
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
        showToast(result.message || 'Ошибка загрузки данных');
      }

    } catch (err) {
      console.error('Fetch error:', err);
      showToast(
        process.env.NODE_ENV === 'development'
          ? `Ошибка сети: ${err instanceof Error ? err.message : String(err)}`
          : 'Не удалось загрузить запросы. Проверьте соединение или обратитесь к администратору.'
      );
    } finally {
      setIsLoading(false);
      closeCreateModal();
    }
  };

  const getServiceLabel = (value: string): string => {
    const service = serviceOptions.find(option => option.value === value);
    return service ? service.label : 'Неизвестная услуга';
  };

  const removeImage = (index: number) => {
    setPreviewImages(prev => prev.filter((_, i) => i !== index));
  };

  const totalPages = Math.ceil(requests.length / ITEMS_PER_PAGE);
  const paginatedRequests = requests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const openRequestModal = (request: Request) => {
    setCurrentRequest(request);
    setIsModalOpen(true);
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
  
  const closeRequestModal = () => {
    setIsModalOpen(false);
    setCurrentRequest(null);
  };

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

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {toastMessage && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow z-50">
          {toastMessage}
        </div>
      )}

      <h2 className="text-2xl font-bold mb-4">Список заявок</h2>

      {isLoading ? (
        <div className="flex justify-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Поиск по ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-4 p-2 border rounded w-full max-w-xs"
          />

          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th
                  className="cursor-pointer hover:bg-gray-200 p-2 border"
                >
                  № заявки
                </th>
                <th
                  onClick={() => sortTable('date')}
                  className="cursor-pointer hover:bg-gray-200 p-2 border"
                >
                  Дата
                </th>
                <th
                  onClick={() => sortTable('fio')}
                  className="cursor-pointer hover:bg-gray-200 p-2 border"
                >
                  Отправитель
                </th>
                <th
                  className="cursor-pointer hover:bg-gray-200 p-2 border"
                >
                  Тема
                </th>
                <th
                  onClick={() => sortTable('processing_depart')}
                  className="cursor-pointer hover:bg-gray-200 p-2 border"
                >
                  Отдел
                </th>
                <th
                  onClick={() => sortTable('status')}
                  className="cursor-pointer hover:bg-gray-200 p-2 border"
                >
                  Статус
                </th>
                <th className="p-2 border">Действия</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRequests.map((request) => (
                <tr key={request.request_id} className="hover:bg-gray-50">
                  <td className="p-2 border">{request.request_id}</td>
                  <td className="p-2 border">{request.send_date}</td>
                  <td className="p-2 border">{request.sender_fullname}</td>
                  <td className="p-2 border">{request.theme || '–'}</td>
                  <td className="p-2 border">{request.processing_depart || '–'}</td>
                  <td className="p-2 border">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        request.status === 'завершено'
                          ? 'bg-green-100 text-green-800'
                          : request.status === 'в обработке'
                          ? 'bg-yellow-100 text-yellow-800'
                          : request.status === 'не просмотрено'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {request.status}
                    </span>
                  </td>
                  <td className="p-2 border">
                    <button
                      onClick={() => openRequestModal(request)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                    >
                      Просмотр
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className='flex justify-between mt-2'>
            <div id="pagination" className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                {'<<'}
              </button>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                {'<'}
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`px-3 py-1 border rounded ${
                    currentPage === page ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                {'>'}
              </button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                {'>>'}
              </button>
            </div>
            <div className='flex justify-center'>
              <button 
                className='bg-blue-500 text-white rounded-lg px-3 py-1 hover:bg-blue-600 text-sm border'
                onClick={() => openCreateModal()}
              >
                Создать запрос
              </button>
            </div>
          </div>

          {isCreateModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold">Создание запроса</h2>
                  <button 
                    onClick={closeCreateModal}
                    className="text-2xl hover:text-gray-600 transition-colors"
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Тип обращения</h3>
                    <div className="flex gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => setActiveTab('rovt')}
                        className={`px-4 py-2 rounded transition-colors ${
                          activeTab === 'rovt'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                      >
                        ТЭРиОВТ
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('asu')}
                        className={`px-4 py-2 rounded transition-colors ${
                          activeTab === 'asu'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                      >
                        АСУ
                      </button>
                    </div>
                    <p className="text-gray-600 mb-2">
                      Проконсультируем по услугам и тарифам, решим вопросы оплаты, переоформления, доступа в личный кабинет.
                    </p>
                    <p className="text-gray-600">
                      График работы – Пн-Пт: 8:00 - 20:00<br />
                      Сб: 10:00 - 16:00, Вс: выходной
                    </p>
                  </div>

                  <div>
                    <label htmlFor="service-type" className="block text-sm font-medium text-gray-700 mb-2">
                      С какой услугой связан ваш запрос*
                    </label>
                    <select
                      id="service-type"
                      value={selectedService}
                      onChange={(e) => setSelectedService(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">Выберите тип услуги</option>
                      {serviceOptions.map(option => (
                        <option key={option.value} value={option.value}>
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
                      className="w-full p-3 border border-gray-300 rounded resize-none h-32 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="w-20 h-20 object-cover rounded border"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
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
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      title="Чтобы сделать скриншот, нажмите клавишу PrintScreen на клавиатуре"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 35" className="w-5 h-5">
                        <path d="M17.5,22.131a1.249,1.249,0,0,1-1.25-1.25V2.187a1.25,1.25,0,0,1,2.5,0V20.881A1.25,1.25,0,0,1,17.5,22.131Z"></path>
                        <path d="M17.5,22.693a3.189,3.189,0,0,1-2.262-.936L8.487,15.006a1.249,1.249,0,0,1,1.767-1.767l6.751,6.751a.7.7,0,0,0,.99,0l6.751-6.751a1.25,1.25,0,0,1,1.768,1.767l-6.752,6.751A3.191,3.191,0,0,1,17.5,22.693Z"></path>
                        <path d="M31.436,34.063H3.564A3.318,3.318,0,0,1,.25,30.749V22.011a1.25,1.25,0,0,1,2.5,0v8.738a.815.815,0,0,0,.814.814H31.436a.815.815,0,0,0,.814-.814V22.011a1.25,1.25,0,1,1,2.5,0v8.738A3.318,3.318,0,0,1,31.436,34.063Z"></path>
                      </svg>
                      <span>Прикрепить файл</span>
                    </button>

                    <button
                      type="submit"
                      className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Создать запрос
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {isModalOpen && currentRequest && (
            <div id="requestModal" style={modalStyle}>
              <div style={modalContentStyle}>
                <h3>Заявка: {currentRequest.request_id}</h3>
                <div className="space-y-2">
                  <p>
                    <strong>Дата:</strong> {currentRequest.send_date}
                  </p>
                  <p>
                    <strong>Отправитель:</strong> {currentRequest.sender_fullname}
                  </p>
                  <p>
                    <strong>Должность:</strong> {currentRequest.sender_job_title}
                  </p>
                  <p>
                    <strong>Отдел:</strong> {currentRequest.sender_depart}
                  </p>
                  <p>
                    <strong>Email:</strong> {currentRequest.sender_email}
                  </p>
                  <p>
                    <strong>Телефон:</strong> {currentRequest.sender_phone}
                  </p>
                  <p>
                    <strong>Тема:</strong> {currentRequest.theme || '–'}
                  </p>
                  <p>
                    <strong>Обработка:</strong> {currentRequest.processing_depart || '–'}
                  </p>
                  <p>
                    <strong>Исполнитель:</strong> {currentRequest.owner_fullname || 'Не назначен'}
                  </p>
                  <p>
                    <strong>Статус:</strong> {currentRequest.status}
                  </p>
                  <p>
                    <strong>Комментарий:</strong> {currentRequest.comment}
                  </p>
                  <div>
                    <strong>Фото:</strong>
                    <div className="flex gap-2 mt-2">
                      {currentRequest.images_path?.length ? (
                        currentRequest.images_path.map((img, idx) => (
                          <img
                            key={idx}
                            src={`http://192.1.66.117:8000/static/images/${img}`}
                            alt="Прикреплённое фото"
                            className="w-64 h-64 object-cover border cursor-pointer"
                            onClick={() =>
                              showImage(currentRequest.comment, currentRequest.images_path, idx)
                            }
                          />
                        ))
                      ) : (
                        <span>Нет фото</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className='g-2'>
                  <button
                    onClick={closeRequestModal}
                    className="mt-4 bg-gray-500 text-white px-4 py-2 rounded"
                  >
                    Закрыть
                  </button>
                  <button
                    onClick={()=>{}}
                    className="mt-4 bg-gray-500 text-white px-4 py-2 rounded"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={()=>{}}
                    className="mt-4 bg-gray-500 text-white px-4 py-2 rounded"
                  >
                    Перенаправить
                  </button>
                </div>
              </div>
            </div>
          )}

          {isImageModalOpen && (
            <div id="imageModal" style={modalStyle}>
              <div style={{ ...modalContentStyle, width: '90%', maxWidth: '800px' }}>
                <h3>Фото</h3>
                <div style={{ position: 'relative', textAlign: 'center' }}>
                  {imageData.images.length > 0 && (
                    <img
                      src={`http://192.1.66.117:8000/static/images/${imageData.images[imageData.index]}`}
                      alt="Увеличенное фото"
                      style={{ maxHeight: '60vh', margin: '0 auto' }}
                    />
                  )}
                  <button
                    onClick={() => changeImage('prev')}
                    disabled={imageData.index === 0}
                    className='absolute left-10 top-1/2 rounded-full -translate-y-1/2 rotate-180 bg-black/50 text-white border-none w-10 h-10 text-2xl cursor-pointer opacity-70 hover:opacity-100 transition-opacity duration-200'
                  >
                    ◄
                  </button>
                  <button
                    onClick={() => changeImage('next')}
                    disabled={imageData.index === imageData.images.length - 1}
                    className='absolute top-1/2 right-10 rounded-full -translate-y-1/2 bg-black/50 text-white border-none w-10 h-10 text-2xl cursor-pointer opacity-70 hover:opacity-100 transition-opacity duration-200'
                  >
                    ►
                  </button>
                </div>
                <p>{imageData.comment}</p>
                <button
                  onClick={closeImageModal}
                  className="mt-4 bg-gray-500 text-white px-4 py-2 rounded"
                >
                  Закрыть
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const modalStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
  background: 'white',
  padding: 20,
  borderRadius: 8,
  width: '80%',
  maxHeight: '80vh',
  overflow: 'auto',
};

const navButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  background: 'rgba(0,0,0,0.5)',
  color: 'white',
  border: 'none',
  width: 40,
  height: 40,
  fontSize: 24,
  cursor: 'pointer',
  opacity: 0.7,
  transition: 'opacity 0.2s',
};