import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Route, 
  Package, 
  BarChart3,
  Truck
} from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';

const driverNavItems = [
  { path: '/driver/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/driver/route', label: 'My Route', icon: Route },
  { path: '/driver/performance', label: 'Performance', icon: BarChart3 },
];

const DriverLayout = () => {
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
          items={driverNavItems}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          logo={{ icon: Truck, text: 'SwiftTrack Driver' }}
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

export default DriverLayout;
