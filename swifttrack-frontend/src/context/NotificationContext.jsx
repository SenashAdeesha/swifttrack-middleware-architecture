import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

const NotificationContext = createContext(null);

// Simulated real-time notifications
const MOCK_NOTIFICATIONS = [
  { id: 1, type: 'delivery', title: 'Order Delivered', message: 'Order #ORD-001 has been delivered successfully', time: '2 min ago', read: false },
  { id: 2, type: 'route', title: 'Route Updated', message: 'Your delivery route has been optimized', time: '15 min ago', read: false },
  { id: 3, type: 'alert', title: 'Urgent Delivery', message: 'Express delivery assigned to you', time: '1 hour ago', read: true },
  { id: 4, type: 'system', title: 'System Update', message: 'SwiftTrack app was updated to v2.1', time: '2 hours ago', read: true },
];

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [isConnected, setIsConnected] = useState(true);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Simulate WebSocket connection for real-time updates
  useEffect(() => {
    // Simulate periodic notifications
    const interval = setInterval(() => {
      const random = Math.random();
      if (random > 0.8) {
        const newNotification = {
          id: Date.now(),
          type: ['delivery', 'route', 'alert', 'system'][Math.floor(Math.random() * 4)],
          title: 'New Update',
          message: 'You have a new notification',
          time: 'Just now',
          read: false,
        };
        addNotification(newNotification);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const addNotification = useCallback((notification) => {
    setNotifications(prev => [notification, ...prev]);
    toast(notification.title, {
      icon: notification.type === 'alert' ? '🚨' : '📦',
    });
  }, []);

  const markAsRead = useCallback((id) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = {
    notifications,
    unreadCount,
    isConnected,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
