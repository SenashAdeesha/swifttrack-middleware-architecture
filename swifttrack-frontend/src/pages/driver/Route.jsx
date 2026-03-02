import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MapPin, Navigation, Clock,
  CheckCircle, Circle, Phone, AlertTriangle, SkipForward,
  Flag, RefreshCw, Loader2, Package, Eye, Calendar,
  Truck, FileText, Hash, Timer, Play, Square,
  ExternalLink, StickyNote, StopCircle, X, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { Card, Badge, Button, Modal } from '../../components/common';
import { driverAPI, ordersAPI, wsService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const toDateStr = (iso) => { if (!iso) return null; return new Date(iso).toISOString().slice(0, 10); };
const todayStr    = () => toDateStr(new Date().toISOString());
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateStr(d.toISOString()); };
const friendlyDate = (iso) => { if (!iso) return '\u2014'; return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); };
const friendlyTime = (iso) => { if (!iso) return '\u2014'; return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
const priorityLabel   = (p) => ({ same_day: 'Same Day', express: 'Express', normal: 'Normal' }[p] ?? p);
const priorityVariant = (p) => ({ same_day: 'error', express: 'warning', normal: 'secondary' }[p] ?? 'secondary');
const mapsUrl   = (addr) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
const mapsEmbed = (addr) => `https://maps.google.com/maps?q=${encodeURIComponent(addr)}&output=embed`;

// ── Distance helpers (University of Colombo → delivery address) ──────────────
const ORIGIN_LAT   = 6.9022;  // University of Colombo
const ORIGIN_LNG   = 79.8610;
const haversineKm  = (lat1, lon1, lat2, lon2) => {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};
const etaMin = (km) => Math.max(1, Math.round(km / 25 * 60)); // ~25 km/h city traffic

const STATUS_META = {
  delivered:          { label: 'Delivered',          color: 'text-green-600 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-900/20',   dot: 'bg-green-500' },
  failed:             { label: 'Failed',              color: 'text-red-500',                          bg: 'bg-red-50 dark:bg-red-900/20',       dot: 'bg-red-500' },
  cancelled:          { label: 'Cancelled',           color: 'text-gray-400',                         bg: 'bg-gray-50 dark:bg-slate-800',       dot: 'bg-gray-400' },
  out_for_delivery:   { label: 'Out for Delivery',    color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-900/20',     dot: 'bg-blue-500' },
  pending:            { label: 'Pending',             color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/20',   dot: 'bg-amber-500' },
  confirmed:          { label: 'Pending',             color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/20',   dot: 'bg-amber-500' },
  in_warehouse:       { label: 'Awaiting Pickup',     color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', dot: 'bg-purple-500' },
  accepted_by_driver: { label: 'Accepted',            color: 'text-green-600 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-900/20',   dot: 'bg-green-500' },
  rejected_by_driver: { label: 'Rejected',            color: 'text-red-500 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-900/20',       dot: 'bg-red-500' },
};
const getMeta = (s) => STATUS_META[s] ?? { label: s?.replace(/_/g,' ') ?? '\u2014', color: 'text-gray-500', bg: 'bg-gray-50', dot: 'bg-gray-400' };

const Route = () => {
  const { user } = useAuth();

  const [stops,        setStops]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [dateFilter,   setDateFilter]   = useState('today');
  const [statusFilter, setStatusFilter] = useState('all');

  // delivery modal state
  const [activeStopId,      setActiveStopId]      = useState(null);
  const [stopPhase,         setStopPhase]         = useState(null);   // null | started | navigating | action
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

  // other modals
  const [showSkipModal,  setShowSkipModal]  = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showViewModal,  setShowViewModal]  = useState(false);
  const [viewStop,       setViewStop]       = useState(null);

  const [skipReason, setSkipReason] = useState('');
  const [skipNote,   setSkipNote]   = useState('');
  const [issueType,  setIssueType]  = useState('');
  const [issueNote,  setIssueNote]  = useState('');
  const [etaMinutes, setEtaMinutes] = useState('');

  const [waitSeconds, setWaitSeconds] = useState(0);
  const [waitRunning, setWaitRunning] = useState(false);
  const waitRef = useRef(null);

  // Local override refs — once the driver marks a stop done/skipped these IDs
  // are locked and never reverted by a re-fetch, even if the DB write is still
  // in-flight.
  const localDeliveredRef      = useRef(new Set()); // orderId → permanently completed
  const localSkippedRef        = useRef(new Set()); // orderId → permanently skipped
  const localOutForDeliveryRef = useRef(new Set()); // orderId → started delivery (out_for_delivery)
  const localAcceptedRef       = useRef(new Set()); // orderId → accepted by driver
  const localRejectedRef       = useRef(new Set()); // orderId → rejected by driver

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const [distanceMap, setDistanceMap] = useState({}); // address → { km, mins } | { loading } | { error }
  const geocacheRef = useRef({}); // tracks addresses already fetched / in-flight

  const startWait = useCallback(() => {
    if (waitRunning) return;
    setWaitRunning(true);
    waitRef.current = setInterval(() => setWaitSeconds(s => s + 1), 1000);
  }, [waitRunning]);
  const stopWait  = useCallback(() => { clearInterval(waitRef.current); setWaitRunning(false); }, []);
  const resetWait = useCallback(() => { clearInterval(waitRef.current); setWaitRunning(false); setWaitSeconds(0); }, []);
  useEffect(() => { resetWait(); }, [activeStopId]);
  useEffect(() => () => clearInterval(waitRef.current), []);

  const fmtWait = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  const skipReasons = ['Recipient not home','Access restricted','Unsafe location','Wrong address','Recipient requested reschedule','Other'];
  const issueTypes  = ['Traffic / road closure','Vehicle problem','Package damaged','Wrong package loaded','Safety concern','Other'];
  const rejectReasons = ['Too far away','Vehicle issue','Personal emergency','Schedule conflict','Other'];

  const fetchRoute = async () => {
    if (!user?.id) return;
    setLoading(true); setError(null);
    try {
      const res    = await driverAPI.getAssignments(user.id);
      const orders = res.data || [];
      const mapped = orders.map((order, i) => {
        // Derive completed/skipped/out_for_delivery/accepted/rejected: always trust the local ref first so a
        // re-fetch can never undo what the driver already physically actioned.
        const localDone         = localDeliveredRef.current.has(String(order.id));
        const localSkipped      = localSkippedRef.current.has(String(order.id));
        const localOutForDel    = localOutForDeliveryRef.current.has(String(order.id));
        const localAccepted     = localAcceptedRef.current.has(String(order.id));
        const localRejected     = localRejectedRef.current.has(String(order.id));
        const dbDone            = order.status === 'delivered';
        const dbSkipped         = order.status === 'failed' || order.status === 'cancelled';
        const dbOutForDelivery  = order.status === 'out_for_delivery';
        const dbAccepted        = order.status === 'accepted_by_driver';
        const dbRejected        = order.status === 'rejected_by_driver';
        const completed         = localDone    || dbDone;
        const skipped           = localSkipped || dbSkipped;
        const outForDelivery    = localOutForDel || dbOutForDelivery;
        const accepted          = localAccepted || dbAccepted;
        const rejected          = localRejected || dbRejected;
        
        // Determine final status: completed > skipped > rejected > out_for_delivery > accepted > db status
        let finalStatus = order.status;
        if (completed) finalStatus = 'delivered';
        else if (skipped) finalStatus = 'failed';
        else if (rejected) finalStatus = 'rejected_by_driver';
        else if (outForDelivery) finalStatus = 'out_for_delivery';
        else if (accepted) finalStatus = 'accepted_by_driver';
        
        return {
          id:                order.id,
          orderId:           order.id,
          stopNum:           i + 1,
          recipient:         order.customer_name    || order.customerName    || 'Recipient',
          address:           order.delivery_address || order.deliveryAddress || 'Address not available',
          timeSlot:          order.estimated_delivery ? friendlyTime(order.estimated_delivery) : `${9+i}:00 AM`,
          estimatedDelivery: order.estimated_delivery || null,
          createdAt:         order.created_at || order.createdAt || null,
          deliveryDate:      toDateStr(order.estimated_delivery),  // Filter by delivery date, not order date
          priority:          order.priority     || 'normal',
          packageType:       order.package_type || order.packageType || 'package',
          status:            finalStatus,
          stopNote:          order.special_instructions || '',
          driverNote:        '',
          completed,
          skipped,
          accepted,
          rejected,
        };
      });
      setStops(mapped);
      const first = mapped.find(s => !s.completed && !s.skipped && !s.rejected);
      setActiveStopId(prev => {
        // Keep the current active stop unless it no longer exists in the new list
        if (prev && mapped.find(s => s.id === prev)) return prev;
        return first?.id || mapped[0]?.id || null;
      });
    } catch (err) {
      console.error(err);
      setError('Failed to load route.');
      toast.error('Failed to load route');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchRoute();
    
    // Listen for new assignments
    const unsubAssignment = wsService.on('new_assignment', () => { 
      toast.success('New delivery assigned!'); 
      fetchRoute(); 
    });
    
    // Listen for order status updates to keep in sync
    const unsubStatus = wsService.on('order_status_update', (data) => {
      const { orderId, status } = data;
      setStops(prev => prev.map(s => 
        String(s.id) === String(orderId) ? { ...s, status } : s
      ));
    });
    
    return () => {
      unsubAssignment?.();
      unsubStatus?.();
    };
  }, [user?.id]);

  // Geocode pending stop addresses and compute driving distance + ETA from
  // University of Colombo (assumed start position) using Nominatim + Haversine.
  useEffect(() => {
    let cancelled = false;
    const pending = new Set(); // addresses started in THIS effect run
    const toFetch = stops
      .filter(s => !s.completed && !s.skipped)
      .map(s => s.address)
      // only skip if already fully resolved (km or error) — 'pending' entries retry
      .filter(a => a && a !== 'Address not available' && geocacheRef.current[a] !== 'done');
    if (toFetch.length === 0) return;
    const run = async () => {
      for (const addr of toFetch) {
        if (cancelled) break;
        if (geocacheRef.current[addr] === 'done') continue; // resolved by another run
        geocacheRef.current[addr] = 'pending';
        pending.add(addr);
        setDistanceMap(prev => ({ ...prev, [addr]: { loading: true } }));
        try {
          const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr + ', Sri Lanka')}&format=json&limit=1`;
          const res  = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'SwiftTrack/1.0' } });
          const json = await res.json();
          if (!cancelled) {
            if (json.length > 0) {
              const km = haversineKm(ORIGIN_LAT, ORIGIN_LNG, parseFloat(json[0].lat), parseFloat(json[0].lon));
              geocacheRef.current[addr] = 'done';
              setDistanceMap(prev => ({ ...prev, [addr]: { km: Number(km.toFixed(1)), mins: etaMin(km) } }));
            } else {
              geocacheRef.current[addr] = 'done'; // no result — mark done so we don't keep retrying
              setDistanceMap(prev => ({ ...prev, [addr]: { error: true } }));
            }
          }
        } catch {
          if (!cancelled) setDistanceMap(prev => ({ ...prev, [addr]: { error: true } }));
        }
        if (!cancelled) await new Promise(r => setTimeout(r, 1150)); // respect Nominatim 1 req/s limit
      }
    };
    run();
    return () => {
      cancelled = true;
      // Reset any addresses that were only 'pending' (in-flight) so the next
      // effect run can retry them instead of staying stuck as loading.
      pending.forEach(addr => {
        if (geocacheRef.current[addr] === 'pending') {
          delete geocacheRef.current[addr];
        }
      });
    };
  }, [stops]);

  const filteredStops = useMemo(() => {
    const td = todayStr(); const tm = tomorrowStr();
    return stops.filter(s => {
      if (dateFilter === 'today')    return s.deliveryDate === td;
      if (dateFilter === 'tomorrow') return s.deliveryDate === tm;
      return s.deliveryDate !== td && s.deliveryDate !== tm;
    });
  }, [stops, dateFilter]);

  const visibleStops = useMemo(() => {
    if (statusFilter === 'pending')   return filteredStops.filter(s => !s.completed && !s.skipped);
    if (statusFilter === 'completed') return filteredStops.filter(s => s.completed);
    if (statusFilter === 'skipped')   return filteredStops.filter(s => s.skipped);
    return filteredStops;
  }, [filteredStops, statusFilter]);

  const tabCounts = useMemo(() => {
    const td = todayStr(); const tm = tomorrowStr();
    return {
      today:    stops.filter(s => s.deliveryDate === td).length,
      tomorrow: stops.filter(s => s.deliveryDate === tm).length,
      others:   stops.filter(s => s.deliveryDate !== td && s.deliveryDate !== tm).length,
    };
  }, [stops]);

  const statusCounts = useMemo(() => ({
    all:       filteredStops.length,
    pending:   filteredStops.filter(s => !s.completed && !s.skipped).length,
    completed: filteredStops.filter(s => s.completed).length,
    skipped:   filteredStops.filter(s => s.skipped).length,
  }), [filteredStops]);

  const activeStop     = stops.find(s => s.id === activeStopId) || null;
  const completedCount = filteredStops.filter(s => s.completed).length;
  const skippedCount   = filteredStops.filter(s => s.skipped).length;
  const progress       = filteredStops.length > 0 ? Math.round((completedCount / filteredStops.length) * 100) : 0;

  const handleStart = async (stop, e) => {
    e?.stopPropagation();
    setActiveStopId(stop.id);
    setStopPhase('started');
    resetWait();
    setShowDeliveryModal(true);
    
    // Lock the stop locally BEFORE the API call so any concurrent re-fetch
    // cannot revert it while the network request is still in-flight.
    localOutForDeliveryRef.current.add(String(stop.orderId || stop.id));
    
    // Record in DB and update status to out_for_delivery
    try {
      await ordersAPI.startDelivery(stop.orderId || stop.id);
      // Update local state to reflect out_for_delivery status
      setStops(prev => prev.map(s => 
        s.id === stop.id ? { ...s, status: 'out_for_delivery' } : s
      ));
      toast.success('Delivery started - Out for delivery');
    } catch (err) {
      console.warn('Failed to start delivery:', err);
      // Remove from local ref if API call failed
      localOutForDeliveryRef.current.delete(String(stop.orderId || stop.id));
      toast.error('Failed to start delivery');
    }
  };

  const handleNavigate = async () => {
    if (!activeStop) return;
    
    // Ensure status is updated to out_for_delivery when navigating
    if (activeStop.status !== 'out_for_delivery' && activeStop.status !== 'delivered') {
      // Lock locally first
      localOutForDeliveryRef.current.add(String(activeStop.orderId || activeStop.id));
      try {
        await ordersAPI.startDelivery(activeStop.orderId || activeStop.id);
        setStops(prev => prev.map(s => 
          s.id === activeStop.id ? { ...s, status: 'out_for_delivery' } : s
        ));
      } catch (err) {
        console.warn('Failed to update delivery status:', err);
        // Don't remove from local ref - keep it locked since user is navigating
      }
    }
    
    window.open(mapsUrl(activeStop.address), '_blank', 'noopener,noreferrer');
    setStopPhase('navigating');
    setShowDeliveryModal(false);  // close modal — card button becomes "I'm Arrived"
    toast.success('Navigation opened in Google Maps');
  };

  const handleArrived = () => setStopPhase('action');

  const closeDeliveryModal = () => {
    setShowDeliveryModal(false);
    // Keep 'navigating' phase so the card button shows "I'm Arrived"
    if (stopPhase !== 'navigating') setStopPhase(null);
  };

  const advanceToNext = useCallback((updated, doneId) => {
    const pending    = updated.filter(s => !s.completed && !s.skipped);
    const pos        = updated.findIndex(s => s.id === doneId);
    const after      = pending.find(s => updated.findIndex(p => p.id === s.id) > pos);
    const next       = after || pending[0] || null;
    setActiveStopId(next?.id || null);
    setStopPhase(null);
    setShowDeliveryModal(false);
    setStatusFilter('all');
  }, []);

  const handleCompleteStop = async () => {
    if (!activeStop) return;
    // Lock the stop locally BEFORE the API call so any concurrent re-fetch
    // cannot revert it while the network request is still in-flight.
    localDeliveredRef.current.add(String(activeStop.orderId || activeStop.id));
    try {
      await ordersAPI.markDelivered(activeStop.orderId || activeStop.id);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save delivery — please check connection and retry');
      localDeliveredRef.current.delete(String(activeStop.orderId || activeStop.id));
      return;  // Don't advance if DB write failed
    }
    const updated = stops.map(s => s.id === activeStop.id ? { ...s, completed: true, status: 'delivered' } : s);
    setStops(updated);
    toast.success(`Stop ${activeStop.stopNum} delivered!`);
    const remaining = updated.filter(s => !s.completed && !s.skipped);
    if (remaining.length === 0) {
      setShowDeliveryModal(false); setStopPhase(null);
      try { await driverAPI.updateStatus(user?.id, 'available'); } catch (err) { console.error('Driver status update failed:', err); }
      toast.success('All stops delivered! Great work today.');
    } else {
      advanceToNext(updated, activeStop.id);
    }
  };

  const handleSkipStop = async () => {
    if (!skipReason) { toast.error('Please select a reason'); return; }
    localSkippedRef.current.add(String(activeStop.orderId || activeStop.id));
    try {
      await ordersAPI.markFailed(activeStop.orderId || activeStop.id, { reason: skipReason, notes: skipNote });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save skip — please check connection and retry');
      localSkippedRef.current.delete(String(activeStop.orderId || activeStop.id));
      return;
    }
    const updated = stops.map(s => s.id === activeStop.id ? { ...s, skipped: true } : s);
    setStops(updated); setShowSkipModal(false); setSkipReason(''); setSkipNote('');
    toast(`Stop ${activeStop.stopNum} skipped.`, { icon: '⏭' });
    advanceToNext(updated, activeStop.id);
  };

  const handleReportIssue = () => {
    if (!issueType) { toast.error('Please select an issue type'); return; }
    setShowIssueModal(false); setIssueType(''); setIssueNote('');
    toast('Issue reported to dispatch.', { icon: '\u26A0\uFE0F' });
  };

  const handleUpdateEta = () => {
    if (!etaMinutes || isNaN(etaMinutes)) { toast.error('Enter valid minutes'); return; }
    toast.success(`ETA updated: ${etaMinutes} min`); setEtaMinutes('');
  };

  // =========================================================================
  // ACCEPT / REJECT ORDER HANDLERS
  // =========================================================================
  const handleAcceptOrder = async (stop, e) => {
    e?.stopPropagation();
    const orderId = stop.orderId || stop.id;
    localAcceptedRef.current.add(String(orderId));
    try {
      await ordersAPI.acceptOrder(orderId);
      const updated = stops.map(s => s.id === stop.id ? { ...s, status: 'accepted_by_driver', accepted: true } : s);
      setStops(updated);
      toast.success(`Order ${orderId} accepted!`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to accept order');
      localAcceptedRef.current.delete(String(orderId));
    }
  };

  const openRejectModal = (stop, e) => {
    e?.stopPropagation();
    setRejectOrderId(stop.orderId || stop.id);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleRejectOrder = async () => {
    if (!rejectReason) { toast.error('Please select a reason'); return; }
    if (!rejectOrderId) return;
    
    localRejectedRef.current.add(String(rejectOrderId));
    try {
      await ordersAPI.rejectOrder(rejectOrderId, rejectReason);
      const updated = stops.map(s => (s.orderId || s.id) === rejectOrderId ? { ...s, status: 'rejected_by_driver', rejected: true } : s);
      setStops(updated);
      setShowRejectModal(false);
      setRejectReason('');
      setRejectOrderId(null);
      toast(`Order ${rejectOrderId} rejected.`, { icon: '❌' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject order');
      localRejectedRef.current.delete(String(rejectOrderId));
    }
  };

  const openView = (stop, e) => { e?.stopPropagation(); setViewStop(stop); setShowViewModal(true); };

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Route</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? 'Loading\u2026' : `${completedCount} of ${filteredStops.length} delivered \u00B7 ${skippedCount} skipped`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchRoute} disabled={loading}>Refresh</Button>
          <Button variant="outline" size="sm" icon={AlertTriangle} onClick={() => setShowIssueModal(true)} className="border-orange-300 text-orange-600">Report Issue</Button>
        </div>
      </div>

      {/* ── Date tabs ──────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap items-center">
        {[
          { key:'today',    label:'Today',    icon:'\uD83D\uDCC5' },
          { key:'tomorrow', label:'Tomorrow', icon:'\uD83D\uDCC6' },
          { key:'others',   label:'Others',   icon:'\uD83D\uDDD3\uFE0F' },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => {
              setDateFilter(tab.key);
              const td2=todayStr(), tm2=tomorrowStr();
              const g = stops.filter(s => tab.key==='today'?s.deliveryDate===td2:tab.key==='tomorrow'?s.deliveryDate===tm2:s.deliveryDate!==td2&&s.deliveryDate!==tm2);
              const f = g.find(s=>!s.completed&&!s.skipped)||g[0];
              setActiveStopId(f?.id||null); setStopPhase(null); setStatusFilter('all');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
              dateFilter===tab.key
                ? 'bg-primary-500 border-primary-500 text-white shadow-md'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:border-primary-300'
            }`}>
            <span>{tab.icon}</span>
            {tab.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${dateFilter===tab.key?'bg-white/20 text-white':'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>
              {tabCounts[tab.key]}
            </span>
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>filtered by delivery date</span>
      </div>

      {/* ── States ─────────────────────────────────────────── */}
      {loading && (
        <Card><div className="flex flex-col items-center justify-center py-14">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Loading your route\u2026</p>
        </div></Card>
      )}
      {!loading && error && (
        <Card><div className="flex flex-col items-center justify-center py-14">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-gray-700 dark:text-gray-300 font-semibold mb-4">{error}</p>
          <Button icon={RefreshCw} onClick={fetchRoute}>Try Again</Button>
        </div></Card>
      )}
      {!loading && !error && stops.length === 0 && (
        <Card><div className="flex flex-col items-center justify-center py-14">
          <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">No deliveries assigned</h3>
          <Button icon={RefreshCw} onClick={fetchRoute}>Refresh</Button>
        </div></Card>
      )}
      {!loading && !error && stops.length>0 && filteredStops.length===0 && (
        <Card><div className="flex flex-col items-center justify-center py-14">
          <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            No deliveries for {dateFilter==='today'?'today':dateFilter==='tomorrow'?'tomorrow':'other dates'}
          </h3>
        </div></Card>
      )}

      {!loading && !error && filteredStops.length > 0 && (
        <div className="space-y-5">

          {/* ── Progress ─────────────────────────────────── */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Route Progress</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {completedCount} completed \u00B7 {filteredStops.length-completedCount-skippedCount} remaining
                  {skippedCount>0&&` \u00B7 ${skippedCount} skipped`}
                </p>
              </div>
              <span className="text-3xl font-extrabold text-primary-600 dark:text-primary-400 tabular-nums">{progress}%</span>
            </div>
            <div className="relative w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full bg-primary-500 transition-all duration-700" style={{width:`${progress}%`}}/>
            </div>
            <div className="flex items-center gap-6 mt-4 text-xs font-medium">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"/><span className="text-gray-500">{completedCount} done</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary-400 inline-block"/><span className="text-gray-500">{filteredStops.length-completedCount-skippedCount} pending</span></span>
              {skippedCount>0&&<span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block"/><span className="text-gray-500">{skippedCount} skipped</span></span>}
            </div>
          </Card>

          {/* ── Filter pills ────────────────────────────── */}
          <div className="flex gap-2 flex-wrap">
            {[
              {key:'all',       label:'All Stops'},
              {key:'pending',   label:'Pending'},
              {key:'completed', label:'Delivered'},
              {key:'skipped',   label:'Skipped'},
            ].map(f => (
              <button key={f.key} onClick={()=>setStatusFilter(f.key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  statusFilter===f.key
                    ? f.key==='completed'?'bg-green-500 border-green-500 text-white shadow-sm'
                      :f.key==='skipped'?'bg-orange-500 border-orange-500 text-white shadow-sm'
                      :f.key==='pending'?'bg-blue-500 border-blue-500 text-white shadow-sm'
                      :'bg-gray-800 border-gray-800 text-white shadow-sm'
                    :'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:border-gray-400'
                }`}>
                {f.key==='completed'&&<CheckCircle className="w-3 h-3"/>}
                {f.key==='skipped'  &&<SkipForward  className="w-3 h-3"/>}
                {f.key==='pending'  &&<Circle       className="w-3 h-3"/>}
                {f.label}
                <span className={`ml-0.5 min-w-4 text-center rounded-full px-1 ${statusFilter===f.key?'bg-white/25':'bg-gray-100 dark:bg-slate-700 text-gray-500'}`}>
                  {statusCounts[f.key]}
                </span>
              </button>
            ))}
          </div>

          {/* ── Stop list ─────────────────────────────────── */}
          {visibleStops.length===0 ? (
            <div className="py-10 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600 opacity-60"/>
              <p className="text-sm text-gray-400">
                {statusFilter==='completed'?'No delivered stops yet':statusFilter==='skipped'?'No skipped stops':'No pending stops'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleStops.map((stop, idx) => {
                const meta      = getMeta(stop.status);
                const isActive  = stop.id === activeStopId;
                const isDone    = stop.completed;
                const isSkipped = stop.skipped;
                return (
                  <div key={stop.id}
                    className={`group relative rounded-2xl border transition-all duration-200 overflow-hidden ${
                      isDone    ? 'border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-900/10'
                      : isSkipped ? 'border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/60 opacity-60'
                      : isActive  ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10 ring-2 ring-primary-200 dark:ring-primary-800/50'
                      : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-sm'
                    }`}>

                    {/* Left accent bar */}
                    <div className={`absolute inset-y-0 left-0 w-1 rounded-l-2xl ${
                      isDone?'bg-green-500':isSkipped?'bg-gray-300 dark:bg-slate-600':isActive?'bg-primary-500':'bg-gray-200 dark:bg-slate-700 group-hover:bg-gray-300'
                    }`}/>

                    <div className="pl-5 pr-4 py-4 flex items-start gap-4">

                      {/* Stop number badge */}
                      <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold mt-0.5 ${
                        isDone    ? 'bg-green-500 text-white'
                        : isSkipped ? 'bg-gray-300 dark:bg-slate-600 text-gray-500'
                        : isActive  ? 'bg-primary-500 text-white shadow-md shadow-primary-200 dark:shadow-primary-900'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {isDone ? <CheckCircle className="w-4 h-4"/> : stop.stopNum}
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        {/* Order number label */}
                        <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1">
                          <Hash className="w-2.5 h-2.5"/>Order {stop.orderId}
                        </p>
                        {/* Row 1: recipient + badges */}
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="min-w-0">
                            <p className={`font-bold text-sm truncate ${isDone||isSkipped?'text-gray-400 dark:text-gray-500':'text-gray-900 dark:text-white'}`}>
                              {stop.recipient}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                              <MapPin className="w-3 h-3 text-red-400 shrink-0"/>{stop.address}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isDone    && <span className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3"/>Delivered</span>}
                            {isSkipped && <span className="flex items-center gap-1 text-xs font-bold text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full"><SkipForward className="w-3 h-3"/>Skipped</span>}
                            {!isDone && !isSkipped && isActive && <span className="flex items-center gap-1 text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 px-2 py-0.5 rounded-full">Active</span>}
                            <Badge variant={priorityVariant(stop.priority)} className="text-xs">{priorityLabel(stop.priority)}</Badge>
                          </div>
                        </div>

                        {/* Row 2: meta chips */}
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2">
                          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <Clock className="w-3 h-3 text-primary-400"/>{stop.timeSlot}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 capitalize">
                            <Package className="w-3 h-3 text-blue-400"/>{stop.packageType?.replace(/_/g,' ')}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <Calendar className="w-3 h-3 text-teal-400"/>{friendlyDate(stop.createdAt)}
                          </span>
                          {/* status dot */}
                          <span className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}/>
                            {meta.label}
                          </span>
                          {/* Distance + ETA from University of Colombo (pending only) */}
                          {!isDone && !isSkipped && distanceMap[stop.address]?.loading && (
                            <span className="flex items-center gap-1 text-xs text-gray-300 dark:text-gray-600">
                              <Loader2 className="w-3 h-3 animate-spin text-indigo-300"/>Calculating…
                            </span>
                          )}
                          {!isDone && !isSkipped && distanceMap[stop.address]?.km && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800/40">
                              <Navigation className="w-3 h-3"/>{distanceMap[stop.address].km} km
                              <span className="text-indigo-300 dark:text-indigo-600">·</span>
                              <Clock className="w-3 h-3"/>~{distanceMap[stop.address].mins} min
                            </span>
                          )}
                        </div>

                        {/* Row 3: actions */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60">
                          <button onClick={(e)=>openView(stop,e)}
                            className="flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all">
                            <Eye className="w-3.5 h-3.5"/> View Details
                          </button>
                          
                          {/* Accept/Reject buttons for pending orders (in_warehouse, confirmed, pending) */}
                          {!isDone && !isSkipped && !stop.rejected && !stop.accepted && 
                           (stop.status === 'in_warehouse' || stop.status === 'confirmed' || stop.status === 'pending') && (
                            <div className="ml-auto flex items-center gap-2">
                              <button onClick={(e) => handleAcceptOrder(stop, e)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-green-500 hover:bg-green-600 active:scale-95 shadow-sm shadow-green-200 dark:shadow-green-900/40 transition-all">
                                <ThumbsUp className="w-3.5 h-3.5"/>
                                Accept
                              </button>
                              <button onClick={(e) => openRejectModal(stop, e)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 shadow-sm shadow-red-200 dark:shadow-red-900/40 transition-all">
                                <ThumbsDown className="w-3.5 h-3.5"/>
                                Reject
                              </button>
                            </div>
                          )}
                          
                          {/* Rejected status indicator */}
                          {stop.rejected && (
                            <span className="ml-auto flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded-full">
                              <ThumbsDown className="w-3 h-3"/>Rejected
                            </span>
                          )}
                          
                          {/* Start delivery button for accepted orders */}
                          {!isDone && !isSkipped && !stop.rejected && (stop.accepted || stop.status === 'accepted_by_driver') && (
                            isActive && stopPhase === 'navigating' ? (
                              <button onClick={(e) => { e.stopPropagation(); setStopPhase('action'); setShowDeliveryModal(true); }}
                                className="ml-auto flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-green-500 hover:bg-green-600 active:scale-95 shadow-sm shadow-green-200 dark:shadow-green-900/40 transition-all">
                                <Flag className="w-3.5 h-3.5"/>
                                I&apos;m Arrived
                              </button>
                            ) : (
                              <button onClick={(e)=>handleStart(stop,e)}
                                className="ml-auto flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-primary-500 hover:bg-primary-600 active:scale-95 shadow-sm shadow-primary-200 dark:shadow-primary-900/40 transition-all">
                                <Navigation className="w-3.5 h-3.5"/>
                                {isActive && stopPhase ? 'Resume' : 'Start Delivery'}
                              </button>
                            )
                          )}
                          
                          {/* Start delivery for out_for_delivery status */}
                          {!isDone && !isSkipped && !stop.rejected && stop.status === 'out_for_delivery' && (
                            isActive && stopPhase === 'navigating' ? (
                              <button onClick={(e) => { e.stopPropagation(); setStopPhase('action'); setShowDeliveryModal(true); }}
                                className="ml-auto flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-green-500 hover:bg-green-600 active:scale-95 shadow-sm shadow-green-200 dark:shadow-green-900/40 transition-all">
                                <Flag className="w-3.5 h-3.5"/>
                                I&apos;m Arrived
                              </button>
                            ) : (
                              <button onClick={(e)=>handleStart(stop,e)}
                                className="ml-auto flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-primary-500 hover:bg-primary-600 active:scale-95 shadow-sm shadow-primary-200 dark:shadow-primary-900/40 transition-all">
                                <Navigation className="w-3.5 h-3.5"/>
                                {isActive && stopPhase ? 'Resume' : 'Continue Delivery'}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          DELIVERY MODAL — phase-based popup
      ═══════════════════════════════════════════════════════ */}
      {showDeliveryModal && activeStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeDeliveryModal}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
          <div
            className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-5 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center text-white text-sm font-extrabold shadow-sm">
                    {activeStop.stopNum}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight">{activeStop.recipient}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant={priorityVariant(activeStop.priority)} className="text-xs">{priorityLabel(activeStop.priority)}</Badge>
                      <Badge variant="primary" className="text-xs capitalize">{activeStop.status?.replace(/_/g,' ')}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>toast.success('Calling recipient\u2026')}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                    <Phone className="w-3.5 h-3.5"/> Call
                  </button>
                  <button onClick={closeDeliveryModal}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                    <X className="w-4 h-4"/>
                  </button>
                </div>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-2 mt-4">
                {[
                  { key:'started',    label:'Started',    icon:<CheckCircle className="w-3 h-3"/> },
                  { key:'navigating', label:'Navigate',   icon:<Navigation  className="w-3 h-3"/> },
                  { key:'action',     label:'Arrived',    icon:<Flag        className="w-3 h-3"/> },
                ].map((step, i, arr) => {
                  const phases  = ['started','navigating','action'];
                  const current = phases.indexOf(stopPhase);
                  const mine    = phases.indexOf(step.key);
                  const done    = mine < current;
                  const active  = mine === current;
                  return (
                    <div key={step.key} className="flex items-center gap-2 flex-1">
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                        active ? step.key==='action'?'bg-orange-500 text-white':step.key==='navigating'?'bg-blue-500 text-white':'bg-primary-500 text-white'
                        : done  ? 'bg-green-500 text-white'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-400'
                      }`}>
                        {step.icon} {step.label}
                      </div>
                      {i < arr.length-1 && <div className={`flex-1 h-px ${done?'bg-green-400':'bg-gray-200 dark:bg-slate-700'}`}/>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4">

              {/* PHASE: started / navigating */}
              {(stopPhase==='started' || stopPhase==='navigating') && (
                <>
                  {/* Map */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
                    <iframe title="map" src={mapsEmbed(activeStop.address)}
                      className="w-full h-52 border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade"/>
                    <div className="px-4 py-3 bg-white dark:bg-slate-800">
                      <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><MapPin className="w-3 h-3 text-red-500"/>Delivery address</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{activeStop.address}</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3 text-green-500"/>Pickup: {activeStop.pickupAddress}</p>
                    </div>
                  </div>

                  {/* Info tiles */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon:<Clock   className="w-4 h-4 text-primary-500"/>, label:'Time Slot',    value:activeStop.timeSlot },
                      { icon:<Package className="w-4 h-4 text-blue-500"/>,    label:'Package',      value:activeStop.packageType?.replace(/_/g,' ') },
                      { icon:<Calendar className="w-4 h-4 text-teal-500"/>,   label:'Est. Delivery',value:friendlyDate(activeStop.estimatedDelivery) },
                    ].map(t => (
                      <div key={t.label} className="p-3 rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-center">
                        <div className="flex justify-center mb-1">{t.icon}</div>
                        <p className="text-xs text-gray-400 mb-0.5">{t.label}</p>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 capitalize leading-tight">{t.value}</p>
                      </div>
                    ))}
                  </div>

                  {stopPhase==='started' ? (
                    <button onClick={handleNavigate}
                      className="w-full flex items-center justify-center gap-3 py-4 bg-primary-500 hover:bg-primary-600 active:scale-[0.98] text-white font-bold text-base rounded-xl transition-all shadow-md shadow-primary-200 dark:shadow-primary-900/50">
                      <Navigation className="w-5 h-5"/> Navigate to Stop <ExternalLink className="w-4 h-4 opacity-70"/>
                    </button>
                  ) : (
                    <button onClick={handleArrived}
                      className="w-full flex items-center justify-center gap-3 py-4 bg-green-500 hover:bg-green-600 active:scale-[0.98] text-white font-bold text-base rounded-xl transition-all shadow-md shadow-green-200 dark:shadow-green-900/50">
                      <Flag className="w-5 h-5"/> I&apos;m Arrived
                    </button>
                  )}
                </>
              )}

              {/* PHASE: action */}
              {stopPhase==='action' && (
                <>
                  {/* Arrived banner */}
                  <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                      <Flag className="w-4 h-4 text-orange-500"/>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-orange-800 dark:text-orange-200">You have arrived</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 truncate">{activeStop.address}</p>
                    </div>
                  </div>

                  {/* Special instructions */}
                  <div className="rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/10 border-b border-yellow-100 dark:border-yellow-900/30">
                      <StickyNote className="w-4 h-4 text-yellow-500"/>
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Special Instructions</span>
                    </div>
                    <div className="px-4 py-3 bg-white dark:bg-slate-800">
                      {activeStop.stopNote ? (
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{activeStop.stopNote}</p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No instructions for this stop.</p>
                      )}
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Driver note (optional)</label>
                        <textarea
                          value={activeStop.driverNote||''}
                          onChange={e=>setStops(prev=>prev.map(s=>s.id===activeStop.id?{...s,driverNote:e.target.value}:s))}
                          placeholder="e.g. Gate code 1234, leave at door\u2026"
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                          rows={2}/>
                      </div>
                    </div>
                  </div>

                  {/* Waiting timer */}
                  <div className="rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-slate-800/80 border-b border-gray-100 dark:border-slate-700">
                      <Timer className="w-4 h-4 text-primary-500"/>
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Waiting Timer</span>
                    </div>
                    <div className="px-4 py-3 bg-white dark:bg-slate-800">
                      <div className="flex items-center justify-between">
                        <span className={`font-mono text-3xl font-extrabold tabular-nums tracking-tight ${waitRunning?'text-primary-600 dark:text-primary-400':'text-gray-700 dark:text-gray-300'}`}>
                          {fmtWait(waitSeconds)}
                        </span>
                        <div className="flex items-center gap-2">
                          {!waitRunning ? (
                            <button onClick={startWait} className="w-10 h-10 rounded-xl bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors shadow-sm">
                              <Play className="w-4 h-4"/>
                            </button>
                          ) : (
                            <button onClick={stopWait} className="w-10 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm">
                              <Square className="w-4 h-4"/>
                            </button>
                          )}
                          <button onClick={resetWait} className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-500 flex items-center justify-center transition-colors">
                            <RefreshCw className="w-4 h-4"/>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
                        <Clock className="w-4 h-4 text-gray-400 shrink-0"/>
                        <input type="number" value={etaMinutes} onChange={e=>setEtaMinutes(e.target.value)}
                          placeholder="ETA to next stop (min)"
                          className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-primary-500"/>
                        <button onClick={handleUpdateEta} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                          Update ETA
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button onClick={handleCompleteStop}
                      className="flex flex-col items-center justify-center gap-2 p-5 bg-green-500 hover:bg-green-600 active:scale-95 text-white rounded-2xl transition-all shadow-md shadow-green-200 dark:shadow-green-900/40">
                      <CheckCircle className="w-7 h-7"/>
                      <span className="text-sm font-bold">Mark Delivered</span>
                      <span className="text-xs opacity-80">Package handed over</span>
                    </button>
                    <button onClick={()=>setShowSkipModal(true)}
                      className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-orange-300 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 active:scale-95 text-orange-600 dark:text-orange-400 rounded-2xl transition-all bg-white dark:bg-slate-800">
                      <SkipForward className="w-7 h-7"/>
                      <span className="text-sm font-bold">Skip Stop</span>
                      <span className="text-xs opacity-70">Unable to deliver</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── View details modal ─────────────────────────── */}
      <Modal isOpen={showViewModal} onClose={()=>setShowViewModal(false)} title="Order Details" size="md">
        {viewStop && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-xl">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-primary-500"/>
                <span className="font-bold text-gray-900 dark:text-white">#{viewStop.orderId}</span>
              </div>
              <Badge variant={viewStop.status==='delivered'?'success':viewStop.status==='confirmed'?'primary':viewStop.status==='in_warehouse'?'warning':viewStop.status==='out_for_delivery'?'info':'secondary'} className="capitalize">
                {viewStop.status?.replace(/_/g,' ')}
              </Badge>
            </div>
            <div className="grid gap-3">
              <DetailRow icon={<MapPin   className="w-4 h-4 text-green-500"/>}  label="Pickup Address"   value={viewStop.pickupAddress}/>
              <DetailRow icon={<MapPin   className="w-4 h-4 text-red-500"/>}    label="Delivery Address" value={viewStop.address}/>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow icon={<Package className="w-4 h-4 text-blue-500"/>}  label="Package Type" value={viewStop.packageType?.replace(/_/g,' ')}/>
                <DetailRow icon={<Truck   className="w-4 h-4 text-orange-500"/>} label="Priority"    value={priorityLabel(viewStop.priority)}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow icon={<Calendar className="w-4 h-4 text-teal-500"/>}   label="Order Date"    value={friendlyDate(viewStop.createdAt)}/>
                <DetailRow icon={<Clock    className="w-4 h-4 text-yellow-500"/>} label="Est. Delivery" value={friendlyDate(viewStop.estimatedDelivery)}/>
              </div>
              {viewStop.stopNote && <DetailRow icon={<FileText className="w-4 h-4 text-gray-500"/>} label="Special Instructions" value={viewStop.stopNote}/>}
            </div>
            <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
              <Button fullWidth variant="outline" onClick={()=>setShowViewModal(false)}>Close</Button>
              {!viewStop.completed && !viewStop.skipped && (
                <Button fullWidth icon={Navigation} onClick={()=>{ setShowViewModal(false); handleStart(viewStop); }}>
                  Start Delivery
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Skip modal ─────────────────────────────────── */}
      <Modal isOpen={showSkipModal} onClose={()=>setShowSkipModal(false)} title="Skip Stop" size="md">
        <div className="space-y-4">
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
            <p className="font-semibold text-orange-800 dark:text-orange-200">Stop {activeStop?.stopNum} \u2014 {activeStop?.recipient}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Reason *</p>
            <div className="space-y-2">
              {skipReasons.map(r => (
                <label key={r} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${skipReason===r?'border-orange-400 bg-orange-50 dark:bg-orange-900/20':'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                  <input type="radio" name="skipReason" value={r} checked={skipReason===r} onChange={()=>setSkipReason(r)} className="w-4 h-4 accent-orange-500"/>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{r}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional notes</label>
            <textarea value={skipNote} onChange={e=>setSkipNote(e.target.value)} placeholder="Optional\u2026"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 resize-none" rows={2}/>
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={()=>setShowSkipModal(false)}>Cancel</Button>
            <Button fullWidth icon={SkipForward} onClick={handleSkipStop} className="bg-orange-500 hover:bg-orange-600 text-white">Skip Stop</Button>
          </div>
        </div>
      </Modal>

      {/* ── Report issue modal ─────────────────────────── */}
      <Modal isOpen={showIssueModal} onClose={()=>setShowIssueModal(false)} title="Report Route Issue" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Dispatch will be notified immediately.</p>
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Issue type *</p>
            <div className="space-y-2">
              {issueTypes.map(t => (
                <label key={t} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${issueType===t?'border-red-400 bg-red-50 dark:bg-red-900/20':'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                  <input type="radio" name="issueType" value={t} checked={issueType===t} onChange={()=>setIssueType(t)} className="w-4 h-4 accent-red-500"/>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Details</label>
            <textarea value={issueNote} onChange={e=>setIssueNote(e.target.value)} placeholder="Describe the issue\u2026"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-red-500 resize-none" rows={3}/>
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={()=>setShowIssueModal(false)}>Cancel</Button>
            <Button fullWidth icon={AlertTriangle} onClick={handleReportIssue} className="bg-red-500 hover:bg-red-600 text-white">Send Report</Button>
          </div>
        </div>
      </Modal>

      {/* ── Reject order modal ─────────────────────────── */}
      <Modal isOpen={showRejectModal} onClose={()=>setShowRejectModal(false)} title="Reject Order" size="md">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl">
            <ThumbsDown className="w-5 h-5 text-red-500"/>
            <div>
              <p className="text-sm font-bold text-red-800 dark:text-red-200">Rejecting Order {rejectOrderId}</p>
              <p className="text-xs text-red-600 dark:text-red-400">This order will be returned to the queue for reassignment.</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Reason for rejection *</p>
            <div className="space-y-2">
              {rejectReasons.map(r => (
                <label key={r} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${rejectReason===r?'border-red-400 bg-red-50 dark:bg-red-900/20':'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                  <input type="radio" name="rejectReason" value={r} checked={rejectReason===r} onChange={()=>setRejectReason(r)} className="w-4 h-4 accent-red-500"/>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{r}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={()=>setShowRejectModal(false)}>Cancel</Button>
            <Button fullWidth icon={ThumbsDown} onClick={handleRejectOrder} className="bg-red-500 hover:bg-red-600 text-white">Reject Order</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

const DetailRow = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-700/60 rounded-xl">
    <div className="shrink-0 mt-0.5">{icon}</div>
    <div className="min-w-0">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{value || '\u2014'}</p>
    </div>
  </div>
);

export default Route;
