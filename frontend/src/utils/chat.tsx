import type { Chat, Message } from '../types/chat';
import { DotsThreeVertical, UserCircle, Users } from 'phosphor-react';
import { ru } from 'date-fns/locale';
import { format, isToday, isThisWeek, isSameYear } from 'date-fns';
import { FileOutlined } from '@ant-design/icons';

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tiff']);

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

export const formatTimestampSidebar = (timestamp: string | undefined): string | null => {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();

  if (isToday(date)) {
    return format(date, 'HH:mm', { locale: ru });
  }

  if (isThisWeek(date, { weekStartsOn: 1 })) {
    return format(date, 'EEEE', { locale: ru });
  }

  if (isSameYear(date, now)) {
    return format(date, 'd MMMM', { locale: ru });
  }

  return format(date, 'd MMMM yyyy', { locale: ru });
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

export const normalizeMessages = (data: any[]): Message[] => {
  return data.map(msg => ({
    ...msg,
    id: String(msg.id),
    is_read: Boolean(msg.is_read),
    timestamp: typeof msg.timestamp === 'string' 
      ? msg.timestamp 
      : new Date(msg.timestamp).toISOString(),
    file_url: msg.file_url,
    file_name: msg.file_name,
    edited: Boolean(msg.edited),
  })).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
};

const FILE_ICONS: Record<string, string> = {
  pdf: 'pdf.png',
  doc: 'doc.png',
  docx: 'docx.png',
  xls: 'xls.png',
  xlsx: 'xlsx.png',
  txt: 'txt.png',
  zip: 'zip.png',
  rar: 'rar.png',
  ppt: 'ppt.png',
  pptx: 'pptx.png',
};

export const getFileIcon = (fileName: string | undefined, size: number) => {
  if (!fileName) {
    return <FileOutlined style={{ fontSize: `${size}px` }} />;
  }

  const parts = fileName.split('.');
  const extension = parts.length > 1 ? parts.pop()?.toLowerCase() : null;

  if (!extension || !FILE_ICONS[extension]) {
    return <FileOutlined style={{ fontSize: '40px' }} />;
  }

  const iconPath = `${API_BASE}/static/icons/${FILE_ICONS[extension]}`;
  return (
    <img
      src={iconPath}
      alt={`${extension} file`}
      className="rounded-lg max-h-12 object-contain"
    />
  );
};

export const messageIsPhoto = (msg: Message): boolean => {
  const url = msg.file_url;
  if (!url) return false;

  const lowerUrl = url.toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (lowerUrl.endsWith(ext)) {
      return true;
    }
  }
  return false;
};