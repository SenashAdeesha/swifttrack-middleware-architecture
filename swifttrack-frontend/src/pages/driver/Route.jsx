import { useState } from 'react';
import {
  MapPin, Navigation, Clock, Package, ChevronRight,
  CheckCircle, Circle, Phone, AlertTriangle, SkipForward,
  FileText, Flag,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal } from '../../components/common';
import { deliveryOrders } from '../../data/mockData';
import toast from 'react-hot-toast';

const Route = () => {
  const [stops, setStops] = useState(
    deliveryOrders.map((o, i) => ({ ...o, stopNum: i + 1, stopNote: '', completed: false, skipped: false }))
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [skipNote, setSkipNote] = useState('');
  const [issueType, setIssueType] = useState('');
  const [issueNote, setIssueNote] = useState('');
  const [etaMinutes, setEtaMinutes] = useState('');

  const skipReasons = [
    'Customer not home',
    'Access restricted',
    'Unsafe location',
    'Wrong address',
    'Customer requested reschedule',
    'Other',
  ];

  const issueTypes = [
    'Traffic / road closure',
    'Vehicle problem',
    'Package damaged',
    'Wrong package loaded',
    'Safety concern',
    'Other',
  ];

  const activeStop = stops[currentIdx];
  const completedCount = stops.filter(s => s.completed).length;
  const skippedCount = stops.filter(s => s.skipped).length;
  const progress = Math.round((completedCount / stops.length) * 100);

  const handleCompleteStop = () => {
    setStops(prev => prev.map((s, i) => i === currentIdx ? { ...s, completed: true } : s));
    setShowCompleteModal(false);
    toast.success(`Stop ${activeStop.stopNum} completed!`);
    const next = stops.findIndex((s, i) => i > currentIdx && !s.completed && !s.skipped);
    if (next !== -1) setCurrentIdx(next);
    else toast.success('🎉 All stops completed!');
  };

  const handleSkipStop = () => {
    if (!skipReason) { toast.error('Please select a reason'); return; }
    setStops(prev => prev.map((s, i) => i === currentIdx ? { ...s, skipped: true } : s));
    setShowSkipModal(false);
    setSkipReason('');
    setSkipNote('');
    toast(`Stop ${activeStop.stopNum} skipped.`, { icon: '⏭' });
    const next = stops.findIndex((s, i) => i > currentIdx && !s.completed && !s.skipped);
    if (next !== -1) setCurrentIdx(next);
  };

  const handleReportIssue = () => {
    if (!issueType) { toast.error('Please select an issue type'); return; }
    setShowIssueModal(false);
    setIssueType('');
    setIssueNote('');
    toast('Issue reported to dispatch.', { icon: '⚠️' });
  };

  const handleUpdateEta = () => {
    if (!etaMinutes || isNaN(etaMinutes)) { toast.error('Enter a valid number of minutes'); return; }
    toast.success(`ETA updated: ${etaMinutes} min remaining`);
    setEtaMinutes('');
  };

  const getStopIcon = (stop, idx) => {
    if (stop.completed) return <CheckCircle className="w-6 h-6 text-green-500" />;
    if (stop.skipped) return <SkipForward className="w-6 h-6 text-gray-400" />;
    if (idx === currentIdx) return <MapPin className="w-6 h-6 text-primary-500 animate-bounce" />;
    return <Circle className="w-6 h-6 text-gray-300 dark:text-slate-600" />;
  };

  const getStopBg = (stop, idx) => {
    if (stop.completed) return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
    if (stop.skipped) return 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 opacity-60';
    if (idx === currentIdx) return 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 ring-2 ring-primary-200 dark:ring-primary-800';
    return 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Today's Route</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {completedCount} of {stops.length} stops · {skippedCount} skipped
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={AlertTriangle} onClick={() => setShowIssueModal(true)} className="border-orange-300 text-orange-600">
            Report Issue
          </Button>
          <Button size="sm" icon={Navigation} onClick={() => toast.success('Opening navigation…')}>
            Start Navigation
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Route Progress</p>
            <p className="text-xs text-gray-400 mt-0.5">{completedCount} completed · {stops.length - completedCount - skippedCount} remaining</p>
          </div>
          <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
            <span className="text-gray-500">{completedCount} done</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-primary-500 inline-block" />
            <span className="text-gray-500">1 active</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gray-300 dark:bg-slate-600 inline-block" />
            <span className="text-gray-500">{stops.length - completedCount - skippedCount - 1} pending</span>
          </div>
          {skippedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
              <span className="text-gray-500">{skippedCount} skipped</span>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stop List */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stops</h2>
          {stops.map((stop, idx) => (
            <div key={stop.id} className={`p-4 border-2 rounded-xl transition-all cursor-pointer ${getStopBg(stop, idx)}`} onClick={() => !stop.completed && !stop.skipped && setCurrentIdx(idx)}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">{getStopIcon(stop, idx)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-gray-500">Stop {stop.stopNum}</span>
                    {idx === currentIdx && !stop.completed && !stop.skipped && (
                      <Badge variant="primary" className="text-xs">Current</Badge>
                    )}
                  </div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white mt-0.5 truncate">{stop.customer}</p>
                  <p className="text-xs text-gray-500 truncate">{stop.address}</p>
                  {stop.stopNote && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 italic">Note: {stop.stopNote}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Active Stop Detail */}
        {activeStop && !activeStop.completed && !activeStop.skipped ? (
          <div className="lg:col-span-2 space-y-5">
            {/* Map area */}
            <Card>
              <CardHeader>
                <CardTitle>Stop {activeStop.stopNum} — Navigate</CardTitle>
                <Button size="sm" icon={Phone} variant="outline" onClick={() => toast.success('Calling customer…')}>Call</Button>
              </CardHeader>
              <div className="h-44 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-700 dark:to-slate-600 rounded-xl flex items-center justify-center mb-4">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <MapPin className="w-10 h-10 mx-auto mb-2 text-primary-400" />
                  <p className="text-sm font-medium">{activeStop.address}</p>
                  <p className="text-xs mt-1">~8 min away</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl text-center">
                  <p className="text-xs text-gray-400">Customer</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{activeStop.customer}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl text-center">
                  <p className="text-xs text-gray-400">Time Slot</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{activeStop.timeSlot}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-xl text-center">
                  <p className="text-xs text-gray-400">Priority</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{activeStop.priority}</p>
                </div>
              </div>
            </Card>

            {/* ETA Update + Notes */}
            <Card>
              <CardHeader><CardTitle>Stop Notes & ETA</CardTitle></CardHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stop-specific Note</label>
                  <textarea
                    value={activeStop.stopNote}
                    onChange={e => setStops(prev => prev.map((s, i) => i === currentIdx ? { ...s, stopNote: e.target.value } : s))}
                    placeholder="e.g. Ring bell twice, use side entrance…"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 resize-none text-sm"
                    rows={2}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Update ETA (minutes)</label>
                    <input
                      type="number"
                      value={etaMinutes}
                      onChange={e => setEtaMinutes(e.target.value)}
                      placeholder="e.g. 15"
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button icon={Clock} variant="outline" onClick={handleUpdateEta}>Update</Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button fullWidth icon={CheckCircle} onClick={() => setShowCompleteModal(true)}
                className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">
                Complete Stop
              </Button>
              <Button fullWidth icon={SkipForward} variant="outline"
                className="border-orange-300 text-orange-600 hover:bg-orange-50"
                onClick={() => setShowSkipModal(true)}>
                Skip Stop
              </Button>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center">
            <div className="text-center py-16 text-gray-400">
              <Flag className="w-16 h-16 mx-auto mb-4 text-green-400" />
              <p className="text-xl font-bold text-gray-700 dark:text-gray-300">All stops {completedCount > 0 ? 'complete' : 'done'}!</p>
              <p className="text-sm mt-2">{completedCount} delivered · {skippedCount} skipped</p>
            </div>
          </div>
        )}
      </div>

      {/* Complete Stop Modal */}
      <Modal isOpen={showCompleteModal} onClose={() => setShowCompleteModal(false)} title="Complete Stop" size="sm">
        <div className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <p className="font-semibold text-gray-900 dark:text-white">Stop {activeStop?.stopNum} — {activeStop?.customer}</p>
            <p className="text-sm text-gray-500 mt-1">{activeStop?.address}</p>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">Confirm that this stop has been completed successfully and the package was delivered.</p>
          <div className="flex gap-3 pt-2">
            <Button fullWidth variant="outline" onClick={() => setShowCompleteModal(false)}>Cancel</Button>
            <Button fullWidth icon={CheckCircle} onClick={handleCompleteStop} className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">Mark Complete</Button>
          </div>
        </div>
      </Modal>

      {/* Skip Stop Modal */}
      <Modal isOpen={showSkipModal} onClose={() => setShowSkipModal(false)} title="Skip Stop" size="md">
        <div className="space-y-4">
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
            <p className="font-semibold text-orange-800 dark:text-orange-200">Skipping Stop {activeStop?.stopNum} — {activeStop?.customer}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Reason for skipping *</p>
            <div className="space-y-2">
              {skipReasons.map(r => (
                <label key={r} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${skipReason === r ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                  <input type="radio" name="skipReason" value={r} checked={skipReason === r} onChange={() => setSkipReason(r)} className="w-4 h-4 accent-orange-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{r}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Notes</label>
            <textarea value={skipNote} onChange={e => setSkipNote(e.target.value)} placeholder="Optional: add more context…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-orange-500 resize-none text-sm" rows={2} />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowSkipModal(false)}>Cancel</Button>
            <Button fullWidth icon={SkipForward} onClick={handleSkipStop} className="bg-orange-500 hover:bg-orange-600 text-white">Skip Stop</Button>
          </div>
        </div>
      </Modal>

      {/* Report Issue Modal */}
      <Modal isOpen={showIssueModal} onClose={() => setShowIssueModal(false)} title="Report Route Issue" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Report any issue to dispatch. They will be notified immediately.</p>
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Issue type *</p>
            <div className="space-y-2">
              {issueTypes.map(t => (
                <label key={t} className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${issueType === t ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                  <input type="radio" name="issueType" value={t} checked={issueType === t} onChange={() => setIssueType(t)} className="w-4 h-4 accent-red-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Details</label>
            <textarea value={issueNote} onChange={e => setIssueNote(e.target.value)} placeholder="Describe the issue in detail…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-red-500 resize-none text-sm" rows={3} />
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-slate-700">
            <Button fullWidth variant="outline" onClick={() => setShowIssueModal(false)}>Cancel</Button>
            <Button fullWidth icon={AlertTriangle} onClick={handleReportIssue} className="bg-red-500 hover:bg-red-600 text-white">Send Report</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Route;
