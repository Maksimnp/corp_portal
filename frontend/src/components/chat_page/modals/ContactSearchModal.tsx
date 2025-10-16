// components/modals/ContactSearchModal.tsx
import React from 'react';
import { MagnifyingGlass, UserCircle, X } from 'phosphor-react';
import type { Contact } from '../../../types/chat';
import { useTheme } from '../../../hooks/ThemeContext';

interface ContactSearchModalProps {
  showContactSearch: boolean;
  contactSearchQuery: string;
  setContactSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchContacts: (query: string) => Promise<void>;
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  isLoadingContacts: boolean;
  contacts: Contact[];
  showCreateGroup: boolean;
  showCreateChannel: boolean;
  showInviteModal: boolean;
  toggleContactSelection: (contact: Contact) => void;
  createPrivateChat: (contactId: string) => Promise<void>;
  selectedContacts: Contact[];
  setShowContactSearch: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCreateGroup: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCreateChannel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowInviteModal: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  createGroupChat: () => Promise<void>;
  createChannel: () => Promise<void>;
  activeChat: string | null;
  inviteToChat: (chatId: string, members: string[]) => Promise<void>;
}

const ContactSearchModal: React.FC<ContactSearchModalProps> = ({
  showContactSearch,
  contactSearchQuery,
  setContactSearchQuery,
  searchContacts,
  setContacts,
  isLoadingContacts,
  contacts,
  showCreateGroup,
  showCreateChannel,
  showInviteModal,
  toggleContactSelection,
  createPrivateChat,
  selectedContacts,
  setShowContactSearch,
  setShowCreateGroup,
  setShowCreateChannel,
  setShowInviteModal,
  setSelectedContacts,
  createGroupChat,
  createChannel,
  activeChat,
  inviteToChat,
}) => {
  const { theme } = useTheme();

  if (!showContactSearch) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
      <div className={`${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-lg border animate-in zoom-in-95`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <UserCircle size={20} className="text-white" weight="fill" />
            </div>
            <div>
              <h3 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Начать чат с контактом</h3>
              <p className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} mt-1`}>Найдите пользователя для начала диалога</p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowContactSearch(false);
              setContactSearchQuery('');
              setContacts([]);
            }}
            className={`w-8 h-8 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'} transition-colors flex items-center justify-center`}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        {/* Search */}
        <div className="p-6">
          <div className="relative mb-4">
            <MagnifyingGlass size={20} className={`absolute left-4 top-1/2 transform -translate-y-1/2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder="Поиск по ФИО или логину..."
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
          <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent rounded-2xl">
            {isLoadingContacts ? (
              <div className="flex justify-center py-8">
                <div className={`w-6 h-6 border-2 ${theme === 'light' ? 'border-slate-300' : 'border-slate-600'} border-t-blue-500 rounded-full animate-spin`}></div>
              </div>
            ) : contacts.length > 0 ? (
              contacts.map(contact => (
                <div
                  key={contact.id}
                  className={`flex items-center justify-between p-4 rounded-2xl ${theme === "light" ? "hover:bg-slate-100 hover:border-slate-200/40" : 'hover:bg-slate-700/50 hover:border-slate-600/40'} cursor-pointer transition-all duration-300 group border border-transparent`}
                  onClick={() => {
                    if (showCreateGroup || showCreateChannel || showInviteModal) {
                      toggleContactSelection(contact);
                    } else {
                      createPrivateChat(contact.id);
                    }
                  }}
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                      <UserCircle size={20} className="text-white" weight="fill" />
                    </div>
                    <div>
                      <div className={`font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{contact.displayName}</div>
                      <div className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>@{contact.id}</div>
                    </div>
                  </div>
                  {(showCreateGroup || showCreateChannel || showInviteModal) && (
                    <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${
                      selectedContacts.some(c => c.id === contact.id)
                        ? 'bg-blue-500 border-blue-500'
                        : `${theme === 'light' ? 'border-slate-300 group-hover:border-blue-500' : 'border-slate-600 group-hover:border-blue-500'}`
                    }`}>
                      {selectedContacts.some(c => c.id === contact.id) && (
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className={`w-16 h-16 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-700'} rounded-2xl flex items-center justify-center mx-auto mb-3`}>
                  <UserCircle size={24} className={`${theme === 'light' ? 'text-slate-400' : 'text-slate-400'}`} />
                </div>
                <p className={`${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Контакты не найдены</p>
              </div>
            )}
          </div>
        </div>
        {/* Footer */}
        <div className={`flex justify-end space-x-3 p-6 border-t ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
          <button
            onClick={() => {
              setShowContactSearch(false);
              setContactSearchQuery('');
              setContacts([]);
              if (showCreateGroup || showCreateChannel) {
                setShowCreateGroup(false);
                setShowCreateChannel(false);
              }
              if (showInviteModal) {
                setShowInviteModal(false);
                setSelectedContacts([]);
              }
            }}
            className={`px-6 py-3 rounded-2xl ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
          >
            Отмена
          </button>
          {(showCreateGroup || showCreateChannel || showInviteModal) && (
            <button
              onClick={() => {
                if (showCreateGroup) createGroupChat();
                if (showCreateChannel) createChannel();
                if (showInviteModal && activeChat) inviteToChat(activeChat, selectedContacts.map(c => c.id));
              }}
              className="px-6 py-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed"
              disabled={selectedContacts.length === 0}
            >
              Готово
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactSearchModal;