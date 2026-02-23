import { useState, useEffect, useCallback } from 'react';
import {
  Package, Search, Filter, Download, Eye, MoreVertical, Calendar, MapPin, User, Truck,
  Clock, DollarSign, RefreshCw, Copy, Edit2, X, UserCheck, ChevronDown, ArrowUpDown, Wifi, WifiOff
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Input, Select, Modal, EmptyState, TableSkeleton } from '../../components/common';
import { ordersAPI, driverAPI, wsService } from '../../services/api';
import toast from 'react-hot-toast';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [editForm, setEditForm] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Handle real-time order updates
  const handleOrderStatusUpdate = useCallback((data) => {
    setOrders(prev => prev.map(o =>
      String(o.id) === String(data.orderId) ? { ...o, status: data.status } : o
    ));
    // Keep detail modal in sync if open for this order
    setSelectedOrder(prev =>
      prev && String(prev.id) === String(data.orderId) ? { ...prev, status: data.status } : prev
    );
    const s = data.status;
    if (s === 'delivered') toast.success(`✅ Order ${data.orderId} delivered!`);
    else if (s === 'failed') toast.error(`❌ Order ${data.orderId} delivery failed`);
    else if (s === 'cancelled') toast(`Order ${data.orderId} cancelled`, { icon: '🚫' });
    else if (s === 'out_for_delivery') toast(`Order ${data.orderId} out for delivery`, { icon: '🚚' });
    else toast.success(`Order ${data.orderId}: ${s.replace(/_/g, ' ')}`);
  }, []);

  // Handle new order notifications
  const handleNewOrder = useCallback((data) => {
    toast.success(`🆕 New order received: ${data.orderId}`);
    fetchData();
  }, []);

  // Handle delivery completed
  const handleDeliveryCompleted = useCallback((data) => {
    setOrders(prev => prev.map(o =>
      String(o.id) === String(data.orderId) ? { ...o, status: 'delivered' } : o
    ));
    setSelectedOrder(prev =>
      prev && String(prev.id) === String(data.orderId) ? { ...prev, status: 'delivered' } : prev
    );
    toast.success(`✅ Order ${data.orderId} has been delivered!`);
  }, []);

  // Set up WebSocket connection
  useEffect(() => {
    wsService.connect();
    setWsConnected(wsService.socket?.connected || false);

    // Track live connection state changes
    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    wsService.socket?.on('connect', onConnect);
    wsService.socket?.on('disconnect', onDisconnect);

    const unsubStatus = wsService.on('order_status_update', handleOrderStatusUpdate);
    const unsubNew = wsService.on('new_order', handleNewOrder);
    const unsubDelivered = wsService.on('delivery_completed', handleDeliveryCompleted);

    return () => {
      wsService.socket?.off('connect', onConnect);
      wsService.socket?.off('disconnect', onDisconnect);
      unsubStatus();
      unsubNew();
      unsubDelivered();
    };
  }, [handleOrderStatusUpdate, handleNewOrder, handleDeliveryCompleted]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, driversRes] = await Promise.all([
        ordersAPI.getAll(),
        driverAPI.getAll()
      ]);
      setOrders(ordersRes.data || []);
      setDrivers(driversRes.data || []);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignDriver = async () => {
    if (!selectedDriver) { toast.error('Please select a driver'); return; }
    setAssigning(true);
    try {
      await ordersAPI.assignDriver(assigningOrder.id, selectedDriver);
      const assignedDriver = drivers.find(d => d.id === selectedDriver);
      setOrders(prev => prev.map(o => 
        o.id === assigningOrder.id ? { ...o, driverId: selectedDriver, driverName: assignedDriver?.name, status: 'out_for_delivery' } : o
      ));
      toast.success('Driver assigned successfully');
      setShowAssignModal(false);
      setAssigningOrder(null);
      setSelectedDriver('');
    } catch (error) {
      toast.error('Failed to assign driver');
    } finally {
      setAssigning(false);
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await ordersAPI.updateStatus(orderId, newStatus);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      toast.success('Status updated');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleUpdateOrder = async () => {
    try {
      await ordersAPI.update(editForm.id, editForm);
      toast.success('Order updated successfully');
      setShowEditModal(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to update order');
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      await ordersAPI.cancel(orderId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
      toast.success('Order cancelled');
    } catch (error) {
      toast.error('Failed to cancel order');
    }
  };

  const handleExport = () => {
    const rows = [['Order ID', 'Client', 'Driver', 'Status', 'Amount', 'Date']];
    filteredOrders.forEach(o => {
      rows.push([o.id, o.clientName || o.client, o.driverName || '-', o.status, `$${o.amount}`, o.createdAt || o.date]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'orders_export.csv'; a.click();
    toast.success('Orders exported!');
  };

  const copyOrderId = (id) => { navigator.clipboard.writeText(id); toast.success('Order ID copied!'); };

  const getStatusColor = (status) => ({ pending: 'warning', picked_up: 'info', in_transit: 'primary', out_for_delivery: 'primary', in_warehouse: 'info', delivered: 'success', cancelled: 'danger', failed: 'danger' }[status] || 'default');

  const statusOptions = [
    { value: 'all', label: 'All Status' }, { value: 'pending', label: 'Pending' }, { value: 'in_warehouse', label: 'In Warehouse' },
    { value: 'out_for_delivery', label: 'Out for Delivery' }, { value: 'delivered', label: 'Delivered' },
    { value: 'failed', label: 'Failed' }, { value: 'cancelled', label: 'Cancelled' },
  ];

  const dateOptions = [
    { value: 'all', label: 'All Time' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' },
  ];

  const sortOptions = [
    { value: 'newest', label: 'Newest First' }, { value: 'oldest', label: 'Oldest First' }, { value: 'amount_high', label: 'Amount High→Low' }, { value: 'amount_low', label: 'Amount Low→High' },
  ];

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id?.toLowerCase().includes(search.toLowerCase()) || (order.clientName || order.client || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    let matchesDate = true;
    if (dateFilter !== 'all' && order.createdAt) {
      const created = new Date(order.createdAt);
      const now = new Date();
      if (dateFilter === 'today') matchesDate = created.toDateString() === now.toDateString();
      else if (dateFilter === 'week') matchesDate = (now - created) < 7 * 24 * 60 * 60 * 1000;
      else if (dateFilter === 'month') matchesDate = created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }
    return matchesSearch && matchesStatus && matchesDate;
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (sortBy === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (sortBy === 'amount_high') return (b.amount || 0) - (a.amount || 0);
    if (sortBy === 'amount_low') return (a.amount || 0) - (b.amount || 0);
    return 0;
  });

  const orderStats = [
    { label: 'All', value: orders.length, color: 'bg-gray-100 dark:bg-slate-700' },
    { label: 'Pending', value: orders.filter(o => o.status === 'pending').length, color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700' },
    { label: 'In Transit', value: orders.filter(o => ['in_transit', 'out_for_delivery', 'in_warehouse'].includes(o.status)).length, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700' },
    { label: 'Delivered', value: orders.filter(o => o.status === 'delivered').length, color: 'bg-green-100 dark:bg-green-900/30 text-green-700' },
    { label: 'Cancelled', value: orders.filter(o => o.status === 'cancelled' || o.status === 'failed').length, color: 'bg-red-100 dark:bg-red-900/30 text-red-700' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Order Management</h1>
            {wsConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full"><Wifi className="w-3 h-3" />Live</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-full"><WifiOff className="w-3 h-3" />Offline</span>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{orders.length} total orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchData}>Refresh</Button>
          <Button variant="outline" icon={Download} onClick={handleExport}>Export</Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {orderStats.map((stat, i) => (
          <div key={i} onClick={() => setStatusFilter(stat.label === 'All' ? 'all' : stat.label.toLowerCase().replace(' ', '_'))}
            className={`p-4 rounded-xl text-center cursor-pointer transition hover:shadow-md ${stat.color} ${statusFilter === (stat.label === 'All' ? 'all' : stat.label.toLowerCase().replace(' ', '_')) ? 'ring-2 ring-primary-500' : ''}`}>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <Card padding="default">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="Search by order ID or client…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-3">
            {[{ val: statusFilter, set: setStatusFilter, opts: statusOptions }, { val: dateFilter, set: setDateFilter, opts: dateOptions }, { val: sortBy, set: setSortBy, opts: sortOptions }]
              .map((f, i) => (
                <div key={i} className="relative">
                  <select value={f.val} onChange={(e) => f.set(e.target.value)} className="appearance-none w-full md:w-40 px-4 py-3 pr-10 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                    {f.opts.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              ))}
          </div>
        </div>
      </Card>

      {/* Orders Table */}
      <Card padding="none">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={8} cols={7} /></div>
        ) : filteredOrders.length === 0 ? (
          <EmptyState icon={Package} title="No orders found" description="Try adjusting your filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Order ID</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Client</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Driver</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Destination</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                  <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-primary-600">{order.id}</span>
                        <button onClick={() => copyOrderId(order.id)} className="text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 font-semibold text-sm">{(order.clientName || order.client || 'N').charAt(0)}</div>
                        <span className="font-medium text-gray-900 dark:text-white">{order.clientName || order.client || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {order.driverName ? (
                        <span className="text-gray-700 dark:text-gray-300">{order.driverName}</span>
                      ) : (
                        <button onClick={() => { setAssigningOrder(order); setShowAssignModal(true); }} className="text-primary-600 hover:underline text-sm flex items-center gap-1"><UserCheck className="w-4 h-4" />Assign</button>
                      )}
                    </td>
                    <td className="py-4 px-6 text-gray-600 dark:text-gray-400 max-w-xs truncate">{order.deliveryAddress || order.destination || 'N/A'}</td>
                    <td className="py-4 px-6"><Badge variant={getStatusColor(order.status)}>{order.status?.replace(/_/g, ' ')}</Badge></td>
                    <td className="py-4 px-6 font-semibold text-gray-900 dark:text-white">${(order.amount || 0).toFixed(2)}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setSelectedOrder(order); setShowOrderModal(true); }} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg" title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => { setEditForm(order); setShowEditModal(true); }} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Edit"><Edit2 className="w-4 h-4" /></button>
                        {['pending', 'in_warehouse'].includes(order.status) && (
                          <button onClick={() => handleCancelOrder(order.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-slate-700">
          <p className="text-sm text-gray-500">{filteredOrders.length} of {orders.length} orders</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>Previous</Button>
            <Button variant="outline" size="sm">Next</Button>
          </div>
        </div>
      </Card>

      {/* Order Details Modal */}
      <Modal isOpen={showOrderModal} onClose={() => setShowOrderModal(false)} title="Order Details" size="lg">
        {selectedOrder && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-lg font-bold text-primary-600">{selectedOrder.id}</span>
                <p className="text-sm text-gray-500 mt-1">Created: {new Date(selectedOrder.createdAt || Date.now()).toLocaleDateString()}</p>
              </div>
              <Badge variant={getStatusColor(selectedOrder.status)} size="lg">{selectedOrder.status?.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[{ icon: User, label: 'Client', value: selectedOrder.clientName || selectedOrder.client }, { icon: Truck, label: 'Driver', value: selectedOrder.driverName || 'Unassigned' },
                { icon: MapPin, label: 'Pickup', value: selectedOrder.pickupAddress || 'Warehouse' }, { icon: MapPin, label: 'Delivery', value: selectedOrder.deliveryAddress || selectedOrder.destination }]
                .map((item, i) => (
                  <div key={i} className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-2"><item.icon className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">{item.label}</span></div>
                    <p className="font-medium text-gray-900 dark:text-white">{item.value || 'N/A'}</p>
                  </div>
                ))}
            </div>
            <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Package Details</h4>
              <div className="grid grid-cols-3 gap-4">
                <div><p className="text-sm text-gray-500">Type</p><p className="font-semibold text-gray-900 dark:text-white">{selectedOrder.packageType || 'Standard'}</p></div>
                <div><p className="text-sm text-gray-500">Weight</p><p className="font-semibold text-gray-900 dark:text-white">{selectedOrder.packageWeight || '2.5'} kg</p></div>
                <div><p className="text-sm text-gray-500">Amount</p><p className="font-semibold text-primary-600 text-lg">${(selectedOrder.amount || 0).toFixed(2)}</p></div>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
              {!selectedOrder.driverName && <Button fullWidth variant="outline" icon={UserCheck} onClick={() => { setAssigningOrder(selectedOrder); setShowAssignModal(true); setShowOrderModal(false); }}>Assign Driver</Button>}
              {['pending', 'in_warehouse'].includes(selectedOrder.status) && <Button fullWidth variant="danger" onClick={() => { handleCancelOrder(selectedOrder.id); setShowOrderModal(false); }}>Cancel Order</Button>}
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Driver Modal */}
      <Modal isOpen={showAssignModal} onClose={() => { setShowAssignModal(false); setAssigningOrder(null); }} title="Assign Driver" size="md">
        <div className="space-y-4">
          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
            <p className="text-sm text-gray-600 dark:text-gray-400">Assign a driver to order</p>
            <p className="font-mono font-semibold text-primary-600 mt-1">{assigningOrder?.id}</p>
            <p className="text-sm text-gray-500 mt-1">{assigningOrder?.deliveryAddress || assigningOrder?.destination}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Driver</label>
            <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Choose a driver…</option>
              {drivers.filter(d => d.status === 'active' || d.status === 'available').map(driver => (
                <option key={driver.id} value={driver.id}>{driver.name} — {driver.vehicleType || driver.vehicle_type || 'Vehicle'}</option>
              ))}
            </select>
            {drivers.filter(d => d.status === 'active' || d.status === 'available').length === 0 && (
              <p className="text-sm text-amber-600 mt-2">No available drivers at the moment</p>
            )}
          </div>
          {selectedDriver && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-700 dark:text-green-300">
                ✓ Driver will be notified immediately and order status will change to "Out for Delivery"
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button fullWidth variant="outline" onClick={() => setShowAssignModal(false)} disabled={assigning}>Cancel</Button>
            <Button fullWidth onClick={handleAssignDriver} disabled={assigning || !selectedDriver}>
              {assigning ? 'Assigning...' : 'Assign Driver'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Order Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Order" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
            <select value={editForm.status || ''} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              {statusOptions.filter(o => o.value !== 'all').map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Delivery Address</label>
            <input type="text" value={editForm.deliveryAddress || ''} onChange={(e) => setEditForm({ ...editForm, deliveryAddress: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount ($)</label>
            <input type="number" value={editForm.amount || ''} onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button fullWidth onClick={handleUpdateOrder}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminOrders;
