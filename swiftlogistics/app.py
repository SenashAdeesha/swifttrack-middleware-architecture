# =============================================================================
# SwiftTrack Logistics - Standalone Backend Server
# =============================================================================
# Run with: python app.py
# This creates a unified backend server without requiring Docker
# =============================================================================

import os
import json
import logging
import time
import uuid
import hashlib
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, jsonify, g
from flask_cors import CORS
import jwt

# =============================================================================
# CONFIGURATION
# =============================================================================

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

SECRET_KEY = os.environ.get('JWT_SECRET', 'swifttrack_jwt_secret_key_2026')
app.config['SECRET_KEY'] = SECRET_KEY

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# =============================================================================
# IN-MEMORY DATABASE (Mock Data)
# =============================================================================

# Users Database
USERS = {
    'admin@swifttrack.com': {
        'id': 'usr_001',
        'email': 'admin@swifttrack.com',
        'password': hashlib.sha256('admin123'.encode()).hexdigest(),
        'name': 'Admin User',
        'role': 'admin',
        'phone': '+94771234567',
        'createdAt': '2025-01-01T00:00:00Z'
    },
    'john.doe@example.com': {
        'id': 'usr_002',
        'email': 'john.doe@example.com',
        'password': hashlib.sha256('password123'.encode()).hexdigest(),
        'name': 'John Doe',
        'role': 'client',
        'phone': '+94772345678',
        'createdAt': '2025-01-15T00:00:00Z'
    },
    'jane.smith@example.com': {
        'id': 'usr_003',
        'email': 'jane.smith@example.com',
        'password': hashlib.sha256('password123'.encode()).hexdigest(),
        'name': 'Jane Smith',
        'role': 'client',
        'phone': '+94773456789',
        'createdAt': '2025-02-01T00:00:00Z'
    },
    'mike.driver@swifttrack.com': {
        'id': 'usr_004',
        'email': 'mike.driver@swifttrack.com',
        'password': hashlib.sha256('password123'.encode()).hexdigest(),
        'name': 'Mike Johnson',
        'role': 'driver',
        'phone': '+94774567890',
        'createdAt': '2025-01-20T00:00:00Z'
    },
    'sarah.driver@swifttrack.com': {
        'id': 'usr_005',
        'email': 'sarah.driver@swifttrack.com',
        'password': hashlib.sha256('password123'.encode()).hexdigest(),
        'name': 'Sarah Williams',
        'role': 'driver',
        'phone': '+94775678901',
        'createdAt': '2025-01-25T00:00:00Z'
    }
}

# Clients Database
CLIENTS = {
    'cli_001': {
        'id': 'cli_001',
        'userId': 'usr_002',
        'companyName': 'Doe Enterprises',
        'address': '123 Main Street, Colombo 03',
        'totalOrders': 15,
        'status': 'active'
    },
    'cli_002': {
        'id': 'cli_002',
        'userId': 'usr_003',
        'companyName': 'Smith Trading Co',
        'address': '456 Lake Road, Colombo 07',
        'totalOrders': 8,
        'status': 'active'
    }
}

# Drivers Database
DRIVERS = {
    'drv_001': {
        'id': 'drv_001',
        'userId': 'usr_004',
        'vehicleNumber': 'CAB-1234',
        'vehicleType': 'Van',
        'licenseNumber': 'DL-2020-12345',
        'status': 'available',
        'rating': 4.8,
        'completedDeliveries': 156,
        'currentLocation': {'lat': 6.9271, 'lon': 79.8612}
    },
    'drv_002': {
        'id': 'drv_002',
        'userId': 'usr_005',
        'vehicleNumber': 'CAB-5678',
        'vehicleType': 'Truck',
        'licenseNumber': 'DL-2019-67890',
        'status': 'on_delivery',
        'rating': 4.6,
        'completedDeliveries': 203,
        'currentLocation': {'lat': 6.9344, 'lon': 79.8428}
    }
}

# Orders Database
ORDERS = {
    'ord_001': {
        'id': 'ord_001',
        'clientId': 'cli_001',
        'driverId': 'drv_001',
        'status': 'in_transit',
        'pickupAddress': '123 Main Street, Colombo 03',
        'deliveryAddress': '789 Park Avenue, Colombo 05',
        'packageType': 'Document',
        'weight': 0.5,
        'priority': 'express',
        'createdAt': '2026-02-20T08:00:00Z',
        'estimatedDelivery': '2026-02-22T14:00:00Z',
        'price': 500.00,
        'trackingNumber': 'ST-20260220-001'
    },
    'ord_002': {
        'id': 'ord_002',
        'clientId': 'cli_001',
        'driverId': None,
        'status': 'pending',
        'pickupAddress': '123 Main Street, Colombo 03',
        'deliveryAddress': '321 Beach Road, Mount Lavinia',
        'packageType': 'Parcel',
        'weight': 2.5,
        'priority': 'standard',
        'createdAt': '2026-02-21T10:30:00Z',
        'estimatedDelivery': '2026-02-23T18:00:00Z',
        'price': 750.00,
        'trackingNumber': 'ST-20260221-002'
    },
    'ord_003': {
        'id': 'ord_003',
        'clientId': 'cli_002',
        'driverId': 'drv_002',
        'status': 'out_for_delivery',
        'pickupAddress': '456 Lake Road, Colombo 07',
        'deliveryAddress': '555 Temple Road, Dehiwala',
        'packageType': 'Fragile',
        'weight': 5.0,
        'priority': 'express',
        'createdAt': '2026-02-21T07:00:00Z',
        'estimatedDelivery': '2026-02-22T12:00:00Z',
        'price': 1200.00,
        'trackingNumber': 'ST-20260221-003'
    },
    'ord_004': {
        'id': 'ord_004',
        'clientId': 'cli_002',
        'driverId': 'drv_001',
        'status': 'delivered',
        'pickupAddress': '456 Lake Road, Colombo 07',
        'deliveryAddress': '100 Galle Road, Kollupitiya',
        'packageType': 'Standard',
        'weight': 1.0,
        'priority': 'standard',
        'createdAt': '2026-02-18T09:00:00Z',
        'estimatedDelivery': '2026-02-19T17:00:00Z',
        'deliveredAt': '2026-02-19T15:30:00Z',
        'price': 450.00,
        'trackingNumber': 'ST-20260218-004'
    },
    'ord_005': {
        'id': 'ord_005',
        'clientId': 'cli_001',
        'driverId': None,
        'status': 'confirmed',
        'pickupAddress': '123 Main Street, Colombo 03',
        'deliveryAddress': '200 High Level Road, Nugegoda',
        'packageType': 'Electronics',
        'weight': 3.0,
        'priority': 'express',
        'createdAt': '2026-02-22T06:00:00Z',
        'estimatedDelivery': '2026-02-22T18:00:00Z',
        'price': 950.00,
        'trackingNumber': 'ST-20260222-005'
    }
}

# Order Timeline
ORDER_TIMELINE = {
    'ord_001': [
        {'status': 'pending', 'timestamp': '2026-02-20T08:00:00Z', 'description': 'Order placed'},
        {'status': 'confirmed', 'timestamp': '2026-02-20T08:05:00Z', 'description': 'Order confirmed'},
        {'status': 'picked_up', 'timestamp': '2026-02-20T09:30:00Z', 'description': 'Package picked up'},
        {'status': 'in_transit', 'timestamp': '2026-02-20T10:00:00Z', 'description': 'Package in transit'}
    ],
    'ord_003': [
        {'status': 'pending', 'timestamp': '2026-02-21T07:00:00Z', 'description': 'Order placed'},
        {'status': 'confirmed', 'timestamp': '2026-02-21T07:10:00Z', 'description': 'Order confirmed'},
        {'status': 'picked_up', 'timestamp': '2026-02-21T08:00:00Z', 'description': 'Package picked up'},
        {'status': 'in_transit', 'timestamp': '2026-02-21T08:30:00Z', 'description': 'Package in transit'},
        {'status': 'out_for_delivery', 'timestamp': '2026-02-22T09:00:00Z', 'description': 'Out for delivery'}
    ],
    'ord_004': [
        {'status': 'pending', 'timestamp': '2026-02-18T09:00:00Z', 'description': 'Order placed'},
        {'status': 'confirmed', 'timestamp': '2026-02-18T09:10:00Z', 'description': 'Order confirmed'},
        {'status': 'picked_up', 'timestamp': '2026-02-18T10:00:00Z', 'description': 'Package picked up'},
        {'status': 'in_transit', 'timestamp': '2026-02-18T10:30:00Z', 'description': 'Package in transit'},
        {'status': 'out_for_delivery', 'timestamp': '2026-02-19T08:00:00Z', 'description': 'Out for delivery'},
        {'status': 'delivered', 'timestamp': '2026-02-19T15:30:00Z', 'description': 'Delivered successfully'}
    ]
}

# Notifications
NOTIFICATIONS = []

# System Logs
SYSTEM_LOGS = []

# =============================================================================
# JWT AUTHENTICATION
# =============================================================================

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            g.current_user = data
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    return decorated

def get_user_by_email(email):
    return USERS.get(email)

def get_user_by_id(user_id):
    for user in USERS.values():
        if user['id'] == user_id:
            return user
    return None

def get_client_by_user_id(user_id):
    for client in CLIENTS.values():
        if client['userId'] == user_id:
            return client
    return None

def get_driver_by_user_id(user_id):
    for driver in DRIVERS.values():
        if driver['userId'] == user_id:
            return driver
    return None

# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'swifttrack-backend',
        'timestamp': datetime.utcnow().isoformat()
    })

# =============================================================================
# AUTHENTICATION ENDPOINTS
# =============================================================================

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login endpoint."""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400
    
    user = get_user_by_email(email)
    
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    if user['password'] != password_hash:
        return jsonify({'error': 'Invalid credentials'}), 401
    
    # Generate JWT token
    token = jwt.encode({
        'user_id': user['id'],
        'email': user['email'],
        'role': user['role'],
        'exp': datetime.utcnow() + timedelta(hours=24)
    }, SECRET_KEY, algorithm='HS256')
    
    logger.info(f"User logged in: {email}")
    
    return jsonify({
        'token': token,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'role': user['role']
        }
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    """User registration endpoint."""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    required = ['email', 'password', 'name', 'role']
    for field in required:
        if field not in data:
            return jsonify({'error': f'{field} is required'}), 400
    
    if data['email'] in USERS:
        return jsonify({'error': 'Email already exists'}), 409
    
    user_id = f"usr_{str(uuid.uuid4())[:8]}"
    
    USERS[data['email']] = {
        'id': user_id,
        'email': data['email'],
        'password': hashlib.sha256(data['password'].encode()).hexdigest(),
        'name': data['name'],
        'role': data['role'],
        'phone': data.get('phone', ''),
        'createdAt': datetime.utcnow().isoformat()
    }
    
    # Create client/driver record based on role
    if data['role'] == 'client':
        client_id = f"cli_{str(uuid.uuid4())[:8]}"
        CLIENTS[client_id] = {
            'id': client_id,
            'userId': user_id,
            'companyName': data.get('companyName', ''),
            'address': data.get('address', ''),
            'totalOrders': 0,
            'status': 'active'
        }
    elif data['role'] == 'driver':
        driver_id = f"drv_{str(uuid.uuid4())[:8]}"
        DRIVERS[driver_id] = {
            'id': driver_id,
            'userId': user_id,
            'vehicleNumber': data.get('vehicleNumber', ''),
            'vehicleType': data.get('vehicleType', 'Van'),
            'licenseNumber': data.get('licenseNumber', ''),
            'status': 'available',
            'rating': 5.0,
            'completedDeliveries': 0,
            'currentLocation': {'lat': 6.9271, 'lon': 79.8612}
        }
    
    logger.info(f"User registered: {data['email']}")
    
    return jsonify({
        'message': 'Registration successful',
        'userId': user_id
    }), 201

@app.route('/api/auth/me', methods=['GET'])
@token_required
def get_current_user():
    """Get current user info."""
    user = get_user_by_id(g.current_user['user_id'])
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    response = {
        'id': user['id'],
        'email': user['email'],
        'name': user['name'],
        'role': user['role'],
        'phone': user.get('phone', '')
    }
    
    # Add role-specific data
    if user['role'] == 'client':
        client = get_client_by_user_id(user['id'])
        if client:
            response['client'] = client
    elif user['role'] == 'driver':
        driver = get_driver_by_user_id(user['id'])
        if driver:
            response['driver'] = driver
    
    return jsonify(response)

@app.route('/api/auth/logout', methods=['POST'])
@token_required
def logout():
    """User logout endpoint."""
    return jsonify({'message': 'Logged out successfully'})

# =============================================================================
# ORDERS ENDPOINTS
# =============================================================================

@app.route('/api/orders', methods=['GET'])
@token_required
def get_orders():
    """Get orders filtered by role."""
    user = g.current_user
    orders_list = list(ORDERS.values())
    
    # Filter by role
    if user['role'] == 'client':
        client = get_client_by_user_id(user['user_id'])
        if client:
            orders_list = [o for o in orders_list if o['clientId'] == client['id']]
        else:
            orders_list = []
    elif user['role'] == 'driver':
        driver = get_driver_by_user_id(user['user_id'])
        if driver:
            orders_list = [o for o in orders_list if o.get('driverId') == driver['id']]
        else:
            orders_list = []
    
    # Apply status filter
    status = request.args.get('status')
    if status:
        orders_list = [o for o in orders_list if o['status'] == status]
    
    return jsonify({'orders': orders_list, 'total': len(orders_list)})

@app.route('/api/orders/<order_id>', methods=['GET'])
@token_required
def get_order(order_id):
    """Get order by ID."""
    order = ORDERS.get(order_id)
    
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    # Include timeline
    timeline = ORDER_TIMELINE.get(order_id, [])
    
    return jsonify({**order, 'timeline': timeline})

@app.route('/api/orders', methods=['POST'])
@token_required
def create_order():
    """Create new order."""
    data = request.get_json()
    user = g.current_user
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    required = ['pickupAddress', 'deliveryAddress', 'packageType']
    for field in required:
        if field not in data:
            return jsonify({'error': f'{field} is required'}), 400
    
    # Get client
    client = get_client_by_user_id(user['user_id'])
    if not client and user['role'] == 'client':
        return jsonify({'error': 'Client profile not found'}), 400
    
    order_id = f"ord_{str(uuid.uuid4())[:8]}"
    tracking_number = f"ST-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"
    
    order = {
        'id': order_id,
        'clientId': client['id'] if client else data.get('clientId'),
        'driverId': None,
        'status': 'pending',
        'pickupAddress': data['pickupAddress'],
        'deliveryAddress': data['deliveryAddress'],
        'packageType': data['packageType'],
        'weight': data.get('weight', 1.0),
        'priority': data.get('priority', 'standard'),
        'createdAt': datetime.utcnow().isoformat(),
        'estimatedDelivery': (datetime.utcnow() + timedelta(days=2)).isoformat(),
        'price': data.get('price', 500.00),
        'trackingNumber': tracking_number
    }
    
    ORDERS[order_id] = order
    ORDER_TIMELINE[order_id] = [
        {'status': 'pending', 'timestamp': datetime.utcnow().isoformat(), 'description': 'Order placed'}
    ]
    
    # Update client order count
    if client:
        client['totalOrders'] += 1
    
    logger.info(f"Order created: {order_id}")
    
    return jsonify(order), 201

@app.route('/api/orders/<order_id>', methods=['PUT'])
@token_required
def update_order(order_id):
    """Update order."""
    order = ORDERS.get(order_id)
    
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    data = request.get_json()
    
    updatable = ['pickupAddress', 'deliveryAddress', 'packageType', 'weight', 'priority', 'price']
    for field in updatable:
        if field in data:
            order[field] = data[field]
    
    return jsonify(order)

@app.route('/api/orders/<order_id>/status', methods=['PUT'])
@token_required
def update_order_status(order_id):
    """Update order status."""
    order = ORDERS.get(order_id)
    
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    data = request.get_json()
    new_status = data.get('status')
    
    if not new_status:
        return jsonify({'error': 'Status is required'}), 400
    
    valid_statuses = ['pending', 'confirmed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled']
    if new_status not in valid_statuses:
        return jsonify({'error': 'Invalid status'}), 400
    
    order['status'] = new_status
    
    # Add to timeline
    if order_id not in ORDER_TIMELINE:
        ORDER_TIMELINE[order_id] = []
    
    ORDER_TIMELINE[order_id].append({
        'status': new_status,
        'timestamp': datetime.utcnow().isoformat(),
        'description': data.get('description', f'Status changed to {new_status}')
    })
    
    if new_status == 'delivered':
        order['deliveredAt'] = datetime.utcnow().isoformat()
        # Update driver stats
        driver = DRIVERS.get(order.get('driverId'))
        if driver:
            driver['completedDeliveries'] += 1
    
    logger.info(f"Order {order_id} status updated to {new_status}")
    
    return jsonify(order)

@app.route('/api/orders/<order_id>/assign', methods=['PUT'])
@token_required
def assign_driver(order_id):
    """Assign driver to order."""
    order = ORDERS.get(order_id)
    
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    data = request.get_json()
    driver_id = data.get('driverId')
    
    if not driver_id:
        return jsonify({'error': 'Driver ID is required'}), 400
    
    driver = DRIVERS.get(driver_id)
    if not driver:
        return jsonify({'error': 'Driver not found'}), 404
    
    order['driverId'] = driver_id
    order['status'] = 'confirmed'
    
    # Update driver status
    driver['status'] = 'on_delivery'
    
    # Add to timeline
    if order_id not in ORDER_TIMELINE:
        ORDER_TIMELINE[order_id] = []
    
    ORDER_TIMELINE[order_id].append({
        'status': 'confirmed',
        'timestamp': datetime.utcnow().isoformat(),
        'description': f'Driver assigned: {driver_id}'
    })
    
    logger.info(f"Driver {driver_id} assigned to order {order_id}")
    
    return jsonify(order)

# =============================================================================
# DRIVERS ENDPOINTS
# =============================================================================

@app.route('/api/drivers', methods=['GET'])
@token_required
def get_drivers():
    """Get all drivers."""
    drivers_list = []
    
    for driver in DRIVERS.values():
        user = get_user_by_id(driver['userId'])
        drivers_list.append({
            **driver,
            'name': user['name'] if user else 'Unknown',
            'email': user['email'] if user else '',
            'phone': user.get('phone', '') if user else ''
        })
    
    return jsonify({'drivers': drivers_list, 'total': len(drivers_list)})

@app.route('/api/drivers/<driver_id>', methods=['GET'])
@token_required
def get_driver(driver_id):
    """Get driver by ID."""
    driver = DRIVERS.get(driver_id)
    
    if not driver:
        return jsonify({'error': 'Driver not found'}), 404
    
    user = get_user_by_id(driver['userId'])
    
    return jsonify({
        **driver,
        'name': user['name'] if user else 'Unknown',
        'email': user['email'] if user else '',
        'phone': user.get('phone', '') if user else ''
    })

@app.route('/api/drivers/<driver_id>/orders', methods=['GET'])
@token_required
def get_driver_orders(driver_id):
    """Get orders assigned to driver."""
    driver = DRIVERS.get(driver_id)
    
    if not driver:
        return jsonify({'error': 'Driver not found'}), 404
    
    orders_list = [o for o in ORDERS.values() if o.get('driverId') == driver_id]
    
    return jsonify({'orders': orders_list, 'total': len(orders_list)})

@app.route('/api/drivers/available', methods=['GET'])
@token_required
def get_available_drivers():
    """Get available drivers."""
    available = []
    
    for driver in DRIVERS.values():
        if driver['status'] == 'available':
            user = get_user_by_id(driver['userId'])
            available.append({
                **driver,
                'name': user['name'] if user else 'Unknown'
            })
    
    return jsonify({'drivers': available, 'total': len(available)})

# =============================================================================
# CLIENTS ENDPOINTS
# =============================================================================

@app.route('/api/clients', methods=['GET'])
@token_required
def get_clients():
    """Get all clients."""
    clients_list = []
    
    for client in CLIENTS.values():
        user = get_user_by_id(client['userId'])
        clients_list.append({
            **client,
            'name': user['name'] if user else 'Unknown',
            'email': user['email'] if user else '',
            'phone': user.get('phone', '') if user else ''
        })
    
    return jsonify({'clients': clients_list, 'total': len(clients_list)})

@app.route('/api/clients/<client_id>', methods=['GET'])
@token_required
def get_client(client_id):
    """Get client by ID."""
    client = CLIENTS.get(client_id)
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    user = get_user_by_id(client['userId'])
    
    return jsonify({
        **client,
        'name': user['name'] if user else 'Unknown',
        'email': user['email'] if user else '',
        'phone': user.get('phone', '') if user else ''
    })

@app.route('/api/clients/<client_id>/orders', methods=['GET'])
@token_required
def get_client_orders(client_id):
    """Get orders for client."""
    client = CLIENTS.get(client_id)
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    orders_list = [o for o in ORDERS.values() if o['clientId'] == client_id]
    
    return jsonify({'orders': orders_list, 'total': len(orders_list)})

# =============================================================================
# ADMIN ENDPOINTS
# =============================================================================

@app.route('/api/admin/users', methods=['GET'])
@token_required
def get_all_users():
    """Get all users (admin only)."""
    if g.current_user['role'] != 'admin':
        return jsonify({'error': 'Admin access required'}), 403
    
    users_list = []
    for user in USERS.values():
        users_list.append({
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'role': user['role'],
            'phone': user.get('phone', ''),
            'createdAt': user['createdAt']
        })
    
    return jsonify({'users': users_list, 'total': len(users_list)})

@app.route('/api/admin/analytics', methods=['GET'])
@token_required
def get_analytics():
    """Get system analytics (admin only)."""
    if g.current_user['role'] != 'admin':
        return jsonify({'error': 'Admin access required'}), 403
    
    orders_list = list(ORDERS.values())
    
    return jsonify({
        'totalOrders': len(orders_list),
        'pendingOrders': len([o for o in orders_list if o['status'] == 'pending']),
        'inTransitOrders': len([o for o in orders_list if o['status'] == 'in_transit']),
        'deliveredOrders': len([o for o in orders_list if o['status'] == 'delivered']),
        'totalDrivers': len(DRIVERS),
        'availableDrivers': len([d for d in DRIVERS.values() if d['status'] == 'available']),
        'totalClients': len(CLIENTS),
        'totalRevenue': sum(o.get('price', 0) for o in orders_list if o['status'] == 'delivered')
    })

@app.route('/api/admin/logs', methods=['GET'])
@token_required
def get_logs():
    """Get system logs (admin only)."""
    if g.current_user['role'] != 'admin':
        return jsonify({'error': 'Admin access required'}), 403
    
    return jsonify({'logs': SYSTEM_LOGS[-100:], 'total': len(SYSTEM_LOGS)})

# =============================================================================
# NOTIFICATIONS ENDPOINTS
# =============================================================================

@app.route('/api/notifications', methods=['GET'])
@token_required
def get_notifications():
    """Get user notifications."""
    user_id = g.current_user['user_id']
    user_notifications = [n for n in NOTIFICATIONS if n.get('userId') == user_id]
    
    return jsonify({'notifications': user_notifications, 'total': len(user_notifications)})

@app.route('/api/notifications/<notification_id>/read', methods=['PUT'])
@token_required
def mark_notification_read(notification_id):
    """Mark notification as read."""
    for notification in NOTIFICATIONS:
        if notification.get('id') == notification_id:
            notification['isRead'] = True
            return jsonify(notification)
    
    return jsonify({'error': 'Notification not found'}), 404

# =============================================================================
# TRACKING ENDPOINT
# =============================================================================

@app.route('/api/tracking/<tracking_number>', methods=['GET'])
def track_order(tracking_number):
    """Track order by tracking number (public endpoint)."""
    for order in ORDERS.values():
        if order.get('trackingNumber') == tracking_number:
            timeline = ORDER_TIMELINE.get(order['id'], [])
            return jsonify({
                'trackingNumber': tracking_number,
                'status': order['status'],
                'pickupAddress': order['pickupAddress'],
                'deliveryAddress': order['deliveryAddress'],
                'estimatedDelivery': order.get('estimatedDelivery'),
                'timeline': timeline
            })
    
    return jsonify({'error': 'Order not found'}), 404

# =============================================================================
# ERROR HANDLERS
# =============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# =============================================================================
# MAIN
# =============================================================================

if __name__ == '__main__':
    print("""
╔═══════════════════════════════════════════════════════════════════╗
║         SwiftTrack Logistics - Backend Server                     ║
╠═══════════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:5002                         ║
║                                                                   ║
║  Demo Credentials:                                                ║
║  ─────────────────                                                ║
║  Admin:  admin@swifttrack.com / admin123                          ║
║  Client: john.doe@example.com / password123                       ║
║  Driver: mike.driver@swifttrack.com / password123                 ║
║                                                                   ║
║  API Endpoints:                                                   ║
║  ─────────────                                                    ║
║  POST /api/auth/login     - Login                                 ║
║  POST /api/auth/register  - Register                              ║
║  GET  /api/orders         - List orders                           ║
║  POST /api/orders         - Create order                          ║
║  GET  /api/drivers        - List drivers                          ║
║  GET  /api/clients        - List clients                          ║
║  GET  /api/admin/analytics - Admin analytics                      ║
║                                                                   ║
║  Press Ctrl+C to stop the server                                  ║
╚═══════════════════════════════════════════════════════════════════╝
    """)
    
    app.run(host='0.0.0.0', port=5002, debug=True)
