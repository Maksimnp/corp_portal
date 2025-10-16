// components/modals/LeaveModal.tsx
import React from 'react';
import { X } from 'phosphor-react';
import type { Chat } from '../../../types/chat';
import { getChatDisplayName } from '../../../utils/chat';
import { useTheme } from '../../../hooks/ThemeContext';

interface LeaveModalProps {
  showLeaveModal: boolean;
  currentChat: Chat | undefined;
  contactMap: { [key: string]: string };
  username: string | null;
  leaveChat: (chatId: string) => Promise<void>;
  setShowLeaveModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const LeaveModal: React.FC<LeaveModalProps> = ({
  showLeaveModal,
  currentChat,
  contactMap,
  username,
  leaveChat,
  setShowLeaveModal,
}) => {
  const { theme } = useTheme();

  if (!showLeaveModal || !currentChat) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
        <div className={`${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-md border animate-in zoom-in-95`}>
            <div className="text-center p-8">
              <div className={`w-20 h-20 ${theme === 'light' ? 'bg-orange-100' : 'bg-orange-500/20'} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
                <X size={32} className="text-orange-500" weight="bold" />
              </div>
              <h3 className={`text-2xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'} mb-3`}>Покинуть чат</h3>
              <p className={`text-lg leading-relaxed mb-8 ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                Вы уверены, что хотите покинуть чат "{getChatDisplayName(currentChat, 'full', contactMap, username)}"?
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={() => setShowLeaveModal(false)}
                  className={`flex-1 px-6 py-4 rounded-2xl ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
                >
                  Отмена
                </button>
                <button
                  onClick={() => leaveChat(currentChat.id)}
                  className="flex-1 px-6 py-4 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl"
                >
                  Покинуть
                </button>
              </div>
            </div>
        </div>
    </div>
  );
};

export default LeaveModal;