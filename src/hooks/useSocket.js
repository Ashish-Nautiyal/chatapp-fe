import { useState, useEffect } from 'react';

export const useSocket = (url) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

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
        setIsConnected(true);
      });
      
      newSocket.on('disconnect', () => {
        setIsConnected(false);
      });
      
      setSocket(newSocket);
    });
    
    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  }, [url]);

  return { socket, isConnected };
};

export default useSocket;