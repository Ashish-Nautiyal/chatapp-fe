import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const useChatApi = (token) => {
  const apiCall = useCallback(async (endpoint, options = {}) => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Something went wrong');
    }
    return data;
  }, [token]);

  return { apiCall };
};

const useSocket = (url) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!url) return;
    
    let newSocket;
    import('socket.io-client').then(({ io }) => {
      newSocket = io(url, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      
      newSocket.on('connect', () => {
        console.log('Socket connected');
      });
      
      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
      });
      
      setSocket(newSocket);
    });
    
    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  }, [url]);

  return socket;
};

const Chat = () => {
  const { user, token, logout } = useAuth();
  const { apiCall } = useChatApi(token);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const socket = useSocket(SOCKET_URL);

  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loading, setLoading] = useState({
    conversations: false,
    messages: false,
    sending: false,
  });
  const [error, setError] = useState(null);
  
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  
  const currentUserId = user?._id || user?.id;
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const currentConversationRef = useRef(currentConversation);
  currentConversationRef.current = currentConversation;

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleReceiveMessage = useCallback((message) => {
    console.log('Received message:', message, 'type:', message.type);
    const currentConv = currentConversationRef.current;
    const msgConvId = String(message.conversationId);
    const currentConvId = currentConv ? String(currentConv._id) : null;
    
    if (currentConvId && msgConvId === currentConvId) {
      setMessages(prev => [...prev, message]);
    }
    setConversations(prev => prev.map(conv => {
      const convId = String(conv._id);
      if (convId === msgConvId) {
        return { 
          ...conv, 
          lastMessage: message,
          unreadCount: currentConvId === msgConvId ? conv.unreadCount : (conv.unreadCount || 0) + 1
        };
      }
      return conv;
    }));
  }, []);

  const handleUserOnline = useCallback((userId) => {
    console.log('User online:', userId);
    setOnlineUsers(prev => new Set([...prev, String(userId)]));
  }, []);

  const handleUserOffline = useCallback((userId) => {
    console.log('User offline:', userId);
    setOnlineUsers(prev => {
      const newSet = new Set(prev);
      newSet.delete(String(userId));
      return newSet;
    });
  }, []);

  const handleOnlineUsers = useCallback((users) => {
    console.log('Online users:', users);
    setOnlineUsers(new Set(users.map(String)));
  }, []);

  useEffect(() => {
    if (!socket || !currentUserId) return;

    const handleConnect = () => {
      console.log('Socket connected, joining user:', currentUserId);
      socket.emit('join', currentUserId);
      
      const groupConvs = conversations.filter(c => c.type === 'group');
      groupConvs.forEach(conv => {
        socket.emit('joinGroup', String(conv._id));
      });
    };

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on('connect', handleConnect);
    }
    
    socket.on('onlineUsers', handleOnlineUsers);
    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('userOnline', handleUserOnline);
    socket.on('userOffline', handleUserOffline);
    
    return () => {
      socket.off('connect', handleConnect);
      socket.off('onlineUsers', handleOnlineUsers);
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('userOnline', handleUserOnline);
      socket.off('userOffline', handleUserOffline);
    };
  }, [socket, currentUserId, handleReceiveMessage, handleUserOnline, handleUserOffline, handleOnlineUsers]);

  useEffect(() => {
    if (!socket || !currentUserId || conversations.length === 0) return;
    
    const joinGroups = () => {
      conversations.forEach(conv => {
        if (conv.type === 'group') {
          socket.emit('joinGroup', String(conv._id));
        }
      });
    };
    
    if (socket.connected) {
      joinGroups();
    } else {
      socket.on('connect', joinGroups);
      return () => socket.off('connect', joinGroups);
    }
  }, [socket, currentUserId, conversations]);

  useEffect(() => {
    if (token && user && currentUserId) {
      loadConversations();
      loadAllUsers();
    }
  }, [token, user, currentUserId]);

  const loadConversations = async () => {
    setLoading(prev => ({ ...prev, conversations: true }));
    try {
      const data = await apiCall('/chat/conversations');
      setConversations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, conversations: false }));
    }
  };

  const loadAllUsers = async () => {
    try {
      const data = await apiCall('/auth/users');
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const loadAvailableUsers = async (conversationId = null) => {
    try {
      const query = conversationId ? `?conversationId=${conversationId}` : '';
      const data = await apiCall(`/auth/users/available${query}`);
      setAvailableUsers(data);
    } catch (err) {
      console.error('Failed to load available users:', err);
    }
  };

  const selectConversation = async (conv) => {
    setCurrentConversation(conv);
    setLoading(prev => ({ ...prev, messages: true }));
    
    try {
      const data = await apiCall(`/chat/messages/${conv._id}`);
      setMessages(data);
      
      await apiCall(`/chat/conversation/${conv._id}/read`, { method: 'POST' });
      
      setConversations(prev => prev.map(c => 
        c._id === conv._id ? { ...c, unreadCount: 0 } : c
      ));
      
      if (conv.type === 'group' && socket) {
        socket.emit('joinGroup', conv._id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, messages: false }));
    }
  };

  const startPrivateChat = async (otherUserId) => {
    try {
      const conv = await apiCall('/chat/conversation', {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'private', 
          participantIds: [otherUserId] 
        }),
      });
      await loadConversations();
      setShowNewChatModal(false);
      selectConversation(conv);
    } catch (err) {
      setError(err.message);
    }
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }
    
    try {
      const conv = await apiCall('/chat/conversation', {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'group', 
          name: groupName.trim(),
          participantIds: selectedUsers 
        }),
      });
      setShowCreateGroupModal(false);
      setGroupName('');
      setSelectedUsers([]);
      await loadConversations();
      selectConversation(conv);
    } catch (err) {
      setError(err.message);
    }
  };

  const addMembersToGroup = async (userIds) => {
    try {
      const updated = await apiCall(`/chat/group/${currentConversation._id}/add-members`, {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      });
      setCurrentConversation(updated);
      setConversations(prev => prev.map(c => 
        c._id === updated._id ? updated : c
      ));
      loadAvailableUsers(currentConversation._id);
    } catch (err) {
      setError(err.message);
    }
  };

  const removeMember = async (userId) => {
    try {
      await apiCall(`/chat/group/${currentConversation._id}/remove-member`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      await loadConversations();
      const updated = await apiCall(`/chat/conversation/${currentConversation._id}`);
      setCurrentConversation(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  const leaveGroup = async () => {
    try {
      await apiCall(`/chat/group/${currentConversation._id}/leave`, {
        method: 'POST',
      });
      setCurrentConversation(null);
      setMessages([]);
      setShowGroupInfoModal(false);
      await loadConversations();
    } catch (err) {
      setError(err.message);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentConversation || loading.sending) return;

    setLoading(prev => ({ ...prev, sending: true }));
    setError(null);

    try {
      const savedMessage = await apiCall('/chat/message', {
        method: 'POST',
        body: JSON.stringify({ 
          conversationId: currentConversation._id, 
          content: newMessage.trim() 
        }),
      });

      const messageData = {
        ...savedMessage,
        conversationId: currentConversation._id,
      };

      if (socket) {
        const recipientId = currentConversation.participants?.find(p => String(p._id) !== String(currentUserId))?._id;
        socket.emit('sendMessage', {
          conversationId: String(currentConversation._id),
          from: String(currentUserId),
          content: newMessage.trim(),
          type: currentConversation.type,
          sender: { _id: String(currentUserId), username: user.username },
          ...(currentConversation.type === 'private' ? {
            to: String(recipientId)
          } : {})
        });
      }

      setMessages(prev => [...prev, messageData]);
      setNewMessage('');
      
      setConversations(prev => prev.map(c => 
        c._id === currentConversation._id ? { ...c, lastMessage: messageData } : c
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, sending: false }));
    }
  };

  const getConversationName = (conv) => {
    if (conv.type === 'group') return conv.name;
    const other = conv.participants?.find(p => p._id !== currentUserId);
    return other?.username || 'Unknown';
  };

  const getConversationAvatar = (conv) => {
    if (conv.type === 'group') {
      return conv.name?.[0]?.toUpperCase() || 'G';
    }
    const other = conv.participants?.find(p => p._id !== currentUserId);
    return other?.avatar ? 
      <img src={other.avatar} alt={other.username} /> : 
      other?.username?.[0]?.toUpperCase() || 'U';
  };

  const getUserAvatar = (u) => {
    return u.avatar ? 
      <img src={u.avatar} alt={u.username} /> : 
      u.username?.[0]?.toUpperCase() || 'U';
  };

  const isGroupAdmin = currentConversation?.type === 'group' && 
    currentConversation.admin?._id === currentUserId;

  if (!user) return null;

  const filteredUsers = users.filter(u => {
    if (!currentUserId || u._id === currentUserId) return false;
    const hasPrivateChat = conversations.some(c => 
      c.type === 'private' && 
      c.participants?.some(p => p._id === u._id)
    );
    return !hasPrivateChat;
  });

  return (
    <div className="chat-layout">
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Chats</h3>
          <div>
            <button 
              onClick={() => {
                loadAvailableUsers();
                setShowCreateGroupModal(true);
              }} 
              style={{ marginRight: '8px' }}
            >
              New Group
            </button>
            <button onClick={() => {
              setShowNewChatModal(true);
            }}>
              New Chat
            </button>
          </div>
        </div>
        
        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        
        <div className="conversation-list">
          {loading.conversations ? (
            <div className="loading">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="empty-list">No conversations yet</div>
          ) : (
            conversations.map(conv => {
              const otherUserId = conv.participants?.find(p => String(p._id) !== String(currentUserId))?._id;
              const isOnline = conv.type === 'private' && otherUserId && onlineUsers.has(String(otherUserId));
              
              return (
                <div
                  key={conv._id}
                  className={`conversation-item ${currentConversation?._id === conv._id ? 'active' : ''}`}
                  onClick={() => selectConversation(conv)}
                >
                  <div className="avatar-wrapper">
                    <div className="conversation-avatar">
                      {getConversationAvatar(conv)}
                    </div>
                    {isOnline && <span className="online-indicator"></span>}
                  </div>
                  <div className="conversation-info">
                    <h4>{getConversationName(conv)}</h4>
                    <p>{conv.lastMessage?.content?.substring(0, 30) || ''}</p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <div className="unread-badge">{conv.unreadCount}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
        
        <div className="sidebar-footer">
          <span>{user.username}</span>
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="chat-main">
        {currentConversation ? (
          <>
            <div className="chat-header">
              <h3 
                onClick={() => {
                  if (currentConversation.type === 'group') {
                    loadAvailableUsers(currentConversation._id);
                    setShowGroupInfoModal(true);
                  }
                }}
                style={{ cursor: currentConversation.type === 'group' ? 'pointer' : 'default' }}
              >
                {getConversationName(currentConversation)}
                {currentConversation.type === 'group' && (
                  <span className="member-count">
                    ({currentConversation.participants?.length} members)
                  </span>
                )}
              </h3>
            </div>
            
            <div className="chat-messages">
              {loading.messages ? (
                <div className="loading">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="empty-chat">No messages yet</div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={msg._id || idx}
                    className={`message ${msg.sender?._id === currentUserId ? 'sent' : 'received'}`}
                  >
                    {msg.sender?._id !== currentUserId && currentConversation.type === 'group' && (
                      <div className="message-sender">{msg.sender?.username}</div>
                    )}
                    <div className="message-bubble">{msg.content}</div>
                    <div className="message-time">
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      }) : ''}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            
            <form className="chat-input" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={loading.sending}
              />
              <button type="submit" disabled={loading.sending || !newMessage.trim()}>
                {loading.sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </>
        ) : (
          <div className="empty-chat">Select a conversation to start chatting</div>
        )}
      </div>

      {showNewChatModal && (
        <div className="modal-overlay" onClick={() => setShowNewChatModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Start New Chat</h3>
            {filteredUsers.length === 0 ? (
              <p className="empty-list">No users available</p>
            ) : (
              <div className="user-list">
                {filteredUsers.map(u => (
                  <div 
                    key={u._id} 
                    className="user-item" 
                    onClick={() => startPrivateChat(u._id)}
                  >
                    <div className="conversation-avatar">
                      {getUserAvatar(u)}
                    </div>
                    <span>{u.username}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-secondary" onClick={() => setShowNewChatModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCreateGroupModal && (
        <div className="modal-overlay" onClick={() => setShowCreateGroupModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create Group</h3>
            <div className="form-group">
              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Add members (optional):</label>
              <div className="user-list scrollable">
                {users.map(u => (
                  <div 
                    key={u._id} 
                    className={`user-item selectable ${selectedUsers.includes(u._id) ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedUsers(prev => 
                        prev.includes(u._id) 
                          ? prev.filter(id => id !== u._id)
                          : [...prev, u._id]
                      );
                    }}
                  >
                    <div className="checkbox">
                      {selectedUsers.includes(u._id) && '✓'}
                    </div>
                    <div className="conversation-avatar">
                      {getUserAvatar(u)}
                    </div>
                    <span>{u.username}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={createGroup} disabled={!groupName.trim()}>
                Create Group
              </button>
              <button className="btn-secondary" onClick={() => {
                setShowCreateGroupModal(false);
                setGroupName('');
                setSelectedUsers([]);
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupInfoModal && currentConversation && (
        <div className="modal-overlay" onClick={() => setShowGroupInfoModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{currentConversation.name}</h3>
            <p className="group-info">
              {currentConversation.participants?.length} members • Created by {currentConversation.admin?.username}
            </p>
            
            <div className="user-list scrollable">
              {currentConversation.participants?.map(p => (
                <div key={p._id} className="user-item">
                  <div className="conversation-avatar">
                    {p.avatar ? <img src={p.avatar} alt={p.username} /> : p.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="user-info">
                    <span>{p.username}</span>
                    {p._id === currentConversation.admin?._id && <span className="admin-badge">Admin</span>}
                  </div>
                  {isGroupAdmin && p._id !== currentUserId && (
                    <button 
                      className="btn-remove"
                      onClick={() => removeMember(p._id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isGroupAdmin && (
              <div className="form-group">
                <label>Add members:</label>
                <div className="user-list scrollable">
                  {availableUsers.map(u => (
                    <div 
                      key={u._id} 
                      className="user-item selectable"
                      onClick={() => addMembersToGroup([u._id])}
                    >
                      <div className="conversation-avatar">
                        {getUserAvatar(u)}
                      </div>
                      <span>{u.username}</span>
                      <button className="btn-add">Add</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-danger" onClick={leaveGroup}>
                Leave Group
              </button>
              <button className="btn-secondary" onClick={() => setShowGroupInfoModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
