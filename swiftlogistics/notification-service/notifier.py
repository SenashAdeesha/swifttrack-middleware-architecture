# =============================================================================
# SwiftTrack Logistics - Notification Service
# =============================================================================
# Message Consumer for sending notifications (Email, SMS, Push)
# Uses RabbitMQ Fanout Exchange for broadcast delivery
# =============================================================================

import os
import json
import logging
import time
import threading
import socket
from datetime import datetime
import uuid

import psycopg2
from psycopg2.extras import RealDictCursor
import pika

# =============================================================================
# CONFIGURATION
# =============================================================================

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
# STRUCTURED LOGGING
# =============================================================================

class StructuredLogger:
    def __init__(self, name):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, LOG_LEVEL))
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "notification-service", "message": "%(message)s"}'
        ))
        if not self.logger.handlers:
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
    """Create database connection with retry."""
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
        except psycopg2.OperationalError as e:
            if attempt < max_retries - 1:
                time.sleep(2)
            else:
                raise

# =============================================================================
# RABBITMQ CONNECTION
# =============================================================================

def get_rabbitmq_connection():
    """Create RabbitMQ connection with retry logic."""
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        virtual_host=RABBITMQ_VHOST,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300
    )
    
    max_retries = 10
    for attempt in range(max_retries):
        try:
            connection = pika.BlockingConnection(parameters)
            logger.info("Connected to RabbitMQ", attempt=attempt + 1)
            return connection
        except pika.exceptions.AMQPConnectionError as e:
            logger.warning("RabbitMQ connection failed, retrying...", 
                          attempt=attempt + 1, error=str(e))
            time.sleep(5)
    
    raise Exception("Failed to connect to RabbitMQ after max retries")

# =============================================================================
# NOTIFICATION HANDLERS
# =============================================================================

def send_email_notification(user_id, subject, message, order_id=None):
    """
    =========================================================================
    EMAIL NOTIFICATION HANDLER
    =========================================================================
    In production, this would integrate with SendGrid, AWS SES, etc.
    For now, stores notification in database and logs.
    =========================================================================
    """
    logger.info("Sending email notification", user_id=user_id, subject=subject)
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get user email
        cursor.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if user:
            # Store notification in database
            cursor.execute("""
                INSERT INTO notifications (user_id, type, title, message, read)
                VALUES (%s, 'email', %s, %s, false)
            """, (user_id, subject, message))
            
            conn.commit()
            logger.info("Email notification sent", email=user['email'], subject=subject)
        else:
            logger.warning("User not found for email notification", user_id=user_id)
            
        conn.close()
        return True
        
    except Exception as e:
        logger.error("Failed to send email notification", error=str(e))
        return False

def send_sms_notification(user_id, message, order_id=None):
    """
    =========================================================================
    SMS NOTIFICATION HANDLER
    =========================================================================
    In production, this would integrate with Twilio, AWS SNS, etc.
    =========================================================================
    """
    logger.info("Sending SMS notification", user_id=user_id)
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get user phone
        cursor.execute("SELECT phone FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if user and user.get('phone'):
            # Store notification
            cursor.execute("""
                INSERT INTO notifications (user_id, type, title, message, read)
                VALUES (%s, 'sms', 'SMS Notification', %s, false)
            """, (user_id, message))
            
            conn.commit()
            logger.info("SMS notification sent", phone=user['phone'])
        else:
            logger.warning("User phone not found", user_id=user_id)
            
        conn.close()
        return True
        
    except Exception as e:
        logger.error("Failed to send SMS notification", error=str(e))
        return False

def send_push_notification(user_id, title, message, data=None):
    """
    =========================================================================
    PUSH NOTIFICATION HANDLER
    =========================================================================
    In production, this would integrate with Firebase FCM, Apple APNS, etc.
    =========================================================================
    """
    logger.info("Sending push notification", user_id=user_id, title=title)
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Store notification
        cursor.execute("""
            INSERT INTO notifications (user_id, type, title, message, read, data)
            VALUES (%s, 'push', %s, %s, false, %s)
        """, (user_id, title, message, json.dumps(data or {})))
        
        conn.commit()
        conn.close()
        
        logger.info("Push notification sent", user_id=user_id)
        return True
        
    except Exception as e:
        logger.error("Failed to send push notification", error=str(e))
        return False

def notify_order_status_change(order_id, status, message):
    """Notify client about order status change."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get client user ID from order
        cursor.execute("""
            SELECT c.user_id, u.name, u.email
            FROM orders o
            JOIN clients c ON o.client_id = c.id
            JOIN users u ON c.user_id = u.id
            WHERE o.id = %s
        """, (order_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            user_id = result['user_id']
            name = result['name']
            
            # Send all notification types
            send_email_notification(
                user_id,
                f"Order Status Update: {status.replace('_', ' ').title()}",
                f"Hello {name},\n\n{message}\n\nOrder ID: {order_id}",
                order_id
            )
            
            send_push_notification(
                user_id,
                f"Order {status.replace('_', ' ').title()}",
                message,
                {'order_id': order_id, 'status': status}
            )
            
        return True
        
    except Exception as e:
        logger.error("Failed to notify order status change", error=str(e))
        return False

def notify_driver_assignment(order_id, driver_id):
    """Notify driver about new delivery assignment."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get driver user ID
        cursor.execute("""
            SELECT d.user_id, u.name, o.pickup_address, o.delivery_address
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            JOIN orders o ON o.id = %s
            WHERE d.id = %s
        """, (order_id, driver_id))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            user_id = result['user_id']
            name = result['name']
            pickup = result['pickup_address']
            delivery = result['delivery_address']
            
            send_push_notification(
                user_id,
                "New Delivery Assigned",
                f"New delivery from {pickup} to {delivery}",
                {'order_id': order_id}
            )
            
        return True
        
    except Exception as e:
        logger.error("Failed to notify driver assignment", error=str(e))
        return False

# =============================================================================
# MESSAGE HANDLERS
# =============================================================================

def get_all_admin_user_ids():
    """Get all admin user IDs for system-wide notifications."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE role = 'admin'")
        admins = cursor.fetchall()
        conn.close()
        return [admin['id'] for admin in admins]
    except Exception as e:
        logger.error("Failed to get admin users", error=str(e))
        return []

def notify_admins(title, message, notification_type='system', data=None):
    """Send notification to all admins."""
    admin_ids = get_all_admin_user_ids()
    for admin_id in admin_ids:
        send_push_notification(admin_id, title, message, data)
    logger.info("Notified all admins", count=len(admin_ids), title=title)

def handle_new_order(data):
    """Handle new order created notification."""
    order_id = data.get('order_id')
    client_id = data.get('client_id')
    client_user_id = data.get('client_user_id')
    pickup = data.get('pickup_address', 'Unknown')
    delivery = data.get('delivery_address', 'Unknown')
    
    # Notify client
    if client_user_id:
        send_push_notification(
            client_user_id,
            "Order Created",
            f"Your order #{order_id} has been created and is being processed",
            {'order_id': order_id, 'status': 'pending'}
        )
    
    # Notify all admins
    notify_admins(
        "New Order Received",
        f"Order #{order_id} from {pickup} to {delivery}",
        'delivery',
        {'order_id': order_id, 'status': 'pending'}
    )

def handle_order_status_change(data):
    """Handle order status change notification for all actors."""
    order_id = data.get('order_id')
    status = data.get('status')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get order details with client and driver info
        cursor.execute("""
            SELECT o.id, o.status, o.pickup_address, o.delivery_address,
                   c.user_id as client_user_id, u1.name as client_name,
                   d.user_id as driver_user_id, u2.name as driver_name
            FROM orders o
            JOIN clients c ON o.client_id = c.id
            JOIN users u1 ON c.user_id = u1.id
            LEFT JOIN drivers d ON o.driver_id = d.id
            LEFT JOIN users u2 ON d.user_id = u2.id
            WHERE o.id = %s
        """, (order_id,))
        order = cursor.fetchone()
        conn.close()
        
        if not order:
            return
        
        client_user_id = order['client_user_id']
        driver_user_id = order.get('driver_user_id')
        
        # Status messages for each actor
        status_messages = {
            'pending': {
                'client': 'Your order is pending confirmation',
                'admin': f"Order #{order_id} is pending",
                'driver': None
            },
            'confirmed': {
                'client': 'Your order has been confirmed',
                'admin': f"Order #{order_id} confirmed",
                'driver': None
            },
            'in_warehouse': {
                'client': 'Your package has arrived at the warehouse',
                'admin': f"Order #{order_id} received at warehouse",
                'driver': f"Order #{order_id} is ready for pickup"
            },
            'out_for_delivery': {
                'client': 'Your order is out for delivery',
                'admin': f"Order #{order_id} out for delivery",
                'driver': f"Order #{order_id} dispatched"
            },
            'delivered': {
                'client': 'Your order has been delivered successfully!',
                'admin': f"Order #{order_id} delivered",
                'driver': f"Order #{order_id} delivery confirmed"
            },
            'failed': {
                'client': 'Delivery attempt failed. We will retry soon.',
                'admin': f"Order #{order_id} delivery failed",
                'driver': f"Delivery failed for order #{order_id}"
            },
            'cancelled': {
                'client': 'Your order has been cancelled',
                'admin': f"Order #{order_id} cancelled",
                'driver': f"Order #{order_id} has been cancelled"
            }
        }
        
        msgs = status_messages.get(status, {
            'client': f'Order status: {status}',
            'admin': f"Order #{order_id}: {status}",
            'driver': f"Order #{order_id}: {status}"
        })
        
        status_titles = {
            'pending': 'Order Pending',
            'confirmed': 'Order Confirmed',
            'in_warehouse': 'Package at Warehouse',
            'out_for_delivery': 'Out for Delivery',
            'delivered': 'Order Delivered',
            'failed': 'Delivery Failed',
            'cancelled': 'Order Cancelled'
        }
        title = status_titles.get(status, 'Order Update')
        
        # Notify client
        if client_user_id and msgs.get('client'):
            send_push_notification(
                client_user_id, title, msgs['client'],
                {'order_id': order_id, 'status': status}
            )
        
        # Notify driver if assigned
        if driver_user_id and msgs.get('driver'):
            send_push_notification(
                driver_user_id, title, msgs['driver'],
                {'order_id': order_id, 'status': status}
            )
        
        # Notify admins
        notify_admins(title, msgs['admin'], 'delivery', {'order_id': order_id, 'status': status})
        
    except Exception as e:
        logger.error("Failed to handle order status change", error=str(e))

def handle_driver_assigned(data):
    """Handle driver assignment notification for all actors."""
    order_id = data.get('order_id')
    driver_id = data.get('driver_id')
    driver_name = data.get('driver_name', 'A driver')
    
    # Use direct user IDs if available, otherwise query
    client_user_id = data.get('client_user_id')
    driver_user_id = data.get('driver_user_id')
    pickup = data.get('pickup_address', '')
    delivery = data.get('delivery_address', '')
    
    try:
        # If user IDs not in data, query them
        if not client_user_id or not driver_user_id:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            # Get order and driver details
            cursor.execute("""
                SELECT o.id, o.pickup_address, o.delivery_address,
                       c.user_id as client_user_id,
                       d.user_id as driver_user_id, u.name as driver_name
                FROM orders o
                JOIN clients c ON o.client_id = c.id
                LEFT JOIN drivers d ON d.id::text = %s OR d.user_id::text = %s
                LEFT JOIN users u ON d.user_id = u.id
                WHERE o.id = %s
            """, (driver_id, driver_id, order_id))
            result = cursor.fetchone()
            conn.close()
            
            if not result:
                logger.warning("Driver assignment: order/driver not found", order_id=order_id)
                return
            
            client_user_id = client_user_id or result['client_user_id']
            driver_user_id = driver_user_id or result.get('driver_user_id')
            driver_name = result.get('driver_name') or driver_name
            pickup = pickup or result['pickup_address']
            delivery = delivery or result['delivery_address']
        
        # Notify client
        if client_user_id:
            send_push_notification(
                client_user_id,
                "Driver Assigned",
                f"{driver_name} has been assigned to deliver your order",
                {'order_id': order_id, 'driver_id': str(driver_id)}
            )
        
        # Notify driver
        if driver_user_id:
            send_push_notification(
                driver_user_id,
                "New Delivery Assignment",
                f"New delivery: {pickup} → {delivery}",
                {'order_id': order_id}
            )
        
        # Notify admins
        notify_admins(
            "Driver Assigned",
            f"{driver_name} assigned to order #{order_id}",
            'delivery',
            {'order_id': order_id, 'driver_id': str(driver_id)}
        )
        
    except Exception as e:
        logger.error("Failed to handle driver assignment", error=str(e))

def handle_delivery_proof_uploaded(data):
    """Handle delivery proof uploaded notification."""
    order_id = data.get('order_id')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.user_id as client_user_id
            FROM orders o
            JOIN clients c ON o.client_id = c.id
            WHERE o.id = %s
        """, (order_id,))
        result = cursor.fetchone()
        conn.close()
        
        if result:
            send_push_notification(
                result['client_user_id'],
                "Delivery Proof Available",
                f"Proof of delivery for order #{order_id} is now available",
                {'order_id': order_id}
            )
        
        notify_admins(
            "Delivery Proof Uploaded",
            f"Delivery proof uploaded for order #{order_id}",
            'delivery',
            {'order_id': order_id}
        )
        
    except Exception as e:
        logger.error("Failed to handle delivery proof", error=str(e))

def handle_notification_message(ch, method, properties, body):
    """
    =========================================================================
    NOTIFICATION MESSAGE HANDLER
    =========================================================================
    Processes messages from fanout exchange (broadcast)
    =========================================================================
    """
    message_id = properties.message_id or 'unknown'
    logger.info("Processing notification message", message_id=message_id)
    
    try:
        data = json.loads(body)
        notification_type = data.get('type')
        order_id = data.get('order_id')
        status = data.get('status')
        message = data.get('message')
        user_id = data.get('user_id')
        driver_id = data.get('driver_id')
        
        # Handle different notification types
        if notification_type in ['order_created', 'new_order']:
            handle_new_order(data)
            
        elif notification_type in ['order_status_change', 'order_status_update', 'realtime.order_status']:
            data['order_id'] = order_id
            data['status'] = status
            handle_order_status_change(data)
            
        elif notification_type in ['driver_assigned', 'realtime.driver_assigned']:
            handle_driver_assigned(data)
            
        elif notification_type == 'realtime.new_assignment':
            # Driver received new assignment
            if driver_id:
                send_push_notification(
                    driver_id,
                    "New Delivery Assignment",
                    f"You have a new delivery assignment for order #{order_id}",
                    {'order_id': order_id}
                )
            
        elif notification_type in ['package_received', 'realtime.package_received']:
            data['status'] = 'in_warehouse'
            handle_order_status_change(data)
            
        elif notification_type in ['delivery_completed', 'realtime.delivery_completed']:
            data['status'] = 'delivered'
            handle_order_status_change(data)
            
        elif notification_type == 'realtime.proof_uploaded':
            handle_delivery_proof_uploaded(data)
            
        elif notification_type in ['notification', 'custom']:
            # Direct user notification - also notify admins for important events
            title = data.get('title', 'Notification')
            if user_id:
                send_push_notification(user_id, title, message, {'order_id': order_id})
            
            # Notify admins about significant events (delivery, failure, etc.)
            notif_type = data.get('notification_type', '')
            if notif_type in ['success', 'error', 'warning'] or 'deliver' in title.lower() or 'fail' in title.lower():
                notify_admins(
                    f"System: {title}",
                    f"Order #{order_id}: {message}" if order_id else message,
                    'system',
                    {'order_id': order_id, 'notification_type': notif_type}
                )
                
        elif notification_type == 'user_registered':
            # New user registration - notify all admins
            user_name = data.get('name', 'Unknown')
            role = data.get('role', 'user')
            notify_admins(
                "New User Registered",
                f"New {role} account: {user_name}",
                'system',
                {'user_id': user_id, 'role': role}
            )
                
        else:
            # Handle any realtime.* events
            if notification_type and notification_type.startswith('realtime.'):
                logger.info("Handling realtime event", event_type=notification_type)
                # For generic realtime events, just log
            else:
                logger.warning("Unknown notification type", type=notification_type)
        
        # Acknowledge message
        ch.basic_ack(delivery_tag=method.delivery_tag)
        
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in notification message", error=str(e))
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
    except Exception as e:
        logger.error("Error processing notification", error=str(e))
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

# =============================================================================
# NOTIFICATION CONSUMER
# =============================================================================

class NotificationConsumer:
    """
    =========================================================================
    NOTIFICATION MESSAGE CONSUMER
    =========================================================================
    Subscribes to fanout exchange for broadcast notifications
    =========================================================================
    """
    
    def __init__(self):
        self.connection = None
        self.channel = None
        self.should_stop = False
        
    def connect(self):
        """Establish connection and setup queues."""
        self.connection = get_rabbitmq_connection()
        self.channel = self.connection.channel()
        
        # Declare topic exchange (matches RabbitMQ setup)
        self.channel.exchange_declare(
            exchange='swifttrack.notifications',
            exchange_type='topic',
            durable=True
        )
        
        # Declare notification queue
        self.channel.queue_declare(
            queue='notification.email',
            durable=True,
            arguments={
                'x-dead-letter-exchange': 'swifttrack.dlx',
                'x-dead-letter-routing-key': 'notification.dlq',
                'x-message-ttl': 3600000
            }
        )
        
        # Bind to topic exchange with wildcard pattern
        self.channel.queue_bind('notification.email', 'swifttrack.notifications', '#')
        
        # Prefetch limit
        self.channel.basic_qos(prefetch_count=10)
        
        logger.info("Notification consumer connected")
        
    def start_consuming(self):
        """Start consuming messages."""
        self.channel.basic_consume(
            queue='notification.email',
            on_message_callback=handle_notification_message,
            auto_ack=False
        )
        
        logger.info("Starting to consume notification messages...")
        
        try:
            self.channel.start_consuming()
        except KeyboardInterrupt:
            self.stop()
        except Exception as e:
            logger.error("Consumer error", error=str(e))
            self.reconnect()
            
    def reconnect(self):
        """Reconnect to RabbitMQ after failure."""
        logger.warning("Attempting to reconnect...")
        time.sleep(5)
        
        try:
            if self.connection and self.connection.is_open:
                self.connection.close()
        except:
            pass
        
        try:
            self.connect()
            self.start_consuming()
        except Exception as e:
            logger.error("Reconnection failed", error=str(e))
            if not self.should_stop:
                self.reconnect()
                
    def stop(self):
        """Stop consuming and close connection."""
        self.should_stop = True
        if self.channel:
            self.channel.stop_consuming()
        if self.connection:
            self.connection.close()
        logger.info("Notification consumer stopped")

# =============================================================================
# HEALTH CHECK SERVER
# =============================================================================

def run_health_server():
    """Simple TCP health check server."""
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', 5006))
    server.listen(1)
    
    logger.info("Health check server started on port 5006")
    
    while True:
        try:
            client, addr = server.accept()
            client.send(b'OK')
            client.close()
        except:
            pass

# =============================================================================
# MAIN
# =============================================================================

if __name__ == '__main__':
    logger.info("Starting Notification Service")
    
    # Start health check server in background
    health_thread = threading.Thread(target=run_health_server, daemon=True)
    health_thread.start()
    
    # Wait for RabbitMQ to be ready
    time.sleep(10)
    
    # Start message consumer
    consumer = NotificationConsumer()
    
    while True:
        try:
            consumer.connect()
            consumer.start_consuming()
        except Exception as e:
            logger.error("Consumer crashed, restarting...", error=str(e))
            time.sleep(5)
