import { useState } from 'react';
import './MessageItem.css';

const MessageItem = ({ message, currentUserId, onEdit, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const isOwnMessage = String(message.sender?._id) === String(currentUserId);
  const canModify = isOwnMessage && !message.isDeleted;

  const handleSaveEdit = () => {
    if (editContent.trim()) {
      onEdit(message._id, editContent.trim());
      setIsEditing(false);
      setShowMenu(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Delete this message?')) {
      onDelete(message._id);
    }
    setShowMenu(false);
  };

  return (
    <div className={`message ${message.sender?._id === currentUserId ? 'sent' : 'received'}`}>
      {message.sender?._id !== currentUserId && message.conversationId?.type === 'group' && (
        <div className="message-sender">{message.sender?.username}</div>
      )}
      
      {isEditing ? (
        <div className="message-edit">
          <input
            type="text"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
          />
          <div className="edit-actions">
            <button onClick={handleSaveEdit}>Save</button>
            <button onClick={() => { setIsEditing(false); setEditContent(message.content); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="message-bubble">
          {message.isDeleted ? (
            <span className="deleted-message">{message.content}</span>
          ) : (
            message.content
          )}
          {message.editedAt && !message.isDeleted && (
            <span className="edited-indicator">(edited)</span>
          )}
        </div>
      )}
      
      <div className="message-meta">
        <div className="message-time">
          {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          }) : ''}
        </div>
        
        {canModify && (
          <button className="message-menu-btn" onClick={() => setShowMenu(!showMenu)}>
            ⋮
          </button>
        )}
        
        {showMenu && canModify && (
          <div className="message-menu">
            <button onClick={() => { setIsEditing(true); setShowMenu(false); }}>Edit</button>
            <button onClick={handleDelete}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageItem;