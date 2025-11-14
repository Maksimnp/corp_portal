// utils/avatarCache.ts
const AVATAR_CACHE_PREFIX = 'avatar:';

export const getAvatarData = (userId: string): string | null => {
  return localStorage.getItem(`${AVATAR_CACHE_PREFIX}${userId}`);
};

export const setAvatarData = (userId: string, base64: string): void => {
  localStorage.setItem(`${AVATAR_CACHE_PREFIX}${userId}`, base64);
};

// Опционально: очистка при логауте
export const clearAllAvatars = () => {
  Object.keys(localStorage)
    .filter(key => key.startsWith(AVATAR_CACHE_PREFIX))
    .forEach(key => localStorage.removeItem(key));
};