import React from "react";
import { getChatDisplayIcon, getChatDisplayName } from '../../utils/chat'
import { UserCircle, X } from 'phosphor-react';
import { EditOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { Chat } from '../../types/chat';
import RenderEditChatModal from "./EditChatModal";
import { useTheme } from '../../hooks/ThemeContext';

interface RenderChatInfoSidebarProps {
    currentChat: Chat | undefined;
    isSidebarVisible: boolean;
    showChatInfoSidebar: boolean;
    openEditChatModal: () => void;
    setShowChatInfoSidebar: React.Dispatch<React.SetStateAction<boolean>>;
    contactMap: { [key: string]: string };
    userStatuses: { [username: string]: string };
    handleUserContextMenu: (event: React.MouseEvent, userId: string) => void;
    leaveChat: (chatId: string) => Promise<void>;
    isEditModalVisible: boolean;
    closeEditModal: () => void;
    showEditChatModal: boolean;
    editChatName: string;
    setEditChatName: React.Dispatch<React.SetStateAction<string>>;
    editChatDescription: string;
    setEditChatDescription: React.Dispatch<React.SetStateAction<string>>;
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
    setShowEditChatModal: React.Dispatch<React.SetStateAction<boolean>>;
    username: string | null;
}

const RenderChatInfoSidebar: React.FC<RenderChatInfoSidebarProps> = ({
    currentChat,
    isSidebarVisible,
    showChatInfoSidebar,
    openEditChatModal,
    setShowChatInfoSidebar,
    contactMap,
    userStatuses,
    handleUserContextMenu,
    leaveChat,
    isEditModalVisible,
    closeEditModal,
    showEditChatModal,
    editChatName,
    setEditChatName,
    editChatDescription,
    setEditChatDescription,
    setChats,
    setShowEditChatModal,
    username,
}) => {
    const { theme, toggleTheme } = useTheme();
    
    if (!currentChat || !isSidebarVisible) {
      return null;
    }
    return (
      <div
        className={`h-full w-[390px] ${theme === 'light' ? 'bg-white' : 'bg-gray-800'} shadow-xl transform transition-transform duration-500 ease-out ${
          showChatInfoSidebar ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          zIndex: 40,
          height: '100%'
        }}
      >
        <RenderEditChatModal
            isEditModalVisible={isEditModalVisible}
            currentChat={currentChat}
            closeEditModal={closeEditModal}
            showEditChatModal={showEditChatModal}
            editChatName={editChatName}
            setEditChatName={setEditChatName}
            editChatDescription={editChatDescription}
            setEditChatDescription={setEditChatDescription}
            setChats={setChats}
            setShowEditChatModal={setShowEditChatModal}
        />
        <div className={`flex items-center justify-between p-4 border-b ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
          <h3 className={`text-lg font-semibold ${theme === 'light' ? 'text-gray-900' : 'text-gray-100'}`}>Информация о чате</h3>
          <div className=''>
            {username === currentChat.creator_username && (<button
              className={`${theme === 'light' ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'} cursor-pointer`}
              onClick={openEditChatModal}
            >
              <EditOutlined className="text-2xl mr-4" />
            </button>)}
            <button
              onClick={() => setShowChatInfoSidebar(false)}
              className={`${theme === 'light' ? 'text-gray-500 cursor-pointer hover:text-gray-700' : 'text-gray-400 cursor-pointer hover:text-gray-200'}`}
              aria-label="Закрыть"
            >
              <X size={24} />
            </button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-65px)]">
          <div className="mb-6">
            <div className="flex flex-col items-center mb-4">
              <div className={`${theme === 'light' ? 'text-gray-500' : 'text-gray-400'} text-9xl mb-2`}>
                {getChatDisplayIcon(currentChat, 180, theme)}
              </div>
              <h4 className={`text-xl font-bold ${theme === 'light' ? 'text-gray-900' : 'text-gray-100'}`}>
                {getChatDisplayName(currentChat, 'full', contactMap, username)}
              </h4>
              <div className="text-sm">
                <div className={`${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Участники ({currentChat.members?.length || 0})</div>
              </div>
              {currentChat.description && (
                <div className='flex justify-start w-full gap-8 pl-5 pb-2 mt-12 rounded-xl hover:bg-gray-100'>
                  <InfoCircleOutlined className='text-2xl text-gray-600'/>
                  <div>
                    <p className={`text-lg mt-1 ${theme === 'light' ? 'text-black' : 'text-gray-400'}`}>{currentChat.description}</p>
                    <p className={`text-xs ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>Информация</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mb-6">
            <h5 className={`text-md font-semibold mb-2 ${theme === 'light' ? 'text-gray-900' : 'text-gray-100'}`}>Участники</h5>
            <div className="space-y-2 max-h-1/2 overflow-y-auto">
              {currentChat.members && currentChat.members.length > 0 ? (
                currentChat.members.map((member, index) => (
                  <div
                    key={index}
                    id={`user-${index}`}
                    className={`flex items-center p-2 rounded cursor-pointer ${theme === 'light' ? 'hover:bg-gray-100' : 'hover:bg-gray-700'}`}
                    onContextMenu={(e) => handleUserContextMenu(e, member)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className='relative'>
                      <UserCircle size={26} className={`mr-2 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'} flex-shrink-0`} />
                      {userStatuses[member] === "online" && (
                        <div
                          className="absolute bottom-[3px] right-[5px] block h-2 w-2 rounded-full ring-2 ring-white bg-blue-500"
                        />
                      )}
                    </div>
                    <span className={`truncate ${theme === 'light' ? 'text-black': 'text-white'}`}>{contactMap[member] || member}</span>
                    {currentChat.creator_username === member && (
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${theme === 'light' ? 'bg-blue-100 text-blue-800' : 'bg-blue-900 text-blue-100'}`}>
                        Админ
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p className={`text-sm ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Нет участников</p>
              )}
            </div>
          </div>
          {(currentChat.is_group || currentChat.is_channel) && (
            <div className={`pt-4 border-t ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
              {currentChat.creator_username !== username ? (
                <button
                  onClick={() => {leaveChat(currentChat.id)}}
                  className="w-full py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                >
                  Покинуть чат
                </button>
              ) : (
                <p className={`text-sm text-center ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                  Вы являетесь создателем этого чата.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

export default RenderChatInfoSidebar;