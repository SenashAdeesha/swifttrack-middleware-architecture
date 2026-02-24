# =============================================================================
# SwiftTrack Logistics - Middleware Service
# =============================================================================
# Central business logic orchestrator
# Implements: Saga Pattern Initiation, Service Coordination, Data Aggregation
# =============================================================================

import os
import json
import uuid
import logging
import time
from datetime import datetime, timedelta
from decimal import Decimal

from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import pika
import requests

# =============================================================================
# CONFIGURATION
# =============================================================================

app = Flask(__name__)
CORS(app)

# Environment variables
POSTGRES_HOST = os.environ.get('POSTGRES_HOST', 'postgres')
POSTGRES_DB = os.environ.get('POSTGRES_DB', 'swifttrack')
POSTGRES_USER = os.environ.get('POSTGRES_USER', 'swifttrack_user')
POSTGRES_PASSWORD = os.environ.get('POSTGRES_PASSWORD', 'swifttrack_secure_pass_2026')
RABBITMQ_HOST = os.environ.get('RABBITMQ_HOST', 'rabbitmq')
RABBITMQ_USER = os.environ.get('RABBITMQ_USER', 'swifttrack')
RABBITMQ_PASS = os.environ.get('RABBITMQ_PASS', 'swifttrack_mq_2026')
RABBITMQ_VHOST = os.environ.get('RABBITMQ_VHOST', 'swifttrack_vhost')
CMS_SERVICE_URL = os.environ.get('CMS_SERVICE_URL', 'http://cms-service:5003')
ROS_SERVICE_URL = os.environ.get('ROS_SERVICE_URL', 'http://ros-service:5004')
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
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "middleware", "message": "%(message)s"}'
        ))
        self.logger.addHandler(handler)
    
    def info(self, message, **kwargs):
        self.logger.info(json.dumps({"msg": message, **kwargs}))
    
    def error(self, message, **kwargs):
        self.logger.error(json.dumps({"msg": message, **kwargs}))
    
    def warning(self, message, **kwargs):
        self.logger.warning(json.dumps({"msg": message, **kwargs}))

logger = StructuredLogger(__name__)

# =============================================================================
# DATABASE CONNECTION
# =============================================================================

def get_db_connection():
    """Create database connection with retry logic."""
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
                time.sleep(retry_delay)
            else:
                raise

# =============================================================================
# RABBITMQ CONNECTION & MESSAGING
# =============================================================================

def get_rabbitmq_connection():
    """Create RabbitMQ connection with retry."""
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        virtual_host=RABBITMQ_VHOST,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300
    )
    
    max_retries = 5
    for attempt in range(max_retries):
        try:
            return pika.BlockingConnection(parameters)
        except pika.exceptions.AMQPConnectionError:
            if attempt < max_retries - 1:
                time.sleep(2)
            else:
                raise

def publish_message(exchange, routing_key, message, headers=None):
    """
    =========================================================================
    ASYNCHRONOUS MESSAGING IMPLEMENTATION
    =========================================================================
    Publishes messages to RabbitMQ with:
    - Delivery confirmation (publisher confirms)
    - Persistent messages (delivery_mode=2)
    - Message headers for tracking
    =========================================================================
    """
    try:
        connection = get_rabbitmq_connection()
        channel = connection.channel()
        channel.confirm_delivery()  # Enable publisher confirms
        
        properties = pika.BasicProperties(
            delivery_mode=2,  # PERSISTENT MESSAGE - survives broker restart
            content_type='application/json',
            message_id=str(uuid.uuid4()),
            timestamp=int(time.time()),
            headers=headers or {}
        )
        
        channel.basic_publish(
            exchange=exchange,
            routing_key=routing_key,
            body=json.dumps(message, default=str),
            properties=properties,
            mandatory=True  # Ensures message is routed to a queue
        )
        
        connection.close()
        logger.info("Message published", exchange=exchange, routing_key=routing_key)
        return True
    except Exception as e:
        logger.error("Message publish failed", error=str(e))
        return False

def initiate_saga(saga_type, payload):
    """
    =========================================================================
    SAGA PATTERN IMPLEMENTATION
    =========================================================================
    Initiates a Saga transaction for distributed operations.
    Steps:
    1. Create saga state record in database
    2. Publish saga initiation message to orchestrator
    =========================================================================
    """
    saga_id = str(uuid.uuid4())
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Create saga state record for tracking
        cursor.execute(
            """INSERT INTO saga_state (saga_id, saga_type, current_step, status, payload)
               VALUES (%s, %s, 'initiated', 'started', %s)
               RETURNING id""",
            (saga_id, saga_type, json.dumps(payload, default=str))
        )
        
        conn.commit()
        conn.close()
        
        # Publish to saga orchestrator queue
        publish_message(
            'swifttrack.saga',
            f'saga.{saga_type}',
            {
                'saga_id': saga_id,
                'saga_type': saga_type,
                'payload': payload,
                'timestamp': datetime.utcnow().isoformat()
            },
            headers={'saga_id': saga_id}
        )
        
        logger.info("Saga initiated", saga_id=saga_id, saga_type=saga_type)
        return saga_id
        
    except Exception as e:
        logger.error("Saga initiation failed", error=str(e), saga_type=saga_type)
        return None

# =============================================================================
# JSON SERIALIZATION HELPER
# =============================================================================

def serialize_record(record):
    """Convert database record to JSON-serializable format."""
    if record is None:
        return None
    
    result = dict(record)
    for key, value in result.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, Decimal):
            result[key] = float(value)
        elif isinstance(value, uuid.UUID):
            result[key] = str(value)
    return result

# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'service': 'middleware-service',
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    }), 200

# =============================================================================
# ORDERS ENDPOINTS
# =============================================================================

@app.route('/orders', methods=['GET'])
def get_orders():
    """Get all orders with optional filters."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Build query with filters
        query = """
            SELECT o.*, 
                   u.name as client_name,
                   d_user.name as driver_name,
                   d_user.phone as driver_phone,
                   d.vehicle_type as driver_vehicle_type,
                   d.vehicle_plate as driver_vehicle_plate
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN drivers d ON o.driver_id = d.id
            LEFT JOIN users d_user ON d.user_id = d_user.id
            WHERE 1=1
        """
        params = []
        
        status = request.args.get('status')
        if status:
            # Support comma-separated status values (e.g. "confirmed,in_warehouse")
            status_list = [s.strip() for s in status.split(',') if s.strip()]
            if len(status_list) == 1:
                query += " AND o.status = %s"
                params.append(status_list[0])
            else:
                placeholders = ','.join(['%s'] * len(status_list))
                query += f" AND o.status IN ({placeholders})"
                params.extend(status_list)
        
        client_id = request.args.get('clientId')
        if client_id:
            # Match by client user_id or client table id
            query += " AND (c.user_id::text = %s OR c.id::text = %s OR o.client_id::text = %s)"
            params.extend([client_id, client_id, client_id])
        
        driver_id = request.args.get('driverId')
        if driver_id:
            query += " AND (d.user_id::text = %s OR d.id::text = %s OR o.driver_id::text = %s)"
            params.extend([driver_id, driver_id, driver_id])
        
        query += " ORDER BY o.created_at DESC"
        
        cursor.execute(query, params)
        orders = cursor.fetchall()
        
        # Get timeline for each order
        result = []
        for order in orders:
            order_dict = serialize_record(order)
            
            cursor.execute(
                "SELECT status, description, created_at as time FROM order_timeline WHERE order_id = %s ORDER BY created_at",
                (order['id'],)
            )
            timeline = [serialize_record(t) for t in cursor.fetchall()]
            order_dict['timeline'] = timeline
            
            # Map fields to match frontend expectations
            order_dict['clientId'] = str(order['client_id']) if order['client_id'] else None
            order_dict['driverId'] = str(order['driver_id']) if order['driver_id'] else None
            order_dict['clientName'] = order['client_name']
            order_dict['driverName'] = order['driver_name']
            order_dict['driverPhone'] = order['driver_phone']
            order_dict['vehicleType'] = order['driver_vehicle_type']
            order_dict['vehiclePlate'] = order['driver_vehicle_plate']
            order_dict['pickupAddress'] = order['pickup_address']
            order_dict['deliveryAddress'] = order['delivery_address']
            order_dict['packageWeight'] = float(order['package_weight']) if order['package_weight'] else 0
            order_dict['packageType'] = order['package_type']
            order_dict['estimatedDelivery'] = order_dict.get('estimated_delivery')
            order_dict['deliveredAt'] = order_dict.get('delivered_at')
            order_dict['createdAt'] = order_dict.get('created_at')
            order_dict['failureReason'] = order['failure_reason']
            order_dict['failureNotes'] = order['failure_notes']
            
            result.append(order_dict)
        
        conn.close()
        return jsonify({'data': result}), 200
        
    except Exception as e:
        logger.error("Failed to fetch orders", error=str(e))
        return jsonify({'error': 'Failed to fetch orders'}), 500

@app.route('/orders/<order_id>', methods=['GET'])
def get_order(order_id):
    """Get single order by ID."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT o.*, 
                   u.name as client_name,
                   d_user.name as driver_name,
                   d_user.phone as driver_phone,
                   d.vehicle_type as driver_vehicle_type,
                   d.vehicle_plate as driver_vehicle_plate
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN drivers d ON o.driver_id = d.id
            LEFT JOIN users d_user ON d.user_id = d_user.id
            WHERE o.id = %s
        """, (order_id,))
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        order_dict = serialize_record(order)
        
        # Get timeline
        cursor.execute(
            "SELECT status, description, created_at as time FROM order_timeline WHERE order_id = %s ORDER BY created_at",
            (order_id,)
        )
        order_dict['timeline'] = [serialize_record(t) for t in cursor.fetchall()]
        
        # Map fields
        order_dict['clientId'] = str(order['client_id']) if order['client_id'] else None
        order_dict['driverId'] = str(order['driver_id']) if order['driver_id'] else None
        order_dict['clientName'] = order['client_name']
        order_dict['driverName'] = order['driver_name']
        order_dict['driverPhone'] = order['driver_phone']
        order_dict['vehicleType'] = order['driver_vehicle_type']
        order_dict['vehiclePlate'] = order['driver_vehicle_plate']
        order_dict['pickupAddress'] = order['pickup_address']
        order_dict['deliveryAddress'] = order['delivery_address']
        order_dict['packageWeight'] = float(order['package_weight']) if order['package_weight'] else 0
        order_dict['packageType'] = order['package_type']
        order_dict['estimatedDelivery'] = order_dict.get('estimated_delivery')
        order_dict['deliveredAt'] = order_dict.get('delivered_at')
        order_dict['createdAt'] = order_dict.get('created_at')
        
        conn.close()
        return jsonify({'data': order_dict}), 200
        
    except Exception as e:
        logger.error("Failed to fetch order", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to fetch order'}), 500

@app.route('/orders', methods=['POST'])
def create_order():
    """
    =========================================================================
    CREATE ORDER - SAGA TRANSACTION ENTRY POINT
    =========================================================================
    This endpoint initiates a distributed transaction using the Saga pattern:
    
    Saga Steps:
    1. Validate client (CMS Service - SOAP)
    2. Create order record
    3. Reserve warehouse slot (WMS Service - RabbitMQ)
    4. Calculate route optimization (ROS Service - REST)
    5. Send notifications
    
    Compensation (on failure):
    - Release warehouse slot
    - Cancel order
    - Notify client of failure
    =========================================================================
    """
    try:
        data = request.get_json()
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Generate order ID
        cursor.execute("SELECT generate_order_id()")
        order_id = cursor.fetchone()['generate_order_id']
        
        # Get client ID
        user_id = data.get('user_id')
        client_id = data.get('clientId')
        
        if user_id and not client_id:
            cursor.execute("SELECT id FROM clients WHERE user_id = %s", (user_id,))
            client = cursor.fetchone()
            if client:
                client_id = str(client['id'])
        
        if not client_id:
            # Use default client for demo
            client_id = 1
        
        # Calculate estimated delivery based on priority
        priority = data.get('priority', 'normal')
        if priority == 'same_day':
            estimated_delivery = datetime.utcnow() + timedelta(hours=8)
        elif priority == 'express':
            estimated_delivery = datetime.utcnow() + timedelta(days=2)
        else:
            estimated_delivery = datetime.utcnow() + timedelta(days=5)
        
        # Create order in database
        cursor.execute("""
            INSERT INTO orders (id, client_id, pickup_address, delivery_address, 
                              package_weight, package_type, priority, status, 
                              estimated_delivery, special_instructions)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
            RETURNING *
        """, (
            order_id,
            client_id,
            data.get('pickupAddress', ''),
            data.get('deliveryAddress', ''),
            data.get('packageWeight', 0),
            data.get('packageType', 'small_box'),
            priority,
            estimated_delivery,
            data.get('specialInstructions', '')
        ))
        
        order = cursor.fetchone()
        
        # Create initial timeline entry
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, 'created', 'Order placed')",
            (order_id,)
        )
        
        conn.commit()
        
        # Get client name and user_id
        cursor.execute("""
            SELECT u.id as user_id, u.name FROM clients c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.id = %s
        """, (client_id,))
        client = cursor.fetchone()
        client_name = client['name'] if client else 'Unknown'
        client_user_id = str(client['user_id']) if client else None
        
        conn.close()
        
        # =====================================================================
        # INITIATE SAGA FOR ORDER CREATION
        # =====================================================================
        saga_id = initiate_saga('order.create', {
            'order_id': order_id,
            'client_id': client_id,
            'pickup_address': data.get('pickupAddress', ''),
            'delivery_address': data.get('deliveryAddress', ''),
            'package_type': data.get('packageType', 'small_box'),
            'priority': priority
        })
        
        # =====================================================================
        # PUBLISH ORDER CREATED EVENT (ASYNCHRONOUS)
        # =====================================================================
        publish_message('swifttrack.orders', 'order.created', {
            'order_id': order_id,
            'client_id': client_id,
            'status': 'pending',
            'priority': priority,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        # =====================================================================
        # SEND TO WAREHOUSE (WMS) VIA RABBITMQ
        # =====================================================================
        publish_message('swifttrack.warehouse', 'warehouse.receive', {
            'order_id': order_id,
            'package_type': data.get('packageType', 'small_box'),
            'priority': priority,
            'action': 'receive',
            'timestamp': datetime.utcnow().isoformat()
        }, headers={'x-priority': 10 if priority == 'same_day' else 5})
        
        # =====================================================================
        # SEND NOTIFICATION
        # =====================================================================
        publish_message('swifttrack.notifications', 'realtime.new_order', {
            'type': 'order_created',
            'order_id': order_id,
            'client_id': client_id,
            'client_user_id': client_user_id,
            'message': f'Order {order_id} has been created successfully'
        })
        
        # Prepare response
        order_response = serialize_record(order)
        order_response['id'] = order_id
        order_response['clientId'] = str(client_id)
        order_response['clientName'] = client_name
        order_response['pickupAddress'] = order['pickup_address']
        order_response['deliveryAddress'] = order['delivery_address']
        order_response['packageWeight'] = float(order['package_weight']) if order['package_weight'] else 0
        order_response['packageType'] = order['package_type']
        order_response['estimatedDelivery'] = order_response.get('estimated_delivery')
        order_response['createdAt'] = order_response.get('created_at')
        order_response['timeline'] = [
            {'status': 'created', 'time': datetime.utcnow().isoformat(), 'description': 'Order placed'}
        ]
        order_response['saga_id'] = saga_id
        
        logger.info("Order created successfully", order_id=order_id, saga_id=saga_id)
        
        return jsonify({'data': order_response}), 201
        
    except Exception as e:
        logger.error("Failed to create order", error=str(e))
        return jsonify({'error': 'Failed to create order'}), 500

@app.route('/orders/<order_id>', methods=['PUT'])
def update_order(order_id):
    """Update an existing order."""
    try:
        data = request.get_json()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Build update query dynamically
        update_fields = []
        params = []
        
        field_mapping = {
            'status': 'status',
            'driverId': 'driver_id',
            'pickupAddress': 'pickup_address',
            'deliveryAddress': 'delivery_address',
            'packageWeight': 'package_weight',
            'packageType': 'package_type',
            'priority': 'priority',
            'specialInstructions': 'special_instructions'
        }
        
        for frontend_key, db_key in field_mapping.items():
            if frontend_key in data:
                update_fields.append(f"{db_key} = %s")
                params.append(data[frontend_key])
        
        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400
        
        params.append(order_id)
        
        cursor.execute(f"""
            UPDATE orders SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
        """, params)
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        # Add timeline entry if status changed
        if 'status' in data:
            cursor.execute(
                "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, %s, %s)",
                (order_id, data['status'], f"Status changed to {data['status']}")
            )
        
        # Fetch client user_id for realtime notification
        client_user_id = None
        if order.get('client_id'):
            cursor.execute("SELECT user_id FROM clients WHERE id = %s", (order['client_id'],))
            client_record = cursor.fetchone()
            client_user_id = str(client_record['user_id']) if client_record else None
        
        conn.commit()
        conn.close()
        
        # Publish realtime status update when status changes
        if 'status' in data:
            publish_message('swifttrack.notifications', 'realtime.update', {
                'type': 'order_status_update',
                'order_id': order_id,
                'status': data['status'],
                'data': {
                    'client_user_id': client_user_id,
                    'driver_id': str(order['driver_id']) if order.get('driver_id') else None,
                    'timestamp': datetime.utcnow().isoformat()
                }
            })
        
        order_response = serialize_record(order)
        order_response['pickupAddress'] = order['pickup_address']
        order_response['deliveryAddress'] = order['delivery_address']
        
        return jsonify({'data': order_response}), 200
        
    except Exception as e:
        logger.error("Failed to update order", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to update order'}), 500

@app.route('/orders/<order_id>/cancel', methods=['POST'])
def cancel_order(order_id):
    """Cancel an order - triggers compensation."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
        """, (order_id,))
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, 'cancelled', 'Order cancelled')",
            (order_id,)
        )
        
        # Fetch client user_id for realtime notification
        cursor.execute("SELECT user_id FROM clients WHERE id = %s", (order['client_id'],))
        client_record = cursor.fetchone()
        client_user_id = str(client_record['user_id']) if client_record else None
        
        conn.commit()
        conn.close()
        
        # =====================================================================
        # TRIGGER COMPENSATION SAGA
        # =====================================================================
        initiate_saga('order.compensate', {
            'order_id': order_id,
            'action': 'cancel',
            'reason': 'User cancelled'
        })
        
        # Notify warehouse to release slot
        publish_message('swifttrack.warehouse', 'warehouse.inventory', {
            'order_id': order_id,
            'action': 'release',
            'timestamp': datetime.utcnow().isoformat()
        })
        
        # Realtime update — broadcast to WebSocket clients via realtime.# binding
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'order_status_update',
            'order_id': order_id,
            'status': 'cancelled',
            'data': {
                'client_user_id': client_user_id,
                'driver_id': str(order['driver_id']) if order.get('driver_id') else None
            }
        })
        
        # User notification
        publish_message('swifttrack.notifications', 'realtime.notification', {
            'type': 'notification',
            'user_id': client_user_id,
            'title': 'Order Cancelled',
            'message': f'Your order {order_id} has been cancelled',
            'notification_type': 'info'
        })
        
        return jsonify({'data': serialize_record(order)}), 200
        
    except Exception as e:
        logger.error("Failed to cancel order", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to cancel order'}), 500

@app.route('/orders/<order_id>/status', methods=['PUT'])
def update_order_status(order_id):
    """
    =========================================================================
    UPDATE ORDER STATUS
    =========================================================================
    Dedicated endpoint for status-only updates.
    Called by admin dashboard and driver actions.
    Publishes realtime update to all relevant WebSocket rooms.
    =========================================================================
    """
    try:
        data = request.get_json() or {}
        new_status = data.get('status')
        
        if not new_status:
            return jsonify({'error': 'Status is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE orders SET status = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
        """, (new_status, order_id))
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, %s, %s)",
            (order_id, new_status, f"Status updated to {new_status}")
        )
        
        # Fetch client user_id for realtime notification
        client_user_id = None
        if order.get('client_id'):
            cursor.execute("SELECT user_id FROM clients WHERE id = %s", (order['client_id'],))
            client_record = cursor.fetchone()
            client_user_id = str(client_record['user_id']) if client_record else None
        
        conn.commit()
        conn.close()
        
        # Publish realtime update — broadcast to WebSocket clients via realtime.# binding
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'order_status_update',
            'order_id': order_id,
            'status': new_status,
            'data': {
                'client_user_id': client_user_id,
                'driver_id': str(order['driver_id']) if order.get('driver_id') else None,
                'timestamp': datetime.utcnow().isoformat()
            }
        })
        
        logger.info("Order status updated", order_id=order_id, status=new_status)
        return jsonify({'data': serialize_record(order)}), 200
        
    except Exception as e:
        logger.error("Failed to update order status", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to update order status'}), 500

@app.route('/orders/<order_id>/delivered', methods=['POST'])
def mark_delivered(order_id):
    """Mark order as delivered."""
    try:
        data = request.get_json() or {}
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE orders 
            SET status = 'delivered', 
                delivered_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
        """, (order_id,))
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, 'delivered', 'Delivered successfully')",
            (order_id,)
        )
        
        # Update driver stats
        if order['driver_id']:
            cursor.execute("""
                UPDATE drivers 
                SET total_deliveries = total_deliveries + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (order['driver_id'],))
        
        # Get client user_id for real-time WebSocket notification
        cursor.execute("SELECT user_id FROM clients WHERE id = %s", (order['client_id'],))
        client_record = cursor.fetchone()
        client_user_id = str(client_record['user_id']) if client_record else None
        
        conn.commit()
        conn.close()
        
        delivered_at = datetime.utcnow().isoformat()
        
        # Publish order status update — consumed by websocket-service via realtime.# binding
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'order_status_update',
            'order_id': order_id,
            'status': 'delivered',
            'data': {
                'client_user_id': client_user_id,
                'driver_id': str(order['driver_id']) if order['driver_id'] else None,
                'delivered_at': delivered_at
            }
        })
        
        # Publish delivery_completed event for Tracking page
        publish_message('swifttrack.notifications', 'realtime.delivery', {
            'type': 'delivery_completed',
            'order_id': order_id,
            'delivered_at': delivered_at,
            'client_user_id': client_user_id,
            'driver_id': str(order['driver_id']) if order['driver_id'] else None
        })
        
        # User notification
        publish_message('swifttrack.notifications', 'realtime.notification', {
            'type': 'notification',
            'user_id': client_user_id,
            'title': 'Package Delivered!',
            'message': f'Your order {order_id} has been delivered successfully',
            'notification_type': 'success'
        })
        
        order_response = serialize_record(order)
        order_response['deliveredAt'] = datetime.utcnow().isoformat()
        
        return jsonify({'data': order_response}), 200
        
    except Exception as e:
        logger.error("Failed to mark order delivered", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to mark order delivered'}), 500

@app.route('/orders/<order_id>/failed', methods=['POST'])
def mark_failed(order_id):
    """Mark order as failed."""
    try:
        data = request.get_json() or {}
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE orders 
            SET status = 'failed', 
                failure_reason = %s,
                failure_notes = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
        """, (data.get('reason', ''), data.get('notes', ''), order_id))
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, 'failed', %s)",
            (order_id, f"Delivery failed - {data.get('reason', 'Unknown reason')}")
        )
        
        # Get client user_id for real-time WebSocket notification
        cursor.execute("SELECT user_id FROM clients WHERE id = %s", (order['client_id'],))
        client_record = cursor.fetchone()
        client_user_id = str(client_record['user_id']) if client_record else None
        
        conn.commit()
        conn.close()
        
        # Publish order status update — consumed by websocket-service via realtime.# binding
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'order_status_update',
            'order_id': order_id,
            'status': 'failed',
            'data': {
                'client_user_id': client_user_id,
                'driver_id': str(order['driver_id']) if order['driver_id'] else None,
                'failure_reason': data.get('reason', ''),
                'timestamp': datetime.utcnow().isoformat()
            }
        })
        
        # User notification
        publish_message('swifttrack.notifications', 'realtime.notification', {
            'type': 'notification',
            'user_id': client_user_id,
            'title': 'Delivery Attempt Failed',
            'message': f'Your order {order_id} delivery failed: {data.get("reason", "Unknown reason")}',
            'notification_type': 'error'
        })
        
        order_response = serialize_record(order)
        order_response['failureReason'] = data.get('reason', '')
        order_response['failureNotes'] = data.get('notes', '')
        
        return jsonify({'data': order_response}), 200
        
    except Exception as e:
        logger.error("Failed to mark order as failed", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to mark order as failed'}), 500

@app.route('/orders/<order_id>/start_delivery', methods=['POST'])
def start_delivery(order_id):
    """
    =========================================================================
    START DELIVERY
    =========================================================================
    Called by the driver when they click "Start Delivery" on the Route page.
    Does NOT change the order status (already out_for_delivery) but writes a
    dated timeline entry and broadcasts a timeline_update via WebSocket so
    client and admin tracking pages can reflect the exact moment the driver
    started heading to the customer.
    =========================================================================
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id, client_id, driver_id, status FROM orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()

        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404

        # Write timeline entry
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, 'started_delivery', 'Driver has started the delivery')",
            (order_id,)
        )

        # Resolve client user_id
        client_user_id = None
        if order.get('client_id'):
            cursor.execute("SELECT user_id FROM clients WHERE id = %s", (order['client_id'],))
            client_record = cursor.fetchone()
            client_user_id = str(client_record['user_id']) if client_record else None

        conn.commit()
        conn.close()

        now_iso = datetime.utcnow().isoformat()

        # Broadcast timeline update so tracking pages update in real-time
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'timeline_update',
            'order_id': order_id,
            'entry': {
                'status': 'started_delivery',
                'description': 'Driver has started the delivery',
                'time': now_iso
            },
            'data': {
                'client_user_id': client_user_id,
                'driver_id': str(order['driver_id']) if order['driver_id'] else None
            }
        })

        logger.info("Driver started delivery", order_id=order_id)
        return jsonify({'message': 'Delivery started', 'time': now_iso}), 200

    except Exception as e:
        logger.error("Failed to record delivery start", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to record delivery start'}), 500


@app.route('/orders/<order_id>/assign', methods=['POST'])
def assign_driver_to_order(order_id):
    """
    =========================================================================
    ASSIGN DRIVER TO ORDER
    =========================================================================
    Assigns a driver to an order and sets status to out_for_delivery.
    Notifies the driver via WebSocket and publishes realtime update.
    =========================================================================
    """
    try:
        data = request.get_json() or {}
        driver_id = data.get('driverId')
        
        if not driver_id:
            return jsonify({'error': 'driverId is required'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Resolve driver record
        cursor.execute("""
            SELECT d.id, u.name, u.phone, d.vehicle_type, d.vehicle_plate
            FROM drivers d JOIN users u ON d.user_id = u.id
            WHERE d.id::text = %s OR d.user_id::text = %s
        """, (driver_id, driver_id))
        driver = cursor.fetchone()
        
        if not driver:
            conn.close()
            return jsonify({'error': 'Driver not found'}), 404
        
        cursor.execute("""
            UPDATE orders
            SET driver_id = %s,
                status = 'out_for_delivery',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING *
        """, (driver['id'], order_id))
        
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            return jsonify({'error': 'Order not found'}), 404
        
        cursor.execute(
            "INSERT INTO order_timeline (order_id, status, description) VALUES (%s, 'out_for_delivery', %s)",
            (order_id, f"Driver {driver['name']} assigned")
        )
        
        # Get client user_id
        client_user_id = None
        if order.get('client_id'):
            cursor.execute("SELECT user_id FROM clients WHERE id = %s", (order['client_id'],))
            client_record = cursor.fetchone()
            client_user_id = str(client_record['user_id']) if client_record else None
        
        # Mark driver as busy
        cursor.execute("""
            UPDATE drivers SET status = 'busy', updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (driver['id'],))
        
        conn.commit()
        conn.close()
        
        # Notify driver of new assignment
        publish_message('swifttrack.notifications', 'realtime.assigned', {
            'type': 'driver_assigned',
            'order_id': order_id,
            'driver_id': str(driver['id']),
            'pickup_address': order.get('pickup_address', ''),
            'delivery_address': order.get('delivery_address', ''),
            'driver_name': driver['name'],
            'driver_phone': driver['phone'],
            'vehicle_type': driver.get('vehicle_type', ''),
            'vehicle_plate': driver.get('vehicle_plate', '')
        })
        
        # Realtime status update to client and admins
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'order_status_update',
            'order_id': order_id,
            'status': 'out_for_delivery',
            'data': {
                'client_user_id': client_user_id,
                'driver_id': str(driver['id']),
                'driver_name': driver['name']
            }
        })
        
        order_response = serialize_record(order)
        order_response['driverName'] = driver['name']
        order_response['driverId'] = str(driver['id'])
        
        logger.info("Driver assigned to order", order_id=order_id, driver_id=str(driver['id']))
        return jsonify({'data': order_response}), 200
        
    except Exception as e:
        logger.error("Failed to assign driver", error=str(e), order_id=order_id)
        return jsonify({'error': 'Failed to assign driver'}), 500

# =============================================================================
# DRIVER ENDPOINTS
# =============================================================================

@app.route('/drivers', methods=['GET'])
def get_drivers():
    """Get all drivers."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT d.*, u.name, u.email, u.phone, u.avatar
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            ORDER BY d.total_deliveries DESC
        """)
        
        drivers = cursor.fetchall()
        conn.close()
        
        result = []
        for driver in drivers:
            driver_dict = {
                'id': str(driver['user_id']),  # Return user_id as id for frontend compatibility
                'driver_id': str(driver['id']),
                'name': driver['name'],
                'email': driver['email'],
                'phone': driver['phone'],
                'avatar': driver['avatar'] or driver['name'][:2].upper(),
                'status': driver['status'],
                'vehicleType': driver['vehicle_type'],
                'vehiclePlate': driver['vehicle_plate'],
                'rating': float(driver['rating']) if driver['rating'] else 0,
                'totalDeliveries': driver['total_deliveries'],
                'successRate': float(driver['success_rate']) if driver['success_rate'] else 100,
                'joinedDate': driver['created_at'].isoformat() if driver['created_at'] else None,
                'currentLocation': {
                    'lat': float(driver['current_lat']) if driver['current_lat'] else None,
                    'lng': float(driver['current_lng']) if driver['current_lng'] else None
                } if driver['current_lat'] else None
            }
            result.append(driver_dict)
        
        return jsonify({'data': result}), 200
        
    except Exception as e:
        logger.error("Failed to fetch drivers", error=str(e))
        return jsonify({'error': 'Failed to fetch drivers'}), 500

@app.route('/drivers/<driver_id>/route', methods=['GET'])
def get_driver_route(driver_id):
    """Get driver's route - calls ROS service."""
    try:
        # Call ROS (Route Optimization Service) via REST
        try:
            response = requests.get(f"{ROS_SERVICE_URL}/route/{driver_id}", timeout=5)
            if response.status_code == 200:
                return jsonify(response.json()), 200
        except:
            pass
        
        # Fallback to database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get orders assigned to driver (include confirmed, in_warehouse, out_for_delivery)
        cursor.execute("""
            SELECT o.*, u.name as customer_name
            FROM orders o
            LEFT JOIN clients c ON o.client_id = c.id
            LEFT JOIN users u ON c.user_id = u.id
            WHERE o.driver_id = (SELECT id FROM drivers WHERE user_id::text = %s OR id::text = %s)
            AND o.status IN ('confirmed', 'in_warehouse', 'out_for_delivery', 'picked_up')
            ORDER BY o.priority DESC, o.created_at ASC
        """, (driver_id, driver_id))
        
        orders = cursor.fetchall()
        conn.close()
        
        route_data = []
        for idx, order in enumerate(orders, 1):
            route_data.append({
                'sequence': idx,
                'orderId': order['id'],
                'address': order['delivery_address'],
                'customerName': order['customer_name'] or 'Unknown',
                'packageType': order['package_type'],
                'priority': order['priority'],
                'estimatedTime': f"{9 + idx}:00 AM",
                'status': 'pending',
                'notes': order['special_instructions'] or ''
            })
        
        return jsonify({'data': route_data}), 200
        
    except Exception as e:
        logger.error("Failed to fetch driver route", error=str(e), driver_id=driver_id)
        return jsonify({'error': 'Failed to fetch driver route'}), 500

@app.route('/drivers/<driver_id>/stats', methods=['GET'])
def get_driver_stats(driver_id):
    """Get driver statistics."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get driver info
        cursor.execute("""
            SELECT d.* FROM drivers d
            WHERE d.user_id::text = %s OR d.id::text = %s
        """, (driver_id, driver_id))
        
        driver = cursor.fetchone()
        
        if not driver:
            conn.close()
            # Return mock stats for demo
            return jsonify({'data': {
                'todayDeliveries': 8,
                'completed': 5,
                'pending': 3,
                'totalDistance': '47 km',
                'avgDeliveryTime': '23 min',
                'weeklyPerformance': [
                    {'name': 'Mon', 'deliveries': 12, 'onTime': 11},
                    {'name': 'Tue', 'deliveries': 15, 'onTime': 14},
                    {'name': 'Wed', 'deliveries': 10, 'onTime': 10},
                    {'name': 'Thu', 'deliveries': 14, 'onTime': 13},
                    {'name': 'Fri', 'deliveries': 16, 'onTime': 15},
                    {'name': 'Sat', 'deliveries': 8, 'onTime': 8},
                    {'name': 'Sun', 'deliveries': 0, 'onTime': 0}
                ],
                'ratings': {
                    'overall': 4.8,
                    'reliability': 4.9,
                    'communication': 4.7,
                    'packaging': 4.8
                }
            }}), 200
        
        # Get today's deliveries count
        cursor.execute("""
            SELECT 
                COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as today_total,
                COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND status = 'delivered') as today_completed,
                COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND status IN ('pending', 'in_warehouse', 'out_for_delivery')) as today_pending
            FROM orders
            WHERE driver_id = %s
        """, (driver['id'],))
        
        today_stats = cursor.fetchone()
        conn.close()
        
        stats = {
            'todayDeliveries': today_stats['today_total'] or 8,
            'completed': today_stats['today_completed'] or 5,
            'pending': today_stats['today_pending'] or 3,
            'totalDistance': '47 km',
            'avgDeliveryTime': '23 min',
            'weeklyPerformance': [
                {'name': 'Mon', 'deliveries': 12, 'onTime': 11},
                {'name': 'Tue', 'deliveries': 15, 'onTime': 14},
                {'name': 'Wed', 'deliveries': 10, 'onTime': 10},
                {'name': 'Thu', 'deliveries': 14, 'onTime': 13},
                {'name': 'Fri', 'deliveries': 16, 'onTime': 15},
                {'name': 'Sat', 'deliveries': 8, 'onTime': 8},
                {'name': 'Sun', 'deliveries': 0, 'onTime': 0}
            ],
            'ratings': {
                'overall': float(driver['rating']) if driver['rating'] else 4.8,
                'reliability': 4.9,
                'communication': 4.7,
                'packaging': 4.8
            }
        }
        
        return jsonify({'data': stats}), 200
        
    except Exception as e:
        logger.error("Failed to fetch driver stats", error=str(e), driver_id=driver_id)
        return jsonify({'error': 'Failed to fetch driver stats'}), 500

@app.route('/drivers/<driver_id>/location', methods=['PUT'])
def update_driver_location(driver_id):
    """Update driver location."""
    try:
        data = request.get_json()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE drivers 
            SET current_lat = %s, current_lng = %s, updated_at = CURRENT_TIMESTAMP
            WHERE user_id::text = %s OR id::text = %s
            RETURNING *
        """, (data.get('lat'), data.get('lng'), driver_id, driver_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error("Failed to update driver location", error=str(e))
        return jsonify({'error': 'Failed to update location'}), 500

@app.route('/drivers/<driver_id>/status', methods=['PUT'])
def update_driver_status(driver_id):
    """Update driver status."""
    try:
        data = request.get_json()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE drivers 
            SET status = %s, updated_at = CURRENT_TIMESTAMP
            WHERE user_id::text = %s OR id::text = %s
            RETURNING *
        """, (data.get('status'), driver_id, driver_id))
        
        driver = cursor.fetchone()
        conn.commit()
        conn.close()
        
        if not driver:
            return jsonify({'error': 'Driver not found'}), 404
        
        return jsonify({'data': serialize_record(driver)}), 200
        
    except Exception as e:
        logger.error("Failed to update driver status", error=str(e))
        return jsonify({'error': 'Failed to update status'}), 500

# =============================================================================
# CLIENT ENDPOINTS
# =============================================================================

@app.route('/clients', methods=['GET'])
def get_clients():
    """Get all clients."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.*, u.name, u.email, u.phone, u.avatar
            FROM clients c
            JOIN users u ON c.user_id = u.id
            ORDER BY c.total_orders DESC
        """)
        
        clients = cursor.fetchall()
        conn.close()
        
        result = []
        for client in clients:
            client_dict = {
                'id': str(client['user_id']),
                'client_id': str(client['id']),
                'name': client['name'],
                'email': client['email'],
                'phone': client['phone'],
                'avatar': client['avatar'] or client['name'][:2].upper(),
                'status': client['status'],
                'company': client['company'],
                'totalOrders': client['total_orders'],
                'joinedDate': client['created_at'].isoformat() if client['created_at'] else None,
                'address': client['address']
            }
            result.append(client_dict)
        
        return jsonify({'data': result}), 200
        
    except Exception as e:
        logger.error("Failed to fetch clients", error=str(e))
        return jsonify({'error': 'Failed to fetch clients'}), 500

@app.route('/clients/<client_id>', methods=['GET'])
def get_client(client_id):
    """Get client by ID."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.*, u.name, u.email, u.phone, u.avatar
            FROM clients c
            JOIN users u ON c.user_id = u.id
            WHERE c.user_id::text = %s OR c.id::text = %s
        """, (client_id, client_id))
        
        client = cursor.fetchone()
        conn.close()
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        client_dict = {
            'id': str(client['user_id']),
            'client_id': str(client['id']),
            'name': client['name'],
            'email': client['email'],
            'phone': client['phone'],
            'avatar': client['avatar'] or client['name'][:2].upper(),
            'status': client['status'],
            'company': client['company'],
            'totalOrders': client['total_orders'],
            'joinedDate': client['created_at'].isoformat() if client['created_at'] else None,
            'address': client['address']
        }
        
        return jsonify({'data': client_dict}), 200
        
    except Exception as e:
        logger.error("Failed to fetch client", error=str(e), client_id=client_id)
        return jsonify({'error': 'Failed to fetch client'}), 500

@app.route('/clients/<client_id>/stats', methods=['GET'])
def get_client_stats(client_id):
    """Get client statistics."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get order counts by status
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status IN ('out_for_delivery', 'in_warehouse')) as in_transit,
                COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
            FROM orders
            WHERE client_id = (SELECT id FROM clients WHERE user_id::text = %s OR id::text = %s)
        """, (client_id, client_id))
        
        counts = cursor.fetchone()
        conn.close()
        
        stats = {
            'totalOrders': counts['total'] or 45,
            'inTransit': counts['in_transit'] or 2,
            'delivered': counts['delivered'] or 40,
            'failed': counts['failed'] or 3,
            'weeklyData': [
                {'name': 'Mon', 'orders': 5, 'delivered': 4},
                {'name': 'Tue', 'orders': 8, 'delivered': 7},
                {'name': 'Wed', 'orders': 12, 'delivered': 11},
                {'name': 'Thu', 'orders': 6, 'delivered': 6},
                {'name': 'Fri', 'orders': 9, 'delivered': 8},
                {'name': 'Sat', 'orders': 3, 'delivered': 3},
                {'name': 'Sun', 'orders': 2, 'delivered': 1}
            ],
            'monthlyData': [
                {'name': 'Week 1', 'orders': 23, 'delivered': 21},
                {'name': 'Week 2', 'orders': 31, 'delivered': 28},
                {'name': 'Week 3', 'orders': 28, 'delivered': 27},
                {'name': 'Week 4', 'orders': 35, 'delivered': 33}
            ]
        }
        
        return jsonify({'data': stats}), 200
        
    except Exception as e:
        logger.error("Failed to fetch client stats", error=str(e), client_id=client_id)
        return jsonify({'error': 'Failed to fetch client stats'}), 500

@app.route('/clients/<client_id>/status', methods=['PUT'])
def update_client_status(client_id):
    """Update client status."""
    try:
        data = request.get_json()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE clients 
            SET status = %s, updated_at = CURRENT_TIMESTAMP
            WHERE user_id::text = %s OR id::text = %s
            RETURNING *
        """, (data.get('status'), client_id, client_id))
        
        client = cursor.fetchone()
        conn.commit()
        conn.close()
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        return jsonify({'data': serialize_record(client)}), 200
        
    except Exception as e:
        logger.error("Failed to update client status", error=str(e))
        return jsonify({'error': 'Failed to update status'}), 500

@app.route('/clients/<client_id>/billing', methods=['GET'])
def get_client_billing(client_id):
    """Get client billing history."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM billing_history
            WHERE client_id = (SELECT id FROM clients WHERE user_id::text = %s OR id::text = %s)
            ORDER BY billing_date DESC
        """, (client_id, client_id))
        
        billing = cursor.fetchall()
        conn.close()
        
        result = []
        for bill in billing:
            result.append({
                'id': bill['id'],
                'date': bill['billing_date'].isoformat() if bill['billing_date'] else None,
                'amount': float(bill['amount']),
                'status': bill['status'],
                'orders': bill['orders_count']
            })
        
        # Add mock data if empty
        if not result:
            result = [
                {'id': 'INV-001', 'date': '2026-02-15', 'amount': 125.50, 'status': 'paid', 'orders': 5},
                {'id': 'INV-002', 'date': '2026-02-01', 'amount': 287.00, 'status': 'paid', 'orders': 12},
                {'id': 'INV-003', 'date': '2026-01-15', 'amount': 156.75, 'status': 'paid', 'orders': 7},
                {'id': 'INV-004', 'date': '2026-01-01', 'amount': 342.25, 'status': 'paid', 'orders': 15}
            ]
        
        return jsonify({'data': result}), 200
        
    except Exception as e:
        logger.error("Failed to fetch billing history", error=str(e), client_id=client_id)
        return jsonify({'error': 'Failed to fetch billing history'}), 500

# =============================================================================
# ADMIN ENDPOINTS
# =============================================================================

@app.route('/admin/stats', methods=['GET'])
def get_admin_stats():
    """Get admin dashboard statistics."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get counts
        cursor.execute("SELECT COUNT(*) as count FROM clients WHERE status = 'active'")
        total_clients = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM drivers WHERE status = 'active'")
        active_drivers = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = CURRENT_DATE")
        orders_today = cursor.fetchone()['count']
        
        # Get orders by status
        cursor.execute("""
            SELECT status, COUNT(*) as count FROM orders
            GROUP BY status
        """)
        status_counts = {row['status']: row['count'] for row in cursor.fetchall()}
        
        conn.close()
        
        stats = {
            'totalClients': total_clients or 156,
            'activeDrivers': active_drivers or 23,
            'totalOrdersToday': orders_today or 287,
            'systemHealth': 'healthy',
            'revenue': 45678,
            'growth': 12.5,
            'ordersByStatus': [
                {'name': 'Pending', 'value': status_counts.get('pending', 34), 'color': '#f59e0b'},
                {'name': 'In Warehouse', 'value': status_counts.get('in_warehouse', 56), 'color': '#3b82f6'},
                {'name': 'Out for Delivery', 'value': status_counts.get('out_for_delivery', 89), 'color': '#8b5cf6'},
                {'name': 'Delivered', 'value': status_counts.get('delivered', 98), 'color': '#10b981'},
                {'name': 'Failed', 'value': status_counts.get('failed', 10), 'color': '#ef4444'}
            ],
            'hourlyOrders': [
                {'hour': '6AM', 'orders': 12},
                {'hour': '8AM', 'orders': 34},
                {'hour': '10AM', 'orders': 56},
                {'hour': '12PM', 'orders': 78},
                {'hour': '2PM', 'orders': 65},
                {'hour': '4PM', 'orders': 54},
                {'hour': '6PM', 'orders': 43},
                {'hour': '8PM', 'orders': 21}
            ],
            'regionData': [
                {'region': 'Manhattan', 'orders': 120, 'percentage': 42},
                {'region': 'Brooklyn', 'orders': 85, 'percentage': 30},
                {'region': 'Queens', 'orders': 45, 'percentage': 16},
                {'region': 'Bronx', 'orders': 25, 'percentage': 9},
                {'region': 'Staten Island', 'orders': 12, 'percentage': 4}
            ]
        }
        
        return jsonify({'data': stats}), 200
        
    except Exception as e:
        logger.error("Failed to fetch admin stats", error=str(e))
        return jsonify({'error': 'Failed to fetch admin stats'}), 500

@app.route('/admin/logs', methods=['GET'])
def get_admin_logs():
    """Get system logs."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM system_logs WHERE 1=1"
        params = []
        
        log_type = request.args.get('type')
        if log_type:
            query += " AND type = %s"
            params.append(log_type)
        
        source = request.args.get('source')
        if source:
            query += " AND source = %s"
            params.append(source)
        
        query += " ORDER BY created_at DESC LIMIT 100"
        
        cursor.execute(query, params)
        logs = cursor.fetchall()
        conn.close()
        
        result = []
        for log in logs:
            result.append({
                'id': str(log['id']),
                'type': log['type'],
                'message': log['message'],
                'source': log['source'],
                'timestamp': log['created_at'].isoformat() if log['created_at'] else None
            })
        
        return jsonify({'data': result}), 200
        
    except Exception as e:
        logger.error("Failed to fetch system logs", error=str(e))
        return jsonify({'error': 'Failed to fetch logs'}), 500

@app.route('/admin/analytics', methods=['GET'])
def get_admin_analytics():
    """Get analytics data."""
    # Reuse admin stats for analytics
    return get_admin_stats()

# =============================================================================
# STARTUP
# =============================================================================

if __name__ == '__main__':
    logger.info("Starting Middleware Service", port=5001)
    app.run(host='0.0.0.0', port=5001, debug=False)
