import React, { useRef } from 'react';
import { PaperPlaneRight, Paperclip, Smiley, DotsThreeVertical, Microphone, X, UserCircle, Users } from 'phosphor-react';
import { format, isValid } from 'date-fns';
import { ru } from 'date-fns/locale';
import { marked } from 'marked';
import type { Message, Chat } from '../../types/chat';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';

interface ChatWindowProps {
  activeChat: string | null;
  currentChat: Chat | undefined;
  filteredMessages: Message[];
  isLoadingMessages: boolean;
  hasMoreByChat: { [key: string]: boolean };
  isTyping: boolean;
  typingUser: string;
  username: string | null;
  contactMap: { [key: string]: string };
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  showEmojiPicker: boolean;
  setShowEmojiPicker: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFile: File | null;
  setSelectedFile: React.Dispatch<React.SetStateAction<File | null>>;
  editingMessage: Message | null;
  setEditingMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  isRecording: boolean;
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>;
  showChatOptions: boolean;
  setShowChatOptions: React.Dispatch<React.SetStateAction<boolean>>;
  setShowInviteModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowKickModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLeaveModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  websocket: WebSocket | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleEmojiClick: (emojiData: EmojiClickData) => void;
  startRecording: () => void;
  stopRecording: () => void;
  handleSendMessage: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleTyping: () => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  quoteMessage: (msg: Message) => void;
  startEditMessage: (msg: Message) => void;
  cancelEdit: () => void;
  deleteMessage: (msg: Message) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  activeChat,
  currentChat,
  filteredMessages,
  isLoadingMessages,
  hasMoreByChat,
  isTyping,
  typingUser,
  username,
  contactMap,
  message,
  setMessage,
  showEmojiPicker,
  setShowEmojiPicker,
  selectedFile,
  setSelectedFile,
  editingMessage,
  setEditingMessage,
  isRecording,
  setIsRecording,
  showChatOptions,
  setShowChatOptions,
  setShowInviteModal,
  setShowKickModal,
  setShowLeaveModal,
  setShowDeleteModal,
  websocket,
  connectionStatus,
  handleScroll,
  handleEmojiClick,
  startRecording,
  stopRecording,
  handleSendMessage,
  handleKeyDown,
  handleTyping,
  handleFileChange,
  quoteMessage,
  startEditMessage,
  cancelEdit,
  deleteMessage,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatOptionsRef = useRef<HTMLDivElement>(null);

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp || !isValid(new Date(timestamp))) return 'Неизвестно';
    return format(new Date(timestamp), 'HH:mm', { locale: ru });
  };

  const formatDate = (timestamp: string) => {
    if (!timestamp || !isValid(new Date(timestamp))) return 'Неизвестно';
    const today = new Date();
    const messageDate = new Date(timestamp);
    if (format(today, 'yyyy-MM-dd') === format(messageDate, 'yyyy-MM-dd')) {
      return 'Сегодня';
    }
    if (format(today, 'yyyy-MM-dd') === format(new Date(messageDate.setDate(messageDate.getDate() + 1)), 'yyyy-MM-dd')) {
      return 'Вчера';
    }
    return format(new Date(timestamp), 'dd MMMM yyyy', { locale: ru });
  };

  const renderContent = (content: string) => {
    if (!content) return null;
    return <span dangerouslySetInnerHTML={{ __html: marked.parseInline(content) }} />;
  };

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

  const getMessageActions = (msg: Message) => {
    if (msg.sender === username) {
      return (
        <div className="message-actions absolute right-2 top-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => startEditMessage(msg)} className="text-blue-500 hover:text-blue-700">
            <span className="text-xs">Ред.</span>
          </button>
          <button onClick={() => deleteMessage(msg)} className="text-red-500 hover:text-red-700">
            <span className="text-xs">Уд.</span>
          </button>
        </div>
      );
    }
    return null;
  };

  const renderMessages = () => {
    // Проверка на дубликаты
    const ids = filteredMessages.map(msg => msg.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      console.warn('Найдены дублирующиеся ID:', duplicates);
    }

    // Удаляем дубликаты, сохраняя только первое сообщение с каждым ID
    const uniqueMessages = Array.from(new Map(filteredMessages.map(msg => [msg.id, msg])).values());

    let lastDate = '';
    return uniqueMessages.map((msg) => {
      const messageDate = formatDate(msg.timestamp);
      const showDateHeader = messageDate !== lastDate;
      lastDate = messageDate;
      const isMyMessage = msg.sender === username;
      const messageClass = isMyMessage ? 'bg-indigo-500 text-white self-end' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 self-start';
      return (
        <React.Fragment key={msg.id}>
          {showDateHeader && (
            <div className="text-center my-2">
              <span className="inline-block bg-gray-300 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">{messageDate}</span>
            </div>
          )}
          <div className={`group relative p-2 rounded-lg max-w-xs md:max-w-md my-1 break-words transition-all duration-200 ${messageClass}`}>
            {!isMyMessage && (
              <div className="font-semibold text-sm mb-1">{contactMap[msg.sender] || msg.sender}</div>
            )}
            <div className="text-sm">
              {renderContent(msg.content)}
              {msg.file_url && (
                <div className="mt-2">
                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-200 hover:underline flex items-center">
                    <Paperclip size={16} className="mr-1" />
                    <span>{msg.file_name}</span>
                  </a>
                </div>
              )}
              {msg.edited && <span className="text-xs text-gray-400 ml-2">(ред.)</span>}
            </div>
            <div className={`text-right text-xs mt-1 text-gray-300 ${isMyMessage ? 'text-gray-300' : 'text-gray-500'}`}>
              {formatTimestamp(msg.timestamp)}
            </div>
            {getMessageActions(msg)}
            <div className="absolute top-0 left-0 right-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => quoteMessage(msg)} className="absolute bottom-1 right-1/2 transform translate-x-1/2 bg-gray-500 hover:bg-gray-600 text-white rounded-full p-1 text-xs">
                <PaperPlaneRight size={12} />
              </button>
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  if (!activeChat || !currentChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <div className="text-gray-500 dark:text-gray-400 text-lg">Выберите чат для начала общения</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-gray-100 dark:bg-gray-800">
      <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center">
          <div className="flex-shrink-0 mr-3 text-gray-500 dark:text-gray-400">
            {getChatDisplayIcon(currentChat)}
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{getChatDisplayName(currentChat)}</h2>
            {currentChat.is_channel && (
              <div className="text-sm text-gray-500 dark:text-gray-400">{currentChat.description}</div>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowChatOptions(!showChatOptions)}
            className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <DotsThreeVertical size={24} />
          </button>
          {showChatOptions && (
            <div ref={chatOptionsRef} className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
              {(currentChat.is_group || currentChat.is_channel) && (
                <>
                  <a
                    onClick={() => {
                      setShowInviteModal(true);
                      setShowChatOptions(false);
                    }}
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    Пригласить пользователей
                  </a>
                  {currentChat.creator_username === username && (
                    <a
                      onClick={() => {
                        setShowKickModal(true);
                        setShowChatOptions(false);
                      }}
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      Исключить пользователей
                    </a>
                  )}
                </>
              )}
              <a
                onClick={() => {
                  setShowLeaveModal(true);
                  setShowChatOptions(false);
                }}
                className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                Покинуть чат
              </a>
              {currentChat.creator_username === username && (
                <a
                  onClick={() => {
                    setShowDeleteModal(true);
                    setShowChatOptions(false);
                  }}
                  className="block px-4 py-2 text-sm text-red-600 hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer"
                >
                  Удалить чат
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-2 messages-container" onScroll={handleScroll}>
        {hasMoreByChat[activeChat] && isLoadingMessages && (
          <div className="text-center text-gray-500">Загрузка старых сообщений...</div>
        )}
        {renderMessages()}
        <div ref={messagesEndRef} />
      </div>
      {isTyping && typingUser !== username && (
        <div className="p-2 text-sm text-gray-500 dark:text-gray-400">
          {contactMap[typingUser] || typingUser} печатает...
        </div>
      )}
      <div className="p-4 border-t border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900 relative">
        {showEmojiPicker && (
          <div className="absolute bottom-16 left-0 z-10">
            <EmojiPicker onEmojiClick={handleEmojiClick} />
          </div>
        )}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Smiley size={24} />
          </button>
          <label className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer">
            <Paperclip size={24} />
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTyping}
            placeholder={editingMessage ? 'Редактировать сообщение...' : 'Напишите сообщение...'}
            className="flex-1 px-4 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            ref={inputRef}
          />
          {editingMessage ? (
            <button
              onClick={cancelEdit}
              className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          ) : (
            <button
              onClick={handleSendMessage}
              className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <PaperPlaneRight size={24} />
            </button>
          )}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`p-2 rounded-full ${isRecording ? 'bg-red-600' : 'bg-gray-200 dark:bg-gray-700'} text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors`}
          >
            <Microphone size={24} color={isRecording ? 'white' : 'currentColor'} />
          </button>
        </div>
        {selectedFile && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 flex items-center">
            <Paperclip size={16} className="mr-1" />
            <span>Выбран файл: {selectedFile.name}</span>
            <button onClick={() => setSelectedFile(null)} className="ml-2 text-red-500 hover:text-red-700">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;