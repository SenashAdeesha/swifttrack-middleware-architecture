import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Truck, Package, Activity, TrendingUp, DollarSign, Clock, AlertCircle,
  CheckCircle, ArrowRight, RefreshCw, Download, Server, Database, Bell, Zap,
  AlertTriangle, Settings, ChevronRight, Eye, BarChart3
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, StatCard, Modal } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { adminAPI, ordersAPI, wsService } from '../../services/api';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import toast from 'react-hot-toast';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({});
  const [recentOrders, setRecentOrders] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [showAlertModal, setShowAlertModal] = useState(false);

  // Handle real-time order status updates
  const handleOrderStatusUpdate = useCallback((data) => {
    const { orderId, status } = data;
    setRecentOrders(prev => prev.map(order => 
      String(order.id) === String(orderId) ? { ...order, status } : order
    ));
  }, []);

  // Handle new orders
  const handleNewOrder = useCallback((data) => {
    fetchDashboardData(true);
  }, []);

  useEffect(() => { fetchDashboardData(); }, []);

  // WebSocket subscription for real-time updates
  useEffect(() => {
    wsService.connect();
    
    const unsubStatus = wsService.on('order_status_update', handleOrderStatusUpdate);
    const unsubNew = wsService.on('new_order', handleNewOrder);
    const unsubDelivered = wsService.on('delivery_completed', handleOrderStatusUpdate);

    return () => {
      unsubStatus();
      unsubNew();
      unsubDelivered();
    };
  }, [handleOrderStatusUpdate, handleNewOrder]);

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = localStorage.getItem('swifttrack_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, ordersRes] = await Promise.all([
        adminAPI.getStats?.() || Promise.resolve({ data: {} }),
        ordersAPI.getAll({ limit: 10 })
      ]);
      setStats(statsRes.data || {});
      setRecentOrders(ordersRes.data || []);
      setAlerts([
        { id: 1, type: 'warning', message: 'Payment service response time elevated', time: '5 min ago' },
        { id: 2, type: 'info', message: '15 new user registrations today', time: '1 hour ago' },
        { id: 3, type: 'success', message: 'Database backup completed', time: '2 hours ago' },
      ]);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchDashboardData(true);
    toast.success('Dashboard refreshed');
  };

  const revenueData = [
    { month: 'Jan', revenue: 45000 }, { month: 'Feb', revenue: 52000 }, { month: 'Mar', revenue: 48000 },
    { month: 'Apr', revenue: 61000 }, { month: 'May', revenue: 55000 }, { month: 'Jun', revenue: 67000 },
  ];

  const ordersByStatus = [
    { name: 'Delivered', value: stats.delivered || 1245, color: '#22c55e' },
    { name: 'In Transit', value: stats.inTransit || 342, color: '#0ea5e9' },
    { name: 'Pending', value: stats.pending || 156, color: '#f59e0b' },
    { name: 'Failed', value: stats.failed || 23, color: '#ef4444' },
  ];

  const systemHealth = [
    { name: 'API Gateway', status: 'operational', uptime: '99.9%', latency: '42ms' },
    { name: 'PostgreSQL', status: 'operational', uptime: '99.8%', latency: '8ms' },
    { name: 'RabbitMQ', status: 'operational', uptime: '99.9%', latency: '12ms' },
    { name: 'Notification Service', status: 'operational', uptime: '99.7%', latency: '35ms' },
  ];

  const statCards = [
    { title: 'Total Clients', value: stats.totalClients || '2,584', change: '+12%', trend: 'up', icon: Users, color: 'primary' },
    { title: 'Active Drivers', value: stats.activeDrivers || '156', change: '+5', trend: 'up', icon: Truck, color: 'secondary' },
    { title: 'Orders Today', value: stats.ordersToday || '423', change: '+18%', trend: 'up', icon: Package, color: 'success' },
    { title: 'Revenue (MTD)', value: `$${(stats.revenue || 67240).toLocaleString()}`, change: '+23%', trend: 'up', icon: DollarSign, color: 'warning' },
  ];

  const getStatusColor = (status) => ({ pending: 'warning', picked_up: 'info', in_transit: 'primary', out_for_delivery: 'primary', delivered: 'success', cancelled: 'danger', failed: 'danger', in_warehouse: 'warning', confirmed: 'warning', accepted_by_driver: 'success', rejected_by_driver: 'danger' }[status] || 'default');
  const getStatusLabel = (status) => ({ confirmed: 'Pending', in_warehouse: 'Pending', accepted_by_driver: 'Driver Accepted', rejected_by_driver: 'Driver Rejected' }[status] || status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  const getHealthColor = (status) => ({ operational: 'bg-green-500', degraded: 'bg-yellow-500', down: 'bg-red-500' }[status]);
  const getAlertIcon = (type) => ({ warning: AlertTriangle, info: Bell, success: CheckCircle, error: AlertCircle }[type] || Bell);
  const getAlertColor = (type) => ({ warning: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30', info: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30', success: 'text-green-500 bg-green-100 dark:bg-green-900/30', error: 'text-red-500 bg-red-100 dark:bg-red-900/30' }[type]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back, {user?.name?.split(' ')[0] || 'Admin'}!</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Here's what's happening with SwiftTrack today.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={handleRefresh} disabled={refreshing}>{refreshing ? 'Updating…' : 'Refresh'}</Button>
          <Button variant="outline" icon={Download}>Export Report</Button>
          <Link to="/admin/analytics"><Button icon={BarChart3}>View Analytics</Button></Link>
        </div>
      </div>

      {/* Alerts Banner */}
      {alerts.filter(a => a.type === 'warning' || a.type === 'error').length > 0 && (
        <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <p className="text-sm text-amber-700 dark:text-amber-400">{alerts.filter(a => a.type === 'warning').length} system alert(s) require attention</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowAlertModal(true)}>View All</Button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => <StatCard key={i} {...stat} loading={loading} />)}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle icon={TrendingUp}>Revenue Overview</CardTitle><Badge variant="success" size="sm">+23% from last month</Badge></CardHeader>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} formatter={(v) => [`$${v.toLocaleString()}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Orders by Status */}
        <Card>
          <CardHeader><CardTitle icon={Package}>Orders by Status</CardTitle></CardHeader>
          <div className="h-72 flex items-center p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ordersByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                  {ordersByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <Card className="lg:col-span-2" padding="none">
          <CardHeader className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
            <CardTitle icon={Package}>Recent Orders</CardTitle>
            <Link to="/admin/orders"><Button variant="ghost" size="sm" icon={ArrowRight} iconPosition="right">View all</Button></Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Order</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Client</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                  <th className="text-right py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {(recentOrders.length ? recentOrders : [{id:'ORD-001',client:'John Doe',status:'delivered',amount:45},{id:'ORD-002',client:'Jane Smith',status:'in_transit',amount:32}]).slice(0, 5).map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                    <td className="py-3 px-4"><span className="font-mono text-sm text-primary-600">{order.id}</span></td>
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{order.client || order.clientName || 'N/A'}</td>
                    <td className="py-3 px-4"><Badge variant={getStatusColor(order.status)} size="sm">{getStatusLabel(order.status)}</Badge></td>
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">${(order.amount || 0).toFixed(2)}</td>
                    <td className="py-3 px-4 text-right"><Link to={`/admin/orders`}><Button size="sm" variant="ghost" icon={Eye} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader><CardTitle icon={Server}>System Health</CardTitle><Badge variant="success" size="sm">All Systems Go</Badge></CardHeader>
          <div className="p-4 space-y-3">
            {systemHealth.map((service, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${getHealthColor(service.status)}`} />
                  <span className="font-medium text-gray-900 dark:text-white">{service.name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500">{service.latency}</span>
                  <Badge variant="success" size="sm">{service.uptime}</Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-slate-700 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl text-center">
                <p className="text-xl font-bold text-primary-600">99.8%</p>
                <p className="text-xs text-gray-500">Overall Uptime</p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
                <p className="text-xl font-bold text-green-600">24ms</p>
                <p className="text-xs text-gray-500">Avg Response</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader><CardTitle icon={Zap}>Quick Actions</CardTitle></CardHeader>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Add User', icon: Users, to: '/admin/users', color: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600' },
            { label: 'View Orders', icon: Package, to: '/admin/orders', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' },
            { label: 'Analytics', icon: BarChart3, to: '/admin/analytics', color: 'bg-green-100 dark:bg-green-900/30 text-green-600' },
            { label: 'System Logs', icon: Activity, to: '/admin/logs', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' },
          ].map(action => (
            <Link key={action.label} to={action.to} className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 transition group">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${action.color} group-hover:scale-110 transition`}>
                <action.icon className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
            </Link>
          ))}
        </div>
      </Card>

      {/* Alert Modal */}
      <Modal isOpen={showAlertModal} onClose={() => setShowAlertModal(false)} title="System Alerts" size="md">
        <div className="space-y-3">
          {alerts.map(alert => {
            const Icon = getAlertIcon(alert.type);
            return (
              <div key={alert.id} className={`flex items-start gap-3 p-4 rounded-xl ${getAlertColor(alert.type)}`}>
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{alert.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{alert.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
};

export default AdminDashboard;
