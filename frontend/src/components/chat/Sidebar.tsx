import React, { useRef, useEffect } from 'react';
import { Plus, MagnifyingGlass, Users, UserCircle, DotsThreeVertical } from 'phosphor-react';
import type { Chat, Message } from '../../types/chat';

interface SidebarProps {
  chats: Chat[];
  activeChat: string | null;
  setActiveChat: (chatId: string | null) => void;
  isLoadingChats: boolean;
  contactMap: { [key: string]: string };
  username: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showCreateOptions: boolean;
  setShowCreateOptions: (show: boolean) => void;
  setShowContactSearch: (show: boolean) => void;
  setShowCreateGroup: (show: boolean) => void;
  setShowCreateChannel: (show: boolean) => void;
  unreadCounts: { [key: string]: number };
  messagesByChat: { [key: string]: Message[] };
}

const Sidebar: React.FC<SidebarProps> = ({
  chats,
  activeChat,
  setActiveChat,
  isLoadingChats,
  contactMap,
  username,
  searchQuery,
  setSearchQuery,
  showCreateOptions,
  setShowCreateOptions,
  setShowContactSearch,
  setShowCreateGroup,
  setShowCreateChannel,
  unreadCounts,
  messagesByChat,
}) => {
  const createOptionsRef = useRef<HTMLDivElement>(null);

  const getChatDisplayName = (chat: Chat) => {
    if (chat.is_group || chat.is_channel) {
      return chat.name || `Чат ${chat.id.slice(0, 4)}`;
    }
    const otherMember = chat.members.find(m => m !== username);
    return otherMember ? contactMap[otherMember] || otherMember : 'Личный чат';
  };

  const getChatDisplayIcon = (chat: Chat) => {
    if (chat.is_group) return <Users size={20} />;
    if (chat.is_channel) return <DotsThreeVertical size={20} />;
    return <UserCircle size={20} />;
  };

  const filteredChats = chats.filter(chat => {
    const chatName = chat.is_group || chat.is_channel ? chat.name?.toLowerCase() : contactMap[chat.members.find(m => m !== username)!]?.toLowerCase() || 'личный чат';
    return chatName?.includes(searchQuery.toLowerCase());
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (createOptionsRef.current && !createOptionsRef.current.contains(event.target as Node)) {
        setShowCreateOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setShowCreateOptions]);

  return (
    <div className="flex flex-col w-full md:w-1/3 border-r border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Чаты</h2>
        <div className="relative">
          <button onClick={() => setShowCreateOptions(true)} className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <Plus size={24} />
          </button>
          <div ref={createOptionsRef} className={`absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10 ${!showCreateOptions ? 'hidden' : ''}`}>
            <a onClick={() => { setShowContactSearch(true); setShowCreateOptions(false); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
              Новый личный чат
            </a>
            <a onClick={() => { setShowCreateGroup(true); setShowCreateOptions(false); setShowContactSearch(true); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
              Новая группа
            </a>
            <a onClick={() => { setShowCreateChannel(true); setShowCreateOptions(false); }} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
              Новый канал
            </a>
          </div>
        </div>
      </div>
      <div className="p-4 border-b border-gray-300 dark:border-gray-800">
        <div className="relative">
          <MagnifyingGlass size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск чатов..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoadingChats ? (
          <div className="p-4 text-center text-gray-500">Загрузка чатов...</div>
        ) : filteredChats.length > 0 ? (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveChat(chat.id)}
              className={`flex items-center p-4 border-b border-gray-300 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${activeChat === chat.id ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
            >
              <div className="flex-shrink-0 mr-3 text-gray-500 dark:text-gray-400">
                {getChatDisplayIcon(chat)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{getChatDisplayName(chat)}</div>
                  {unreadCounts[chat.id] > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
                      {unreadCounts[chat.id]}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {messagesByChat[chat.id] && messagesByChat[chat.id].length > 0
                    ? messagesByChat[chat.id][messagesByChat[chat.id].length - 1].content?.split('\n')[0] || 'Новый файл'
                    : 'Нет сообщений'}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-gray-500">Нет чатов.</div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;