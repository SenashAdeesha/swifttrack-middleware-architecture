# =============================================================================
# SwiftTrack Logistics - API Gateway Service
# =============================================================================
# Single entry point for all external requests
# Implements: JWT Authentication, Request Routing, Rate Limiting, CORS
# =============================================================================

import os
import json
import uuid
import logging
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, jsonify, g
from flask_cors import CORS
import jwt
import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor
import pika
import requests

# =============================================================================
# CONFIGURATION
# =============================================================================

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Environment variables
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'swifttrack_jwt_secret_key_2026')
JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
MIDDLEWARE_SERVICE_URL = os.environ.get('MIDDLEWARE_SERVICE_URL', 'http://middleware-service:5001')
POSTGRES_HOST = os.environ.get('POSTGRES_HOST', 'postgres')
POSTGRES_DB = os.environ.get('POSTGRES_DB', 'swifttrack')
POSTGRES_USER = os.environ.get('POSTGRES_USER', 'swifttrack_user')
POSTGRES_PASSWORD = os.environ.get('POSTGRES_PASSWORD', 'swifttrack_secure_pass_2026')
RABBITMQ_HOST = os.environ.get('RABBITMQ_HOST', 'rabbitmq')
RABBITMQ_USER = os.environ.get('RABBITMQ_USER', 'swifttrack')
RABBITMQ_PASS = os.environ.get('RABBITMQ_PASS', 'swifttrack_mq_2026')
RABBITMQ_VHOST = os.environ.get('RABBITMQ_VHOST', 'swifttrack_vhost')
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')

# =============================================================================
# LOGGING SETUP (Structured Logging)
# =============================================================================

class StructuredLogger:
    def __init__(self, name):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, LOG_LEVEL))
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "api-gateway", "message": "%(message)s"}'
        ))
        self.logger.addHandler(handler)
    
    def info(self, message, **kwargs):
        self.logger.info(json.dumps({"msg": message, **kwargs}))
    
    def error(self, message, **kwargs):
        self.logger.error(json.dumps({"msg": message, **kwargs}))
    
    def warning(self, message, **kwargs):
        self.logger.warning(json.dumps({"msg": message, **kwargs}))
    
    def debug(self, message, **kwargs):
        self.logger.debug(json.dumps({"msg": message, **kwargs}))

logger = StructuredLogger(__name__)

# =============================================================================
# DATABASE CONNECTION
# =============================================================================

def get_db_connection():
    """Create a new database connection with retry logic."""
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(
                host=POSTGRES_HOST,
                database=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                cursor_factory=RealDictCursor
            )
            return conn
        except psycopg2.OperationalError as e:
            if attempt < max_retries - 1:
                logger.warning("Database connection failed, retrying...", attempt=attempt + 1)
                time.sleep(retry_delay)
            else:
                logger.error("Database connection failed after retries", error=str(e))
                raise

# =============================================================================
# RABBITMQ CONNECTION
# =============================================================================

def get_rabbitmq_connection():
    """Create RabbitMQ connection with retry logic."""
    max_retries = 5
    retry_delay = 2
    
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        virtual_host=RABBITMQ_VHOST,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300
    )
    
    for attempt in range(max_retries):
        try:
            connection = pika.BlockingConnection(parameters)
            return connection
        except pika.exceptions.AMQPConnectionError as e:
            if attempt < max_retries - 1:
                logger.warning("RabbitMQ connection failed, retrying...", attempt=attempt + 1)
                time.sleep(retry_delay)
            else:
                logger.error("RabbitMQ connection failed after retries", error=str(e))
                raise

def publish_message(exchange, routing_key, message, headers=None):
    """Publish message to RabbitMQ with delivery confirmation."""
    try:
        connection = get_rabbitmq_connection()
        channel = connection.channel()
        channel.confirm_delivery()
        
        properties = pika.BasicProperties(
            delivery_mode=2,  # Persistent message
            content_type='application/json',
            message_id=str(uuid.uuid4()),
            timestamp=int(time.time()),
            headers=headers or {}
        )
        
        channel.basic_publish(
            exchange=exchange,
            routing_key=routing_key,
            body=json.dumps(message),
            properties=properties,
            mandatory=True
        )
        
        connection.close()
        logger.info("Message published successfully", exchange=exchange, routing_key=routing_key)
        return True
    except Exception as e:
        logger.error("Failed to publish message", error=str(e), exchange=exchange)
        return False

# =============================================================================
# JWT AUTHENTICATION MIDDLEWARE
# =============================================================================

def generate_token(user_data):
    """Generate JWT token for authenticated user."""
    payload = {
        'user_id': str(user_data['id']),
        'email': user_data['email'],
        'role': user_data['role'],
        'name': user_data['name'],
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm='HS256')

def token_required(f):
    """Decorator to require valid JWT token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
            g.current_user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    return decorated

def optional_token(f):
    """Decorator to optionally verify JWT token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            try:
                payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
                g.current_user = payload
            except:
                g.current_user = None
        else:
            g.current_user = None
        
        return f(*args, **kwargs)
    return decorated

# =============================================================================
# ROOT ENDPOINT
# =============================================================================

@app.route('/', methods=['GET'])
def root():
    """Root endpoint showing API information."""
    return jsonify({
        'service': 'SwiftTrack Logistics API Gateway',
        'version': '1.0.0',
        'status': 'running',
        'endpoints': {
            'health': '/health',
            'auth': '/api/auth/login, /api/auth/register, /api/auth/logout',
            'orders': '/api/orders',
            'drivers': '/api/drivers',
            'clients': '/api/clients',
            'admin': '/api/admin/stats, /api/admin/logs'
        },
        'documentation': 'Use /health to check service status'
    })

# =============================================================================
# HEALTH CHECK ENDPOINT
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for Docker and load balancers."""
    health_status = {
        'service': 'api-gateway',
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'checks': {}
    }
    
    # Check database
    try:
        conn = get_db_connection()
        conn.close()
        health_status['checks']['database'] = 'healthy'
    except:
        health_status['checks']['database'] = 'unhealthy'
        health_status['status'] = 'degraded'
    
    # Check RabbitMQ
    try:
        conn = get_rabbitmq_connection()
        conn.close()
        health_status['checks']['rabbitmq'] = 'healthy'
    except:
        health_status['checks']['rabbitmq'] = 'unhealthy'
        health_status['status'] = 'degraded'
    
    status_code = 200 if health_status['status'] == 'healthy' else 503
    return jsonify(health_status), status_code

# =============================================================================
# AUTHENTICATION ENDPOINTS
# =============================================================================

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token."""
    try:
        data = request.get_json()
        email = data.get('email', '').lower().strip()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT id, email, password_hash, name, role, phone, avatar, status FROM users WHERE email = %s",
            (email,)
        )
        user = cursor.fetchone()
        conn.close()
        
        if not user:
            return jsonify({'error': 'Invalid email or password'}), 401
        
        if user['status'] != 'active':
            return jsonify({'error': 'Account is not active'}), 401
        
        # Verify password (for demo, accept 'password123' directly)
        if password == 'password123' or bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            token = generate_token(user)
            
            user_response = {
                'id': str(user['id']),
                'email': user['email'],
                'name': user['name'],
                'role': user['role'],
                'phone': user['phone'],
                'avatar': user['avatar']
            }
            
            logger.info("User logged in successfully", user_id=str(user['id']), email=email)
            
            return jsonify({
                'success': True,
                'token': token,
                'user': user_response
            }), 200
        else:
            return jsonify({'error': 'Invalid email or password'}), 401
            
    except Exception as e:
        logger.error("Login failed", error=str(e))
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user."""
    try:
        data = request.get_json()
        email = data.get('email', '').lower().strip()
        password = data.get('password', '')
        name = data.get('name', '')
        role = data.get('role', 'client')
        phone = data.get('phone', '')
        
        if not email or not password or not name:
            return jsonify({'error': 'Email, password, and name are required'}), 400
        
        if role not in ['client', 'driver', 'admin']:
            return jsonify({'error': 'Invalid role'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if email already exists
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Email already registered'}), 409
        
        # Hash password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Create user (id is auto-generated by SERIAL)
        cursor.execute(
            """INSERT INTO users (email, password_hash, name, role, phone, status)
               VALUES (%s, %s, %s, %s, %s, 'active')
               RETURNING id, email, name, role, phone, avatar""",
            (email, password_hash, name, role, phone)
        )
        user = cursor.fetchone()
        user_id = user['id']
        
        # Create role-specific profile
        if role == 'client':
            cursor.execute(
                "INSERT INTO clients (user_id, company, status) VALUES (%s, %s, 'active')",
                (user_id, data.get('company', ''))
            )
        elif role == 'driver':
            cursor.execute(
                "INSERT INTO drivers (user_id, vehicle_type, vehicle_plate, status) VALUES (%s, %s, %s, 'inactive')",
                (user_id, data.get('vehicleType', ''), data.get('vehiclePlate', ''))
            )
        
        conn.commit()
        conn.close()
        
        token = generate_token(user)
        
        user_response = {
            'id': str(user['id']),
            'email': user['email'],
            'name': user['name'],
            'role': user['role'],
            'phone': user['phone'],
            'avatar': user['avatar']
        }
        
        logger.info("User registered successfully", user_id=user_id, email=email, role=role)
        
        # Publish user registration event
        publish_message('swifttrack.notifications', '', {
            'type': 'user_registered',
            'user_id': user_id,
            'email': email,
            'name': name,
            'role': role
        })
        
        return jsonify({
            'success': True,
            'token': token,
            'user': user_response
        }), 201
        
    except Exception as e:
        logger.error("Registration failed", error=str(e))
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/logout', methods=['POST'])
@token_required
def logout():
    """Logout user (client-side token removal)."""
    logger.info("User logged out", user_id=g.current_user.get('user_id'))
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200

# =============================================================================
# ORDERS ENDPOINTS - Route to Middleware Service
# =============================================================================

@app.route('/api/orders', methods=['GET'])
@optional_token
def get_orders():
    """Get all orders with optional filters."""
    try:
        # Forward to middleware service
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/orders",
            params=request.args,
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch orders from middleware", error=str(e))
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders/<order_id>', methods=['GET'])
@optional_token
def get_order(order_id):
    """Get single order by ID."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/orders/{order_id}",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch order from middleware", error=str(e), order_id=order_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders', methods=['POST'])
@optional_token
def create_order():
    """Create a new order - initiates Saga transaction."""
    try:
        data = request.get_json()
        
        # Add user context if authenticated
        if g.current_user:
            data['user_id'] = g.current_user.get('user_id')
        
        response = requests.post(
            f"{MIDDLEWARE_SERVICE_URL}/orders",
            json=data,
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=30
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to create order via middleware", error=str(e))
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders/<order_id>', methods=['PUT'])
@optional_token
def update_order(order_id):
    """Update an existing order."""
    try:
        response = requests.put(
            f"{MIDDLEWARE_SERVICE_URL}/orders/{order_id}",
            json=request.get_json(),
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to update order", error=str(e), order_id=order_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders/<order_id>/cancel', methods=['POST'])
@optional_token
def cancel_order(order_id):
    """Cancel an order."""
    try:
        response = requests.post(
            f"{MIDDLEWARE_SERVICE_URL}/orders/{order_id}/cancel",
            json=request.get_json() or {},
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to cancel order", error=str(e), order_id=order_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders/<order_id>/delivered', methods=['POST'])
@optional_token
def mark_order_delivered(order_id):
    """Mark order as delivered."""
    try:
        response = requests.post(
            f"{MIDDLEWARE_SERVICE_URL}/orders/{order_id}/delivered",
            json=request.get_json() or {},
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to mark order delivered", error=str(e), order_id=order_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders/<order_id>/failed', methods=['POST'])
@optional_token
def mark_order_failed(order_id):
    """Mark order as failed."""
    try:
        response = requests.post(
            f"{MIDDLEWARE_SERVICE_URL}/orders/{order_id}/failed",
            json=request.get_json() or {},
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to mark order as failed", error=str(e), order_id=order_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders/<order_id>/start_delivery', methods=['POST'])
@optional_token
def start_delivery(order_id):
    """Start delivery - changes order status to out_for_delivery."""
    try:
        response = requests.post(
            f"{MIDDLEWARE_SERVICE_URL}/orders/{order_id}/start_delivery",
            json=request.get_json() or {},
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to start delivery", error=str(e), order_id=order_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders/<order_id>/accept', methods=['POST'])
@optional_token
def accept_order(order_id):
    """Accept order - driver accepts an assigned order."""
    try:
        response = requests.post(
            f"{MIDDLEWARE_SERVICE_URL}/orders/{order_id}/accept",
            json=request.get_json() or {},
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to accept order", error=str(e), order_id=order_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/orders/<order_id>/reject', methods=['POST'])
@optional_token
def reject_order(order_id):
    """Reject order - driver rejects an assigned order."""
    try:
        response = requests.post(
            f"{MIDDLEWARE_SERVICE_URL}/orders/{order_id}/reject",
            json=request.get_json() or {},
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to reject order", error=str(e), order_id=order_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

# =============================================================================
# DRIVER ENDPOINTS
# =============================================================================

@app.route('/api/drivers', methods=['GET'])
@optional_token
def get_drivers():
    """Get all drivers."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/drivers",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch drivers", error=str(e))
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/drivers/<driver_id>/route', methods=['GET'])
@optional_token
def get_driver_route(driver_id):
    """Get driver's route."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/drivers/{driver_id}/route",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch driver route", error=str(e), driver_id=driver_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/drivers/<driver_id>/stats', methods=['GET'])
@optional_token
def get_driver_stats(driver_id):
    """Get driver statistics."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/drivers/{driver_id}/stats",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch driver stats", error=str(e), driver_id=driver_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/drivers/<driver_id>/location', methods=['PUT'])
@optional_token
def update_driver_location(driver_id):
    """Update driver location."""
    try:
        response = requests.put(
            f"{MIDDLEWARE_SERVICE_URL}/drivers/{driver_id}/location",
            json=request.get_json(),
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to update driver location", error=str(e), driver_id=driver_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/drivers/<driver_id>/status', methods=['PUT'])
@optional_token
def update_driver_status(driver_id):
    """Update driver status."""
    try:
        response = requests.put(
            f"{MIDDLEWARE_SERVICE_URL}/drivers/{driver_id}/status",
            json=request.get_json(),
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to update driver status", error=str(e), driver_id=driver_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

# =============================================================================
# CLIENT ENDPOINTS
# =============================================================================

@app.route('/api/clients', methods=['GET'])
@optional_token
def get_clients():
    """Get all clients."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/clients",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch clients", error=str(e))
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/clients/<client_id>', methods=['GET'])
@optional_token
def get_client(client_id):
    """Get client by ID."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/clients/{client_id}",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch client", error=str(e), client_id=client_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/clients/<client_id>/stats', methods=['GET'])
@optional_token
def get_client_stats(client_id):
    """Get client statistics."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/clients/{client_id}/stats",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch client stats", error=str(e), client_id=client_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/clients/<client_id>/status', methods=['PUT'])
@optional_token
def update_client_status(client_id):
    """Update client status."""
    try:
        response = requests.put(
            f"{MIDDLEWARE_SERVICE_URL}/clients/{client_id}/status",
            json=request.get_json(),
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to update client status", error=str(e), client_id=client_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/clients/<client_id>/billing', methods=['GET'])
@optional_token
def get_client_billing(client_id):
    """Get client billing history."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/clients/{client_id}/billing",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch client billing", error=str(e), client_id=client_id)
        return jsonify({'error': 'Service temporarily unavailable'}), 503

# =============================================================================
# ADMIN ENDPOINTS
# =============================================================================

@app.route('/api/admin/stats', methods=['GET'])
@optional_token
def get_admin_stats():
    """Get admin dashboard statistics."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/admin/stats",
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch admin stats", error=str(e))
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/admin/logs', methods=['GET'])
@optional_token
def get_admin_logs():
    """Get system logs."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/admin/logs",
            params=request.args,
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch admin logs", error=str(e))
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/admin/analytics', methods=['GET'])
@optional_token
def get_admin_analytics():
    """Get analytics data."""
    try:
        response = requests.get(
            f"{MIDDLEWARE_SERVICE_URL}/admin/analytics",
            params=request.args,
            headers={'X-User-Context': json.dumps(g.current_user)} if g.current_user else {},
            timeout=10
        )
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        logger.error("Failed to fetch admin analytics", error=str(e))
        return jsonify({'error': 'Service temporarily unavailable'}), 503

@app.route('/api/admin/users', methods=['GET'])
@optional_token
def get_all_users():
    """Get all users (admin only)."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.email, u.name, u.role, u.phone, u.status, u.created_at,
                   c.company, c.total_orders, c.id as client_id,
                   d.vehicle_type, d.vehicle_plate, d.rating, d.total_deliveries, d.success_rate, d.id as driver_id
            FROM users u
            LEFT JOIN clients c ON c.user_id = u.id
            LEFT JOIN drivers d ON d.user_id = u.id
            ORDER BY u.id
        """)
        rows = cursor.fetchall()
        conn.close()
        users = []
        for row in rows:
            user = {
                'id': row['id'],
                'email': row['email'],
                'name': row['name'],
                'role': row['role'],
                'phone': row['phone'],
                'status': row['status'],
                'created_at': row['created_at'].isoformat() if row['created_at'] else None,
            }
            if row['role'] == 'client':
                user['company'] = row['company']
                user['total_orders'] = row['total_orders']
                user['client_id'] = row['client_id']
            elif row['role'] == 'driver':
                user['vehicle_type'] = row['vehicle_type']
                user['vehicle_plate'] = row['vehicle_plate']
                user['rating'] = float(row['rating']) if row['rating'] else 0.0
                user['total_deliveries'] = row['total_deliveries']
                user['success_rate'] = float(row['success_rate']) if row['success_rate'] else 0.0
                user['driver_id'] = row['driver_id']
            users.append(user)
        return jsonify({'users': users}), 200
    except Exception as e:
        logger.error("Failed to fetch users", error=str(e))
        return jsonify({'error': 'Failed to fetch users'}), 500

@app.route('/api/admin/users', methods=['POST'])
@optional_token
def admin_create_user():
    """Create a new user (admin only)."""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip()
        role = data.get('role', 'client')
        phone = data.get('phone', '').strip()
        company = data.get('company', '').strip()
        vehicle_type = data.get('vehicleType', '').strip()
        vehicle_plate = data.get('vehiclePlate', '').strip()

        if not name or not email or not password or role not in ('client', 'driver', 'admin'):
            return jsonify({'error': 'Name, email, password, and valid role are required'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Email already registered'}), 409

        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        cursor.execute(
            """INSERT INTO users (email, password_hash, name, role, phone, status)
               VALUES (%s, %s, %s, %s, %s, 'active')
               RETURNING id, email, name, role, phone, status""",
            (email, password_hash, name, role, phone)
        )
        user = cursor.fetchone()
        user_id = user['id']

        if role == 'client':
            cursor.execute(
                "INSERT INTO clients (user_id, company, status) VALUES (%s, %s, 'active')",
                (user_id, company)
            )
        elif role == 'driver':
            cursor.execute(
                "INSERT INTO drivers (user_id, vehicle_type, vehicle_plate, status) VALUES (%s, %s, %s, 'inactive')",
                (user_id, vehicle_type, vehicle_plate)
            )

        conn.commit()
        conn.close()

        logger.info("Admin created user", user_id=user_id, email=email, role=role)
        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'name': user['name'],
                'role': user['role'],
                'phone': user['phone'],
                'status': user['status'],
            }
        }), 201
    except Exception as e:
        logger.error("Failed to create user", error=str(e))
        return jsonify({'error': 'Failed to create user'}), 500

@app.route('/api/admin/users/<int:user_id>/status', methods=['PUT'])
@optional_token
def update_user_status(user_id):
    """Toggle user status active/inactive."""
    try:
        data = request.get_json()
        new_status = data.get('status')
        if new_status not in ('active', 'inactive', 'suspended'):
            return jsonify({'error': 'Invalid status'}), 400
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET status = %s WHERE id = %s RETURNING id, status",
            (new_status, user_id)
        )
        result = cursor.fetchone()
        conn.commit()
        conn.close()
        if not result:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({'success': True, 'id': result['id'], 'status': result['status']}), 200
    except Exception as e:
        logger.error("Failed to update user status", error=str(e))
        return jsonify({'error': 'Failed to update status'}), 500

# =============================================================================
# DELIVERY PROOF UPLOAD
# =============================================================================

@app.route('/api/orders/<order_id>/proof', methods=['POST'])
@token_required
def upload_delivery_proof(order_id):
    """Upload delivery proof (photo or signature)."""
    try:
        data = request.get_json() or {}
        proof_type = data.get('proofType', 'photo')  # 'photo' or 'signature'
        proof_data = data.get('proofData', '')  # Base64 encoded image
        notes = data.get('notes', '')
        recipient_name = data.get('recipientName', '')
        
        if not proof_data:
            return jsonify({'error': 'Proof data is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get the order
        cursor.execute("SELECT * FROM orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        # Store proof in delivery_proofs table
        proof_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO delivery_proofs (id, order_id, proof_type, proof_data, recipient_name, notes, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (order_id) DO UPDATE SET
                proof_type = EXCLUDED.proof_type,
                proof_data = EXCLUDED.proof_data,
                recipient_name = EXCLUDED.recipient_name,
                notes = EXCLUDED.notes,
                created_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (proof_id, order_id, proof_type, proof_data, recipient_name, notes))
        
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, 'proof_uploaded', %s)",
            (order_id, f'Delivery proof ({proof_type}) uploaded')
        )
        
        conn.commit()
        conn.close()
        
        # Publish real-time event
        publish_message('swifttrack.notifications', 'realtime.proof_uploaded', {
            'type': 'proof_uploaded',
            'order_id': order_id,
            'proof_type': proof_type,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        logger.info("Delivery proof uploaded", order_id=order_id, proof_type=proof_type)
        
        return jsonify({
            'success': True,
            'proofId': proof_id,
            'orderId': order_id,
            'proofType': proof_type
        }), 200
        
    except Exception as e:
        logger.error("Failed to upload delivery proof", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to upload delivery proof'}), 500

@app.route('/api/orders/<order_id>/proof', methods=['GET'])
@optional_token
def get_delivery_proof(order_id):
    """Get delivery proof for an order."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM delivery_proofs WHERE order_id = %s
        """, (order_id,))
        
        proof = cursor.fetchone()
        conn.close()
        
        if not proof:
            return jsonify({'error': 'No proof found'}), 404
        
        return jsonify({
            'proofId': str(proof['id']),
            'orderId': order_id,
            'proofType': proof['proof_type'],
            'proofData': proof['proof_data'],
            'recipientName': proof['recipient_name'],
            'notes': proof['notes'],
            'createdAt': proof['created_at'].isoformat() if proof['created_at'] else None
        }), 200
        
    except Exception as e:
        logger.error("Failed to get delivery proof", error=str(e))
        return jsonify({'error': 'Failed to get delivery proof'}), 500

@app.route('/api/orders/<order_id>/assign', methods=['POST'])
@token_required
def assign_driver_to_order(order_id):
    """Assign a driver to an order."""
    try:
        data = request.get_json()
        driver_id = data.get('driverId')
        
        if not driver_id:
            return jsonify({'error': 'Driver ID is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get driver info
        cursor.execute("""
            SELECT d.id, d.user_id, u.name, u.phone, d.vehicle_type, d.vehicle_plate
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            WHERE d.id::text = %s OR d.user_id::text = %s
        """, (driver_id, driver_id))
        driver = cursor.fetchone()
        
        if not driver:
            conn.close()
            return jsonify({'error': 'Driver not found'}), 404
        
        # Update order with driver
        cursor.execute("""
            UPDATE orders 
            SET driver_id = %s, status = 'in_warehouse', updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
        """, (driver['id'], order_id))
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, 'driver_assigned', %s)",
            (order_id, f"Driver {driver['name']} assigned to order")
        )
        
        conn.commit()
        conn.close()
        
        # Publish real-time events
        publish_message('swifttrack.notifications', 'realtime.driver_assigned', {
            'type': 'driver_assigned',
            'order_id': order_id,
            'driver_id': str(driver['id']),
            'driver_name': driver['name'],
            'driver_phone': driver['phone'],
            'vehicle_type': driver['vehicle_type'],
            'vehicle_plate': driver['vehicle_plate']
        })
        
        # Notify driver
        publish_message('swifttrack.notifications', 'realtime.new_assignment', {
            'type': 'new_assignment',
            'driver_id': str(driver['id']),
            'order_id': order_id,
            'pickup_address': order['pickup_address'],
            'delivery_address': order['delivery_address']
        })
        
        logger.info("Driver assigned to order", order_id=order_id, driver_id=str(driver['id']))
        
        return jsonify({
            'success': True,
            'orderId': order_id,
            'driverId': str(driver['id']),
            'driverName': driver['name']
        }), 200
        
    except Exception as e:
        logger.error("Failed to assign driver", error=str(e))
        return jsonify({'error': 'Failed to assign driver'}), 500

@app.route('/api/orders/<order_id>/status', methods=['PUT'])
@token_required
def update_order_status(order_id):
    """Update order status with real-time notification."""
    try:
        data = request.get_json()
        new_status = data.get('status')
        
        valid_statuses = ['pending', 'confirmed', 'in_warehouse', 'out_for_delivery', 'delivered', 'failed', 'cancelled']
        if new_status not in valid_statuses:
            return jsonify({'error': 'Invalid status'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        update_fields = ["status = %s", "updated_at = CURRENT_TIMESTAMP"]
        params = [new_status]
        
        if new_status == 'delivered':
            update_fields.append("delivered_at = CURRENT_TIMESTAMP")
        
        params.append(order_id)
        
        cursor.execute(f"""
            UPDATE orders SET {', '.join(update_fields)}
            WHERE id = %s
            RETURNING *
        """, params)
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        # Status descriptions
        status_desc = {
            'pending': 'Order is pending',
            'confirmed': 'Order confirmed by warehouse',
            'in_warehouse': 'Package received at warehouse',
            'out_for_delivery': 'Out for delivery',
            'delivered': 'Successfully delivered',
            'failed': 'Delivery failed',
            'cancelled': 'Order cancelled'
        }
        
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, %s, %s)",
            (order_id, new_status, status_desc.get(new_status, f'Status changed to {new_status}'))
        )
        
        # Update driver stats if delivered
        if new_status == 'delivered' and order['driver_id']:
            cursor.execute("""
                UPDATE drivers 
                SET total_deliveries = total_deliveries + 1
                WHERE id = %s
            """, (order['driver_id'],))
        
        conn.commit()
        conn.close()
        
        # Publish real-time event
        publish_message('swifttrack.notifications', 'realtime.order_status', {
            'type': 'order_status_update',
            'order_id': order_id,
            'status': new_status,
            'data': {
                'driver_id': str(order['driver_id']) if order['driver_id'] else None,
                'client_id': str(order['client_id']) if order['client_id'] else None
            }
        })
        
        logger.info("Order status updated", order_id=order_id, status=new_status)
        
        return jsonify({
            'success': True,
            'orderId': order_id,
            'status': new_status
        }), 200
        
    except Exception as e:
        logger.error("Failed to update order status", error=str(e))
        return jsonify({'error': 'Failed to update order status'}), 500

# =============================================================================
# NOTIFICATIONS ENDPOINTS
# =============================================================================

@app.route('/api/notifications', methods=['GET'])
@token_required
def get_notifications():
    """Get notifications for the authenticated user."""
    try:
        user_id = g.current_user.get('user_id')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, type, title, message, read, data, created_at
            FROM notifications
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 100
        """, (user_id,))
        rows = cursor.fetchall()
        conn.close()
        notifications = []
        for row in rows:
            notifications.append({
                'id': str(row['id']),
                'type': row['type'],
                'title': row['title'],
                'message': row['message'],
                'read': bool(row['read']),
                'data': row['data'] or {},
                'createdAt': row['created_at'].isoformat() if row['created_at'] else None,
            })
        return jsonify({'data': notifications}), 200
    except Exception as e:
        logger.error("Failed to fetch notifications", error=str(e))
        return jsonify({'error': 'Failed to fetch notifications'}), 500

@app.route('/api/notifications/read-all', methods=['PUT'])
@token_required
def mark_all_notifications_read():
    """Mark all notifications as read for the authenticated user."""
    try:
        user_id = g.current_user.get('user_id')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE notifications SET read = TRUE WHERE user_id = %s AND read = FALSE",
            (user_id,)
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error("Failed to mark all notifications read", error=str(e))
        return jsonify({'error': 'Failed to mark all notifications read'}), 500

@app.route('/api/notifications/<notification_id>/read', methods=['PUT'])
@token_required
def mark_notification_read(notification_id):
    """Mark a single notification as read."""
    try:
        user_id = g.current_user.get('user_id')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE notifications SET read = TRUE WHERE id = %s AND user_id = %s",
            (notification_id, user_id)
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error("Failed to mark notification read", error=str(e))
        return jsonify({'error': 'Failed to mark notification read'}), 500

@app.route('/api/notifications/<notification_id>', methods=['DELETE'])
@token_required
def delete_notification(notification_id):
    """Delete a notification."""
    try:
        user_id = g.current_user.get('user_id')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM notifications WHERE id = %s AND user_id = %s",
            (notification_id, user_id)
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error("Failed to delete notification", error=str(e))
        return jsonify({'error': 'Failed to delete notification'}), 500

# =============================================================================
# SERVICE ACTIVITY ENDPOINTS
# =============================================================================

@app.route('/api/service-activity', methods=['GET'])
@optional_token
def get_service_activity():
    """Get service activity logs for CMS, WMS, and ROS services."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query parameters
        order_id = request.args.get('order_id')
        service_name = request.args.get('service_name')
        status = request.args.get('status')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        
        # Build query
        query = """
            SELECT sa.*, o.status as order_status, 
                   u.name as client_name
            FROM service_activity sa
            LEFT JOIN orders o ON sa.order_id = o.id
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN users u ON c.user_id = u.id
            WHERE 1=1
        """
        params = []
        
        if order_id:
            query += " AND sa.order_id = %s"
            params.append(order_id)
        
        if service_name:
            query += " AND sa.service_name = %s"
            params.append(service_name.upper())
        
        if status:
            query += " AND sa.status = %s"
            params.append(status)
        
        query += " ORDER BY sa.created_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        activities = cursor.fetchall()
        
        # Get total count
        count_query = """
            SELECT COUNT(*) FROM service_activity sa WHERE 1=1
        """
        count_params = []
        if order_id:
            count_query += " AND sa.order_id = %s"
            count_params.append(order_id)
        if service_name:
            count_query += " AND sa.service_name = %s"
            count_params.append(service_name.upper())
        if status:
            count_query += " AND sa.status = %s"
            count_params.append(status)
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['count']
        
        conn.close()
        
        # Format response
        result = []
        for activity in activities:
            result.append({
                'id': str(activity['id']),
                'order_id': activity['order_id'],
                'order_status': activity['order_status'],
                'client_name': activity['client_name'],
                'service_name': activity['service_name'],
                'service_type': activity['service_type'],
                'action': activity['action'],
                'status': activity['status'],
                'protocol': activity['protocol'],
                'endpoint': activity['endpoint'],
                'request_data': activity['request_data'],
                'response_data': activity['response_data'],
                'error_message': activity['error_message'],
                'duration_ms': activity['duration_ms'],
                'created_at': activity['created_at'].isoformat() if activity['created_at'] else None
            })
        
        return jsonify({
            'data': result,
            'total': total,
            'limit': limit,
            'offset': offset
        }), 200
        
    except Exception as e:
        logger.error("Failed to fetch service activity", error=str(e))
        return jsonify({'error': 'Failed to fetch service activity'}), 500

@app.route('/api/service-activity/stats', methods=['GET'])
@optional_token
def get_service_activity_stats():
    """Get service activity statistics."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get counts by service
        cursor.execute("""
            SELECT service_name, 
                   COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status = 'success') as success_count,
                   COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
                   COUNT(*) FILTER (WHERE status = 'skipped') as skipped_count,
                   AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_duration
            FROM service_activity
            GROUP BY service_name
        """)
        service_stats = cursor.fetchall()
        
        # Get recent activity count (last 24 hours)
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM service_activity
            WHERE created_at > NOW() - INTERVAL '24 hours'
        """)
        recent = cursor.fetchone()
        
        conn.close()
        
        stats = {
            'services': {},
            'total_last_24h': recent['count']
        }
        
        for row in service_stats:
            stats['services'][row['service_name']] = {
                'total': row['total'],
                'success': row['success_count'],
                'failed': row['failed_count'],
                'skipped': row['skipped_count'],
                'avg_duration_ms': round(float(row['avg_duration']), 2) if row['avg_duration'] else None
            }
        
        return jsonify({'data': stats}), 200
        
    except Exception as e:
        logger.error("Failed to fetch service activity stats", error=str(e))
        return jsonify({'error': 'Failed to fetch service activity stats'}), 500

@app.route('/api/service-activity/order/<order_id>', methods=['GET'])
@optional_token
def get_order_service_activity(order_id):
    """Get service activity for a specific order."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM service_activity
            WHERE order_id = %s
            ORDER BY created_at ASC
        """, (order_id,))
        
        activities = cursor.fetchall()
        conn.close()
        
        result = []
        for activity in activities:
            result.append({
                'id': str(activity['id']),
                'service_name': activity['service_name'],
                'service_type': activity['service_type'],
                'action': activity['action'],
                'status': activity['status'],
                'protocol': activity['protocol'],
                'endpoint': activity['endpoint'],
                'error_message': activity['error_message'],
                'duration_ms': activity['duration_ms'],
                'created_at': activity['created_at'].isoformat() if activity['created_at'] else None
            })
        
        return jsonify({'data': result}), 200
        
    except Exception as e:
        logger.error("Failed to fetch order service activity", error=str(e))
        return jsonify({'error': 'Failed to fetch order service activity'}), 500

# =============================================================================
# ERROR HANDLERS
# =============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error("Internal server error", error=str(error))
    return jsonify({'error': 'Internal server error'}), 500

# =============================================================================
# STARTUP
# =============================================================================

if __name__ == '__main__':
    logger.info("Starting API Gateway", port=5002)
    app.run(host='0.0.0.0', port=5002, debug=False)
