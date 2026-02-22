import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Package, 
  ChevronLeft, 
  ChevronRight,
  Truck
} from 'lucide-react';

const Sidebar = ({ 
  items, 
  collapsed, 
  onToggle,
  logo = { icon: Truck, text: 'SwiftTrack' }
}) => {
  const location = useLocation();
  const Logo = logo.icon;

  return (
    <aside className={`
      fixed top-0 left-0 h-full z-40
      bg-white dark:bg-slate-800 
      border-r border-gray-100 dark:border-slate-700
      transition-all duration-300 ease-in-out
      ${collapsed ? 'w-20' : 'w-64'}
    `}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="p-2 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-xl flex-shrink-0">
            <Logo className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <span className="font-bold text-xl bg-gradient-to-r from-primary-600 to-secondary-500 bg-clip-text text-transparent whitespace-nowrap">
              {logo.text}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 
                   dark:hover:text-gray-300 dark:hover:bg-slate-700 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || 
                          (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 px-3 py-3 rounded-xl
                transition-all duration-200 group relative
                ${isActive 
                  ? 'bg-gradient-to-r from-primary-500/10 to-secondary-500/10 text-primary-600 dark:text-primary-400' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-white'
                }
              `}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />
              )}
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-primary-500' : ''}`} />
              {!collapsed && (
                <span className="font-medium whitespace-nowrap">{item.label}</span>
              )}
              {collapsed && (
                <div className="
                  absolute left-full ml-2 px-2 py-1 
                  bg-gray-900 text-white text-sm rounded-lg
                  opacity-0 pointer-events-none group-hover:opacity-100
                  transition-opacity whitespace-nowrap z-50
                ">
                  {item.label}
                </div>
              )}
              {item.badge && !collapsed && (
                <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-600 
                               dark:bg-primary-900/30 dark:text-primary-400 rounded-full">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
