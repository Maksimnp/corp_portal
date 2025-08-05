export interface User {
  username: string;
  full_name: string;
  profile_image?: string;
}

export interface Channel {
  id: string;
  name: string;
  is_private: boolean;
  members: User[];
  created_by: string;
  last_message?: {
    content: string;
    timestamp: string;
  };
  unread_count: number;
  notifications_enabled: boolean;
}

export interface Message {
  id: string;
  channel_id: string;
  sender: User;
  content: string;
  timestamp: string;
  is_file: boolean;
  file_url?: string;
}