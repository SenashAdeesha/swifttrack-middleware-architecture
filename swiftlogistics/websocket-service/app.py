"""
SwiftTrack WebSocket Service
Real-time communication service for order tracking and notifications
"""

# Pre-resolve DNS before monkey patching (eventlet patches socket)
import os
import socket
RABBITMQ_HOST_IP = None
try:
    _host = os.environ.get('RABBITMQ_HOST', 'rabbitmq')
    RABBITMQ_HOST_IP = socket.gethostbyname(_host)
    print(f"[Init] Pre-resolved RabbitMQ host {_host} to {RABBITMQ_HOST_IP}")
except Exception as e:
    print(f"[Init] Could not pre-resolve RabbitMQ host: {e}")
    RABBITMQ_HOST_IP = os.environ.get('RABBITMQ_HOST', 'rabbitmq')

import eventlet
eventlet.monkey_patch()

import json
import threading
from datetime import datetime
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from flask_cors import CORS
import pika
import jwt
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'websocket_secret_key_2026')
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Database configuration
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'postgres'),
    'port': int(os.environ.get('DB_PORT', 5432)),
    'database': os.environ.get('DB_NAME', 'swifttrack'),
    'user': os.environ.get('DB_USER', 'swifttrack_user'),
    'password': os.environ.get('DB_PASSWORD', 'swifttrack_pass_2026')
}

# RabbitMQ configuration
RABBITMQ_CONFIG = {
    'host': os.environ.get('RABBITMQ_HOST', 'rabbitmq'),
    'port': int(os.environ.get('RABBITMQ_PORT', 5672)),
    'virtual_host': os.environ.get('RABBITMQ_VHOST', 'swifttrack_vhost'),
    'username': os.environ.get('RABBITMQ_USER', 'swifttrack_user'),
    'password': os.environ.get('RABBITMQ_PASS', 'swifttrack_pass_2026')
}

JWT_SECRET = os.environ.get('JWT_SECRET', 'swifttrack_jwt_secret_key_2026')

# Connected clients tracking
connected_clients = {}  # sid -> {user_id, role, rooms}
user_connections = {}   # user_id -> [sids]
room_connections = {}   # room -> [sids]


def get_db_connection():
    """Get PostgreSQL database connection"""
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)


def verify_token(token):
    """Verify JWT token and return user data"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_rooms(user_id, role):
    """Get the rooms a user should join based on their role"""
    rooms = [f'user_{user_id}']
    
    if role == 'admin':
        rooms.extend(['admin_room', 'all_orders', 'driver_updates'])
    elif role == 'driver':
        rooms.extend(['drivers_room', 'driver_assignments'])
        # Add room for driver's active orders
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT o.id FROM orders o
                JOIN driver_assignments da ON da.order_id = o.id
                WHERE da.driver_id = %s AND da.status = 'accepted'
                AND o.status NOT IN ('delivered', 'cancelled', 'failed', 'returned')
            """, (user_id,))
            orders = cur.fetchall()
            for order in orders:
                rooms.append(f'order_{order["id"]}')
            cur.close()
            conn.close()
        except Exception as e:
            print(f"Error getting driver rooms: {e}")
    elif role == 'client':
        rooms.append('clients_room')
        # Add rooms for client's active orders
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT id FROM orders
                WHERE client_id = %s 
                AND status NOT IN ('delivered', 'cancelled', 'failed', 'returned')
            """, (user_id,))
            orders = cur.fetchall()
            for order in orders:
                rooms.append(f'order_{order["id"]}')
            cur.close()
            conn.close()
        except Exception as e:
            print(f"Error getting client rooms: {e}")
    
    return rooms


# ============ Socket.IO Event Handlers ============

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print(f"Client attempting to connect: {request.sid}")
    # Authentication happens via 'authenticate' event after connect
    emit('connection_status', {'status': 'connected', 'message': 'Please authenticate'})


@socketio.on('authenticate')
def handle_authenticate(data):
    """Handle client authentication"""
    token = data.get('token')
    user_id = data.get('userId') or data.get('user_id')
    role = data.get('role')
    
    # Support direct userId/role auth (from frontend) or JWT token auth
    if user_id and role:
        # Direct auth with userId and role
        print(f"[Auth] Direct auth: user_id={user_id}, role={role}")
    elif token:
        # JWT token auth
        user_data = verify_token(token)
        if not user_data:
            emit('auth_error', {'error': 'Invalid or expired token'})
            disconnect()
            return
        user_id = user_data.get('user_id')
        role = user_data.get('role')
    else:
        emit('auth_error', {'error': 'No authentication provided'})
        disconnect()
        return
    
    # Store client info
    connected_clients[request.sid] = {
        'user_id': user_id,
        'role': role,
        'rooms': [],
        'connected_at': datetime.utcnow().isoformat()
    }
    
    # Track user connections
    if user_id not in user_connections:
        user_connections[user_id] = []
    user_connections[user_id].append(request.sid)
    
    # Join appropriate rooms
    rooms = get_user_rooms(user_id, role)
    for room in rooms:
        join_room(room)
        connected_clients[request.sid]['rooms'].append(room)
        if room not in room_connections:
            room_connections[room] = []
        room_connections[room].append(request.sid)
    
    print(f"[Auth] User {user_id} ({role}) authenticated and joined rooms: {rooms}")
    
    emit('authenticated', {
        'status': 'success',
        'user_id': user_id,
        'role': role,
        'rooms': rooms
    })
    
    # Send any pending notifications
    send_pending_notifications(user_id)


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    sid = request.sid
    
    if sid in connected_clients:
        client = connected_clients[sid]
        user_id = client['user_id']
        
        # Leave all rooms
        for room in client['rooms']:
            leave_room(room)
            if room in room_connections:
                room_connections[room] = [s for s in room_connections[room] if s != sid]
        
        # Remove from user connections
        if user_id in user_connections:
            user_connections[user_id] = [s for s in user_connections[user_id] if s != sid]
            if not user_connections[user_id]:
                del user_connections[user_id]
        
        del connected_clients[sid]
        print(f"Client disconnected: {sid} (user: {user_id})")


@socketio.on('subscribe_order')
def handle_subscribe_order(data):
    """Subscribe to real-time updates for a specific order"""
    order_id = data.get('order_id')
    
    if request.sid not in connected_clients:
        emit('error', {'error': 'Not authenticated'})
        return
    
    client = connected_clients[request.sid]
    user_id = client['user_id']
    role = client['role']
    
    # Verify user has access to this order
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        if role == 'client':
            cur.execute("SELECT id FROM orders WHERE id = %s AND client_id = %s", (order_id, user_id))
        elif role == 'driver':
            cur.execute("""
                SELECT o.id FROM orders o
                JOIN driver_assignments da ON da.order_id = o.id
                WHERE o.id = %s AND da.driver_id = %s
            """, (order_id, user_id))
        else:  # admin
            cur.execute("SELECT id FROM orders WHERE id = %s", (order_id,))
        
        order = cur.fetchone()
        cur.close()
        conn.close()
        
        if not order:
            emit('error', {'error': 'Order not found or access denied'})
            return
        
        room = f'order_{order_id}'
        join_room(room)
        connected_clients[request.sid]['rooms'].append(room)
        
        if room not in room_connections:
            room_connections[room] = []
        room_connections[room].append(request.sid)
        
        emit('subscribed', {'order_id': order_id, 'room': room})
        
    except Exception as e:
        print(f"Error subscribing to order: {e}")
        emit('error', {'error': 'Failed to subscribe to order'})


@socketio.on('unsubscribe_order')
def handle_unsubscribe_order(data):
    """Unsubscribe from order updates"""
    order_id = data.get('order_id')
    room = f'order_{order_id}'
    
    if request.sid in connected_clients:
        leave_room(room)
        connected_clients[request.sid]['rooms'] = [
            r for r in connected_clients[request.sid]['rooms'] if r != room
        ]
        if room in room_connections:
            room_connections[room] = [s for s in room_connections[room] if s != request.sid]
        
        emit('unsubscribed', {'order_id': order_id})


@socketio.on('driver_location_update')
def handle_driver_location(data):
    """Handle driver location updates"""
    if request.sid not in connected_clients:
        emit('error', {'error': 'Not authenticated'})
        return
    
    client = connected_clients[request.sid]
    if client['role'] != 'driver':
        emit('error', {'error': 'Only drivers can send location updates'})
        return
    
    driver_id = client['user_id']
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    accuracy = data.get('accuracy')
    speed = data.get('speed')
    heading = data.get('heading')
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Update driver's current location
        cur.execute("""
            UPDATE users SET
                current_latitude = %s,
                current_longitude = %s,
                updated_at = NOW()
            WHERE id = %s
        """, (latitude, longitude, driver_id))
        
        # Record location history
        cur.execute("""
            INSERT INTO driver_locations (driver_id, latitude, longitude, accuracy, speed, heading)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (driver_id, latitude, longitude, accuracy, speed, heading))
        
        # Get driver's active orders
        cur.execute("""
            SELECT o.id, o.client_id FROM orders o
            JOIN driver_assignments da ON da.order_id = o.id
            WHERE da.driver_id = %s AND da.status = 'accepted'
            AND o.status IN ('picked_up', 'in_transit', 'out_for_delivery')
        """, (driver_id,))
        active_orders = cur.fetchall()
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Broadcast location to relevant clients
        location_data = {
            'event': 'driver_location',
            'driver_id': driver_id,
            'latitude': latitude,
            'longitude': longitude,
            'speed': speed,
            'heading': heading,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Emit to admin room
        socketio.emit('driver_location', location_data, room='admin_room')
        
        # Emit to each active order room (clients tracking their delivery)
        for order in active_orders:
            socketio.emit('driver_location', {
                **location_data,
                'order_id': order['id']
            }, room=f'order_{order["id"]}')
        
        emit('location_updated', {'status': 'success'})
        
    except Exception as e:
        print(f"Error updating driver location: {e}")
        emit('error', {'error': 'Failed to update location'})


@socketio.on('ping')
def handle_ping():
    """Handle ping for connection keepalive"""
    emit('pong', {'timestamp': datetime.utcnow().isoformat()})


def send_pending_notifications(user_id):
    """Send any unread notifications to user on connect"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, type, title, message, data, created_at
            FROM notifications
            WHERE user_id = %s AND read = FALSE
            ORDER BY created_at DESC
            LIMIT 50
        """, (user_id,))
        
        notifications = cur.fetchall()
        cur.close()
        conn.close()
        
        if notifications:
            for notif in notifications:
                emit('notification', {
                    'id': notif['id'],
                    'type': notif['type'],
                    'title': notif['title'],
                    'message': notif['message'],
                    'data': notif['data'] if notif['data'] else {},
                    'created_at': notif['created_at'].isoformat() if notif['created_at'] else None,
                    'is_pending': True
                })
                
    except Exception as e:
        print(f"Error sending pending notifications: {e}")


# ============ Broadcast Functions (called by RabbitMQ consumer) ============

def broadcast_order_status_update(order_id, status, client_user_id=None, data=None):
    """Broadcast order status update to relevant clients"""
    event_data = {
        'orderId': order_id,
        'order_id': order_id,
        'status': status,
        'timestamp': datetime.utcnow().isoformat()
    }

    # Emit to order room (Tracking page subscribers)
    socketio.emit('order_status_update', event_data, room=f'order_{order_id}')
    # Emit to admin room
    socketio.emit('order_status_update', event_data, room='admin_room')
    # Emit directly to client's user room (Dashboard / Orders page)
    if client_user_id:
        socketio.emit('order_status_update', event_data, room=f'user_{client_user_id}')

    print(f"Broadcasted order status update: {order_id} -> {status}")


def broadcast_middleware_update(order_id, stage, client_user_id=None, label=None, warehouse_location=None):
    """Broadcast WMS middleware pipeline stage: ready -> loaded -> dispatched"""
    event_data = {
        'orderId': order_id,
        'order_id': order_id,
        'stage': stage,
        'label': label or stage,
        'warehouseLocation': warehouse_location,
        'timestamp': datetime.utcnow().isoformat()
    }

    socketio.emit('middleware_update', event_data, room=f'order_{order_id}')
    socketio.emit('middleware_update', event_data, room='admin_room')
    socketio.emit('middleware_update', event_data, room='clients_room')  # Also broadcast to all clients
    if client_user_id:
        socketio.emit('middleware_update', event_data, room=f'user_{client_user_id}')

    print(f"Broadcasted middleware stage: order {order_id} -> {stage}")


def broadcast_order_created(order_id, client_id, client_user_id=None, data=None):
    """Broadcast new order created to admins and the creating client."""
    event_data = {
        'orderId': order_id,
        'order_id': order_id,
        'clientId': client_id,
        'timestamp': datetime.utcnow().isoformat()
    }

    # Emit to admin room
    socketio.emit('new_order', event_data, room='admin_room')

    # Emit to the client's user room so Dashboard refreshes
    if client_user_id:
        socketio.emit('new_order', event_data, room=f'user_{client_user_id}')
    elif client_id in user_connections:
        for sid in user_connections[str(client_id)]:
            socketio.emit('new_order', event_data, room=sid)

    print(f"Broadcasted new order: {order_id}")


def broadcast_driver_assigned(order_id, driver_id, client_id, data=None):
    """Broadcast driver assignment"""
    event_data = {
        'event': 'driver_assigned',
        'order_id': order_id,
        'driver_id': driver_id,
        'data': data or {},
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Emit to order room
    socketio.emit('driver_assigned', event_data, room=f'order_{order_id}')
    
    # Emit to driver
    if driver_id in user_connections:
        for sid in user_connections[driver_id]:
            socketio.emit('new_assignment', event_data, room=sid)
    
    # Emit to client
    if client_id in user_connections:
        for sid in user_connections[client_id]:
            socketio.emit('driver_assigned', event_data, room=sid)
    
    # Emit to admin room
    socketio.emit('driver_assigned', event_data, room='admin_room')
    
    print(f"Broadcasted driver assignment: order {order_id} -> driver {driver_id}")


def broadcast_delivery_completed(order_id, driver_id, client_user_id=None, data=None):
    """Broadcast delivery completion"""
    event_data = {
        'event': 'delivery_completed',
        'order_id': order_id,
        'orderId': order_id,
        'driver_id': driver_id,
        'data': data or {},
        'timestamp': datetime.utcnow().isoformat()
    }

    # Emit to all relevant parties
    socketio.emit('delivery_completed', event_data, room=f'order_{order_id}')
    socketio.emit('delivery_completed', event_data, room='admin_room')

    # Emit directly to client's user room
    if client_user_id:
        socketio.emit('delivery_completed', event_data, room=f'user_{client_user_id}')

    print(f"Broadcasted delivery completion: {order_id}")


def broadcast_notification(user_id, notification_data):
    """Send notification to specific user"""
    if user_id in user_connections:
        for sid in user_connections[user_id]:
            socketio.emit('notification', notification_data, room=sid)
        print(f"Sent notification to user {user_id}")


def broadcast_timeline_update(order_id, entry, client_user_id=None, data=None):
    """Broadcast a new order_timeline entry to tracking pages in real-time."""
    event_data = {
        'event': 'timeline_update',
        'order_id': order_id,
        'orderId': order_id,
        'entry': entry,
        'data': data or {},
        'timestamp': datetime.utcnow().isoformat()
    }
    socketio.emit('timeline_update', event_data, room=f'order_{order_id}')
    socketio.emit('timeline_update', event_data, room='admin_room')
    if client_user_id:
        socketio.emit('timeline_update', event_data, room=f'user_{client_user_id}')
    print(f"Broadcasted timeline update for order {order_id}: {entry.get('status')}")


def broadcast_cms_update(order_id, event_type, stage, message, client_id=None, data=None):
    """Broadcast CMS (SOAP/XML) service updates to relevant clients."""
    event_data = {
        'event': 'cms_update',
        'order_id': order_id,
        'orderId': order_id,
        'type': event_type,
        'service': 'CMS',
        'protocol': 'SOAP/XML',
        'stage': stage,
        'message': message,
        'data': data or {},
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Emit to order room
    socketio.emit('cms_update', event_data, room=f'order_{order_id}')
    # Emit to admin room (admins see all service updates)
    socketio.emit('cms_update', event_data, room='admin_room')
    # Emit to clients room
    socketio.emit('cms_update', event_data, room='clients_room')
    # Emit to specific client if provided
    if client_id:
        socketio.emit('cms_update', event_data, room=f'user_{client_id}')
    
    print(f"")
    print(f"╔══════════════════════════════════════════════════════════════╗")
    print(f"║  📋 CMS SERVICE (SOAP/XML)                                   ║")
    print(f"╠══════════════════════════════════════════════════════════════╣")
    print(f"║  Order ID    : {order_id:<45} ║")
    print(f"║  Event       : {event_type:<45} ║")
    print(f"║  Stage       : {stage:<45} ║")
    print(f"║  Message     : {message[:45]:<45} ║")
    print(f"║  Protocol    : SOAP/XML                                      ║")
    print(f"║  Endpoint    : :5003/soap                                    ║")
    print(f"╚══════════════════════════════════════════════════════════════╝")
    print(f"")


def broadcast_ros_update(order_id, event_type, stage, message, route_id=None, distance_km=None, estimated_duration=None, data=None):
    """Broadcast ROS (REST/JSON) service updates to relevant clients."""
    event_data = {
        'event': 'ros_update',
        'order_id': order_id,
        'orderId': order_id,
        'type': event_type,
        'service': 'ROS',
        'protocol': 'REST/JSON',
        'stage': stage,
        'message': message,
        'route_id': route_id,
        'distance_km': distance_km,
        'estimated_duration': estimated_duration,
        'data': data or {},
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Emit to order room
    socketio.emit('ros_update', event_data, room=f'order_{order_id}')
    # Emit to admin room
    socketio.emit('ros_update', event_data, room='admin_room')
    # Emit to clients room
    socketio.emit('ros_update', event_data, room='clients_room')
    # Emit to drivers room (they need route info)
    socketio.emit('ros_update', event_data, room='drivers_room')
    
    print(f"")
    print(f"╔══════════════════════════════════════════════════════════════╗")
    print(f"║  🛣️  ROS SERVICE (REST/JSON)                                  ║")
    print(f"╠══════════════════════════════════════════════════════════════╣")
    print(f"║  Order ID    : {order_id:<45} ║")
    print(f"║  Event       : {event_type:<45} ║")
    print(f"║  Stage       : {stage:<45} ║")
    print(f"║  Message     : {message[:45]:<45} ║")
    print(f"║  Protocol    : REST/JSON                                     ║")
    print(f"║  Endpoint    : :5004/route/optimize                          ║")
    if distance_km:
        print(f"║  Distance    : {str(distance_km) + ' km':<45} ║")
    if estimated_duration:
        print(f"║  ETA         : {str(estimated_duration):<45} ║")
    print(f"╚══════════════════════════════════════════════════════════════╝")
    print(f"")


def broadcast_wms_update(order_id, event_type, stage, message, data=None):
    """Broadcast WMS (RabbitMQ messaging) service updates to relevant clients."""
    event_data = {
        'event': 'wms_update',
        'order_id': order_id,
        'orderId': order_id,
        'type': event_type,
        'status': event_type,
        'service': 'WMS',
        'protocol': 'RabbitMQ',
        'stage': stage,
        'message': message,
        'description': message,
        'data': data or {},
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Emit to order room
    socketio.emit('wms_update', event_data, room=f'order_{order_id}')
    # Emit to admin room
    socketio.emit('wms_update', event_data, room='admin_room')
    # Emit to clients room
    socketio.emit('wms_update', event_data, room='clients_room')
    
    print(f"")
    print(f"╔══════════════════════════════════════════════════════════════╗")
    print(f"║  🏭 WMS SERVICE (RabbitMQ)                                   ║")
    print(f"╠══════════════════════════════════════════════════════════════╣")
    print(f"║  Order ID    : {order_id:<45} ║")
    print(f"║  Event       : {event_type:<45} ║")
    print(f"║  Stage       : {stage:<45} ║")
    print(f"║  Message     : {message[:45]:<45} ║")
    print(f"║  Protocol    : AMQP (RabbitMQ)                               ║")
    print(f"║  Queue       : wms_orders                                    ║")
    print(f"╚══════════════════════════════════════════════════════════════╝")
    print(f"")


# ============ RabbitMQ Consumer ============

def process_rabbitmq_message(ch, method, properties, body):
    """Process incoming RabbitMQ messages.

    Supports two message formats:
    1. Legacy:  {"event": "...", "data": {...}}
    2. WMS/new: {"type": "...", "order_id": ..., "status": ..., "data": {...}}
    """
    try:
        message = json.loads(body)
        # Support both 'event' (legacy) and 'type' (WMS pipeline) fields
        event_type = message.get('event') or message.get('type')
        data = message.get('data', {})

        print(f"Received RabbitMQ message: {event_type}")

        if event_type == 'order_created':
            order_id = data.get('order_id') or message.get('order_id')
            client_id = data.get('client_id') or message.get('client_id')
            client_user_id = data.get('client_user_id') or message.get('client_user_id')
            broadcast_order_created(order_id, client_id, client_user_id, data)

        elif event_type == 'order_status_update':
            order_id = data.get('order_id') or message.get('order_id')
            status = data.get('status') or message.get('status')
            client_user_id = data.get('client_user_id')
            broadcast_order_status_update(order_id, status, client_user_id, data)

        elif event_type == 'middleware_update':
            order_id = message.get('order_id') or message.get('orderId') or data.get('order_id')
            stage = message.get('stage') or data.get('stage')
            client_user_id = data.get('client_user_id') or message.get('client_user_id')
            print(f"[WS] middleware_update: order={order_id}, stage={stage}")
            broadcast_middleware_update(
                order_id, stage, client_user_id,
                label=data.get('label') or message.get('label'),
                warehouse_location=data.get('warehouse_location')
            )

        elif event_type == 'driver_assigned':
            broadcast_driver_assigned(
                data.get('order_id') or message.get('order_id'),
                data.get('driver_id') or message.get('driver_id'),
                data.get('client_id') or message.get('client_id'),
                data
            )

        elif event_type == 'delivery_completed':
            broadcast_delivery_completed(
                data.get('order_id') or message.get('order_id'),
                data.get('driver_id') or message.get('driver_id'),
                data.get('client_user_id') or message.get('client_user_id'),
                data
            )

        elif event_type == 'timeline_update':
            order_id       = message.get('order_id') or data.get('order_id')
            entry          = message.get('entry') or data.get('entry') or {}
            client_user_id = data.get('client_user_id') or (message.get('data') or {}).get('client_user_id')
            broadcast_timeline_update(order_id, entry, client_user_id, data)

        elif event_type == 'notification':
            broadcast_notification(
                data.get('user_id'),
                data
            )

        elif event_type == 'driver_location':
            # Forward driver location updates
            socketio.emit('driver_location', data, room='admin_room')
            if data.get('order_id'):
                socketio.emit('driver_location', data, room=f'order_{data["order_id"]}')

        # ============ CMS (SOAP/XML) Service Updates ============
        elif event_type in ['cms_validation_started', 'cms_validation_success', 'cms_validation_skipped']:
            order_id = message.get('order_id')
            client_id = message.get('client_id')
            stage = message.get('stage', 'CMS Processing')
            msg = message.get('message', f'CMS Service: Processing order #{order_id}')
            broadcast_cms_update(order_id, event_type, stage, msg, client_id, message)

        # ============ ROS (REST/JSON) Service Updates ============
        elif event_type in ['ros_optimization_started', 'ros_optimization_success', 'ros_optimization_skipped', 'ros_optimization_error']:
            order_id = message.get('order_id')
            stage = message.get('stage', 'ROS Processing')
            msg = message.get('message', f'ROS Service: Processing order #{order_id}')
            route_id = message.get('route_id')
            distance_km = message.get('distance_km')
            estimated_duration = message.get('estimated_duration')
            broadcast_ros_update(order_id, event_type, stage, msg, route_id, distance_km, estimated_duration, message)

        # ============ WMS (RabbitMQ) Service Updates ============
        elif event_type in ['wms_reservation_started', 'wms_reservation_success', 'wms_reservation_error', 'wms_processed']:
            order_id = message.get('order_id')
            stage = message.get('stage', 'WMS Processing')
            msg = message.get('message', f'WMS Service: Processing order #{order_id}')
            broadcast_wms_update(order_id, event_type, stage, msg, message)

        else:
            print(f"Unknown event type: {event_type}")

        ch.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as e:
        print(f"Error processing RabbitMQ message: {e}")
        ch.basic_ack(delivery_tag=method.delivery_tag)


def start_rabbitmq_consumer():
    """Start RabbitMQ consumer in background thread"""
    import threading
    
    # Use pre-resolved IP address
    rabbitmq_ip = RABBITMQ_HOST_IP
    print(f"[RabbitMQ] Using host: {rabbitmq_ip}")
    
    def consume():
        print("[RabbitMQ] Starting consumer thread...")
        while True:
            try:
                print("[RabbitMQ] Attempting to connect...")
                credentials = pika.PlainCredentials(
                    RABBITMQ_CONFIG['username'],
                    RABBITMQ_CONFIG['password']
                )
                connection = pika.BlockingConnection(pika.ConnectionParameters(
                    host=rabbitmq_ip,  # Use resolved IP
                    port=RABBITMQ_CONFIG['port'],
                    virtual_host=RABBITMQ_CONFIG['virtual_host'],
                    credentials=credentials,
                    heartbeat=600,
                    blocked_connection_timeout=300
                ))
                channel = connection.channel()
                
                # Declare topic exchange (matches current RabbitMQ state)
                channel.exchange_declare(
                    exchange='swifttrack.notifications',
                    exchange_type='topic',
                    durable=True
                )
                
                # Declare queue
                result = channel.queue_declare(queue='websocket_queue', durable=True)
                queue_name = result.method.queue
                
                # Bind to all notification events using topic pattern
                channel.queue_bind(
                    exchange='swifttrack.notifications',
                    queue=queue_name,
                    routing_key='#'  # Match all routing keys
                )
                
                channel.basic_qos(prefetch_count=1)
                channel.basic_consume(
                    queue=queue_name,
                    on_message_callback=process_rabbitmq_message
                )
                
                print("[RabbitMQ] WebSocket service consumer started successfully")
                channel.start_consuming()
                
            except Exception as e:
                print(f"[RabbitMQ] Connection error: {e}")
                import time
                time.sleep(5)  # Wait before reconnecting
    
    # Use a real OS thread for pika (it uses blocking I/O)
    consumer_thread = threading.Thread(target=consume, daemon=True)
    consumer_thread.start()
    print("[RabbitMQ] Consumer thread spawned")


# ============ REST API Endpoints (for internal service calls) ============

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'websocket-service',
        'connected_clients': len(connected_clients),
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/api/broadcast', methods=['POST'])
def api_broadcast():
    """Internal API for broadcasting events from other services"""
    data = request.json
    event_type = data.get('event')
    payload = data.get('data', {})
    
    if event_type == 'order_status_update':
        broadcast_order_status_update(
            payload.get('order_id'),
            payload.get('status'),
            payload.get('client_user_id'),
            payload
        )
    elif event_type == 'order_created':
        broadcast_order_created(
            payload.get('order_id'),
            payload.get('client_id'),
            payload
        )
    elif event_type == 'driver_assigned':
        broadcast_driver_assigned(
            payload.get('order_id'),
            payload.get('driver_id'),
            payload.get('client_id'),
            payload
        )
    elif event_type == 'delivery_completed':
        broadcast_delivery_completed(
            payload.get('order_id'),
            payload.get('driver_id'),
            payload.get('client_user_id'),
            payload
        )
    elif event_type == 'notification':
        broadcast_notification(
            payload.get('user_id'),
            payload
        )
    elif event_type == 'timeline_update':
        broadcast_timeline_update(
            payload.get('order_id'),
            payload.get('entry', {}),
            payload.get('client_user_id'),
            payload
        )
    else:
        return jsonify({'error': 'Unknown event type'}), 400
    
    return jsonify({'status': 'broadcasted'})


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get WebSocket server statistics"""
    return jsonify({
        'connected_clients': len(connected_clients),
        'user_connections': len(user_connections),
        'rooms': {room: len(sids) for room, sids in room_connections.items()},
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/api/send-to-user', methods=['POST'])
def send_to_user():
    """Send message to specific user"""
    data = request.json
    user_id = data.get('user_id')
    event = data.get('event', 'message')
    payload = data.get('data', {})
    
    if user_id in user_connections:
        for sid in user_connections[user_id]:
            socketio.emit(event, payload, room=sid)
        return jsonify({'status': 'sent', 'connections': len(user_connections[user_id])})
    
    return jsonify({'status': 'user_not_connected'})


@app.route('/api/send-to-room', methods=['POST'])
def send_to_room():
    """Send message to specific room"""
    data = request.json
    room = data.get('room')
    event = data.get('event', 'message')
    payload = data.get('data', {})
    
    socketio.emit(event, payload, room=room)
    return jsonify({
        'status': 'sent',
        'room': room,
        'connections': len(room_connections.get(room, []))
    })


if __name__ == '__main__':
    print("Starting SwiftTrack WebSocket Service...")
    start_rabbitmq_consumer()
    socketio.run(app, host='0.0.0.0', port=5006, debug=False)
