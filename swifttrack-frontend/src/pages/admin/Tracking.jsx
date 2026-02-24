import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MapPin, Package, Clock, Check, Truck, Phone, MessageCircle, RefreshCw, Share2,
  Copy, Navigation, User, AlertTriangle, Wifi, WifiOff,
  Search, ChevronRight, Loader2, ListOrdered, X, UserCheck,
  ShieldCheck, Edit2, Star, ChevronDown,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal } from '../../components/common';
import { ordersAPI, driverAPI, wsService } from '../../services/api';
import toast from 'react-hot-toast';

// -- Status helpers -----------------------------------------------------------
const STATUS_CFG = {
  pending:          { label: 'Pending',          variant: 'warning',   dot: 'bg-yellow-400',  banner: 'from-yellow-400 to-orange-500' },
  confirmed:        { label: 'Confirmed',        variant: 'primary',   dot: 'bg-blue-400',    banner: 'from-blue-500 to-indigo-600'   },
  in_warehouse:     { label: 'In Warehouse',     variant: 'primary',   dot: 'bg-indigo-400',  banner: 'from-indigo-500 to-purple-600' },
  out_for_delivery: { label: 'Out for Delivery', variant: 'primary',   dot: 'bg-primary-400', banner: 'from-blue-500 to-indigo-600'   },
  delivered:        { label: 'Delivered',        variant: 'success',   dot: 'bg-green-500',   banner: 'from-green-500 to-emerald-600' },
  failed:           { label: 'Failed',           variant: 'danger',    dot: 'bg-red-500',     banner: 'from-red-500 to-rose-600'      },
  cancelled:        { label: 'Cancelled',        variant: 'secondary', dot: 'bg-gray-400',    banner: 'from-gray-500 to-slate-600'    },
};
const getSC = (s) =>
  STATUS_CFG[s] ?? { label: s?.replace(/_/g, ' ') ?? '—', variant: 'secondary', dot: 'bg-gray-400', banner: 'from-gray-500 to-slate-600' };

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

const STATUS_STAGES   = ['pending', 'confirmed', 'in_warehouse', 'out_for_delivery', 'delivered'];
const TERMINAL_STATUSES = ['failed', 'cancelled'];
const getStatusProgress = (s) => {
  if (s === 'failed')    return 80;
  if (s === 'cancelled') return 20;
  const i = STATUS_STAGES.indexOf(s);
  return i >= 0 ? ((i + 1) / STATUS_STAGES.length) * 100 : 0;
};
const getTimelineTime = (status, tl) => {
  if (!tl?.length) return null;
  const entries = tl.filter(e => e.status === status);
  return entries.length ? entries[entries.length - 1].time : null;
};

const ALL_STATUSES = ['pending', 'confirmed', 'in_warehouse', 'out_for_delivery', 'delivered', 'failed', 'cancelled'];

const AdminTracking = () => {
  const { orderId } = useParams();
  const navigate    = useNavigate();

  // -- Orders list state -------------------------------------------------------
  const [orders,        setOrders]        = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [drivers,       setDrivers]       = useState([]);
  const [listSearch,    setListSearch]    = useState('');
  const [listStatus,    setListStatus]    = useState('all');

  // -- Detail state ------------------------------------------------------------
  const [order,          setOrder]          = useState(null);
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [wsConnected,    setWsConnected]    = useState(false);
  const [autoRefresh,    setAutoRefresh]    = useState(true);

  // -- Admin action modals -----------------------------------------------------
  const [showAssignModal,  setShowAssignModal]  = useState(false);
  const [showStatusModal,  setShowStatusModal]  = useState(false);
  const [selectedDriver,   setSelectedDriver]   = useState('');
  const [newStatus,        setNewStatus]        = useState('');
  const [assigning,        setAssigning]        = useState(false);
  const [updatingStatus,   setUpdatingStatus]   = useState(false);

  // mobile view
  const [mobileView, setMobileView] = useState(orderId ? 'detail' : 'list');

  // -- Fetch all orders -------------------------------------------------------
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const [ordersRes, driversRes] = await Promise.all([
        ordersAPI.getAll(),
        driverAPI.getAll(),
      ]);
      setOrders(ordersRes.data || []);
      setDrivers(driversRes.data || []);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // -- Real-time WS -----------------------------------------------------------
  const handleStatusUpdate = useCallback((data) => {
    const id     = String(data.orderId || data.order_id);
    const status = data.status;
    setOrders(prev => prev.map(o => String(o.id) === id ? { ...o, status } : o));
    if (String(orderId) === id) {
      setOrder(prev => {
        if (!prev) return prev;
        const now        = new Date().toISOString();
        const existing   = prev.timeline || [];
        const alreadyHas = existing.some(e => e.status === status);
        return {
          ...prev, ...data, status,
          timeline: alreadyHas ? existing : [...existing, { status, time: now, description: `Status: ${status}` }],
        };
      });
      toast.success(`Order ${id}: ${status.replace(/_/g, ' ')}`);
    }
  }, [orderId]);

  const handleDriverLocation = useCallback((data) => {
    if (String(data.orderId) === String(orderId))
      setDriverLocation({ lat: data.lat, lng: data.lng, timestamp: Date.now() });
  }, [orderId]);

  const handleDeliveryCompleted = useCallback((data) => {
    const id = String(data.orderId || data.order_id);
    setOrders(prev => prev.map(o => String(o.id) === id ? { ...o, status: 'delivered' } : o));
    if (String(orderId) === id) {
      setOrder(prev => {
        if (!prev) return prev;
        const now        = new Date().toISOString();
        const existing   = prev.timeline || [];
        const alreadyHas = existing.some(e => e.status === 'delivered');
        return {
          ...prev, status: 'delivered', delivered_at: now, deliveredAt: now,
          timeline: alreadyHas ? existing : [...existing, { status: 'delivered', time: now, description: 'Package delivered successfully' }],
        };
      });
      toast.success(`Order ${id} delivered!`);
    }
  }, [orderId]);

  const handleTimelineUpdate = useCallback((data) => {
    const id    = String(data.orderId || data.order_id);
    const entry = data.entry;
    if (String(orderId) === id && entry) {
      setOrder(prev => {
        if (!prev) return prev;
        const existing   = prev.timeline || [];
        const alreadyHas = existing.some(e => e.status === entry.status);
        return alreadyHas ? prev : { ...prev, timeline: [...existing, entry] };
      });
    }
  }, [orderId]);

  const handleNewOrder = useCallback(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    wsService.connect();
    if (orderId) wsService.subscribeToOrder(orderId);
    setWsConnected(wsService.socket?.connected || false);
    const onConn    = () => setWsConnected(true);
    const onDisconn = () => setWsConnected(false);
    wsService.socket?.on('connect',    onConn);
    wsService.socket?.on('disconnect', onDisconn);
    const u1 = wsService.on('order_status_update', handleStatusUpdate);
    const u2 = wsService.on('driver_location',     handleDriverLocation);
    const u3 = wsService.on('delivery_completed',  handleDeliveryCompleted);
    const u4 = wsService.on('new_order',           handleNewOrder);
    const u5 = wsService.on('timeline_update',     handleTimelineUpdate);
    return () => {
      if (orderId) wsService.unsubscribeFromOrder(orderId);
      wsService.socket?.off('connect',    onConn);
      wsService.socket?.off('disconnect', onDisconn);
      u1(); u2(); u3(); u4(); u5();
    };
  }, [orderId, handleStatusUpdate, handleDriverLocation, handleDeliveryCompleted, handleNewOrder, handleTimelineUpdate]);

  // -- Fetch order detail -----------------------------------------------------
  const fetchDetail = useCallback(async (silent = false) => {
    if (!orderId) return;
    if (!silent) setDetailLoading(true); else setRefreshing(true);
    try {
      const res = await ordersAPI.getById(orderId);
      setOrder(res.data);
      setNewStatus(res.data?.status || '');
    } catch {
      toast.error('Failed to load tracking info');
    } finally {
      setDetailLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId) { fetchDetail(); setMobileView('detail'); }
    else         { setOrder(null); setMobileView('list'); }
  }, [orderId]);

  useEffect(() => {
    if (!autoRefresh || !orderId) return;
    const iv = setInterval(() => fetchDetail(true), 30000);
    return () => clearInterval(iv);
  }, [autoRefresh, orderId, fetchDetail]);

  // -- Admin actions ----------------------------------------------------------
  const handleAssignDriver = async () => {
    if (!selectedDriver) { toast.error('Please select a driver'); return; }
    setAssigning(true);
    try {
      await ordersAPI.assignDriver(order.id, selectedDriver);
      const drv = drivers.find(d => String(d.id) === String(selectedDriver));
      const patch = { driverId: selectedDriver, driverName: drv?.name, status: 'out_for_delivery' };
      setOrder(prev => prev ? { ...prev, ...patch } : prev);
      setOrders(prev => prev.map(o => String(o.id) === String(order.id) ? { ...o, ...patch } : o));
      toast.success('Driver assigned!');
      setShowAssignModal(false);
      setSelectedDriver('');
    } catch {
      toast.error('Failed to assign driver');
    } finally {
      setAssigning(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!newStatus || newStatus === order?.status) { setShowStatusModal(false); return; }
    setUpdatingStatus(true);
    try {
      await ordersAPI.updateStatus(order.id, newStatus);
      setOrder(prev => prev ? { ...prev, status: newStatus } : prev);
      setOrders(prev => prev.map(o => String(o.id) === String(order.id) ? { ...o, status: newStatus } : o));
      toast.success(`Status updated to "${newStatus.replace(/_/g, ' ')}"`);
      setShowStatusModal(false);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!confirm('Cancel this order?')) return;
    try {
      await ordersAPI.cancel(order.id);
      setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      setOrders(prev => prev.map(o => String(o.id) === String(order.id) ? { ...o, status: 'cancelled' } : o));
      toast.success('Order cancelled');
    } catch {
      toast.error('Failed to cancel order');
    }
  };

  // -- Derived data -----------------------------------------------------------
  const filteredOrders = orders
    .filter(o => {
      const q = listSearch.toLowerCase();
      const match =
        !q ||
        String(o.id).includes(q) ||
        (o.clientName || o.client || '').toLowerCase().includes(q) ||
        (o.delivery_address || o.deliveryAddress || '').toLowerCase().includes(q);
      return match && (listStatus === 'all' || o.status === listStatus);
    })
    .sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));

  const timeline = order ? [
    { status: 'pending',          label: 'Order Placed',      desc: 'Order received in system',               time: order.created_at || order.createdAt,                                                              icon: Package       },
    { status: 'confirmed',        label: 'Confirmed',         desc: 'Order confirmed by warehouse',           time: getTimelineTime('confirmed', order.timeline),                                                    icon: Check         },
    { status: 'in_warehouse',     label: 'At Warehouse',      desc: 'Package is being processed',             time: getTimelineTime('in_warehouse', order.timeline),                                                 icon: Check         },
    { status: 'out_for_delivery', label: 'Out for Delivery',  desc: 'Driver is heading to recipient',         time: getTimelineTime('out_for_delivery', order.timeline),                                             icon: Truck         },
    { status: 'delivered',        label: 'Delivered',         desc: 'Package delivered successfully',         time: order.delivered_at || order.deliveredAt || getTimelineTime('delivered', order.timeline),         icon: Check         },
    ...(order.status === 'failed'    ? [{ status: 'failed',    label: 'Delivery Failed',  desc: order.failure_reason || order.failureReason || 'Delivery attempt was unsuccessful',     time: getTimelineTime('failed',    order.timeline), icon: AlertTriangle, terminal: true }] : []),
    ...(order.status === 'cancelled' ? [{ status: 'cancelled', label: 'Order Cancelled',  desc: 'This order has been cancelled',                                                         time: getTimelineTime('cancelled', order.timeline), icon: X,             terminal: true }] : []),
  ] : [];

  // -- Render: orders list panel -----------------------------------------------
  const renderList = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-primary-500"/>All Orders
            {!ordersLoading && (
              <span className="text-xs font-normal text-gray-400">({orders.length})</span>
            )}
          </h2>
          <button onClick={fetchOrders}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-primary-500 transition">
            <RefreshCw className="w-3.5 h-3.5"/>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
          <input
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            placeholder="Order ID, client or address…"
            className="w-full pl-8 pr-7 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {listSearch && (
            <button onClick={() => setListSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3"/>
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1 flex-wrap">
          {['all', 'pending', 'confirmed', 'in_warehouse', 'out_for_delivery', 'delivered', 'failed'].map(s => (
            <button key={s} onClick={() => setListStatus(s)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                listStatus === s
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 hover:border-primary-400'
              }`}>
              {s === 'all' ? 'All' : getSC(s).label}
            </button>
          ))}
        </div>
      </div>

      {/* List body */}
      <div className="flex-1 overflow-y-auto">
        {ordersLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-3"/>
            <p className="text-xs text-gray-400">Loading orders…</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3"/>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No orders found</p>
            <p className="text-xs text-gray-400 mt-1">{listSearch ? 'Try a different search' : 'No orders in the system'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
            {filteredOrders.map(o => {
              const sc       = getSC(o.status);
              const isActive = String(o.id) === String(orderId);
              return (
                <button key={o.id}
                  onClick={() => navigate(`/admin/tracking/${o.id}`)}
                  className={`w-full text-left px-4 py-3.5 transition-all hover:bg-gray-50 dark:hover:bg-slate-700/40 relative group ${
                    isActive ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                  }`}>
                  {isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-primary-500"/>}
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${sc.dot} shadow-sm`}/>
                    <div className="min-w-0 flex-1">
                      {/* Row 1: order # + badge */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`text-xs font-bold ${
                          isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-800 dark:text-gray-200'
                        }`}>Order #{o.id}</span>
                        <Badge variant={sc.variant} className="text-[10px] shrink-0 py-0">{sc.label}</Badge>
                      </div>
                      {/* Row 2: client name */}
                      {(o.clientName || o.client) && (
                        <p className="text-[11px] text-primary-600 dark:text-primary-400 font-medium truncate flex items-center gap-1 mb-0.5">
                          <User className="w-2.5 h-2.5 shrink-0"/>{o.clientName || o.client}
                        </p>
                      )}
                      {/* Row 3: address */}
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1 mb-1.5">
                        <MapPin className="w-2.5 h-2.5 text-red-400 shrink-0"/>
                        {o.delivery_address || o.deliveryAddress || 'No address'}
                      </p>
                      {/* Row 4: date + driver + chevron */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-gray-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5"/>{fmtDate(o.created_at || o.createdAt)}
                          </p>
                          {o.driverName && (
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                              <Truck className="w-2.5 h-2.5"/>{o.driverName}
                            </p>
                          )}
                        </div>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${
                          isActive
                            ? 'text-primary-500 translate-x-0.5'
                            : 'text-gray-300 group-hover:text-gray-400 group-hover:translate-x-0.5'
                        }`}/>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {!ordersLoading && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/60">
          <p className="text-[10px] text-gray-400">{filteredOrders.length} of {orders.length} orders</p>
        </div>
      )}
    </div>
  );

  // -- Render: tracking detail panel ------------------------------------------
  const renderDetail = () => {
    if (!orderId) return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-20 h-20 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-5">
          <Navigation className="w-10 h-10 text-primary-400"/>
        </div>
        <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-2">Select an order</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
          Choose an order from the list to view its live tracking status, timeline, and admin controls.
        </p>
      </div>
    );
    if (detailLoading) return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-primary-400 animate-spin mb-3"/>
        <p className="text-sm text-gray-400">Loading tracking info…</p>
      </div>
    );
    if (!order) return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <AlertTriangle className="w-14 h-14 text-red-400 mb-4"/>
        <h3 className="font-bold text-gray-800 dark:text-white mb-2">Order not found</h3>
        <p className="text-sm text-gray-400 mb-4">Could not load tracking for order #{orderId}</p>
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => fetchDetail()}>Retry</Button>
      </div>
    );

    const currentIdx = STATUS_STAGES.indexOf(order.status);
    const sc         = getSC(order.status);

    return (
      <div className="h-full overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => navigate('/admin/tracking')}
                  className="lg:hidden text-xs font-semibold text-primary-600">← All orders</button>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Order #{order.id}</h1>
                <Badge variant={sc.variant}>{sc.label}</Badge>
                {wsConnected
                  ? <span className="flex items-center gap-1 text-xs text-green-600"><Wifi className="w-3 h-3"/>Live</span>
                  : <span className="flex items-center gap-1 text-xs text-gray-400"><WifiOff className="w-3 h-3"/>Offline</span>}
              </div>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                Placed {fmtTime(order.createdAt || order.created_at)}
                <button onClick={() => { navigator.clipboard.writeText(String(order.id)); toast.success('ID copied!'); }}
                  className="ml-1 text-gray-400 hover:text-gray-600">
                  <Copy className="w-3 h-3"/>
                </button>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => fetchDetail(true)} disabled={refreshing}>
                {refreshing ? 'Updating…' : 'Refresh'}
              </Button>
              {/* Admin: change status */}
              <Button variant="outline" size="sm" icon={Edit2} onClick={() => { setNewStatus(order.status); setShowStatusModal(true); }}>
                Change Status
              </Button>
              {/* Admin: assign driver */}
              {!order.driverName && (
                <Button size="sm" icon={UserCheck} onClick={() => { setSelectedDriver(''); setShowAssignModal(true); }}>
                  Assign Driver
                </Button>
              )}
              {/* Admin: cancel */}
              {['pending', 'confirmed', 'in_warehouse'].includes(order.status) && (
                <Button variant="danger" size="sm" icon={X} onClick={handleCancelOrder}>Cancel</Button>
              )}
            </div>
          </div>

          {/* Status banner */}
          <div className={`p-5 rounded-2xl bg-linear-to-r ${sc.banner}`}>
            <div className="flex items-center gap-4 text-white mb-4">
              {order.status === 'out_for_delivery' ? <Truck className="w-9 h-9"/> : <Package className="w-9 h-9"/>}
              <div>
                <p className="text-lg font-bold">
                  {order.status === 'delivered'        ? 'Delivered!'
                  : order.status === 'out_for_delivery' ? 'On the Way'
                  : order.status === 'failed'           ? 'Delivery Failed'
                  : order.status === 'cancelled'        ? 'Cancelled'
                  : 'Processing'}
                </p>
                <p className="text-white/80 text-sm">
                  {order.estimatedDelivery
                    ? `Est. delivery: ${new Date(order.estimatedDelivery).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                    : 'Estimated delivery date not set'}
                </p>
              </div>
            </div>
            <div className="h-2 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${getStatusProgress(order.status)}%` }}/>
            </div>
            <div className="flex justify-between mt-2">
              {STATUS_STAGES.map((stage, i) => (
                <div key={stage} className={`flex flex-col items-center ${i <= currentIdx ? 'text-white' : 'text-white/40'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full border-2 ${i <= currentIdx ? 'bg-white border-white' : 'border-white/40'}`}/>
                  <span className="text-[10px] mt-1 hidden sm:block">{{ pending: 'Ordered', confirmed: 'Confirmed', in_warehouse: 'Warehouse', out_for_delivery: 'On the Way', delivered: 'Delivered' }[stage] || stage.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">

              {/* Timeline */}
              <Card>
                <CardHeader><CardTitle icon={Clock}>Tracking Timeline</CardTitle></CardHeader>
                <div className="p-5 space-y-0">
                  {timeline.map((step, i) => {
                    const stepIdx    = STATUS_STAGES.indexOf(step.status);
                    const isComplete = step.terminal
                      ? false
                      : currentIdx >= 0 ? stepIdx <= currentIdx : !!step.time;
                    const isCurrent  = !step.terminal && order.status === step.status;
                    const isTerminal = !!step.terminal;
                    const isLast     = i === timeline.length - 1;
                    return (
                      <div key={step.status} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${
                            isTerminal             ? 'bg-red-100 dark:bg-red-900/30 text-red-500 ring-2 ring-red-200 dark:ring-red-800'
                            : isComplete && !isCurrent ? 'bg-green-500 text-white'
                            : isCurrent            ? 'bg-primary-500 text-white ring-4 ring-primary-200 dark:ring-primary-800'
                            :                        'bg-gray-100 dark:bg-slate-700 text-gray-400'
                          }`}>
                            {isComplete && !isCurrent && !isTerminal
                              ? <Check className="w-4 h-4"/>
                              : <step.icon className="w-4 h-4"/>}
                          </div>
                          {!isLast && (
                            <div className={`w-0.5 flex-1 my-1 min-h-7 ${
                              isComplete ? 'bg-green-400 dark:bg-green-600' : 'bg-gray-200 dark:bg-slate-700'
                            }`}/>
                          )}
                        </div>
                        <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-semibold text-sm ${
                              isTerminal    ? 'text-red-600 dark:text-red-400'
                              : isComplete  ? 'text-gray-900 dark:text-white'
                              : isCurrent   ? 'text-primary-600 dark:text-primary-400'
                              :               'text-gray-400 dark:text-gray-500'
                            }`}>{step.label}</p>
                            {isCurrent && (
                              <span className="text-[10px] px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full font-bold animate-pulse">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.desc}</p>
                          {step.time ? (
                            <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0"/>{fmtTime(step.time)}
                            </p>
                          ) : isComplete && !isTerminal ? (
                            <p className="text-[11px] text-gray-400 mt-1 italic">Completed</p>
                          ) : !isComplete && !isCurrent && !isTerminal ? (
                            <p className="text-[11px] text-gray-400 mt-1 italic">Not yet reached</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Activity log — shows every order_timeline DB entry */}
              {order.timeline?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle icon={ListOrdered}>Activity Log</CardTitle></CardHeader>
                  <div className="px-5 pb-5 space-y-1">
                    {[...order.timeline]
                      .sort((a, b) => new Date(a.time || a.created_at || 0) - new Date(b.time || b.created_at || 0))
                      .map((entry, i) => {
                        const statusColors = {
                          pending:           'bg-yellow-400',
                          confirmed:         'bg-blue-400',
                          in_warehouse:      'bg-indigo-400',
                          out_for_delivery:  'bg-primary-400',
                          started_delivery:  'bg-cyan-400',
                          delivered:         'bg-green-500',
                          failed:            'bg-red-500',
                          cancelled:         'bg-gray-400',
                          created:           'bg-gray-400',
                        };
                        const dot = statusColors[entry.status] || 'bg-gray-400';
                        const t   = entry.time || entry.created_at;
                        return (
                          <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-slate-700/50 last:border-0">
                            <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`}/>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 capitalize">
                                  {(entry.status || '').replace(/_/g, ' ')}
                                </p>
                                {t && <p className="text-[10px] text-gray-400 shrink-0">{fmtTime(t)}</p>}
                              </div>
                              {entry.description && (
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{entry.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </Card>
              )}

              {/* Driver location map placeholder */}
              <Card className="overflow-hidden">
                <div className="h-52 bg-linear-to-br from-blue-100 to-blue-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center relative">
                  {driverLocation ? (
                    <div className="text-center">
                      <div className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                        <Truck className="w-7 h-7 text-white"/>
                      </div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">Driver Location</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Updated {new Date(driverLocation.timestamp).toLocaleTimeString()}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Navigation className="w-10 h-10 text-blue-400 mx-auto mb-2"/>
                      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xs px-4">
                        {order.status === 'out_for_delivery'
                          ? 'Waiting for driver location…'
                          : 'Live tracking available when out for delivery'}
                      </p>
                    </div>
                  )}
                  {wsConnected && order.status === 'out_for_delivery' && (
                    <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white text-xs rounded-full">
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse"/>Live Tracking
                    </div>
                  )}
                  {/* Admin badge */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1.5 bg-slate-800/80 text-white text-xs rounded-full">
                    <ShieldCheck className="w-3 h-3"/>Admin View
                  </div>
                </div>
              </Card>
            </div>

            {/* Right info cards */}
            <div className="space-y-4">

              {/* Client info */}
              {(order.clientName || order.client) && (
                <Card>
                  <div className="p-4">
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-3">Client</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-indigo-600"/>
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">
                          {order.clientName || order.client}
                        </p>
                        {order.clientEmail && (
                          <p className="text-xs text-gray-400">{order.clientEmail}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Driver info */}
              <Card>
                <div className="p-4">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-3">Driver</p>
                  {order.driverName ? (
                    <>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                          <Truck className="w-5 h-5 text-primary-600"/>
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-gray-900 dark:text-white">{order.driverName}</p>
                          <div className="flex items-center gap-1 text-xs text-yellow-500">
                            <Star className="w-3 h-3 fill-current"/><span>{order.driverRating || '4.8'}</span>
                          </div>
                        </div>
                      </div>
                      <Button fullWidth size="sm" variant="outline" icon={UserCheck}
                        onClick={() => { setSelectedDriver(''); setShowAssignModal(true); }}>
                        Reassign Driver
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center py-3">
                      <Truck className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2"/>
                      <p className="text-xs text-gray-400 mb-3">No driver assigned</p>
                      <Button fullWidth size="sm" icon={UserCheck}
                        onClick={() => { setSelectedDriver(''); setShowAssignModal(true); }}>
                        Assign Driver
                      </Button>
                    </div>
                  )}
                </div>
              </Card>

              {/* Package info */}
              <Card>
                <div className="p-4">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-3">Package</p>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl mb-3">
                    <Package className="w-7 h-7 text-primary-500"/>
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-white capitalize">
                        {(order.packageType || order.package_type || 'package').replace(/_/g, ' ')}
                      </p>
                      {(order.packageWeight || order.package_weight) && (
                        <p className="text-xs text-gray-500">{order.packageWeight || order.package_weight} kg</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <p className="text-[10px] text-blue-600 font-bold">FROM</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                        {order.pickupAddress || order.pickup_address || 'Warehouse'}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <p className="text-[10px] text-green-600 font-bold">TO</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                        {order.deliveryAddress || order.delivery_address}
                      </p>
                    </div>
                  </div>
                  {order.amount != null && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl flex items-center justify-between">
                      <span className="text-xs text-gray-500">Amount</span>
                      <span className="font-bold text-primary-600">${Number(order.amount).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Admin notes */}
              {order.deliveryInstructions && (
                <Card>
                  <div className="p-4">
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Delivery Instructions</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{order.deliveryInstructions}</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>

        {/* -- Modals -- */}

        {/* Change status modal */}
        <Modal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} title="Change Order Status" size="sm">
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
              <p className="text-xs text-gray-500">Current status</p>
              <Badge variant={sc.variant} className="mt-1">{sc.label}</Badge>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Status</label>
              <div className="relative">
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                  className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{getSC(s).label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button fullWidth variant="outline" onClick={() => setShowStatusModal(false)}>Cancel</Button>
              <Button fullWidth onClick={handleUpdateStatus} disabled={updatingStatus || newStatus === order.status}>
                {updatingStatus ? 'Saving…' : 'Update Status'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Assign driver modal */}
        <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign Driver" size="md">
          <div className="space-y-4">
            <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
              <p className="text-sm text-gray-600 dark:text-gray-400">Assigning driver to order</p>
              <p className="font-mono font-semibold text-primary-600 mt-1">#{order.id}</p>
              <p className="text-sm text-gray-500 mt-1">{order.deliveryAddress || order.delivery_address}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Driver</label>
              <div className="relative">
                <select
                  value={selectedDriver}
                  onChange={e => setSelectedDriver(e.target.value)}
                  className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Choose a driver…</option>
                  {drivers
                    .filter(d => d.status === 'active' || d.status === 'available')
                    .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.vehicleType || d.vehicle_type || 'Vehicle'}
                      </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
              </div>
              {drivers.filter(d => d.status === 'active' || d.status === 'available').length === 0 && (
                <p className="text-sm text-amber-600 mt-2">No available drivers at the moment</p>
              )}
            </div>
            {selectedDriver && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-1.5">
                  <Check className="w-4 h-4 shrink-0" />
                  Driver will be notified and status will change to "Out for Delivery"
                </p>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button fullWidth variant="outline" onClick={() => setShowAssignModal(false)} disabled={assigning}>Cancel</Button>
              <Button fullWidth onClick={handleAssignDriver} disabled={assigning || !selectedDriver}>
                {assigning ? 'Assigning…' : 'Assign Driver'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  // -- Main layout ------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary-500"/>Order Tracking
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Real-time tracking across all orders
          </p>
        </div>
        <div className="ml-auto">
          {wsConnected
            ? <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-full font-medium"><Wifi className="w-3.5 h-3.5"/>Live</span>
            : <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 dark:bg-slate-700 px-3 py-1.5 rounded-full"><WifiOff className="w-3.5 h-3.5"/>Offline</span>}
        </div>
      </div>

      {/* Split view */}
      <div className="h-[calc(100vh-200px)] flex rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        {/* Left: orders list */}
        <div className={`w-80 shrink-0 border-r border-gray-100 dark:border-slate-700 flex flex-col ${mobileView === 'list' ? 'flex' : 'hidden'} lg:flex`}>
          {renderList()}
        </div>
        {/* Right: tracking detail */}
        <div className={`flex-1 min-w-0 ${mobileView === 'detail' ? 'flex' : 'hidden'} lg:flex flex-col`}>
          {renderDetail()}
        </div>
      </div>
    </div>
  );
};

export default AdminTracking;
