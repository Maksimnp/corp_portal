// components/modals/InviteModal.tsx
import React from 'react';
import { Users, UserCircle, X, MagnifyingGlass } from 'phosphor-react';
import type { Chat, Contact } from '../../../types/chat';
import { getChatDisplayName } from '../../../utils/chat';
import { useTheme } from '../../../hooks/ThemeContext';

interface InviteModalProps {
  showInviteModal: boolean;
  currentChat: Chat | undefined;
  contactMap: { [key: string]: string };
  username: string | null;
  contactSearchQuery: string;
  setContactSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchContacts: (query: string) => Promise<void>;
  contacts: Contact[];
  selectedContacts: Contact[];
  toggleContactSelection: (contact: Contact) => void;
  inviteToChat: (chatId: string, members: string[]) => Promise<void>;
  setShowInviteModal: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
}

const InviteModal: React.FC<InviteModalProps> = ({
  showInviteModal,
  currentChat,
  contactMap,
  username,
  contactSearchQuery,
  setContactSearchQuery,
  searchContacts,
  contacts,
  selectedContacts,
  toggleContactSelection,
  inviteToChat,
  setShowInviteModal,
  setSelectedContacts,
  setContacts,
}) => {
  const { theme } = useTheme();

  if (!showInviteModal || !currentChat) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
<div className={`${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-lg border animate-in zoom-in-95`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Users size={20} className="text-white" weight="fill" />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                    Пригласить в {getChatDisplayName(currentChat, 'full', contactMap, username)}
                  </h3>
                  <p className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} mt-1`}>Добавьте новых участников</p>
                </div>
              </div>
              <button
                onClick={() => { setShowInviteModal(false); setSelectedContacts([]); setContactSearchQuery(''); setContacts([]); }}
                className={`w-8 h-8 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'} transition-colors flex items-center justify-center`}
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="relative mb-4">
                <MagnifyingGlass size={20} className={`absolute left-4 top-1/2 transform -translate-y-1/2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-400'}`} />
                <input
                  type="text"
                  placeholder="Поиск контактов..."
                  className={`w-full pl-12 pr-4 py-3 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-300`}
                  value={contactSearchQuery}
                  onChange={(e) => {
                    setContactSearchQuery(e.target.value);
                    if (e.target.value.length > 2) {
                      searchContacts(e.target.value);
                    } else {
                      setContacts([]);
                    }
                  }}
                />
              </div>

              {/* Contacts List */}
              <div className="max-h-60 overflow-y-auto rounded-2xl"
                style={{ 
                  scrollbarWidth: "thin",
                  scrollbarColor: `${theme === 'light' ? "gray white" : "white #1d293d"}`
                }}
              >
                {contacts.filter(c => !currentChat.members.includes(c.id)).length > 0 ? (
                  contacts.filter(c => !currentChat.members.includes(c.id)).map(contact => (
                    <div key={contact.id} className={`flex items-center justify-between p-4 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-all duration-300 group ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-700/50'}`} onClick={() => toggleContactSelection(contact)}>
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                          <UserCircle size={20} className="text-white" weight="fill" />
                        </div>
                        <div>
                          <div className={`font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{contact.displayName}</div>
                          <div className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>@{contact.id}</div>
                        </div>
                      </div>
                      <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${
                        selectedContacts.some(c => c.id === contact.id)
                          ? 'bg-blue-500 border-blue-500'
                          : `${theme === 'light' ? 'border-slate-300 group-hover:border-blue-500' : 'border-slate-600 group-hover:border-blue-500'}`
                      }`}>
                        {selectedContacts.some(c => c.id === contact.id) && (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <div className={`w-16 h-16 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-700'} rounded-2xl flex items-center justify-center mx-auto mb-3`}>
                      <Users size={24} className={`${theme === 'light' ? 'text-slate-400' : 'text-slate-400'}`} />
                    </div>
                    <p className={`${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Все подходящие контакты уже в чате</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className={`flex justify-end space-x-3 p-6 border-t ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <button
                onClick={() => { setShowInviteModal(false); setSelectedContacts([]); setContactSearchQuery(''); setContacts([]); }}
                className={`px-6 py-3 rounded-2xl ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
              >
                Отмена
              </button>
              <button
                onClick={() => inviteToChat(currentChat.id, selectedContacts.map(c => c.id))}
                className="px-6 py-3 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed"
                disabled={selectedContacts.length === 0}
              >
                Пригласить
              </button>
            </div>
          </div>
    </div>
  );
};

export default InviteModal;