import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// Client Pages
import ClientDashboard from './pages/client/Dashboard';
import ClientOrders from './pages/client/Orders';
import ClientNewOrder from './pages/client/NewOrder';
import ClientTracking from './pages/client/Tracking';
import ClientNotifications from './pages/client/Notifications';
import ClientProfile from './pages/client/Profile';

// Driver Pages
import DriverDashboard from './pages/driver/Dashboard';
import DriverRoute from './pages/driver/Route';
import DriverDelivery from './pages/driver/Delivery';
import DriverPerformance from './pages/driver/Performance';

// Admin Pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminOrders from './pages/admin/Orders';
import AdminLogs from './pages/admin/Logs';
import AdminAnalytics from './pages/admin/Analytics';

// Layout Components
import ClientLayout from './components/layout/ClientLayout';
import DriverLayout from './components/layout/DriverLayout';
import AdminLayout from './components/layout/AdminLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <Router>
            <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                
                {/* Client Routes */}
                <Route path="/client" element={
                  <ProtectedRoute allowedRoles={['client']}>
                    <ClientLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<ClientDashboard />} />
                  <Route path="orders" element={<ClientOrders />} />
                  <Route path="new-order" element={<ClientNewOrder />} />
                  <Route path="tracking/:orderId" element={<ClientTracking />} />
                  <Route path="tracking" element={<ClientTracking />} />
                  <Route path="notifications" element={<ClientNotifications />} />
                  <Route path="profile" element={<ClientProfile />} />
                </Route>

                {/* Driver Routes */}
                <Route path="/driver" element={
                  <ProtectedRoute allowedRoles={['driver']}>
                    <DriverLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<DriverDashboard />} />
                  <Route path="route" element={<DriverRoute />} />
                  <Route path="delivery/:orderId" element={<DriverDelivery />} />
                  <Route path="performance" element={<DriverPerformance />} />
                </Route>

                {/* Admin Routes */}
                <Route path="/admin" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="logs" element={<AdminLogs />} />
                  <Route path="analytics" element={<AdminAnalytics />} />
                </Route>

                {/* Default redirect */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </div>
          </Router>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1e293b',
                color: '#fff',
                borderRadius: '12px',
              },
            }}
          />
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
