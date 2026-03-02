import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Truck, User, Phone, Building,
  Shield, CheckCircle, Users, Globe2, Zap, BarChart3, Route,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const { register, loading } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (!agreeTerms) newErrors.terms = 'You must agree to the terms';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    const result = await register(formData);
    if (result.success) {
      toast.success('Account created successfully!');
      navigate('/client/dashboard', { replace: true });
    } else {
      toast.error(result.error || 'Registration failed');
    }
  };

  const inputClass = (error) => `w-full pl-12 pr-4 py-4 rounded-xl bg-white/5 border text-white placeholder:text-white/30
    focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all
    ${error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20 focus:border-primary-500/50'}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 via-transparent to-emerald-600/10" />
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-primary-500/30 to-transparent rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-emerald-500/20 to-transparent rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30">
                <Truck className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">SwiftTrack</h1>
                <p className="text-sm text-white/50">Enterprise Logistics</p>
              </div>
            </div>
          </div>

          <div className="my-auto py-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-white/70">Join 15,000+ companies</span>
            </div>
            
            <h2 className="text-5xl xl:text-6xl font-bold text-white leading-tight mb-6">
              Start shipping
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary-400 via-emerald-400 to-cyan-400">
                smarter today
              </span>
            </h2>
            
            <p className="text-lg text-white/60 max-w-md leading-relaxed mb-12">
              Create your account and unlock powerful logistics tools. Track every package, optimize routes, and delight customers.
            </p>

            <div className="grid grid-cols-2 gap-4 max-w-md">
              {[
                { icon: Route, label: 'Smart Routing', desc: 'AI-optimized paths' },
                { icon: Zap, label: 'Real-time Updates', desc: 'Live tracking' },
                { icon: BarChart3, label: 'Analytics', desc: 'Data insights' },
                { icon: Globe2, label: 'Global Scale', desc: '150+ countries' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-default">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="text-xs text-white/40">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-12">
            {[
              { value: '99.9%', label: 'Uptime' },
              { value: '2M+', label: 'Deliveries' },
              { value: '4.9/5', label: 'Rating' },
            ].map((stat, i) => (
              <div key={i}>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-white/40">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Registration Form */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
        <div className="w-full max-w-[420px]">
          <div className="flex items-center justify-center gap-3 mb-10 lg:hidden">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">SwiftTrack</span>
          </div>

          <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 p-8 sm:p-10 shadow-2xl">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Create account</h2>
              <p className="text-white/50">Get started with your free account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className={inputClass(errors.name)}
                  />
                </div>
                {errors.name && <p className="mt-2 text-sm text-red-400">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@company.com"
                    className={inputClass(errors.email)}
                  />
                </div>
                {errors.email && <p className="mt-2 text-sm text-red-400">{errors.email}</p>}
              </div>

              {/* Phone & Company (Optional) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="Optional"
                      className={inputClass(null)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Company</label>
                  <div className="relative">
                    <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                      type="text"
                      name="company"
                      value={formData.company}
                      onChange={handleChange}
                      placeholder="Optional"
                      className={inputClass(null)}
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    className={`${inputClass(errors.password)} pr-12`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-2 text-sm text-red-400">{errors.password}</p>}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                    className={`${inputClass(errors.confirmPassword)} pr-12`}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="mt-2 text-sm text-red-400">{errors.confirmPassword}</p>}
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-white/20 bg-white/5 text-primary-500 focus:ring-primary-500/50 focus:ring-offset-0"
                />
                <label htmlFor="terms" className="text-sm text-white/50 cursor-pointer">
                  I agree to the{' '}
                  <a href="#" className="text-primary-400 hover:text-primary-300">Terms of Service</a>
                  {' '}and{' '}
                  <a href="#" className="text-primary-400 hover:text-primary-300">Privacy Policy</a>
                </label>
              </div>
              {errors.terms && <p className="text-sm text-red-400">{errors.terms}</p>}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="relative w-full py-4 rounded-xl font-semibold text-white overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-300" />
                <div className={`absolute inset-0 bg-gradient-to-r from-primary-400 to-emerald-500 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />
                <div className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className={`w-5 h-5 transition-transform duration-300 ${isHovered ? 'translate-x-1' : ''}`} />
                    </>
                  )}
                </div>
              </button>
            </form>
          </div>

          <p className="text-center text-white/40 mt-8">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>

          <div className="flex items-center justify-center gap-6 mt-8">
            <div className="flex items-center gap-2 text-white/30">
              <Shield className="w-4 h-4" />
              <span className="text-xs">SSL Secured</span>
            </div>
            <div className="flex items-center gap-2 text-white/30">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs">SOC 2</span>
            </div>
            <div className="flex items-center gap-2 text-white/30">
              <Users className="w-4 h-4" />
              <span className="text-xs">GDPR</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
