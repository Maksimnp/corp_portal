import React, { useEffect, useRef, useState } from "react";
import type { Chat, Message, Contact, LastMessage } from '../../types/chat';
import { formatDate } from '../../utils/chat';
import RenderMessageItem from "./MessageItem";

interface RenderMessagesProps {
    currentChat: Chat | undefined;
    activeChat: string | null;
    filteredMessages: Message[];
    quotedMessageData: Record<string, Message | null>;
    contactMap: Record<string, string>;
    handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
    fetchQuotedMessageData: (id: string) => Promise<Message | null>;
    username: string | null;
    setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
    loadMessagesAround: (messageId: string) => Promise<void>;
    setImageUrl: React.Dispatch<React.SetStateAction<Message | null>>;
    handleContextMenuQuote: () => void;
    onReact: (reaction: string) => void;
    onMessageInView: (messageId: string, channelId: string) => void;
    unreadReactionNotifications: Record<string, string[]>;
    onReactionInView: (messageId: string, channelId: string) => void;
    unreadCounts: { [key: string]: number };
}

const RenderMessages: React.FC<RenderMessagesProps> = ({
    filteredMessages,
    activeChat,
    quotedMessageData,
    contactMap,
    handleMessageContextMenu,
    fetchQuotedMessageData,
    username,
    setShowImageModal,
    loadMessagesAround,
    setImageUrl,
    handleContextMenuQuote,
    currentChat,
    onReact,
    onMessageInView,
    unreadReactionNotifications,
    onReactionInView,
    unreadCounts
}) => {
    let lastDate = '';

    // const [showUnreadMarker, setShowUnreadMarker] = useState(true);
    // const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
    // const unreadMarkerRef = useRef<HTMLDivElement>(null);
    // const timerRef = useRef<NodeJS.Timeout | null>(null);

    const messagesWithGroupInfo = filteredMessages.map((msg, index) => {
      const currentTimestamp = new Date(msg.timestamp).getTime();
      const previousMsg = filteredMessages[index - 1];
      const previousTimestamp = previousMsg ? new Date(previousMsg.timestamp).getTime() : null;

      const isGroupStart =
          index === 0 ||
          !previousTimestamp ||
          previousMsg.sender !== msg.sender ||
          (currentTimestamp - previousTimestamp) > 300_000;

      return { ...msg, isGroupStart: isGroupStart, isGroupEnd: false/*, isUnreadGroupStart: isGroupStart && !msg.is_read*/ };
    });

    for (let i = messagesWithGroupInfo.length - 1; i >= 0; i--) {
      const currentMsg = messagesWithGroupInfo[i];
      const nextMsg = messagesWithGroupInfo[i + 1];

      if (i === messagesWithGroupInfo.length - 1 || (nextMsg && nextMsg.isGroupStart)) {
        messagesWithGroupInfo[i] = { ...currentMsg, isGroupEnd: true };
      }
    }

    // const currentUnreadCount = unreadCounts[activeChat || ''] || 0;
    // const hasUnreadNow = currentUnreadCount > 0;

    // useEffect(() => {
    //     if (hasUnreadNow) {
    //         setHasUnreadMessages(true);
    //         setShowUnreadMarker(true);

    //         if (timerRef.current) {
    //             clearTimeout(timerRef.current);
    //         }
    //         timerRef.current = setTimeout(() => {
    //             setShowUnreadMarker(false);
    //         }, 30000);
    //     } else {
    //       setShowUnreadMarker(false);
    //         // if (hasUnreadMessages) {
    //             // setShowUnreadMarker(false);
    //         // }
    //     }

    //     return () => {
    //         if (timerRef.current) {
    //             clearTimeout(timerRef.current);
    //             timerRef.current = null;
    //         }
    //     };
    // }, [hasUnreadNow, activeChat]);
    
    // console.log(messagesToRender);
    return messagesWithGroupInfo.map((msg, index) => {
      const messageDate = formatDate(msg.timestamp);
      const showDateHeader = messageDate !== lastDate;
      lastDate = messageDate;
      // const shouldShowMarker = showUnreadMarker && msg.isUnreadGroupStart;

      return (
        <React.Fragment key={`fragment-${msg.id}`}>
          {/* {shouldShowMarker && (
            <div
              ref={unreadMarkerRef}
              className="text-center my-2 sticky top-0 z-10"
            >
              <span className={`inline-block bg-gray-300 text-gray-700 text-xs px-2 py-1 rounded-full`}>
                Непрочитанные сообщения
              </span>
            </div>
          )} */}
          {showDateHeader && (
            <div className="text-center my-2">
              <span className="inline-block bg-gray-300 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
                {messageDate}
              </span>
            </div>
          )}
          {msg.is_notification ?
            <div className="text-center my-2">
              <span className="inline-block bg-gray-300 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
                {msg.content}
              </span>
            </div>
            :
            <RenderMessageItem 
                unreadReactionNotifications={unreadReactionNotifications}
                onReact={onReact}
                msg={msg}
                currentChat={currentChat}
                activeChat={activeChat}
                prev_msg={index > 0 ? messagesWithGroupInfo[index - 1] : null}
                quotedMessageData={quotedMessageData}
                contactMap={contactMap}
                handleMessageContextMenu={handleMessageContextMenu}
                fetchQuotedMessageData={fetchQuotedMessageData}
                username={username}
                setShowImageModal={setShowImageModal}
                loadMessagesAround={loadMessagesAround}
                setImageUrl={setImageUrl}
                handleContextMenuQuote={handleContextMenuQuote}
                onMessageInView={onMessageInView}
                onReactionInView={onReactionInView}
            />
          }
        </React.Fragment>
      );
    });
};

export default RenderMessages;