// src/components/chat/VirtualizedMessages.tsx
import React, { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { flattenMessages } from '../../utils/flattenMessages';
import RenderBlockItem from './RenderBlockItem';
import type { Message } from '../../types/chat';

interface VirtualizedMessagesProps {
  filteredMessages: Message[];
  quotedMessageData: Record<string, Message | null>;
  contactMap: Record<string, string>;
  handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
  fetchQuotedMessageData: (id: string) => Promise<Message | null>;
  username: string | null;
  setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
  theme: 'light' | 'dark';
}

const VirtualizedMessages: React.FC<VirtualizedMessagesProps> = ({
  filteredMessages,
  quotedMessageData,
  contactMap,
  handleMessageContextMenu,
  fetchQuotedMessageData,
  username,
  setShowImageModal,
  theme,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => flattenMessages(filteredMessages), [filteredMessages]);

  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const block = blocks[index];
      if (block.type === 'date-header' || block.type === 'notification') return 32;
      return 80;
    },
    overscan: 10,
  });

  if (blocks.length === 0) {
    return <div className="text-center py-10 text-slate-500">Нет сообщений</div>;
  }

  return (
    <div
      ref={parentRef}
      className="w-full overflow-y-auto"
      style={{ height: '100%' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const block = blocks[virtualItem.index];
          return (
            <div
              key={block.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <RenderBlockItem
                block={block}
                quotedMessageData={quotedMessageData}
                contactMap={contactMap}
                handleMessageContextMenu={handleMessageContextMenu}
                fetchQuotedMessageData={fetchQuotedMessageData}
                username={username}
                setShowImageModal={setShowImageModal}
                theme={theme}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VirtualizedMessages;