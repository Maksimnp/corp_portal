import { MagnifyingGlass, UserCircle, Users, Broadcast, X } from 'phosphor-react';
import type { Chat, Message, Contact } from '../../types/chat';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getChatDisplayIcon, getChatDisplayName } from '../../utils/chat';
import { useTheme } from '../../hooks/ThemeContext';
import ContactSearchModal from './modals/ContactSearchModal';
import CreateGroupModal from './modals/CreateGroupModal';
import CreateChannelModal from './modals/CreateChannelModal';
import InviteModal from './modals/InviteModal';
import KickModal from './modals/KickModal';
import LeaveModal from './modals/LeaveModal';
import DeleteChatModal from './modals/DeleteChatModal';
import ImageModal from './modals/ImageModal';
import DeleteMessageModal from './modals/DeleteMessageModal';
import ForwardMessageModal from './modals/ForwardMessageModal';
export interface RenderModalsProps {
  handleContextMenuQuote: () => void;
  showContactSearch: boolean;
  showCreateGroup: boolean;
  showCreateChannel: boolean;
  showInviteModal: boolean;
  showKickModal: boolean;
  showLeaveModal: boolean;
  showDeleteModal: boolean;
  showImageModal: boolean;
  showForwardMessageModal:boolean;

  contactSearchQuery: string;
  setContactSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchContacts: (query: string) => Promise<void>;
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  isLoadingContacts: boolean;
  contacts: Contact[];

  selectedContacts: Contact[];
  toggleContactSelection: (contact: Contact) => void;
  setSelectedContacts: React.Dispatch<React.SetStateAction<Contact[]>>;

  createPrivateChat: (contactId: string) => Promise<void>;
  createGroupChat: () => Promise<void>;
  createChannel: () => Promise<void>;

  groupName: string;
  setGroupName: React.Dispatch<React.SetStateAction<string>>;
  channelName: string;
  setChannelName: React.Dispatch<React.SetStateAction<string>>;
  channelDescription: string;
  setChannelDescription: React.Dispatch<React.SetStateAction<string>>;

  activeChat: string | null;
  currentChat: Chat | undefined;
  contactMap: { [key: string]: string };
  username: string | null;

  inviteToChat: (chatId: string, members: string[]) => Promise<void>;

  selectedToKick: string[];
  toggleKickSelection: (member: string) => void;
  setSelectedToKick: React.Dispatch<React.SetStateAction<string[]>>;
  kickFromChat: (chatId: string, members: string[]) => Promise<void>;

  leaveChat: (chatId: string) => Promise<void>;

  deleteChat: (chatId: string) => Promise<void>;
  deleteMessage: (msg: Message) => Promise<void>;
  imageUrl: Message | null;
  setImageUrl: React.Dispatch<React.SetStateAction<Message | null>>;

  setShowContactSearch: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCreateGroup: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCreateChannel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowInviteModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowKickModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLeaveModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowForwardMessageModal: React.Dispatch<React.SetStateAction<boolean>>;
  showDeleteMessageModal: boolean;
  setShowDeleteMessageModal: React.Dispatch<React.SetStateAction<boolean>>;
  messageToDelete: Message | null;
  setMessageToDelete: React.Dispatch<React.SetStateAction<Message | null>>;
  confirmDeleteMessage: () => Promise<void>;
  setQuotedMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  handleSendMessage: () => Promise<void>;
}

const RenderModals: React.FC<RenderModalsProps> = ({
  handleContextMenuQuote,
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
  setSelectedToKick,
  kickFromChat,
  setShowKickModal,
  showLeaveModal,
  setShowLeaveModal,
  leaveChat,
  showDeleteModal,
  setShowDeleteModal,
  deleteChat,
  showKickModal,
  showImageModal,
  imageUrl,
  setShowImageModal,
  deleteMessage,
  showDeleteMessageModal,
  setShowDeleteMessageModal,
  messageToDelete,
  setMessageToDelete,
  confirmDeleteMessage,
  setQuotedMessage,
  showForwardMessageModal,
  setShowForwardMessageModal,
  handleSendMessage
}) => {
  return (
    <>
      <ContactSearchModal
        showContactSearch={showContactSearch}
        contactSearchQuery={contactSearchQuery}
        setContactSearchQuery={setContactSearchQuery}
        searchContacts={searchContacts}
        setContacts={setContacts}
        isLoadingContacts={isLoadingContacts}
        contacts={contacts}
        showCreateGroup={showCreateGroup}
        showCreateChannel={showCreateChannel}
        showInviteModal={showInviteModal}
        toggleContactSelection={toggleContactSelection}
        createPrivateChat={createPrivateChat}
        selectedContacts={selectedContacts}
        setShowContactSearch={setShowContactSearch}
        setShowCreateGroup={setShowCreateGroup}
        setShowCreateChannel={setShowCreateChannel}
        setShowInviteModal={setShowInviteModal}
        setSelectedContacts={setSelectedContacts}
        createGroupChat={createGroupChat}
        createChannel={createChannel}
        activeChat={activeChat}
        inviteToChat={inviteToChat}
      />

      <CreateGroupModal
        showCreateGroup={showCreateGroup}
        groupName={groupName}
        setGroupName={setGroupName}
        contactSearchQuery={contactSearchQuery}
        setContactSearchQuery={setContactSearchQuery}
        searchContacts={searchContacts}
        contacts={contacts}
        selectedContacts={selectedContacts}
        toggleContactSelection={toggleContactSelection}
        createGroupChat={createGroupChat}
        setShowCreateGroup={setShowCreateGroup}
        setContacts={setContacts}
        setSelectedContacts={setSelectedContacts}
      />

      <CreateChannelModal
        showCreateChannel={showCreateChannel}
        channelName={channelName}
        setChannelName={setChannelName}
        channelDescription={channelDescription}
        setChannelDescription={setChannelDescription}
        createChannel={createChannel}
        setShowCreateChannel={setShowCreateChannel}
      />

      <InviteModal
        showInviteModal={showInviteModal}
        currentChat={currentChat}
        contactMap={contactMap}
        username={username}
        contactSearchQuery={contactSearchQuery}
        setContactSearchQuery={setContactSearchQuery}
        searchContacts={searchContacts}
        contacts={contacts}
        selectedContacts={selectedContacts}
        toggleContactSelection={toggleContactSelection}
        inviteToChat={inviteToChat}
        setShowInviteModal={setShowInviteModal}
        setSelectedContacts={setSelectedContacts}
        setContacts={setContacts}
      />

      <KickModal
        showKickModal={showKickModal}
        currentChat={currentChat}
        contactMap={contactMap}
        username={username}
        selectedToKick={selectedToKick}
        toggleKickSelection={toggleKickSelection}
        kickFromChat={kickFromChat}
        setShowKickModal={setShowKickModal}
        setSelectedToKick={setSelectedToKick}
      />

      <LeaveModal
        showLeaveModal={showLeaveModal}
        currentChat={currentChat}
        contactMap={contactMap}
        username={username}
        leaveChat={leaveChat}
        setShowLeaveModal={setShowLeaveModal}
      />

      <ImageModal
        handleContextMenuQuote={handleContextMenuQuote}
        showImageModal={showImageModal}
        imageUrl={imageUrl}
        setShowImageModal={setShowImageModal}
        currentChat={currentChat}
        contactMap={contactMap}
        username={username}
        deleteMessage={deleteMessage}
        setQuotedMessage={setQuotedMessage}
      />

      <DeleteMessageModal
        currentChat={currentChat}
        showDeleteMessageModal={showDeleteMessageModal}
        setShowDeleteMessageModal={setShowDeleteMessageModal}
        messageToDelete={messageToDelete}
        setMessageToDelete={setMessageToDelete}
        confirmDeleteMessage={confirmDeleteMessage}
      />
      <DeleteChatModal
        showDeleteModal={showDeleteModal}
        currentChat={currentChat}
        contactMap={contactMap}
        username={username}
        deleteChat={deleteChat}
        setShowDeleteModal={setShowDeleteModal}
      />
      <ForwardMessageModal
        showForwardMessageModal={showForwardMessageModal}
        setShowForwardMessageModal={setShowForwardMessageModal}
        currentChat={currentChat}
        contactSearchQuery={contactSearchQuery}
        setContactSearchQuery={setContactSearchQuery}
        searchContacts={searchContacts}
        contacts={contacts}
        selectedContacts={selectedContacts}
        toggleContactSelection={toggleContactSelection}
        setSelectedContacts={setSelectedContacts}
        setContacts={setContacts}
        handleSendMessage={handleSendMessage}
      />
    </>
  );
};

export default RenderModals;