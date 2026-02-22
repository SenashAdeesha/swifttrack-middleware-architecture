import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, CheckCircle, Clock, MapPin, Navigation,
  Star, Truck, Wifi, WifiOff,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, StatCard, Modal } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { deliveryOrders } from '../../data/mockData';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const DriverDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayDeliveries, setTodayDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverStatus, setDriverStatus] = useState('active');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState('active');
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    setTimeout(() => {
      setTodayDeliveries(deliveryOrders.slice(0, 5));
      setLoading(false);
    }, 500);
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const weeklyData = [
    { day: 'Mon', deliveries: 12 }, { day: 'Tue', deliveries: 15 },
    { day: 'Wed', deliveries: 18 }, { day: 'Thu', deliveries: 14 },
    { day: 'Fri', deliveries: 22 }, { day: 'Sat', deliveries: 16 }, { day: 'Sun', deliveries: 8 },
  ];

  const stats = [
    { title: "Today's Deliveries", value: '12', change: '+3 from yesterday', trend: 'up', icon: Package, color: 'primary' },
    { title: 'Completed', value: '8', change: '67% completion rate', trend: 'up', icon: CheckCircle, color: 'success' },
    { title: 'Pending', value: '4', change: 'Out for delivery', trend: 'neutral', icon: Clock, color: 'warning' },
    { title: 'Rating', value: '4.9', change: 'Top performer', trend: 'up', icon: Star, color: 'secondary' },
  ];

  const statusConfig = {
    active: { label: 'Online', color: 'bg-green-500', ring: 'ring-green-200' },
    busy:   { label: 'Busy',   color: 'bg-yellow-500', ring: 'ring-yellow-200' },
    offline:{ label: 'Offline',color: 'bg-red-500',   ring: 'ring-red-200'   },
  };

  const handleStatusSave = () => {
    setDriverStatus(pendingStatus);
    setShowStatusModal(false);
    setStatusNote('');
    toast.success(`Status updated to ${statusConfig[pendingStatus]?.label}`);
  };

  const getStatusBadge = (status) => {
    const v = { pending: 'warning', picked_up: 'info', in_transit: 'primary', delivered: 'success', failed: 'danger' };
    return <Badge variant={v[status] || 'default'}>{status.replace(/_/g, ' ')}</Badge>;
  };

  const getPriorityBadge = (p) => {
    const v = { urgent: 'danger', high: 'warning', normal: 'default' };
    return <Badge variant={v[p] || 'default'}>{p}</Badge>;
  };

  const current = statusConfig[driverStatus] || statusConfig.offline;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {getGreeting()}, {user?.name?.split(' ')[0] || 'Driver'}! 👋
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setPendingStatus(driverStatus); setShowStatusModal(true); }}
            className={`flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl ring-2 ${current.ring} hover:shadow-md transition-all`}
          >
            <span className={`w-3 h-3 rounded-full ${current.color} animate-pulse`} />
            <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{current.label}</span>
          </button>
          <Button icon={Navigation} onClick={() => navigate('/driver/route')}
            className="bg-gradient-to-r from-primary-500 to-secondary-500 text-white">
            Start Navigation
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => <StatCard key={i} {...stat} />)}
      </div>

      {/* Chart + Route Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Weekly Deliveries</CardTitle></CardHeader>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="colorDel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="deliveries" stroke="#0ea5e9" strokeWidth={2} fillOpacity={1} fill="url(#colorDel)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today's Route</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate('/driver/route')}>View</Button>
          </CardHeader>
          <div className="space-y-3">
            {[
              { icon: MapPin, label: 'Total Distance', value: '42.5 km', bg: 'bg-primary-50 dark:bg-primary-900/20', ibg: 'bg-primary-100 dark:bg-primary-800', ic: 'text-primary-600 dark:text-primary-400' },
              { icon: Clock, label: 'Est. Time', value: '3h 45m', bg: 'bg-secondary-50 dark:bg-secondary-900/20', ibg: 'bg-secondary-100 dark:bg-secondary-800', ic: 'text-secondary-600 dark:text-secondary-400' },
              { icon: Package, label: 'Stops', value: '12 stops', bg: 'bg-green-50 dark:bg-green-900/20', ibg: 'bg-green-100 dark:bg-green-800', ic: 'text-green-600 dark:text-green-400' },
            ].map(({ icon: Icon, label, value, bg, ibg, ic }, i) => (
              <div key={i} className={`flex items-center gap-4 p-4 ${bg} rounded-xl`}>
                <div className={`p-3 ${ibg} rounded-xl`}><Icon className={`w-5 h-5 ${ic}`} /></div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Deliveries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Deliveries</CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate('/driver/delivery')}>Manage</Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                {['Order', 'Customer', 'Address', 'Time Slot', 'Priority', 'Status', ''].map((h, i) => (
                  <th key={i} className={`py-3 px-4 font-semibold text-gray-600 dark:text-gray-300 ${i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400">Loading...</td></tr>
              ) : todayDeliveries.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="py-4 px-4"><span className="font-mono text-sm text-primary-600 dark:text-primary-400">{d.id}</span></td>
                  <td className="py-4 px-4 font-medium text-gray-900 dark:text-white">{d.customer}</td>
                  <td className="py-4 px-4 text-gray-600 dark:text-gray-400 max-w-xs truncate">{d.address}</td>
                  <td className="py-4 px-4 text-gray-600 dark:text-gray-400">{d.timeSlot}</td>
                  <td className="py-4 px-4">{getPriorityBadge(d.priority)}</td>
                  <td className="py-4 px-4">{getStatusBadge(d.status)}</td>
                  <td className="py-4 px-4 text-right">
                    <Button size="sm" variant="outline" icon={Navigation} onClick={() => navigate('/driver/delivery')}>Deliver</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Status Modal */}
      <Modal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} title="Update Driver Status" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Your status affects dispatch assignments and is visible to the operations team.</p>
          <div className="space-y-3">
            {[
              { value: 'active',  icon: Wifi,   label: 'Online',  desc: 'Ready to accept and complete deliveries', cls: 'border-green-500 bg-green-50 dark:bg-green-900/20' },
              { value: 'busy',    icon: Truck,  label: 'Busy',    desc: 'Currently handling a delivery run',      cls: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' },
              { value: 'offline', icon: WifiOff,label: 'Offline', desc: 'Off shift — not accepting deliveries',   cls: 'border-red-500 bg-red-50 dark:bg-red-900/20' },
            ].map(opt => (
              <label key={opt.value} className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${pendingStatus === opt.value ? opt.cls : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                <input type="radio" name="driverStatus" value={opt.value} checked={pendingStatus === opt.value} onChange={() => setPendingStatus(opt.value)} className="w-4 h-4 accent-primary-600" />
                <opt.icon className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{opt.label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note (optional)</label>
            <textarea value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="e.g. Taking a 30-min break…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 resize-none text-sm" rows={2} />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowStatusModal(false)}>Cancel</Button>
            <Button fullWidth onClick={handleStatusSave}>Update Status</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DriverDashboard;
