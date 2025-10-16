// src/utils/flattenMessages.ts
import type { Message } from '../types/chat';

export type RenderBlock =
  | { type: 'date-header'; date: string; key: string }
  | { type: 'notification'; message: Message; key: string }
  | { type: 'message'; message: Message; key: string };

export const flattenMessages = (messages: Message[]): RenderBlock[] => {
  const blocks: RenderBlock[] = [];
  let lastDate = '';

  for (const msg of messages) {
    const messageDate = new Date(msg.timestamp).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    if (messageDate !== lastDate) {
      blocks.push({
        type: 'date-header',
        date: messageDate,
        key: `date-${messageDate}`,
      });
      lastDate = messageDate;
    }

    if (msg.is_notification) {
      blocks.push({
        type: 'notification',
        message: msg,
        key: `notif-${msg.id}`,
      });
    } else {
      blocks.push({
        type: 'message',
        message: msg,
        key: `msg-${msg.id}`,
      });
    }
  }

  return blocks;
};