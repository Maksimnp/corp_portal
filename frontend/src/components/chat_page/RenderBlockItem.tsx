import React from 'react';
import type { RenderBlock } from '../../utils/flattenMessages';
import RenderMessageItem from './MessageItem';
import type { Message } from '../../types/chat';

interface RenderBlockItemProps {
  block: RenderBlock;
  quotedMessageData: Record<string, Message | null>;
  contactMap: Record<string, string>;
  handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
  fetchQuotedMessageData: (id: string) => Promise<Message | null>;
  username: string | null;
  setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
  theme: 'light' | 'dark';
}

const RenderBlockItem: React.FC<RenderBlockItemProps> = ({
  block,
  quotedMessageData,
  contactMap,
  handleMessageContextMenu,
  fetchQuotedMessageData,
  username,
  setShowImageModal,
  theme,
}) => {
  if (block.type === 'date-header') {
    return (
      <div className="text-center my-2">
        <span className="inline-block bg-gray-300 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
          {block.date}
        </span>
      </div>
    );
  }

  if (block.type === 'notification') {
    return (
      <div className="text-center my-2">
        <span className="inline-block bg-gray-300 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs px-2 py-1 rounded-full">
          {block.message.content}
        </span>
      </div>
    );
  }

  return (
    <RenderMessageItem
      msg={block.message}
      prev_msg={null}
      quotedMessageData={quotedMessageData}
      contactMap={contactMap}
      handleMessageContextMenu={handleMessageContextMenu}
      fetchQuotedMessageData={fetchQuotedMessageData}
      username={username}
      setShowImageModal={setShowImageModal}
    />
  );
};

export default React.memo(RenderBlockItem);