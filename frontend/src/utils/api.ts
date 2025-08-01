// src/utils/api.ts
export const apiFetch = async (
  url: string,
  options: RequestInit = {},
  navigate: (path: string, options?: { replace?: boolean }) => void
) => {
  const token = localStorage.getItem('token');
  if (!token) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    navigate('/', { replace: true });
    throw new Error('Токен аутентификации не найден.');
  }

  const headers = {
    ...options.headers,
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    const response = await fetch(url, { ...options, headers });
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
        navigate('/login', { replace: true });
        errorMessage = 'Сессия истекла. Перенаправление на страницу входа...';
      } else if (response.status === 403) {
        errorMessage = 'Доступ запрещен.';
      } else if (response.status === 500) {
        errorMessage = 'Внутренняя ошибка сервера. Попробуйте позже.';
      } else if (errorDetail) {
        errorMessage = `Ошибка: ${errorDetail}`;
      }

      throw new Error(errorMessage);
    }

    return response;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('Не удалось подключиться к серверу. Проверьте сетевое соединение и доступность сервера.');
    }
    throw err;
  }
};