import type React from "react";
import type { Chat, Message, Contact, LastMessage } from '../../types/chat';
import { formatDate, formatTimestamp } from '../../utils/chat';
import { CommentOutlined, FileExcelOutlined, FileImageOutlined, FileOutlined, FilePdfOutlined, FileTextOutlined, FileWordOutlined, FileZipOutlined } from '@ant-design/icons';
import { Paperclip } from 'phosphor-react';
import { useAuth } from "../../pages/AuthContext";
import { BsFiletypeTxt } from "react-icons/bs";
import { marked } from 'marked';
import { useTheme } from '../../hooks/ThemeContext';

interface RenderMessageItemProps {
  msg: Message;
  prev_msg: Message | null;
  quotedMessageData: Record<string, Message | null>;
  contactMap: Record<string, string>;
  handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
  fetchQuotedMessageData: (id: string) => Promise<Message | null>;
  username: string | null;
  setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const RenderMessageItem: React.FC<RenderMessageItemProps> = ({
  msg,
  prev_msg,
  quotedMessageData,
  contactMap,
  handleMessageContextMenu,
  fetchQuotedMessageData,
  username,
  setShowImageModal
}) => {
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
          <CommentOutlined size={14} className="mr-1" />
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
          <div className="flex flex-col">
            <a href={`${API_BASE}${msg.file_url}`} target="_blank" rel="noopener noreferrer" className="text-black hover:underline flex items-center">
              {getFileIcon(msg.file_name)}
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
              <img src={`${API_BASE}${msg.file_url}`} alt={msg.file_name} className="rounded-lg max-h-96 object-contain" onClick={() => {setShowImageModal(true)}}/>
              <div className="flex absolute bottom-2 gap-1 right-2 bg-black/60 text-white absolute right-1 bottom-1 text-[0.7rem] px-2 py-1 rounded-full backdrop-blur-sm font-medium">
                {formatTimestamp(msg.timestamp)}
                {isMyMessage && (
                  <span>{msg.is_read ? '✓✓' : '✓'}</span>
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

    const getFileIcon = (fileName: string) => {
      const iconStyle = { fontSize: '50px' };
      if (!fileName) return <FileOutlined />;
      const extension = fileName.split('.').pop()?.toLowerCase();
      switch (extension) {
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'webp':
        case 'svg':
        case 'bmp':
        case 'tiff':
          return <FileImageOutlined style={iconStyle}/>;
        case 'pdf':
          return <FilePdfOutlined style={iconStyle}/>;
        case 'doc':
        case 'docx':
          return <FileWordOutlined style={iconStyle}/>;
        case 'xls':
        case 'xlsx':
          return <FileExcelOutlined style={iconStyle}/>;
        case 'txt':
          return <BsFiletypeTxt style={iconStyle}/>;
        case 'md':
        case 'rtf':
          return <FileTextOutlined style={iconStyle}/>;
        case 'zip':
        case 'rar':
        case '7z':
        case 'tar':
        case 'gz':
          return <FileZipOutlined style={iconStyle}/>;
        default:
          return <FileOutlined style={iconStyle}/>;
      }
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
        console.info('Цитируемое сообщение не найдено в текущем списке.');
      }
    };

    const messageIsPhoto = (msg: Message) => {
      if (!msg.file_url) {
        return null;
      }
      return msg.file_url.endsWith('.png') || msg.file_url.endsWith('.jpg') || msg.file_url.endsWith('.jpeg') || msg.file_url.endsWith('.gif') || msg.file_url.endsWith('.webp');
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
          ) : (
            <div className={`relative flex justify-between gap-2 max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg ${messageClass} break-words word-break`}>
              <div className="text-sm wrap-break-word break-all">
                {renderContent(msg.content)}
                {msg.file_url && (renderFileMsg(msg))}
                {msg.edited && <span className="text-xs text-black ml-2">(ред.)</span>}
              </div>
              <div className="relative flex justify-between gap-1">
                <div className={`text-right text-[0.7rem] mt-2 ${isMyMessage ? 'text-gray-300' : 'text-gray-500'}`}>
                  {formatTimestamp(msg.timestamp)}
                </div>
                {isMyMessage && (<div className="text-right text-[0.7rem] mt-2">
                  {msg.is_read ? "✓✓": "✓"}
                </div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

export default RenderMessageItem;