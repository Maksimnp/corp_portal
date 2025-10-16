// components/modals/CreateGroupModal.tsx
import React from 'react';
import { Users, UserCircle, X, MagnifyingGlass } from 'phosphor-react';
import type { Contact } from '../../../types/chat';
import { useTheme } from '../../../hooks/ThemeContext';

interface CreateGroupModalProps {
  showCreateGroup: boolean;
  groupName: string;
  setGroupName: React.Dispatch<React.SetStateAction<string>>;
  contactSearchQuery: string;
  setContactSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchContacts: (query: string) => Promise<void>;
  contacts: Contact[];
  selectedContacts: Contact[];
  toggleContactSelection: (contact: Contact) => void;
  createGroupChat: () => Promise<void>;
  setShowCreateGroup: React.Dispatch<React.SetStateAction<boolean>>;
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  setSelectedContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  showCreateGroup,
  groupName,
  setGroupName,
  contactSearchQuery,
  setContactSearchQuery,
  searchContacts,
  contacts,
  selectedContacts,
  toggleContactSelection,
  createGroupChat,
  setShowCreateGroup,
  setContacts,
  setSelectedContacts,
}) => {
  const { theme } = useTheme();

  if (!showCreateGroup) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
      <div className={`${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-lg border animate-in zoom-in-95`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                  <Users size={20} className="text-white" weight="fill" />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Создать новую группу</h3>
                  <p className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} mt-1`}>Добавьте участников и название</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCreateGroup(false);
                  setGroupName('');
                  setSelectedContacts([]);
                  setContactSearchQuery('');
                  setContacts([]);
                }}
                className={`w-8 h-8 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'} transition-colors flex items-center justify-center`}
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <input
                type="text"
                placeholder="Название группы"
                className={`w-full px-4 py-3 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-green-500/30 focus:border-green-500 transition-all duration-300`}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />

              <div className="relative">
                <MagnifyingGlass size={20} className={`absolute left-4 top-1/2 transform -translate-y-1/2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-400'}`} />
                <input
                  type="text"
                  placeholder="Поиск контактов для добавления..."
                  className={`w-full pl-12 pr-4 py-3 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-green-500/30 focus:border-green-500 transition-all duration-300`}
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

              {/* Selected Contacts */}
              {selectedContacts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedContacts.map(contact => (
                    <div key={contact.id} className={`flex items-center space-x-2 ${theme === 'light' ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'} px-3 py-2 rounded-2xl text-sm`}>
                      <span>{contact.displayName}</span>
                      <button
                        onClick={() => toggleContactSelection(contact)}
                        className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs"
                      >
                        <X size={10} weight="bold" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Contacts List */}
              <div className="max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent rounded-2xl">
                {contacts.map(contact => (
                  <div key={contact.id} className={`flex items-center justify-between p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-all duration-300 group ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-700/50'}`} onClick={() => toggleContactSelection(contact)}>
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                        <UserCircle size={16} className="text-white" weight="fill" />
                      </div>
                      <div>
                        <div className={`font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{contact.displayName}</div>
                        <div className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>@{contact.id}</div>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${
                      selectedContacts.some(c => c.id === contact.id)
                        ? 'bg-green-500 border-green-500'
                        : `${theme === 'light' ? 'border-slate-300 group-hover:border-green-500' : 'border-slate-600 group-hover:border-green-500'}`
                    }`}>
                      {selectedContacts.some(c => c.id === contact.id) && (
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className={`flex justify-end space-x-3 p-6 border-t ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <button
                onClick={() => {
                  setShowCreateGroup(false);
                  setGroupName('');
                  setSelectedContacts([]);
                  setContactSearchQuery('');
                  setContacts([]);
                }}
                className={`px-6 py-3 rounded-2xl ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
              >
                Отмена
              </button>
              <button
                onClick={createGroupChat}
                className="px-6 py-3 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed"
                disabled={!groupName.trim() || selectedContacts.length < 1}
              >
                Создать группу
              </button>
            </div>
          </div>
    </div>
  );
};

export default CreateGroupModal;