import React from 'react';
import { MagnifyingGlass, UserCircle } from 'phosphor-react';
import type { Chat, Contact } from '../../types/chat';

interface ModalsProps {
  showContactSearch: boolean;
  setShowContactSearch: React.Dispatch<React.SetStateAction<boolean>>;
  showCreateGroup: boolean;
  setShowCreateGroup: React.Dispatch<React.SetStateAction<boolean>>;
  showCreateChannel: boolean;
  setShowCreateChannel: React.Dispatch<React.SetStateAction<boolean>>;
  showInviteModal: boolean;
  setShowInviteModal: React.Dispatch<React.SetStateAction<boolean>>;
  showKickModal: boolean;
  setShowKickModal: React.Dispatch<React.SetStateAction<boolean>>;
  showLeaveModal: boolean;
  setShowLeaveModal: React.Dispatch<React.SetStateAction<boolean>>;
  showDeleteModal: boolean;
  setShowDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  contacts: Contact[];
  contactSearchQuery: string;
  setContactSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  isLoadingContacts: boolean;
  selectedContacts: Contact[];
  setSelectedContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  selectedToKick: string[];
  setSelectedToKick: React.Dispatch<React.SetStateAction<string[]>>; // Добавлено
  groupName: string;
  setGroupName: React.Dispatch<React.SetStateAction<string>>;
  channelName: string;
  setChannelName: React.Dispatch<React.SetStateAction<string>>;
  channelDescription: string;
  setChannelDescription: React.Dispatch<React.SetStateAction<string>>;
  currentChat: Chat | undefined;
  username: string | null;
  contactMap: { [key: string]: string };
  searchContacts: (query: string) => void;
  createPrivateChat: (contactId: string, setChats: React.Dispatch<React.SetStateAction<Chat[]>>, setActiveChat: React.Dispatch<React.SetStateAction<string | null>>) => void; // Добавлено
  createGroupChat: (groupName: string, members: string[], setChats: React.Dispatch<React.SetStateAction<Chat[]>>, setActiveChat: React.Dispatch<React.SetStateAction<string | null>>) => void; // Обновлено
  createChannel: (channelName: string, channelDescription: string, setChats: React.Dispatch<React.SetStateAction<Chat[]>>, setActiveChat: React.Dispatch<React.SetStateAction<string | null>>) => void; // Обновлено
  inviteToChat: (chatId: string, members: string[], setChats: React.Dispatch<React.SetStateAction<Chat[]>>) => void;
  kickFromChat: (chatId: string, members: string[], setChats: React.Dispatch<React.SetStateAction<Chat[]>>) => void;
  leaveChat: (chatId: string, setChats: React.Dispatch<React.SetStateAction<Chat[]>>, setActiveChat: React.Dispatch<React.SetStateAction<string | null>>) => void;
  deleteChat: (chatId: string, setChats: React.Dispatch<React.SetStateAction<Chat[]>>, setActiveChat: React.Dispatch<React.SetStateAction<string | null>>) => void;
  toggleContactSelection: (contact: Contact) => void;
  toggleKickSelection: (member: string) => void;
}

const Modals: React.FC<ModalsProps> = ({
  showContactSearch,
  setShowContactSearch,
  showCreateGroup,
  setShowCreateGroup,
  showCreateChannel,
  setShowCreateChannel,
  showInviteModal,
  setShowInviteModal,
  showKickModal,
  setShowKickModal,
  showLeaveModal,
  setShowLeaveModal,
  showDeleteModal,
  setShowDeleteModal,
  contacts,
  contactSearchQuery,
  setContactSearchQuery,
  isLoadingContacts,
  selectedContacts,
  setSelectedContacts,
  selectedToKick,
  setSelectedToKick,
  groupName,
  setGroupName,
  channelName,
  setChannelName,
  channelDescription,
  setChannelDescription,
  currentChat,
  username,
  contactMap,
  searchContacts,
  createPrivateChat,
  createGroupChat,
  createChannel,
  inviteToChat,
  kickFromChat,
  leaveChat,
  deleteChat,
  toggleContactSelection,
  toggleKickSelection,
}) => {
  const getChatDisplayName = (chat: Chat) => {
    if (chat.is_group || chat.is_channel) {
      return chat.name || `Чат ${chat.id.slice(0, 4)}`;
    }
    const otherMember = chat.members.find(m => m !== username);
    return otherMember ? contactMap[otherMember] || otherMember : 'Личный чат';
  };

  if (showContactSearch) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Начать чат с контактом</h3>
          <div className="relative mb-4">
            <MagnifyingGlass size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по ФИО или логину..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={contactSearchQuery}
              onChange={(e) => {
                setContactSearchQuery(e.target.value);
                if (e.target.value.length > 2) {
                  searchContacts(e.target.value);
                } else {
                  setSelectedContacts([]);
                }
              }}
            />
          </div>
          {isLoadingContacts ? (
            <div className="text-center text-gray-500">Поиск...</div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {contacts.length > 0 ? (
                contacts.map(contact => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    onClick={() => {
                      if (showCreateGroup || showCreateChannel || showInviteModal) {
                        toggleContactSelection(contact);
                      } else {
                        createPrivateChat(contact.id, setChats, setActiveChat);
                      }
                    }}
                  >
                    <div className="flex items-center">
                      <UserCircle size={24} className="mr-3 text-gray-500" />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{contact.displayName}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{contact.id}</div>
                      </div>
                    </div>
                    {(showCreateGroup || showCreateChannel || showInviteModal) && (
                      <input
                        type="checkbox"
                        checked={selectedContacts.some(c => c.id === contact.id)}
                        onChange={() => toggleContactSelection(contact)}
                        className="form-checkbox text-indigo-600 h-5 w-5"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500">Контакты не найдены</div>
              )}
            </div>
          )}
          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={() => {
                setShowContactSearch(false);
                setContactSearchQuery('');
                setSelectedContacts([]);
                if (showCreateGroup || showCreateChannel) {
                  setShowCreateGroup(false);
                  setShowCreateChannel(false);
                }
                if (showInviteModal) {
                  setShowInviteModal(false);
                  setSelectedContacts([]);
                }
              }}
              className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Отмена
            </button>
            {(showCreateGroup || showCreateChannel || showInviteModal) && (
              <button
                onClick={() => {
                  if (showCreateGroup) createGroupChat(groupName, selectedContacts.map(c => c.id), setChats, setActiveChat);
                  if (showCreateChannel) createChannel(channelName, channelDescription, setChats, setActiveChat);
                  if (showInviteModal && currentChat) inviteToChat(currentChat.id, selectedContacts.map(c => c.id));
                }}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
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

  if (showCreateGroup) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Создать новую группу</h3>
          <input
            type="text"
            placeholder="Название группы"
            className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <div className="relative mb-4">
            <MagnifyingGlass size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск контактов для добавления..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={contactSearchQuery}
              onChange={(e) => {
                setContactSearchQuery(e.target.value);
                if (e.target.value.length > 2) {
                  searchContacts(e.target.value);
                } else {
                  setSelectedContacts([]);
                }
              }}
            />
          </div>
          {isLoadingContacts ? (
            <div className="text-center text-gray-500">Поиск...</div>
          ) : (
            <div className="max-h-40 overflow-y-auto mb-4">
              {contacts.map(contact => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  onClick={() => toggleContactSelection(contact)}
                >
                  <div className="flex items-center">
                    <UserCircle size={24} className="mr-3 text-gray-500" />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{contact.displayName}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{contact.id}</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedContacts.some(c => c.id === contact.id)}
                    onChange={() => toggleContactSelection(contact)}
                    className="form-checkbox text-indigo-600 h-5 w-5"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={() => {
                setShowCreateGroup(false);
                setGroupName('');
                setSelectedContacts([]);
                setContactSearchQuery('');
              }}
              className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => createGroupChat(groupName, selectedContacts.map(c => c.id), setChats, setActiveChat)}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              disabled={!groupName.trim() || selectedContacts.length < 1}
            >
              Создать
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showCreateChannel) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Создать новый канал</h3>
          <input
            type="text"
            placeholder="Название канала"
            className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
          />
          <textarea
            placeholder="Описание канала (необязательно)"
            className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={channelDescription}
            onChange={(e) => setChannelDescription(e.target.value)}
          />
          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={() => {
                setShowCreateChannel(false);
                setChannelName('');
                setChannelDescription('');
              }}
              className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => createChannel(channelName, channelDescription, setChats, setActiveChat)}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              disabled={!channelName.trim()}
            >
              Создать
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showInviteModal && currentChat) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Пригласить в {getChatDisplayName(currentChat)}</h3>
          <div className="relative mb-4">
            <MagnifyingGlass size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск контактов..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={contactSearchQuery}
              onChange={(e) => {
                setContactSearchQuery(e.target.value);
                if (e.target.value.length > 2) {
                  searchContacts(e.target.value);
                } else {
                  setSelectedContacts([]);
                }
              }}
            />
          </div>
          {isLoadingContacts ? (
            <div className="text-center text-gray-500">Поиск...</div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {contacts.filter(c => !currentChat.members.includes(c.id)).length > 0 ? (
                contacts
                  .filter(c => !currentChat.members.includes(c.id))
                  .map(contact => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                      onClick={() => toggleContactSelection(contact)}
                    >
                      <div className="flex items-center">
                        <UserCircle size={24} className="mr-3 text-gray-500" />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{contact.displayName}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{contact.id}</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedContacts.some(c => c.id === contact.id)}
                        onChange={() => toggleContactSelection(contact)}
                        className="form-checkbox text-indigo-600 h-5 w-5"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  ))
              ) : (
                <div className="text-center text-gray-500">Все подходящие контакты уже в чате</div>
              )}
            </div>
          )}
          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={() => {
                setShowInviteModal(false);
                setSelectedContacts([]);
                setContactSearchQuery('');
              }}
              className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => inviteToChat(currentChat.id, selectedContacts.map(c => c.id))}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              disabled={selectedContacts.length === 0}
            >
              Пригласить
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showKickModal && currentChat) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Исключить из {getChatDisplayName(currentChat)}</h3>
          <div className="max-h-60 overflow-y-auto mb-4">
            {currentChat.members
              .filter(member => member !== username)
              .map(member => (
                <div
                  key={member}
                  className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  onClick={() => toggleKickSelection(member)}
                >
                  <div className="flex items-center">
                    <UserCircle size={24} className="mr-3 text-gray-500" />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{contactMap[member] || member}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{member}</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedToKick.includes(member)}
                    onChange={() => toggleKickSelection(member)}
                    className="form-checkbox text-indigo-600 h-5 w-5"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ))}
          </div>
          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={() => {
                setShowKickModal(false);
                setSelectedToKick([]);
              }}
              className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => kickFromChat(currentChat.id, selectedToKick)}
              className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              disabled={selectedToKick.length === 0}
            >
              Исключить
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showLeaveModal && currentChat) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Покинуть {getChatDisplayName(currentChat)}?</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">Вы уверены, что хотите покинуть этот чат? Вы не сможете вернуться, если вас не пригласят снова.</p>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowLeaveModal(false)}
              className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => leaveChat(currentChat.id)}
              className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Покинуть
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showDeleteModal && currentChat) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Удалить {getChatDisplayName(currentChat)}?</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить.</p>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 rounded-md bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => deleteChat(currentChat.id)}
              className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Удалить
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Modals;