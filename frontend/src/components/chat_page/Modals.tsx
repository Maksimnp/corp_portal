import { MagnifyingGlass, UserCircle, Users, Broadcast, X } from 'phosphor-react';
import type { Chat, Message, Contact } from '../../types/chat';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getChatDisplayIcon, getChatDisplayName } from '../../utils/chat';
import { useTheme } from '../../hooks/ThemeContext';

interface RenderModalsProps {
  showContactSearch: boolean;
  showCreateGroup: boolean;
  contactSearchQuery: string;
  setContactSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchContacts: (query: string) => Promise<void>;
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  isLoadingContacts: boolean;
  contacts: Contact[];
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
  groupName: string;
  setGroupName: React.Dispatch<React.SetStateAction<string>>;
  channelName: string;
  setChannelName: React.Dispatch<React.SetStateAction<string>>;
  channelDescription: string;
  setChannelDescription: React.Dispatch<React.SetStateAction<string>>;
  currentChat: Chat | undefined;
  contactMap: { [key: string]: string };
  username: string | null;
  selectedToKick: string[];
  toggleKickSelection: (member: string) => void;
  showKickModal: boolean;
  setShowKickModal: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedToKick: React.Dispatch<React.SetStateAction<string[]>>;
  kickFromChat: (chatId: string, members: string[]) => Promise<void>;
  showLeaveModal: boolean;
  setShowLeaveModal: React.Dispatch<React.SetStateAction<boolean>>;
  leaveChat: (chatId: string) => Promise<void>;
  showDeleteModal: boolean;
  setShowDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  deleteChat: (chatId: string) => Promise<void>;
  showImageModal: boolean;
  setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const RenderModals: React.FC<RenderModalsProps> = ({
  showContactSearch,
  showCreateGroup,
  contactSearchQuery,
  setContactSearchQuery,
  searchContacts,
  setContacts,
  isLoadingContacts,
  contacts,
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
  groupName,
  setGroupName,
  channelName,
  setChannelName,
  channelDescription,
  setChannelDescription,
  currentChat,
  contactMap,
  username,
  selectedToKick,
  toggleKickSelection,
  showKickModal,
  setShowKickModal,
  setSelectedToKick,
  kickFromChat,
  showLeaveModal,
  setShowLeaveModal,
  leaveChat,
  showDeleteModal,
  setShowDeleteModal,
  deleteChat,
  showImageModal,
  setShowImageModal
}) => {
    const { theme, toggleTheme } = useTheme();
    
    // Contact Search Modal
    if (showContactSearch && !showCreateGroup) {
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
    }

    // Create Group Modal
    if (showCreateGroup) {
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
    }

    // Create Channel Modal
    if (showCreateChannel) {
      return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
          <div className={`${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-lg border animate-in zoom-in-95`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Broadcast size={20} className="text-white" weight="fill" />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Создать новый канал</h3>
                  <p className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} mt-1`}>Для публикаций и объявлений</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCreateChannel(false);
                  setChannelName('');
                  setChannelDescription('');
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
                placeholder="Название канала"
                className={`w-full px-4 py-3 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-purple-500/30 focus:border-purple-500 transition-all duration-300`}
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
              />
              <textarea
                placeholder="Описание канала (необязательно)"
                className={`w-full px-4 py-3 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-purple-500/30 focus:border-purple-500 transition-all duration-300 resize-none h-32`}
                value={channelDescription}
                onChange={(e) => setChannelDescription(e.target.value)}
              />
            </div>

            {/* Footer */}
            <div className={`flex justify-end space-x-3 p-6 border-t ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <button
                onClick={() => {
                  setShowCreateChannel(false);
                  setChannelName('');
                  setChannelDescription('');
                }}
                className={`px-6 py-3 rounded-2xl ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
              >
                Отмена
              </button>
              <button
                onClick={createChannel}
                className="px-6 py-3 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed"
                disabled={!channelName.trim()}
              >
                Создать канал
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Invite Modal
    if (showInviteModal && currentChat) {
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
    }

    // Kick Modal
    if (showKickModal && currentChat) {
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
    }

    // Leave Modal
    if (showLeaveModal && currentChat) {
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
    }

    // Delete Modal
    if (showDeleteModal && currentChat) {
      return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
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
    }

    return null;
};

export default RenderModals;