import React, { useState, useEffect, useCallback } from 'react';
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
  const [requests, setRequests] = useState<Request[]>([]);
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSortField, setCurrentSortField] = useState<string | null>(null);
  const [currentSortOrder, setCurrentSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentRequest, setCurrentRequest] = useState<Request | null>(null);
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
      const response = await fetch('http://192.1.66.117:8000/request_list/get_requests', {
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

  const closeRequestModal = () => {
    setIsModalOpen(false);
    setCurrentRequest(null);
  };

  const showImage = (imageUrl: string, comment: string, imagesPath: string[] | null, index: number) => {
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
                  onClick={() => sortTable('request_id')}
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
                  onClick={() => sortTable('theme')}
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
                            src={`http://192.1.66.117:8000${img}`}
                            alt="Прикреплённое фото"
                            className="w-20 h-20 object-cover border cursor-pointer"
                            onClick={() =>
                              showImage(img, currentRequest.comment, currentRequest.images_path, idx)
                            }
                          />
                        ))
                      ) : (
                        <span>Нет фото</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={closeRequestModal}
                  className="mt-4 bg-gray-500 text-white px-4 py-2 rounded"
                >
                  Закрыть
                </button>
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
                      src={`http://192.1.66.117:8000${imageData.images[imageData.index]}`}
                      alt="Увеличенное фото"
                      style={{ maxHeight: '60vh', margin: '0 auto' }}
                    />
                  )}
                  <button
                    onClick={() => changeImage('prev')}
                    disabled={imageData.index === 0}
                    style={{
                      ...navButtonStyle,
                      left: 10,
                      transform: 'translateY(-50%) rotate(180deg)',
                    }}
                  >
                    ◄
                  </button>
                  <button
                    onClick={() => changeImage('next')}
                    disabled={imageData.index === imageData.images.length - 1}
                    style={{
                      ...navButtonStyle,
                      right: 10,
                      transform: 'translateY(-50%)',
                    }}
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