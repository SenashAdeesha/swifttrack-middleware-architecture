// Mock Data for SwiftTrack Logistics Platform

// Order Statuses
export const ORDER_STATUSES = {
  PENDING: 'pending',
  IN_WAREHOUSE: 'in_warehouse',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// Package Types
export const PACKAGE_TYPES = [
  { value: 'document', label: 'Document', icon: '📄' },
  { value: 'small_box', label: 'Small Box', icon: '📦' },
  { value: 'medium_box', label: 'Medium Box', icon: '📦' },
  { value: 'large_box', label: 'Large Box', icon: '🗃️' },
  { value: 'fragile', label: 'Fragile', icon: '⚠️' },
  { value: 'electronics', label: 'Electronics', icon: '💻' },
  { value: 'perishable', label: 'Perishable', icon: '❄️' },
];

// Priority Levels
export const PRIORITIES = [
  { value: 'normal', label: 'Normal', description: '3-5 business days', color: 'blue' },
  { value: 'express', label: 'Express', description: '1-2 business days', color: 'orange' },
  { value: 'same_day', label: 'Same Day', description: 'Delivered today', color: 'red' },
];

// Failure Reasons
export const FAILURE_REASONS = [
  { value: 'not_home', label: 'Customer not available' },
  { value: 'wrong_address', label: 'Wrong address' },
  { value: 'refused', label: 'Delivery refused' },
  { value: 'damaged', label: 'Package damaged' },
  { value: 'weather', label: 'Weather conditions' },
  { value: 'other', label: 'Other' },
];

// Mock Orders Data
export const mockOrders = [
  {
    id: 'ORD-001',
    clientId: 1,
    clientName: 'John Doe',
    pickupAddress: '123 Business Ave, New York, NY 10001',
    deliveryAddress: '456 Residential St, Brooklyn, NY 11201',
    packageWeight: 2.5,
    packageType: 'small_box',
    priority: 'express',
    status: ORDER_STATUSES.OUT_FOR_DELIVERY,
    driverId: 2,
    driverName: 'Mike Wilson',
    createdAt: '2026-02-19T10:00:00Z',
    estimatedDelivery: '2026-02-20T14:00:00Z',
    timeline: [
      { status: 'created', time: '2026-02-19T10:00:00Z', description: 'Order placed' },
      { status: 'confirmed', time: '2026-02-19T10:15:00Z', description: 'Order confirmed' },
      { status: 'in_warehouse', time: '2026-02-19T12:00:00Z', description: 'Package received at warehouse' },
      { status: 'out_for_delivery', time: '2026-02-20T08:00:00Z', description: 'Out for delivery' },
    ],
  },
  {
    id: 'ORD-002',
    clientId: 1,
    clientName: 'John Doe',
    pickupAddress: '789 Tech Park, Manhattan, NY 10012',
    deliveryAddress: '321 Garden Lane, Queens, NY 11375',
    packageWeight: 0.5,
    packageType: 'document',
    priority: 'normal',
    status: ORDER_STATUSES.DELIVERED,
    driverId: 2,
    driverName: 'Mike Wilson',
    createdAt: '2026-02-17T09:00:00Z',
    estimatedDelivery: '2026-02-19T17:00:00Z',
    deliveredAt: '2026-02-19T15:30:00Z',
    timeline: [
      { status: 'created', time: '2026-02-17T09:00:00Z', description: 'Order placed' },
      { status: 'confirmed', time: '2026-02-17T09:10:00Z', description: 'Order confirmed' },
      { status: 'in_warehouse', time: '2026-02-17T14:00:00Z', description: 'Package received at warehouse' },
      { status: 'out_for_delivery', time: '2026-02-19T08:30:00Z', description: 'Out for delivery' },
      { status: 'delivered', time: '2026-02-19T15:30:00Z', description: 'Delivered successfully' },
    ],
  },
  {
    id: 'ORD-003',
    clientId: 1,
    clientName: 'John Doe',
    pickupAddress: '555 Market St, Manhattan, NY 10013',
    deliveryAddress: '888 Lake View, Bronx, NY 10451',
    packageWeight: 5.0,
    packageType: 'electronics',
    priority: 'express',
    status: ORDER_STATUSES.PENDING,
    driverId: null,
    driverName: null,
    createdAt: '2026-02-20T08:00:00Z',
    estimatedDelivery: '2026-02-21T17:00:00Z',
    timeline: [
      { status: 'created', time: '2026-02-20T08:00:00Z', description: 'Order placed' },
    ],
  },
  {
    id: 'ORD-004',
    clientId: 1,
    clientName: 'John Doe',
    pickupAddress: '100 Innovation Blvd, Manhattan, NY 10014',
    deliveryAddress: '200 Sunset Dr, Staten Island, NY 10301',
    packageWeight: 1.2,
    packageType: 'fragile',
    priority: 'same_day',
    status: ORDER_STATUSES.IN_WAREHOUSE,
    driverId: 2,
    driverName: 'Mike Wilson',
    createdAt: '2026-02-20T06:00:00Z',
    estimatedDelivery: '2026-02-20T18:00:00Z',
    timeline: [
      { status: 'created', time: '2026-02-20T06:00:00Z', description: 'Order placed' },
      { status: 'confirmed', time: '2026-02-20T06:05:00Z', description: 'Order confirmed' },
      { status: 'in_warehouse', time: '2026-02-20T09:00:00Z', description: 'Package received at warehouse' },
    ],
  },
  {
    id: 'ORD-005',
    clientId: 1,
    clientName: 'John Doe',
    pickupAddress: '777 Corporate Ave, Manhattan, NY 10015',
    deliveryAddress: '333 Elm Street, Brooklyn, NY 11215',
    packageWeight: 3.0,
    packageType: 'medium_box',
    priority: 'normal',
    status: ORDER_STATUSES.FAILED,
    driverId: 2,
    driverName: 'Mike Wilson',
    failureReason: 'not_home',
    createdAt: '2026-02-15T11:00:00Z',
    estimatedDelivery: '2026-02-18T17:00:00Z',
    timeline: [
      { status: 'created', time: '2026-02-15T11:00:00Z', description: 'Order placed' },
      { status: 'confirmed', time: '2026-02-15T11:30:00Z', description: 'Order confirmed' },
      { status: 'in_warehouse', time: '2026-02-16T10:00:00Z', description: 'Package received at warehouse' },
      { status: 'out_for_delivery', time: '2026-02-18T08:00:00Z', description: 'Out for delivery' },
      { status: 'failed', time: '2026-02-18T14:00:00Z', description: 'Delivery failed - Customer not available' },
    ],
  },
];

// Mock Drivers Data
export const mockDrivers = [
  {
    id: 2,
    name: 'Mike Wilson',
    email: 'driver@swifttrack.com',
    phone: '+1 (555) 123-4567',
    avatar: 'MW',
    status: 'active',
    vehicleType: 'Van',
    vehiclePlate: 'NYC-1234',
    rating: 4.8,
    totalDeliveries: 1247,
    successRate: 98.5,
    joinedDate: '2024-03-15',
    currentLocation: { lat: 40.7128, lng: -74.0060 },
  },
  {
    id: 4,
    name: 'Sarah Johnson',
    email: 'sarah.j@swifttrack.com',
    phone: '+1 (555) 234-5678',
    avatar: 'SJ',
    status: 'active',
    vehicleType: 'Motorcycle',
    vehiclePlate: 'NYC-5678',
    rating: 4.9,
    totalDeliveries: 892,
    successRate: 99.1,
    joinedDate: '2024-06-20',
    currentLocation: { lat: 40.7580, lng: -73.9855 },
  },
  {
    id: 5,
    name: 'David Chen',
    email: 'david.c@swifttrack.com',
    phone: '+1 (555) 345-6789',
    avatar: 'DC',
    status: 'inactive',
    vehicleType: 'Van',
    vehiclePlate: 'NYC-9012',
    rating: 4.6,
    totalDeliveries: 567,
    successRate: 96.8,
    joinedDate: '2024-09-01',
    currentLocation: null,
  },
];

// Mock Clients Data
export const mockClients = [
  {
    id: 1,
    name: 'John Doe',
    email: 'client@swifttrack.com',
    phone: '+1 (555) 987-6543',
    avatar: 'JD',
    status: 'active',
    company: 'TechCorp Inc.',
    totalOrders: 45,
    joinedDate: '2024-01-10',
    address: '123 Business Ave, New York, NY 10001',
  },
  {
    id: 6,
    name: 'Emily Rose',
    email: 'emily.r@company.com',
    phone: '+1 (555) 456-7890',
    avatar: 'ER',
    status: 'active',
    company: 'Rose Boutique',
    totalOrders: 128,
    joinedDate: '2023-11-05',
    address: '456 Fashion St, Manhattan, NY 10012',
  },
  {
    id: 7,
    name: 'Robert Smith',
    email: 'robert.s@business.com',
    phone: '+1 (555) 567-8901',
    avatar: 'RS',
    status: 'inactive',
    company: 'Smith & Co.',
    totalOrders: 23,
    joinedDate: '2024-08-15',
    address: '789 Commerce Blvd, Brooklyn, NY 11201',
  },
];

// Mock Route Data for Drivers
export const mockRouteData = [
  {
    sequence: 1,
    orderId: 'ORD-004',
    address: '200 Sunset Dr, Staten Island, NY 10301',
    customerName: 'John Doe',
    packageType: 'fragile',
    priority: 'same_day',
    estimatedTime: '10:30 AM',
    status: 'pending',
    notes: 'Handle with care - Fragile items',
  },
  {
    sequence: 2,
    orderId: 'ORD-001',
    address: '456 Residential St, Brooklyn, NY 11201',
    customerName: 'John Doe',
    packageType: 'small_box',
    priority: 'express',
    estimatedTime: '11:45 AM',
    status: 'pending',
    notes: '',
  },
  {
    sequence: 3,
    orderId: 'ORD-006',
    address: '888 Park Avenue, Manhattan, NY 10021',
    customerName: 'Emily Rose',
    packageType: 'medium_box',
    priority: 'normal',
    estimatedTime: '1:15 PM',
    status: 'pending',
    notes: 'Leave at reception',
  },
  {
    sequence: 4,
    orderId: 'ORD-007',
    address: '555 Broadway, Manhattan, NY 10012',
    customerName: 'Robert Smith',
    packageType: 'document',
    priority: 'express',
    estimatedTime: '2:30 PM',
    status: 'pending',
    notes: 'Signature required',
  },
];

// Mock Stats Data
export const mockClientStats = {
  totalOrders: 45,
  inTransit: 2,
  delivered: 40,
  failed: 3,
  weeklyData: [
    { name: 'Mon', orders: 5, delivered: 4 },
    { name: 'Tue', orders: 8, delivered: 7 },
    { name: 'Wed', orders: 12, delivered: 11 },
    { name: 'Thu', orders: 6, delivered: 6 },
    { name: 'Fri', orders: 9, delivered: 8 },
    { name: 'Sat', orders: 3, delivered: 3 },
    { name: 'Sun', orders: 2, delivered: 1 },
  ],
  monthlyData: [
    { name: 'Week 1', orders: 23, delivered: 21 },
    { name: 'Week 2', orders: 31, delivered: 28 },
    { name: 'Week 3', orders: 28, delivered: 27 },
    { name: 'Week 4', orders: 35, delivered: 33 },
  ],
};

export const mockDriverStats = {
  todayDeliveries: 8,
  completed: 5,
  pending: 3,
  totalDistance: '47 km',
  avgDeliveryTime: '23 min',
  weeklyPerformance: [
    { name: 'Mon', deliveries: 12, onTime: 11 },
    { name: 'Tue', deliveries: 15, onTime: 14 },
    { name: 'Wed', deliveries: 10, onTime: 10 },
    { name: 'Thu', deliveries: 14, onTime: 13 },
    { name: 'Fri', deliveries: 16, onTime: 15 },
    { name: 'Sat', deliveries: 8, onTime: 8 },
    { name: 'Sun', deliveries: 0, onTime: 0 },
  ],
  ratings: {
    overall: 4.8,
    reliability: 4.9,
    communication: 4.7,
    packaging: 4.8,
  },
};

export const mockAdminStats = {
  totalClients: 156,
  activeDrivers: 23,
  totalOrdersToday: 287,
  systemHealth: 'healthy',
  revenue: 45678,
  growth: 12.5,
  ordersByStatus: [
    { name: 'Pending', value: 34, color: '#f59e0b' },
    { name: 'In Warehouse', value: 56, color: '#3b82f6' },
    { name: 'Out for Delivery', value: 89, color: '#8b5cf6' },
    { name: 'Delivered', value: 98, color: '#10b981' },
    { name: 'Failed', value: 10, color: '#ef4444' },
  ],
  hourlyOrders: [
    { hour: '6AM', orders: 12 },
    { hour: '8AM', orders: 34 },
    { hour: '10AM', orders: 56 },
    { hour: '12PM', orders: 78 },
    { hour: '2PM', orders: 65 },
    { hour: '4PM', orders: 54 },
    { hour: '6PM', orders: 43 },
    { hour: '8PM', orders: 21 },
  ],
  regionData: [
    { region: 'Manhattan', orders: 120, percentage: 42 },
    { region: 'Brooklyn', orders: 85, percentage: 30 },
    { region: 'Queens', orders: 45, percentage: 16 },
    { region: 'Bronx', orders: 25, percentage: 9 },
    { region: 'Staten Island', orders: 12, percentage: 4 },
  ],
};

// Mock System Logs
export const mockSystemLogs = [
  { id: 1, type: 'info', message: 'System startup completed', timestamp: '2026-02-20T06:00:00Z', source: 'system' },
  { id: 2, type: 'success', message: 'Database backup completed', timestamp: '2026-02-20T05:00:00Z', source: 'database' },
  { id: 3, type: 'warning', message: 'High server load detected', timestamp: '2026-02-20T04:30:00Z', source: 'server' },
  { id: 4, type: 'error', message: 'Payment gateway timeout', timestamp: '2026-02-20T03:45:00Z', source: 'payment' },
  { id: 5, type: 'info', message: 'New driver registered', timestamp: '2026-02-20T03:00:00Z', source: 'auth' },
  { id: 6, type: 'success', message: 'Route optimization completed', timestamp: '2026-02-20T02:30:00Z', source: 'routing' },
  { id: 7, type: 'error', message: 'SMS notification failed', timestamp: '2026-02-20T02:00:00Z', source: 'notification' },
  { id: 8, type: 'info', message: 'Cache cleared', timestamp: '2026-02-20T01:30:00Z', source: 'cache' },
];

// Mock Billing History
export const mockBillingHistory = [
  { id: 'INV-001', date: '2026-02-15', amount: 125.50, status: 'paid', orders: 5 },
  { id: 'INV-002', date: '2026-02-01', amount: 287.00, status: 'paid', orders: 12 },
  { id: 'INV-003', date: '2026-01-15', amount: 156.75, status: 'paid', orders: 7 },
  { id: 'INV-004', date: '2026-01-01', amount: 342.25, status: 'paid', orders: 15 },
];

// Aliases for page imports
export const billingHistory = mockBillingHistory;
export const adminStats = mockAdminStats;
export const driverStats = mockDriverStats;

// Recent Orders for Admin Dashboard
export const recentOrders = [
  { id: 'ORD-2024-001', client: 'John Doe', driver: 'Mike Wilson', destination: '456 Residential St, Brooklyn', status: 'delivered', amount: 45.99, date: '2024-02-20' },
  { id: 'ORD-2024-002', client: 'Emily Rose', driver: 'Sarah Johnson', destination: '888 Park Ave, Manhattan', status: 'in_transit', amount: 32.50, date: '2024-02-20' },
  { id: 'ORD-2024-003', client: 'Robert Smith', driver: null, destination: '555 Broadway, Manhattan', status: 'pending', amount: 28.75, date: '2024-02-20' },
  { id: 'ORD-2024-004', client: 'Alice Johnson', driver: 'Mike Wilson', destination: '123 Main St, Queens', status: 'picked_up', amount: 55.00, date: '2024-02-19' },
  { id: 'ORD-2024-005', client: 'Bob Williams', driver: 'David Chen', destination: '789 Oak Ave, Bronx', status: 'delivered', amount: 67.25, date: '2024-02-19' },
  { id: 'ORD-2024-006', client: 'Carol Davis', driver: 'Sarah Johnson', destination: '321 Pine St, Staten Island', status: 'cancelled', amount: 42.00, date: '2024-02-18' },
  { id: 'ORD-2024-007', client: 'Dan Miller', driver: 'Mike Wilson', destination: '654 Cedar Rd, Brooklyn', status: 'delivered', amount: 38.50, date: '2024-02-18' },
  { id: 'ORD-2024-008', client: 'Eva Brown', driver: null, destination: '987 Maple Dr, Manhattan', status: 'pending', amount: 72.00, date: '2024-02-17' },
];

// System Logs for Admin
export const systemLogs = [
  { id: 'LOG-001', type: 'error', status: 'pending', message: 'Payment gateway connection timeout', source: 'Payment Service', timestamp: '2 mins ago', details: 'Error: ETIMEDOUT at TCPConnectWrap.afterConnect' },
  { id: 'LOG-002', type: 'warning', status: 'resolved', message: 'High memory usage detected (85%)', source: 'System Monitor', timestamp: '15 mins ago' },
  { id: 'LOG-003', type: 'success', status: 'resolved', message: 'Database backup completed successfully', source: 'Backup Service', timestamp: '1 hour ago' },
  { id: 'LOG-004', type: 'error', status: 'retrying', message: 'SMS notification delivery failed', source: 'Notification Service', timestamp: '2 hours ago', details: 'Twilio API error: Rate limit exceeded' },
  { id: 'LOG-005', type: 'info', status: 'resolved', message: 'New driver registration: Sarah Johnson', source: 'Auth Service', timestamp: '3 hours ago' },
  { id: 'LOG-006', type: 'warning', status: 'pending', message: 'API response time exceeding threshold', source: 'API Gateway', timestamp: '4 hours ago' },
  { id: 'LOG-007', type: 'success', status: 'resolved', message: 'Route optimization completed for 15 drivers', source: 'Routing Engine', timestamp: '5 hours ago' },
  { id: 'LOG-008', type: 'error', status: 'failed', message: 'Email delivery bounced: invalid recipient', source: 'Email Service', timestamp: '6 hours ago' },
];

// Drivers for Admin Dashboard
export const drivers = [
  { id: 1, name: 'Mike Wilson', email: 'mike@swifttrack.com', phone: '+1 555-0101', vehicle: 'Ford Transit', deliveries: 1247, rating: 4.8, status: 'active' },
  { id: 2, name: 'Sarah Johnson', email: 'sarah@swifttrack.com', phone: '+1 555-0102', vehicle: 'Mercedes Sprinter', deliveries: 892, rating: 4.9, status: 'active' },
  { id: 3, name: 'David Chen', email: 'david@swifttrack.com', phone: '+1 555-0103', vehicle: 'Honda Motorcycle', deliveries: 567, rating: 4.6, status: 'inactive' },
  { id: 4, name: 'Lisa Park', email: 'lisa@swifttrack.com', phone: '+1 555-0104', vehicle: 'Toyota Hiace', deliveries: 721, rating: 4.7, status: 'active' },
  { id: 5, name: 'James Brown', email: 'james@swifttrack.com', phone: '+1 555-0105', vehicle: 'Ford Transit', deliveries: 456, rating: 4.5, status: 'active' },
];

// Clients for Admin Dashboard
export const clients = [
  { id: 1, name: 'John Doe', email: 'john@techcorp.com', phone: '+1 555-1001', orders: 156, spent: 4520, status: 'active' },
  { id: 2, name: 'Emily Rose', email: 'emily@roseboutique.com', phone: '+1 555-1002', orders: 89, spent: 2340, status: 'active' },
  { id: 3, name: 'Robert Smith', email: 'robert@smithco.com', phone: '+1 555-1003', orders: 234, spent: 7890, status: 'active' },
  { id: 4, name: 'Alice Johnson', email: 'alice@startup.io', phone: '+1 555-1004', orders: 45, spent: 1230, status: 'inactive' },
  { id: 5, name: 'Bob Williams', email: 'bob@enterprise.com', phone: '+1 555-1005', orders: 178, spent: 5670, status: 'active' },
];

// Delivery Orders for Driver Dashboard
export const deliveryOrders = [
  { id: 'DEL-001', customer: 'John Doe', address: '456 Residential St, Brooklyn, NY 11201', timeSlot: '9:00 AM - 11:00 AM', priority: 'urgent', status: 'pending', items: 2, specialInstructions: 'Ring doorbell twice' },
  { id: 'DEL-002', customer: 'Emily Rose', address: '888 Park Ave, Manhattan, NY 10021', timeSlot: '10:00 AM - 12:00 PM', priority: 'normal', status: 'pending', items: 1 },
  { id: 'DEL-003', customer: 'Robert Smith', address: '555 Broadway, Manhattan, NY 10012', timeSlot: '11:00 AM - 1:00 PM', priority: 'high', status: 'picked_up', items: 3 },
  { id: 'DEL-004', customer: 'Alice Johnson', address: '123 Main St, Queens, NY 11101', timeSlot: '12:00 PM - 2:00 PM', priority: 'normal', status: 'pending', items: 1 },
  { id: 'DEL-005', customer: 'Bob Williams', address: '789 Oak Ave, Bronx, NY 10451', timeSlot: '1:00 PM - 3:00 PM', priority: 'urgent', status: 'in_transit', items: 4, specialInstructions: 'Fragile - Handle with care' },
  { id: 'DEL-006', customer: 'Carol Davis', address: '321 Pine St, Staten Island, NY 10301', timeSlot: '2:00 PM - 4:00 PM', priority: 'normal', status: 'pending', items: 2 },
  { id: 'DEL-007', customer: 'Dan Miller', address: '654 Cedar Rd, Brooklyn, NY 11215', timeSlot: '3:00 PM - 5:00 PM', priority: 'high', status: 'pending', items: 1 },
  { id: 'DEL-008', customer: 'Eva Brown', address: '987 Maple Dr, Manhattan, NY 10013', timeSlot: '4:00 PM - 6:00 PM', priority: 'normal', status: 'pending', items: 2 },
];
