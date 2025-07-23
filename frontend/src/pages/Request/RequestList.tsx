import React, { useState, useEffect, useCallback } from 'react';

// === Типы ===
// Определяем структуру одной заявки
interface Request {
  send_date: string; // Дата отправки заявки
  request_id: string; // Уникальный идентификатор заявки
  sender_fullname: string; // Полное имя отправителя
  theme: string | null; // Тема заявки (может быть пустой)
  owner: string | null; // Логин исполнителя (может быть пустым)
  owner_fullname: string | null; // Полное имя исполнителя (может быть пустым)
  processing_depart: string | null; // Отдел, который обрабатывает заявку
  status: 'не просмотрено' | 'в обработке' | 'завершено'; // Статус заявки
  sender_job_title: string; // Должность отправителя
  sender_depart: string; // Отдел отправителя
  sender_email: string; // Email отправителя
  sender_phone: string; // Телефон отправителя
  comment: string; // Комментарий к заявке
  images_path: string[] | null; // Путь к изображениям (массив или null)
}

// Определяем структуру ответа от API
interface ApiResponse<T> {
  status: 'success' | 'error'; // Статус ответа (успех или ошибка)
  data?: T; // Данные, если успех
  message?: string; // Сообщение об ошибке, если есть
}

// === Компонент ===
export const RequestList: React.FC = () => {
  const ITEMS_PER_PAGE = 10; // Количество заявок на одной странице

  // Состояния компонента
  const [requests, setRequests] = useState<Request[]>([]); // Список отображаемых заявок
  const [allRequests, setAllRequests] = useState<Request[]>([]); // Все заявки для сброса поиска
  const [currentPage, setCurrentPage] = useState(1); // Текущая страница пагинации
  const [currentSortField, setCurrentSortField] = useState<keyof Request | null>(null); // Поле для сортировки
  const [currentSortOrder, setCurrentSortOrder] = useState<'asc' | 'desc'>('asc'); // Направление сортировки
  const [currentRequest, setCurrentRequest] = useState<Request | null>(null); // Текущая выбранная заявка
  const [isModalOpen, setIsModalOpen] = useState(false); // Открыт ли модал с деталями заявки
  const [isImageModalOpen, setIsImageModalOpen] = useState(false); // Открыт ли модал с изображением
  const [imageData, setImageData] = useState<{
    images: string[]; // Массив путей к изображениям
    index: number; // Индекс текущего изображения
    comment: string; // Комментарий к изображению
  }>({ images: [], index: 0, comment: '' }); // Данные для модала с изображением
  const [searchQuery, setSearchQuery] = useState(''); // Текст для поиска
  const [toastMessage, setToastMessage] = useState<string | null>(null); // Сообщение для уведомления

  const token = localStorage.getItem('token'); // Токен авторизации из localStorage

  // Функция для показа уведомления
  const showToast = (message: string) => {
    setToastMessage(message); // Устанавливаем сообщение
    setTimeout(() => setToastMessage(null), 4000); // Скрываем через 4 секунды
  };

  // Функция загрузки всех заявок с сервера
  const loadRequests = useCallback(async () => {
    try {
      const response = await fetch('http://192.1.66.117:8000/request_list/get_requests', {
        headers: {
          Authorization: `Bearer ${token}`, // Добавляем токен для авторизации
        },
      });
      if (!response.ok) {
        throw new Error(`Ошибка HTTP: ${response.status}`);
      }
      const result: ApiResponse<Request[]> = await response.json();
      if (result.status === 'success') {
        setRequests(result.data || []); // Обновляем список заявок
        setAllRequests(result.data || []); // Сохраняем все заявки
      } else {
        showToast(result.message || 'Ошибка загрузки данных'); // Показываем ошибку
      }
    } catch (err) {
      console.error(err); // Логируем ошибку
      showToast('Не удалось подключиться к серверу'); // Уведомляем пользователя
    }
  }, [token]);

  useEffect(() => {
    loadRequests(); // Загружаем заявки при монтировании компонента
  }, [loadRequests]);

  

  // Функция сортировки таблицы
  const sortTable = async (field: keyof Request) => {
    let newOrder: 'asc' | 'desc' = currentSortField === field && currentSortOrder === 'asc' ? 'desc' : 'asc';
    setCurrentSortField(field); // Устанавливаем поле сортировки
    setCurrentSortOrder(newOrder); // Устанавливаем направление

    try {
      const response = await fetch(`http://192.1.66.117:8000/request_list/sort_requests?field=${field}&order=${newOrder}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const result: ApiResponse<Request[]> = await response.json();
        if (result.status === 'success') {
          setRequests(result.data || []); // Обновляем список после сортировки
          setCurrentPage(1); // Сбрасываем на первую страницу
        }
      }
    } catch (err) {
      console.error(err); // Логируем ошибку
      showToast('Ошибка сортировки'); // Уведомляем пользователя
    }
  };

  // Поиск по ID с задержкой
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timer = setTimeout(async () => {
        try {
          const response = await fetch(`http://192.1.66.117:8000/request_list/search_request_id?query=${searchQuery}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const data = await response.json();
          if (data.status === 'success' && Array.isArray(data.data)) {
            setRequests(data.data); // Обновляем список по результатам поиска
            setCurrentPage(1); // Сбрасываем на первую страницу
          } else {
            setRequests([]); // Очищаем, если ничего не найдено
          }
        } catch (err) {
          showToast('Ошибка поиска'); // Уведомляем об ошибке
        }
      }, 300); // Задержка в 300 мс
      return () => clearTimeout(timer); // Очищаем таймер при размонтировании
    } else {
      setRequests(allRequests); // Возвращаем все заявки, если поиск короче 2 символов
    }
  }, [searchQuery, allRequests, token]);

  // Пагинация
  const totalPages = Math.ceil(requests.length / ITEMS_PER_PAGE); // Общее количество страниц
  const paginatedRequests = requests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  ); // Заявки для текущей страницы

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return; // Проверка границ
    setCurrentPage(page); // Переход на выбранную страницу
  };

  // Открытие модального окна с деталями заявки
  const openRequestModal = (request: Request) => {
    setCurrentRequest(request); // Сохраняем выбранную заявку
    setIsModalOpen(true); // Открываем модал
  };

  const closeRequestModal = () => {
    setIsModalOpen(false); // Закрываем модал
    setCurrentRequest(null); // Сбрасываем текущую заявку
  };

  // Открытие изображения
  const showImage = (imageUrl: string, comment: string, imagesPath: string[] | null, index: number) => {
    const paths = Array.isArray(imagesPath) ? imagesPath : []; // Преобразуем в массив
    setImageData({ images: paths, index, comment }); // Устанавливаем данные для модала
    setIsImageModalOpen(true); // Открываем модал с изображением
  };

  const closeImageModal = () => {
    setIsImageModalOpen(false); // Закрываем модал с изображением
    setImageData({ images: [], index: 0, comment: '' }); // Сбрасываем данные
  };

  const changeImage = (direction: 'next' | 'prev') => {
    if (!imageData.images.length) return; // Выходим, если изображений нет
    let newIndex = imageData.index;
    if (direction === 'next' && newIndex < imageData.images.length - 1) newIndex++; // Следующее
    if (direction === 'prev' && newIndex > 0) newIndex--; // Предыдущее
    setImageData(prev => ({ ...prev, index: newIndex })); // Обновляем индекс
  };

  

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Уведомление об ошибке или успехе */}
      {toastMessage && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow z-50">
          {toastMessage}
        </div>
      )}

      <h2 className="text-2xl font-bold mb-4">Список заявок</h2>

      {/* Поле для поиска по ID */}
      <input
        type="text"
        placeholder="Поиск по ID..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 p-2 border rounded w-full max-w-xs"
      />

      {/* Таблица с заявками */}
      <table className="min-w-full bg-white border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th onClick={() => sortTable('request_id')} className="cursor-pointer hover:bg-gray-200 p-2 border">
              № заявки
            </th>
            <th onClick={() => sortTable('send_date')} className="cursor-pointer hover:bg-gray-200 p-2 border">
              Дата
            </th>
            <th onClick={() => sortTable('sender_fullname')} className="cursor-pointer hover:bg-gray-200 p-2 border">
              Отправитель
            </th>
            <th onClick={() => sortTable('theme')} className="cursor-pointer hover:bg-gray-200 p-2 border">
              Тема
            </th>
            <th onClick={() => sortTable('processing_depart')} className="cursor-pointer hover:bg-gray-200 p-2 border">
              Отдел
            </th>
            <th onClick={() => sortTable('status')} className="cursor-pointer hover:bg-gray-200 p-2 border">
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
              <td className="p-2 border">{request.theme}</td>
              <td className="p-2 border">{request.processing_depart}</td>
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


      {/* Кнопки для переключения страниц */}
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
            className={`px-3 py-1 border rounded ${currentPage === page ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
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

      {/* Модальное окно: Детали заявки */}
      {isModalOpen && currentRequest && (
        <div id="requestModal" style={modalStyle}>
          <div style={modalContentStyle}>
            <h3>Заявка: {currentRequest.request_id}</h3>
            <div className="space-y-2">
              <p><strong>Дата:</strong> {currentRequest.send_date}</p>
              <p><strong>Отправитель:</strong> {currentRequest.sender_fullname}</p>
              <p><strong>Должность:</strong> {currentRequest.sender_job_title}</p>
              <p><strong>Отдел:</strong> {currentRequest.sender_depart}</p>
              <p><strong>Email:</strong> {currentRequest.sender_email}</p>
              <p><strong>Телефон:</strong> {currentRequest.sender_phone}</p>
              <p><strong>Тема:</strong> {currentRequest.theme}</p>
              <p><strong>Обработка:</strong> {currentRequest.processing_depart}</p>
              <p><strong>Исполнитель:</strong> {currentRequest.owner_fullname || 'Не назначен'}</p>
              <p><strong>Статус:</strong> {currentRequest.status}</p>
              <p><strong>Комментарий:</strong> {currentRequest.comment}</p>
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
            <button onClick={closeRequestModal} className="mt-4 bg-gray-500 text-white px-4 py-2 rounded">
              Закрыть
            </button>
          </div>
        </div>
      )}


      {/* Модальное окно: Изображение */}
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
            <button onClick={closeImageModal} className="mt-4 bg-gray-500 text-white px-4 py-2 rounded">
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Стили
const modalStyle: React.CSSProperties = {
  position: 'fixed', // Фиксируем модальное окно на экране
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0,0,0,0.5)', // Полупрозрачный фон
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000, // Показываем поверх всего
};

const modalContentStyle: React.CSSProperties = {
  background: 'white', // Белый фон содержимого
  padding: 20, // Отступы внутри
  borderRadius: 8, // Скругленные углы
  width: '80%', // Ширина модала
  maxHeight: '80vh', // Максимальная высота
  overflow: 'auto', // Скролл, если контент большой
};

const navButtonStyle: React.CSSProperties = {
  position: 'absolute', // Позиция относительно изображения
  top: '50%',
  background: 'rgba(0,0,0,0.5)', // Полупрозрачный фон
  color: 'white', // Белый текст
  border: 'none', // Без обводки
  width: 40, // Ширина кнопки
  height: 40, // Высота кнопки
  fontSize: 24, // Размер стрелки
  cursor: 'pointer', // Курсор при наведении
  opacity: 0.7, // Прозрачность
  transition: 'opacity 0.2s', // Плавное изменение прозрачности
};
