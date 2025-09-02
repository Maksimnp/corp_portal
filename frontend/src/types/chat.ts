// src/types/chat.ts
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
}

interface Chat {
  id: string;
  name: string | null;
  description: string | null;
  is_group: boolean;
  is_channel: boolean;
  creator_username: string;
  members: string[];
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

// Export all interfaces
export type { Message, Chat, Contact };