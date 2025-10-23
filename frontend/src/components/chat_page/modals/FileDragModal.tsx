// FileDragModal.tsx
import React from 'react';
import { File } from 'phosphor-react';
import type { Chat } from '../../../types/chat';
import { useTheme } from '../../../hooks/ThemeContext';

interface FileDragModalProps {
  showFileDragModal: boolean;
  setShowFileDragModal: React.Dispatch<React.SetStateAction<boolean>>;
  currentChat: Chat | undefined;
}

const FileDragModal: React.FC<FileDragModalProps> = ({
  showFileDragModal,
  currentChat,
}) => {
  const { theme } = useTheme();

  if (!showFileDragModal || !currentChat) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
      aria-hidden="true"
    >
      <div
        className={`relative w-full max-w-md mx-4 p-8 rounded-2xl shadow-2xl backdrop-blur-lg border-2 border-dashed flex flex-col items-center justify-center transition-all duration-300 transform scale-95 animate-in zoom-in-95 ${
          theme === 'light'
            ? 'bg-white/90 text-gray-800 border-blue-400'
            : 'bg-slate-800/90 text-slate-100 border-blue-500'
        }`}
        style={{ pointerEvents: 'none' }}
      >
        <div className="mb-4">
          <File
            size={64}
            weight="duotone"
            className={theme === 'light' ? 'text-blue-500' : 'text-blue-400'}
          />
        </div>
        <h3 className="text-xl font-bold text-center mb-2">
          Отпустите файл здесь
        </h3>
        <p className="text-sm opacity-80 text-center">
          Файл будет отправлен в чат «
          {currentChat.is_group || currentChat.is_channel
            ? currentChat.name
            : currentChat.name || '...'}
          »
        </p>
      </div>
    </div>
  );
};

export default FileDragModal;