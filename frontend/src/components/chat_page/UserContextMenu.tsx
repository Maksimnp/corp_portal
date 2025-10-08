import React from "react";
import { PaperPlaneRight } from 'phosphor-react';
import type { UserContextMenuState } from '../../types/chat'

interface RenderUserContextMenuProps {
    userContextMenu: UserContextMenuState,
    userContextMenuRef: React.RefObject<HTMLDivElement | null>;
    handleContextMenuSendMessage: () => void;
}

const RenderUserContextMenu: React.FC<RenderUserContextMenuProps> = ({
    userContextMenu,
    userContextMenuRef,
    handleContextMenuSendMessage
}) => {
    if (!userContextMenu.visible || !userContextMenu.userId) return null;
    const menuWidth = userContextMenuRef.current?.offsetWidth || 200;
    const menuHeight = userContextMenuRef.current?.offsetHeight || 100;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    let left = userContextMenu.x;
    let top = userContextMenu.y;
    if (left + menuWidth > windowWidth) left = left - menuWidth;
    if (top + menuHeight > windowHeight) top = top - menuHeight;
    if (left < 0) left = 0;
    if (top < 0) top = 0;
    return (
      <div
        ref={userContextMenuRef}
        className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-500 py-1 min-w-[180px]"
        style={{
          top: `${top}px`,
          left: `${left}px`,
        }}
      >
        <button
          onClick={handleContextMenuSendMessage}
          className="w-full text-left font-semibold gap-4 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center"
        >
          <PaperPlaneRight className="text-xl" />
          Отправить сообщение
        </button>
      </div>
    );
};

export default RenderUserContextMenu;