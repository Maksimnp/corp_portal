import React, { useCallback, useEffect, useState } from "react";
import { PaperPlaneRight, Paperclip, Smiley, DotsThreeVertical, X, Microphone, Sticker, Plus, Heart, Trash, UserCircle, ArrowLeft, MagnifyingGlass, ArrowDown } from 'phosphor-react';
import type { Chat, Message, Contact, MessageContextMenuState, UserContextMenuState } from '../../types/chat';
import TextareaAutosize from 'react-textarea-autosize';
import { IoCheckmarkOutline } from "react-icons/io5";
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { getChatDisplayIcon, getChatDisplayName, getTypingText } from '../../utils/chat';
import RenderEditingMessage from "./EditingMessage";
import RenderQuotedMessage from "./QuotedMessage";
import RenderMessages from "./Messages";
import RenderContextMenu from "./ContextMenu";
import RenderChatInfoSidebar from "./ChatInfoSidebar";
import RenderUserContextMenu from "./UserContextMenu";
import { useTheme } from '../../hooks/ThemeContext';
import { stickerPacks } from '../../data/StickerPacks'
import FileDragModal from './modals/FileDragModal';
import { getAvatarData } from "../../utils/avatarCache";
import RenderForwardMessage from "./ForwardMessage";
import { TbPhotoCog } from "react-icons/tb";
import { fetchBackgroundChatData, getBackgroundChatData } from "../../utils/backgroundChatCache";

interface RenderChatWindowProps {
    forwardMessage: Message | null;
    cancelForward: () => void;
    activeChat: string | null;
    currentChat: Chat | undefined;
    showChatInfoSidebar: boolean;
    typingUsers: Map<string, Set<string>>;
    username: string | null;
    unreadCounts: { [key: string]: number };
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
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
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
    handleMessageContextMenuReaction: (msg: Message) => void;
    fetchQuotedMessageData: (id: string) => Promise<Message | null>;
    messageContextMenu: MessageContextMenuState;
    messageContextMenuRef: React.RefObject<HTMLDivElement | null>;
    handleContextMenuEdit: () => void;
    handleContextMenuDelete: () => void;
    handleContextMenuCopy: () => void;
    handleContextMenuForward: () => void;
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
    messagesContainerRef: React.RefObject<HTMLDivElement | null>;
    isAtBottom: boolean;
    loadMessagesAround: (messageId: string) => Promise<void>;
    setIsAutoScrolling: React.Dispatch<React.SetStateAction<boolean>>;
    setImageUrl: React.Dispatch<React.SetStateAction<Message | null>>;
    searchContacts: (query: string) => Promise<void>;
    showFileDragModal: boolean;
    setShowFileDragModal: React.Dispatch<React.SetStateAction<boolean>>;
    handleReactToMessage: (messageId: string, messageSender: string | undefined, reaction: string) => void;
    userReactions?: Record<string, string>; // Сделал опциональным
    onMessageInView: (messageId: string, channelId: string) => void;
    unreadReactionNotifications: Record<string, string[]>;
    onReactionInView: (messageId: string, channelId: string) => void;
}

const RenderChatWindow: React.FC<RenderChatWindowProps> = ({
    forwardMessage,
    cancelForward,
    activeChat,
    unreadReactionNotifications,
    currentChat,
    onReactionInView,
    showChatInfoSidebar,
    typingUsers,
    username,
    userStatuses = {},
    showChatOptions,
    unreadCounts,
    setShowChatOptions,
    setShowInviteModal,
    setShowKickModal,
    setShowLeaveModal,
    setShowDeleteModal,
    showStickerPicker,
    isLoadingMessages,
    setShowStickerPicker,
    chatOptionsRef,
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
    handleMessageContextMenuReaction,
    fetchQuotedMessageData,
    messageContextMenu,
    messageContextMenuRef,
    handleContextMenuEdit,
    handleContextMenuDelete,
    handleContextMenuCopy,
    handleContextMenuQuote,
    handleContextMenuForward,
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
    setShowImageModal,
    messagesContainerRef,
    isAtBottom,
    loadMessagesAround,
    setIsAutoScrolling,
    setImageUrl,
    searchContacts,
    showFileDragModal,
    setShowFileDragModal,
    handleReactToMessage,
    userReactions = {}, // Значение по умолчанию - пустой объект
    onMessageInView
}) => {
  const { theme, toggleTheme } = useTheme();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  
  const [searchQueryGifs, setSearchQueryGifs] = useState('');
  const [gifResults, setGifResults] = useState<string[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY;
  const backgroundChat = getBackgroundChatData(currentChat?.font_name || 'chat_font_1');

  console.log(currentChat);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!showFileDragModal) {
      setShowFileDragModal(true);
    }
  }, [showFileDragModal]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!showFileDragModal) {
      setShowFileDragModal(true);
    }
  }, [showFileDragModal]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setShowFileDragModal(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setShowFileDragModal(false);

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files[0];

    console.log('Файлы для загрузки:', validFiles);
    setSelectedFile(validFiles);
  }, []);
  
  useEffect(() => {
    console.log('search');
    if (searchQueryGifs.length < 2) {
      setGifResults([]);
      return;
    }

    const fetchGifs = async () => {
      setLoadingGifs(true);
      try {
        const response = await fetch(
          `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchQueryGifs)}&key=${TENOR_API_KEY}&limit=12&media_filter=minimal`
        );
        const data = await response.json();
        // console.log(data);
        const urls = data.results
          .map((item: any) => item.media_formats?.gif?.url || item.media_formats?.mediumgif?.url)
          .filter(Boolean);
        setGifResults(urls);
      } catch (error) {
        console.error('Ошибка загрузки GIF:', error);
        setGifResults([]);
      } finally {
        setLoadingGifs(false);
      }
    };

    const handler = setTimeout(() => {
      fetchGifs();
    }, 400);

    return () => clearTimeout(handler);
  }, [searchQueryGifs]);

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

  const safeUserStatuses = userStatuses || {};
  const safeContactMap = contactMap || {};
  const safeFilteredMessages = filteredMessages || [];
  const safeQuotedMessageData = quotedMessageData || {};
  const safeUserReactions = userReactions || {}; // Добавил безопасный доступ к реакциям

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

  const handlePaste = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    const items = clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          if (file.size > 10 * 1024 * 1024) {
            return;
          }
          setSelectedFile(file);
        }
        break;
      }
    }
  };

  const getCurrentReaction = () => {
    if (!messageContextMenu.message) return undefined;
    return safeUserReactions[messageContextMenu.message.id];
  };

  const scrollToMessage = (messageId: string | null) => {
    if (!messageId) {
      return;
    }
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-gray-200/50', 'dark:bg-yellow-300/30');
      setTimeout(() => {
        element.classList.remove('bg-gray-200/50', 'dark:bg-yellow-400/30');
      }, 1000);
    } else {
      loadMessagesAround(messageId);
      console.info('Цитируемое сообщение не найдено в текущем списке.');
    }
  };

  return (
    <div 
      className={`relative flex flex-1 font-sans ${theme === 'light' ? 'bg-gradient-to-br from-white to-slate-50' : 'bg-gradient-to-br from-slate-900 to-slate-800'} h-full overflow-hidden transition-colors duration-300`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
                    {getAvatarData(getChatDisplayName(currentChat, 'full', safeContactMap, username)) ? 
                      <img src={getAvatarData(getChatDisplayName(currentChat, 'full', safeContactMap, username)) || undefined} alt="avatar" className="w-12 h-11 rounded-xl object-cover" />
                      :
                      getChatDisplayIcon(currentChat, 32, theme)
                    }
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
                      // onClick={}
                      disabled
                      className={`w-full flex items-center px-3 py-2 text-sm font-sans ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'} ${theme === 'light' ? 'hover:bg-orange-50' : 'hover:bg-orange-500/10'} rounded-xl transition-all duration-200 group mt-1`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${theme === 'light' ? 'bg-orange-100' : 'bg-orange-500/20'} flex items-center justify-center mr-3 group-hover:bg-orange-200 group-hover:bg-orange-500/30 transition-colors`}>
                        <TbPhotoCog size={16} className={`${theme === 'light' ? 'text-orange-600' : 'text-orange-400'}`} />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold font-sans">Изменить фон</div>
                        <div className={`text-xs font-sans ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Изменить фон чата</div>
                      </div>
                    </button>
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
          </div>
        </div>

        {/* Messages Area - без скроллбара */}
        <div
          className={`flex flex-col flex-1 overflow-y-auto text-base messages-container`}
          style={{
            backgroundImage: currentChat?.font_name && backgroundChat
              ? `url(${backgroundChat}), linear-gradient(90deg, rgba(42, 123, 155, 1) 0%, rgba(87, 199, 133, 1) 50%, rgba(237, 221, 83, 1) 100%)`
              : 'linear-gradient(90deg, rgba(42, 123, 155, 1) 0%, rgba(87, 199, 133, 1) 50%, rgba(237, 221, 83, 1) 100%)',
            backgroundColor: '#ffbb78',
            backgroundRepeat: 'repeat',
            backgroundSize: 'auto',
            backgroundPosition: 'center'
          }}
        >
          <div 
            onScroll={handleScroll}
            ref={messagesContainerRef}
            className={`flex flex-col text-base pr-4 pb-4 pl-4 flex-1 overflow-y-auto mb-[55px] messages-container relative font-sans`} style={{ scrollbarWidth: 'none' }}>
            <FileDragModal 
              showFileDragModal={showFileDragModal}
              setShowFileDragModal={setShowFileDragModal}
              currentChat={currentChat}
            />
            {isLoadingMessages && (
              <div className="flex justify-center py-4">
                <div className={`w-6 h-6 border-2 ${theme === 'light' ? 'border-slate-300' : 'border-slate-600'} border-t-blue-500 rounded-full animate-spin`}></div>
              </div>
            )}
            {/* Change background chat */}
            {false && (<div className="fixed inset-0 flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
              <div className={`p-3 ${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-lg border animate-in zoom-in-95`}>
                <span className="block text-xl text-center">Выбрать тему</span>
                <div className="flex gap-2 overflow-x-auto">
                  <div 
                    className="flex flex-col gap-1 w-[100px] h-[150px] rounded-xl p-3 bg-blue-200/50"
                    style={{
                      backgroundImage: `url(${VITE_API_BASE_URL}/chat-fonts/chat_font_1.png), linear-gradient(90deg, rgba(42, 123, 155, 1) 0%, rgba(87, 199, 133, 1) 50%, rgba(237, 221, 83, 1) 100%)`,              
                      backgroundColor: '#ffbb78',
                      backgroundRepeat: 'repeat',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}  
                  >
                    <div className="rounded-2xl bg-[#e3fee0] h-[15px] w-1/2"></div>
                    <div className="rounded-2xl bg-[#e3fee0] h-[15px] w-1/2 self-end"></div>
                    <div className="rounded-2xl bg-[#e3fee0] h-[15px] w-1/2"></div>
                    <span className="text-xl mt-auto text-center block">💀</span>
                  </div>                                     
                </div>
              </div>
            </div>)}
            <RenderMessages
              unreadCounts={unreadCounts}
              onReactionInView={onReactionInView}
              unreadReactionNotifications={unreadReactionNotifications}
              currentChat={currentChat}
              filteredMessages={safeFilteredMessages}
              quotedMessageData={safeQuotedMessageData}
              contactMap={safeContactMap}
              handleMessageContextMenu={handleMessageContextMenu}
              handleMessageContextMenuReaction={handleMessageContextMenuReaction}
              fetchQuotedMessageData={fetchQuotedMessageData}
              username={username}
              setShowImageModal={setShowImageModal}
              loadMessagesAround={loadMessagesAround}
              setImageUrl={setImageUrl}
              activeChat={activeChat}
              handleContextMenuQuote={handleContextMenuQuote}
              onMessageInView={onMessageInView}
              onReact={(messageId: string, messageSender: string, reaction: string) => handleReactToMessage(messageId, messageSender, reaction)}
            />
            
            <div ref={messagesEndRef} />
            <RenderContextMenu 
              messageContextMenu={messageContextMenu}
              messageContextMenuRef={messageContextMenuRef}
              handleContextMenuEdit={handleContextMenuEdit}
              handleContextMenuDelete={handleContextMenuDelete}
              handleContextMenuCopy={handleContextMenuCopy}
              handleContextMenuQuote={handleContextMenuQuote}
              handleContextMenuForward={handleContextMenuForward}
              username={username}
              searchContacts={searchContacts}
              onReact={(reaction) => handleReactToMessage(messageContextMenu.message!.id, messageContextMenu.message?.sender, reaction)}
              currentReaction={getCurrentReaction()}
            />
          </div>
          
          {/* Input Area */}
          <div className={`absolute z-20 bottom-[20px] left-1/2 -translate-x-1/2 bg-none ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'} font-sans`}>

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

                <div className="mb-3">
                  <input
                    type="text"
                    value={searchQueryGifs}
                    onChange={(e) => setSearchQueryGifs(e.target.value)}
                    placeholder="Поиск GIF..."
                    className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                        : 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                    }`}
                  />
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto overflow-x-hidden no-scrollbar">
                  {searchQueryGifs.length >= 2 ? (
                    <>
                      {loadingGifs ? (
                        <div className="flex justify-center py-6">
                          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      ) : gifResults.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2">
                          {gifResults.map((url, index) => (
                            <button
                              key={index}
                              onClick={() => handleStickerClick(url)}
                              className={`w-20 h-20 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-300 hover:scale-110 transform border ${
                                theme === 'light' ? 'border-slate-200/60' : 'border-slate-600/60'
                              }`}
                            >
                              <img
                                src={url}
                                alt={`GIF ${index + 1}`}
                                className="w-full h-full object-contain p-1"
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className={`text-center text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                          Ничего не найдено
                        </p>
                      )}
                    </>
                  ) : (
                    Object.entries(stickerPacks).map(([packName, stickers]) => (
                      <div key={packName}>
                        <h4 className={`text-xs font-semibold font-sans ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'} mb-2 capitalize`}>
                          {packName}
                        </h4>
                        <div className="grid grid-cols-4 gap-2">
                          {stickers.map((sticker, index) => (
                            <button 
                              key={index} 
                              onClick={() => handleStickerClick(sticker)} 
                              className={`w-20 h-20 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-300 hover:scale-110 transform border ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-600/60'}`}
                            >
                              <img 
                                src={sticker} 
                                alt={`Sticker ${packName} ${index + 1}`} 
                                className="w-full h-full object-contain p-1"
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Input Controls */}
            <div className="flex items-end space-x-3" onPaste={handlePaste}>
              <div className="flex flex-col">
                <RenderForwardMessage 
                  forwardMessage={forwardMessage}
                  contactMap={safeContactMap}
                  cancelForward={cancelForward}
                />
                <RenderEditingMessage 
                  editingMessage={editingMessage}
                  cancelEdit={cancelEdit}
                />
                <RenderQuotedMessage 
                  quotedMessage={quotedMessage}
                  contactMap={safeContactMap}
                  cancelQuote={cancelQuote}
                />
                <div className={`flex items-end ${theme === 'light' ? 'bg-slate-100':'bg-slate-800'} rounded-xl`}>
                  <div className="flex space-x-1 mb-[3px]">
                    <button 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`w-10 h-10 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:text-blue-500 hover:bg-blue-50' : 'bg-slate-800 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10'} transition-all duration-300 flex items-center justify-center cursor-pointer`}
                    >
                      <Smiley size={20} weight="regular" />
                    </button>
                    <button 
                      onClick={() => setShowStickerPicker(!showStickerPicker)}
                      className={`w-10 h-10 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:text-purple-500 hover:bg-purple-50' : 'bg-slate-800 text-slate-400 hover:text-purple-400 hover:bg-purple-500/10'} transition-all duration-300 flex items-center justify-center cursor-pointer`}
                    >
                      <Sticker size={20} weight="regular" />
                    </button>
                  </div>

                  <div className="flex-1 relative flex items-center">
                    <TextareaAutosize
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onInput={handleTyping}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      // minRows={1}
                      maxRows={15}
                      placeholder={editingMessage ? 'Редактировать сообщение...' : 'Напишите сообщение...'}
                      className={`w-[500px] px-4 py-3 rounded-xl font-sans [scrollbar-width:none] resize-none transition-all duration-300 ${
                        theme === 'light' 
                          ? 'text-slate-900 placeholder-slate-500' 
                          : 'text-white placeholder-slate-400'
                      } focus:outline-none backdrop-blur-sm text-base`}
                      ref={inputRef}
                    />
                  </div>

                  <div className="flex space-x-1 mb-[3px]">
                    <label className={`w-10 h-10 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:text-green-500 hover:bg-green-50' : 'bg-slate-800 text-slate-400 hover:text-green-400 hover:bg-blue-500/10'} transition-all duration-300 flex items-center justify-center cursor-pointer`}>
                      <Paperclip size={20} weight="regular" />
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept='.jpg, .jpeg, .png, .pdf, .txt, .ogg, .mp4, .gif, .tiff, .webp, .svg, .doc, .docx, .rtf, .zip, .rar, .7z, .xls, .xlsx, .ppt'/>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex space-x-2 items-end">
                {editingMessage ? (
                  <button 
                    onClick={handleSendMessage}
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-white hover:bg-red-600 transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transform"
                  >
                    <IoCheckmarkOutline size={24}/>
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <button 
                      className={`${theme === 'light' ? 'bg-slate-100':'text-white bg-slate-800'} relative w-12 h-12 flex items-center justify-center z-100 cursor-pointer rounded-full transform-opacite duration-300 ${unreadReactionNotifications[currentChat.id] ? 'opacity-full' : 'opacity-0'}`}
                      onClick={() => {
                        scrollToMessage(unreadReactionNotifications[currentChat.id][0]);
                      }}
                    >
                      {unreadReactionNotifications[currentChat.id] && (
                        <span className="absolute -top-1 -right-2 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                          {unreadReactionNotifications[currentChat.id] ? unreadReactionNotifications[currentChat.id].length : null}
                        </span>
                      )}
                      <Heart size={22}/>
                    </button>
                    <button 
                      className={`${theme === 'light' ? 'bg-slate-100':'text-white bg-slate-800'} relative w-12 h-12 flex items-center justify-center z-100 cursor-pointer rounded-full transform-opacite duration-300 ${isAtBottom ? 'opacity-0' : 'opacity-full'}`}
                      onClick={() => {
                        setIsAutoScrolling(true);
                        if (messagesContainerRef.current) {
                          messagesContainerRef.current.scrollTo({
                            top: messagesContainerRef.current.scrollHeight,
                            behavior: 'smooth'
                          });
                        }
                        setTimeout(() => {
                          setIsAutoScrolling(false);
                        }, 300)
                      }}
                    >
                      {unreadCounts[currentChat.id] > 0 && (
                        <span className="absolute -top-1 -right-2 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                          {unreadCounts[currentChat.id]}
                        </span>
                      )}
                      <ArrowDown size={22}/>
                    </button>
                    <button 
                      onClick={handleSendMessage}
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 transform flex items-center justify-center group`}
                    >
                      <PaperPlaneRight size={20} weight="bold" className="transform group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Selected File */}
            {selectedFile && (
              <div className={`mt-3 flex items-center justify-between p-3 ${theme === 'light' ? 'bg-blue-50' : 'bg-slate-800'} rounded-xl border ${theme === 'light' ? 'border-blue-200/60' : 'border-blue-500/20'} font-sans`}>
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
        </div>
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