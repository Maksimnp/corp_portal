import {  EditOutlined } from '@ant-design/icons';
import type { Message } from '../../types/chat';
import { X } from 'phosphor-react';

interface RenderEditingMessageProps {
    editingMessage: Message | null;
    cancelEdit: () => void;
}
const RenderEditingMessage: React.FC<RenderEditingMessageProps> = ({
    editingMessage,
    cancelEdit
}) => {
    if (!editingMessage) return null;
    return (
      <div className="w-full max-w-full overflow-hidden">
        <div className="flex items-start max-w-full w-full mb-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-t-lg border border-gray-200 dark:border-gray-700">
          <EditOutlined className="text-3xl text-purple-500 mt-1 flex-shrink-0 mr-2" />
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-start w-full">
              <div className="border-l-[4px] border-purple-500 pl-3 rounded-sm flex-1 min-w-0 w-full max-w-full overflow-hidden" style={{wordBreak: 'break-word'}}>
                <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-1 truncate">
                  Редактирование
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 w-full max-w-full overflow-hidden">
                  <div className="line-clamp-2 break-words">
                    {editingMessage.content ? (
                      editingMessage.content
                    ) : editingMessage.file_name ? (
                      `📎 ${editingMessage.file_name}`
                    ) : (
                      'Сообщение'
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={cancelEdit}
                className="ml-2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                aria-label="Отменить цитирование"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
};

export default RenderEditingMessage;