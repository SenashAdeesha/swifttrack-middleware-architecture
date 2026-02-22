import { useState } from 'react';
import {
  TrendingUp, TrendingDown, Star, Clock, Package, CheckCircle, XCircle,
  Award, Target, Download, ChevronUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, Badge, Button, Modal } from '../../components/common';
import toast from 'react-hot-toast';

const PERIODS = ['week', 'month', 'all'];

const dataByPeriod = {
  week: {
    deliveries: [
      { day: 'Mon', completed: 12, failed: 1 }, { day: 'Tue', completed: 15, failed: 0 },
      { day: 'Wed', completed: 18, failed: 2 }, { day: 'Thu', completed: 14, failed: 1 },
      { day: 'Fri', completed: 22, failed: 1 }, { day: 'Sat', completed: 16, failed: 0 }, { day: 'Sun', completed: 8, failed: 0 },
    ],
    stats: { total: 105, completed: 101, failed: 5, avgTime: 28, rating: 4.9, onTime: 96 },
  },
  month: {
    deliveries: [
      { day: 'W1', completed: 52, failed: 3 }, { day: 'W2', completed: 61, failed: 5 },
      { day: 'W3', completed: 58, failed: 2 }, { day: 'W4', completed: 67, failed: 4 },
    ],
    stats: { total: 238, completed: 222, failed: 14, avgTime: 31, rating: 4.8, onTime: 94 },
  },
  all: {
    deliveries: [
      { day: 'Jan', completed: 210, failed: 12 }, { day: 'Feb', completed: 195, failed: 8 },
      { day: 'Mar', completed: 240, failed: 15 }, { day: 'Apr', completed: 262, failed: 11 },
      { day: 'May', completed: 278, failed: 9 }, { day: 'Jun', completed: 295, failed: 10 },
    ],
    stats: { total: 1480, completed: 1415, failed: 65, avgTime: 30, rating: 4.85, onTime: 95 },
  },
};

const recentRatings = [
  { customer: 'Sarah M.', rating: 5, comment: 'Super fast — arrived 20 min early!', date: '2h ago' },
  { customer: 'Robert K.', rating: 5, comment: 'Handled my fragile package with care.', date: '5h ago' },
  { customer: 'Emma L.', rating: 4, comment: 'Good delivery, left in safe spot.', date: '1d ago' },
  { customer: 'James T.', rating: 5, comment: 'Communication was excellent.', date: '2d ago' },
];

const achievements = [
  { title: '100 Deliveries', icon: Package, unlocked: true, desc: 'Completed 100+ deliveries' },
  { title: 'Perfect Week', icon: Star, unlocked: true, desc: '0 failures in a week' },
  { title: '5-Star Driver', icon: Award, unlocked: true, desc: '4.9+ average rating' },
  { title: 'Speed Demon', icon: ChevronUp, unlocked: false, desc: 'Avg delivery under 25 min' },
];

const PIE_COLORS = ['#22c55e', '#ef4444', '#f59e0b'];

const Performance = () => {
  const [period, setPeriod] = useState('week');
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalDeliveries, setGoalDeliveries] = useState('');
  const [goalRating, setGoalRating] = useState('');
  const [savedGoal, setSavedGoal] = useState(null);

  const data = dataByPeriod[period];
  const { stats } = data;

  const ratingPie = [
    { name: '5 Stars', value: 68 },
    { name: '4 Stars', value: 20 },
    { name: '3 Stars & below', value: 12 },
  ];

  const handleSaveGoal = () => {
    if (!goalDeliveries && !goalRating) { toast.error('Enter at least one goal'); return; }
    setSavedGoal({ deliveries: goalDeliveries ? parseInt(goalDeliveries) : null, rating: goalRating ? parseFloat(goalRating) : null });
    setShowGoalModal(false);
    toast.success('Goals saved!');
  };

  const goalDeliveryPct = savedGoal?.deliveries ? Math.min(100, Math.round((stats.completed / savedGoal.deliveries) * 100)) : null;
  const goalRatingPct = savedGoal?.rating ? Math.min(100, Math.round((stats.rating / savedGoal.rating) * 100)) : null;

  const handleExport = () => {
    const rows = [
      ['Period', period],
      ['Total', stats.total],
      ['Completed', stats.completed],
      ['Failed', stats.failed],
      ['Avg Time (min)', stats.avgTime],
      ['Rating', stats.rating],
      ['On-Time %', stats.onTime],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `performance_${period}.csv`; a.click();
    toast.success('Report downloaded!');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Performance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track your delivery metrics and goals</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-slate-700 rounded-xl p-1">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${period === p ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <Button icon={Target} variant="outline" size="sm" onClick={() => setShowGoalModal(true)}>Set Goal</Button>
          <Button icon={Download} variant="outline" size="sm" onClick={handleExport}>Export</Button>
        </div>
      </div>

      {/* Goal Progress Banner */}
      {savedGoal && (
        <Card className="bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20 border border-primary-200 dark:border-primary-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary-600" />
              <span className="font-semibold text-primary-800 dark:text-primary-200">Your Goals</span>
            </div>
            <button onClick={() => setSavedGoal(null)} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {savedGoal.deliveries && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Deliveries: {stats.completed} / {savedGoal.deliveries}</span>
                  <span className="font-bold text-primary-600">{goalDeliveryPct}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div className="h-2 rounded-full bg-primary-500 transition-all duration-700" style={{ width: `${goalDeliveryPct}%` }} />
                </div>
              </div>
            )}
            {savedGoal.rating && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Rating: {stats.rating} / {savedGoal.rating}</span>
                  <span className="font-bold text-secondary-600">{goalRatingPct}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div className="h-2 rounded-full bg-secondary-500 transition-all duration-700" style={{ width: `${goalRatingPct}%` }} />
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Deliveries', value: stats.total, icon: Package, color: 'text-primary-600 bg-primary-100 dark:bg-primary-900/30' },
          { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
          { label: 'Failed', value: stats.failed, icon: XCircle, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
          { label: 'Avg Rating', value: stats.rating, icon: Star, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30', suffix: '★' },
        ].map(({ label, value, icon: Icon, color, suffix }) => (
          <Card key={label} className="text-center">
            <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}{suffix || ''}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Delivery Performance</CardTitle></CardHeader>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.deliveries} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="completed" fill="#22c55e" radius={[4, 4, 0, 0]} name="Completed" />
                <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Rating Distribution</CardTitle></CardHeader>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ratingPie} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                  {ratingPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Timing + Achievements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Delivery Metrics</CardTitle></CardHeader>
          <div className="space-y-4">
            {[
              { label: 'On-Time Delivery Rate', value: stats.onTime, max: 100, suffix: '%', color: 'bg-green-500' },
              { label: 'Completion Rate', value: Math.round((stats.completed / stats.total) * 100), max: 100, suffix: '%', color: 'bg-primary-500' },
              { label: 'Avg Delivery Time', value: stats.avgTime, max: 60, suffix: ' min', color: 'bg-secondary-500' },
              { label: 'Customer Satisfaction', value: Math.round(((stats.rating - 1) / 4) * 100), max: 100, suffix: '%', color: 'bg-yellow-500' },
            ].map(({ label, value, max, suffix, color }) => (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">{label}</span>
                  <span className="font-bold text-gray-900 dark:text-white">{value}{suffix}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div className={`h-2 rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Achievements</CardTitle></CardHeader>
          <div className="grid grid-cols-2 gap-3">
            {achievements.map(({ title, icon: Icon, unlocked, desc }) => (
              <div key={title} className={`p-4 rounded-xl border-2 text-center transition-all ${unlocked ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' : 'border-gray-200 dark:border-slate-700 opacity-50 grayscale'}`}>
                <div className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-2 ${unlocked ? 'bg-yellow-100 dark:bg-yellow-900/40' : 'bg-gray-100 dark:bg-slate-700'}`}>
                  <Icon className={`w-5 h-5 ${unlocked ? 'text-yellow-600' : 'text-gray-400'}`} />
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
                {unlocked && <Badge variant="warning" className="mt-2 text-xs">Earned</Badge>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Ratings */}
      <Card>
        <CardHeader><CardTitle>Recent Customer Ratings</CardTitle></CardHeader>
        <div className="space-y-3">
          {recentRatings.map((r, i) => (
            <div key={i} className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-secondary-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {r.customer[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{r.customer}</p>
                  <span className="text-xs text-gray-400 shrink-0">{r.date}</span>
                </div>
                <div className="flex items-center gap-0.5 my-1">
                  {[...Array(5)].map((_, si) => (
                    <Star key={si} className={`w-3.5 h-3.5 ${si < r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 italic">"{r.comment}"</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Set Goal Modal */}
      <Modal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} title="Set Performance Goals" size="md">
        <div className="space-y-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">Set targets to track your progress over the selected period.</p>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              <span className="flex items-center gap-2"><Package className="w-4 h-4 text-primary-500" /> Target Deliveries</span>
            </label>
            <input
              type="number"
              value={goalDeliveries}
              onChange={e => setGoalDeliveries(e.target.value)}
              placeholder={`e.g. ${period === 'week' ? 120 : period === 'month' ? 500 : 2000}`}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
            />
            {goalDeliveries && <p className="text-xs text-gray-400 mt-1">Current: {stats.completed} deliveries</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              <span className="flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500" /> Target Rating</span>
            </label>
            <input
              type="number"
              value={goalRating}
              onChange={e => setGoalRating(e.target.value)}
              placeholder="e.g. 4.9"
              min="1" max="5" step="0.1"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
            />
            {goalRating && <p className="text-xs text-gray-400 mt-1">Current: {stats.rating}★</p>}
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowGoalModal(false)}>Cancel</Button>
            <Button fullWidth icon={Target} onClick={handleSaveGoal}>Save Goals</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Performance;
