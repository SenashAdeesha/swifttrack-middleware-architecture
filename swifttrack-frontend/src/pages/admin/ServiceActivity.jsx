import { useState, useEffect, useRef } from 'react';
import {
  Server, Search, Filter, RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle,
  Database, Route, Warehouse, Users, ChevronDown, Eye, Download, Activity,
  Loader2, FileText, Zap
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Input, Select, Modal, EmptyState } from '../../components/common';
import toast from 'react-hot-toast';
import axios from 'axios';

const API_BASE = 'http://localhost:5002/api';

const ServiceActivity = () => {
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 50;
  const intervalRef = useRef(null);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('swifttrack_token');
      
      let url = `${API_BASE}/service-activity?limit=${limit}&offset=${page * limit}`;
      if (serviceFilter !== 'all') url += `&service_name=${serviceFilter}`;
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setActivities(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch service activity:', err);
      toast.error('Failed to load service activity');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('swifttrack_token');
      const res = await axios.get(`${API_BASE}/service-activity/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(res.data.data || null);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchActivities();
    fetchStats();
  }, [serviceFilter, statusFilter, page]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchActivities();
        fetchStats();
      }, 5000);
      toast.success('Auto-refresh enabled (5s)');
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = 
      activity.order_id?.toLowerCase().includes(search.toLowerCase()) ||
      activity.action?.toLowerCase().includes(search.toLowerCase()) ||
      activity.service_name?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const getServiceIcon = (service) => {
    const icons = {
      'CMS': <Users className="w-4 h-4" />,
      'WMS': <Warehouse className="w-4 h-4" />,
      'ROS': <Route className="w-4 h-4" />
    };
    return icons[service] || <Server className="w-4 h-4" />;
  };

  const getServiceColor = (service) => {
    const colors = {
      'CMS': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'WMS': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      'ROS': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    };
    return colors[service] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status) => {
    const icons = {
      'started': <Clock className="w-4 h-4 text-blue-500" />,
      'success': <CheckCircle className="w-4 h-4 text-green-500" />,
      'failed': <XCircle className="w-4 h-4 text-red-500" />,
      'skipped': <AlertTriangle className="w-4 h-4 text-yellow-500" />
    };
    return icons[status] || <Activity className="w-4 h-4" />;
  };

  const getStatusBadge = (status) => {
    const variants = {
      'started': 'info',
      'success': 'success',
      'failed': 'error',
      'skipped': 'warning'
    };
    return variants[status] || 'default';
  };

  const getProtocolBadge = (protocol) => {
    if (protocol?.includes('SOAP')) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    if (protocol?.includes('REST')) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    if (protocol?.includes('AMQP') || protocol?.includes('RabbitMQ')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    return 'bg-gray-100 text-gray-800';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleViewDetails = (activity) => {
    setSelectedActivity(activity);
    setShowDetailModal(true);
  };

  const exportActivities = () => {
    const csvContent = [
      ['ID', 'Order ID', 'Service', 'Action', 'Status', 'Protocol', 'Duration (ms)', 'Created At'].join(','),
      ...filteredActivities.map(a => [
        a.id, a.order_id, a.service_name, a.action, a.status, a.protocol, a.duration_ms || '', a.created_at
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `service-activity-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Service activity exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-7 h-7 text-indigo-600" />
            Service Activity
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Monitor CMS, WMS, and ROS service interactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refreshing' : 'Auto-refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportActivities}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* CMS Stats */}
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">SOAP/XML</span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.services?.CMS?.total || 0}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">CMS Activities</p>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-green-600">✓ {stats.services?.CMS?.success || 0}</span>
                <span className="text-red-600">✗ {stats.services?.CMS?.failed || 0}</span>
                <span className="text-yellow-600">⚠ {stats.services?.CMS?.skipped || 0}</span>
              </div>
            </div>
          </Card>

          {/* WMS Stats */}
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <Warehouse className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">RabbitMQ</span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.services?.WMS?.total || 0}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">WMS Activities</p>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-green-600">✓ {stats.services?.WMS?.success || 0}</span>
                <span className="text-red-600">✗ {stats.services?.WMS?.failed || 0}</span>
                <span className="text-yellow-600">⚠ {stats.services?.WMS?.skipped || 0}</span>
              </div>
            </div>
          </Card>

          {/* ROS Stats */}
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-green-500 rounded-lg">
                  <Route className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-green-600 dark:text-green-400">REST/JSON</span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.services?.ROS?.total || 0}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">ROS Activities</p>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-green-600">✓ {stats.services?.ROS?.success || 0}</span>
                <span className="text-red-600">✗ {stats.services?.ROS?.failed || 0}</span>
                <span className="text-yellow-600">⚠ {stats.services?.ROS?.skipped || 0}</span>
              </div>
            </div>
          </Card>

          {/* Last 24h */}
          <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border-indigo-200 dark:border-indigo-800">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">24 Hours</span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.total_last_24h || 0}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Recent Activities</p>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                All services combined
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by order ID, action..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select
                value={serviceFilter}
                onChange={(e) => { setServiceFilter(e.target.value); setPage(0); }}
                options={[
                  { value: 'all', label: 'All Services' },
                  { value: 'CMS', label: 'CMS (SOAP/XML)' },
                  { value: 'WMS', label: 'WMS (RabbitMQ)' },
                  { value: 'ROS', label: 'ROS (REST/JSON)' }
                ]}
              />
              <Select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'started', label: 'Started' },
                  { value: 'success', label: 'Success' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'skipped', label: 'Skipped' }
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Service Activity Log
            <Badge variant="info" className="ml-2">{total} total</Badge>
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : filteredActivities.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No Activity Found"
              description="No service activity records match your filters."
            />
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Protocol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredActivities.map((activity) => (
                  <tr key={activity.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(activity.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {activity.order_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getServiceColor(activity.service_name)}`}>
                        {getServiceIcon(activity.service_name)}
                        {activity.service_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {activity.action}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {getStatusIcon(activity.status)}
                        <Badge variant={getStatusBadge(activity.status)}>
                          {activity.status}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getProtocolBadge(activity.protocol)}`}>
                        {activity.protocol}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {activity.duration_ms ? `${activity.duration_ms}ms` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(activity)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Pagination */}
        {total > limit && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * limit >= total}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Service Activity Details"
        size="lg"
      >
        {selectedActivity && (
          <div className="space-y-4">
            {/* Service Header */}
            <div className={`p-4 rounded-lg ${getServiceColor(selectedActivity.service_name)}`}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/50 rounded-lg">
                  {getServiceIcon(selectedActivity.service_name)}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{selectedActivity.service_name} Service</h3>
                  <p className="text-sm opacity-80">{selectedActivity.service_type}</p>
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase">Order ID</label>
                <p className="font-medium">{selectedActivity.order_id}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase">Action</label>
                <p className="font-medium">{selectedActivity.action}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase">Status</label>
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedActivity.status)}
                  <Badge variant={getStatusBadge(selectedActivity.status)}>
                    {selectedActivity.status}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase">Protocol</label>
                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getProtocolBadge(selectedActivity.protocol)}`}>
                  {selectedActivity.protocol}
                </span>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase">Endpoint</label>
                <p className="font-mono text-sm">{selectedActivity.endpoint || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase">Duration</label>
                <p className="font-medium">{selectedActivity.duration_ms ? `${selectedActivity.duration_ms}ms` : 'N/A'}</p>
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-gray-500 uppercase">Timestamp</label>
                <p className="font-medium">{formatTime(selectedActivity.created_at)}</p>
              </div>
            </div>

            {/* Request/Response Data */}
            {selectedActivity.request_data && (
              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase">Request Data</label>
                <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm overflow-x-auto">
                  {JSON.stringify(selectedActivity.request_data, null, 2)}
                </pre>
              </div>
            )}

            {selectedActivity.response_data && (
              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase">Response Data</label>
                <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm overflow-x-auto">
                  {JSON.stringify(selectedActivity.response_data, null, 2)}
                </pre>
              </div>
            )}

            {selectedActivity.error_message && (
              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase">Error Message</label>
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {selectedActivity.error_message}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ServiceActivity;
