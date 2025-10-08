import React from "react";
import type { MessageContextMenuState } from '../../types/chat';
import { CommentOutlined, CopyOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useTheme } from '../../hooks/ThemeContext';

interface RenderContextMenuProps {
    messageContextMenu: MessageContextMenuState;
    messageContextMenuRef: React.RefObject<HTMLDivElement | null>;
    handleContextMenuEdit: () => void;
    handleContextMenuDelete: () => void;
    handleContextMenuCopy: () => void;
    handleContextMenuQuote: () => void;
    username: string | null;
}

const RenderContextMenu: React.FC<RenderContextMenuProps> = ({
    messageContextMenu,
    messageContextMenuRef,
    handleContextMenuEdit,
    handleContextMenuDelete,
    handleContextMenuCopy,
    handleContextMenuQuote,
    username,
}) => {
    const { theme, toggleTheme } = useTheme();
    if (!messageContextMenu.visible || !messageContextMenu.message) return null;
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
        className={`fixed ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700'} border rounded-md shadow-lg z-50 py-1 min-w-[150px]`}
        style={{
          top: `${top}px`,
          left: `${left}px`,
        }}
      >
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
          onClick={handleContextMenuCopy}
          className={`w-full text-left font-semibold gap-4 px-4 py-2 text-sm ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700'} flex items-center`}
        >
          <CopyOutlined className="text-xl" />
          Копировать
        </button>
        <button
          onClick={handleContextMenuQuote}
          className={`w-full text-left font-semibold gap-4 px-4 py-2 text-sm ${theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700'} flex items-center`}
        >
          <CommentOutlined className="text-xl" />
          Ответить
        </button>
      </div>
    );
};

export default RenderContextMenu;