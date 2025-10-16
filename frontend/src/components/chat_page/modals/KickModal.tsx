// components/modals/KickModal.tsx
import React from 'react';
import { UserCircle, X } from 'phosphor-react';
import type { Chat } from '../../../types/chat';
import { getChatDisplayName } from '../../../utils/chat';
import { useTheme } from '../../../hooks/ThemeContext';

interface KickModalProps {
  showKickModal: boolean;
  currentChat: Chat | undefined;
  contactMap: { [key: string]: string };
  username: string | null;
  selectedToKick: string[];
  toggleKickSelection: (member: string) => void;
  kickFromChat: (chatId: string, members: string[]) => Promise<void>;
  setShowKickModal: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedToKick: React.Dispatch<React.SetStateAction<string[]>>;
}

const KickModal: React.FC<KickModalProps> = ({
  showKickModal,
  currentChat,
  contactMap,
  username,
  selectedToKick,
  toggleKickSelection,
  kickFromChat,
  setShowKickModal,
  setSelectedToKick,
}) => {
  const { theme } = useTheme();

  if (!showKickModal || !currentChat) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
        <div className={`${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-lg border animate-in zoom-in-95`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                  <UserCircle size={20} className="text-white" weight="fill" />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                    Исключить из {getChatDisplayName(currentChat, 'full', contactMap, username)}
                  </h3>
                  <p className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} mt-1`}>Выберите участников для исключения</p>
                </div>
              </div>
              <button
                onClick={() => { setShowKickModal(false); setSelectedToKick([]); }}
                className={`w-8 h-8 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'} transition-colors flex items-center justify-center`}
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent rounded-2xl space-y-2">
                {currentChat.members.filter(member => member !== username).map(member => (
                  <div key={member} className={`flex items-center justify-between p-4 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-all duration-300 group ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-700/50'}`} onClick={() => toggleKickSelection(member)}>
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
                        <UserCircle size={20} className="text-white" weight="fill" />
                      </div>
                      <div>
                        <div className={`font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{contactMap[member] || member}</div>
                        <div className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>@{member}</div>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${
                      selectedToKick.includes(member)
                        ? 'bg-red-500 border-red-500'
                        : `${theme === 'light' ? 'border-slate-300 group-hover:border-red-500' : 'border-slate-600 group-hover:border-red-500'}`
                    }`}>
                      {selectedToKick.includes(member) && (
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className={`flex justify-end space-x-3 p-6 border-t ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <button
                onClick={() => { setShowKickModal(false); setSelectedToKick([]); }}
                className={`px-6 py-3 rounded-2xl ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
              >
                Отмена
              </button>
              <button
                onClick={() => kickFromChat(currentChat.id, selectedToKick)}
                className="px-6 py-3 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed"
                disabled={selectedToKick.length === 0}
              >
                Исключить
              </button>
            </div>
        </div>
    </div>
  );
};

export default KickModal;