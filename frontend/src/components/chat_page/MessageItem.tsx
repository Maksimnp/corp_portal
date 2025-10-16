import type React from "react";
import type { Message } from '../../types/chat';
import {  formatTimestamp, getFileIcon, messageIsPhoto } from '../../utils/chat';
import { FileOutlined } from '@ant-design/icons';
import { Check, Checks, Paperclip, ArrowBendUpLeft } from 'phosphor-react';
import { useAuth } from "../../pages/AuthContext";
import { marked } from 'marked';
import { useTheme } from '../../hooks/ThemeContext';
import { useEffect, useRef, useState } from "react";

interface RenderMessageItemProps {
  msg: Message;
  prev_msg: Message | null;
  quotedMessageData: Record<string, Message | null>;
  contactMap: Record<string, string>;
  handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
  fetchQuotedMessageData: (id: string) => Promise<Message | null>;
  username: string | null;
  setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
  loadMessagesAround: (messageId: string) => Promise<void>;
  setImageUrl: React.Dispatch<React.SetStateAction<Message | null>>;
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
              className="w-8 h-8 text-white ml-1"
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
  msg,
  prev_msg,
  quotedMessageData,
  contactMap,
  handleMessageContextMenu,
  fetchQuotedMessageData,
  username,
  setShowImageModal,
  loadMessagesAround,
  setImageUrl
}) => {
  const { token } = useAuth();
  const { theme } = useTheme();
  const API_BASE = import.meta.env.VITE_API_BASE_URL;

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
  
  const renderContent = (content: string | undefined) => {
    if (!content) return null;
    const html = marked.parse(content) as string;
    return <div dangerouslySetInnerHTML={{ __html: html }} className="markdown-body" />;
  };

  const RenderQuotedMsg = (msg: Message) => {
    const curQotMsg = quotedMessageData[msg.quoted_message_id!];
    const isDataLoaded = curQotMsg !== undefined;
    const previewText = getQuotedMessagePreview(msg.quoted_message_id!);
    if (!isDataLoaded) {
      fetchQuotedMessageData(msg.quoted_message_id!).catch(() => {});
    }
    return (
      <div
        className={`mb-2 p-2 border-l-4 border-purple-500 ${theme === 'light' ? 'bg-black/10 hover:bg-black/20':'bg-white/10 hover:bg-white/20'} rounded text-sm cursor-pointer transition-colors`}
        onClick={() => {scrollToMessage(msg.quoted_message_id)}}
      >
        <span className="italic opacity-80 flex items-center">
          <ArrowBendUpLeft size={14} className="mr-1" />
          {previewText?.sender}
        </span>
        <span className="italic opacity-80 flex items-center">
          {msg.file_url && (renderFileMsg(msg))}
          {curQotMsg && messageIsPhoto(curQotMsg) && (
            <div className="flex items-center gap-3">
            <img src={`${API_BASE}${curQotMsg.file_url}`} alt={curQotMsg.file_name} className="rounded-lg max-h-16 object-contain" />
            <p className="truncate">Photo</p>
            </div>
          )}
        </span>
      </div>
    );
  };

  const renderFileMsg = (msg: Message) => {
    return (
      <div className="">
        {msg.file_name ? (
          <div className="flex flex-col text-white">
            <a href={`${API_BASE}${msg.file_url}`} target="_blank" rel="noopener noreferrer" className={`${isMyMessage ? 'text-white': theme === 'light' ? 'text-black' : 'text-white'} hover:underline flex items-center`}>
              {getFileIcon(msg.file_name, 40)}
              {msg.file_name}
            </a>
          </div>
        ) : (
          <a href={`${API_BASE}${msg.file_url}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center">
            <Paperclip size={16} className="mr-1" />
            Файл               
          </a>
        )}
      </div>
    );
  };

    const renderPhotoMsg = (msg: Message) => {
      return (
        <div className={`relative flex justify-between max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg ${messageClass} break-words word-break`}>
          <div className="text-sm wrap-break-word break-all">
            <div className="relative">
              <img src={`${API_BASE}${msg.file_url}`} alt={msg.file_name} className="rounded-lg max-h-96 object-contain cursor-pointer" onClick={() => {setShowImageModal(true); setImageUrl(msg)}}/>
              {msg.file_url?.endsWith('.gif') && (
                <div className="flex absolute top-2 left-2 bg-black/60 text-white text-[1rem] px-2 py-1 rounded-full backdrop-blur-sm font-medium">
                  GIF
                </div>
              )}
              <div className="flex absolute bottom-2 gap-1 right-2 bg-black/60 text-white text-[0.7rem] px-2 py-1 rounded-full backdrop-blur-sm font-medium">
                {formatTimestamp(msg.timestamp)}
                {isMyMessage && (
                  <span>{msg.is_read ? <Checks className="text-lg"/> : <Check className="text-lg"/>}</span>
                )}
              </div>
            </div>
            {msg.content && (<div className="m-1">
              {renderContent(msg.content)}
            </div>)}
          </div>
        </div>
      )            
    };

    const scrollToMessage = (messageId: string | null) => {
      if (!messageId) {
        return null;
      }
      const element = document.getElementById(`message-${messageId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('bg-gray-700', 'dark:bg-yellow-400/30');
        setTimeout(() => {
          element.classList.remove('bg-gray-700', 'dark:bg-yellow-400/30');
        }, 1000);
      } else {
        loadMessagesAround(messageId);
        console.info('Цитируемое сообщение не найдено в текущем списке.');
      }
    };

    const messageIsVideo = (msg: Message) => {
      if (!msg.file_url) {
        return null;
      }
      return msg.file_url.endsWith('.mp4');
    };

    const isMyMessage = msg.sender === username;
    const messageClass = isMyMessage
      ? 'bg-indigo-500 text-white self-end'
      : ` ${theme === 'light' ? 'bg-gray-200 text-gray-900': 'bg-gray-700 text-gray-200'} self-start`;
    return (
      <div
        key={msg.id}
        id={`message-${msg.id}`}
        className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} group mb-1`}
      >
        <div 
          className={`relative md:max-w-md lg:max-w-lg xl:max-w-xl ${messageIsPhoto(msg) ? '': 'px-3 py-1'} ${isMyMessage ? 'rounded-l-2xl rounded-r-md' : 'rounded-md rounded-r-2xl'} ${messageClass}`}
          onContextMenu={(e) => handleMessageContextMenu(e, msg)}
        >
          {!isMyMessage && (!prev_msg || msg.sender !== prev_msg.sender) && (
            <div className="font-semibold text-sm mb-1">{contactMap[msg.sender] || msg.sender}</div>
          )}
          {msg.quoted_message_id && (
            RenderQuotedMsg(msg)
          )}
          {messageIsPhoto(msg) ? 
          (
            renderPhotoMsg(msg)
          ) : messageIsVideo(msg) ? 
          (
            <VideoMessage
              fileUrl={msg.file_url}
            />
          ) : (
            <div className={`relative flex justify-between gap-2 max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg ${messageClass} break-words word-break`}>
              <div className="text-sm wrap-break-word break-all">
                {renderContent(msg.content)}
                {msg.file_url && (renderFileMsg(msg))}
                {msg.edited && <span className="text-xs text-black ml-2">(ред.)</span>}
              </div>
              <div className="flex items-end gap-1">
                <div className={`text-right text-[0.7rem] mt-2 ${isMyMessage ? 'text-gray-300' : 'text-gray-500'}`}>
                  {formatTimestamp(msg.timestamp)}
                </div>
                {isMyMessage && (<div className="text-right text-[0.7rem] mt-2">
                  {msg.is_read ? <Checks className="text-lg"/> : <Check className="text-lg"/>}
                </div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

export default RenderMessageItem;