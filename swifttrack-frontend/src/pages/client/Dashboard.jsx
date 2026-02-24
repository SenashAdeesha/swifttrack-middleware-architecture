import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, Truck, Check, Clock, TrendingUp, Plus, Eye, ArrowRight,
  Calendar, Activity, MapPin, RefreshCw, Filter
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, StatCard, TableSkeleton, EmptyState } from '../../components/common';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ordersAPI, clientAPI, wsService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [orders, setOrders] = useState([]);
  const [chartPeriod, setChartPeriod] = useState('week');
  const [refreshing, setRefreshing] = useState(false);
  // Track recently-changed order IDs for the flash animation
  const [flashIds, setFlashIds] = useState(new Set());
  const flashTimers = useRef({});
  // Middleware pipeline stage per order: { orderId: 'ready'|'loaded'|'dispatched' }
  const [middlewareStages, setMiddlewareStages] = useState({});

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [statsRes, ordersRes] = await Promise.all([
        clientAPI.getStats(user?.id),
        ordersAPI.getAll({ clientId: user?.id, limit: 10 })
      ]);
      setStats(statsRes.data);
      setOrders(ordersRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // Flash a badge for 3 seconds when status changes
  const triggerFlash = useCallback((id) => {
    const sid = String(id);
    setFlashIds(prev => new Set(prev).add(sid));
    clearTimeout(flashTimers.current[sid]);
    flashTimers.current[sid] = setTimeout(() => {
      setFlashIds(prev => { const n = new Set(prev); n.delete(sid); return n; });
    }, 3000);
  }, []);

  // WS: order status changed
  const handleStatusUpdate = useCallback((data) => {
    const id     = String(data.orderId || data.order_id);
    const status = data.status;
    if (!status || !id) return;
    // While middleware pipeline is running, keep badge as "Pending"
    // — pipeline dots (Ready/Loaded/Dispatched/Pending) show the progress
    if (['confirmed', 'in_warehouse'].includes(status)) return;

    setOrders(prev => {
      const found = prev.some(o => String(o.id) === id);
      if (!found) {
        // Order not yet in state (created after last fetch) — refresh
        setTimeout(() => fetchDashboardData(true), 200);
        return prev;
      }
      return prev.map(o => String(o.id) === id ? { ...o, status } : o);
    });

    triggerFlash(id);
    const labels = {
      confirmed:        'Confirmed',
      in_warehouse:     'In Warehouse',
      out_for_delivery: 'Out for Delivery',
      delivered:        'Delivered',
      failed:           'Delivery Failed',
      cancelled:        'Cancelled',
    };
    if (labels[status]) toast.success(`Order #${id}: ${labels[status]}`, { duration: 3000 });
    // Silently refresh to fetch driver name when dispatched out for delivery
    if (status === 'out_for_delivery') setTimeout(() => fetchDashboardData(true), 500);
    // Clear middleware pipeline once order moves past warehouse stages
    if (['out_for_delivery', 'delivered', 'failed', 'cancelled'].includes(status)) {
      setMiddlewareStages(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  }, [triggerFlash, fetchDashboardData]);

  // WS: delivery completed
  const handleDeliveryCompleted = useCallback((data) => {
    const id = String(data.orderId || data.order_id);
    setOrders(prev => prev.map(o => String(o.id) === id ? { ...o, status: 'delivered' } : o));
    triggerFlash(id);
    toast.success(`Order #${id} delivered!`, { duration: 4000 });
    setTimeout(() => fetchDashboardData(true), 1000);
  }, [triggerFlash, fetchDashboardData]);

  // WS: new order added
  const handleNewOrder = useCallback(() => {
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  // WS: middleware pipeline stage updated (ready → loaded → dispatched)
  const handleMiddlewareUpdate = useCallback((data) => {
    const id    = String(data.orderId || data.order_id);
    const stage = data.stage;
    if (!stage) return;
    setMiddlewareStages(prev => ({ ...prev, [id]: stage }));
    triggerFlash(id);
  }, [triggerFlash]);

  // WS: driver assigned — toast + refresh to get driver name
  const handleDriverAssigned = useCallback((data) => {
    const id = String(data.orderId || data.order_id);
    toast.success(`Driver assigned to Order #${id}`, { duration: 3000 });
    setTimeout(() => fetchDashboardData(true), 500);
  }, [fetchDashboardData]);

  // Connect WebSocket and register listeners
  useEffect(() => {
    wsService.connect();
    const u1 = wsService.on('order_status_update', handleStatusUpdate);
    const u2 = wsService.on('delivery_completed',  handleDeliveryCompleted);
    const u3 = wsService.on('new_order',           handleNewOrder);
    const u4 = wsService.on('middleware_update',   handleMiddlewareUpdate);
    const u5 = wsService.on('driver_assigned',     handleDriverAssigned);
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [handleStatusUpdate, handleDeliveryCompleted, handleNewOrder, handleMiddlewareUpdate, handleDriverAssigned]);

  const statCards = [
    { title: 'Total Orders', value: stats.totalOrders || 0, icon: Package, trend: '+12%', trendUp: true, color: 'primary' },
    { title: 'Active Deliveries', value: stats.activeDeliveries || 0, icon: Truck, description: 'In transit', color: 'warning' },
    { title: 'Delivered', value: stats.delivered || 0, icon: Check, trend: '+8%', trendUp: true, color: 'success' },
    { title: 'Pending', value: stats.pending || 0, icon: Clock, description: 'Awaiting pickup', color: 'info' },
  ];

  const weeklyData = [
    { day: 'Mon', orders: 4 }, { day: 'Tue', orders: 6 }, { day: 'Wed', orders: 3 },
    { day: 'Thu', orders: 8 }, { day: 'Fri', orders: 5 }, { day: 'Sat', orders: 9 }, { day: 'Sun', orders: 2 }
  ];

  const monthlyData = [
    { month: 'Jan', orders: 24 }, { month: 'Feb', orders: 32 }, { month: 'Mar', orders: 28 },
    { month: 'Apr', orders: 45 }, { month: 'May', orders: 38 }, { month: 'Jun', orders: 52 }
  ];

  const statusDistribution = [
    { name: 'Delivered', value: stats.delivered || 12, color: '#22c55e' },
    { name: 'In Transit', value: stats.activeDeliveries || 5, color: '#3b82f6' },
    { name: 'Pending', value: stats.pending || 3, color: '#f59e0b' },
  ];

  const activeDeliveries = orders.filter(o => ['out_for_delivery', 'in_warehouse'].includes(o.status)).slice(0, 3);

  const handleRefresh = () => { fetchDashboardData(true); toast.success('Dashboard refreshed'); };

  const getStatusColor = (status) => {
    const colors = { pending: 'warning', confirmed: 'warning', in_warehouse: 'warning', out_for_delivery: 'primary', delivered: 'success', failed: 'danger', cancelled: 'secondary' };
    return colors[status] || 'gray';
  };

  const getStatusLabel = (status) => {
    const labels = { confirmed: 'Pending', in_warehouse: 'Pending' };
    if (labels[status]) return labels[status];
    return status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back, {user?.name?.split(' ')[0] || 'there'}!</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Here's your delivery overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={handleRefresh} disabled={refreshing}>{refreshing ? 'Updating…' : 'Refresh'}</Button>
          <Link to="/client/new-order"><Button icon={Plus}>New Order</Button></Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <StatCard key={i} title={stat.title} value={stat.value} icon={stat.icon} trend={stat.trend}
            trendUp={stat.trendUp} description={stat.description} variant={stat.color} loading={loading} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Activity Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle icon={Activity}>Order Activity</CardTitle>
              <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                {['week', 'month'].map(period => (
                  <button key={period} onClick={() => setChartPeriod(period)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${chartPeriod === period ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {period === 'week' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPeriod === 'week' ? weeklyData : monthlyData}>
                <defs>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey={chartPeriod === 'week' ? 'day' : 'month'} axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Area type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={2} fill="url(#colorOrders)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader><CardTitle icon={TrendingUp}>Status Overview</CardTitle></CardHeader>
          <div className="p-4 h-64 flex flex-col">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                  {statusDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {statusDistribution.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Active Deliveries & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Deliveries */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle icon={Truck}>Active Deliveries</CardTitle>
              <Link to="/client/orders?status=active" className="text-sm text-primary-600 hover:underline">View all</Link>
            </div>
          </CardHeader>
          <div className="p-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-slate-700 animate-pulse rounded-xl" />)}
              </div>
            ) : activeDeliveries.length === 0 ? (
              <div className="text-center py-8">
                <Truck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No active deliveries</p>
                <Link to="/client/new-order"><Button size="sm" className="mt-3">Create Order</Button></Link>
              </div>
            ) : (
              <div className="space-y-3">
                {activeDeliveries.map(order => (
                  <Link key={order.id} to={`/client/tracking/${order.id}`}
                    className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition group">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${order.status === 'out_for_delivery' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'}`}>
                      {order.status === 'out_for_delivery' ? <Truck className="w-6 h-6" /> : <Package className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white">#{order.id}</p>
                      <p className="text-sm text-gray-500 truncate">{order.deliveryAddress}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={getStatusColor(order.status)} size="sm">{getStatusLabel(order.status)}</Badge>
                      <p className="text-xs text-gray-400 mt-1">{order.driverName || 'Awaiting driver'}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Recent Orders */}
        <Card padding="none">
          <CardHeader className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between w-full">
              <CardTitle icon={Package}>Recent Orders</CardTitle>
              <Link to="/client/orders" className="text-sm text-primary-600 hover:underline">View all</Link>
            </div>
          </CardHeader>
          {loading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={4} /></div>
          ) : orders.length === 0 ? (
            <EmptyState icon={Package} title="No orders yet" description="Start by creating your first order" actionLabel="Create Order" onAction={() => window.location.href = '/client/new-order'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Order</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-right py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {orders.slice(0, 5).map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition">
                      <td className="py-3 px-4">
                        <p className="font-medium text-primary-600">{order.id}</p>
                        <p className="text-xs text-gray-400 truncate max-w-37.5">{order.deliveryAddress}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block transition-all duration-300 ${
                          flashIds.has(String(order.id))
                            ? 'scale-110 ring-2 ring-offset-1 ring-primary-400 rounded-full'
                            : ''
                        }`}>
                          <Badge variant={getStatusColor(order.status)} size="sm">{getStatusLabel(order.status)}</Badge>
                        </span>
                        {flashIds.has(String(order.id)) && (
                          <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-green-400 animate-ping"/>
                        )}
                        {/* Middleware pipeline: ready → loaded → dispatched */}
                        {middlewareStages[String(order.id)] && (() => {
                          const STAGES = [
                            { key: 'ready',      label: 'Ready'      },
                            { key: 'loaded',     label: 'Loaded'     },
                            { key: 'dispatched', label: 'Dispatched' },
                            { key: 'pending',    label: 'Pending'    },
                          ];
                          const currentIdx = STAGES.findIndex(s => s.key === middlewareStages[String(order.id)]);
                          return (
                            <div className="flex items-center gap-0.5 mt-1.5">
                              {STAGES.map((s, i) => (
                                <div key={s.key} className="flex items-center gap-0.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${
                                    i <= currentIdx ? 'bg-primary-500' : 'bg-gray-300 dark:bg-slate-600'
                                  }`} />
                                  <span className={`text-[9px] font-medium ${
                                    i <= currentIdx ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'
                                  }`}>{s.label}</span>
                                  {i < STAGES.length - 1 && (
                                    <div className={`w-3 h-px ml-0.5 ${
                                      i < currentIdx ? 'bg-primary-400' : 'bg-gray-200 dark:bg-slate-700'
                                    }`} />
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right">
                        <Link to={`/client/tracking/${order.id}`} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg inline-flex"><Eye className="w-4 h-4" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'New Order', icon: Plus, to: '/client/new-order', color: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600' },
            { label: 'Track Order', icon: MapPin, to: '/client/orders', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' },
            { label: 'Order History', icon: Calendar, to: '/client/orders', color: 'bg-green-100 dark:bg-green-900/30 text-green-600' },
            { label: 'My Profile', icon: Activity, to: '/client/profile', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' },
          ].map(action => (
            <Link key={action.label} to={action.to}
              className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 transition group">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${action.color} group-hover:scale-110 transition`}>
                <action.icon className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
