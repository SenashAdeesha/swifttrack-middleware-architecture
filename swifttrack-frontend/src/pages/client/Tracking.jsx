import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MapPin, Package, Clock, Check, Truck, Phone, MessageCircle, RefreshCw, Share2,
  Copy, Navigation, User, Star, HelpCircle, AlertTriangle, Edit2, Wifi, WifiOff,
  Search, ChevronRight, Loader2, ListOrdered, X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal } from '../../components/common';
import { ordersAPI, wsService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

// -- Status helpers -----------------------------------------------------------
const STATUS_CFG = {
  pending:          { label: 'Pending',          variant: 'warning',   dot: 'bg-yellow-400',  banner: 'from-yellow-400 to-orange-500' },
  confirmed:        { label: 'Pending',           variant: 'warning',   dot: 'bg-amber-400',   banner: 'from-amber-500 to-orange-500' },
  in_warehouse:     { label: 'Pending',           variant: 'warning',   dot: 'bg-amber-400',   banner: 'from-amber-500 to-orange-500' },
  out_for_delivery: { label: 'Out for Delivery',  variant: 'primary',   dot: 'bg-primary-400', banner: 'from-blue-500 to-indigo-600' },
  delivered:        { label: 'Delivered',         variant: 'success',   dot: 'bg-green-500',   banner: 'from-green-500 to-emerald-600' },
  failed:           { label: 'Failed',            variant: 'danger',    dot: 'bg-red-500',     banner: 'from-red-500 to-rose-600' },
  cancelled:        { label: 'Cancelled',         variant: 'secondary', dot: 'bg-gray-400',    banner: 'from-gray-500 to-slate-600' },
};
const getSC = (s) => STATUS_CFG[s] ?? { label: s?.replace(/_/g, ' ') ?? '—', variant: 'secondary', dot: 'bg-gray-400', banner: 'from-gray-500 to-slate-600' };

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

const STATUS_STAGES     = ['pending', 'in_warehouse', 'out_for_delivery', 'delivered'];
const TERMINAL_STATUSES = ['failed', 'cancelled'];
const DISPLAY_STATUS    = (s) => s === 'confirmed' ? 'in_warehouse' : s;
const getStatusProgress = (s) => {
  if (s === 'failed')    return 75;
  if (s === 'cancelled') return 25;
  const i = STATUS_STAGES.indexOf(DISPLAY_STATUS(s));
  return i >= 0 ? ((i + 1) / STATUS_STAGES.length) * 100 : 0;
};
const getTimelineTime = (status, tl) => {
  if (!tl?.length) return null;
  const entries = tl.filter(e => e.status === status);
  return entries.length ? entries[entries.length - 1].time : null;
};

const Tracking = () => {
  const { orderId } = useParams();
  const { user }    = useAuth();
  const navigate    = useNavigate();

  // -- Orders list state -------------------------------------------------------
  const [orders,        setOrders]        = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [listSearch,    setListSearch]    = useState('');
  const [listStatus,    setListStatus]    = useState('all');

  // -- Detail state ------------------------------------------------------------
  const [order,          setOrder]          = useState(null);
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [wsConnected,    setWsConnected]    = useState(false);
  const [autoRefresh,    setAutoRefresh]    = useState(true);

  // modals
  const [showShareModal,        setShowShareModal]        = useState(false);
  const [showSupportModal,      setShowSupportModal]      = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [supportIssue,          setSupportIssue]          = useState('');
  const [supportMessage,        setSupportMessage]        = useState('');
  const [instructions,          setInstructions]          = useState('');

  // mobile view toggle
  const [mobileView, setMobileView] = useState(orderId ? 'detail' : 'list');

  // -- Fetch all client orders -------------------------------------------------
  const fetchOrders = useCallback(async () => {
    if (!user?.id) return;
    setOrdersLoading(true);
    try {
      const res = await ordersAPI.getAll({ clientId: user.id });
      setOrders(res.data || []);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setOrdersLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // -- Real-time WS ------------------------------------------------------------
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
      if (status === 'delivered')             toast.success('\uD83C\uDF89 Your package has been delivered!');
      else if (status === 'failed')           toast.error('Delivery attempt failed. Our team will contact you.');
      else if (status === 'out_for_delivery') toast('\uD83D\uDE9A Your package is out for delivery!', { icon: '\uD83D\uDCE6' });
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
      toast.success('\uD83C\uDF89 Your package has been delivered!');
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

  useEffect(() => {
    wsService.connect();
    if (orderId) wsService.subscribeToOrder(orderId);
    setWsConnected(wsService.socket?.connected || false);
    const u1 = wsService.on('order_status_update', handleStatusUpdate);
    const u2 = wsService.on('driver_location', handleDriverLocation);
    const u3 = wsService.on('delivery_completed', handleDeliveryCompleted);
    const u4 = wsService.on('timeline_update', handleTimelineUpdate);
    return () => { if (orderId) wsService.unsubscribeFromOrder(orderId); u1(); u2(); u3(); u4(); };
  }, [orderId, handleStatusUpdate, handleDriverLocation, handleDeliveryCompleted, handleTimelineUpdate]);

  // -- Fetch order detail when orderId changes --------------------------------
  const fetchDetail = useCallback(async (silent = false) => {
    if (!orderId) return;
    if (!silent) setDetailLoading(true); else setRefreshing(true);
    try {
      const res = await ordersAPI.getById(orderId);
      setOrder(res.data);
      setInstructions(res.data.deliveryInstructions || '');
    } catch {
      toast.error('Failed to load tracking info');
    } finally {
      setDetailLoading(false); setRefreshing(false);
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

  // -- Helpers -----------------------------------------------------------------
  const handleShare = (method) => {
    const url = window.location.href;
    if (method === 'copy') { navigator.clipboard.writeText(url); toast.success('Link copied!'); }
    else if (method === 'email') window.open(`mailto:?subject=Track my package&body=${url}`);
    setShowShareModal(false);
  };
  const handleSupportSubmit = () => {
    toast.success("Support request sent! We'll contact you soon.");
    setShowSupportModal(false); setSupportIssue(''); setSupportMessage('');
  };
  const handleInstructionsUpdate = async () => {
    try {
      await ordersAPI.update(orderId, { deliveryInstructions: instructions });
      toast.success('Delivery instructions updated!');
      setShowInstructionsModal(false);
    } catch { toast.error('Failed to update instructions'); }
  };

  const filteredOrders = orders
    .filter(o => {
      const q = listSearch.toLowerCase();
      const match = !q || String(o.id).includes(q) || (o.delivery_address || o.deliveryAddress || '').toLowerCase().includes(q);
      return match && (listStatus === 'all' || o.status === listStatus);
    })
    .sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));

  const timeline = order ? [
    { status: 'pending',          label: 'Order Placed',      desc: 'Your order has been received',                  time: order.created_at || order.createdAt,                                                              icon: Package       },
    { status: 'in_warehouse',     label: 'Processing',        desc: 'Order confirmed & being prepared at warehouse', time: getTimelineTime('in_warehouse', order.timeline) || getTimelineTime('confirmed', order.timeline),   icon: Check         },
    { status: 'out_for_delivery', label: 'Out for Delivery',  desc: 'Your driver is heading to your location',       time: getTimelineTime('out_for_delivery', order.timeline),                                             icon: Truck         },
    { status: 'delivered',        label: 'Delivered',         desc: 'Package delivered successfully',                time: order.delivered_at || order.deliveredAt || getTimelineTime('delivered', order.timeline),         icon: Check         },
    ...(order.status === 'failed'    ? [{ status: 'failed',    label: 'Delivery Failed',  desc: order.failure_reason || order.failureReason || 'Delivery attempt was unsuccessful',      time: getTimelineTime('failed',    order.timeline), icon: AlertTriangle, terminal: true }] : []),
    ...(order.status === 'cancelled' ? [{ status: 'cancelled', label: 'Order Cancelled',  desc: 'This order has been cancelled',                                                          time: getTimelineTime('cancelled', order.timeline), icon: X,             terminal: true }] : []),
  ] : [];

  const supportIssues = ['Delivery delay','Wrong address','Package damaged','Driver issue','Change delivery time','Other'];

  // -- Orders list panel -------------------------------------------------------
  const renderList = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-primary-500"/>My Orders
            {!ordersLoading && <span className="text-xs font-normal text-gray-400">({orders.length})</span>}
          </h2>
          <button onClick={fetchOrders} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-primary-500 transition">
            <RefreshCw className="w-3.5 h-3.5"/>
          </button>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
          <input value={listSearch} onChange={e => setListSearch(e.target.value)}
            placeholder="Search by order ID or address\u2026"
            className="w-full pl-8 pr-7 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"/>
          {listSearch && <button onClick={() => setListSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3 h-3"/></button>}
        </div>
        <div className="flex gap-1 flex-wrap">
          {['all','pending','in_warehouse','out_for_delivery','delivered','failed'].map(s => (
            <button key={s} onClick={() => setListStatus(s)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${listStatus===s?'bg-primary-500 border-primary-500 text-white':'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 hover:border-primary-400'}`}>
              {s==='all'?'All':getSC(s).label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ordersLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-3"/>
            <p className="text-xs text-gray-400">Loading orders\u2026</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3"/>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No orders found</p>
            <p className="text-xs text-gray-400 mt-1">{listSearch?'Try a different search':'You have not placed any orders yet'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
            {filteredOrders.map(o => {
              const sc = getSC(o.status);
              const isActive = String(o.id) === String(orderId);
              return (
                <button key={o.id} onClick={() => navigate(`/client/tracking/${o.id}`)}
                  className={`w-full text-left px-4 py-3.5 transition-all hover:bg-gray-50 dark:hover:bg-slate-700/40 relative group ${
                    isActive ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                  }`}>
                  {/* Active left bar */}
                  {isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-primary-500"/>}
                  <div className="flex items-start gap-2.5">
                    {/* Status dot */}
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${sc.dot} shadow-sm`}/>
                    <div className="min-w-0 flex-1">
                      {/* Row 1: order ID + badge */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`text-xs font-bold ${
                          isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-800 dark:text-gray-200'
                        }`}>Order #{o.id}</span>
                        <Badge variant={sc.variant} className="text-[10px] shrink-0 py-0">{sc.label}</Badge>
                      </div>
                      {/* Row 2: address */}
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1 mb-1.5">
                        <MapPin className="w-2.5 h-2.5 text-red-400 shrink-0"/>
                        {o.delivery_address || o.deliveryAddress || 'No address'}
                      </p>
                      {/* Row 3: date + chevron */}
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5"/>{fmtDate(o.created_at || o.createdAt)}
                        </p>
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

      {!ordersLoading && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/60">
          <p className="text-[10px] text-gray-400">{filteredOrders.length} of {orders.length} orders</p>
        </div>
      )}
    </div>
  );

  // -- Tracking detail panel ---------------------------------------------------
  const renderDetail = () => {
    if (!orderId) return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-20 h-20 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-5">
          <Navigation className="w-10 h-10 text-primary-400"/>
        </div>
        <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-2">Select an order</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">Choose an order from the list to view its live tracking status and delivery timeline.</p>
      </div>
    );
    if (detailLoading) return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-primary-400 animate-spin mb-3"/>
        <p className="text-sm text-gray-400">Loading tracking info\u2026</p>
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

    const currentIndex = STATUS_STAGES.indexOf(DISPLAY_STATUS(order.status));
    const sc = getSC(order.status);

    return (
      <div className="h-full overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => navigate('/client/tracking')} className="lg:hidden text-xs font-semibold text-primary-600">\u2190 All orders</button>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Order #{order.id}</h1>
                <Badge variant={sc.variant}>{sc.label}</Badge>
                {wsConnected
                  ? <span className="flex items-center gap-1 text-xs text-green-600"><Wifi className="w-3 h-3"/>Live</span>
                  : <span className="flex items-center gap-1 text-xs text-gray-400"><WifiOff className="w-3 h-3"/>Offline</span>}
              </div>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                Placed {fmtTime(order.createdAt || order.created_at)}
                <button onClick={() => { navigator.clipboard.writeText(String(order.id)); toast.success('ID copied!'); }} className="ml-1 text-gray-400 hover:text-gray-600">
                  <Copy className="w-3 h-3"/>
                </button>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => fetchDetail(true)} disabled={refreshing}>{refreshing?'Updating\u2026':'Refresh'}</Button>
              <Button variant="outline" size="sm" icon={Share2} onClick={() => setShowShareModal(true)}>Share</Button>
              <Button variant="outline" size="sm" icon={HelpCircle} onClick={() => setShowSupportModal(true)}>Support</Button>
            </div>
          </div>

          {/* Status banner */}
          <div className={`p-5 rounded-2xl bg-linear-to-r ${sc.banner}`}>
            <div className="flex items-center gap-4 text-white mb-4">
              {order.status==='out_for_delivery'?<Truck className="w-9 h-9"/>:<Package className="w-9 h-9"/>}
              <div>
                <p className="text-lg font-bold">
                  {order.status==='delivered'?'Delivered!':order.status==='out_for_delivery'?'On the Way':order.status==='failed'?'Delivery Failed':order.status==='cancelled'?'Cancelled':'Processing'}
                </p>
                <p className="text-white/80 text-sm">
                  {order.estimatedDelivery
                    ?`Est. delivery: ${new Date(order.estimatedDelivery).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`
                    :'Estimated delivery date not set'}
                </p>
              </div>
            </div>
            <div className="h-2 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{width:`${getStatusProgress(order.status)}%`}}/>
            </div>
            <div className="flex justify-between mt-2">
              {STATUS_STAGES.map((stage,i)=>(
                <div key={stage} className={`flex flex-col items-center ${i<=currentIndex?'text-white':'text-white/40'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full border-2 ${i<=currentIndex?'bg-white border-white':'border-white/40'}`}/>
                  <span className="text-[10px] mt-1 hidden sm:block">{{ pending: 'Ordered', in_warehouse: 'Processing', out_for_delivery: 'On the Way', delivered: 'Delivered' }[stage] || stage.replace(/_/g, ' ')}</span>
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
                    const displaySt  = DISPLAY_STATUS(order.status);
                    const currentIdx = STATUS_STAGES.indexOf(displaySt);
                    const stepIdx    = STATUS_STAGES.indexOf(step.status);
                    // Complete if: step index ≤ current index (normal flow)
                    // OR step has a timestamp (handles failed/cancelled where currentIdx = -1)
                    const isComplete = step.terminal
                      ? false
                      : currentIdx >= 0
                        ? stepIdx <= currentIdx
                        : !!step.time;
                    const isCurrent  = !step.terminal && (order.status === step.status ||
                      (step.status === 'in_warehouse' && order.status === 'confirmed'));
                    const isTerminal = !!step.terminal;
                    const isLast     = i === timeline.length - 1;
                    return (
                      <div key={step.status} className="flex gap-3">
                        {/* Step indicator column */}
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${
                            isTerminal   ? 'bg-red-100 dark:bg-red-900/30 text-red-500 ring-2 ring-red-200 dark:ring-red-800'
                            : isComplete && !isCurrent ? 'bg-green-500 text-white'
                            : isCurrent  ? 'bg-primary-500 text-white ring-4 ring-primary-200 dark:ring-primary-800'
                            :              'bg-gray-100 dark:bg-slate-700 text-gray-400'
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
                        {/* Step content */}
                        <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-semibold text-sm ${
                              isTerminal   ? 'text-red-600 dark:text-red-400'
                              : isComplete ? 'text-gray-900 dark:text-white'
                              : isCurrent  ? 'text-primary-600 dark:text-primary-400'
                              :              'text-gray-400 dark:text-gray-500'
                            }`}>{step.label}</p>
                            {isCurrent && (
                              <span className="text-[10px] px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full font-bold animate-pulse">Current</span>
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

              {/* Driver location */}
              <Card className="overflow-hidden">
                <div className="h-52 bg-linear-to-br from-blue-100 to-blue-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center relative">
                  {driverLocation?(
                    <div className="text-center">
                      <div className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse"><Truck className="w-7 h-7 text-white"/></div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">Driver Location</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}</p>
                      <p className="text-xs text-gray-500 mt-1">Updated {new Date(driverLocation.timestamp).toLocaleTimeString()}</p>
                    </div>
                  ):(
                    <div className="text-center">
                      <Navigation className="w-10 h-10 text-blue-400 mx-auto mb-2"/>
                      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xs px-4">
                        {order.status==='out_for_delivery'?'Waiting for driver location\u2026':'Live tracking available when out for delivery'}
                      </p>
                    </div>
                  )}
                  {wsConnected&&order.status==='out_for_delivery'&&(
                    <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white text-xs rounded-full">
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse"/>Live Tracking
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Right info cards */}
            <div className="space-y-4">
              {order.driverName&&(
                <Card>
                  <div className="p-4">
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-3">Your Driver</p>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center"><User className="w-5 h-5 text-primary-600"/></div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{order.driverName}</p>
                        <div className="flex items-center gap-1 text-xs text-yellow-500"><Star className="w-3 h-3 fill-current"/><span>{order.driverRating||'4.8'}</span></div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button fullWidth size="sm" variant="outline" icon={Phone}>Call</Button>
                      <Button fullWidth size="sm" variant="outline" icon={MessageCircle}>Chat</Button>
                    </div>
                  </div>
                </Card>
              )}

              <Card>
                <div className="p-4">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-3">Package</p>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl mb-3">
                    <Package className="w-7 h-7 text-primary-500"/>
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-white capitalize">{((order.packageType||order.package_type||'package')).replace(/_/g,' ')}</p>
                      {(order.packageWeight||order.package_weight)&&<p className="text-xs text-gray-500">{order.packageWeight||order.package_weight} kg</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <p className="text-[10px] text-blue-600 font-bold">FROM</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{order.pickupAddress||order.pickup_address||'Warehouse'}</p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <p className="text-[10px] text-green-600 font-bold">TO</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{order.deliveryAddress||order.delivery_address}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Instructions</p>
                    <button onClick={()=>setShowInstructionsModal(true)} className="text-primary-600 hover:underline text-xs flex items-center gap-1"><Edit2 className="w-3 h-3"/>Edit</button>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{instructions||'No special instructions'}</p>
                </div>
              </Card>
            </div>
          </div>
        </div>

        <Modal isOpen={showShareModal} onClose={()=>setShowShareModal(false)} title="Share Tracking" size="sm">
          <div className="space-y-3">
            {[{method:'copy',icon:Copy,title:'Copy Link',desc:'Share via any app'},{method:'email',icon:MessageCircle,title:'Email',desc:'Send via email'}].map(item=>(
              <button key={item.method} onClick={()=>handleShare(item.method)} className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition">
                <item.icon className="w-5 h-5 text-gray-500"/>
                <div className="text-left"><p className="font-medium text-sm text-gray-900 dark:text-white">{item.title}</p><p className="text-xs text-gray-500">{item.desc}</p></div>
              </button>
            ))}
          </div>
        </Modal>

        <Modal isOpen={showSupportModal} onClose={()=>setShowSupportModal(false)} title="Contact Support" size="md">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Issue Type</label>
              <div className="grid grid-cols-2 gap-2">
                {supportIssues.map(issue=>(
                  <button key={issue} onClick={()=>setSupportIssue(issue)} className={`p-3 text-sm rounded-xl border-2 transition ${supportIssue===issue?'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700':'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>{issue}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Message</label>
              <textarea value={supportMessage} onChange={e=>setSupportMessage(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Describe your issue\u2026"/>
            </div>
            <Button fullWidth onClick={handleSupportSubmit} disabled={!supportIssue}>Send Request</Button>
          </div>
        </Modal>

        <Modal isOpen={showInstructionsModal} onClose={()=>setShowInstructionsModal(false)} title="Edit Delivery Instructions" size="md">
          <div className="space-y-4">
            <textarea value={instructions} onChange={e=>setInstructions(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Leave at door, ring bell, etc\u2026"/>
            <div className="flex gap-3">
              <Button fullWidth variant="outline" onClick={()=>setShowInstructionsModal(false)}>Cancel</Button>
              <Button fullWidth onClick={handleInstructionsUpdate}>Save</Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  // -- Main layout -------------------------------------------------------------
  return (
    <div className="h-[calc(100vh-130px)] flex rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      {/* Left: orders list */}
      <div className={`w-72 shrink-0 border-r border-gray-100 dark:border-slate-700 flex flex-col ${mobileView==='list'?'flex':'hidden'} lg:flex`}>
        {renderList()}
      </div>
      {/* Right: tracking detail */}
      <div className={`flex-1 min-w-0 ${mobileView==='detail'?'flex':'hidden'} lg:flex flex-col`}>
        {renderDetail()}
      </div>
    </div>
  );
};

export default Tracking;
