import { useState } from 'react';
import {
  Bell, Check, CheckCheck, Trash2, Package, Truck, AlertCircle,
  Info, Settings, Volume2, VolumeX, Mail, Smartphone, RefreshCw, Wifi, WifiOff,
  Users, Shield, Activity,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal, EmptyState } from '../../components/common';
import { useNotifications } from '../../context/NotificationContext';
import toast from 'react-hot-toast';

const AdminNotifications = () => {
  const {
    notifications,
    unreadCount,
    loading,
    isConnected,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
  } = useNotifications();

  const [filter, setFilter] = useState('all');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState({
    sound: true,
    email: true,
    push: true,
    orderUpdates: true,
    driverAlerts: true,
    systemAlerts: true,
    userActivity: true,
  });

  const getIcon = (type) => {
    const icons = {
      delivery: Truck,
      alert:    AlertCircle,
      system:   Info,
      email:    Mail,
      push:     Bell,
      sms:      Smartphone,
      user:     Users,
      security: Shield,
      activity: Activity,
    };
    return icons[type] || Bell;
  };

  const getColor = (type) => {
    const colors = {
      delivery: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
      alert:    'bg-red-100 text-red-600 dark:bg-red-900/30',
      system:   'bg-gray-100 text-gray-600 dark:bg-gray-800',
      email:    'bg-purple-100 text-purple-600 dark:bg-purple-900/30',
      push:     'bg-green-100 text-green-600 dark:bg-green-900/30',
      sms:      'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30',
      user:     'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30',
      security: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30',
      activity: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30',
    };
    return colors[type] || 'bg-gray-100 text-gray-600';
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'all')    return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const filterOptions = [
    { value: 'all',      label: 'All',      count: notifications.length },
    { value: 'unread',   label: 'Unread',   count: unreadCount },
    { value: 'delivery', label: 'Orders',   count: notifications.filter(n => n.type === 'delivery').length },
    { value: 'alert',    label: 'Alerts',   count: notifications.filter(n => n.type === 'alert').length },
    { value: 'system',   label: 'System',   count: notifications.filter(n => n.type === 'system').length },
  ];

  const handleMarkRead = async (id) => {
    await markAsRead(id);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    toast.success('All marked as read');
  };

  const handleDelete = async (id) => {
    await clearNotification(id);
  };

  const handleClearAll = () => {
    clearAll();
    toast.success('All notifications cleared');
  };

  const handleSettingChange = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveSettings = () => {
    toast.success('Notification settings saved!');
    setShowSettingsModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Notifications</h1>
            {isConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Wifi className="w-3 h-3" />
                <span>Live</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchNotifications} disabled={loading}>
            {loading ? 'Updating…' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" icon={Settings} onClick={() => setShowSettingsModal(true)}>
            Settings
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-wrap gap-2">
          {filterOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
                ${filter === opt.value
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300'
                }`}
            >
              {opt.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                filter === opt.value
                  ? 'bg-primary-200 dark:bg-primary-800'
                  : 'bg-gray-200 dark:bg-slate-600'
              }`}>
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Actions */}
      {notifications.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {filteredNotifications.length} of {notifications.length} notifications
          </p>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" icon={CheckCheck} onClick={handleMarkAllRead}>
                Mark all read
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={Trash2} onClick={handleClearAll} className="text-red-600 hover:text-red-700">
              Clear all
            </Button>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <Card padding="none">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-gray-200 dark:bg-slate-700 rounded" />
                  <div className="h-3 w-2/3 bg-gray-200 dark:bg-slate-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description={filter === 'all' ? "You're all caught up!" : `No ${filter} notifications`}
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {filteredNotifications.map(notification => {
              const Icon = getIcon(notification.type);
              return (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors
                    ${!notification.read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getColor(notification.type)}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{notification.title}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{notification.message}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{notification.time}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {!notification.read && (
                            <button
                              onClick={() => handleMarkRead(notification.id)}
                              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                              title="Mark as read"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(notification.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Settings Modal */}
      <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Notification Settings">
        <div className="space-y-6 p-4">
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 dark:text-white">Admin Preferences</h3>
            {[
              { key: 'sound', icon: settings.sound ? Volume2 : VolumeX, label: 'Sound alerts' },
              { key: 'push', icon: Bell, label: 'Push notifications' },
              { key: 'orderUpdates', icon: Package, label: 'Order status updates' },
              { key: 'driverAlerts', icon: Truck, label: 'Driver alerts' },
              { key: 'userActivity', icon: Users, label: 'User activity' },
              { key: 'systemAlerts', icon: AlertCircle, label: 'System alerts' },
            ].map(item => (
              <label key={item.key} className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                </div>
                <div
                  onClick={() => handleSettingChange(item.key)}
                  className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative
                    ${settings[item.key] ? 'bg-primary-500' : 'bg-gray-300 dark:bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                    ${settings[item.key] ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowSettingsModal(false)}>Cancel</Button>
            <Button onClick={handleSaveSettings}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminNotifications;
