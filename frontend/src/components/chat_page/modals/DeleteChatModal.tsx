// components/modals/DeleteModal.tsx
import React from 'react';
import { X } from 'phosphor-react';
import type { Chat } from '../../../types/chat';
import { getChatDisplayName } from '../../../utils/chat';
import { useTheme } from '../../../hooks/ThemeContext';

interface DeleteChatModalProps {
  showDeleteModal: boolean;
  currentChat: Chat | undefined;
  contactMap: { [key: string]: string };
  username: string | null;
  deleteChat: (chatId: string) => Promise<void>;
  setShowDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const DeleteChatModal: React.FC<DeleteChatModalProps> = ({
  showDeleteModal,
  currentChat,
  contactMap,
  username,
  deleteChat,
  setShowDeleteModal,
}) => {
  const { theme } = useTheme();

  if (!showDeleteModal || !currentChat) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[1000] animate-in fade-in-0">
        <div className={`${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-md border animate-in zoom-in-95`}>
            <div className="text-center p-8">
              <div className={`w-20 h-20 ${theme === 'light' ? 'bg-red-100' : 'bg-red-500/20'} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
                <X size={32} className="text-red-500" weight="bold" />
              </div>
              <h3 className={`text-2xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'} mb-3`}>Удалить чат</h3>
              <p className={`text-lg leading-relaxed mb-8 ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                Вы уверены, что хотите навсегда удалить чат "{getChatDisplayName(currentChat, 'full', contactMap, username)}"? Это действие нельзя отменить.
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className={`flex-1 px-6 py-4 rounded-2xl ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
                >
                  Отмена
                </button>
                <button
                  onClick={() => deleteChat(currentChat.id)}
                  className="flex-1 px-6 py-4 rounded-2xl bg-gradient-to-br from-red-500 to-pink-500 text-white hover:from-red-600 hover:to-pink-600 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl"
                >
                  Удалить
                </button>
              </div>
            </div>
        </div>
    </div>
  );
};

export default DeleteChatModal;