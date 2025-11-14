import { CiEdit } from "react-icons/ci";
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
        <div className="flex items-center max-w-full w-full mb-3 px-2 py-3 bg-gray-100 rounded-lg border border-gray-200">
          <CiEdit className="text-3xl text-purple-500 flex-shrink-0 mr-2" />
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center w-full">
              <div className="border-l-[4px] border-purple-500 pl-3 bg-purple-200/70 rounded-sm flex-1 min-w-0 w-full max-w-full overflow-hidden" style={{wordBreak: 'break-word'}}>
                <div className="text-sm font-semibold text-purple-600 truncate">
                  Редактирование
                </div>
                <div className="text-sm text-gray-700 w-full max-w-full overflow-hidden">
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
                className="ml-2 p-1 text-purple-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0"
                aria-label="Отменить цитирование"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
};

export default RenderEditingMessage;