import { useState, useEffect } from 'react';
import {
  Bell, Check, CheckCheck, Trash2, Filter, Package, Truck, AlertCircle,
  Info, Settings, Volume2, VolumeX, Mail, Smartphone, X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal, EmptyState } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const Notifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState({
    sound: true,
    email: true,
    push: true,
    deliveryUpdates: true,
    promotions: false,
    systemAlerts: true,
  });

  useEffect(() => {
    // Mock notifications
    setNotifications([
      { id: 1, type: 'delivery', title: 'Order Out for Delivery', message: 'Your order #ORD-001 is on its way!', time: '5 minutes ago', read: false },
      { id: 2, type: 'delivery', title: 'Order Delivered', message: 'Your order #ORD-002 has been delivered successfully.', time: '1 hour ago', read: false },
      { id: 3, type: 'promo', title: 'Weekend Special', message: 'Get 20% off on all deliveries this weekend!', time: '2 hours ago', read: true },
      { id: 4, type: 'system', title: 'Account Verified', message: 'Your email has been verified successfully.', time: '1 day ago', read: true },
      { id: 5, type: 'delivery', title: 'Driver Assigned', message: 'Mike Johnson is your assigned driver for order #ORD-003.', time: '2 days ago', read: true },
    ]);
    setLoading(false);
  }, []);

  const getIcon = (type) => {
    const icons = { delivery: Truck, promo: Package, system: Info };
    return icons[type] || Bell;
  };

  const getColor = (type) => {
    const colors = { delivery: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30', promo: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30', system: 'bg-gray-100 text-gray-600 dark:bg-gray-800' };
    return colors[type] || 'bg-gray-100 text-gray-600';
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkRead = (id) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
    toast.success('Marked as read');
  };

  const handleMarkAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    toast.success('All marked as read');
  };

  const handleDelete = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
    toast.success('Notification deleted');
  };

  const handleClearAll = () => {
    setNotifications([]);
    toast.success('All notifications cleared');
  };

  const handleSettingChange = (key) => {
    setSettings({ ...settings, [key]: !settings[key] });
  };

  const handleSaveSettings = () => {
    toast.success('Notification settings saved!');
    setShowSettingsModal(false);
  };

  const filterOptions = [
    { value: 'all', label: 'All', count: notifications.length },
    { value: 'unread', label: 'Unread', count: unreadCount },
    { value: 'delivery', label: 'Delivery', count: notifications.filter(n => n.type === 'delivery').length },
    { value: 'promo', label: 'Promotions', count: notifications.filter(n => n.type === 'promo').length },
    { value: 'system', label: 'System', count: notifications.filter(n => n.type === 'system').length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notifications` : 'You\'re all caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={Settings} onClick={() => setShowSettingsModal(true)}>Settings</Button>
          {unreadCount > 0 && <Button variant="outline" size="sm" icon={CheckCheck} onClick={handleMarkAllRead}>Mark All Read</Button>}
          {notifications.length > 0 && <Button variant="outline" size="sm" icon={Trash2} onClick={handleClearAll}>Clear All</Button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {filterOptions.map(opt => (
          <button key={opt.value} onClick={() => setFilter(opt.value)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition ${filter === opt.value ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>
            {opt.label}
            <span className={`px-2 py-0.5 rounded-full text-xs ${filter === opt.value ? 'bg-primary-200 dark:bg-primary-800' : 'bg-gray-200 dark:bg-slate-600'}`}>{opt.count}</span>
          </button>
        ))}
      </div>

      {/* Notification Settings Banner */}
      {!settings.sound && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <VolumeX className="w-5 h-5 text-amber-600" />
          <p className="text-sm text-amber-700 dark:text-amber-400 flex-1">Sound notifications are muted</p>
          <button onClick={() => { setSettings({ ...settings, sound: true }); toast.success('Sound enabled'); }} className="text-sm text-amber-600 font-medium hover:underline">Enable</button>
        </div>
      )}

      {/* Notifications List */}
      <Card padding="none">
        {loading ? (
          <div className="p-8 text-center"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" /></div>
        ) : filteredNotifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications"
            description={filter !== 'all' ? 'No notifications match this filter' : 'You have no notifications yet'} />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {filteredNotifications.map(notif => {
              const Icon = getIcon(notif.type);
              return (
                <div key={notif.id} className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition ${!notif.read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                  <div className="flex gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${getColor(notif.type)}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold ${!notif.read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{notif.title}</p>
                          {!notif.read && <span className="w-2 h-2 bg-primary-500 rounded-full" />}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{notif.time}</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-3">
                        {!notif.read && (
                          <button onClick={() => handleMarkRead(notif.id)} className="flex items-center gap-1 text-xs text-primary-600 hover:underline">
                            <Check className="w-3.5 h-3.5" />Mark read
                          </button>
                        )}
                        <button onClick={() => handleDelete(notif.id)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />Delete
                        </button>
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
      <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Notification Settings" size="md">
        <div className="space-y-6">
          {/* Channels */}
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Notification Channels</p>
            <div className="space-y-3">
              {[
                { key: 'sound', label: 'Sound', desc: 'Play sound for new notifications', icon: settings.sound ? Volume2 : VolumeX },
                { key: 'email', label: 'Email', desc: 'Send notifications to your email', icon: Mail },
                { key: 'push', label: 'Push', desc: 'Push notifications on your device', icon: Smartphone },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                  </div>
                  <button onClick={() => handleSettingChange(item.key)}
                    className={`relative w-12 h-6 rounded-full transition ${settings[item.key] ? 'bg-primary-500' : 'bg-gray-300 dark:bg-slate-600'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings[item.key] ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Notification Types</p>
            <div className="space-y-3">
              {[
                { key: 'deliveryUpdates', label: 'Delivery Updates', desc: 'Order status and driver updates' },
                { key: 'promotions', label: 'Promotions', desc: 'Deals, offers and discounts' },
                { key: 'systemAlerts', label: 'System Alerts', desc: 'Account and security alerts' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                  <button onClick={() => handleSettingChange(item.key)}
                    className={`relative w-12 h-6 rounded-full transition ${settings[item.key] ? 'bg-primary-500' : 'bg-gray-300 dark:bg-slate-600'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings[item.key] ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowSettingsModal(false)}>Cancel</Button>
            <Button fullWidth onClick={handleSaveSettings}>Save Settings</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Notifications;
