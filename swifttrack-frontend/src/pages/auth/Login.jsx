import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Truck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button, Input } from '../../components/common';
import toast from 'react-hot-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  
  const { login, loading } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || null;

  const validateForm = () => {
    const newErrors = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    const result = await login(email, password);
    
    if (result.success) {
      toast.success(`Welcome back, ${result.user.name}!`);
      // Redirect based on role or previous location
      const roleRoutes = {
        client: '/client/dashboard',
        driver: '/driver/dashboard',
        admin: '/admin/dashboard',
      };
      navigate(from || roleRoutes[result.user.role], { replace: true });
    } else {
      toast.error(result.error || 'Login failed');
    }
  };

  const demoCredentials = [
    { role: 'Client', email: 'client@swifttrack.com', password: 'password123' },
    { role: 'Driver', email: 'driver@swifttrack.com', password: 'password123' },
    { role: 'Admin', email: 'admin@swifttrack.com', password: 'password123' },
  ];

  const fillDemoCredentials = (cred) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setErrors({});
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-600 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-secondary-300 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="p-3 bg-white/20 backdrop-blur rounded-xl">
              <Truck className="w-8 h-8 text-white" />
            </div>
            <span className="text-3xl font-bold text-white">SwiftTrack</span>
          </div>
          
          <div className="max-w-md">
            <h1 className="text-4xl font-bold text-white mb-4">
              Streamline Your Logistics Operations
            </h1>
            <p className="text-lg text-white/80">
              Track deliveries in real-time, manage routes efficiently, and deliver exceptional 
              customer experiences with our powerful logistics platform.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="relative z-10">
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: 'Real-time Tracking', desc: 'Monitor deliveries live' },
              { title: 'Route Optimization', desc: 'Save time and fuel' },
              { title: 'Analytics', desc: 'Data-driven decisions' },
              { title: '24/7 Support', desc: 'Always here to help' },
            ].map((feature, i) => (
              <div key={i} className="p-4 bg-white/10 backdrop-blur rounded-xl">
                <h3 className="font-semibold text-white">{feature.title}</h3>
                <p className="text-sm text-white/70">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50 dark:bg-slate-900">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
            <div className="p-3 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-xl">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-500 bg-clip-text text-transparent">
              SwiftTrack
            </span>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome Back
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              Sign in to continue to your dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              icon={Mail}
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                icon={Lock}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Remember me</span>
              </label>
              <a href="#" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium">
                Forgot password?
              </a>
            </div>

            <Button type="submit" fullWidth loading={loading} size="lg">
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium">
                Sign up
              </Link>
            </p>
          </div>

          {/* Demo Credentials */}
          <div className="mt-8 p-4 bg-gray-100 dark:bg-slate-800 rounded-xl">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Demo Credentials:
            </p>
            <div className="space-y-2">
              {demoCredentials.map((cred) => (
                <button
                  key={cred.role}
                  type="button"
                  onClick={() => fillDemoCredentials(cred)}
                  className="w-full text-left px-3 py-2 text-sm bg-white dark:bg-slate-700 rounded-lg 
                           hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                >
                  <span className="font-medium text-primary-600 dark:text-primary-400">{cred.role}:</span>
                  <span className="text-gray-600 dark:text-gray-400 ml-2">{cred.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
