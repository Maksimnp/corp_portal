import type React from "react";
import type { Chat, Message } from '../../types/chat';
import {  formatTimestamp, getFileIcon, messageIsPhoto, resolveFileUrl } from '../../utils/chat';
import { IoArrowUndoOutline } from "react-icons/io5";
import { Check, Checks, Paperclip, User } from 'phosphor-react';
import { useAuth } from "../../pages/AuthContext";
import { marked } from 'marked';
import { useTheme } from '../../hooks/ThemeContext';
import { useEffect, useRef, useState } from "react";
import { getAvatarData } from "../../utils/avatarCache";
import './MessageItem.css';
import hljs from 'highlight.js';
import { MdOutlineRadioButtonUnchecked } from "react-icons/md";
import { FaCheckCircle } from "react-icons/fa";

interface RenderMessageItemProps {
  msg: Message;
  currentChat: Chat | undefined;
  activeChat: string | null;
  prev_msg: Message | null;
  quotedMessageData: Record<string, Message | null>;
  contactMap: Record<string, string>;
  handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
  handleMessageContextMenuReaction: (msg: Message) => void;
  fetchQuotedMessageData: (id: string) => Promise<Message | null>;
  username: string | null;
  setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
  loadMessagesAround: (messageId: string) => Promise<void>;
  setImageUrl: React.Dispatch<React.SetStateAction<Message | null>>;
  handleContextMenuQuote: () => void;
  onReact: (messageId: string, messageSender: string, reaction: string) => void;
  onMessageInView?: (messageId: string, channelId: string) => void;
  unreadReactionNotifications: Record<string, string[]>;
  onReactionInView?: (messageId: string, channelId: string) => void;
  highlightMenu: boolean;
  setHighlightMessages: React.Dispatch<React.SetStateAction<Record<string,Message>>>;
  highlightMessages: Record<string,Message>;
  setHighlightMenu: React.Dispatch<React.SetStateAction<boolean>>;
}

interface VideoMessageProps {
  fileUrl: string | undefined;
}

export const VideoMessage = ({ fileUrl }: VideoMessageProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayClick = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleVideoPlay = () => setIsPlaying(true);
  const handleVideoPause = () => setIsPlaying(false);

  // Опционально: при монтировании — не проигрывать автоматически
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="relative inline-block max-w-full">
      {/* Видео */}
      <video
        ref={videoRef}
        src={fileUrl}
        controls
        className="max-w-full h-auto rounded-lg bg-black"
        poster={undefined}
        onPlay={handleVideoPlay}
        onPause={handleVideoPause}
        preload="metadata" // не грузить всё видео сразу
      />

      {/* Кастомная кнопка воспроизведения (только если не играет) */}
      {!isPlaying && (
        <button
          type="button"
          onClick={handlePlayClick}
          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded-lg"
          aria-label="Воспроизвести видео"
        >
          <div className="w-16 h-16 flex items-center justify-center bg-black bg-opacity-50 rounded-full">
            <svg
              className="w-8 h-8 text-black ml-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>
      )}

      {/* Имя файла (опционально) */}
      <div className="mt-1 text-xs text-gray-500 truncate">{fileUrl}</div>
    </div>
  );
};

const RenderMessageItem: React.FC<RenderMessageItemProps> = ({
  setHighlightMenu,
  highlightMessages,
  setHighlightMessages,
  msg,
  highlightMenu,
  activeChat,
  prev_msg,
  currentChat,
  quotedMessageData = {},
  contactMap = {},
  handleMessageContextMenu,
  handleMessageContextMenuReaction,
  fetchQuotedMessageData,
  username,
  setShowImageModal,
  loadMessagesAround,
  setImageUrl,
  handleContextMenuQuote,
  onReact,
  onMessageInView,
  unreadReactionNotifications,
  onReactionInView
}) => {
  const { token } = useAuth();
  const { theme } = useTheme();
  const API_BASE = import.meta.env.VITE_API_BASE_URL;

  const safeReactionsByUser = msg.reactions_by_user || {};
  const reactionCounts: Record<string, number> = {};
  const reactionsByUser = msg.reactions_by_user || {};

  const [showReaction, setShowReaction] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleHover = {
    onMouseEnter: () => {
      timerRef.current = setTimeout(() => setShowReaction(true), 1000);
    },
    onMouseLeave: () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowReaction(false);
    }
  };
  
  for (const reactionInfo of Object.values(safeReactionsByUser)) {
    const emoji = reactionInfo.emoji;
    reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
  }

  const getQuotedMessagePreview = (quotedId: string): { sender: string; content: string } | null => {
    const fullQuotedMsg = quotedMessageData[quotedId];
    if (fullQuotedMsg) {
      const senderName = contactMap[fullQuotedMsg.sender] || fullQuotedMsg.sender;
      let contentPreview = 'Сообщение';
      if (fullQuotedMsg.content) {
        contentPreview = fullQuotedMsg.content.substring(0, 50) + (fullQuotedMsg.content.length > 50 ? '...' : '');
      } else if (fullQuotedMsg.file_name) {
        contentPreview = `📎 ${fullQuotedMsg.file_name}`;
      }
      return {
        sender: senderName,
        content: contentPreview
      };
    }
    return null;
  };

  useEffect(() => {
    const HLJS_THEME_ID = 'hljs-theme';

    const existingLink = document.getElementById(HLJS_THEME_ID);
    if (existingLink) {
      existingLink.remove();
    }

    const link = document.createElement('link');
    link.id = HLJS_THEME_ID;
    link.rel = 'stylesheet';
    link.href =
      theme === 'dark'
        ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
        : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';

    document.head.appendChild(link);


    return () => {
      const cleanupLink = document.getElementById(HLJS_THEME_ID);
      if (cleanupLink) {
        cleanupLink.remove();
      }
    };
  }, [theme]);
  
  useEffect(() => {
    const codeBlocks = document.querySelectorAll('pre code:not([data-highlighted="yes"])');
    codeBlocks.forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });
  }, []);

  // hljs.highlightAll();
  const renderContent = (content: string | undefined) => {
    if (!content) return null;
    try {
      const html = marked.parse(content) as string;
      return <div dangerouslySetInnerHTML={{ __html: html }} className={`markdown-body inline-block ${theme === 'light' ? '': isMyMessage ? '': 'dark'}`} />;
    } catch (error) {
      console.error('Error parsing markdown:', error);
      return <div>{content}</div>;
    }
  };

  const RenderQuotedMsg = (msg: Message) => {
    if (!msg.quoted_message_id) return null;
    
    const curQotMsg = quotedMessageData[msg.quoted_message_id];
    const isDataLoaded = curQotMsg !== undefined;
    const previewText = getQuotedMessagePreview(msg.quoted_message_id);
    
    if (!isDataLoaded) {
      fetchQuotedMessageData(msg.quoted_message_id).catch(() => {});
    }

    const handleClick = () => {
      if (curQotMsg?.channel_id === activeChat) {
        scrollToMessage(msg.quoted_message_id);
      }
    };

    return (
      <div
        className={`p-1 border-l-4 border-[#5ca853] bg-[#5ca853]/20 hover:bg-[#5ca853]/30 rounded text-base cursor-pointer transition-colors`}
        onClick={handleClick}
      >
        <span className="italic opacity-80 flex items-center">
          <IoArrowUndoOutline size={14} className="mr-1" />
          {previewText?.sender || 'Пользователь'}
        </span>
        <span className="italic opacity-80 flex items-center">
          {msg.file_url && (renderFileMsg(msg))}
          {curQotMsg && messageIsPhoto(curQotMsg) && (
            <div className="flex items-center gap-3">
              <img 
                src={resolveFileUrl(curQotMsg.file_url)} 
                alt={curQotMsg.file_name || 'Изображение'} 
                loading="lazy" 
                className="rounded-lg max-h-16 mr-1 object-contain" 
              />
            </div>
          )}
          <span className="truncate">
            {messageIsPhoto(curQotMsg) ? 'Photo' : curQotMsg?.content || previewText?.content || 'Сообщение'}
          </span>
        </span>
      </div>
    );
  };

  const RenderForwardMsg = (msg: Message) => {
    if (!msg.forward_message_id) return null;
    
    const curQotMsg = quotedMessageData[msg.forward_message_id];
    const isDataLoaded = curQotMsg !== undefined;
    const previewText = getQuotedMessagePreview(msg.forward_message_id);
    
    if (!isDataLoaded) {
      fetchQuotedMessageData(msg.forward_message_id).catch(() => {});
    }

    const handleClick = () => {
      if (curQotMsg?.channel_id === activeChat) {
        scrollToMessage(msg.forward_message_id);
      }
    };

    return (
      <div
        className={`rounded cursor-pointer transition-colors border-l-4 pl-1 mb-1 border-[#5ca853] bg-[#5ca853]/20 hover:bg-[#5ca853]/30`}
        onClick={handleClick}
      >
        <span className="flex flex-col text-xs text-[#5ca853]">
          <span className={`${theme === 'light' ? `${isMyMessage ? 'white' : 'text-black'}` : 'text-black'}`}>Переслано от</span>
          <span className={`flex gap-2 ${theme === 'light' ? `${isMyMessage ? 'white' : 'text-black'}` : 'text-black'}`}>
            {getAvatarData(contactMap[msg.sender]) ? (
              <img 
                src={getAvatarData(contactMap[msg.sender]) || undefined} 
                alt="avatar" 
                className="w-6 h-6 rounded-full object-cover border border-white/50"
                loading="lazy"
              />
            ) : (
              <User size={20} className="text-gray-400" />
            )}
            {previewText?.sender || 'Пользователь'}
          </span>
        </span>
        <span className="flex items-center">
          {curQotMsg && !messageIsPhoto(curQotMsg) && (renderFileMsg(curQotMsg))}
          {curQotMsg && messageIsPhoto(curQotMsg) && (
            <div className="flex items-center gap-3">
              <img
                src={resolveFileUrl(curQotMsg.file_url)} 
                alt={curQotMsg.file_name || 'Изображение'}
                className="rounded-lg max-h-96 mr-1 object-contain"
                onClick={() => {setShowImageModal(true); setImageUrl(curQotMsg)}}
              />
            </div>
          )}
          <span className="">
            {messageIsPhoto(curQotMsg) ? '' : curQotMsg?.content || previewText?.content || 'Сообщение'}
          </span>
        </span>
      </div>
    );
  };

  const renderFileMsg = (msg: Message) => {
    if (!msg.file_url) return null;

    const isMyMessage = msg.sender === username;
    const textColor = isMyMessage ? 'text-black' : theme === 'light' ? 'text-black' : 'text-black';

    return (
      <div className="">
        {msg.file_name ? (
          <div className="flex flex-col">
            <a 
              href={`${API_BASE}${msg.file_url}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className={`${textColor} hover:underline flex items-center`}
            >
              {getFileIcon(msg.file_name, 40)}
              {msg.file_name}
            </a>
          </div>
        ) : (
          <a 
            href={`${API_BASE}${msg.file_url}`} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={`${textColor} hover:underline flex items-center`}
          >
            <Paperclip size={16} className="mr-1" />
            Файл
          </a>
        )}
      </div>
    );
  };

  const renderPhotoMsg = (msg: Message) => {
    const isMyMessage = msg.sender === username;
    const messageClass = isMyMessage
      ? 'text-black self-end'
      : `${theme === 'light' ? 'text-gray-900': 'text-gray-200'} self-start`;

    return (
      <div className={`relative flex justify-between max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg ${messageClass} break-words word-break`}>
        <div className="text-base wrap-break-word break-all">
          <div className="relative">
            <img 
              src={resolveFileUrl(msg.file_url)} 
              alt={msg.file_name || 'Изображение'} 
              className="rounded-lg max-h-96 object-contain cursor-pointer" 
              onClick={() => {setShowImageModal(true); setImageUrl(msg)}}
            />
            {msg.file_url?.endsWith('.gif') && (
              <div className="flex absolute top-2 left-2 bg-black/60 text-white text-[1rem] px-2 py-1 rounded-full backdrop-blur-sm font-medium">
                GIF
              </div>
            )}
            {!msg.content && (<div className="flex absolute bottom-2 gap-1 right-2 bg-black/30 text-white text-[0.7rem] px-2 py-1 rounded-full backdrop-blur-sm font-medium">
              {formatTimestamp(msg.timestamp)}
              {isMyMessage && (
                <span>{msg.is_read ? <Checks className="text-lg"/> : <Check className="text-lg"/>}</span>
              )}
            </div>)}
          </div>
          <div className="flex px-2 pb-1 justify-between">
            <div className="flex-1">
              {msg.content && (
                <div className="m-1 text-left">
                  {renderContent(msg.content)}
                  {msg.content && (<div className="flex clear-both float-right items-end gap-1 ml-2 mt-1 flex-shrink-0 self-end">
                    <div className={`text-[0.7rem] ${isMyMessage ? 'text-[#5ca853]' : 'text-gray-500'}`}>
                      {formatTimestamp(msg.timestamp)}
                    </div>
                    {isMyMessage && (
                      <div className="mb-[-1px]">
                        {msg.is_read ? 
                          <Checks size={14} className="text-[#5ca853]"/> : 
                          <Check size={14} className="text-[#5ca853]"/>
                        }
                      </div>
                    )}
                    </div>
                  )}
                </div>
              )}
              {Object.keys(reactionsByUser).length > 0 && (
                <div className={`flex items-center ${msg.content ? 'justify-start':'justify-end'} mt-1 gap-1}`}>
                  {Object.entries(reactionsByUser).map(([userId, emoji]) => (
                    <div 
                      key={`${msg.id}-${userId}-${emoji}`}
                      className={`rounded-full  pl-1 ${isMyMessage ? 'bg-green-300': 'bg-blue-300'} flex items-center cursor-pointer justify-center gap-1`}
                      title={contactMap[userId] || userId}
                    >
                      <span className="text-lg">{emoji.emoji}</span>
                      
                      {getAvatarData(contactMap[userId]) ? (
                        <img 
                          src={getAvatarData(contactMap[userId]) || undefined} 
                          alt="avatar" 
                          className="w-6 h-6 rounded-full object-cover border border-white/50"
                          loading="lazy"
                        />
                      ) : (
                        <User size={20} className="text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
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
        element.classList.remove('bg-gray-200/50', 'dark:bg-yellow-300/30');
      }, 2000);
    } else {
      loadMessagesAround(messageId);
      console.info('Цитируемое сообщение не найдено в текущем списке.');
    }
  };

  const messageIsVideo = (msg: Message) => {
    if (!msg.file_url) {
      return false;
    }
    return msg.file_url.endsWith('.mp4');
  };

  const isMyMessage = msg.sender === username;
  const messageClass = isMyMessage
    ? `${messageIsPhoto(msg) && !msg.content ? '': 'bg-[#e3fee0]'} text-black self-end`
    : `${theme === 'light' ? `${messageIsPhoto(msg) && !msg.content ? '': 'bg-gray-200'} text-gray-900`: 'bg-slate-800 text-gray-200'} self-start`;

  const messageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onMessageInView || !activeChat || !messageRef.current) {
      return;
    }

    if (msg.sender === username) {
      return;
    }

    if (msg.is_read) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            onMessageInView(msg.id, activeChat);
            observer.unobserve(entry.target);
            observer.disconnect();
          }
        });
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.3,
      }
    );
    observer.observe(messageRef.current);

      return () => {
        if (messageRef.current) {
          observer.unobserve(messageRef.current);
        }
        observer.disconnect();
      };
  }, [msg.id, msg.sender, activeChat, username, onMessageInView]);

  useEffect(() => {
    // console.log('unreadReactionNotifications', unreadReactionNotifications)
    if (!onReactionInView || !activeChat || !messageRef.current) return;
    if (msg.sender !== username) return;
    // console.log('123')
    const hasUnreadReaction = Object.values(msg.reactions_by_user || {}).some(
      (reactionInfo) => reactionInfo && !reactionInfo.is_read
    );
    console.log('hasUnreadReaction',hasUnreadReaction)
    if (!hasUnreadReaction) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            onReactionInView(msg.id, activeChat);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(messageRef.current);
    return () => observer.disconnect();
  }, [msg.id, activeChat, username, onReactionInView, unreadReactionNotifications]);

  return (
    <div
      ref={messageRef}
      key={msg.id}
      data-message-id={msg.id}
      id={`message-${msg.id}`}
      className={`flex ${msg.is_notification ? 'justify-center' : isMyMessage ? 'justify-end' : 'justify-start'} ${msg.isGroupStart ? 'mt-2':''} group mb-[2px] transition-all duration-1000 transform`}
      onDoubleClick={handleContextMenuQuote}
      // onClick={() => {
      //   if (highlightMenu && isMyMessage) {
      //     setHighlightMessages(prev => {
      //       if (prev[msg.id]) {
      //         const { [msg.id]: _, ...rest } = prev;

      //         if (Object.keys(rest).length === 0) {
      //           setHighlightMenu(false);
      //         }
      //         return rest;
      //       } else {
      //         return { ...prev, [msg.id]: msg };
      //       }
      //     });
      //   }
      // }}
    >
      {msg.is_notification ? 
        <div className="text-center my-2">
          <span className="inline-block bg-gray-300 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
            {msg.content}
          </span>
        </div>
        :
        <div 
          className={`relative md:max-w-md lg:max-w-lg xl:max-w-[1000px] ${messageIsPhoto(msg) ? '' : 'px-3 py-1'} 
            ${isMyMessage ? 
              `${msg.isGroupStart && !msg.isGroupEnd ? 'rounded-br-md rounded-tr-2xl':`${msg.isGroupEnd ? 'rounded-tr-md':'rounded-r-md'}`} rounded-l-2xl` 
              : 
              `${msg.isGroupStart ? 'rounded-bl-md rounded-tl-2xl':'rounded-l-md'} rounded-r-2xl`} ${messageClass}`}
          onContextMenu={(e) => handleMessageContextMenu(e, msg)}
          {...handleHover}
        >
          {/* {!isMyMessage && (!prev_msg || msg.sender !== prev_msg.sender) && (
            <div className="font-semibold text-base mb-1">
              {contactMap[msg.sender] || msg.sender}
            </div>
          )} */}
          {showReaction && msg.sender !== username && (
            <div className="absolute -bottom-[6px] -right-[6px] z-100 shadow-lg w-8 h-8 rounded-full bg-white cursor-pointer flex items-center justify-center ">
              <span 
                className="text-xl hover:scale-125"
                onClick={() => {
                  onReact(msg.id, msg.sender, '❤️');
                }}
              >
                ❤️
              </span>
            </div>
          )}
          {msg.quoted_message_id && RenderQuotedMsg(msg)}
          
          {messageIsPhoto(msg) ? (
            renderPhotoMsg(msg)
          ) : messageIsVideo(msg) ? (
            <VideoMessage fileUrl={msg.file_url} />
          ) : (
            <div className="relative flex max-w-xs md:max-w-md lg:max-w-lg xl:max-w-[1000px] break-words word-break">
              <div className="flex flex-col text-base wrap-break-word break-all w-full">
                {msg.forward_message_id && RenderForwardMsg(msg)}
                
                <div className="flex items-end justify-between w-full">
                  <div className="flex-1">
                    {renderContent(msg.content)}
                    {msg.file_url && renderFileMsg(msg)}
                    <div className=" flex clear-both mt-[8px] ml-[5px] float-right items-end justify-end gap-1 flex-shrink-0 self-end">
                      <div className={`text-[0.7rem] ${isMyMessage ? 'text-[#5ca853]' : 'text-gray-500'}`}>
                        {formatTimestamp(msg.timestamp)}
                      </div>
                      {isMyMessage && (
                        <div className="mb-[-1px]">
                          {msg.is_read ? 
                            <Checks size={14} className="text-[#5ca853]"/> : 
                            <Check size={14} className="text-[#5ca853]"/>
                          }
                        </div>
                      )}
                      {msg.edited && <span className="text-xs text-[#5ca853] opacity-70">(ред.)</span>}
                    </div>
                  </div>
                </div>
                
                {Object.keys(reactionsByUser).length > 0 && (
                  <div className="flex items-center justify-start mt-1 gap-1">
                    {Object.entries(reactionsByUser).map(([userId, emoji]) => (
                      <div 
                        key={`${msg.id}-${userId}-${emoji}`}
                        className={`rounded-full  pl-1 ${isMyMessage ? 'bg-green-300':'bg-blue-300'}  flex items-center cursor-pointer justify-center gap-1`}
                        title={contactMap[userId] || userId}
                      >
                        <span className="text-lg">{emoji.emoji}</span>
                        
                        {getAvatarData(contactMap[userId]) ? (
                          <img 
                            src={getAvatarData(contactMap[userId]) || undefined} 
                            alt="avatar" 
                            className="w-6 h-6 rounded-full object-cover border border-white/50"
                            loading="lazy"
                          />
                        ) : (
                          <User size={20} className="text-gray-400" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {msg.isGroupEnd && !messageIsPhoto(msg) && (
            <div 
              className={`absolute bottom-0 ${isMyMessage ? '-right-[6px]' : '-left-[7px]'}`}
              style={{
                width: 0,
                height: 0,
                borderStyle: 'solid',
                borderWidth: isMyMessage ? '0 8px 12px 0' : '0 0 12px 12px',
                borderColor: isMyMessage 
                  ? 'transparent transparent #e3fee0 transparent' 
                  : 'transparent transparent #ebe6e7 transparent'
              }}
            ></div>
          )}
        </div>
      }

        <div className="flex items-center ml-2">
          <div 
            className={`relative transition-all duration-300 ease-out transform ${highlightMenu && isMyMessage ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}
          >
            {highlightMessages[msg.id] ? <FaCheckCircle size={30} color="#5ca853"/> : <MdOutlineRadioButtonUnchecked size={30} color="#e3fee0"/>}
          </div>
        </div>

    </div>
  );
};

export default RenderMessageItem;