import type React from "react";
import { X } from 'phosphor-react';
import { IoArrowUndoOutline, IoArrowRedoOutline  } from "react-icons/io5";
import type { Message } from '../../types/chat';
import { useTheme } from '../../hooks/ThemeContext';
import {  getFileIcon, messageIsPhoto } from '../../utils/chat';

interface RenderQuotedMessageProps {
    quotedMessage: Message | null;
    contactMap: { [key: string]: string };
    cancelQuote: () => void;
}

const RenderQuotedMessage: React.FC<RenderQuotedMessageProps> = ({
    quotedMessage,
    contactMap,
    cancelQuote
}) => {
    const { theme, toggleTheme } = useTheme();
    const API_BASE = import.meta.env.VITE_API_BASE_URL;
    if (!quotedMessage) return null;
    return (
      <div className="w-full max-w-full overflow-hidden">
        <div className={`flex items-center max-w-full w-full mb-3 p-2 ${theme === 'light' ? 'bg-gray-100 border-gray-200' : 'bg-gray-800 border-gray-700'} rounded-lg border`}>
          <IoArrowUndoOutline className={`text-2xl text-purple-500 ${theme === 'light' ? 'text-black' : 'text-white'}  flex-shrink-0 mr-2`} />
          <div className="flex-1 min-w-0 w-full">
            <div className="flex w-full items-center">
              <div className="border-l-[4px] border-purple-500 pl-3 bg-purple-200/70 rounded-sm flex-1 min-w-0 w-full max-w-full overflow-hidden">
                <span className={`text-sm font-semibold ${theme === 'light' ? 'text-purple-600' : 'text-purple-400'} truncate`}>
                  Ответ {contactMap[quotedMessage.sender] || quotedMessage.sender}:
                </span>
                <div className={`text-sm ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} w-full max-w-full overflow-hidden`}>
                  <div className="line-clamp-2 break-words">
                    {quotedMessage.content ? (
                      quotedMessage.content
                    ) : messageIsPhoto(quotedMessage) ? (
                      <img src={`${API_BASE}${quotedMessage.file_url}`} alt={quotedMessage.file_name} loading="lazy" className="rounded-lg max-h-12 object-contain cursor-pointer"/>
                    ) : (
                      <a href={`${API_BASE}${quotedMessage.file_url}`} target="_blank" rel="noopener noreferrer" className={`hover:underline flex items-center`}>
                        {getFileIcon(quotedMessage.file_name, 20)}
                        {quotedMessage.file_name}
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={cancelQuote}
                className={`p-1 ml-2 text-purple-500 ${theme === 'light' ? 'text-gray-500 hover:text-purple-700' : 'text-gray-400 hover:text-purple-200'} rounded-full hover:bg-gray-200 transition-colors flex-shrink-0`}
                aria-label="Отменить цитирование"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
};

export default RenderQuotedMessage;