// components/modals/CreateChannelModal.tsx
import React from 'react';
import { Broadcast, X } from 'phosphor-react';
import { useTheme } from '../../../hooks/ThemeContext';

interface CreateChannelModalProps {
  showCreateChannel: boolean;
  channelName: string;
  setChannelName: React.Dispatch<React.SetStateAction<string>>;
  channelDescription: string;
  setChannelDescription: React.Dispatch<React.SetStateAction<string>>;
  createChannel: () => Promise<void>;
  setShowCreateChannel: React.Dispatch<React.SetStateAction<boolean>>;
}

const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  showCreateChannel,
  channelName,
  setChannelName,
  channelDescription,
  setChannelDescription,
  createChannel,
  setShowCreateChannel,
}) => {
  const { theme } = useTheme();

  if (!showCreateChannel) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in-0">
      <div className={`${theme === 'light' ? 'bg-white border-slate-200/80' : 'bg-slate-800 border-slate-700/80'} rounded-3xl shadow-2xl w-full max-w-lg border animate-in zoom-in-95`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Broadcast size={20} className="text-white" weight="fill" />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Создать новый канал</h3>
                  <p className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} mt-1`}>Для публикаций и объявлений</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCreateChannel(false);
                  setChannelName('');
                  setChannelDescription('');
                }}
                className={`w-8 h-8 rounded-xl ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'} transition-colors flex items-center justify-center`}
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <input
                type="text"
                placeholder="Название канала"
                className={`w-full px-4 py-3 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-purple-500/30 focus:border-purple-500 transition-all duration-300`}
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
              />
              <textarea
                placeholder="Описание канала (необязательно)"
                className={`w-full px-4 py-3 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-purple-500/30 focus:border-purple-500 transition-all duration-300 resize-none h-32`}
                value={channelDescription}
                onChange={(e) => setChannelDescription(e.target.value)}
              />
            </div>

            {/* Footer */}
            <div className={`flex justify-end space-x-3 p-6 border-t ${theme === 'light' ? 'border-slate-200/60' : 'border-slate-700/60'}`}>
              <button
                onClick={() => {
                  setShowCreateChannel(false);
                  setChannelName('');
                  setChannelDescription('');
                }}
                className={`px-6 py-3 rounded-2xl ${theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} transition-all duration-300 font-semibold`}
              >
                Отмена
              </button>
              <button
                onClick={createChannel}
                className="px-6 py-3 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed"
                disabled={!channelName.trim()}
              >
                Создать канал
              </button>
            </div>
          </div>
    </div>
  );
};

export default CreateChannelModal;