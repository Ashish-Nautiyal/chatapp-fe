import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { useChatApi } from '../../hooks/useChatApi';
import MessageItem from './MessageItem';
import ConversationItem from './ConversationItem';
import './Chat.css';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const Chat = () => {
  const { user, token, logout } = useAuth();
  const { socket } = useSocket(SOCKET_URL);
  const chatApi = useChatApi(token);
  
  const currentUserId = user?._id || user?.id;
  
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loading, setLoading] = useState({ conversations: false, messages: false, sending: false });
  const [error, setError] = useState(null);
  
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  
  const messagesEndRef = useRef(null);
  const currentConversationRef = useRef(currentConversation);

  currentConversationRef.current = currentConversation;

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleReceiveMessage = useCallback((message) => {
    const currentConv = currentConversationRef.current;
    const msgConvId = String(message.conversationId);
    const currentConvId = currentConv ? String(currentConv._id) : null;
    
    if (currentConvId && msgConvId === currentConvId) {
      setMessages(prev => [...prev, message]);
    }
    
    setConversations(prev => prev.map(conv => {
      if (String(conv._id) === msgConvId) {
        return { 
          ...conv, 
          lastMessage: message,
          unreadCount: currentConvId === msgConvId ? conv.unreadCount : (conv.unreadCount || 0) + 1
        };
      }
      return conv;
    }));
  }, []);

  const handleMessageEdited = useCallback((editedMessage) => {
    setMessages(prev => prev.map(m => 
      m._id === editedMessage._id ? { ...m, content: editedMessage.content, editedAt: editedMessage.editedAt } : m
    ));
    setConversations(prev => prev.map(conv => {
      if (conv.lastMessage?._id === editedMessage._id) {
        return { ...conv, lastMessage: { ...conv.lastMessage, content: editedMessage.content } };
      }
      return conv;
    }));
  }, []);

  const handleMessageDeleted = useCallback((data) => {
    const { messageId } = data;
    setMessages(prev => prev.map(m => 
      m._id === messageId ? { ...m, isDeleted: true, content: 'This message has been deleted' } : m
    ));
  }, []);

  const handleUserOnline = useCallback((userId) => {
    setOnlineUsers(prev => new Set([...prev, String(userId)]));
  }, []);

  const handleUserOffline = useCallback((userId) => {
    setOnlineUsers(prev => {
      const newSet = new Set(prev);
      newSet.delete(String(userId));
      return newSet;
    });
  }, []);

  const handleOnlineUsers = useCallback((users) => {
    setOnlineUsers(new Set(users.map(String)));
  }, []);

  useEffect(() => {
    if (!socket || !currentUserId) return;

    const handleConnect = () => {
      socket.emit('join', currentUserId);
      
      conversations.forEach(conv => {
        if (conv.type === 'group') {
          socket.emit('joinGroup', String(conv._id));
        }
      });
    };

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on('connect', handleConnect);
    }
    
    socket.on('onlineUsers', handleOnlineUsers);
    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('messageEdited', handleMessageEdited);
    socket.on('messageDeleted', handleMessageDeleted);
    socket.on('userOnline', handleUserOnline);
    socket.on('userOffline', handleUserOffline);
    
    return () => {
      socket.off('connect', handleConnect);
      socket.off('onlineUsers', handleOnlineUsers);
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('messageEdited', handleMessageEdited);
      socket.off('messageDeleted', handleMessageDeleted);
      socket.off('userOnline', handleUserOnline);
      socket.off('userOffline', handleUserOffline);
    };
  }, [socket, currentUserId, conversations, handleReceiveMessage, handleUserOnline, handleUserOffline, handleOnlineUsers, handleMessageEdited, handleMessageDeleted]);

  useEffect(() => {
    if (token && user && currentUserId) {
      loadConversations();
      loadAllUsers();
    }
  }, [token, user, currentUserId]);

  const loadConversations = async () => {
    setLoading(prev => ({ ...prev, conversations: true }));
    try {
      const data = await chatApi.getConversations();
      setConversations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, conversations: false }));
    }
  };

  const loadAllUsers = async () => {
    try {
      const data = await chatApi.getAllUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const loadAvailableUsers = async (conversationId = null) => {
    try {
      const data = await chatApi.getAvailableUsers(conversationId);
      setAvailableUsers(data);
    } catch (err) {
      console.error('Failed to load available users:', err);
    }
  };

  const selectConversation = async (conv) => {
    setCurrentConversation(conv);
    setLoading(prev => ({ ...prev, messages: true }));
    
    try {
      const data = await chatApi.getMessages(conv._id);
      setMessages(data);
      
      await chatApi.markAsRead(conv._id);
      
      setConversations(prev => prev.map(c => 
        String(c._id) === String(conv._id) ? { ...c, unreadCount: 0 } : c
      ));
      
      if (conv.type === 'group' && socket) {
        socket.emit('joinGroup', String(conv._id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, messages: false }));
    }
  };

  const startPrivateChat = async (otherUserId) => {
    try {
      const conv = await chatApi.createConversation('private', [otherUserId]);
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
      const conv = await chatApi.createConversation('group', selectedUsers, groupName.trim());
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
      const updated = await chatApi.addGroupMembers(currentConversation._id, userIds);
      setCurrentConversation(updated);
      setConversations(prev => prev.map(c => 
        String(c._id) === String(updated._id) ? updated : c
      ));
      loadAvailableUsers(currentConversation._id);
    } catch (err) {
      setError(err.message);
    }
  };

  const removeMember = async (userId) => {
    try {
      await chatApi.removeGroupMember(currentConversation._id, userId);
      await loadConversations();
      const updated = await chatApi.apiCall(`/chat/conversation/${currentConversation._id}`);
      setCurrentConversation(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  const leaveGroup = async () => {
    try {
      await chatApi.leaveGroup(currentConversation._id);
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
      const savedMessage = await chatApi.sendMessage(currentConversation._id, newMessage.trim());
      
      const messageData = { ...savedMessage, conversationId: currentConversation._id };
      
      if (socket) {
        const recipientId = currentConversation.participants?.find(
          p => String(p._id) !== String(currentUserId)
        )?._id;
        
        socket.emit('sendMessage', {
          conversationId: String(currentConversation._id),
          from: String(currentUserId),
          content: newMessage.trim(),
          type: currentConversation.type,
          sender: { _id: String(currentUserId), username: user.username },
          ...(currentConversation.type === 'private' ? { to: String(recipientId) } : {})
        });
      }

      setMessages(prev => [...prev, messageData]);
      setNewMessage('');
      
      setConversations(prev => prev.map(c => 
        String(c._id) === String(currentConversation._id) ? { ...c, lastMessage: messageData } : c
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, sending: false }));
    }
  };

  const editMessage = async (messageId, content) => {
    try {
      const updated = await chatApi.editMessage(messageId, content);
      
      if (socket) {
        socket.emit('editMessage', {
          messageId,
          content,
          conversationId: String(currentConversation._id)
        });
      }
      
      setMessages(prev => prev.map(m => 
        String(m._id) === String(messageId) ? updated : m
      ));
      setConversations(prev => prev.map(conv => {
        if (conv.lastMessage?._id === messageId) {
          return { ...conv, lastMessage: { ...conv.lastMessage, content } };
        }
        return conv;
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      await chatApi.deleteMessage(messageId);
      
      if (socket) {
        socket.emit('deleteMessage', {
          messageId,
          conversationId: String(currentConversation._id)
        });
      }
      
      setMessages(prev => prev.map(m => 
        String(m._id) === String(messageId) ? { ...m, isDeleted: true, content: 'This message has been deleted' } : m
      ));
    } catch (err) {
      setError(err.message);
    }
  };

  const isGroupAdmin = currentConversation?.type === 'group' && 
    String(currentConversation.admin?._id) === String(currentUserId);

  if (!user) return null;

  const filteredUsers = users.filter(u => {
    if (String(u._id) === String(currentUserId)) return false;
    const hasPrivateChat = conversations.some(c => 
      c.type === 'private' && 
      c.participants?.some(p => String(p._id) === String(u._id))
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
              onClick={() => { loadAvailableUsers(); setShowCreateGroupModal(true); }} 
              style={{ marginRight: '8px' }}
            >
              New Group
            </button>
            <button onClick={() => setShowNewChatModal(true)}>New Chat</button>
          </div>
        </div>
        
        {error && <div className="error-banner" onClick={() => setError(null)}>{error}</div>}
        
        <div className="conversation-list">
          {loading.conversations ? (
            <div className="loading">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="empty-list">No conversations yet</div>
          ) : (
            conversations.map(conv => (
              <ConversationItem
                key={conv._id}
                conversation={conv}
                currentUserId={currentUserId}
                isActive={currentConversation?._id === conv._id}
                onClick={() => selectConversation(conv)}
                isOnline={onlineUsers.has(String(conv.participants?.find(p => String(p._id) !== String(currentUserId))?._id))}
              />
            ))
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
                {currentConversation.type === 'group' ? currentConversation.name : 
                  currentConversation.participants?.find(p => String(p._id) !== String(currentUserId))?.username}
                {currentConversation.type === 'group' && (
                  <span className="member-count">({currentConversation.participants?.length} members)</span>
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
                  <MessageItem
                    key={msg._id || idx}
                    message={msg}
                    currentUserId={currentUserId}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                  />
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
                  <div key={u._id} className="user-item" onClick={() => startPrivateChat(u._id)}>
                    <div className="conversation-avatar">
                      {u.avatar ? <img src={u.avatar} alt={u.username} /> : u.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <span>{u.username}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-secondary" onClick={() => setShowNewChatModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showCreateGroupModal && (
        <div className="modal-overlay" onClick={() => setShowCreateGroupModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create Group</h3>
            <div className="form-group">
              <input type="text" placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Add members (optional):</label>
              <div className="user-list scrollable">
                {users.map(u => (
                  <div 
                    key={u._id} 
                    className={`user-item selectable ${selectedUsers.includes(u._id) ? 'selected' : ''}`}
                    onClick={() => setSelectedUsers(prev => 
                      prev.includes(u._id) ? prev.filter(id => id !== u._id) : [...prev, u._id]
                    )}
                  >
                    <div className="checkbox">{selectedUsers.includes(u._id) && '✓'}</div>
                    <div className="conversation-avatar">
                      {u.avatar ? <img src={u.avatar} alt={u.username} /> : u.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <span>{u.username}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={createGroup} disabled={!groupName.trim()}>Create Group</button>
              <button className="btn-secondary" onClick={() => { setShowCreateGroupModal(false); setGroupName(''); setSelectedUsers([]); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showGroupInfoModal && currentConversation && (
        <div className="modal-overlay" onClick={() => setShowGroupInfoModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{currentConversation.name}</h3>
            <p className="group-info">{currentConversation.participants?.length} members • Created by {currentConversation.admin?.username}</p>
            
            <div className="user-list scrollable">
              {currentConversation.participants?.map(p => (
                <div key={p._id} className="user-item">
                  <div className="conversation-avatar">
                    {p.avatar ? <img src={p.avatar} alt={p.username} /> : p.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="user-info">
                    <span>{p.username}</span>
                    {String(p._id) === String(currentConversation.admin?._id) && <span className="admin-badge">Admin</span>}
                  </div>
                  {isGroupAdmin && String(p._id) !== String(currentUserId) && (
                    <button className="btn-remove" onClick={() => removeMember(p._id)}>Remove</button>
                  )}
                </div>
              ))}
            </div>

            {isGroupAdmin && (
              <div className="form-group">
                <label>Add members:</label>
                <div className="user-list scrollable">
                  {availableUsers.map(u => (
                    <div key={u._id} className="user-item selectable" onClick={() => addMembersToGroup([u._id])}>
                      <div className="conversation-avatar">
                        {u.avatar ? <img src={u.avatar} alt={u.username} /> : u.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <span>{u.username}</span>
                      <button className="btn-add">Add</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-danger" onClick={leaveGroup}>Leave Group</button>
              <button className="btn-secondary" onClick={() => setShowGroupInfoModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;