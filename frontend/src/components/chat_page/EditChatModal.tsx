import { useAuth } from "../../pages/AuthContext";
import { X } from "phosphor-react";
import React from "react";
import type { Chat } from "../../types/chat";
import { getChatDisplayIcon } from "../../utils/chat";
import { useTheme } from '../../hooks/ThemeContext';

interface RenderEditChatModalProps {
    isEditModalVisible: boolean;
    currentChat: Chat | undefined;
    closeEditModal: () => void;
    showEditChatModal: boolean;
    editChatName: string;
    setEditChatName: React.Dispatch<React.SetStateAction<string>>;
    editChatDescription: string;
    setEditChatDescription: React.Dispatch<React.SetStateAction<string>>;
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
    setShowEditChatModal: React.Dispatch<React.SetStateAction<boolean>>;
} 

const RenderEditChatModal: React.FC<RenderEditChatModalProps> = ({
    isEditModalVisible,
    currentChat,
    closeEditModal,
    showEditChatModal,
    editChatName,
    setEditChatName,
    editChatDescription,
    setEditChatDescription,
    setChats,
    setShowEditChatModal,
}) => {
    const { theme, toggleTheme } = useTheme();
    const { token, username, refreshToken } = useAuth();
    const API_BASE = import.meta.env.VITE_API_BASE;
    
    const authHeaders = () => ({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    });

    if (!isEditModalVisible || !currentChat) {
      return null;
    }
    const handleEditChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentChat || !token) return;
        const trimmedName = editChatName.trim();
        if (!trimmedName) {
          console.error('Название чата не может быть пустым');
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/chat/chats/${currentChat.id}`, {
            method: 'PATCH',
            headers: {
              ...authHeaders(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: trimmedName,
              description: editChatDescription.trim() || null,
            }),
          });
          if (!res.ok) {
            console.error('Не удалось обновить чат');
            return;
          }
          const updatedChatData: Partial<Chat> = await res.json();
          setChats(prevChats =>
            prevChats.map(chat =>
              chat.id === currentChat.id
                ? { ...chat, ...updatedChatData }
                : chat
            )
          );
          setShowEditChatModal(false);
        } catch (err: any) {
          console.error('Ошибка сети при обновлении чата');
        }
    };

    return (
      <div
        className="fixed inset-0 transition-opacity duration-300 duration-300 ease-in-out z-[101]"
        onClick={closeEditModal}
      >
        <div
          className={`h-full w-[420px] ${theme === 'light' ? 'bg-white' : 'bg-gray-800'} shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col ${
            showEditChatModal ? 'translate-x-0' : 'translate-x-full'
          }`}
          onClick={(e) => e.stopPropagation()}
          style={{ marginLeft: 'auto' }}
        >
          <div className={`flex items-center justify-between p-4 border-b ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'} flex-shrink-0`}>
            <h3 className={`text-lg font-semibold ${theme === 'light' ? 'text-gray-900' : 'text-gray-100'}`}>Редактировать чат</h3>
            <button
              onClick={closeEditModal}
              className={`${theme === 'light' ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'}`}
              aria-label="Закрыть"
            >
              <X size={24} />
            </button>
          </div>
          <form onSubmit={handleEditChatSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="flex flex-col items-center mb-6">
                <div className={`mb-2 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'} text-6xl`}>
                  {getChatDisplayIcon(currentChat, 96, theme)}
                </div>
                <h4 className={`text-lg font-medium ${theme === 'light' ? 'text-gray-900' : 'text-gray-100'} text-center`}>
                  {currentChat.is_group || currentChat.is_channel
                    ? (currentChat.name || 'Без названия')
                    : 'Личный чат'}
                </h4>
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-chat-name" className={`block text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} mb-1`}>
                    Название
                  </label>
                  <input
                    type="text"
                    id="edit-chat-name"
                    value={editChatName}
                    onChange={(e) => setEditChatName(e.target.value)}
                    className={`w-full px-3 py-2 border ${theme === 'light' ? 'border-gray-300' : 'border-gray-600'} rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${theme === 'light' ? 'dark:bg-gray-700 dark:border-gray-600 dark:text-white' : 'bg-gray-700 border-gray-600 text-white'}`}
                    placeholder="Введите название чата"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-chat-description" className={`block text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} mb-1`}>
                    Описание
                  </label>
                  <textarea
                    id="edit-chat-description"
                    value={editChatDescription}
                    onChange={(e) => setEditChatDescription(e.target.value)}
                    rows={3}
                    className={`w-full px-3 py-2 border ${theme === 'light' ? 'border-gray-300' : 'border-gray-600'} rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${theme === 'light' ? 'dark:bg-gray-700 dark:border-gray-600 dark:text-white' : 'bg-gray-700 border-gray-600 text-white'}`}
                    placeholder="Введите описание чата (необязательно)"
                  />
                </div>
              </div>
            </div>
            <div className={`p-4 border-t ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'} flex-shrink-0`}>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className={`px-4 py-2 rounded-md ${theme === 'light' ? 'bg-gray-300 text-gray-800 hover:bg-gray-400' : 'bg-gray-600 text-gray-200 hover:bg-gray-500'} transition-colors`}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
};

export default RenderEditChatModal;