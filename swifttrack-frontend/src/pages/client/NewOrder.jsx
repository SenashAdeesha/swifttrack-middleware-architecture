import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Package, Scale, Zap, Calendar, ArrowLeft, CheckCircle,
  User, Phone, Mail, Ruler, Shield, Clock, DollarSign, Save,
  AlertCircle, Box, FileText,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, Button, Input, Select, Modal } from '../../components/common';
import { ordersAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PACKAGE_TYPES, PRIORITIES } from '../../data/mockData';
import toast from 'react-hot-toast';

const TIME_SLOTS = [
  { value: 'morning', label: '🌅 Morning (8 AM - 12 PM)', desc: 'Best for residential' },
  { value: 'afternoon', label: '☀️ Afternoon (12 PM - 5 PM)', desc: 'Standard hours' },
  { value: 'evening', label: '🌆 Evening (5 PM - 9 PM)', desc: 'After work delivery' },
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
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [formData, setFormData] = useState({
    // Pickup
    pickupAddress: '',
    pickupCity: '',
    pickupZip: '',
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
  });
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateStep = (currentStep) => {
    const newErrors = {};
    if (currentStep === 1) {
      if (!formData.pickupAddress.trim()) newErrors.pickupAddress = 'Pickup address is required';
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
        {/* Step 1: Addresses & Recipient */}
        {step === 1 && (
          <div className="space-y-6">
            <CardHeader><CardTitle>Pickup & Delivery Details</CardTitle><CardDescription>Enter addresses and recipient information</CardDescription></CardHeader>
            
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Pickup Location</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Input label="Street Address" name="pickupAddress" placeholder="123 Main Street" value={formData.pickupAddress} onChange={handleChange} error={errors.pickupAddress} />
                </div>
                <Input label="City" name="pickupCity" placeholder="City" value={formData.pickupCity} onChange={handleChange} />
              </div>
            </div>

            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Delivery Location</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Input label="Street Address" name="deliveryAddress" placeholder="456 Oak Avenue" value={formData.deliveryAddress} onChange={handleChange} error={errors.deliveryAddress} />
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
              <Select label="Package Type" name="packageType" value={formData.packageType} onChange={handleChange} error={errors.packageType} options={PACKAGE_TYPES.map(t => ({ value: t.value, label: `${t.icon} ${t.label}` }))} placeholder="Select type" />
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
                <div><span className="font-medium text-gray-900 dark:text-white">🔮 Fragile Package</span><p className="text-xs text-gray-500">Handle with extra care</p></div>
              </label>
              <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-700 rounded-xl cursor-pointer">
                <input type="checkbox" name="signatureRequired" checked={formData.signatureRequired} onChange={handleChange} className="w-5 h-5 accent-primary-600" />
                <div><span className="font-medium text-gray-900 dark:text-white">✍️ Signature Required</span><p className="text-xs text-gray-500">Recipient must sign</p></div>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">Pickup</h4>
                <p className="text-gray-900 dark:text-white">{formData.pickupAddress}</p>
                <p className="text-sm text-gray-500">{formData.pickupCity}</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">Delivery</h4>
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
                {formData.fragile && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">🔮 Fragile</span>}
                {formData.signatureRequired && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">✍️ Signature</span>}
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
    </div>
  );
};

export default NewOrder;
