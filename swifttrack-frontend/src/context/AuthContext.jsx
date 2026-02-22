import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// API Configuration
const USE_REAL_BACKEND = true;
const API_BASE_URL = 'http://localhost:5002';

// Demo users for testing (fallback when backend is unavailable)
const DEMO_USERS = {
  'client@swifttrack.com': {
    id: '1',
    email: 'client@swifttrack.com',
    name: 'John Client',
    role: 'client',
    phone: '+1 234 567 8901',
    avatar: null,
    company: 'ABC Logistics'
  },
  'driver@swifttrack.com': {
    id: '2',
    email: 'driver@swifttrack.com',
    name: 'Mike Driver',
    role: 'driver',
    phone: '+1 234 567 8902',
    avatar: null,
    vehicleType: 'Van',
    licensePlate: 'ABC-1234',
    status: 'available'
  },
  'admin@swifttrack.com': {
    id: '3',
    email: 'admin@swifttrack.com',
    name: 'Sarah Admin',
    role: 'admin',
    phone: '+1 234 567 8903',
    avatar: null,
    department: 'Operations'
  }
};

const DEMO_PASSWORD = 'password123';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check for existing session on mount
    const storedUser = localStorage.getItem('swifttrack_user');
    
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('swifttrack_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    
    if (USE_REAL_BACKEND) {
      try {
        const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
          email: email.toLowerCase().trim(),
          password
        });
        
        if (response.data.success) {
          const userData = response.data.user;
          const token = response.data.token;
          
          localStorage.setItem('swifttrack_user', JSON.stringify(userData));
          localStorage.setItem('swifttrack_token', token);
          setUser(userData);
          setLoading(false);
          return { success: true, user: userData };
        }
      } catch (err) {
        setLoading(false);
        const message = err.response?.data?.error || 'Login failed. Please try again.';
        setError(message);
        return { success: false, error: message };
      }
    }
    
    // Fallback to demo users
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const demoUser = DEMO_USERS[email.toLowerCase()];
    
    if (demoUser && password === DEMO_PASSWORD) {
      localStorage.setItem('swifttrack_user', JSON.stringify(demoUser));
      setUser(demoUser);
      setLoading(false);
      return { success: true, user: demoUser };
    }
    
    setLoading(false);
    const message = 'Invalid email or password';
    setError(message);
    return { success: false, error: message };
  };

  const register = async (userData) => {
    setLoading(true);
    setError(null);
    
    if (USE_REAL_BACKEND) {
      try {
        const response = await axios.post(`${API_BASE_URL}/api/auth/register`, {
          email: userData.email.toLowerCase().trim(),
          password: userData.password,
          name: userData.name,
          role: userData.role || 'client',
          phone: userData.phone || ''
        });
        
        if (response.data.success) {
          const newUser = response.data.user;
          const token = response.data.token;
          
          localStorage.setItem('swifttrack_user', JSON.stringify(newUser));
          localStorage.setItem('swifttrack_token', token);
          setUser(newUser);
          setLoading(false);
          return { success: true, user: newUser };
        }
      } catch (err) {
        setLoading(false);
        const message = err.response?.data?.error || 'Registration failed. Please try again.';
        setError(message);
        return { success: false, error: message };
      }
    }
    
    // Fallback for demo mode
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // For demo, create a new user
    const newUser = {
      id: Date.now().toString(),
      email: userData.email,
      name: userData.name,
      role: userData.role || 'client',
      phone: userData.phone || '',
      avatar: null
    };
    
    localStorage.setItem('swifttrack_user', JSON.stringify(newUser));
    setUser(newUser);
    setLoading(false);
    return { success: true, user: newUser };
  };

  const logout = async () => {
    if (USE_REAL_BACKEND) {
      try {
        const token = localStorage.getItem('swifttrack_token');
        if (token) {
          await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      } catch (err) {
        // Ignore logout API errors
      }
    }
    localStorage.removeItem('swifttrack_user');
    localStorage.removeItem('swifttrack_token');
    setUser(null);
  };

  const updateProfile = async (updates) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      localStorage.setItem('swifttrack_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      return { success: true };
    }
    return { success: false, error: 'No user logged in' };
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    updateProfile,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
