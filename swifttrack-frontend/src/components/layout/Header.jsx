import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Bell, 
  Search, 
  Moon, 
  Sun, 
  LogOut, 
  User, 
  Settings,
  ChevronRight,
  Menu
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../context/NotificationContext';
import Avatar from '../common/Avatar';

const Header = ({ onMenuClick, showMenuButton = false }) => {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const notificationRef = useRef(null);
  const userMenuRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate breadcrumb from path
  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    return paths.map((path, index) => ({
      label: path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' '),
      path: '/' + paths.slice(0, index + 1).join('/'),
      isLast: index === paths.length - 1,
    }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="h-16 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left side - Menu button and Breadcrumb */}
      <div className="flex items-center gap-4">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        
        {/* Breadcrumb */}
        <nav className="hidden sm:flex items-center gap-2 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.path} className="flex items-center gap-2">
              {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
              <span className={crumb.isLast 
                ? 'font-medium text-gray-900 dark:text-white' 
                : 'text-gray-500 dark:text-gray-400'
              }>
                {crumb.label}
              </span>
            </div>
          ))}
        </nav>
      </div>

      {/* Right side - Search, notifications, theme, user */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="hidden md:flex items-center relative">
          <Search className="absolute left-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 pl-10 pr-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 
                     text-gray-900 dark:text-white text-sm
                     border-none focus:outline-none focus:ring-2 focus:ring-primary-500
                     placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 
                   dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-slate-700 transition-colors"
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2.5 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 
                     dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-slate-700 
                     transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs 
                             rounded-full flex items-center justify-center font-medium">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-lg 
                          border border-gray-100 dark:border-slate-700 overflow-hidden z-50">
              <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 5).map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => markAsRead(notification.id)}
                      className={`p-4 border-b border-gray-100 dark:border-slate-700 last:border-0 
                                hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors
                                ${!notification.read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 
                          ${notification.type === 'alert' ? 'bg-red-500' : 
                            notification.type === 'delivery' ? 'bg-green-500' : 
                            notification.type === 'route' ? 'bg-blue-500' : 'bg-gray-400'}`} 
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {notification.time}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-3 border-t border-gray-100 dark:border-slate-700">
                <button 
                  onClick={() => {
                    setShowNotifications(false);
                    navigate(`/${user?.role}/notifications`);
                  }}
                  className="w-full text-center text-sm text-primary-600 hover:text-primary-700 
                           dark:text-primary-400 font-medium"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Avatar initials={user?.avatar} size="sm" status="online" />
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
            </div>
          </button>

          {/* User Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-lg 
                          border border-gray-100 dark:border-slate-700 overflow-hidden z-50">
              <div className="p-4 border-b border-gray-100 dark:border-slate-700">
                <p className="font-medium text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
              </div>
              <div className="p-2">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate(`/${user?.role}/profile`);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 
                           rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    // Navigate to settings if available
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 
                           rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </div>
              <div className="p-2 border-t border-gray-100 dark:border-slate-700">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 
                           rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
