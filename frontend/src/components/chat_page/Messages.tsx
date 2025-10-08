import React from "react";
import type { Chat, Message, Contact, LastMessage } from '../../types/chat';
import { formatDate } from '../../utils/chat';
import RenderMessageItem from "./MessageItem";

interface RenderMessagesProps {
    filteredMessages: Message[];
    quotedMessageData: Record<string, Message | null>;
    contactMap: Record<string, string>;
    handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
    fetchQuotedMessageData: (id: string) => Promise<Message | null>;
    username: string | null;
    setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const RenderMessages: React.FC<RenderMessagesProps> = ({
    filteredMessages,
    quotedMessageData,
    contactMap,
    handleMessageContextMenu,
    fetchQuotedMessageData,
    username,
    setShowImageModal
}) => {
    let lastDate = '';
    const messagesToRender = filteredMessages || [];
    return messagesToRender.map((msg, index) => {
      const messageDate = formatDate(msg.timestamp);
      const showDateHeader = messageDate !== lastDate;
      lastDate = messageDate;
      return (
        <React.Fragment key={`fragment-${msg.id}`}>
          {showDateHeader && (
            <div className="text-center my-2">
              <span className="inline-block bg-gray-300 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
                {messageDate}
              </span>
            </div>
          )}
          {msg.is_notification ?
            <div className="text-center my-2">
              <span className="inline-block bg-gray-300 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
                {msg.content}
              </span>
            </div>
            :
            <RenderMessageItem 
                msg={msg}
                prev_msg={index > 0 ? messagesToRender[index - 1] : null}
                quotedMessageData={quotedMessageData}
                contactMap={contactMap}
                handleMessageContextMenu={handleMessageContextMenu}
                fetchQuotedMessageData={fetchQuotedMessageData}
                username={username}
                setShowImageModal={setShowImageModal}
            />
          }
        </React.Fragment>
      );
    });
};

export default RenderMessages;