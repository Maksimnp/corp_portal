import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

interface User {
  username: string;
  full_name: string;
  email?: string;
  department?: string;
}

interface Channel {
  id: string;
  name: string;
  creator: string;
  is_private: boolean;
  members: string[];
  created_at: string;
}

interface Message {
  id: string;
  channel_id: string;
  sender: string;
  content: string;
  timestamp: string;
  is_file: boolean;
}

const ChatApp: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<User[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedContact, setSelectedContact] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notifications, setNotifications] = useState<{[key: string]: number}>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({
    name: '',
    isPrivate: false,
    selectedMembers: [] as string[]
  });
  
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Initialize WebSocket connection
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    // Fetch user data
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          setUser(await response.json());
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      }
    };

    fetchUser();

    // Initialize WebSocket
    socketRef.current = io('/ws', {
      auth: { token },
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to WebSocket');
    });

    socketRef.current.on('new_message', (message: Message) => {
      setMessages(prev => [...prev, message]);
      if (message.channel_id !== selectedChannel?.id) {
        setNotifications(prev => ({
          ...prev,
          [message.channel_id]: (prev[message.channel_id] || 0) + 1
        }));
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token, navigate]);

  // Fetch contacts
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const response = await fetch(`/api/chat/contacts?search=${searchQuery}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          setContacts(await response.json());
        }
      } catch (error) {
        console.error('Failed to fetch contacts:', error);
      }
    };

    if (searchQuery.length > 2 || searchQuery.length === 0) {
      fetchContacts();
    }
  }, [searchQuery, token]);

  // Fetch channels
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const response = await fetch('/api/chat/channels', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          setChannels(await response.json());
        }
      } catch (error) {
        console.error('Failed to fetch channels:', error);
      }
    };

    fetchChannels();
  }, [token]);

  // Fetch messages when channel changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedChannel) return;
      
      try {
        const response = await fetch(`/api/chat/messages/${selectedChannel.id}?limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          setMessages(await response.json());
          // Clear notification for this channel
          setNotifications(prev => {
            const updated = {...prev};
            delete updated[selectedChannel.id];
            return updated;
          });
        }
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      }
    };

    fetchMessages();
  }, [selectedChannel, token]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message handler
  const sendMessage = useCallback(async () => {
    if (!selectedChannel || (!newMessage.trim() && !file)) return;

    try {
      const formData = new FormData();
      if (newMessage.trim()) formData.append('content', newMessage);
      if (file) formData.append('file', file);

      const response = await fetch(`/api/chat/messages/${selectedChannel.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        setNewMessage('');
        setFile(null);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [selectedChannel, newMessage, file, token]);

  // Create channel handler
  const createChannel = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/channels', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newChannel.name,
          is_private: newChannel.isPrivate,
          members: newChannel.selectedMembers
        }),
      });

      if (response.ok) {
        setShowCreateChannel(false);
        setNewChannel({
          name: '',
          isPrivate: false,
          selectedMembers: []
        });
        // Refresh channels list
        const channelsResponse = await fetch('/api/chat/channels', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (channelsResponse.ok) {
          setChannels(await channelsResponse.json());
        }
      }
    } catch (error) {
      console.error('Failed to create channel:', error);
    }
  }, [newChannel, token]);

  // Toggle member selection for new channel
  const toggleMemberSelection = (username: string) => {
    setNewChannel(prev => ({
      ...prev,
      selectedMembers: prev.selectedMembers.includes(username)
        ? prev.selectedMembers.filter(u => u !== username)
        : [...prev.selectedMembers, username]
    }));
  };

  return (
    <div className={`flex h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {/* Sidebar */}
      <div className={`w-64 border-r ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">Chat</h1>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="mt-2 p-1 rounded-full bg-gray-200 dark:bg-gray-700"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="p-4">
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full p-2 rounded mb-4 ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100'}`}
          />

          <button 
            onClick={() => setShowCreateChannel(true)}
            className="w-full p-2 mb-4 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Create Channel
          </button>

          <h2 className="font-semibold mb-2">Contacts</h2>
          <div className="space-y-1">
            {contacts.map(contact => (
              <div 
                key={contact.username}
                onClick={() => {
                  // For direct messages, we'll use a special channel ID
                  const channelId = `dm_${[user?.username, contact.username].sort().join('_')}`;
                  setSelectedChannel({
                    id: channelId,
                    name: contact.full_name,
                    creator: user?.username || '',
                    is_private: true,
                    members: [user?.username || '', contact.username],
                    created_at: new Date().toISOString()
                  });
                  setSelectedContact(contact);
                }}
                className={`p-2 rounded cursor-pointer ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              >
                {contact.full_name}
              </div>
            ))}
          </div>

          <h2 className="font-semibold mt-4 mb-2">Channels</h2>
          <div className="space-y-1">
            {channels.map(channel => (
              <div 
                key={channel.id}
                onClick={() => {
                  setSelectedChannel(channel);
                  setSelectedContact(null);
                }}
                className={`p-2 rounded cursor-pointer flex justify-between items-center ${
                  darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
                } ${
                  selectedChannel?.id === channel.id ? (darkMode ? 'bg-gray-700' : 'bg-gray-300') : ''
                }`}
              >
                <span>#{channel.name}</span>
                {notifications[channel.id] && (
                  <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {notifications[channel.id]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {selectedChannel ? (
          <>
            <div className={`p-4 border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <h2 className="text-lg font-semibold">
                {selectedContact ? selectedContact.full_name : `#${selectedChannel.name}`}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedChannel.members.length} members
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(message => (
                <div key={message.id} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    darkMode ? 'bg-gray-700' : 'bg-gray-200'
                  }`}>
                    {message.sender[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {contacts.find(c => c.username === message.sender)?.full_name || message.sender}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(message.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {message.is_file ? (
                      <a 
                        href={message.content} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        📎 {message.content.split('/').pop()}
                      </a>
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className={`p-4 border-t ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className={`flex-1 p-2 rounded ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100'}`}
                />
                <input
                  type="file"
                  id="file-upload"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label 
                  htmlFor="file-upload"
                  className={`p-2 rounded cursor-pointer ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                >
                  📎
                </label>
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() && !file}
                  className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              {file && (
                <div className="mt-2 flex items-center">
                  <span className="text-sm">{file.name}</span>
                  <button 
                    onClick={() => setFile(null)}
                    className="ml-2 text-red-500"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p>Select a chat to start messaging</p>
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} w-96`}>
            <h2 className="text-xl font-bold mb-4">Create Channel</h2>
            
            <div className="mb-4">
              <label className="block mb-2">Channel Name</label>
              <input
                type="text"
                value={newChannel.name}
                onChange={(e) => setNewChannel({...newChannel, name: e.target.value})}
                className={`w-full p-2 rounded ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100'}`}
              />
            </div>

            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newChannel.isPrivate}
                  onChange={(e) => setNewChannel({...newChannel, isPrivate: e.target.checked})}
                  className="mr-2"
                />
                Private Channel
              </label>
            </div>

            <div className="mb-4">
              <label className="block mb-2">Add Members</label>
              <div className="max-h-40 overflow-y-auto">
                {contacts.map(contact => (
                  <div key={contact.username} className="flex items-center mb-2">
                    <input
                      type="checkbox"
                      id={`member-${contact.username}`}
                      checked={newChannel.selectedMembers.includes(contact.username)}
                      onChange={() => toggleMemberSelection(contact.username)}
                      className="mr-2"
                    />
                    <label htmlFor={`member-${contact.username}`}>
                      {contact.full_name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateChannel(false)}
                className={`p-2 rounded ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
              >
                Cancel
              </button>
              <button
                onClick={createChannel}
                disabled={!newChannel.name.trim()}
                className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatApp;