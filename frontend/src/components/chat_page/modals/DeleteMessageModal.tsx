// components/modals/DeleteModal.tsx
import React from 'react';
import { Trash, X } from 'phosphor-react';
import type { Chat, Message } from '../../../types/chat';
import { getChatDisplayName } from '../../../utils/chat';
import { useTheme } from '../../../hooks/ThemeContext';

interface DeleteMessageModalProps {
    currentChat: Chat | undefined;
    showDeleteMessageModal: boolean;
    setShowDeleteMessageModal: React.Dispatch<React.SetStateAction<boolean>>;
    messageToDelete: Message | null;
    setMessageToDelete: React.Dispatch<React.SetStateAction<Message | null>>;
    confirmDeleteMessage: () => Promise<void>;
}

const DeleteMessageModal: React.FC<DeleteMessageModalProps> = ({
  currentChat,
  showDeleteMessageModal,
  setShowDeleteMessageModal,
  messageToDelete,
  setMessageToDelete,
  confirmDeleteMessage
}) => {
  const { theme } = useTheme();

  if (!showDeleteMessageModal || !messageToDelete || !currentChat) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in-0 font-sans">
        <div className={`rounded-2xl shadow-2xl p-6 w-full max-w-md border ${theme === 'light' ? 'border-slate-200/80' : 'border-slate-700/80'} animate-in zoom-in-95 ${theme === 'light' ? 'bg-white' : 'bg-slate-800'}`}>
          <div className="text-center mb-4">
            <div className={`w-16 h-16 ${theme === 'light' ? 'bg-red-100' : 'bg-red-500/20'} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
              <Trash size={24} className="text-red-500" weight="bold" />
            </div>
            <h3 className={`text-xl font-bold font-sans ${theme === 'light' ? 'text-slate-900' : 'text-white'} mb-2`}>
              Удалить сообщение
            </h3>
            <p className={`text-base leading-relaxed font-sans ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
              Это действие нельзя отменить. Сообщение будет удалено навсегда.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                setShowDeleteMessageModal(false);
                setMessageToDelete(null);
              }}
              className={`flex-1 px-4 py-3 rounded-xl font-sans ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
            >
              Отмена
            </button>
            <button
              onClick={confirmDeleteMessage}
              className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all duration-300 font-sans font-semibold shadow-lg hover:shadow-xl"
            >
              Удалить
            </button>
          </div>
        </div>
    </div>
  );
};

export default DeleteMessageModal;