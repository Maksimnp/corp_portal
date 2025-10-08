import { useAuth } from '../pages/AuthContext';
import type { Chat, Message, Contact, LastMessage } from '../types/chat';
import { DotsThreeVertical, UserCircle, Users } from 'phosphor-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export const getChatDisplayIcon = (chat: Chat, size: number = 20, theme: string) => {
  if (chat.is_group) return <Users className={`${theme === 'light' ? 'text-black': 'text-white'}`} size={size} />;
  if (chat.is_channel) return <DotsThreeVertical className={`${theme === 'light' ? 'text-black': 'text-white'}`} size={size} />;
  return <UserCircle className={`${theme === 'light' ? 'text-black': 'text-white'}`} size={size} />;
};

export const getChatDisplayName = (chat: Chat, type_name: string, contactMap: {[key: string]: string}, username: string | null): string => {
  if (chat.is_group || chat.is_channel) {
    return chat.name || `Чат ${chat.id.slice(0, 4)}`;
  }
  const otherMember = chat.members.find(m => m !== username) || 'Неизвестный пользователь';
  if (type_name === 'short') {
    return otherMember;
  }
  if (type_name === "full") {
    return otherMember ? contactMap[otherMember] || otherMember : 'Личный чат';
  }
  return 'Неизвестный чат';
};

export const formatDate = (timestamp: string) => {
  const date = new Date(timestamp);
  return format(date, 'dd MMMM yyyy', { locale: ru });
};

export const formatTimestamp = (timestamp: string | undefined) => {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  return format(date, 'HH:mm', { locale: ru });
};

export const getTypingText = (isGroup: boolean, user_set: Set<string> | undefined) => {
  if (!isGroup) return 'Печатает';

  const users = Array.from(user_set!);
  const n = users.length;

  if (n === 1) {
    return `${users[0]} печатает`;
  } else if (n === 2) {
    return `${users[0]} и ${users[1]} печатают`;
  } else {
    return `${users[0]} и ещё ${n - 1} ${n - 1 === 1 ? 'пользователь' : n - 1 < 5 ? 'пользователя' : 'пользователей'} печатают`;
  }
}