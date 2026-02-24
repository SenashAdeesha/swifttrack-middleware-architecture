import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Filter, Eye, X, Package, Calendar, ChevronDown, Download,
  RefreshCw, Copy, ArrowUpDown, MapPin, Clock, Truck,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal, EmptyState, TableSkeleton } from '../../components/common';
import { ordersAPI, wsService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  // Middleware pipeline sub-stages per order: { orderId: 'ready'|'loaded'|'dispatched' }
  const [middlewareStages, setMiddlewareStages] = useState({});
  const [flashIds, setFlashIds] = useState(new Set());

  useEffect(() => { fetchOrders(); }, [user?.id]);

  // Real-time order status updates via WebSocket
  useEffect(() => {
    if (!user?.id) return;

    wsService.connect();
    const token = localStorage.getItem('swifttrack_token');
    if (token) wsService.authenticate(token);

    const triggerFlash = (id) => {
      const sid = String(id);
      setFlashIds(prev => new Set(prev).add(sid));
      setTimeout(() => setFlashIds(prev => { const n = new Set(prev); n.delete(sid); return n; }), 3000);
    };

    const unsubStatus = wsService.on('order_status_update', (data) => {
      const orderId = String(data.orderId || data.order_id);
      const newStatus = data.status;
      if (!orderId || !newStatus) return;
      // While middleware pipeline is running, keep badge as "Pending"
      // — pipeline dots (Ready/Loaded/Dispatched/Pending) show the progress
      if (['confirmed', 'in_warehouse'].includes(newStatus)) return;
      setOrders(prev => prev.map(o =>
        String(o.id) === orderId ? { ...o, status: newStatus } : o
      ));
      setSelectedOrder(prev =>
        prev && String(prev.id) === orderId ? { ...prev, status: newStatus } : prev
      );
      triggerFlash(orderId);
      if (newStatus === 'delivered') toast.success(`Order ${orderId} delivered!`);
      else if (newStatus === 'failed') toast.error(`Order ${orderId} delivery failed`);
      else if (newStatus === 'out_for_delivery') toast(`Order ${orderId} is out for delivery`);
      // Clear pipeline once order moves past warehouse
      if (['out_for_delivery', 'delivered', 'failed', 'cancelled'].includes(newStatus)) {
        setMiddlewareStages(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      }
    });

    const unsubDelivered = wsService.on('delivery_completed', (data) => {
      const orderId = String(data.orderId || data.order_id);
      if (!orderId) return;
      setOrders(prev => prev.map(o =>
        String(o.id) === orderId ? { ...o, status: 'delivered' } : o
      ));
      setSelectedOrder(prev =>
        prev && String(prev.id) === orderId ? { ...prev, status: 'delivered' } : prev
      );
      toast.success(`Your order ${orderId} has been delivered!`);
    });

    const unsubMiddleware = wsService.on('middleware_update', (data) => {
      const orderId = String(data.orderId || data.order_id);
      const stage = data.stage;
      if (!orderId || !stage) return;
      setMiddlewareStages(prev => ({ ...prev, [orderId]: stage }));
      triggerFlash(orderId);
    });

    const unsubDriverAssigned = wsService.on('driver_assigned', (data) => {
      const orderId = String(data.order_id || data.orderId);
      const driverName = data.data?.driver_name || data.driver_name;
      const driverPhone = data.data?.driver_phone || data.driver_phone;
      const vehicleType = data.data?.vehicle_type || data.vehicle_type;
      const vehiclePlate = data.data?.vehicle_plate || data.vehicle_plate;
      if (!orderId) return;
      setOrders(prev => prev.map(o =>
        String(o.id) === orderId
          ? { ...o, driverName, driverPhone, vehicleType, vehiclePlate, driver_id: data.driver_id }
          : o
      ));
      setSelectedOrder(prev =>
        prev && String(prev.id) === orderId
          ? { ...prev, driverName, driverPhone, vehicleType, vehiclePlate, driver_id: data.driver_id }
          : prev
      );
      triggerFlash(orderId);
      if (driverName) toast.success(`Driver ${driverName} assigned to order ${orderId}`);
    });

    const unsubNewOrder = wsService.on('new_order', () => {
      fetchOrders();
    });

    return () => {
      unsubStatus();
      unsubDelivered();
      unsubMiddleware();
      unsubDriverAssigned();
      unsubNewOrder();
    };
  }, [user?.id, user?.role]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await ordersAPI.getAll({ clientId: user?.id });
      setOrders(response.data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    try {
      await ordersAPI.cancel(cancellingId, { reason: cancelReason });
      setOrders(orders.map(o => o.id === cancellingId ? { ...o, status: 'cancelled' } : o));
      toast.success('Order cancelled successfully');
      setShowCancelModal(false);
      setCancellingId(null);
      setCancelReason('');
    } catch (error) {
      toast.error('Failed to cancel order');
    }
  };

  const handleReorder = async (order) => {
    // Navigate to new order with prefilled data
    toast.success('Reorder form pre-filled');
    window.location.href = `/client/new-order?reorder=${order.id}`;
  };

  const handleExport = () => {
    const rows = [['Order ID', 'Status', 'Destination', 'Created', 'Driver']];
    filteredOrders.forEach(o => {
      rows.push([o.id, o.status, o.deliveryAddress, new Date(o.createdAt).toLocaleDateString(), o.driverName || '-']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'my_orders.csv'; a.click();
    toast.success('Orders exported!');
  };

  const copyOrderId = (id) => {
    navigator.clipboard.writeText(id);
    toast.success('Order ID copied!');
  };

  const getStatusColor = (status) => {
    const colors = { pending: 'warning', confirmed: 'warning', in_warehouse: 'warning', out_for_delivery: 'primary', delivered: 'success', failed: 'danger', cancelled: 'gray' };
    return colors[status] || 'gray';
  };

  const getStatusLabel = (status) => {
    const labels = { confirmed: 'Pending', in_warehouse: 'Pending' };
    if (labels[status]) return labels[status];
    return status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || status;
  };

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_warehouse', label: 'In Warehouse' },
    { value: 'out_for_delivery', label: 'Out for Delivery' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const dateOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
  ];

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'status', label: 'By Status' },
  ];

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) || order.deliveryAddress.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const created = new Date(order.createdAt);
      const now = new Date();
      if (dateFilter === 'today') matchesDate = created.toDateString() === now.toDateString();
      else if (dateFilter === 'week') matchesDate = (now - created) < 7 * 24 * 60 * 60 * 1000;
      else if (dateFilter === 'month') matchesDate = created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }
    return matchesSearch && matchesStatus && matchesDate;
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    return 0;
  });

  const cancelReasons = ['Changed my mind', 'Found better option', 'Order placed by mistake', 'Taking too long', 'Other'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Orders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{orders.length} total orders · {orders.filter(o => o.status === 'delivered').length} delivered</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={Download} onClick={handleExport}>Export</Button>
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchOrders}>Refresh</Button>
          <Link to="/client/new-order"><Button icon={Package}>New Order</Button></Link>
        </div>
      </div>

      {/* Filters */}
      <Card padding="default">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="Search by order ID or address…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none w-full md:w-40 px-4 py-3 pr-10 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                className="appearance-none w-full md:w-36 px-4 py-3 pr-10 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                {dateOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none w-full md:w-36 px-4 py-3 pr-10 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                {sortOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <ArrowUpDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'All', value: orders.length, color: 'bg-gray-100 dark:bg-slate-700' },
          { label: 'Active', value: orders.filter(o => ['pending', 'in_warehouse', 'out_for_delivery'].includes(o.status)).length, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700' },
          { label: 'Delivered', value: orders.filter(o => o.status === 'delivered').length, color: 'bg-green-100 dark:bg-green-900/30 text-green-700' },
          { label: 'Failed', value: orders.filter(o => o.status === 'failed').length, color: 'bg-red-100 dark:bg-red-900/30 text-red-700' },
          { label: 'Cancelled', value: orders.filter(o => o.status === 'cancelled').length, color: 'bg-gray-100 dark:bg-slate-700 text-gray-500' },
        ].map(stat => (
          <div key={stat.label} className={`p-4 rounded-xl ${stat.color} text-center`}>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Orders Table */}
      <Card padding="none">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} cols={6} /></div>
        ) : filteredOrders.length === 0 ? (
          <EmptyState icon={Package} title="No orders found"
            description={searchQuery || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first order to get started'}
            actionLabel="Create Order" onAction={() => window.location.href = '/client/new-order'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Order ID</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Destination</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Driver</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Created</th>
                  <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">{order.id}</span>
                        <button onClick={() => copyOrderId(order.id)} className="text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="max-w-xs">
                        <p className="text-gray-700 dark:text-gray-300 truncate">{order.deliveryAddress}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{order.packageType} · {order.packageWeight} kg</p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-block transition-all duration-300 ${
                        flashIds.has(String(order.id)) ? 'scale-110 ring-2 ring-offset-1 ring-primary-400 rounded-full' : ''
                      }`}>
                        <Badge variant={getStatusColor(order.status)} dot>{getStatusLabel(order.status)}</Badge>
                      </span>
                      {flashIds.has(String(order.id)) && (
                        <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-green-400 animate-ping" />
                      )}
                      {/* Middleware pipeline: Ready → Loaded → Dispatched */}
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
                    <td className="py-4 px-6">
                      {order.driverName ? (
                        <div>
                          <p className="text-gray-700 dark:text-gray-300 font-medium">{order.driverName}</p>
                          {order.vehicleType && (
                            <p className="text-xs text-gray-400 mt-0.5">{order.vehicleType}{order.vehiclePlate ? ` · ${order.vehiclePlate}` : ''}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6"><span className="text-gray-500 dark:text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</span></td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg" title="View Details"><Eye className="w-4 h-4" /></button>
                        <Link to={`/client/tracking/${order.id}`} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg" title="Track"><Truck className="w-4 h-4" /></Link>
                        {order.status === 'delivered' && (
                          <button onClick={() => handleReorder(order)} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" title="Reorder"><RefreshCw className="w-4 h-4" /></button>
                        )}
                        {['pending', 'in_warehouse'].includes(order.status) && (
                          <button onClick={() => { setCancellingId(order.id); setShowCancelModal(true); }} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Order Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`Order ${selectedOrder?.id}`} size="lg">
        {selectedOrder && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-xl">
              <div className="flex items-center gap-3">
                <Package className="w-8 h-8 text-primary-500" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{selectedOrder.packageType}</p>
                  <p className="text-sm text-gray-500">{selectedOrder.packageWeight} kg</p>
                </div>
              </div>
              <Badge variant={getStatusColor(selectedOrder.status)} size="lg">{getStatusLabel(selectedOrder.status)}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase mb-1">Pickup</p>
                <p className="text-sm text-gray-900 dark:text-white">{selectedOrder.pickupAddress || 'N/A'}</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <p className="text-xs text-green-600 dark:text-green-400 font-semibold uppercase mb-1">Delivery</p>
                <p className="text-sm text-gray-900 dark:text-white">{selectedOrder.deliveryAddress}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                <p className="text-xs text-gray-400">Created</p>
                <p className="font-medium text-gray-900 dark:text-white text-sm">{new Date(selectedOrder.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
                <p className="text-xs text-gray-400">Est. Delivery</p>
                <p className="font-medium text-gray-900 dark:text-white text-sm">{new Date(selectedOrder.estimatedDelivery).toLocaleDateString()}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl col-span-3">
                <p className="text-xs text-gray-400 mb-1">Driver</p>
                {selectedOrder.driverName ? (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                      <Truck className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{selectedOrder.driverName}</p>
                      {(selectedOrder.vehicleType || selectedOrder.driverPhone) && (
                        <p className="text-xs text-gray-500">
                          {[selectedOrder.vehicleType, selectedOrder.vehiclePlate, selectedOrder.driverPhone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="font-medium text-gray-500 dark:text-gray-400 text-sm">Unassigned</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
              <Button fullWidth variant="outline" onClick={() => setShowDetailModal(false)}>Close</Button>
              <Link to={`/client/tracking/${selectedOrder.id}`} className="flex-1"><Button fullWidth icon={Truck}>Track Order</Button></Link>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel Modal */}
      <Modal isOpen={showCancelModal} onClose={() => { setShowCancelModal(false); setCancellingId(null); setCancelReason(''); }} title="Cancel Order" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to cancel order <span className="font-semibold text-gray-900 dark:text-white">{cancellingId}</span>?</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reason for cancellation</label>
            <div className="space-y-2">
              {cancelReasons.map(r => (
                <label key={r} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${cancelReason === r ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                  <input type="radio" name="cancelReason" value={r} checked={cancelReason === r} onChange={() => setCancelReason(r)} className="w-4 h-4 accent-red-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{r}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowCancelModal(false)}>Keep Order</Button>
            <Button fullWidth onClick={handleCancelOrder} className="bg-red-500 hover:bg-red-600 text-white">Cancel Order</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Orders;
