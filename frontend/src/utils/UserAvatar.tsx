import { useEffect, useState } from "react";
import { getAvatarData, setAvatarData } from "./avatarCache";
import type { Contact } from "types/chat";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

const UserAvatar: React.FC<{ userId: string; size?: number; mod?: string; theme?: string; contact?: Contact;}> = (
    { 
        userId, 
        size = 50,
        mod,
        theme,
        contact
    }) => {
    const [avatarsData, setAvatarsData] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

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

    useEffect(() => {
      const cached = getAvatarData(userId);
      if (cached) {
        setAvatarsData(cached);
        setLoading(false);
        return;
      }

      const fetchAndCache = async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`${BASE_URL}/api/users/${userId}/avatar`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) throw new Error('Аватар не найден');
          const { avatar } = await res.json();
          if (avatar === null) {
            setAvatarsData(null);
          } else {
            setAvatarData(userId, avatar);
            setAvatarsData(avatar);
          }
        } catch (err) {
          setAvatarsData(null);
        } finally {
          setLoading(false);
        }
      };

      fetchAndCache();
    }, [userId]);

    if (loading) return <div className={`${mod === 'square' ? 'rounded-1' : 'rounded-full'} bg-gray-300 animate-pulse`} style={{ width: size, height: size }} />;
    
    if (!avatarsData && contact) return <div
      className={`rounded-full w-14 h-14 flex items-center justify-center text-xl font-bold shadow-lg ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white' 
          : 'bg-gradient-to-br from-blue-400 to-purple-400 text-white'
      }`}
    >
      {getInitials(contact)}
    </div>

    return <img 
      src={avatarsData || ''} 
      alt="avatar" 
      loading='lazy'
      className={`${mod === 'square' ? 'rounded-1' : 'rounded-full'} object-cover`}
      style={{ width: size, height: size }}
    />;
  };