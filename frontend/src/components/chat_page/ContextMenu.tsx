import React, { useState } from "react";
import type { MessageContextMenuState } from '../../types/chat';
import { CopyOutlined, DeleteOutlined, EditOutlined, SmileOutlined } from '@ant-design/icons';
import { useTheme } from '../../hooks/ThemeContext';
import { IoArrowUndoOutline, IoArrowRedoOutline  } from "react-icons/io5";
import { MdOutlineKeyboardArrowDown } from "react-icons/md";

interface RenderContextMenuProps {
  messageContextMenu: MessageContextMenuState;
  messageContextMenuRef: React.RefObject<HTMLDivElement | null>;
  handleContextMenuEdit: () => void;
  handleContextMenuDelete: () => void;
  handleContextMenuCopy: () => void;
  handleContextMenuQuote: () => void;
  handleContextMenuForward: () => void;
  username: string | null;
  searchContacts: (query: string) => Promise<void>;
  onReact: (reaction: string) => void;
  currentReaction?: string | null;
}

const RenderContextMenu: React.FC<RenderContextMenuProps> = ({
    messageContextMenu,
    messageContextMenuRef,
    handleContextMenuEdit,
    handleContextMenuDelete,
    handleContextMenuCopy,
    handleContextMenuQuote,
    handleContextMenuForward,
    username,
    searchContacts,
    onReact,
    currentReaction
}) => {
    const { theme } = useTheme();
    if (!messageContextMenu.visible || !messageContextMenu.message) return null;
    const stickers = ['🥰', '❤️', '👍', '🔥', '😉','✨','😈','🤪','🆘','💥', '💋', '😱', '👾', '🍑', '🥵', '🔞', '🤨', '🐀'];
    const [showAllReactions, setShowAllReactions] = useState(false);
    const menuWidth = messageContextMenuRef.current?.offsetWidth || 200;
    const menuHeight = messageContextMenuRef.current?.offsetHeight || 150;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    let left = messageContextMenu.x;
    let top = messageContextMenu.y;
    if (left + menuWidth > windowWidth) left = left - menuWidth;
    if (top + menuHeight > windowHeight) top = top - menuHeight;
    if (left < 0) left = 0;
    if (top < 0) top = 0;

    return (
      <div
        ref={messageContextMenuRef}
        className={`fixed flex flex-col items-center`}
        style={{
          top: `${top}px`,
          left: `${left}px`,
        }}
      >
        {messageContextMenu.message.sender !== username && (
          <div 
            className={`flex max-w-[230px] flex-wrap gap-2 px-4 py-1 rounded-xl ${theme === 'light' ? 'bg-white' : 'bg-slate-800'} mb-2 overflow-hidden transition-all duration-600`}
            style={{
              maxHeight: showAllReactions ? '500px' : '60px', // пример высоты
            }}
          >
            {stickers
              .slice(0, showAllReactions ? stickers.length : 4)
              .map((el, index) => (
                <span
                  key={el || index}
                  className={`cursor-pointer rounded-full hover:bg-gray-300/50 text-2xl ${
                    currentReaction === el ? 'text-red-700' : 'text-red-500'
                  }`}
                  onClick={() => onReact(el)}
                >
                  {el}
                </span>
              ))}

            {!showAllReactions && stickers.length > 4 && (
              <span
                className={`cursor-pointer ${theme === 'light' ? 'text-black':'text-white'} hover:bg-gray-300/50 rounded-full`}
                onClick={() => setShowAllReactions(true)}
              >
                <MdOutlineKeyboardArrowDown size={30} />
              </span>
            )}
          </div>
        )}
        <div className={`${theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700'} w-[170px] border rounded-md shadow-lg z-50 py-1`}>
          <button
            onClick={handleContextMenuQuote}
            className={`w-full text-left font-semibold gap-4 px-4 py-2 text-sm ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700'} flex items-center`}
          >
            <IoArrowUndoOutline className="text-xl" />
            Ответить
          </button>
          {messageContextMenu.message.sender === username && (
            <>
              <button
                onClick={handleContextMenuEdit}
                className={`w-full text-left font-semibold gap-4 px-4 py-2 text-sm ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700'} flex items-center`}
              >
                <EditOutlined className="text-xl" />
                Редактировать
              </button>
              <button
                onClick={handleContextMenuDelete}
                className={`w-full text-left font-semibold gap-4 px-4 py-2 text-sm ${theme === 'light' ? 'text-red-600 hover:bg-red-100' : 'text-red-400 hover:bg-red-900/50'} flex items-center`}
              >
                <DeleteOutlined className="text-xl" />
                Удалить
              </button>
              <div className={`border-t ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'} my-1`}></div>
            </>
          )}
          <button
            onClick={() => {handleContextMenuForward(); searchContacts('a')}}
            className={`w-full text-left font-semibold gap-4 px-4 py-2 text-sm ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700'} flex items-center`}
          >
            <IoArrowRedoOutline className="text-xl" />
            Переслать
          </button>
          <button
            onClick={handleContextMenuCopy}
            className={`w-full text-left font-semibold gap-4 px-4 py-2 text-sm ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700'} flex items-center`}
          >
            <CopyOutlined className="text-xl" />
            Копировать
          </button>
        </div>
      </div>
    );
};

export default RenderContextMenu;