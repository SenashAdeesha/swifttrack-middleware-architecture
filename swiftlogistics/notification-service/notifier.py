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
                INSERT INTO notifications (user_id, type, title, message, is_read)
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
                INSERT INTO notifications (user_id, type, title, message, is_read)
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
            INSERT INTO notifications (user_id, type, title, message, is_read, data)
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
                f"Order Update",
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
        
        if notification_type == 'order_status_change':
            notify_order_status_change(order_id, status, message)
            
        elif notification_type == 'driver_assigned':
            notify_driver_assignment(order_id, driver_id)
            
        elif notification_type == 'package_received':
            notify_order_status_change(order_id, 'in_warehouse', message)
            
        elif notification_type == 'delivery_completed':
            notify_order_status_change(order_id, 'delivered', 
                                      'Your package has been delivered!')
            
        elif notification_type == 'custom':
            if user_id:
                send_push_notification(user_id, data.get('title', 'Notification'), message)
                
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
        
        # Declare fanout exchange
        self.channel.exchange_declare(
            exchange='swifttrack.notifications',
            exchange_type='fanout',
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
        
        # Bind to fanout exchange (no routing key needed)
        self.channel.queue_bind('notification.email', 'swifttrack.notifications', '')
        
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
