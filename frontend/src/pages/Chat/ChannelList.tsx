import React from 'react';
import { FiUsers, FiHash } from 'react-icons/fi';
import { Channel } from '../../types';

interface ChannelListProps {
  channels: Channel[];
  selectedChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  onCreateChannel: () => void;
  darkMode: boolean;
}

const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  selectedChannel,
  onSelectChannel,
  onCreateChannel,
  darkMode
}) => {
  return (
    <div className="p-4">
      <div className={`relative mb-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FiSearch className="text-gray-500" />
        </div>
        <input
          type="text"
          placeholder="Search chats..."
          className={`w-full py-2 pl-10 pr-4 rounded-lg ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
      </div>

      <div className="flex gap-2 mb-4">
        <button 
          onClick={onCreateChannel}
          className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg ${darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white transition-colors`}
        >
          <FiUsers className="mr-2" />
          New Chat
        </button>
        <button 
          onClick={onCreateChannel}
          className={`flex-1 flex items-center justify-center py-2 px-4 rounded-lg ${darkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} text-white transition-colors`}
        >
          <FiHash className="mr-2" />
          New Channel
        </button>
      </div>

      <div className="space-y-1">
        {channels.map(channel => (
          <div 
            key={channel.id}
            onClick={() => onSelectChannel(channel)}
            className={`p-3 rounded-lg cursor-pointer flex items-center justify-between ${
              darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
            } ${
              selectedChannel?.id === channel.id ? (darkMode ? 'bg-gray-800' : 'bg-gray-200') : ''
            }`}
          >
            <div className="flex items-center overflow-hidden">
              {channel.is_private ? (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  {channel.members.find(m => m.username !== 'current_user')?.full_name[0].toUpperCase()}
                </div>
              ) : (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <FiHash className="w-5 h-5" />
                </div>
              )}
              <div className="overflow-hidden">
                <p className="font-medium truncate">
                  {channel.is_private
                    ? channel.members.find(m => m.username !== 'current_user')?.full_name || channel.name
                    : channel.name}
                </p>
                {channel.last_message && (
                  <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {channel.last_message.content}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end ml-2">
              {channel.last_message && (
                <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {new Date(channel.last_message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {channel.unread_count > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center mt-1">
                  {channel.unread_count}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChannelList;