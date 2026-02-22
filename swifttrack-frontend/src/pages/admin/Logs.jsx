import { useState, useEffect, useRef } from 'react';
import {
  FileText, Search, Filter, AlertTriangle, CheckCircle, Clock, RefreshCw,
  ChevronDown, ChevronRight, Terminal, Server, Database, Users, Package,
  Download, Trash2, Eye, XCircle, Loader2, Zap, Shield, AlertCircle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Input, Select, Modal, EmptyState } from '../../components/common';
import toast from 'react-hot-toast';
import axios from 'axios';

const API_BASE = 'http://localhost:5002/api';

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [expandedLog, setExpandedLog] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const intervalRef = useRef(null);

  // Mock logs with realistic data
  const generateLogs = () => {
    const services = ['api-gateway', 'cms-service', 'ros-service', 'wms-service', 'notification-service', 'saga-orchestrator'];
    const types = ['info', 'warning', 'error', 'success', 'debug'];
    const actions = [
      { msg: 'Order created successfully', type: 'success', service: 'ros-service' },
      { msg: 'User authentication successful', type: 'info', service: 'api-gateway' },
      { msg: 'Database connection established', type: 'info', service: 'wms-service' },
      { msg: 'Failed to send notification', type: 'error', service: 'notification-service' },
      { msg: 'High memory usage detected', type: 'warning', service: 'saga-orchestrator' },
      { msg: 'Order status updated to delivered', type: 'success', service: 'ros-service' },
      { msg: 'Rate limit exceeded for user', type: 'warning', service: 'api-gateway' },
      { msg: 'Inventory updated successfully', type: 'success', service: 'cms-service' },
      { msg: 'Connection timeout to external API', type: 'error', service: 'notification-service' },
      { msg: 'New driver registered', type: 'info', service: 'api-gateway' },
      { msg: 'Saga transaction completed', type: 'success', service: 'saga-orchestrator' },
      { msg: 'Request validation failed', type: 'error', service: 'api-gateway' },
      { msg: 'Cache cleared successfully', type: 'info', service: 'wms-service' },
      { msg: 'Email sent to customer', type: 'success', service: 'notification-service' },
      { msg: 'Slow query detected (>2s)', type: 'warning', service: 'cms-service' },
    ];

    return Array.from({ length: 50 }, (_, i) => {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const time = new Date(Date.now() - Math.random() * 86400000 * 3);
      return {
        id: `LOG-${String(1000 + i).padStart(4, '0')}`,
        timestamp: time.toISOString(),
        type: action.type,
        service: action.service,
        message: action.msg,
        details: {
          requestId: `req-${Math.random().toString(36).substring(7)}`,
          userId: Math.random() > 0.5 ? `user-${Math.floor(Math.random() * 100)}` : null,
          duration: `${Math.floor(Math.random() * 500)}ms`,
          ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          endpoint: `/api/${['orders', 'users', 'notifications', 'auth'][Math.floor(Math.random() * 4)]}`
        },
        resolved: action.type === 'success' || action.type === 'info' || Math.random() > 0.7
      };
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      // In real app, fetch from API
      // const token = localStorage.getItem('swifttrack_token');
      // const res = await axios.get(`${API_BASE}/admin/logs`, { headers: { Authorization: `Bearer ${token}` } });
      // setLogs(res.data.logs || []);
      
      // Using mock data for now
      setLogs(generateLogs());
    } catch (err) {
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000);
      toast.success('Auto-refresh enabled (5s)');
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(search.toLowerCase()) || log.id.toLowerCase().includes(search.toLowerCase()) || log.service.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || log.type === typeFilter;
    const matchesLevel = levelFilter === 'all' || (levelFilter === 'unresolved' ? !log.resolved : log.resolved);
    const matchesService = serviceFilter === 'all' || log.service === serviceFilter;
    return matchesSearch && matchesType && matchesLevel && matchesService;
  });

  const handleMarkResolved = (logId) => {
    setLogs(logs.map(l => l.id === logId ? { ...l, resolved: true } : l));
    toast.success('Log marked as resolved');
  };

  const handleRetry = (log) => {
    toast.success(`Retrying action: ${log.message}`);
    setTimeout(() => {
      setLogs(logs.map(l => l.id === log.id ? { ...l, resolved: true, type: 'success' } : l));
      toast.success('Action completed successfully');
    }, 1500);
  };

  const handleClearLogs = () => {
    setLogs(logs.filter(l => l.type !== 'info' && l.type !== 'success'));
    setShowClearModal(false);
    toast.success('Cleared info and success logs');
  };

  const exportLogs = () => {
    const csv = [
      'ID,Timestamp,Type,Service,Message,Resolved',
      ...filteredLogs.map(l => `${l.id},${l.timestamp},${l.type},${l.service},"${l.message}",${l.resolved}`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exported');
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'debug': return <Terminal className="w-4 h-4 text-purple-500" />;
      default: return <AlertCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const getTypeBadge = (type) => {
    const variants = { error: 'danger', warning: 'warning', success: 'success', info: 'primary', debug: 'default' };
    return <Badge variant={variants[type] || 'default'}>{type}</Badge>;
  };

  const getServiceIcon = (service) => {
    if (service.includes('api')) return Server;
    if (service.includes('notification')) return Zap;
    if (service.includes('wms') || service.includes('cms')) return Database;
    if (service.includes('saga')) return Shield;
    return Package;
  };

  const stats = {
    total: logs.length,
    errors: logs.filter(l => l.type === 'error').length,
    warnings: logs.filter(l => l.type === 'warning').length,
    unresolved: logs.filter(l => !l.resolved && (l.type === 'error' || l.type === 'warning')).length
  };

  const services = [...new Set(logs.map(l => l.service))];

  if (loading && logs.length === 0) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Logs</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Monitor system activity and errors</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={autoRefresh ? 'primary' : 'outline'} size="sm" icon={RefreshCw} onClick={() => setAutoRefresh(!autoRefresh)} className={autoRefresh ? 'animate-pulse' : ''}>
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh'}
          </Button>
          <Button variant="outline" size="sm" icon={Download} onClick={exportLogs}>Export</Button>
          <Button variant="outline" size="sm" icon={Trash2} onClick={() => setShowClearModal(true)}>Clear</Button>
          <Button size="sm" icon={RefreshCw} onClick={fetchLogs}>Refresh</Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setTypeFilter('all'); setLevelFilter('all'); }}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-xl"><FileText className="w-5 h-5 text-primary-500" /></div>
            <div><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p><p className="text-xs text-gray-500">Total Logs</p></div>
          </div>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setTypeFilter('error')}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl"><XCircle className="w-5 h-5 text-red-500" /></div>
            <div><p className="text-2xl font-bold text-red-600">{stats.errors}</p><p className="text-xs text-gray-500">Errors</p></div>
          </div>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setTypeFilter('warning')}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl"><AlertTriangle className="w-5 h-5 text-yellow-500" /></div>
            <div><p className="text-2xl font-bold text-yellow-600">{stats.warnings}</p><p className="text-xs text-gray-500">Warnings</p></div>
          </div>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLevelFilter('unresolved')}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl"><Clock className="w-5 h-5 text-orange-500" /></div>
            <div><p className="text-2xl font-bold text-orange-600">{stats.unresolved}</p><p className="text-xs text-gray-500">Unresolved</p></div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1"><Input placeholder="Search logs…" value={search} onChange={(e) => setSearch(e.target.value)} icon={Search} /></div>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} options={[
            { value: 'all', label: 'All Types' },
            { value: 'error', label: 'Errors' },
            { value: 'warning', label: 'Warnings' },
            { value: 'success', label: 'Success' },
            { value: 'info', label: 'Info' },
            { value: 'debug', label: 'Debug' }
          ]} className="w-full md:w-40" />
          <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} options={[
            { value: 'all', label: 'All Status' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'unresolved', label: 'Unresolved' }
          ]} className="w-full md:w-40" />
          <Select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} options={[
            { value: 'all', label: 'All Services' },
            ...services.map(s => ({ value: s, label: s }))
          ]} className="w-full md:w-48" />
        </div>
      </Card>

      {/* Logs List */}
      <Card className="overflow-hidden">
        {filteredLogs.length === 0 ? (
          <EmptyState icon={FileText} title="No logs found" description="Try adjusting your filters" />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {filteredLogs.slice(0, 50).map(log => {
              const ServiceIcon = getServiceIcon(log.service);
              return (
                <div key={log.id} className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${!log.resolved && (log.type === 'error' || log.type === 'warning') ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                  <div className="flex items-start gap-4">
                    <button onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)} className="mt-1">
                      {expandedLog === log.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </button>
                    <div className="mt-1">{getTypeIcon(log.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-gray-400">{log.id}</span>
                        {getTypeBadge(log.type)}
                        <Badge variant="default" size="sm" className="flex items-center gap-1"><ServiceIcon className="w-3 h-3" />{log.service}</Badge>
                        {log.resolved && <Badge variant="success" size="sm">Resolved</Badge>}
                      </div>
                      <p className="text-gray-900 dark:text-white font-medium">{log.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" icon={Eye} onClick={() => { setSelectedLog(log); setShowLogModal(true); }} />
                      {!log.resolved && (log.type === 'error' || log.type === 'warning') && (
                        <>
                          <Button variant="ghost" size="sm" icon={CheckCircle} onClick={() => handleMarkResolved(log.id)} title="Mark Resolved" />
                          {log.type === 'error' && <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => handleRetry(log)} title="Retry" />}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedLog === log.id && (
                    <div className="mt-4 ml-12 p-4 bg-gray-100 dark:bg-slate-800 rounded-xl space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><span className="text-gray-500">Request ID:</span><p className="font-mono text-gray-900 dark:text-white">{log.details.requestId}</p></div>
                        <div><span className="text-gray-500">User ID:</span><p className="font-mono text-gray-900 dark:text-white">{log.details.userId || '—'}</p></div>
                        <div><span className="text-gray-500">Duration:</span><p className="font-mono text-gray-900 dark:text-white">{log.details.duration}</p></div>
                        <div><span className="text-gray-500">IP:</span><p className="font-mono text-gray-900 dark:text-white">{log.details.ip}</p></div>
                      </div>
                      <div><span className="text-gray-500 text-sm">Endpoint:</span><p className="font-mono text-sm text-gray-900 dark:text-white">{log.details.endpoint}</p></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Log Detail Modal */}
      <Modal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title="Log Details" size="lg">
        {selectedLog && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {getTypeIcon(selectedLog.type)}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedLog.message}</h3>
                <p className="text-sm text-gray-500">{selectedLog.id} · {selectedLog.service}</p>
              </div>
              {getTypeBadge(selectedLog.type)}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><p className="text-xs text-gray-500">Timestamp</p><p className="font-medium text-gray-900 dark:text-white">{new Date(selectedLog.timestamp).toLocaleString()}</p></div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><p className="text-xs text-gray-500">Status</p><p className="font-medium text-gray-900 dark:text-white">{selectedLog.resolved ? 'Resolved' : 'Unresolved'}</p></div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><p className="text-xs text-gray-500">Request ID</p><p className="font-mono text-gray-900 dark:text-white">{selectedLog.details.requestId}</p></div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><p className="text-xs text-gray-500">Duration</p><p className="font-medium text-gray-900 dark:text-white">{selectedLog.details.duration}</p></div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><p className="text-xs text-gray-500">IP Address</p><p className="font-mono text-gray-900 dark:text-white">{selectedLog.details.ip}</p></div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><p className="text-xs text-gray-500">User ID</p><p className="font-mono text-gray-900 dark:text-white">{selectedLog.details.userId || '—'}</p></div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><p className="text-xs text-gray-500 mb-1">Endpoint</p><p className="font-mono text-gray-900 dark:text-white">{selectedLog.details.endpoint}</p></div>
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
              {!selectedLog.resolved && (selectedLog.type === 'error' || selectedLog.type === 'warning') && (
                <>
                  <Button variant="outline" icon={CheckCircle} onClick={() => { handleMarkResolved(selectedLog.id); setShowLogModal(false); }}>Mark Resolved</Button>
                  {selectedLog.type === 'error' && <Button icon={RefreshCw} onClick={() => { handleRetry(selectedLog); setShowLogModal(false); }}>Retry Action</Button>}
                </>
              )}
              <Button variant="outline" fullWidth onClick={() => setShowLogModal(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Clear Logs Modal */}
      <Modal isOpen={showClearModal} onClose={() => setShowClearModal(false)} title="Clear Logs" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">This will clear all <span className="font-semibold">info</span> and <span className="font-semibold">success</span> logs. Errors and warnings will be preserved.</p>
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setShowClearModal(false)}>Cancel</Button>
            <Button variant="danger" fullWidth onClick={handleClearLogs}>Clear Logs</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Logs;
