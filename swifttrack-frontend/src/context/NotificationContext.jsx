import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { wsService, notificationsAPI } from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

// Relative time helper
function timeAgo(dateString) {
  if (!dateString) return '';
  const secs = Math.floor((Date.now() - new Date(dateString)) / 1000);
  if (secs < 5)    return 'Just now';
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// Status → notification meta
const STATUS_META = {
  out_for_delivery: { title: 'Out for Delivery', type: 'delivery' },
  delivered:        { title: 'Order Delivered',   type: 'delivery' },
  failed:           { title: 'Delivery Failed',   type: 'alert'    },
  cancelled:        { title: 'Order Cancelled',   type: 'system'   },
  confirmed:        { title: 'Order Confirmed',   type: 'delivery' },
  in_warehouse:     { title: 'In Warehouse',      type: 'delivery' },
};

// CMS Service event meta
const CMS_META = {
  cms_validation_started: { title: 'CMS: Validating Customer', icon: '🔍', color: 'blue' },
  cms_validation_success: { title: 'CMS: Customer Validated', icon: '✅', color: 'green' },
  cms_validation_skipped: { title: 'CMS: Validation Skipped', icon: '⚠️', color: 'yellow' },
};

// ROS Service event meta
const ROS_META = {
  ros_optimization_started: { title: 'ROS: Calculating Route', icon: '📍', color: 'blue' },
  ros_optimization_success: { title: 'ROS: Route Optimized', icon: '✅', color: 'green' },
  ros_optimization_skipped: { title: 'ROS: Route Skipped', icon: '⚠️', color: 'yellow' },
  ros_optimization_error:   { title: 'ROS: Route Error', icon: '❌', color: 'red' },
};

function makeStatusNotif(orderId, status) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const messages = {
    out_for_delivery: `Order #${orderId} is on its way to you`,
    delivered:        `Order #${orderId} has been delivered successfully`,
    failed:           `Delivery attempt for order #${orderId} failed`,
    cancelled:        `Order #${orderId} has been cancelled`,
    confirmed:        `Order #${orderId} has been confirmed`,
    in_warehouse:     `Order #${orderId} is now in the warehouse`,
  };
  return {
    id: `ws-${orderId}-${status}-${Date.now()}`,
    type: meta.type,
    title: meta.title,
    message: messages[status] || `Order #${orderId} — ${status}`,
    read: false,
    data: { order_id: String(orderId), status },
    createdAt: new Date().toISOString(),
    time: 'Just now',
    fromWs: true,
  };
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const wsSubscribed = useRef(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  // De-duplicated add
  const addNotif = useCallback((notif) => {
    setNotifications(prev =>
      prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]
    );
  }, []);

  // Fetch DB notifications
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await notificationsAPI.getAll();
      setNotifications(
        (res.data || []).map(n => ({ ...n, time: timeAgo(n.createdAt) }))
      );
    } catch (e) {
      console.error('[Notifications] fetch failed:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Re-fetch when user changes
  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
    } else {
      setNotifications([]);
      wsSubscribed.current = false;
    }
  }, [user?.id]);

  // WebSocket subscriptions
  useEffect(() => {
    if (!user?.id) return;
    if (wsSubscribed.current) return;
    wsSubscribed.current = true;

    wsService.connect();
    // Authenticate with user ID and role
    wsService.authenticate(user.id, user.role);

    const onConnect    = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    wsService.socket?.on('connect', onConnect);
    wsService.socket?.on('disconnect', onDisconnect);
    setIsConnected(wsService.socket?.connected || false);

    // DB-persisted notification (pushed on auth + new ones)
    const unsubNotif = wsService.on('notification', (data) => {
      const notif = {
        id: String(data.id || `ws-notif-${Date.now()}`),
        type: data.type || 'system',
        title: data.title || 'Notification',
        message: data.message || '',
        read: false,
        data: data.data || {},
        createdAt: data.created_at || new Date().toISOString(),
        time: timeAgo(data.created_at),
      };
      addNotif(notif);
      if (!data.is_pending) toast(notif.title);
    });

    // Order status changes (skip intermediate pipeline stages)
    const unsubStatus = wsService.on('order_status_update', (data) => {
      const orderId = data.orderId || data.order_id;
      const status  = data.status;
      if (['confirmed', 'in_warehouse'].includes(status)) return;
      const notif = makeStatusNotif(orderId, status);
      if (!notif) return;
      addNotif(notif);
      if (status === 'delivered')       toast.success(notif.message);
      else if (status === 'failed')     toast.error(notif.message);
      else                              toast(notif.message);
    });

    // Driver assigned (client side)
    const unsubDriver = wsService.on('driver_assigned', (data) => {
      const orderId    = String(data.order_id || data.orderId || '');
      const driverName = data.data?.driver_name || data.driver_name || 'A driver';
      const notif = {
        id: `ws-driver-${orderId}-${Date.now()}`,
        type: 'delivery',
        title: 'Driver Assigned',
        message: `${driverName} has been assigned to your order #${orderId}`,
        read: false,
        data: { order_id: orderId },
        createdAt: new Date().toISOString(),
        time: 'Just now',
        fromWs: true,
      };
      addNotif(notif);
      toast(notif.message);
    });

    // New assignment (driver side)
    const unsubAssignment = wsService.on('new_assignment', (data) => {
      const orderId = String(data.order_id || data.orderId || '');
      const notif = {
        id: `ws-assignment-${orderId}-${Date.now()}`,
        type: 'delivery',
        title: 'New Delivery Assigned',
        message: `You have a new delivery assignment for order #${orderId}`,
        read: false,
        data: { order_id: orderId },
        createdAt: new Date().toISOString(),
        time: 'Just now',
        fromWs: true,
      };
      addNotif(notif);
      toast(notif.message);
    });

    // Delivery completed
    const unsubDelivered = wsService.on('delivery_completed', (data) => {
      const orderId = String(data.orderId || data.order_id || '');
      const notif = {
        id: `ws-delivered-${orderId}-${Date.now()}`,
        type: 'delivery',
        title: 'Order Delivered',
        message: `Order #${orderId} has been delivered successfully`,
        read: false,
        data: { order_id: orderId, status: 'delivered' },
        createdAt: new Date().toISOString(),
        time: 'Just now',
        fromWs: true,
      };
      addNotif(notif);
      toast.success(notif.message);
    });

    // New order created (admin side)
    const unsubNewOrder = wsService.on('new_order', (data) => {
      const orderId = String(data.orderId || data.order_id || '');
      const clientName = data.clientName || data.client_name || 'A customer';
      const notif = {
        id: `ws-neworder-${orderId}-${Date.now()}`,
        type: 'delivery',
        title: 'New Order Received',
        message: `New order #${orderId} from ${clientName}`,
        read: false,
        data: { order_id: orderId, delivery: data.deliveryAddress },
        createdAt: new Date().toISOString(),
        time: 'Just now',
        fromWs: true,
      };
      addNotif(notif);
      toast.success(notif.message);
    });

    // Middleware/pipeline updates
    const unsubMiddleware = wsService.on('middleware_update', (data) => {
      const orderId = String(data.orderId || data.order_id || '');
      const stage = data.stage || data.status || 'processing';
      const formattedStage = stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const notif = {
        id: `ws-middleware-${orderId}-${stage}-${Date.now()}`,
        type: 'system',
        title: 'Order Update',
        message: `Order #${orderId}: ${formattedStage}`,
        read: false,
        data: { order_id: orderId, stage },
        createdAt: new Date().toISOString(),
        time: 'Just now',
        fromWs: true,
      };
      addNotif(notif);
    });

    // ============ CMS Service (SOAP/XML) Updates ============
    const unsubCms = wsService.on('cms_update', (data) => {
      const orderId = String(data.orderId || data.order_id || '');
      const eventType = data.type || 'cms_update';
      const meta = CMS_META[eventType] || { title: 'CMS Update', icon: '📄', color: 'blue' };
      const notif = {
        id: `ws-cms-${orderId}-${eventType}-${Date.now()}`,
        type: 'system',
        title: `${meta.icon} ${meta.title}`,
        message: data.message || `CMS Service processing order #${orderId}`,
        read: false,
        data: { 
          order_id: orderId, 
          service: 'CMS', 
          protocol: 'SOAP/XML',
          stage: data.stage,
          eventType 
        },
        createdAt: new Date().toISOString(),
        time: 'Just now',
        fromWs: true,
        serviceUpdate: true,
        color: meta.color,
      };
      addNotif(notif);
      // Show toast for CMS updates
      if (eventType === 'cms_validation_success') {
        toast.success(notif.message);
      } else {
        toast(notif.message);
      }
    });

    // ============ ROS Service (REST/JSON) Updates ============
    const unsubRos = wsService.on('ros_update', (data) => {
      const orderId = String(data.orderId || data.order_id || '');
      const eventType = data.type || 'ros_update';
      const meta = ROS_META[eventType] || { title: 'ROS Update', icon: '🗺️', color: 'blue' };
      
      // Build detailed message for route optimization
      let message = data.message || `ROS Service processing order #${orderId}`;
      if (eventType === 'ros_optimization_success' && data.distance_km) {
        message = `Route optimized: ${data.distance_km}km, ~${data.estimated_duration || 0} mins`;
      }
      
      const notif = {
        id: `ws-ros-${orderId}-${eventType}-${Date.now()}`,
        type: 'system',
        title: `${meta.icon} ${meta.title}`,
        message,
        read: false,
        data: { 
          order_id: orderId, 
          service: 'ROS', 
          protocol: 'REST/JSON',
          stage: data.stage,
          route_id: data.route_id,
          distance_km: data.distance_km,
          estimated_duration: data.estimated_duration,
          eventType 
        },
        createdAt: new Date().toISOString(),
        time: 'Just now',
        fromWs: true,
        serviceUpdate: true,
        color: meta.color,
      };
      addNotif(notif);
      // Show toast for ROS updates
      if (eventType === 'ros_optimization_success') {
        toast.success(notif.message);
      } else if (eventType === 'ros_optimization_error') {
        toast.error(notif.message);
      } else {
        toast(notif.message);
      }
    });

    // Driver location updates (for live tracking notifications)
    const unsubLocation = wsService.on('driver_location', (data) => {
      // Only create notification for significant location updates (optional)
      // This is mainly for dashboard visual updates, not notification list
    });

    return () => {
      wsSubscribed.current = false;
      unsubNotif();
      unsubStatus();
      unsubDriver();
      unsubAssignment();
      unsubDelivered();
      unsubNewOrder();
      unsubMiddleware();
      unsubCms();
      unsubRos();
      unsubLocation();
      wsService.socket?.off('connect', onConnect);
      wsService.socket?.off('disconnect', onDisconnect);
    };
  }, [user?.id, addNotif]);

  // Refresh relative timestamps every minute
  useEffect(() => {
    const tick = setInterval(() => {
      setNotifications(prev =>
        prev.map(n => ({ ...n, time: timeAgo(n.createdAt) }))
      );
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  // ---- Public API ----

  const addNotification = useCallback((notification) => {
    addNotif({
      ...notification,
      id: notification.id || String(Date.now()),
      createdAt: notification.createdAt || new Date().toISOString(),
      time: timeAgo(notification.createdAt),
    });
  }, [addNotif]);

  const markAsRead = useCallback(async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (!String(id).startsWith('ws-')) {
      try { await notificationsAPI.markRead(id); } catch {}
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (user?.id) {
      try { await notificationsAPI.markAllRead(); } catch {}
    }
  }, [user?.id]);

  const clearNotification = useCallback(async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (!String(id).startsWith('ws-')) {
      try { await notificationsAPI.delete(id); } catch {}
    }
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const value = {
    notifications,
    unreadCount,
    loading,
    isConnected,
    fetchNotifications,
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
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
}

