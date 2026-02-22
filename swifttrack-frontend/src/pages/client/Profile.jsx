import { useState } from 'react';
import {
  User, Lock, CreditCard, MapPin, Bell, Settings, Camera, Globe, Phone, Mail,
  Building, Check, Plus, Trash2, Edit2, Save,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, Modal, Input } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [showAddAddressModal, setShowAddAddressModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState({
    fullName: user?.name || 'John Doe',
    email: user?.email || 'john@example.com',
    phone: '+1 234 567 8900',
    company: 'Acme Corp',
    language: 'en',
    timezone: 'America/New_York',
  });

  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

  const [addresses, setAddresses] = useState([
    { id: 1, label: 'Home', address: '123 Main St, New York, NY 10001', isDefault: true },
    { id: 2, label: 'Office', address: '456 Business Ave, Suite 200, NY 10002', isDefault: false },
  ]);

  const [newAddress, setNewAddress] = useState({ label: '', address: '', isDefault: false });

  const [notifications, setNotifications] = useState({
    emailDelivery: true,
    emailPromo: false,
    smsDelivery: true,
    smsPromo: false,
    pushDelivery: true,
    pushPromo: true,
  });

  const [billingHistory] = useState([
    { id: 'INV-001', date: '2024-01-15', amount: 45.00, status: 'paid' },
    { id: 'INV-002', date: '2024-01-10', amount: 32.50, status: 'paid' },
    { id: 'INV-003', date: '2024-01-05', amount: 78.00, status: 'paid' },
  ]);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'addresses', label: 'Addresses', icon: MapPin },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  const handleProfileUpdate = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    toast.success('Profile updated successfully!');
    setLoading(false);
  };

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) { toast.error('Passwords do not match'); return; }
    if (passwords.new.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    toast.success('Password changed successfully!');
    setPasswords({ current: '', new: '', confirm: '' });
    setLoading(false);
  };

  const handleAddAddress = () => {
    if (!newAddress.label || !newAddress.address) { toast.error('Please fill all fields'); return; }
    const id = Math.max(...addresses.map(a => a.id), 0) + 1;
    if (newAddress.isDefault) setAddresses(addresses.map(a => ({ ...a, isDefault: false })));
    setAddresses([...addresses, { ...newAddress, id }]);
    setNewAddress({ label: '', address: '', isDefault: false });
    setShowAddAddressModal(false);
    toast.success('Address added!');
  };

  const handleEditAddress = () => {
    setAddresses(addresses.map(a => a.id === editingAddress.id ? editingAddress : (editingAddress.isDefault ? { ...a, isDefault: false } : a)));
    setEditingAddress(null);
    toast.success('Address updated!');
  };

  const handleDeleteAddress = (id) => {
    setAddresses(addresses.filter(a => a.id !== id));
    toast.success('Address deleted!');
  };

  const handleSetDefaultAddress = (id) => {
    setAddresses(addresses.map(a => ({ ...a, isDefault: a.id === id })));
    toast.success('Default address updated!');
  };

  const handleNotificationChange = (key) => {
    setNotifications({ ...notifications, [key]: !notifications[key] });
    toast.success('Notification preference updated!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
            {profile.fullName.charAt(0)}
          </div>
          <button className="absolute -bottom-1 -right-1 w-8 h-8 bg-white dark:bg-slate-800 rounded-lg shadow-lg flex items-center justify-center text-gray-500 hover:text-primary-600 border border-gray-200 dark:border-slate-600">
            <Camera className="w-4 h-4" />
          </button>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.fullName}</h1>
          <p className="text-gray-500 dark:text-gray-400">{profile.email}</p>
          <Badge variant="primary" size="sm" className="mt-1">Premium Member</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition ${activeTab === tab.id ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <Card>
          <CardHeader><CardTitle icon={User}>Personal Information</CardTitle></CardHeader>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="text" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Company</label>
                <div className="relative">
                  <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="text" value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Language</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select value={profile.language} onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                    <option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timezone</label>
                <div className="relative">
                  <Settings className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none">
                    <option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Los_Angeles">Pacific Time</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-slate-700">
              <Button icon={Save} onClick={handleProfileUpdate} loading={loading}>Save Changes</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Addresses Tab */}
      {activeTab === 'addresses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Saved Addresses</h3>
            <Button size="sm" icon={Plus} onClick={() => setShowAddAddressModal(true)}>Add Address</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map(addr => (
              <Card key={addr.id} className={`relative ${addr.isDefault ? 'ring-2 ring-primary-500' : ''}`}>
                <div className="p-5">
                  {addr.isDefault && <Badge variant="primary" size="sm" className="absolute top-4 right-4">Default</Badge>}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white">{addr.label}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{addr.address}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
                    <Button size="sm" variant="ghost" icon={Edit2} onClick={() => setEditingAddress(addr)}>Edit</Button>
                    {!addr.isDefault && <Button size="sm" variant="ghost" icon={Check} onClick={() => handleSetDefaultAddress(addr.id)}>Set Default</Button>}
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => handleDeleteAddress(addr.id)} className="text-red-500 hover:text-red-600">Delete</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <Card>
          <CardHeader><CardTitle icon={Lock}>Change Password</CardTitle></CardHeader>
          <div className="p-6 space-y-6 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Password</label>
              <input type="password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Password</label>
              <input type="password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <p className="text-xs text-gray-400 mt-1">Minimum 8 characters</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Confirm New Password</label>
              <input type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <Button icon={Lock} onClick={handlePasswordChange} loading={loading}>Update Password</Button>
          </div>
        </Card>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <Card>
          <CardHeader><CardTitle icon={Bell}>Notification Preferences</CardTitle></CardHeader>
          <div className="p-6 divide-y divide-gray-100 dark:divide-slate-700">
            {[
              { group: 'Email Notifications', items: [{ key: 'emailDelivery', label: 'Delivery updates', desc: 'Get notified about order status changes' }, { key: 'emailPromo', label: 'Promotions', desc: 'Receive special offers and discounts' }] },
              { group: 'SMS Notifications', items: [{ key: 'smsDelivery', label: 'Delivery updates', desc: 'SMS alerts for order status' }, { key: 'smsPromo', label: 'Promotions', desc: 'SMS special offers' }] },
              { group: 'Push Notifications', items: [{ key: 'pushDelivery', label: 'Delivery updates', desc: 'Push alerts on your device' }, { key: 'pushPromo', label: 'Promotions', desc: 'Push promotional alerts' }] },
            ].map((section, i) => (
              <div key={section.group} className={i > 0 ? 'pt-6' : ''}>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{section.group}</p>
                <div className="space-y-4">
                  {section.items.map(item => (
                    <div key={item.key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{item.label}</p>
                        <p className="text-xs text-gray-400">{item.desc}</p>
                      </div>
                      <button onClick={() => handleNotificationChange(item.key)}
                        className={`relative w-12 h-6 rounded-full transition ${notifications[item.key] ? 'bg-primary-500' : 'bg-gray-300 dark:bg-slate-600'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${notifications[item.key] ? 'translate-x-7' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle icon={CreditCard}>Payment Method</CardTitle></CardHeader>
            <div className="p-6">
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl">
                <div className="text-white">
                  <p className="text-sm opacity-70">Card ending in</p>
                  <p className="text-xl font-bold">•••• 4242</p>
                  <p className="text-xs opacity-70 mt-2">Expires 12/26</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-4" icon={Plus}>Add Payment Method</Button>
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Billing History</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Invoice</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {billingHistory.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                      <td className="py-3 px-6 font-medium text-primary-600">{inv.id}</td>
                      <td className="py-3 px-6 text-gray-500">{inv.date}</td>
                      <td className="py-3 px-6 font-semibold text-gray-900 dark:text-white">${inv.amount.toFixed(2)}</td>
                      <td className="py-3 px-6"><Badge variant="success" size="sm">Paid</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Add Address Modal */}
      <Modal isOpen={showAddAddressModal} onClose={() => setShowAddAddressModal(false)} title="Add Address" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Label</label>
            <input type="text" value={newAddress.label} onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })} placeholder="Home, Office, etc."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</label>
            <textarea value={newAddress.address} onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })} rows={3} placeholder="Street, City, State, ZIP"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newAddress.isDefault} onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })} className="w-4 h-4 accent-primary-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Set as default address</span>
          </label>
          <div className="flex gap-3 pt-2">
            <Button fullWidth variant="outline" onClick={() => setShowAddAddressModal(false)}>Cancel</Button>
            <Button fullWidth onClick={handleAddAddress}>Add Address</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Address Modal */}
      <Modal isOpen={!!editingAddress} onClose={() => setEditingAddress(null)} title="Edit Address" size="md">
        {editingAddress && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Label</label>
              <input type="text" value={editingAddress.label} onChange={(e) => setEditingAddress({ ...editingAddress, label: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</label>
              <textarea value={editingAddress.address} onChange={(e) => setEditingAddress({ ...editingAddress, address: e.target.value })} rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editingAddress.isDefault} onChange={(e) => setEditingAddress({ ...editingAddress, isDefault: e.target.checked })} className="w-4 h-4 accent-primary-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Set as default address</span>
            </label>
            <div className="flex gap-3 pt-2">
              <Button fullWidth variant="outline" onClick={() => setEditingAddress(null)}>Cancel</Button>
              <Button fullWidth onClick={handleEditAddress}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Profile;
