# =============================================================================
# SwiftTrack Logistics - WebSocket Service
# =============================================================================
# Real-time communication service using Flask-SocketIO
# Handles: Order status updates, driver location tracking, notifications
# =============================================================================

import os
import json
import logging
import threading
from datetime import datetime

from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import pika
import psycopg2
from psycopg2.extras import RealDictCursor

# =============================================================================
# CONFIGURATION
# =============================================================================

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'swifttrack_websocket_secret_2026')
CORS(app, resources={r"/*": {"origins": "*"}})

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_timeout=60,
    ping_interval=25,
    logger=True,
    engineio_logger=True
)

# Environment variables
POSTGRES_HOST = os.environ.get('POSTGRES_HOST', 'postgres')
POSTGRES_DB = os.environ.get('POSTGRES_DB', 'swifttrack')
POSTGRES_USER = os.environ.get('POSTGRES_USER', 'swifttrack_user')
POSTGRES_PASSWORD = os.environ.get('POSTGRES_PASSWORD', 'swifttrack_secure_pass_2026')
RABBITMQ_HOST = os.environ.get('RABBITMQ_HOST', 'rabbitmq')
RABBITMQ_USER = os.environ.get('RABBITMQ_USER', 'swifttrack')
RABBITMQ_PASS = os.environ.get('RABBITMQ_PASS', 'swifttrack_mq_2026')
RABBITMQ_VHOST = os.environ.get('RABBITMQ_VHOST', 'swifttrack_vhost')
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')

# Logging setup
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "websocket", "message": "%(message)s"}'
)
logger = logging.getLogger(__name__)

# Connected clients tracking
connected_clients = {}
order_subscriptions = {}  # order_id -> set of session_ids
driver_rooms = {}  # driver_id -> session_id
admin_sessions = set()

# =============================================================================
# DATABASE CONNECTION
# =============================================================================

def get_db_connection():
    """Create database connection with retry logic."""
    max_retries = 5
    for attempt in range(max_retries):
        try:
            return psycopg2.connect(
                host=POSTGRES_HOST,
                database=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                cursor_factory=RealDictCursor
            )
        except psycopg2.OperationalError:
            if attempt < max_retries - 1:
                import time
                time.sleep(2)
            else:
                raise

# =============================================================================
# RABBITMQ CONSUMER
# =============================================================================

def rabbitmq_consumer():
    """
    Background thread that consumes messages from RabbitMQ
    and broadcasts them to connected WebSocket clients.
    """
    while True:
        try:
            credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
            parameters = pika.ConnectionParameters(
                host=RABBITMQ_HOST,
                virtual_host=RABBITMQ_VHOST,
                credentials=credentials,
                heartbeat=600
            )
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            
            # Declare queue for real-time updates
            channel.queue_declare(queue='websocket_updates', durable=True)
            channel.queue_bind(
                exchange='swifttrack.notifications',
                queue='websocket_updates',
                routing_key='realtime.#'
            )
            
            def callback(ch, method, properties, body):
                try:
                    message = json.loads(body)
                    event_type = message.get('type', 'update')
                    
                    logger.info(f"Received message: {event_type}")
                    
                    # Broadcast based on event type
                    if event_type == 'order_status_update':
                        handle_order_status_update(message)
                    elif event_type == 'driver_location_update':
                        handle_driver_location_update(message)
                    elif event_type == 'new_order':
                        handle_new_order(message)
                    elif event_type == 'driver_assigned':
                        handle_driver_assigned(message)
                    elif event_type == 'delivery_completed':
                        handle_delivery_completed(message)
                    elif event_type == 'notification':
                        handle_notification(message)
                    elif event_type == 'middleware_update':
                        handle_middleware_update(message)
                    
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
            
            channel.basic_consume(queue='websocket_updates', on_message_callback=callback)
            logger.info("WebSocket service connected to RabbitMQ, waiting for messages...")
            channel.start_consuming()
            
        except Exception as e:
            logger.error(f"RabbitMQ connection error: {e}")
            import time
            time.sleep(5)

def handle_order_status_update(message):
    """Broadcast order status update to relevant clients."""
    order_id = message.get('order_id')
    new_status = message.get('status')
    data = message.get('data', {})
    
    payload = {
        'orderId': order_id,
        'status': new_status,
        'timestamp': datetime.utcnow().isoformat(),
        **data
    }
    
    # Emit to order-specific room (clients subscribed to this order)
    socketio.emit('order_status_update', payload, room=f'order_{order_id}')
    
    # Emit to all admins
    socketio.emit('order_status_update', payload, room='admins')
    
    # Emit to assigned driver if exists
    driver_id = data.get('driver_id')
    if driver_id:
        socketio.emit('order_status_update', payload, room=f'driver_{driver_id}')
    
    # Emit to client's user room so Orders page receives update without subscribing to order room
    client_user_id = data.get('client_user_id')
    if client_user_id:
        socketio.emit('order_status_update', payload, room=f'user_{client_user_id}')
    
    logger.info(f"Order {order_id} status updated to {new_status}")

def handle_driver_location_update(message):
    """Broadcast driver location to tracking clients."""
    driver_id = message.get('driver_id')
    order_id = message.get('order_id')
    lat = message.get('lat')
    lng = message.get('lng')
    
    socketio.emit('driver_location', {
        'driverId': driver_id,
        'orderId': order_id,
        'lat': lat,
        'lng': lng,
        'timestamp': datetime.utcnow().isoformat()
    }, room=f'order_{order_id}')
    
    socketio.emit('driver_location', {
        'driverId': driver_id,
        'lat': lat,
        'lng': lng,
        'timestamp': datetime.utcnow().isoformat()
    }, room='admins')

def handle_new_order(message):
    """Notify admins about new order."""
    socketio.emit('new_order', {
        'orderId': message.get('order_id'),
        'clientName': message.get('client_name'),
        'pickupAddress': message.get('pickup_address'),
        'deliveryAddress': message.get('delivery_address'),
        'timestamp': datetime.utcnow().isoformat()
    }, room='admins')
    
    logger.info(f"New order notification sent: {message.get('order_id')}")

def handle_driver_assigned(message):
    """Notify driver about new assignment."""
    driver_id = message.get('driver_id')
    order_id = message.get('order_id')
    
    socketio.emit('new_assignment', {
        'orderId': order_id,
        'pickupAddress': message.get('pickup_address'),
        'deliveryAddress': message.get('delivery_address'),
        'customerName': message.get('customer_name'),
        'timestamp': datetime.utcnow().isoformat()
    }, room=f'driver_{driver_id}')
    
    # Also notify the client that driver is assigned
    socketio.emit('driver_assigned', {
        'orderId': order_id,
        'driverName': message.get('driver_name'),
        'driverPhone': message.get('driver_phone'),
        'vehicleType': message.get('vehicle_type'),
        'vehiclePlate': message.get('vehicle_plate'),
        'timestamp': datetime.utcnow().isoformat()
    }, room=f'order_{order_id}')
    
    logger.info(f"Driver {driver_id} assigned to order {order_id}")

def handle_delivery_completed(message):
    """Notify about delivery completion."""
    order_id = message.get('order_id')
    client_user_id = message.get('client_user_id')
    
    payload = {
        'orderId': order_id,
        'deliveredAt': message.get('delivered_at'),
        'proofUrl': message.get('proof_url'),
        'signature': message.get('signature'),
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Emit to order-specific room (Tracking page)
    socketio.emit('delivery_completed', payload, room=f'order_{order_id}')
    
    # Emit to client's user room (Orders page)
    if client_user_id:
        socketio.emit('delivery_completed', payload, room=f'user_{client_user_id}')
    
    # Emit to admins
    socketio.emit('delivery_completed', {
        'orderId': order_id,
        'deliveredAt': message.get('delivered_at'),
        'driverId': message.get('driver_id'),
        'driverName': message.get('driver_name')
    }, room='admins')

def handle_notification(message):
    """Send notification to specific user."""
    user_id = message.get('user_id')
    
    socketio.emit('notification', {
        'title': message.get('title'),
        'message': message.get('message'),
        'type': message.get('notification_type', 'info'),
        'timestamp': datetime.utcnow().isoformat()
    }, room=f'user_{user_id}')

def handle_middleware_update(message):
    """Broadcast middleware pipeline stage update (ready / loaded / dispatched)."""
    order_id = message.get('order_id')
    stage = message.get('stage')
    data = message.get('data', {})
    client_user_id = data.get('client_user_id')

    payload = {
        'orderId': order_id,
        'stage': stage,
        'label': data.get('label', stage),
        'warehouseLocation': data.get('warehouse_location'),
        'timestamp': datetime.utcnow().isoformat()
    }

    # Emit to order-specific room (Tracking page)
    socketio.emit('middleware_update', payload, room=f'order_{order_id}')
    # Emit to all admins
    socketio.emit('middleware_update', payload, room='admins')
    # Emit to client’s user room (Dashboard / Orders page)
    if client_user_id:
        socketio.emit('middleware_update', payload, room=f'user_{client_user_id}')

    logger.info(f"Middleware stage update for order {order_id}: {stage}")

# =============================================================================
# SOCKET.IO EVENT HANDLERS
# =============================================================================

@socketio.on('connect')
def handle_connect():
    """Handle new client connection."""
    session_id = request.sid
    connected_clients[session_id] = {
        'connected_at': datetime.utcnow().isoformat(),
        'rooms': []
    }
    logger.info(f"Client connected: {session_id}")
    emit('connected', {'sessionId': session_id})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection."""
    session_id = request.sid
    if session_id in connected_clients:
        del connected_clients[session_id]
    
    # Remove from admin sessions if present
    admin_sessions.discard(session_id)
    
    # Clean up order subscriptions
    for order_id, sessions in list(order_subscriptions.items()):
        sessions.discard(session_id)
        if not sessions:
            del order_subscriptions[order_id]
    
    logger.info(f"Client disconnected: {session_id}")

@socketio.on('authenticate')
def handle_authenticate(data):
    """Authenticate user and join appropriate rooms."""
    session_id = request.sid
    user_id = data.get('userId')
    role = data.get('role')
    
    if not user_id or not role:
        emit('error', {'message': 'Authentication failed'})
        return
    
    # Join user-specific room
    join_room(f'user_{user_id}')
    
    if session_id in connected_clients:
        connected_clients[session_id]['userId'] = user_id
        connected_clients[session_id]['role'] = role
        connected_clients[session_id]['rooms'].append(f'user_{user_id}')
    
    # Join role-specific rooms
    if role == 'admin':
        join_room('admins')
        admin_sessions.add(session_id)
        if session_id in connected_clients:
            connected_clients[session_id]['rooms'].append('admins')
    elif role == 'driver':
        # Get driver_id from database
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM drivers WHERE user_id = %s", (user_id,))
            result = cursor.fetchone()
            conn.close()
            if result:
                driver_id = result['id']
                join_room(f'driver_{driver_id}')
                driver_rooms[driver_id] = session_id
                if session_id in connected_clients:
                    connected_clients[session_id]['driverId'] = driver_id
                    connected_clients[session_id]['rooms'].append(f'driver_{driver_id}')
        except Exception as e:
            logger.error(f"Error getting driver info: {e}")
    
    emit('authenticated', {'userId': user_id, 'role': role})
    logger.info(f"User authenticated: {user_id} ({role})")

@socketio.on('subscribe_order')
def handle_subscribe_order(data):
    """Subscribe client to order updates."""
    session_id = request.sid
    order_id = data.get('orderId')
    
    if not order_id:
        emit('error', {'message': 'Order ID required'})
        return
    
    room = f'order_{order_id}'
    join_room(room)
    
    if order_id not in order_subscriptions:
        order_subscriptions[order_id] = set()
    order_subscriptions[order_id].add(session_id)
    
    if session_id in connected_clients:
        connected_clients[session_id]['rooms'].append(room)
    
    emit('subscribed', {'orderId': order_id})
    logger.info(f"Client {session_id} subscribed to order {order_id}")

@socketio.on('unsubscribe_order')
def handle_unsubscribe_order(data):
    """Unsubscribe client from order updates."""
    session_id = request.sid
    order_id = data.get('orderId')
    
    if order_id:
        leave_room(f'order_{order_id}')
        if order_id in order_subscriptions:
            order_subscriptions[order_id].discard(session_id)
    
    emit('unsubscribed', {'orderId': order_id})

@socketio.on('update_driver_location')
def handle_update_location(data):
    """Handle driver location update."""
    session_id = request.sid
    client_info = connected_clients.get(session_id, {})
    driver_id = client_info.get('driverId')
    
    if not driver_id:
        emit('error', {'message': 'Not authenticated as driver'})
        return
    
    lat = data.get('lat')
    lng = data.get('lng')
    order_id = data.get('orderId')
    
    # Update driver location in database
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE drivers SET current_lat = %s, current_lng = %s WHERE id = %s",
            (lat, lng, driver_id)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error updating driver location: {e}")
    
    # Broadcast to order subscribers if order_id is provided
    if order_id:
        socketio.emit('driver_location', {
            'driverId': driver_id,
            'orderId': order_id,
            'lat': lat,
            'lng': lng,
            'timestamp': datetime.utcnow().isoformat()
        }, room=f'order_{order_id}')
    
    # Always broadcast to admins
    socketio.emit('driver_location', {
        'driverId': driver_id,
        'lat': lat,
        'lng': lng,
        'timestamp': datetime.utcnow().isoformat()
    }, room='admins')

@socketio.on('ping')
def handle_ping():
    """Handle ping from client."""
    emit('pong', {'timestamp': datetime.utcnow().isoformat()})

# =============================================================================
# HTTP ENDPOINTS
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return {
        'service': 'websocket-service',
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'connected_clients': len(connected_clients),
        'active_subscriptions': len(order_subscriptions)
    }, 200

@app.route('/emit', methods=['POST'])
def emit_message():
    """HTTP endpoint to emit messages to websocket clients."""
    data = request.get_json()
    event = data.get('event')
    payload = data.get('payload', {})
    room = data.get('room')
    
    if not event:
        return {'error': 'Event required'}, 400
    
    if room:
        socketio.emit(event, payload, room=room)
    else:
        socketio.emit(event, payload)
    
    return {'success': True, 'event': event}, 200

@app.route('/stats', methods=['GET'])
def get_stats():
    """Get WebSocket server statistics."""
    return {
        'connected_clients': len(connected_clients),
        'admin_sessions': len(admin_sessions),
        'driver_sessions': len(driver_rooms),
        'order_subscriptions': len(order_subscriptions),
        'timestamp': datetime.utcnow().isoformat()
    }, 200

# =============================================================================
# STARTUP
# =============================================================================

if __name__ == '__main__':
    # Start RabbitMQ consumer in background thread
    consumer_thread = threading.Thread(target=rabbitmq_consumer, daemon=True)
    consumer_thread.start()
    
    logger.info("Starting WebSocket service on port 5005")
    socketio.run(app, host='0.0.0.0', port=5005, debug=False)
