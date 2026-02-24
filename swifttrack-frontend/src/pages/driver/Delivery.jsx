import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Package, CheckCircle, XCircle, Camera, Pen, MapPin, Phone, User,
  Clock, AlertTriangle, ChevronRight, Navigation, Circle, Star,
  FileText, RefreshCw, Wifi, WifiOff, Upload,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { ordersAPI, driverAPI, wsService } from '../../services/api';
import toast from 'react-hot-toast';

const STEPS = ['Pickup', 'In Transit', 'Delivered'];

const Delivery = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [showDeliveredModal, setShowDeliveredModal] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [photoData, setPhotoData] = useState(null);
  const [recipientName, setRecipientName] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [failReason, setFailReason] = useState('');
  const [failNotes, setFailNotes] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef(null);
  const signatureCanvasRef = useRef(null);
  const isDrawing = useRef(false);

  const selectedOrder = orders.find(o => o.id === selectedId) || orders[0];

  const failReasons = [
    'Customer not home',
    'Wrong address',
    'Access denied / gate locked',
    'Package refused by recipient',
    'Damaged package',
    'Other',
  ];

  // Fetch orders assigned to this driver
  const fetchOrders = async () => {
    try {
      const response = await driverAPI.getAssignments(user?.id);
      const driverOrders = response.data || [];
      setOrders(driverOrders);
      if (driverOrders.length > 0 && !selectedId) {
        setSelectedId(driverOrders[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      toast.error('Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  };

  // Handle new assignment notification
  const handleNewAssignment = useCallback((data) => {
    toast.success(`New delivery assigned: ${data.orderId}`);
    fetchOrders();
  }, []);

  // Set up WebSocket
  useEffect(() => {
    wsService.connect();
    setWsConnected(wsService.socket?.connected || false);
    
    const unsubAssignment = wsService.on('new_assignment', handleNewAssignment);
    
    // Send driver location periodically when on active delivery
    let locationInterval;
    if (selectedOrder && selectedOrder.status === 'out_for_delivery') {
      locationInterval = setInterval(() => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((pos) => {
            wsService.updateDriverLocation(pos.coords.latitude, pos.coords.longitude, selectedOrder.id);
          });
        }
      }, 30000);
    }
    
    return () => {
      unsubAssignment();
      if (locationInterval) clearInterval(locationInterval);
    };
  }, [selectedOrder, handleNewAssignment]);

  useEffect(() => { fetchOrders(); }, [user?.id]);

  const getOrderStatus = (order) => {
    return order?.status || 'pending';
  };

  const statusBadge = (st) => {
    const v = { pending: 'warning', confirmed: 'warning', in_warehouse: 'warning', out_for_delivery: 'primary', delivered: 'success', failed: 'danger' };
    const l = { confirmed: 'Pending', in_warehouse: 'Pending' };
    return <Badge variant={v[st] || 'default'}>{l[st] || st?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>;
  };

  const handlePickupConfirm = async () => {
    try {
      await ordersAPI.updateStatus(selectedId, 'out_for_delivery');
      setOrders(prev => prev.map(o => o.id === selectedId ? { ...o, status: 'out_for_delivery' } : o));
      setStepIndex(1);
      setShowPickupModal(false);
      setPickupNotes('');
      toast.success('Pickup confirmed — en route to delivery!');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  // Handle photo capture
  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoData(reader.result);
        toast.success('Photo captured!');
      };
      reader.readAsDataURL(file);
    }
  };

  // Signature canvas handlers
  const initSignatureCanvas = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  };

  const startDrawing = (e) => {
    isDrawing.current = true;
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    const canvas = signatureCanvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    setSignatureData(null);
    initSignatureCanvas();
  };

  const handleDeliveryConfirm = async () => {
    if (!photoData && !signatureData) {
      toast.error('Please capture at least one proof of delivery');
      return;
    }

    setUploading(true);
    try {
      // Upload delivery proof
      const proofData = {
        proofType: photoData ? 'photo' : 'signature',
        proofData: photoData || signatureData,
        recipientName: recipientName || 'Unknown',
        notes: deliveryNotes,
      };
      await ordersAPI.uploadProof(selectedId, proofData);
      
      // Mark as delivered
      await ordersAPI.markDelivered(selectedId, { notes: deliveryNotes });
      
      setOrders(prev => prev.map(o => o.id === selectedId ? { ...o, status: 'delivered' } : o));
      setShowDeliveredModal(false);
      resetDeliveryForm();
      
      // Move to next pending order
      const next = orders.find(o => o.id !== selectedId && o.status !== 'delivered' && o.status !== 'failed');
      if (next) {
        setSelectedId(next.id);
        setStepIndex(0);
      }
      
      toast.success('Delivery confirmed successfully!');
    } catch (error) {
      toast.error('Failed to confirm delivery');
    } finally {
      setUploading(false);
    }
  };

  const handleFailConfirm = async () => {
    if (!failReason) {
      toast.error('Please select a failure reason');
      return;
    }
    
    try {
      await ordersAPI.markFailed(selectedId, { reason: failReason, notes: failNotes });
      setOrders(prev => prev.map(o => o.id === selectedId ? { ...o, status: 'failed' } : o));
      setShowFailedModal(false);
      setFailReason('');
      setFailNotes('');
      
      const next = orders.find(o => o.id !== selectedId && o.status !== 'delivered' && o.status !== 'failed');
      if (next) {
        setSelectedId(next.id);
        setStepIndex(0);
      }
      
      toast.error('Delivery marked as failed.');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const resetDeliveryForm = () => {
    setDeliveryNotes('');
    setPhotoData(null);
    setSignatureData(null);
    setRecipientName('');
    setStepIndex(0);
  };

  const priorityVariant = { urgent: 'danger', high: 'warning', normal: 'default' };
  const pendingCount = orders.filter(o => o.status !== 'delivered' && o.status !== 'failed').length;
  const completedCount = orders.filter(o => o.status === 'delivered').length;
  const failedCount = orders.filter(o => o.status === 'failed').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Active Delivery</h1>
            {wsConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-600"><Wifi className="w-3 h-3" />Live</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-400"><WifiOff className="w-3 h-3" />Offline</span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {completedCount} completed · {failedCount} failed · {pendingCount} pending
          </p>
        </div>
        <Button icon={RefreshCw} variant="outline" size="sm" onClick={fetchOrders}>Refresh</Button>
      </div>

      {orders.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No Active Deliveries</h3>
            <p className="text-gray-500 mt-2">You don't have any assigned deliveries yet.</p>
          </div>
        </Card>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Queue */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Delivery Queue</h2>
          {orders.map(order => {
            const st = getOrderStatus(order);
            const isActive = order.id === selectedId;
            const isDone = order.status === 'delivered' || order.status === 'failed';
            return (
              <button
                key={order.id}
                onClick={() => { if (!isDone) { setSelectedId(order.id); setStepIndex(st === 'out_for_delivery' ? 1 : 0); } }}
                disabled={isDone}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' :
                  isDone ? 'border-gray-200 dark:border-slate-700 opacity-50 cursor-not-allowed bg-gray-50 dark:bg-slate-800' :
                  'border-gray-200 dark:border-slate-700 hover:border-primary-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-primary-600 dark:text-primary-400">{order.id}</span>
                      <Badge variant={priorityVariant[order.priority] || 'default'} className="text-xs">{order.priority || 'normal'}</Badge>
                    </div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white mt-0.5 truncate">{order.customerName || order.customer}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{order.deliveryAddress || order.address}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {statusBadge(st)}
                    {isActive && !isDone && <ChevronRight className="w-4 h-4 text-primary-500" />}
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <Clock className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-400">{order.timeSlot || order.estimatedDelivery}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Order Detail */}
        <div className="lg:col-span-2 space-y-5">
          {/* Progress Steps */}
          <Card>
            <div className="flex items-center justify-between px-2">
              {STEPS.map((step, i) => (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                      i < stepIndex ? 'bg-green-500 text-white' :
                      i === stepIndex ? 'bg-primary-500 text-white ring-4 ring-primary-100 dark:ring-primary-900' :
                      'bg-gray-200 dark:bg-slate-600 text-gray-500'
                    }`}>
                      {i < stepIndex ? <CheckCircle className="w-5 h-5" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${i === stepIndex ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500'}`}>{step}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 rounded-full transition-all ${i < stepIndex ? 'bg-green-500' : 'bg-gray-200 dark:bg-slate-600'}`} />
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Order Info */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary-500" />
                  Order {selectedOrder?.id}
                </span>
              </CardTitle>
              {statusBadge(getOrderStatus(selectedOrder))}
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <User className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Customer</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{selectedOrder?.customerName || selectedOrder?.customer}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <Phone className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Phone</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{selectedOrder?.phone || selectedOrder?.customerPhone || '+1 (555) 000-1234'}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <MapPin className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Address</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{selectedOrder?.deliveryAddress || selectedOrder?.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <Clock className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Time Slot</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{selectedOrder?.timeSlot || selectedOrder?.estimatedDelivery || 'ASAP'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Package details */}
            <div className="mt-4 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
              <p className="text-xs font-semibold text-primary-700 dark:text-primary-300 uppercase tracking-wide mb-2">Package Details</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-gray-500">Type:</span><p className="font-medium text-gray-900 dark:text-white">{selectedOrder?.packageType || 'Standard Box'}</p></div>
                <div><span className="text-gray-500">Weight:</span><p className="font-medium text-gray-900 dark:text-white">{selectedOrder?.packageWeight || selectedOrder?.weight || '2.3'} kg</p></div>
                <div><span className="text-gray-500">Items:</span><p className="font-medium text-gray-900 dark:text-white">{selectedOrder?.items || '1 item'}</p></div>
              </div>
            </div>

            {(selectedOrder?.instructions || selectedOrder?.deliveryInstructions) && (
              <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">{selectedOrder.instructions || selectedOrder.deliveryInstructions}</p>
              </div>
            )}
          </Card>

          {/* Map Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>Navigation</CardTitle>
              <Button size="sm" icon={Navigation} onClick={() => toast.success('Opening maps…')}>Open Maps</Button>
            </CardHeader>
            <div className="h-40 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-700 dark:to-slate-600 rounded-xl flex items-center justify-center">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <MapPin className="w-10 h-10 mx-auto mb-2 text-primary-400" />
                <p className="text-sm font-medium">{selectedOrder?.address}</p>
                <p className="text-xs mt-1">Estimated: 12 min away</p>
              </div>
            </div>
          </Card>

          {/* Delivery Notes */}
          <Card>
            <CardHeader><CardTitle>Delivery Notes</CardTitle></CardHeader>
            <textarea
              value={deliveryNotes}
              onChange={e => setDeliveryNotes(e.target.value)}
              placeholder="Add any notes about this delivery (e.g. left with concierge, door code 1234)…"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 resize-none text-sm"
              rows={3}
            />
          </Card>

          {/* Action Buttons */}
          {selectedOrder?.status !== 'delivered' && selectedOrder?.status !== 'failed' && (
            <div className="flex gap-3">
              {stepIndex === 0 ? (
                <Button fullWidth icon={Package} onClick={() => setShowPickupModal(true)}
                  className="bg-gradient-to-r from-blue-500 to-primary-500 text-white">
                  Confirm Pickup
                </Button>
              ) : (
                <>
                  <Button fullWidth icon={CheckCircle} onClick={() => setShowDeliveredModal(true)}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">
                    Mark as Delivered
                  </Button>
                  <Button fullWidth icon={XCircle} variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => setShowFailedModal(true)}>
                    Mark as Failed
                  </Button>
                </>
              )}
            </div>
          )}

          {(selectedOrder?.status === 'delivered' || selectedOrder?.status === 'failed') && (
            <div className={`p-4 rounded-xl text-center ${selectedOrder?.status === 'delivered' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              {selectedOrder?.status === 'delivered' ? (
                <p className="font-semibold text-green-700 dark:text-green-300 flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" /> Delivery completed successfully!</p>
              ) : (
                <p className="font-semibold text-red-700 dark:text-red-300 flex items-center justify-center gap-2"><XCircle className="w-5 h-5" /> Delivery was marked as failed.</p>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Pickup Confirmation Modal */}
      <Modal isOpen={showPickupModal} onClose={() => setShowPickupModal(false)} title="Confirm Package Pickup" size="md">
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Order {selectedOrder?.id}</p>
            <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">{selectedOrder?.customer} — {selectedOrder?.address}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Before confirming pickup, verify:</p>
            {['Package label matches order ID', 'Package is undamaged', 'All items are present'].map((item, i) => (
              <label key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600">
                <input type="checkbox" className="w-4 h-4 accent-primary-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pickup Notes</label>
            <textarea value={pickupNotes} onChange={e => setPickupNotes(e.target.value)} placeholder="Any notes about package condition…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 resize-none text-sm" rows={2} />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowPickupModal(false)}>Cancel</Button>
            <Button fullWidth icon={Package} onClick={handlePickupConfirm}>Confirm Pickup</Button>
          </div>
        </div>
      </Modal>

      {/* Delivery Confirmation Modal */}
      <Modal isOpen={showDeliveredModal} onClose={() => setShowDeliveredModal(false)} title="Confirm Delivery" size="md">
        <div className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
            <p className="text-sm font-semibold text-green-800 dark:text-green-200">Order {selectedOrder?.id} — {selectedOrder?.customerName || selectedOrder?.customer}</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">{selectedOrder?.deliveryAddress || selectedOrder?.address}</p>
          </div>

          {/* Recipient Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recipient Name</label>
            <input
              type="text"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              placeholder="Name of person receiving package"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Proof of Delivery *</p>

          <div className="grid grid-cols-2 gap-3">
            {/* Photo Capture */}
            <div className="flex flex-col">
              <input type="file" ref={photoInputRef} accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
              <button
                onClick={() => photoInputRef.current?.click()}
                className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-all ${photoData ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}
              >
                {photoData ? (
                  <img src={photoData} alt="Proof" className="w-16 h-16 object-cover rounded-lg" />
                ) : (
                  <Camera className="w-6 h-6 text-gray-400" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {photoData ? 'Photo Captured' : 'Take Photo'}
                </span>
                {photoData && <span className="text-xs text-green-600 font-medium flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Ready</span>}
              </button>
              {photoData && (
                <button onClick={() => setPhotoData(null)} className="text-xs text-red-500 mt-1">Remove</button>
              )}
            </div>

            {/* Signature Capture */}
            <div className="flex flex-col">
              <button
                onClick={() => {
                  if (!signatureData) {
                    setTimeout(initSignatureCanvas, 100);
                  }
                }}
                className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-all ${signatureData ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}
              >
                {signatureData ? (
                  <img src={signatureData} alt="Signature" className="w-16 h-12 object-contain" />
                ) : (
                  <Pen className="w-6 h-6 text-gray-400" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {signatureData ? 'Signature Captured' : 'Get Signature'}
                </span>
                {signatureData && <span className="text-xs text-green-600 font-medium flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Ready</span>}
              </button>
              {signatureData && (
                <button onClick={clearSignature} className="text-xs text-red-500 mt-1">Clear</button>
              )}
            </div>
          </div>

          {/* Signature Canvas */}
          {!signatureData && (
            <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-2">
              <p className="text-xs text-gray-500 mb-2 text-center">Sign below:</p>
              <canvas
                ref={signatureCanvasRef}
                width={280}
                height={120}
                className="w-full bg-white rounded-lg cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <div className="flex justify-end mt-2">
                <button onClick={clearSignature} className="text-xs text-gray-500 hover:text-gray-700">Clear Signature</button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Notes</label>
            <textarea value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} placeholder="e.g. Left with building concierge, unit 4B…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 resize-none text-sm" rows={2} />
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowDeliveredModal(false)}>Cancel</Button>
            <Button 
              fullWidth 
              icon={uploading ? RefreshCw : CheckCircle} 
              onClick={handleDeliveryConfirm} 
              disabled={uploading || (!photoData && !signatureData)}
              className="bg-gradient-to-r from-green-500 to-emerald-500 text-white"
            >
              {uploading ? 'Uploading...' : 'Confirm Delivered'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Failed Modal */}
      <Modal isOpen={showFailedModal} onClose={() => setShowFailedModal(false)} title="Mark Delivery as Failed" size="md">
        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Order {selectedOrder?.id} — {selectedOrder?.customer}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Reason for failure *</p>
            <div className="space-y-2">
              {failReasons.map(reason => (
                <label key={reason} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${failReason === reason ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                  <input type="radio" name="failReason" value={reason} checked={failReason === reason} onChange={() => setFailReason(reason)} className="w-4 h-4 accent-red-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Details</label>
            <textarea value={failNotes} onChange={e => setFailNotes(e.target.value)} placeholder="Provide more context about the failure…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-red-500 resize-none text-sm" rows={3} />
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowFailedModal(false)}>Cancel</Button>
            <Button fullWidth icon={XCircle} onClick={handleFailConfirm} className="bg-red-500 hover:bg-red-600 text-white">Confirm Failed</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Delivery;
