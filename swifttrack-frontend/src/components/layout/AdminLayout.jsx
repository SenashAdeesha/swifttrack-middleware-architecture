import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  FileText,
  BarChart3,
  Shield,
  Navigation,
  Bell,
  Activity,
} from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';

const adminNavItems = [
  { path: '/admin/dashboard', label: 'Dashboard',       icon: LayoutDashboard },
  { path: '/admin/users',     label: 'User Management', icon: Users           },
  { path: '/admin/orders',    label: 'Order Monitoring', icon: Package         },
  { path: '/admin/tracking',  label: 'Order Tracking',  icon: Navigation      },
  { path: '/admin/service-activity', label: 'Service Activity', icon: Activity },
  { path: '/admin/logs',      label: 'System Logs',      icon: FileText        },
  { path: '/admin/analytics', label: 'Analytics',        icon: BarChart3       },
  { path: '/admin/notifications', label: 'Notifications', icon: Bell           },
];

const AdminLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 
        transform transition-transform duration-300 lg:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <Sidebar 
          items={adminNavItems}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          logo={{ icon: Shield, text: 'SwiftTrack Admin' }}
        />
      </div>

      {/* Main Content */}
      <div className={`
        transition-all duration-300
        ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}
      `}>
        <Header 
          onMenuClick={() => setMobileMenuOpen(true)} 
          showMenuButton 
        />
        <main className="p-6">
          <div className="page-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
