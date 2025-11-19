// utils/backgroundChatCache.ts
const BACKGROUND_CACHE_PREFIX = 'background:';
const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://192.1.66.117:8000';

export const getBackgroundChatData = (bcgID: string): string | null => {
  const cached = localStorage.getItem(`${BACKGROUND_CACHE_PREFIX}${bcgID}`);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return parsed.background || null;
    } catch (e) {
      return cached;
    }
  }
  return null;
};

export const setBackgroundChatData = (bcgID: string, base64: string): void => {
  localStorage.setItem(`${BACKGROUND_CACHE_PREFIX}${bcgID}`, base64);
};

export const clearAllBackgrounds = () => {
  Object.keys(localStorage)
    .filter(key => key.startsWith(BACKGROUND_CACHE_PREFIX))
    .forEach(key => localStorage.removeItem(key));
};

export const fetchBackgroundChatData = async (bcgID: string): Promise<string | null> => {
  const cached = getBackgroundChatData(bcgID);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(`${API_BASE}/api/users/backgrounds/${bcgID}`);
    if (!response.ok) {
      throw new Error(`Ошибка при загрузке фона: ${response.status}`);
    }

    const base64 = await response.text();

    setBackgroundChatData(bcgID, base64);

    return base64;
  } catch (error) {
    console.error('Не удалось загрузить фон:', error);
    return null;
  }
}