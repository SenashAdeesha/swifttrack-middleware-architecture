import { useState, useEffect } from 'react';
import {
  Users as UsersIcon, Search, Plus, Mail, Phone, Edit, Trash2, CheckCircle, XCircle,
  Truck, User, Loader2, Key, Shield, MapPin, Building, Star, Calendar, Eye, RefreshCw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Input, Modal, Select, EmptyState } from '../../components/common';
import toast from 'react-hot-toast';
import axios from 'axios';

const API_BASE = 'http://localhost:5002/api';

const Users = () => {
  const [activeTab, setActiveTab] = useState('clients');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'client', phone: '', company: '',
    vehicleType: '', vehiclePlate: '', address: '', licenseNumber: '', status: 'active'
  });

  const [editForm, setEditForm] = useState({});
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('swifttrack_token');
      const res = await axios.get(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      setUsers(res.data.users || []);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = users.filter(u => (activeTab === 'clients' ? u.role === 'client' : activeTab === 'drivers' ? u.role === 'driver' : u.role === 'admin'))
    .filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(search.toLowerCase()) || user.email.toLowerCase().includes(search.toLowerCase());
      return matchesSearch && (statusFilter === 'all' || user.status === statusFilter);
    });

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      const token = localStorage.getItem('swifttrack_token');
      await axios.put(`${API_BASE}/admin/users/${user.id}/status`, { status: newStatus }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`${user.name} has been ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchUsers();
    } catch { toast.error('Failed to update status'); }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { toast.error('Name, email and password are required'); return; }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try {
      setSubmitting(true);
      const token = localStorage.getItem('swifttrack_token');
      await axios.post(`${API_BASE}/admin/users`, form, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`User "${form.name}" created successfully`);
      setShowAddModal(false);
      setForm({ name: '', email: '', password: '', role: 'client', phone: '', company: '', vehicleType: '', vehiclePlate: '', address: '', licenseNumber: '', status: 'active' });
      fetchUsers();
      setActiveTab(form.role === 'driver' ? 'drivers' : form.role === 'admin' ? 'admins' : 'clients');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create user'); }
    finally { setSubmitting(false); }
  };

  const handleEditUser = async () => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('swifttrack_token');
      await axios.put(`${API_BASE}/admin/users/${editForm.id}`, editForm, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('User updated successfully');
      setShowEditModal(false);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to update user'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteUser = async () => {
    try {
      const token = localStorage.getItem('swifttrack_token');
      await axios.delete(`${API_BASE}/admin/users/${deletingUser.id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('User deleted successfully');
      setShowDeleteModal(false);
      setDeletingUser(null);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete user'); }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try {
      const token = localStorage.getItem('swifttrack_token');
      await axios.put(`${API_BASE}/admin/users/${selectedUser.id}/password`, { password: newPassword }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Password reset successfully');
      setShowResetPasswordModal(false);
      setNewPassword('');
    } catch (err) { toast.error('Failed to reset password'); }
  };

  const getStatusBadge = (status) => status === 'active' ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>;

  const clientCount = users.filter(u => u.role === 'client').length;
  const driverCount = users.filter(u => u.role === 'driver').length;
  const adminCount = users.filter(u => u.role === 'admin').length;

  const tabs = [
    { id: 'clients', label: 'Clients', icon: User, count: clientCount },
    { id: 'drivers', label: 'Drivers', icon: Truck, count: driverCount },
    { id: 'admins', label: 'Admins', icon: Shield, count: adminCount },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{users.length} total users on the platform</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchUsers}>Refresh</Button>
          <Button icon={Plus} onClick={() => { setForm({ ...form, role: activeTab === 'drivers' ? 'driver' : activeTab === 'admins' ? 'admin' : 'client' }); setShowAddModal(true); }}>Add User</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-slate-700">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 pb-4 px-2 border-b-2 font-medium transition-colors ${activeTab === tab.id ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            <tab.icon className="w-5 h-5" />{tab.label}<Badge variant={activeTab === tab.id ? 'primary' : 'default'} size="sm">{tab.count}</Badge>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input placeholder={`Search ${activeTab}…`} value={search} onChange={(e) => setSearch(e.target.value)} icon={Search} />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={[{ value: 'all', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} className="w-full md:w-48" />
        </div>
      </Card>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users found" description="Try adjusting your search or add a new user" actionLabel="Add User" onAction={() => setShowAddModal(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.map(user => (
            <Card key={user.id} className="hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-bold text-lg">{user.name.charAt(0)}</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{user.name}</h3>
                    <p className="text-xs text-gray-400">ID: {user.id}</p>
                  </div>
                </div>
                {getStatusBadge(user.status)}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><Mail className="w-4 h-4" /><span className="truncate">{user.email}</span></div>
                {user.phone && <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><Phone className="w-4 h-4" /><span>{user.phone}</span></div>}
                {activeTab === 'drivers' && user.vehicle_type && <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><Truck className="w-4 h-4" /><span>{user.vehicle_type} {user.vehicle_plate ? `· ${user.vehicle_plate}` : ''}</span></div>}
                {activeTab === 'clients' && user.company && <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><Building className="w-4 h-4" /><span>{user.company}</span></div>}
              </div>

              {/* Stats */}
              <div className="flex gap-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl mb-4">
                {activeTab === 'clients' ? (
                  <>
                    <div className="flex-1 text-center"><p className="text-lg font-bold text-gray-900 dark:text-white">{user.total_orders ?? 0}</p><p className="text-xs text-gray-500">Orders</p></div>
                    <div className="flex-1 text-center border-l border-gray-200 dark:border-slate-600"><p className="text-lg font-bold text-gray-900 dark:text-white">${(user.total_spent || 0).toFixed(0)}</p><p className="text-xs text-gray-500">Spent</p></div>
                  </>
                ) : activeTab === 'drivers' ? (
                  <>
                    <div className="flex-1 text-center"><p className="text-lg font-bold text-gray-900 dark:text-white">{user.total_deliveries ?? 0}</p><p className="text-xs text-gray-500">Deliveries</p></div>
                    <div className="flex-1 text-center border-l border-gray-200 dark:border-slate-600"><p className="text-lg font-bold text-yellow-500 flex items-center justify-center gap-1"><Star className="w-4 h-4 fill-current" />{user.rating ?? '0.0'}</p><p className="text-xs text-gray-500">Rating</p></div>
                  </>
                ) : (
                  <div className="flex-1 text-center"><p className="text-xs text-gray-500">Admin user</p></div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button fullWidth variant="outline" size="sm" icon={Eye} onClick={() => { setSelectedUser(user); setShowUserModal(true); }}>View</Button>
                <Button variant="ghost" size="sm" icon={Edit} onClick={() => { setEditForm(user); setShowEditModal(true); }} />
                <Button variant={user.status === 'active' ? 'ghost' : 'primary'} size="sm" icon={user.status === 'active' ? XCircle : CheckCircle} onClick={() => handleToggleStatus(user)} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New User" size="lg">
        <form onSubmit={handleAddUser} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label><Input placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label><Input type="email" placeholder="john@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label><Input type="password" placeholder="Min. 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={[{ value: 'client', label: 'Client' }, { value: 'driver', label: 'Driver' }, { value: 'admin', label: 'Admin' }]} /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label><Input placeholder="+1 234 567 8900" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} /></div>
            {form.role === 'client' && (
              <>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label><Input placeholder="Company name" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label><Input placeholder="Street address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              </>
            )}
            {form.role === 'driver' && (
              <>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Type</label><Input placeholder="Van, Truck, Bike" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Plate</label><Input placeholder="NYC-1234" value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">License Number</label><Input placeholder="DL12345678" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /></div>
              </>
            )}
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
            <Button type="button" variant="outline" fullWidth onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button type="submit" fullWidth disabled={submitting}>{submitting ? 'Creating…' : 'Create User'}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit User" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label><Input value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label><Input type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label><Input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label><Select value={editForm.status || 'active'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} /></div>
            {editForm.role === 'client' && <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label><Input value={editForm.company || ''} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} /></div>}
            {editForm.role === 'driver' && (
              <>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Type</label><Input value={editForm.vehicle_type || ''} onChange={(e) => setEditForm({ ...editForm, vehicle_type: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehicle Plate</label><Input value={editForm.vehicle_plate || ''} onChange={(e) => setEditForm({ ...editForm, vehicle_plate: e.target.value })} /></div>
              </>
            )}
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
            <Button variant="outline" fullWidth onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button fullWidth onClick={handleEditUser} disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </div>
      </Modal>

      {/* User Details Modal */}
      <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title="User Details" size="lg">
        {selectedUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-bold text-2xl">{selectedUser.name.charAt(0)}</div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedUser.name}</h3>
                <p className="text-gray-500 capitalize">{selectedUser.role} · ID: {selectedUser.id}</p>
              </div>
              {getStatusBadge(selectedUser.status)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><div className="flex items-center gap-2 mb-2"><Mail className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Email</span></div><p className="font-medium text-gray-900 dark:text-white">{selectedUser.email}</p></div>
              <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><div className="flex items-center gap-2 mb-2"><Phone className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Phone</span></div><p className="font-medium text-gray-900 dark:text-white">{selectedUser.phone || '—'}</p></div>
              <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><div className="flex items-center gap-2 mb-2"><Calendar className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Joined</span></div><p className="font-medium text-gray-900 dark:text-white">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : '—'}</p></div>
              {selectedUser.role === 'driver' && <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl"><div className="flex items-center gap-2 mb-2"><Truck className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Vehicle</span></div><p className="font-medium text-gray-900 dark:text-white">{selectedUser.vehicle_type || '—'} {selectedUser.vehicle_plate ? `(${selectedUser.vehicle_plate})` : ''}</p></div>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {selectedUser.role === 'client' ? (
                <>
                  <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl text-center"><p className="text-2xl font-bold text-primary-600">{selectedUser.total_orders ?? 0}</p><p className="text-sm text-gray-500">Total Orders</p></div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-center"><p className="text-2xl font-bold text-green-600">${(selectedUser.total_spent || 0).toFixed(0)}</p><p className="text-sm text-gray-500">Total Spent</p></div>
                </>
              ) : selectedUser.role === 'driver' ? (
                <>
                  <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl text-center"><p className="text-2xl font-bold text-primary-600">{selectedUser.total_deliveries ?? 0}</p><p className="text-sm text-gray-500">Deliveries</p></div>
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl text-center"><p className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1"><Star className="w-5 h-5 fill-current" />{selectedUser.rating ?? '0.0'}</p><p className="text-sm text-gray-500">Rating</p></div>
                </>
              ) : null}
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
              <Button variant="outline" icon={Key} onClick={() => { setShowResetPasswordModal(true); }}>Reset Password</Button>
              <Button variant={selectedUser.status === 'active' ? 'danger' : 'primary'} icon={selectedUser.status === 'active' ? XCircle : CheckCircle} fullWidth onClick={() => { handleToggleStatus(selectedUser); setShowUserModal(false); }}>
                {selectedUser.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="danger" icon={Trash2} onClick={() => { setDeletingUser(selectedUser); setShowDeleteModal(true); setShowUserModal(false); }}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={showResetPasswordModal} onClose={() => { setShowResetPasswordModal(false); setNewPassword(''); }} title="Reset Password" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Set a new password for <span className="font-semibold">{selectedUser?.name}</span></p>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label><Input type="password" placeholder="Min. 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <div className="flex gap-3"><Button variant="outline" fullWidth onClick={() => { setShowResetPasswordModal(false); setNewPassword(''); }}>Cancel</Button><Button fullWidth onClick={handleResetPassword}>Reset Password</Button></div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeletingUser(null); }} title="Delete User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-white">{deletingUser?.name}</span>? This action cannot be undone.</p>
          <div className="flex gap-3"><Button variant="outline" fullWidth onClick={() => setShowDeleteModal(false)}>Cancel</Button><Button variant="danger" fullWidth onClick={handleDeleteUser}>Delete User</Button></div>
        </div>
      </Modal>
    </div>
  );
};

export default Users;
