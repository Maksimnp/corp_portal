import type React from "react";
import { X, ArrowBendUpLeft } from 'phosphor-react';
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
        <div className={`flex items-start max-w-full w-full mb-3 p-3 ${theme === 'light' ? 'bg-gray-100 border-gray-200' : 'bg-gray-800 border-gray-700'} rounded-t-lg border`}>
          <ArrowBendUpLeft className={`text-xl ${theme === 'light' ? 'text-black' : 'text-white'} mt-1 flex-shrink-0 mr-2`} />
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-start w-full">
              <div className="border-l-[4px] border-purple-500 pl-3 rounded-sm flex-1 min-w-0 w-full max-w-full overflow-hidden">
                <div className={`text-sm font-semibold ${theme === 'light' ? 'text-purple-600' : 'text-purple-400'} mb-1 truncate`}>
                  Ответ {contactMap[quotedMessage.sender] || quotedMessage.sender}:
                </div>
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
                className={`ml-2 p-1 ${theme === 'light' ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'} rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0`}
                aria-label="Отменить цитирование"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
};

export default RenderQuotedMessage;