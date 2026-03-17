import { useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export const useChatApi = (token) => {
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

  const getConversations = useCallback(async () => {
    return apiCall('/chat/conversations');
  }, [apiCall]);

  const getMessages = useCallback(async (conversationId) => {
    return apiCall(`/chat/messages/${conversationId}`);
  }, [apiCall]);

  const sendMessage = useCallback(async (conversationId, content) => {
    return apiCall('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ conversationId, content }),
    });
  }, [apiCall]);

  const editMessage = useCallback(async (messageId, content) => {
    return apiCall(`/chat/message/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }, [apiCall]);

  const deleteMessage = useCallback(async (messageId) => {
    return apiCall(`/chat/message/${messageId}`, {
      method: 'DELETE',
    });
  }, [apiCall]);

  const markAsRead = useCallback(async (conversationId) => {
    return apiCall(`/chat/conversation/${conversationId}/read`, {
      method: 'POST',
    });
  }, [apiCall]);

  const getAllUsers = useCallback(async () => {
    return apiCall('/auth/users');
  }, [apiCall]);

  const getAvailableUsers = useCallback(async (conversationId = null) => {
    const query = conversationId ? `?conversationId=${conversationId}` : '';
    return apiCall(`/auth/users/available${query}`);
  }, [apiCall]);

  const createConversation = useCallback(async (type, participantIds, name) => {
    return apiCall('/chat/conversation', {
      method: 'POST',
      body: JSON.stringify({ type, participantIds, name }),
    });
  }, [apiCall]);

  const addGroupMembers = useCallback(async (groupId, userIds) => {
    return apiCall(`/chat/group/${groupId}/add-members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }, [apiCall]);

  const removeGroupMember = useCallback(async (groupId, userId) => {
    return apiCall(`/chat/group/${groupId}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }, [apiCall]);

  const leaveGroup = useCallback(async (groupId) => {
    return apiCall(`/chat/group/${groupId}/leave`, {
      method: 'POST',
    });
  }, [apiCall]);

  return {
    apiCall,
    getConversations,
    getMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    getAllUsers,
    getAvailableUsers,
    createConversation,
    addGroupMembers,
    removeGroupMember,
    leaveGroup,
  };
};

export default useChatApi;