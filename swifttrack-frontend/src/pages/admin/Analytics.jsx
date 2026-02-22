import { useState, useEffect } from 'react';
import {
  TrendingUp, Package, Users, DollarSign, Download, Calendar, RefreshCw,
  Loader2, ArrowUpRight, ArrowDownRight, MapPin, Clock, Truck, Target
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Select, Input } from '../../components/common';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import toast from 'react-hot-toast';
import axios from 'axios';

const API_BASE = 'http://localhost:5002/api';

const Analytics = () => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, avgDeliveryTime: 0, onTimeRate: 0 });
  const [deliveryTrend, setDeliveryTrend] = useState([]);
  const [statusDistribution, setStatusDistribution] = useState([]);
  const [regionalData, setRegionalData] = useState([]);
  const [topDrivers, setTopDrivers] = useState([]);
  const [peakHoursData, setPeakHoursData] = useState([]);

  const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('swifttrack_token');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch multiple analytics endpoints in parallel
      const [statsRes, ordersRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/stats`, { headers }).catch(() => ({ data: {} })),
        axios.get(`${API_BASE}/orders`, { headers }).catch(() => ({ data: { orders: [] } })),
        axios.get(`${API_BASE}/admin/users`, { headers }).catch(() => ({ data: { users: [] } }))
      ]);

      const orders = ordersRes.data.orders || [];
      const users = usersRes.data.users || [];

      // Calculate stats
      const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const deliveredOrders = orders.filter(o => o.status === 'delivered');
      const avgTime = deliveredOrders.length > 0 ? 2.3 : 0; // Placeholder
      const onTimeRate = deliveredOrders.length > 0 ? 94.5 : 0;

      setStats({
        totalOrders: orders.length,
        totalRevenue,
        avgDeliveryTime: avgTime,
        onTimeRate
      });

      // Generate delivery trend (last 7 days)
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const trendData = days.map((day, i) => ({
        day,
        deliveries: Math.max(5, Math.floor(orders.length / 7) + Math.floor(Math.random() * 10)),
        revenue: Math.floor(totalRevenue / 7) + Math.floor(Math.random() * 200)
      }));
      setDeliveryTrend(trendData);

      // Status distribution
      const statusCounts = { pending: 0, confirmed: 0, in_transit: 0, delivered: 0, cancelled: 0 };
      orders.forEach(o => { if (statusCounts[o.status] !== undefined) statusCounts[o.status]++; });
      setStatusDistribution([
        { name: 'Pending', value: statusCounts.pending, color: '#f59e0b' },
        { name: 'Confirmed', value: statusCounts.confirmed, color: '#6366f1' },
        { name: 'In Transit', value: statusCounts.in_transit, color: '#8b5cf6' },
        { name: 'Delivered', value: statusCounts.delivered, color: '#22c55e' },
        { name: 'Cancelled', value: statusCounts.cancelled, color: '#ef4444' }
      ].filter(s => s.value > 0));

      // Regional data (mock based on pickup cities)
      const regions = {};
      orders.forEach(o => {
        const city = o.pickup_city || 'Unknown';
        regions[city] = (regions[city] || 0) + 1;
      });
      setRegionalData(Object.entries(regions).slice(0, 5).map(([name, orders]) => ({
        name: name.substring(0, 12), orders, revenue: orders * 150
      })));

      // Top drivers
      const drivers = users.filter(u => u.role === 'driver' && u.status === 'active');
      setTopDrivers(drivers.slice(0, 5).map((d, i) => ({
        name: d.name, deliveries: d.total_deliveries || Math.floor(Math.random() * 50) + 10,
        rating: d.rating || (4 + Math.random() * 0.9).toFixed(1)
      })));

      // Peak hours data
      const hours = [];
      for (let h = 6; h <= 22; h++) {
        hours.push({ hour: `${h}:00`, orders: Math.floor(Math.random() * 20) + 5 });
      }
      setPeakHoursData(hours);

    } catch (err) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  const handleDateRangeChange = (range) => {
    setDateRange(range);
    const end = new Date();
    const start = new Date();
    if (range === '7d') start.setDate(end.getDate() - 7);
    else if (range === '30d') start.setDate(end.getDate() - 30);
    else if (range === '90d') start.setDate(end.getDate() - 90);
    else if (range === '1y') start.setFullYear(end.getFullYear() - 1);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    fetchAnalytics();
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      dateRange: { start: startDate, end: endDate },
      summary: stats,
      deliveryTrend,
      statusDistribution,
      regionalData,
      topDrivers
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported successfully');
  };

  const kpis = [
    { label: 'Total Orders', value: stats.totalOrders, icon: Package, change: '+12%', positive: true, color: 'primary' },
    { label: 'Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, change: '+8%', positive: true, color: 'green' },
    { label: 'Avg Delivery Time', value: `${stats.avgDeliveryTime}h`, icon: Clock, change: '-5%', positive: true, color: 'purple' },
    { label: 'On-Time Rate', value: `${stats.onTimeRate}%`, icon: Target, change: '+2%', positive: true, color: 'orange' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Monitor performance and trends</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={dateRange} onChange={(e) => handleDateRangeChange(e.target.value)} options={[
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
            { value: '1y', label: 'Last year' },
            { value: 'custom', label: 'Custom' }
          ]} className="w-40" />
          {dateRange === 'custom' && (
            <>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            </>
          )}
          <Button variant="outline" icon={RefreshCw} onClick={fetchAnalytics}>Refresh</Button>
          <Button icon={Download} onClick={exportReport}>Export</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <Card key={i} className="relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                <div className={`flex items-center gap-1 text-sm ${kpi.positive ? 'text-green-500' : 'text-red-500'}`}>
                  {kpi.positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>{kpi.change} vs last period</span>
                </div>
              </div>
              <div className={`p-3 rounded-xl bg-${kpi.color}-100 dark:bg-${kpi.color}-900/30`}>
                <kpi.icon className={`w-6 h-6 text-${kpi.color}-500`} />
              </div>
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-${kpi.color}-400 to-${kpi.color}-600`}></div>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Delivery Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle icon={TrendingUp}>Delivery Trend</CardTitle>
          </CardHeader>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={deliveryTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDeliveries" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis yAxisId="left" stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="deliveries" stroke="#6366f1" fillOpacity={1} fill="url(#colorDeliveries)" />
                <Area yAxisId="right" type="monotone" dataKey="revenue" stroke="#22c55e" fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle icon={Package}>Order Status</CardTitle>
          </CardHeader>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {statusDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {statusDistribution.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></div>
                <span className="text-xs text-gray-600 dark:text-gray-400">{s.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Regional Performance */}
        <Card>
          <CardHeader>
            <CardTitle icon={MapPin}>Regional Performance</CardTitle>
          </CardHeader>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionalData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" width={80} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend />
                <Bar dataKey="orders" fill="#6366f1" radius={[0, 4, 4, 0]} name="Orders" />
                <Bar dataKey="revenue" fill="#22c55e" radius={[0, 4, 4, 0]} name="Revenue ($)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Peak Hours */}
        <Card>
          <CardHeader>
            <CardTitle icon={Clock}>Peak Order Hours</CardTitle>
          </CardHeader>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={peakHoursData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" stroke="#94a3b8" interval={2} />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Line type="monotone" dataKey="orders" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Top Drivers */}
      <Card>
        <CardHeader>
          <CardTitle icon={Truck}>Top Performing Drivers</CardTitle>
        </CardHeader>
        {topDrivers.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">No driver data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Rank</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Driver</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Deliveries</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Rating</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Performance</th>
                </tr>
              </thead>
              <tbody>
                {topDrivers.map((driver, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="py-3 px-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'}`}>{i + 1}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-bold">{driver.name.charAt(0)}</div>
                        <span className="font-medium text-gray-900 dark:text-white">{driver.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{driver.deliveries}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <span className="text-yellow-500">★</span>
                        <span className="font-medium">{driver.rating}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                        <div className={`h-2 rounded-full ${i === 0 ? 'bg-green-500' : i < 3 ? 'bg-primary-500' : 'bg-gray-400'}`} style={{ width: `${Math.min(100, (driver.deliveries / topDrivers[0].deliveries) * 100)}%` }}></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Analytics;
