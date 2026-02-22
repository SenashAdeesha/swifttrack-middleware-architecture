import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  MapPin, Package, Clock, Check, Truck, Phone, MessageCircle, RefreshCw, Share2,
  Copy, Navigation, User, Star, ChevronRight, HelpCircle, AlertTriangle, Edit2, Wifi, WifiOff
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal } from '../../components/common';
import { ordersAPI, wsService } from '../../services/api';
import toast from 'react-hot-toast';

const Tracking = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [supportIssue, setSupportIssue] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [instructions, setInstructions] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [driverLocation, setDriverLocation] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Handle real-time order status updates
  const handleStatusUpdate = useCallback((data) => {
    if (data.orderId === orderId) {
      setOrder(prev => prev ? { ...prev, status: data.status, ...data } : prev);
      toast.success(`Order status: ${data.status.replace(/_/g, ' ')}`);
    }
  }, [orderId]);

  // Handle real-time driver location updates
  const handleDriverLocation = useCallback((data) => {
    if (data.orderId === orderId) {
      setDriverLocation({ lat: data.lat, lng: data.lng, timestamp: Date.now() });
    }
  }, [orderId]);

  // Handle delivery completed event
  const handleDeliveryCompleted = useCallback((data) => {
    if (data.orderId === orderId) {
      setOrder(prev => prev ? { ...prev, status: 'delivered', deliveredTime: new Date().toISOString() } : prev);
      toast.success('🎉 Your package has been delivered!');
    }
  }, [orderId]);

  // Set up WebSocket connection and listeners
  useEffect(() => {
    wsService.connect();
    
    // Subscribe to order-specific updates
    wsService.subscribeToOrder(orderId);
    
    // Set up event listeners
    const unsubStatus = wsService.on('order_status_update', handleStatusUpdate);
    const unsubLocation = wsService.on('driver_location', handleDriverLocation);
    const unsubDelivered = wsService.on('delivery_completed', handleDeliveryCompleted);
    
    // Check connection status
    setWsConnected(wsService.socket?.connected || false);
    
    return () => {
      wsService.unsubscribeFromOrder(orderId);
      unsubStatus();
      unsubLocation();
      unsubDelivered();
    };
  }, [orderId, handleStatusUpdate, handleDriverLocation, handleDeliveryCompleted]);

  useEffect(() => { fetchOrder(); }, [orderId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchOrder(true), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, orderId]);

  const fetchOrder = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await ordersAPI.getById(orderId);
      setOrder(response.data);
      setInstructions(response.data.deliveryInstructions || '');
    } catch (error) {
      toast.error('Failed to load tracking info');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => fetchOrder(true);

  const handleShare = (method) => {
    const url = window.location.href;
    if (method === 'copy') { navigator.clipboard.writeText(url); toast.success('Link copied!'); }
    else if (method === 'email') { window.open(`mailto:?subject=Track my package&body=Track my order: ${url}`); }
    setShowShareModal(false);
  };

  const handleSupportSubmit = () => {
    toast.success('Support request sent! We\'ll contact you soon.');
    setShowSupportModal(false);
    setSupportIssue(''); setSupportMessage('');
  };

  const handleInstructionsUpdate = async () => {
    try {
      await ordersAPI.update(orderId, { deliveryInstructions: instructions });
      toast.success('Delivery instructions updated!');
      setShowInstructionsModal(false);
    } catch (error) {
      toast.error('Failed to update instructions');
    }
  };

  const getStatusProgress = (status) => {
    const stages = ['pending', 'in_warehouse', 'out_for_delivery', 'delivered'];
    const index = stages.indexOf(status);
    return index >= 0 ? ((index + 1) / stages.length) * 100 : 0;
  };

  const getStatusColor = (status) => {
    const colors = { pending: 'warning', in_warehouse: 'info', out_for_delivery: 'primary', delivered: 'success', failed: 'danger' };
    return colors[status] || 'gray';
  };

  const timeline = order ? [
    { status: 'pending', label: 'Order Placed', desc: 'Your order has been received', time: order.createdAt, icon: Package },
    { status: 'in_warehouse', label: 'At Warehouse', desc: 'Package being processed', time: order.warehouseTime, icon: Check },
    { status: 'out_for_delivery', label: 'Out for Delivery', desc: 'Driver is on the way', time: order.dispatchTime, icon: Truck },
    { status: 'delivered', label: 'Delivered', desc: 'Package delivered successfully', time: order.deliveredTime, icon: Check },
  ] : [];

  const supportIssues = ['Delivery delay', 'Wrong address', 'Package damaged', 'Driver issue', 'Change delivery time', 'Other'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Order Not Found</h2>
        <p className="text-gray-500 mt-2">We couldn't find order {orderId}</p>
        <Link to="/client/orders"><Button className="mt-4">Back to Orders</Button></Link>
      </div>
    );
  }

  const statusStages = ['pending', 'in_warehouse', 'out_for_delivery', 'delivered'];
  const currentIndex = statusStages.indexOf(order.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Track Order</h1>
            <Badge variant={getStatusColor(order.status)}>{order.status?.replace(/_/g, ' ')}</Badge>
            {wsConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-600"><Wifi className="w-3 h-3" />Live</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-400"><WifiOff className="w-3 h-3" />Offline</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500 dark:text-gray-400">#{order.id}</span>
            <button onClick={() => { navigator.clipboard.writeText(order.id); toast.success('ID copied!'); }} className="text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={handleRefresh} disabled={refreshing}>{refreshing ? 'Updating…' : 'Refresh'}</Button>
          <Button variant="outline" size="sm" icon={Share2} onClick={() => setShowShareModal(true)}>Share</Button>
          <Button variant="outline" size="sm" icon={HelpCircle} onClick={() => setShowSupportModal(true)}>Support</Button>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`p-6 rounded-2xl ${order.status === 'delivered' ? 'bg-gradient-to-r from-green-500 to-emerald-600' : order.status === 'out_for_delivery' ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-gradient-to-r from-primary-500 to-purple-600'}`}>
        <div className="flex items-center gap-4 text-white mb-4">
          {order.status === 'out_for_delivery' ? <Truck className="w-10 h-10" /> : <Package className="w-10 h-10" />}
          <div>
            <p className="text-xl font-bold">{order.status === 'delivered' ? 'Delivered!' : order.status === 'out_for_delivery' ? 'On the Way' : 'Processing'}</p>
            <p className="text-white/80">Est. delivery: {new Date(order.estimatedDelivery).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="relative">
          <div className="h-2 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${getStatusProgress(order.status)}%` }} />
          </div>
          <div className="flex justify-between mt-2">
            {statusStages.map((stage, i) => (
              <div key={stage} className={`flex flex-col items-center ${i <= currentIndex ? 'text-white' : 'text-white/50'}`}>
                <div className={`w-4 h-4 rounded-full border-2 ${i <= currentIndex ? 'bg-white border-white' : 'border-white/50'}`} />
                <span className="text-xs mt-1 hidden sm:block">{stage.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle icon={Clock}>Tracking Timeline</CardTitle></CardHeader>
            <div className="p-6">
              <div className="space-y-6">
                {timeline.map((step, i) => {
                  const isComplete = statusStages.indexOf(order.status) >= statusStages.indexOf(step.status);
                  const isCurrent = order.status === step.status;
                  return (
                    <div key={step.status} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : isCurrent ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 animate-pulse' : 'bg-gray-100 dark:bg-slate-700 text-gray-400'}`}>
                          <step.icon className="w-5 h-5" />
                        </div>
                        {i < timeline.length - 1 && <div className={`w-0.5 flex-1 mt-2 ${isComplete ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-slate-700'}`} />}
                      </div>
                      <div className="flex-1 pb-6">
                        <p className={`font-semibold ${isComplete ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{step.label}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{step.desc}</p>
                        {step.time && <p className="text-xs text-gray-400 mt-1">{new Date(step.time).toLocaleString()}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Map / Driver Location */}
          <Card className="overflow-hidden">
            <div className="h-64 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center relative">
              {driverLocation ? (
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                    <Truck className="w-8 h-8 text-white" />
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">Driver Location</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Updated {new Date(driverLocation.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <Navigation className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {order.status === 'out_for_delivery' ? 'Waiting for driver location...' : 'Live tracking available when out for delivery'}
                  </p>
                </div>
              )}
              <div className="absolute bottom-4 right-4">
                <Button size="sm" variant="outline" icon={MapPin}>View Full Map</Button>
              </div>
              {wsConnected && order.status === 'out_for_delivery' && (
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white text-xs rounded-full">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Live Tracking
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right - Details */}
        <div className="space-y-6">
          {/* Driver Card */}
          {order.driverName && (
            <Card>
              <div className="p-5">
                <p className="text-xs text-gray-500 uppercase font-semibold mb-3">Your Driver</p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{order.driverName}</p>
                    <div className="flex items-center gap-1 text-sm text-yellow-500">
                      <Star className="w-4 h-4 fill-current" /><span>{order.driverRating || '4.8'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button fullWidth size="sm" variant="outline" icon={Phone}>Call</Button>
                  <Button fullWidth size="sm" variant="outline" icon={MessageCircle}>Chat</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Order Details */}
          <Card>
            <div className="p-5">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-3">Package</p>
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl mb-3">
                <Package className="w-8 h-8 text-primary-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{order.packageType}</p>
                  <p className="text-sm text-gray-500">{order.packageWeight} kg</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <p className="text-xs text-blue-600 font-semibold">FROM</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{order.pickupAddress || 'Warehouse'}</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <p className="text-xs text-green-600 font-semibold">TO</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{order.deliveryAddress}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Delivery Instructions */}
          <Card>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 uppercase font-semibold">Delivery Instructions</p>
                <button onClick={() => setShowInstructionsModal(true)} className="text-primary-600 hover:underline text-sm flex items-center gap-1"><Edit2 className="w-3 h-3" />Edit</button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{instructions || 'No special instructions'}</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Share Modal */}
      <Modal isOpen={showShareModal} onClose={() => setShowShareModal(false)} title="Share Tracking" size="sm">
        <div className="space-y-3">
          <button onClick={() => handleShare('copy')} className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition">
            <Copy className="w-5 h-5 text-gray-500" />
            <div className="text-left">
              <p className="font-medium text-gray-900 dark:text-white">Copy Link</p>
              <p className="text-xs text-gray-500">Share via any app</p>
            </div>
          </button>
          <button onClick={() => handleShare('email')} className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition">
            <MessageCircle className="w-5 h-5 text-gray-500" />
            <div className="text-left">
              <p className="font-medium text-gray-900 dark:text-white">Email</p>
              <p className="text-xs text-gray-500">Send via email</p>
            </div>
          </button>
        </div>
      </Modal>

      {/* Support Modal */}
      <Modal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} title="Contact Support" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Issue Type</label>
            <div className="grid grid-cols-2 gap-2">
              {supportIssues.map(issue => (
                <button key={issue} onClick={() => setSupportIssue(issue)} className={`p-3 text-sm rounded-xl border-2 transition ${supportIssue === issue ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>{issue}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Message</label>
            <textarea value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Describe your issue…" />
          </div>
          <Button fullWidth onClick={handleSupportSubmit} disabled={!supportIssue}>Send Request</Button>
        </div>
      </Modal>

      {/* Instructions Modal */}
      <Modal isOpen={showInstructionsModal} onClose={() => setShowInstructionsModal(false)} title="Edit Delivery Instructions" size="md">
        <div className="space-y-4">
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Leave at door, ring bell, etc…" />
          <div className="flex gap-3">
            <Button fullWidth variant="outline" onClick={() => setShowInstructionsModal(false)}>Cancel</Button>
            <Button fullWidth onClick={handleInstructionsUpdate}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Tracking;
