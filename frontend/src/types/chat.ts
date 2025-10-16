interface Message {
  id: string;
  channel_id: string;
  sender: string;
  content: string;
  timestamp: string;
  is_read: boolean;
  file_url?: string;
  file_name?: string;
  edited?: boolean;
  quoted_message_id: string | null;
  is_notification: boolean;
}

interface LastMessage {
  id: string;
  sender: string;
  content: string | null;
  timestamp: string;
  file_name: string | null;
  is_read: boolean;
  file_url?: string;
}

interface Chat {
  id: string;
  name: string | null;
  description: string | null;
  is_group: boolean;
  is_channel: boolean;
  creator_username: string;
  members: string[];
  unread_count: number;
  last_message?: LastMessage | null;
  font_name: string;
}

interface Contact {
  id: string;
  displayName?: string;
  position?: string;
  department?: string;
  phone_internal?: string;
  phone_city?: string;
  phone_mobile?: string;
  email?: string;
  sam_account_name?: string;
}

interface MessageContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  message: Message | null;
}

interface UserContextMenuState{
  visible: boolean;
  x: number;
  y: number;
  userId: string | null;
}

// Используйте export type для реэкспорта интерфейсов
export type { Message, Chat, Contact, LastMessage, MessageContextMenuState, UserContextMenuState };