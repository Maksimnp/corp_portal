import React, { useEffect, useState } from "react";
import { PaperPlaneRight, Paperclip, Smiley, DotsThreeVertical, X, Microphone, Sticker, Plus, Trash, UserCircle, ArrowLeft, Sun, Moon, MagnifyingGlass, Phone, VideoCamera } from 'phosphor-react';
import type { Chat, Message, Contact, MessageContextMenuState, UserContextMenuState } from '../../types/chat';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { getChatDisplayIcon, getChatDisplayName, getTypingText } from '../../utils/chat';
import RenderEditingMessage from "./EditingMessage";
import RenderQuotedMessage from "./QuotedMessage";
import RenderMessages from "./Messages";
import RenderContextMenu from "./ContextMenu";
import RenderChatInfoSidebar from "./ChatInfoSidebar";
import RenderUserContextMenu from "./UserContextMenu";
import { useTheme } from '../../hooks/ThemeContext';
import type { BlobOptions } from "buffer";
import { Link } from "react-router-dom";

const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Веб-ресурс со стикерами (Tenor)
const stickerPacks = {
  animals: [
    'https://media.tenor.com/AAhV8e7Q8eQAAAAC/cat.gif',
    'https://media.tenor.com/7gJ7x1z5z6QAAAAC/dog.gif',
    'https://media.tenor.com/r2Zx9X4z2Y4AAAAC/rabbit.gif',
    'https://media.tenor.com/8y6z3Xz9X2gAAAAC/bear.gif',
  ],
  emotions: [
    'https://media.tenor.com/3q4z7Xz5z6QAAAAC/happy.gif',
    'https://media.tenor.com/9y6z3Xz5z6QAAAAC/sad.gif',
    'https://media.tenor.com/2q4z7Xz5z6QAAAAC/laughing.gif',
    'https://media.tenor.com/1y6z3Xz5z6QAAAAC/angry.gif',
  ],
  objects: [
    'https://media.tenor.com/4q4z7Xz5z6QAAAAC/heart.gif',
    'https://media.tenor.com/5y6z3Xz5z6QAAAAC/star.gif',
    'https://media.tenor.com/6y6z3Xz5z6QAAAAC/cloud.gif',
    'https://media.tenor.com/7y6z3Xz5z6QAAAAC/fire.gif',
  ]
};

interface RenderChatWindowProps {
    activeChat: string | null;
    currentChat: Chat | undefined;
    showChatInfoSidebar: boolean;
    typingUsers: Map<string, Set<string>>;
    username: string | null;
    userStatuses: { [username: string]: string };
    showChatOptions: boolean;
    setShowChatOptions: React.Dispatch<React.SetStateAction<boolean>>;
    setShowInviteModal: React.Dispatch<React.SetStateAction<boolean>>;
    setShowKickModal: React.Dispatch<React.SetStateAction<boolean>>;
    setShowLeaveModal: React.Dispatch<React.SetStateAction<boolean>>;
    setShowDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
    showStickerPicker: boolean;
    isLoadingMessages: boolean;
    setShowStickerPicker: React.Dispatch<React.SetStateAction<boolean>>;
    chatOptionsRef: React.RefObject<HTMLDivElement | null>;
    hasMoreByChat: { [key: string]: boolean };
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    stickerPickerRef: React.RefObject<HTMLDivElement | null>;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    message: string;
    setMessage: React.Dispatch<React.SetStateAction<string>>;
    selectedFile: File | null;
    setSelectedFile: React.Dispatch<React.SetStateAction<File | null>>;
    setShowDeleteMessageModal: React.Dispatch<React.SetStateAction<boolean>>;
    setMessageToDelete: React.Dispatch<React.SetStateAction<Message | null>>;
    messageToDelete: Message | null;
    showDeleteMessageModal: boolean;
    isRecording: boolean;
    inputRef: React.RefObject<HTMLInputElement | null>;
    editingMessage: Message | null;
    cancelEdit: () => void;
    handleSendMessage: () => Promise<void>;
    handleTyping: () => void;
    handleStickerClick: (stickerUrl: string) => void;
    handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
    isSidebarVisible: boolean;
    setIsSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>;
    setShowChatInfoSidebar: React.Dispatch<React.SetStateAction<boolean>>;
    contactMap: { [key: string]: string };
    cancelQuote: () => void;
    quotedMessage: Message | null;
    filteredMessages: Message[];
    quotedMessageData: Record<string, Message | null>;
    handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
    fetchQuotedMessageData: (id: string) => Promise<Message | null>;
    messageContextMenu: MessageContextMenuState;
    messageContextMenuRef: React.RefObject<HTMLDivElement | null>;
    handleContextMenuEdit: () => void;
    handleContextMenuDelete: () => void;
    handleContextMenuCopy: () => void;
    handleContextMenuQuote: () => void;
    openEditChatModal: () => void;
    handleUserContextMenu: (event: React.MouseEvent, userId: string) => void;
    leaveChat: (chatId: string) => Promise<void>;
    userContextMenu: UserContextMenuState;
    userContextMenuRef: React.RefObject<HTMLDivElement | null>;
    handleContextMenuSendMessage: () => void;
    stopRecording: () => void;
    startRecording: () => Promise<void>;
    confirmDeleteMessage: () => Promise<void>;
    isEditModalVisible: boolean;
    closeEditModal: () => void;
    showEditChatModal: boolean;
    editChatName: string;
    setEditChatName: React.Dispatch<React.SetStateAction<string>>;
    editChatDescription: string;
    setEditChatDescription: React.Dispatch<React.SetStateAction<string>>;
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
    setShowEditChatModal: React.Dispatch<React.SetStateAction<boolean>>;
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const RenderChatWindow: React.FC<RenderChatWindowProps> = ({
    activeChat,
    currentChat,
    showChatInfoSidebar,
    typingUsers,
    username,
    userStatuses = {},
    showChatOptions,
    setShowChatOptions,
    setShowInviteModal,
    setShowKickModal,
    setShowLeaveModal,
    setShowDeleteModal,
    showStickerPicker,
    isLoadingMessages,
    setShowStickerPicker,
    chatOptionsRef,
    hasMoreByChat = {},
    messagesEndRef,
    stickerPickerRef,
    fileInputRef,
    message,
    setMessage,
    selectedFile,
    setSelectedFile,
    setShowDeleteMessageModal,
    setMessageToDelete,
    messageToDelete,
    showDeleteMessageModal,
    isRecording,
    inputRef,
    editingMessage,
    cancelEdit,
    handleSendMessage,
    handleTyping,
    handleStickerClick,
    handleScroll,
    isSidebarVisible,
    setIsSidebarVisible,
    setShowChatInfoSidebar,
    contactMap = {},
    quotedMessage,
    cancelQuote,
    filteredMessages = [],
    quotedMessageData = {},
    handleMessageContextMenu,
    fetchQuotedMessageData,
    messageContextMenu,
    messageContextMenuRef,
    handleContextMenuEdit,
    handleContextMenuDelete,
    handleContextMenuCopy,
    handleContextMenuQuote,
    openEditChatModal,
    handleUserContextMenu,
    leaveChat,
    userContextMenu,
    userContextMenuRef,
    handleContextMenuSendMessage,
    stopRecording,
    startRecording,
    confirmDeleteMessage,
    isEditModalVisible,
    closeEditModal,
    showEditChatModal,
    editChatName,
    setEditChatName,
    editChatDescription,
    setEditChatDescription,
    setChats,
    setShowEditChatModal,
    searchQuery,
    setSearchQuery,
    setShowImageModal
}) => {
  const { theme, toggleTheme } = useTheme();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  // Прокрутка к последнему сообщению без анимации
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ block: 'end' });
    }
  }, [activeChat, filteredMessages, messagesEndRef]);

  if (!activeChat || !currentChat) {
    return (
      <div className={`flex-1 flex items-center justify-center font-sans ${theme === 'light' ? 'bg-gradient-to-br from-slate-50 to-blue-50' : 'bg-gradient-to-br from-slate-900 to-slate-800'} transition-colors duration-300`}>
        <div className="text-center max-w-md mx-4">
          <div className="w-32 h-32 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center animate-pulse shadow-lg">
              <PaperPlaneRight size={32} className="text-white" weight="fill" />
            </div>
          </div>
          <h3 className={`text-3xl font-bold font-sans ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'} mb-4`}>
            Выберите чат
          </h3>
          <p className={`text-xl leading-relaxed font-sans ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'} mb-6`}>
            Откройте список чатов и выберите диалог, чтобы начать общение
          </p>
        </div>
      </div>
    );
  }

  // Безопасные значения по умолчанию
  const safeUserStatuses = userStatuses || {};
  const safeContactMap = contactMap || {};
  const safeHasMoreByChat = hasMoreByChat || {};
  const safeFilteredMessages = filteredMessages || [];
  const safeQuotedMessageData = quotedMessageData || {};

  const chatDisplayName = getChatDisplayName(currentChat, "short", safeContactMap, username);
  const isUserOnline = chatDisplayName && safeUserStatuses[chatDisplayName] === "online";
  const isCreator = currentChat?.creator_username === username;
  const isGroupOrChannel = currentChat?.is_group || currentChat?.is_channel;

  const openSidebar = () => {
    if (!isSidebarVisible) {
      setIsSidebarVisible(true);
      setTimeout(() => {
        setShowChatInfoSidebar(true);
      }, 10);
    } else {
      setShowChatInfoSidebar(false);
    }
  };

  const handleLeaveChat = () => {
    setShowLeaveModal(true);
    setShowChatOptions(false);
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
    handleTyping();
  };

  const closeEmojiPicker = () => {
    setShowEmojiPicker(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        console.error('Файл слишком большой (макс. 10 МБ)');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === 'Escape' && editingMessage) {
      e.preventDefault();
      cancelEdit();
    }
    if (e.key === 'Escape' && showEmojiPicker) {
      e.preventDefault();
      closeEmojiPicker();
    }
  };

  return (
    <div className={`relative flex flex-1 font-sans ${theme === 'light' ? 'bg-gradient-to-br from-white to-slate-50' : 'bg-gradient-to-br from-slate-900 to-slate-800'} h-full overflow-hidden transition-colors duration-300`}>
      {/* Main Chat Area */}
      <div className={`flex flex-col flex-1 transition-all duration-500 ease-out ${
        showChatInfoSidebar ? 'mr-96' : 'mr-0'
      }`}>
        {/* Header - Modern Design */}
        <div className={`flex items-center justify-between p-4 border-b ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'} ${theme === 'light' ? 'bg-white/95' : 'bg-slate-900/95'} backdrop-blur-xl shadow-sm relative z-30`}>
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            {/* Chat Avatar and Info */}
            <div 
              className="flex items-center hover:cursor-pointer group flex-1 min-w-0"
              onClick={openSidebar}
            >
              <div className="flex-shrink-0 mr-4 relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 p-0.5 shadow-lg">
                  <div className={`w-full h-full rounded-xl ${theme === 'light' ? 'bg-white' : 'bg-slate-900'} flex items-center justify-center`}>
                    {getChatDisplayIcon(currentChat, 32, theme)}
                  </div>
                </div>
                {isUserOnline && (
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-slate-900"></div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h2 className={`text-lg font-bold font-sans ${theme === 'light' ? 'text-slate-900' : 'text-white'} truncate`}>
                    {getChatDisplayName(currentChat, 'full', safeContactMap, username)}
                  </h2>
                  {currentChat.is_channel && (
                    <span className={`px-2 py-0.5 text-xs font-semibold font-sans ${theme === 'light' ? 'bg-purple-500/20 text-purple-600' : 'text-purple-400'} rounded-full`}>
                      КАНАЛ
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  {typingUsers.get(activeChat) !== undefined && (
                    <div className="flex items-center space-x-2 text-xs font-sans">
                      <div className="flex space-x-1">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                      </div>
                      <span className={`font-medium font-sans ${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`}>{getTypingText(currentChat.is_group, typingUsers.get(activeChat))}</span>
                    </div>
                  )}
                  {typingUsers.get(activeChat) === undefined && (
                    <span className={`text-xs font-sans ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isUserOnline ? 'в сети' : (currentChat.is_group ? `${currentChat.members.length} пользователя`:'не в сети')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center space-x-2">
            <div className={`relative transition-all duration-300 ease-out transform ${showMessageSearch ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full'}`}>
              <MagnifyingGlass size={20} weight="bold" className={`absolute left-4 top-1/2 transform -translate-y-1/2`} />
              <input
                type="text"
                placeholder="Поиск сообщений..."
                className={`w-full max-h-10 pl-12 pr-4 py-4 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-300 text-lg backdrop-blur-sm`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Search Button */}
            <button 
              className={`w-10 h-10 cursor-pointer rounded-xl ${theme === 'light' ? `${showMessageSearch? 'bg-slate-300':'bg-slate-100'} text-slate-600 hover:bg-slate-200` : `${showMessageSearch? 'bg-slate-600':'bg-slate-800'} text-slate-300 hover:bg-slate-700`} transition-all duration-300 flex items-center justify-center`}
              onClick={()=>{setShowMessageSearch(!showMessageSearch)}}
            >
              <MagnifyingGlass size={18} weight="bold" />
            </button>

            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className={`w-10 h-10 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} transition-all duration-300 flex items-center justify-center`}
              title={theme === 'light' ? 'Темная тема' : 'Светлая тема'}
            >
              {theme === 'light' ? <Moon size={18} weight="regular" /> : <Sun size={18} weight="regular" />}
            </button>
            {/* Chat Options */}
            <div className="relative">
              <button 
                onClick={() => setShowChatOptions(!showChatOptions)} 
                className={`w-10 h-10 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} transition-all duration-300 flex items-center justify-center`}
              >
                <DotsThreeVertical size={18} weight="bold" />
              </button>
              
              {showChatOptions && (
                <div 
                  ref={chatOptionsRef} 
                  className={`absolute right-0 top-12 w-64 ${theme === 'light' ? 'bg-white' : 'bg-slate-800'} rounded-2xl shadow-2xl border ${theme === 'light' ? 'border-slate-200/80' : 'border-slate-700/80'} backdrop-blur-2xl z-[100] animate-in fade-in-0 zoom-in-95 origin-top-right`}
                >
                  <div className="p-2">
                    {isGroupOrChannel && (
                      <>
                        <button 
                          onClick={() => { setShowInviteModal(true); setShowChatOptions(false); }} 
                          className={`w-full flex items-center px-3 py-2 text-sm font-sans ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'} ${theme === 'light' ? 'hover:bg-blue-50' : 'hover:bg-blue-500/10'} rounded-xl transition-all duration-200 group`}
                        >
                          <div className={`w-8 h-8 rounded-lg ${theme === 'light' ? 'bg-blue-100' : 'bg-blue-500/20'} flex items-center justify-center mr-3 group-hover:bg-blue-200 group-hover:bg-blue-500/30 transition-colors`}>
                            <Plus size={16} className={`${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`} weight="bold" />
                          </div>
                          <div className="text-left">
                            <div className="font-semibold font-sans">Пригласить</div>
                            <div className={`text-xs font-sans ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Добавить участников</div>
                          </div>
                        </button>
                        {isCreator && (
                          <button 
                            onClick={() => { setShowKickModal(true); setShowChatOptions(false); }} 
                            className={`w-full flex items-center px-3 py-2 text-sm font-sans ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'} ${theme === 'light' ? 'hover:bg-red-50' : 'hover:bg-red-500/10'} rounded-xl transition-all duration-200 group mt-1`}
                          >
                            <div className={`w-8 h-8 rounded-lg ${theme === 'light' ? 'bg-red-100' : 'bg-red-500/20'} flex items-center justify-center mr-3 group-hover:bg-red-200 group-hover:bg-red-500/30 transition-colors`}>
                              <UserCircle size={16} className={`${theme === 'light' ? 'text-red-600' : 'text-red-400'}`} weight="bold" />
                            </div>
                            <div className="text-left">
                              <div className="font-semibold font-sans">Исключить</div>
                              <div className={`text-xs font-sans ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Удалить участников</div>
                            </div>
                          </button>
                        )}
                      </>
                    )}
                    <button 
                      onClick={handleLeaveChat}
                      className={`w-full flex items-center px-3 py-2 text-sm font-sans ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'} ${theme === 'light' ? 'hover:bg-orange-50' : 'hover:bg-orange-500/10'} rounded-xl transition-all duration-200 group mt-1`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${theme === 'light' ? 'bg-orange-100' : 'bg-orange-500/20'} flex items-center justify-center mr-3 group-hover:bg-orange-200 group-hover:bg-orange-500/30 transition-colors`}>
                        <ArrowLeft size={16} className={`${theme === 'light' ? 'text-orange-600' : 'text-orange-400'}`} weight="bold" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold font-sans">Покинуть чат</div>
                        <div className={`text-xs font-sans ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Выйти из диалога</div>
                      </div>
                    </button>
                    {isCreator && (
                      <button 
                        onClick={() => { setShowDeleteModal(true); setShowChatOptions(false); }} 
                        className={`w-full flex items-center px-3 py-2 text-sm font-sans ${theme === 'light' ? 'text-red-600' : 'text-red-400'} ${theme === 'light' ? 'hover:bg-red-50' : 'hover:bg-red-500/10'} rounded-xl transition-all duration-200 group mt-1`}
                      >
                        <div className={`w-8 h-8 rounded-lg ${theme === 'light' ? 'bg-red-100' : 'bg-red-500/20'} flex items-center justify-center mr-3 group-hover:bg-red-200 group-hover:bg-red-500/30 transition-colors`}>
                          <Trash size={16} className={`${theme === 'light' ? 'text-red-600' : 'text-red-400'}`} weight="bold" />
                        </div>
                        <div className="text-left">
                          <div className="font-semibold font-sans">Удалить чат</div>
                          <div className={`text-xs font-sans ${theme === 'light' ? 'text-red-500/80' : 'text-red-500/80'}`}>Удалить навсегда</div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <Link
              to="/dashboard"
              className={`inline-flex text-sm items-center gap-2 px-4 py-2 rounded-lg transition-colors ${theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} shadow-lg`}
            >
              <ArrowLeft size={16} />
              Назад в Dashboard
            </Link>
          </div>
        </div>

        {/* Messages Area - без скроллбара */}
        <div
          className={`flex flex-col flex-1 overflow-y-auto p-4 space-y-4 messages-container relative font-sans no-scrollbar`}
          onScroll={handleScroll}
          style={{
            backgroundImage: currentChat?.font_name ? `url(${VITE_API_BASE_URL}/chat-fonts/${currentChat.font_name})` : 'none',
            backgroundSize: 'auto',
            backgroundRepeat: 'repeat',
            backgroundPosition: 'top left',
            backgroundAttachment: 'fixed',
            scrollbarWidth: 'none', /* Для Firefox */
            msOverflowStyle: 'none', /* Для IE/Edge */
          }}
        >
          {safeHasMoreByChat[activeChat] && isLoadingMessages && (
            <div className="flex justify-center py-4">
              <div className={`w-6 h-6 border-2 ${theme === 'light' ? 'border-slate-300' : 'border-slate-600'} border-t-blue-500 rounded-full animate-spin`}></div>
            </div>
          )}
          
          <RenderMessages
            filteredMessages={safeFilteredMessages}
            quotedMessageData={safeQuotedMessageData}
            contactMap={safeContactMap}
            handleMessageContextMenu={handleMessageContextMenu}
            fetchQuotedMessageData={fetchQuotedMessageData}
            username={username}
            setShowImageModal={setShowImageModal}
          />
          <div ref={messagesEndRef} />
          
          <RenderContextMenu 
            messageContextMenu={messageContextMenu}
            messageContextMenuRef={messageContextMenuRef}
            handleContextMenuEdit={handleContextMenuEdit}
            handleContextMenuDelete={handleContextMenuDelete}
            handleContextMenuCopy={handleContextMenuCopy}
            handleContextMenuQuote={handleContextMenuQuote}
            username={username}
          />
        </div>

        {/* Input Area */}
        <div className={`p-4 border-t ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'} ${theme === 'light' ? 'bg-white/95' : 'bg-slate-900/95'} backdrop-blur-xl shadow-lg relative z-20 font-sans`}>
          <RenderQuotedMessage 
            quotedMessage={quotedMessage}
            contactMap={safeContactMap}
            cancelQuote={cancelQuote}
          />
          
          <RenderEditingMessage 
            editingMessage={editingMessage}
            cancelEdit={cancelEdit}
          />

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div className="absolute bottom-20 left-4 z-50 animate-in fade-in-0 zoom-in-95">
              <div className={`rounded-2xl shadow-2xl border ${theme === 'light' ? 'border-slate-200/80' : 'border-slate-700/80'} overflow-hidden font-sans`}>
                <div className={`p-3 border-b ${theme === 'light' ? 'border-slate-200/80' : 'border-slate-700/80'} flex justify-between items-center ${theme === 'light' ? 'bg-white' : 'bg-slate-800'}`}>
                  <span className={`text-sm font-semibold font-sans ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                    Выберите смайлики
                  </span>
                  <button 
                    onClick={closeEmojiPicker}
                    className={`w-6 h-6 rounded-lg ${theme === 'light' ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'} transition-colors flex items-center justify-center`}
                  >
                    <X size={14} weight="bold" />
                  </button>
                </div>
                <EmojiPicker 
                  onEmojiClick={handleEmojiClick}
                  width={320}
                  height={360}
                  previewConfig={{ showPreview: false }}
                  skinTonesDisabled
                />
              </div>
            </div>
          )}

          {/* Sticker Picker */}
          {showStickerPicker && (
            <div 
              ref={stickerPickerRef} 
              className={`absolute bottom-20 left-4 z-50 ${theme === 'light' ? 'bg-white' : 'bg-slate-800'} rounded-2xl shadow-2xl border ${theme === 'light' ? 'border-slate-200/80' : 'border-slate-700/80'} p-3 animate-in fade-in-0 zoom-in-95 max-w-sm font-sans`}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className={`text-base font-semibold font-sans ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Стикеры</h3>
                <button 
                  onClick={() => setShowStickerPicker(false)}
                  className={`w-6 h-6 rounded-lg ${theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-colors flex items-center justify-center`}
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
              
              <div className="space-y-3 max-h-80 overflow-y-auto no-scrollbar">
                {Object.entries(stickerPacks).map(([packName, stickers]) => (
                  <div key={packName}>
                    <h4 className={`text-xs font-semibold font-sans ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'} mb-2 capitalize`}>
                      {packName}
                    </h4>
                    <div className="grid grid-cols-4 gap-2">
                      {stickers.map((sticker, index) => (
                        <button 
                          key={index} 
                          onClick={() => handleStickerClick(sticker)} 
                          className={`w-14 h-14 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-300 hover:scale-110 transform border ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-600/60'}`}
                        >
                          <img 
                            src={sticker} 
                            alt={`Sticker ${packName} ${index + 1}`} 
                            className="w-full h-full object-contain p-1"
                            loading="lazy"
                            onError={(e) => {
                              console.error(`Failed to load sticker: ${sticker}`);
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input Controls */}
          <div className="flex items-end space-x-3">
            <div className="flex space-x-1">
              <button 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`w-10 h-10 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:text-blue-500 hover:bg-blue-50' : 'bg-slate-800 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10'} transition-all duration-300 flex items-center justify-center`}
              >
                <Smiley size={20} weight="regular" />
              </button>
              <button 
                onClick={() => setShowStickerPicker(!showStickerPicker)}
                className={`w-10 h-10 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:text-purple-500 hover:bg-purple-50' : 'bg-slate-800 text-slate-400 hover:text-purple-400 hover:bg-purple-500/10'} transition-all duration-300 flex items-center justify-center`}
              >
                <Sticker size={20} weight="regular" />
              </button>
              <label className={`w-10 h-10 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:text-green-500 hover:bg-green-50' : 'bg-slate-800 text-slate-400 hover:text-green-400 hover:bg-blue-500/10'} transition-all duration-300 flex items-center justify-center cursor-pointer`}>
                <Paperclip size={20} weight="regular" />
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            <div className="flex-1 relative">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleTyping}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder={editingMessage ? 'Редактировать сообщение...' : 'Напишите сообщение...'}
                className={`w-full px-4 py-3 rounded-xl font-sans transition-all duration-300 ${
                  theme === 'light' 
                    ? 'bg-slate-100/80 border border-slate-200/60 text-slate-900 placeholder-slate-500 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20' 
                    : 'bg-slate-800/80 border-slate-700/60 text-white placeholder-slate-400 focus:bg-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
                } focus:outline-none backdrop-blur-sm text-base`}
                ref={inputRef}
              />
            </div>

            <div className="flex space-x-2">
              {editingMessage ? (
                <button 
                  onClick={cancelEdit}
                  className="w-12 h-12 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transform"
                >
                  <X size={20} weight="bold" />
                </button>
              ) : (
                <button 
                  onClick={handleSendMessage}
                  disabled={!message.trim() && !selectedFile}
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 transform flex items-center justify-center group ${
                    (!message.trim() && !selectedFile) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <PaperPlaneRight size={20} weight="bold" className="transform group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
              
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-12 h-12 rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transform ${
                  isRecording 
                    ? 'bg-red-500 text-white animate-pulse shadow-red-500/50' 
                    : `${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:text-red-500 hover:bg-red-50' : 'bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-500/10'}`
                }`}
              >
                <Microphone size={20} weight={isRecording ? "fill" : "regular"} />
              </button>
            </div>
          </div>

          {/* Selected File */}
          {selectedFile && (
            <div className={`mt-3 flex items-center justify-between p-3 ${theme === 'light' ? 'bg-blue-50' : 'bg-blue-500/10'} rounded-xl border ${theme === 'light' ? 'border-blue-200/60' : 'border-blue-500/20'} font-sans`}>
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 ${theme === 'light' ? 'bg-blue-100' : 'bg-blue-500/20'} rounded-lg flex items-center justify-center`}>
                  <Paperclip size={16} className={`${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`} />
                </div>
                <div>
                  <div className={`text-sm font-semibold font-sans ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                    {selectedFile.name}
                  </div>
                  <div className={`text-xs font-mono ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedFile(null)}
                className={`w-8 h-8 rounded-lg text-red-500 hover:bg-red-100 ${theme === 'dark' ? 'hover:bg-red-500/10' : ''} transition-colors flex items-center justify-center`}
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          )}
        </div>

        {/* Delete Message Modal */}
        {showDeleteMessageModal && messageToDelete && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in-0 font-sans">
            <div className={`rounded-2xl shadow-2xl p-6 w-full max-w-md border ${theme === 'light' ? 'border-slate-200/80' : 'border-slate-700/80'} animate-in zoom-in-95 ${theme === 'light' ? 'bg-white' : 'bg-slate-800'}`}>
              <div className="text-center mb-4">
                <div className={`w-16 h-16 ${theme === 'light' ? 'bg-red-100' : 'bg-red-500/20'} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                  <Trash size={24} className="text-red-500" weight="bold" />
                </div>
                <h3 className={`text-xl font-bold font-sans ${theme === 'light' ? 'text-slate-900' : 'text-white'} mb-2`}>
                  Удалить сообщение
                </h3>
                <p className={`text-base leading-relaxed font-sans ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                  Это действие нельзя отменить. Сообщение будет удалено навсегда.
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteMessageModal(false);
                    setMessageToDelete(null);
                  }}
                  className={`flex-1 px-4 py-3 rounded-xl font-sans ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDeleteMessage}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all duration-300 font-sans font-semibold shadow-lg hover:shadow-xl"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <RenderChatInfoSidebar
        currentChat={currentChat}
        isSidebarVisible={isSidebarVisible}
        showChatInfoSidebar={showChatInfoSidebar}
        openEditChatModal={openEditChatModal}
        setShowChatInfoSidebar={setShowChatInfoSidebar}
        contactMap={safeContactMap}
        userStatuses={safeUserStatuses}
        handleUserContextMenu={handleUserContextMenu}
        leaveChat={leaveChat}
        isEditModalVisible={isEditModalVisible}
        closeEditModal={closeEditModal}
        showEditChatModal={showEditChatModal}
        editChatName={editChatName}
        setEditChatName={setEditChatName}
        editChatDescription={editChatDescription}
        setEditChatDescription={setEditChatDescription}
        setChats={setChats}
        setShowEditChatModal={setShowEditChatModal}
        username={username}
      />

      <RenderUserContextMenu
        userContextMenu={userContextMenu}
        userContextMenuRef={userContextMenuRef}
        handleContextMenuSendMessage={handleContextMenuSendMessage}
      />
    </div>
  );
};

export default RenderChatWindow;