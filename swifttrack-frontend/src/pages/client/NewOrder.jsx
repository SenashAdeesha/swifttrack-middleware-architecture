import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, Marker } from '@react-google-maps/api';
import {
  MapPin, Package, Scale, Zap, Calendar, ArrowLeft, CheckCircle,
  User, Phone, Mail, Ruler, Shield, Clock, DollarSign, Save,
  AlertCircle, Box, FileText, AlertTriangle, PenLine, Sunrise, Sun, Sunset,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, Button, Input, Select, Modal, MapPicker } from '../../components/common';
import { ordersAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { PACKAGE_TYPES, PRIORITIES } from '../../data/mockData';
import toast from 'react-hot-toast';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBqHwJGmEk2G4vKXGXk3FqH_4RJWOg8i-M';

const TIME_SLOTS = [
  { value: 'morning', label: 'Morning (8 AM - 12 PM)', desc: 'Best for residential', Icon: Sunrise },
  { value: 'afternoon', label: 'Afternoon (12 PM - 5 PM)', desc: 'Standard hours', Icon: Sun },
  { value: 'evening', label: 'Evening (5 PM - 9 PM)', desc: 'After work delivery', Icon: Sunset },
];

const POPULAR_LOCATIONS = [
  { name: 'Colombo City Center', lat: 6.9271, lng: 79.8612, address: 'Colombo Fort, Colombo' },
  { name: 'Kandy City Center', lat: 7.2906, lng: 80.6337, address: 'Kandy City Center, Kandy' },
  { name: 'Galle Fort', lat: 6.0535, lng: 80.2210, address: 'Galle Fort, Galle' },
  { name: 'Negombo Beach', lat: 7.2084, lng: 79.8358, address: 'Negombo Beach, Negombo' },
  { name: 'Mount Lavinia', lat: 6.8378, lng: 79.8636, address: 'Mount Lavinia, Colombo' },
  { name: 'Dehiwala Zoo', lat: 6.8565, lng: 79.8759, address: 'Dehiwala Zoo, Dehiwala' },
];

const INSURANCE_OPTIONS = [
  { value: 'none', label: 'No Insurance', price: 0, coverage: '$0' },
  { value: 'basic', label: 'Basic Coverage', price: 4.99, coverage: 'Up to $100' },
  { value: 'standard', label: 'Standard Coverage', price: 9.99, coverage: 'Up to $500' },
  { value: 'premium', label: 'Premium Coverage', price: 19.99, coverage: 'Up to $2,000' },
];

const NewOrder = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLoaded, loadError } = useGoogleMaps();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showDeliveryMap, setShowDeliveryMap] = useState(false);
  const [showInlineMap, setShowInlineMap] = useState(false);
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 6.9271, lng: 79.8612 }); // Colombo
  const [formData, setFormData] = useState({
    // Delivery
    deliveryAddress: '',
    deliveryCity: '',
    deliveryZip: '',
    // Recipient
    recipientName: '',
    recipientPhone: '',
    recipientEmail: '',
    // Package
    packageWeight: '',
    packageLength: '',
    packageWidth: '',
    packageHeight: '',
    packageType: '',
    packageValue: '',
    // Options
    priority: 'normal',
    deliveryDate: '',
    timeSlot: 'afternoon',
    insurance: 'none',
    fragile: false,
    signatureRequired: false,
    notes: '',
    deliveryLat: '',
    deliveryLng: '',
  });
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleDeliveryLocationSelect = (location) => {
    setDeliveryCoords({ lat: location.lat, lng: location.lng });
    setFormData(prev => ({
      ...prev,
      deliveryAddress: location.address,
      deliveryLat: location.lat,
      deliveryLng: location.lng,
    }));
    if (errors.deliveryAddress) setErrors(prev => ({ ...prev, deliveryAddress: '' }));
  };

  const handleMapClick = async (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setDeliveryCoords({ lat, lng });
    setMapCenter({ lat, lng });
    
    // Reverse geocode
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const address = data.results[0].formatted_address;
        setFormData(prev => ({
          ...prev,
          deliveryAddress: address,
          deliveryLat: lat,
          deliveryLng: lng,
        }));
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  };

  const validateStep = (currentStep) => {
    const newErrors = {};
    if (currentStep === 1) {
      if (!formData.deliveryAddress.trim()) newErrors.deliveryAddress = 'Delivery address is required';
      if (!formData.recipientName.trim()) newErrors.recipientName = 'Recipient name is required';
      if (!formData.recipientPhone.trim()) newErrors.recipientPhone = 'Recipient phone is required';
    }
    if (currentStep === 2) {
      if (!formData.packageWeight) newErrors.packageWeight = 'Weight is required';
      else if (isNaN(formData.packageWeight) || parseFloat(formData.packageWeight) <= 0) newErrors.packageWeight = 'Enter a valid weight';
      if (!formData.packageType) newErrors.packageType = 'Package type is required';
    }
    if (currentStep === 3) {
      if (!formData.deliveryDate) newErrors.deliveryDate = 'Delivery date is required';
      else if (new Date(formData.deliveryDate) < new Date().setHours(0,0,0,0)) newErrors.deliveryDate = 'Date must be in the future';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => { if (validateStep(step)) setStep(step + 1); };
  const handleBack = () => setStep(step - 1);

  const calculateCost = () => {
    let base = 9.99;
    const w = parseFloat(formData.packageWeight) || 0;
    if (w > 5) base += (w - 5) * 0.5;
    if (formData.priority === 'express') base *= 1.5;
    if (formData.priority === 'same_day') base *= 2;
    const ins = INSURANCE_OPTIONS.find(i => i.value === formData.insurance)?.price || 0;
    return (base + ins).toFixed(2);
  };

  const handleSaveDraft = () => {
    localStorage.setItem('orderDraft', JSON.stringify(formData));
    toast.success('Draft saved!');
    setShowDraftModal(false);
  };

  const handleLoadDraft = () => {
    const draft = localStorage.getItem('orderDraft');
    if (draft) {
      setFormData(JSON.parse(draft));
      toast.success('Draft loaded');
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;
    setLoading(true);
    try {
      const orderData = {
        ...formData,
        clientId: user?.id,
        clientName: user?.name,
        packageWeight: parseFloat(formData.packageWeight),
        estimatedDelivery: new Date(formData.deliveryDate).toISOString(),
        estimatedCost: calculateCost(),
        deliveryLat: formData.deliveryLat || null,
        deliveryLng: formData.deliveryLng || null,
      };
      await ordersAPI.create(orderData);
      localStorage.removeItem('orderDraft');
      toast.success('Order created successfully!');
      navigate('/client/orders');
    } catch (error) {
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { number: 1, title: 'Address', icon: MapPin },
    { number: 2, title: 'Package', icon: Package },
    { number: 3, title: 'Schedule', icon: Calendar },
    { number: 4, title: 'Confirm', icon: CheckCircle },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create New Order</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Fill in the details to schedule a delivery</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleLoadDraft} icon={FileText}>Load Draft</Button>
          <Button variant="outline" size="sm" onClick={() => setShowDraftModal(true)} icon={Save}>Save Draft</Button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {steps.map((s, index) => {
          const Icon = s.icon;
          const isActive = step === s.number;
          const isCompleted = step > s.number;
          return (
            <div key={s.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isCompleted ? 'bg-green-500 text-white' : isActive ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30' : 'bg-gray-100 dark:bg-slate-700 text-gray-400'}`}>
                  {isCompleted ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                </div>
                <span className={`mt-2 text-sm font-medium ${isActive || isCompleted ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{s.title}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`h-1 flex-1 mx-2 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Form Steps */}
      <Card padding="lg">
        {/* Step 1: Address & Recipient */}
        {step === 1 && (
          <div className="space-y-6">
            <CardHeader><CardTitle>Delivery Details</CardTitle><CardDescription>Enter delivery address and recipient information</CardDescription></CardHeader>
            
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Delivery Location
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  icon={MapPin}
                  onClick={() => setShowInlineMap(!showInlineMap)}
                  className="text-green-600 border-green-300 hover:bg-green-100"
                >
                  {showInlineMap ? 'Hide Selector' : 'Select Location'}
                </Button>
              </div>
              
              {/* Location Selector - Always Available */}
              {showInlineMap && (
                <div className="mb-4 bg-white dark:bg-slate-800 border-2 border-green-300 dark:border-green-700 rounded-lg p-4">
                  {/* Preset Locations */}
                  <div className="mb-4">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-green-600" />
                      Popular Locations in Sri Lanka
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {POPULAR_LOCATIONS.map((loc) => (
                        <button
                          key={loc.name}
                          type="button"
                          onClick={() => {
                            setDeliveryCoords({ lat: loc.lat, lng: loc.lng });
                            setMapCenter({ lat: loc.lat, lng: loc.lng });
                            setFormData(prev => ({
                              ...prev,
                              deliveryAddress: loc.address,
                              deliveryLat: loc.lat,
                              deliveryLng: loc.lng,
                            }));
                            toast.success(`Selected: ${loc.name}`);
                          }}
                          className={`px-4 py-3 bg-white dark:bg-slate-700 hover:bg-green-50 dark:hover:bg-slate-600 border-2 transition-all ${
                            deliveryCoords?.lat === loc.lat && deliveryCoords?.lng === loc.lng
                              ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                              : 'border-gray-200 dark:border-slate-600'
                          } rounded-lg text-left`}
                        >
                          <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{loc.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{loc.address}</div>
                          <div className="text-[10px] text-green-600 dark:text-green-400 mt-1">
                            📍 {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Manual Entry */}
                  <div className="border-t border-gray-200 dark:border-slate-600 pt-4">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Or Enter Custom Coordinates
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Latitude</label>
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="6.9271"
                          value={formData.deliveryLat || ''}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                          onChange={(e) => {
                            const lat = parseFloat(e.target.value);
                            if (!isNaN(lat)) {
                              setDeliveryCoords(prev => ({ ...prev, lat, lng: prev?.lng || 79.8612 }));
                              setFormData(prev => ({ ...prev, deliveryLat: lat }));
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Longitude</label>
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="79.8612"
                          value={formData.deliveryLng || ''}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                          onChange={(e) => {
                            const lng = parseFloat(e.target.value);
                            if (!isNaN(lng)) {
                              setDeliveryCoords(prev => ({ lat: prev?.lat || 6.9271, lng }));
                              setFormData(prev => ({ ...prev, deliveryLng: lng }));
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        💡 <strong>Tip:</strong> Find coordinates on{' '}
                        <a 
                          href="https://www.google.com/maps" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="underline hover:text-blue-800 font-medium"
                        >
                          Google Maps
                        </a>{' '}
                        by right-clicking → "What's here?"
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Input label="Street Address" name="deliveryAddress" placeholder="456 Oak Avenue" value={formData.deliveryAddress} onChange={handleChange} error={errors.deliveryAddress} />
                  {deliveryCoords && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Location selected: Lat {deliveryCoords.lat.toFixed(4)}, Lng {deliveryCoords.lng.toFixed(4)}
                    </p>
                  )}
                </div>
                <Input label="City" name="deliveryCity" placeholder="City" value={formData.deliveryCity} onChange={handleChange} />
              </div>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
              <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2"><User className="w-4 h-4" /> Recipient Information</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Full Name" name="recipientName" placeholder="John Smith" value={formData.recipientName} onChange={handleChange} error={errors.recipientName} icon={User} />
                <Input label="Phone" name="recipientPhone" placeholder="+1 (555) 123-4567" value={formData.recipientPhone} onChange={handleChange} error={errors.recipientPhone} icon={Phone} />
                <Input label="Email (optional)" name="recipientEmail" type="email" placeholder="john@example.com" value={formData.recipientEmail} onChange={handleChange} icon={Mail} />
              </div>
            </div>

            <div className="flex justify-end"><Button onClick={handleNext}>Continue</Button></div>
          </div>
        )}

        {/* Step 2: Package Details */}
        {step === 2 && (
          <div className="space-y-6">
            <CardHeader><CardTitle>Package Details</CardTitle><CardDescription>Provide information about your package</CardDescription></CardHeader>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Input label="Weight (kg)" name="packageWeight" type="number" placeholder="2.5" value={formData.packageWeight} onChange={handleChange} error={errors.packageWeight} icon={Scale} />
              <Input label="Length (cm)" name="packageLength" type="number" placeholder="30" value={formData.packageLength} onChange={handleChange} icon={Ruler} />
              <Input label="Width (cm)" name="packageWidth" type="number" placeholder="20" value={formData.packageWidth} onChange={handleChange} icon={Ruler} />
              <Input label="Height (cm)" name="packageHeight" type="number" placeholder="10" value={formData.packageHeight} onChange={handleChange} icon={Ruler} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Package Type" name="packageType" value={formData.packageType} onChange={handleChange} error={errors.packageType} options={PACKAGE_TYPES.map(t => ({ value: t.value, label: t.label }))} placeholder="Select type" />
              <Input label="Declared Value ($)" name="packageValue" type="number" placeholder="100" value={formData.packageValue} onChange={handleChange} icon={DollarSign} />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Priority Level</label>
              <div className="grid grid-cols-3 gap-3">
                {PRIORITIES.map((p) => (
                  <button key={p.value} type="button" onClick={() => setFormData(prev => ({ ...prev, priority: p.value }))}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${formData.priority === p.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className={`w-4 h-4 ${p.value === 'same_day' ? 'text-red-500' : p.value === 'express' ? 'text-orange-500' : 'text-blue-500'}`} />
                      <span className="font-semibold text-gray-900 dark:text-white">{p.label}</span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{p.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Special Options */}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-700 rounded-xl cursor-pointer">
                <input type="checkbox" name="fragile" checked={formData.fragile} onChange={handleChange} className="w-5 h-5 accent-primary-600" />
                <div className="flex flex-col"><span className="font-medium text-gray-900 dark:text-white flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-yellow-500" /> Fragile Package</span><p className="text-xs text-gray-500">Handle with extra care</p></div>
              </label>
              <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-700 rounded-xl cursor-pointer">
                <input type="checkbox" name="signatureRequired" checked={formData.signatureRequired} onChange={handleChange} className="w-5 h-5 accent-primary-600" />
                <div className="flex flex-col"><span className="font-medium text-gray-900 dark:text-white flex items-center gap-1"><PenLine className="w-4 h-4 text-blue-500" /> Signature Required</span><p className="text-xs text-gray-500">Recipient must sign</p></div>
              </label>
            </div>

            <div className="flex justify-between"><Button variant="ghost" onClick={handleBack}>Back</Button><Button onClick={handleNext}>Continue</Button></div>
          </div>
        )}

        {/* Step 3: Schedule & Insurance */}
        {step === 3 && (
          <div className="space-y-6">
            <CardHeader><CardTitle>Delivery Schedule</CardTitle><CardDescription>Choose your preferred delivery time and insurance</CardDescription></CardHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Delivery Date" name="deliveryDate" type="date" value={formData.deliveryDate} onChange={handleChange} error={errors.deliveryDate} min={new Date().toISOString().split('T')[0]} />
              <Select label="Time Slot" name="timeSlot" value={formData.timeSlot} onChange={handleChange} options={TIME_SLOTS.map(t => ({ value: t.value, label: t.label }))} />
            </div>

            {/* Insurance */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Insurance Coverage</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {INSURANCE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setFormData(prev => ({ ...prev, insurance: opt.value }))}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${formData.insurance === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'}`}>
                    <p className="font-bold text-gray-900 dark:text-white">{opt.price > 0 ? `$${opt.price}` : 'Free'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{opt.label}</p>
                    <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">{opt.coverage}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Special Instructions (Optional)</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Leave at door, ring bell twice, call before delivery…" rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>

            <div className="flex justify-between"><Button variant="ghost" onClick={handleBack}>Back</Button><Button onClick={handleNext}>Review Order</Button></div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <div className="space-y-6">
            <CardHeader><CardTitle>Order Summary</CardTitle><CardDescription>Review your order details before submission</CardDescription></CardHeader>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">Delivery Address</h4>
                <p className="text-gray-900 dark:text-white">{formData.deliveryAddress}</p>
                <p className="text-sm text-gray-500">{formData.deliveryCity}</p>
              </div>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
              <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-2">Recipient</h4>
              <p className="text-gray-900 dark:text-white font-medium">{formData.recipientName}</p>
              <p className="text-sm text-gray-500">{formData.recipientPhone} {formData.recipientEmail && `• ${formData.recipientEmail}`}</p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Package Details</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><span className="text-xs text-gray-400">Weight</span><p className="text-gray-900 dark:text-white font-medium">{formData.packageWeight} kg</p></div>
                <div><span className="text-xs text-gray-400">Type</span><p className="text-gray-900 dark:text-white font-medium capitalize">{formData.packageType?.replace('_', ' ')}</p></div>
                <div><span className="text-xs text-gray-400">Priority</span><p className="text-gray-900 dark:text-white font-medium capitalize">{formData.priority?.replace('_', ' ')}</p></div>
                <div><span className="text-xs text-gray-400">Insurance</span><p className="text-gray-900 dark:text-white font-medium capitalize">{formData.insurance}</p></div>
              </div>
              <div className="flex gap-3 mt-3">
                {formData.fragile && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> Fragile</span>}
                {formData.signatureRequired && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full flex items-center gap-1 w-fit"><PenLine className="w-3 h-3" /> Signature</span>}
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Delivery Schedule</h4>
              <p className="text-gray-900 dark:text-white font-medium">{formData.deliveryDate ? new Date(formData.deliveryDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</p>
              <p className="text-sm text-gray-500">{TIME_SLOTS.find(t => t.value === formData.timeSlot)?.label}</p>
            </div>

            {formData.notes && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">Special Instructions</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{formData.notes}</p>
              </div>
            )}

            {/* Estimated Cost */}
            <div className="p-6 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-xl text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-80">Estimated Total</p>
                  <p className="text-3xl font-bold">${calculateCost()}</p>
                </div>
                <DollarSign className="w-12 h-12 opacity-50" />
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={handleBack}>Back</Button>
              <Button onClick={handleSubmit} loading={loading} icon={CheckCircle}>Submit Order</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Save Draft Modal */}
      <Modal isOpen={showDraftModal} onClose={() => setShowDraftModal(false)} title="Save Draft" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Save your current progress and continue later.</p>
          <div className="flex gap-3">
            <Button fullWidth variant="outline" onClick={() => setShowDraftModal(false)}>Cancel</Button>
            <Button fullWidth icon={Save} onClick={handleSaveDraft}>Save Draft</Button>
          </div>
        </div>
      </Modal>

      {/* Map Picker Modal */}
      <MapPicker
        isOpen={showDeliveryMap}
        onClose={() => setShowDeliveryMap(false)}
        onSelectLocation={handleDeliveryLocationSelect}
        initialLocation={deliveryCoords}
        title="Select Delivery Location"
      />
    </div>
  );
};

export default NewOrder;
