import './ConversationItem.css';

const ConversationItem = ({ 
  conversation, 
  currentUserId, 
  isActive, 
  onClick,
  isOnline 
}) => {
  const getConversationName = () => {
    if (conversation.type === 'group') return conversation.name;
    const other = conversation.participants?.find(p => String(p._id) !== String(currentUserId));
    return other?.username || 'Unknown';
  };

  const getConversationAvatar = () => {
    if (conversation.type === 'group') {
      return conversation.name?.[0]?.toUpperCase() || 'G';
    }
    const other = conversation.participants?.find(p => String(p._id) !== String(currentUserId));
    return other?.avatar ? 
      <img src={other.avatar} alt={other.username} /> : 
      other?.username?.[0]?.toUpperCase() || 'U';
  };

  const otherUserId = conversation.participants?.find(
    p => String(p._id) !== String(currentUserId)
  )?._id;
  
  const showOnlineIndicator = conversation.type === 'private' && isOnline;

  return (
    <div
      className={`conversation-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="avatar-wrapper">
        <div className="conversation-avatar">
          {getConversationAvatar()}
        </div>
        {showOnlineIndicator && <span className="online-indicator"></span>}
      </div>
      <div className="conversation-info">
        <h4>{getConversationName()}</h4>
        <p>{conversation.lastMessage?.content?.substring(0, 30) || ''}</p>
      </div>
      {conversation.unreadCount > 0 && (
        <div className="unread-badge">{conversation.unreadCount}</div>
      )}
    </div>
  );
};

export default ConversationItem;