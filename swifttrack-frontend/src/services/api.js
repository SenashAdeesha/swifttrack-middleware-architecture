import axios from 'axios';
import { io } from 'socket.io-client';

// =============================================================================
// API Configuration
// =============================================================================
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5002/api';
const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:5006';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('swifttrack_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('swifttrack_token');
      localStorage.removeItem('swifttrack_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// =============================================================================
// WebSocket Service - Real-time Updates
// =============================================================================
class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(WEBSOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('[WS] WebSocket connected');
      this.reconnectAttempts = 0;
      // Automatically authenticate if user is logged in
      const token = localStorage.getItem('swifttrack_token');
      if (token) {
        this.authenticate(token);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] WebSocket disconnected:', reason);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Set up event forwarding
    ['order_status_update', 'driver_location', 'new_order', 'driver_assigned',
     'new_assignment', 'delivery_completed', 'notification', 'proof_uploaded',
     'middleware_update', 'cms_update', 'ros_update', 'wms_update', 'timeline_update'].forEach(event => {
      this.socket.on(event, (data) => {
        this.emit(event, data);
      });
    });

    return this;
  }

  authenticate(userIdOrToken, role = null) {
    if (this.socket?.connected) {
      // Support both (token) and (userId, role) signatures
      if (role) {
        this.socket.emit('authenticate', { userId: userIdOrToken, role });
      } else {
        // Try to get user data from localStorage
        const userStr = localStorage.getItem('swifttrack_user');
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            this.socket.emit('authenticate', { userId: user.id, role: user.role });
          } catch (e) {
            console.error('[WS] Failed to parse user data:', e);
          }
        }
      }
    }
  }

  subscribeToOrder(orderId) {
    if (this.socket?.connected) {
      this.socket.emit('subscribe_order', { orderId });
    }
  }

  unsubscribeFromOrder(orderId) {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe_order', { orderId });
    }
  }

  updateDriverLocation(lat, lng, orderId = null) {
    if (this.socket?.connected) {
      this.socket.emit('update_driver_location', { lat, lng, orderId });
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event, data) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

export const wsService = new WebSocketService();

// =============================================================================
// AUTH API
// =============================================================================
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    if (response.data.token) {
      localStorage.setItem('swifttrack_token', response.data.token);
      localStorage.setItem('swifttrack_user', JSON.stringify(response.data.user));
      // Connect WebSocket after login
      wsService.connect();
      wsService.authenticate(response.data.user.id, response.data.user.role);
    }
    return response;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    if (response.data.token) {
      localStorage.setItem('swifttrack_token', response.data.token);
      localStorage.setItem('swifttrack_user', JSON.stringify(response.data.user));
      wsService.connect();
      wsService.authenticate(response.data.user.id, response.data.user.role);
    }
    return response;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore logout errors
    }
    wsService.disconnect();
    localStorage.removeItem('swifttrack_token');
    localStorage.removeItem('swifttrack_user');
  },

  getProfile: async () => {
    return api.get('/auth/profile');
  },
};

// =============================================================================
// ORDERS API
// =============================================================================
export const ordersAPI = {
  getAll: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.clientId) params.append('clientId', filters.clientId);
    if (filters.driverId) params.append('driverId', filters.driverId);
    const response = await api.get(`/orders?${params}`);
    return { data: response.data.data || response.data.orders || [] };
  },

  getById: async (orderId) => {
    const response = await api.get(`/orders/${orderId}`);
    return { data: response.data.data || response.data };
  },

  create: async (orderData) => {
    const response = await api.post('/orders', orderData);
    return { data: response.data.data || response.data };
  },

  update: async (orderId, updates) => {
    const response = await api.put(`/orders/${orderId}`, updates);
    return { data: response.data.data || response.data };
  },

  updateStatus: async (orderId, status) => {
    const response = await api.put(`/orders/${orderId}/status`, { status });
    return { data: response.data };
  },

  cancel: async (orderId, reason = '') => {
    const response = await api.post(`/orders/${orderId}/cancel`, { reason });
    return { data: response.data.data || response.data };
  },

  assignDriver: async (orderId, driverId) => {
    const response = await api.post(`/orders/${orderId}/assign`, { driverId });
    return { data: response.data };
  },

  markDelivered: async (orderId, deliveryData = {}) => {
    const response = await api.post(`/orders/${orderId}/delivered`, deliveryData);
    return { data: response.data.data || response.data };
  },

  markFailed: async (orderId, failureData) => {
    const response = await api.post(`/orders/${orderId}/failed`, failureData);
    return { data: response.data.data || response.data };
  },

  startDelivery: async (orderId) => {
    const response = await api.post(`/orders/${orderId}/start_delivery`, {});
    return { data: response.data };
  },

  acceptOrder: async (orderId) => {
    const response = await api.post(`/orders/${orderId}/accept`, {});
    return { data: response.data };
  },

  rejectOrder: async (orderId, reason = '') => {
    const response = await api.post(`/orders/${orderId}/reject`, { reason });
    return { data: response.data };
  },

  uploadProof: async (orderId, proofData) => {
    const response = await api.post(`/orders/${orderId}/proof`, proofData);
    return { data: response.data };
  },

  getProof: async (orderId) => {
    const response = await api.get(`/orders/${orderId}/proof`);
    return { data: response.data };
  },

  getTimeline: async (orderId) => {
    const response = await api.get(`/orders/${orderId}`);
    return { data: response.data.data?.timeline || response.data.timeline || [] };
  },
};

// =============================================================================
// DRIVER API
// =============================================================================
export const driverAPI = {
  getAll: async () => {
    const response = await api.get('/drivers');
    return { data: response.data.data || response.data.drivers || [] };
  },

  getById: async (driverId) => {
    const response = await api.get(`/drivers/${driverId}`);
    return { data: response.data.data || response.data };
  },

  getRoute: async (driverId) => {
    const response = await api.get(`/drivers/${driverId}/route`);
    return { data: response.data.data || response.data.route || [] };
  },

  getStats: async (driverId) => {
    const response = await api.get(`/drivers/${driverId}/stats`);
    return { data: response.data.data || response.data };
  },

  updateLocation: async (driverId, location) => {
    const response = await api.put(`/drivers/${driverId}/location`, location);
    // Also update via WebSocket for real-time
    wsService.updateDriverLocation(location.lat, location.lng, location.orderId);
    return { data: response.data };
  },

  updateStatus: async (driverId, status) => {
    const response = await api.put(`/drivers/${driverId}/status`, { status });
    return { data: response.data.data || response.data };
  },

  getAssignments: async (driverId) => {
    // Include all statuses so completed/failed orders appear in the route list
    const response = await api.get('/orders', { params: { driverId, status: 'confirmed,picked_up,in_warehouse,out_for_delivery,delivered,failed' } });
    return { data: response.data.data || response.data.orders || [] };
  },
};

// =============================================================================
// CLIENT API
// =============================================================================
export const clientAPI = {
  getAll: async () => {
    const response = await api.get('/clients');
    return { data: response.data.data || response.data.clients || [] };
  },

  getById: async (clientId) => {
    const response = await api.get(`/clients/${clientId}`);
    return { data: response.data.data || response.data };
  },

  getStats: async (clientId) => {
    const response = await api.get(`/clients/${clientId}/stats`);
    return { data: response.data.data || response.data };
  },

  updateStatus: async (clientId, status) => {
    const response = await api.put(`/clients/${clientId}/status`, { status });
    return { data: response.data.data || response.data };
  },

  getBillingHistory: async (clientId) => {
    const response = await api.get(`/clients/${clientId}/billing`);
    return { data: response.data.data || response.data.billing || [] };
  },

  getOrders: async (clientId) => {
    return ordersAPI.getAll({ clientId });
  },
};

// =============================================================================
// ADMIN API
// =============================================================================
export const adminAPI = {
  getStats: async () => {
    const response = await api.get('/admin/stats');
    return { data: response.data.data || response.data };
  },

  getUsers: async () => {
    const response = await api.get('/admin/users');
    return { data: response.data.users || [] };
  },

  createUser: async (userData) => {
    const response = await api.post('/admin/users', userData);
    return { data: response.data };
  },

  updateUserStatus: async (userId, status) => {
    const response = await api.put(`/admin/users/${userId}/status`, { status });
    return { data: response.data };
  },

  getSystemLogs: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.source) params.append('source', filters.source);
    const response = await api.get(`/admin/logs?${params}`);
    return { data: response.data.data || response.data.logs || [] };
  },

  getAnalytics: async (period = 'week') => {
    const response = await api.get(`/admin/analytics?period=${period}`);
    return { data: response.data.data || response.data };
  },
};

// =============================================================================
// NOTIFICATIONS API
// =============================================================================
export const notificationsAPI = {
  getAll: async () => {
    const response = await api.get('/notifications');
    return { data: response.data.data || response.data.notifications || [] };
  },

  markRead: async (notificationId) => {
    const response = await api.put(`/notifications/${notificationId}/read`);
    return { data: response.data };
  },

  markAllRead: async () => {
    const response = await api.put('/notifications/read-all');
    return { data: response.data };
  },

  delete: async (notificationId) => {
    const response = await api.delete(`/notifications/${notificationId}`);
    return { data: response.data };
  },
};

// Initialize WebSocket on page load if user is logged in
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('swifttrack_token');
  if (token) {
    wsService.connect();
  }
}

export default api;
