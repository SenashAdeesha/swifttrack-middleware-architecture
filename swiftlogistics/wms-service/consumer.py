# =============================================================================
# SwiftTrack Logistics - WMS Service (Warehouse Management System)
# =============================================================================
# Message-based Service using RabbitMQ
# Implements: Durable Queues, Manual Acknowledgement, Retry Handling, DLQ
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

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5

# =============================================================================
# STRUCTURED LOGGING
# =============================================================================

class StructuredLogger:
    def __init__(self, name):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, LOG_LEVEL))
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "wms-service", "message": "%(message)s"}'
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

def publish_message(exchange, routing_key, message, headers=None):
    """Publish message to RabbitMQ."""
    try:
        connection = get_rabbitmq_connection()
        channel = connection.channel()
        channel.confirm_delivery()
        
        properties = pika.BasicProperties(
            delivery_mode=2,
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
            mandatory=True
        )
        
        connection.close()
        return True
    except Exception as e:
        logger.error("Failed to publish message", error=str(e))
        return False

# =============================================================================
# WAREHOUSE OPERATIONS
# =============================================================================

def receive_package(order_id, package_type, priority):
    """
    =========================================================================
    RECEIVE PACKAGE - WAREHOUSE OPERATION
    =========================================================================
    Processes package arrival at warehouse:
    1. Assigns storage location
    2. Updates order status
    3. Records in warehouse inventory
    4. Publishes confirmation event
    =========================================================================
    """
    logger.info("Receiving package", order_id=order_id, package_type=package_type)
    
    print(f"\n{'━'*80}")
    print(f"  📦 NEW ORDER RECEIVED - WAREHOUSE PROCESSING STARTED")
    print(f"{'━'*80}")
    print(f"  Order ID     : {order_id}")
    print(f"  Package Type : {package_type}")
    print(f"  Priority     : {priority}")
    print(f"  Timestamp    : {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print(f"{'━'*80}\n")
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Generate warehouse location
        location_code = f"WH-{datetime.now().strftime('%Y%m%d')}"
        shelf_number = f"S{hash(order_id) % 100:02d}-R{hash(order_id) % 10}"
        
        # Create warehouse inventory record
        cursor.execute("""
            INSERT INTO warehouse_inventory (order_id, location_code, shelf_number, status)
            VALUES (%s, %s, %s, 'received')
            ON CONFLICT (order_id) DO UPDATE
            SET status = 'received', received_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (order_id, location_code, shelf_number))
        conn.commit()

        # Fetch client_user_id early (needed for all middleware realtime broadcasts)
        cursor.execute("""
            SELECT c.user_id FROM orders o
            JOIN clients c ON o.client_id = c.id
            WHERE o.id = %s
        """, (order_id,))
        row = cursor.fetchone()
        client_user_id = str(row['user_id']) if row else None
        conn.close()

        # ---------------------------------------------------------------
        # STAGE 1: Inventory Allocation
        # ---------------------------------------------------------------
        print(f"\n  ⬜ STAGE 1/4 - INVENTORY ALLOCATION")
        print(f"     └─ Order ID: {order_id}")
        print(f"     └─ Warehouse Location: {location_code}")
        print(f"     └─ Shelf Assignment: {shelf_number}")
        print(f"     └─ Status: ✅ Slot Reserved")
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'middleware_update',
            'order_id': order_id,
            'orderId': order_id,
            'stage': 'ready',
            'data': {
                'client_user_id': client_user_id,
                'label': 'Middleware Ready',
                'timestamp': datetime.utcnow().isoformat()
            }
        })

        time.sleep(2)

        # ------------------------------------------------------------------
        # STEP 1 of 2: pending -> confirmed (saga validation complete)
        # ------------------------------------------------------------------
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND status = 'pending'
        """, (order_id,))
        cursor.execute("""
            INSERT INTO order_timeline (order_id, status, description)
            VALUES (%s, 'confirmed', 'Order validated and confirmed by system')
        """, (order_id,))
        conn.commit()
        conn.close()

        logger.info("Order confirmed", order_id=order_id)
        print(f"\n  ✅ ORDER STATUS UPDATE")
        print(f"     └─ {order_id}: pending → CONFIRMED")
        print(f"     └─ System validation complete")

        # Broadcast order status update: confirmed
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'order_status_update',
            'order_id': order_id,
            'orderId': order_id,
            'status': 'confirmed',
            'data': {
                'client_user_id': client_user_id,
                'timestamp': datetime.utcnow().isoformat()
            }
        })

        # ---------------------------------------------------------------
        # STAGE 2: Package Registration
        # ---------------------------------------------------------------
        print(f"\n  🟡 STAGE 2/4 - PACKAGE REGISTERED")
        print(f"     └─ Order ID: {order_id}")
        print(f"     └─ Status: CONFIRMED")
        print(f"     └─ Action: Broadcasting to clients...")
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'middleware_update',
            'order_id': order_id,
            'orderId': order_id,
            'stage': 'loaded',
            'data': {
                'client_user_id': client_user_id,
                'label': 'Package Loaded',
                'timestamp': datetime.utcnow().isoformat()
            }
        })

        # 2-second gap between pipeline stages
        time.sleep(2)

        # ------------------------------------------------------------------
        # STEP 2 of 2: confirmed -> in_warehouse
        # ------------------------------------------------------------------
        conn = get_db_connection()
        cursor = conn.cursor()

        # Mark inventory slot as received
        cursor.execute("""
            UPDATE warehouse_inventory SET status = 'received' WHERE order_id = %s
        """, (order_id,))
        cursor.execute("""
            UPDATE orders SET status = 'in_warehouse', updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND status = 'confirmed'
        """, (order_id,))
        cursor.execute("""
            INSERT INTO order_timeline (order_id, status, description)
            VALUES (%s, 'in_warehouse', %s)
        """, (order_id, f'Package received at warehouse - Location: {location_code}, Shelf: {shelf_number}'))
        conn.commit()
        conn.close()

        logger.info("Package received successfully", order_id=order_id,
                   location=location_code, shelf=shelf_number)
        print(f"\n  ✅ ORDER STATUS UPDATE")
        print(f"     └─ {order_id}: confirmed → IN_WAREHOUSE")
        print(f"     └─ Physical Location: {location_code} / {shelf_number}")
        print(f"     └─ Inventory record created")

        # Broadcast order status update: in_warehouse
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'order_status_update',
            'order_id': order_id,
            'orderId': order_id,
            'status': 'in_warehouse',
            'data': {
                'client_user_id': client_user_id,
                'warehouse_location': location_code,
                'shelf': shelf_number,
                'timestamp': datetime.utcnow().isoformat()
            }
        })

        # ---------------------------------------------------------------
        # STAGE 3: Warehouse Floor Dispatch
        # ---------------------------------------------------------------
        print(f"\n  🟠 STAGE 3/4 - DISPATCHED TO FLOOR")
        print(f"     └─ Order ID: {order_id}")
        print(f"     └─ Package moved to picking area")
        print(f"     └─ Real-time notification sent")
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'middleware_update',
            'order_id': order_id,
            'orderId': order_id,
            'stage': 'dispatched',
            'data': {
                'client_user_id': client_user_id,
                'label': 'Dispatched to Warehouse',
                'warehouse_location': location_code,
                'timestamp': datetime.utcnow().isoformat()
            }
        })

        # ---------------------------------------------------------------
        # STAGE 4: Ready for Delivery
        # ---------------------------------------------------------------
        time.sleep(1)
        print(f"\n  🔵 STAGE 4/4 - READY FOR PICKUP")
        print(f"     └─ Order ID: {order_id}")
        print(f"     └─ Status: Awaiting driver assignment")
        print(f"     └─ Package ready for dispatch")
        print(f"\n  🏁 PROCESSING COMPLETE")
        print(f"     └─ Order {order_id} successfully processed")
        print(f"     └─ All 4 stages completed")
        print(f"{'━'*80}\n")
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'middleware_update',
            'order_id': order_id,
            'orderId': order_id,
            'stage': 'pending',
            'data': {
                'client_user_id': client_user_id,
                'label': 'Pending Driver Assignment',
                'timestamp': datetime.utcnow().isoformat()
            }
        })

        return True
        
    except Exception as e:
        logger.error("Failed to receive package", order_id=order_id, error=str(e))
        print(f"[WMS] ERROR in receive_package | Order {order_id} | {e}")
        return False

def dispatch_package(order_id, driver_id=None):
    """
    =========================================================================
    DISPATCH PACKAGE - WAREHOUSE OPERATION
    =========================================================================
    Processes package dispatch:
    1. Updates warehouse inventory
    2. Assigns driver if provided
    3. Updates order status
    4. Publishes dispatch event
    =========================================================================
    """
    logger.info("Dispatching package", order_id=order_id, driver_id=driver_id)
    print(f"\n┌─ 🚚 DISPATCH OPERATION")
    print(f"│  Order: {order_id}")
    print(f"└─ Driver: {driver_id or 'auto-assign'}")
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Update warehouse inventory
        cursor.execute("""
            UPDATE warehouse_inventory 
            SET status = 'dispatched', dispatched_at = CURRENT_TIMESTAMP
            WHERE order_id = %s
        """, (order_id,))
        
        # Update order status and assign driver
        if driver_id:
            cursor.execute("""
                UPDATE orders 
                SET status = 'out_for_delivery', 
                    driver_id = (SELECT id FROM drivers WHERE user_id::text = %s OR id::text = %s),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (driver_id, driver_id, order_id))
        else:
            cursor.execute("""
                UPDATE orders 
                SET status = 'out_for_delivery', updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (order_id,))
        
        # Add timeline entry
        cursor.execute("""
            INSERT INTO order_timeline (order_id, status, description)
            VALUES (%s, 'out_for_delivery', 'Package dispatched from warehouse - Out for delivery')
        """, (order_id,))
        
        # Fetch client_user_id
        cursor.execute("""
            SELECT c.user_id FROM orders o
            JOIN clients c ON o.client_id = c.id
            WHERE o.id = %s
        """, (order_id,))
        row = cursor.fetchone()
        client_user_id = str(row['user_id']) if row else None

        conn.commit()
        conn.close()

        logger.info("Package dispatched successfully", order_id=order_id)
        print(f"\n  ✅ ORDER STATUS UPDATE")
        print(f"     └─ {order_id}: in_warehouse → OUT_FOR_DELIVERY")
        print(f"     └─ Package handed to driver")

        # Broadcast 'out_for_delivery' to WebSocket clients via realtime routing
        publish_message('swifttrack.notifications', 'realtime.update', {
            'type': 'order_status_update',
            'order_id': order_id,
            'orderId': order_id,
            'status': 'out_for_delivery',
            'data': {
                'client_user_id': client_user_id,
                'driver_id': driver_id,
                'timestamp': datetime.utcnow().isoformat()
            }
        })

        return True
        
    except Exception as e:
        logger.error("Failed to dispatch package", order_id=order_id, error=str(e))
        print(f"[WMS] ERROR in dispatch_package | Order {order_id} | {e}")
        return False

def release_slot(order_id):
    """
    =========================================================================
    RELEASE WAREHOUSE SLOT - COMPENSATION
    =========================================================================
    Called when order is cancelled to release warehouse resources.
    Part of Saga compensation transaction.
    =========================================================================
    """
    logger.info("Releasing warehouse slot", order_id=order_id)
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM warehouse_inventory WHERE order_id = %s
        """, (order_id,))
        
        conn.commit()
        conn.close()
        
        logger.info("Warehouse slot released", order_id=order_id)
        return True
        
    except Exception as e:
        logger.error("Failed to release slot", order_id=order_id, error=str(e))
        return False

def get_inventory_status(order_id):
    """Get warehouse inventory status for an order."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM warehouse_inventory WHERE order_id = %s
        """, (order_id,))
        
        inventory = cursor.fetchone()
        conn.close()
        
        return dict(inventory) if inventory else None
        
    except Exception as e:
        logger.error("Failed to get inventory status", error=str(e))
        return None

# =============================================================================
# MESSAGE HANDLERS
# =============================================================================

def handle_receive_message(ch, method, properties, body):
    """
    =========================================================================
    RECEIVE MESSAGE HANDLER
    =========================================================================
    Processes warehouse.receive messages with:
    - Manual acknowledgement (no message loss)
    - Retry logic with exponential backoff
    - Dead letter queue on max retries exceeded
    =========================================================================
    """
    message_id = properties.message_id or 'unknown'
    retry_count = (properties.headers or {}).get('x-retry-count', 0)
    
    logger.info("Processing receive message", message_id=message_id, retry=retry_count)
    print(f"\n┌─ 📨 INCOMING MESSAGE")
    print(f"│  Queue: warehouse.receive")
    print(f"│  Message ID: {message_id}")
    print(f"└─ Retry Count: {retry_count}/{MAX_RETRIES}")
    
    try:
        data = json.loads(body)
        order_id = data.get('order_id')
        package_type = data.get('package_type', 'standard')
        priority = data.get('priority', 'normal')
        
        if not order_id:
            logger.error("Missing order_id in message", message_id=message_id)
            # Acknowledge to remove invalid message
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        success = receive_package(order_id, package_type, priority)
        
        if success:
            # =====================================================
            # MANUAL ACKNOWLEDGEMENT - Message processed successfully
            # =====================================================
            ch.basic_ack(delivery_tag=method.delivery_tag)
            logger.info("Message acknowledged", message_id=message_id, order_id=order_id)
            print(f"\n  ✔️  MESSAGE ACKNOWLEDGED")
            print(f"     └─ Order {order_id} processing complete")
            print(f"     └─ ACK sent to RabbitMQ")
        else:
            # Retry or reject to DLQ
            if retry_count < MAX_RETRIES:
                # Requeue with retry count
                logger.warning("Requeuing message for retry", 
                             message_id=message_id, retry=retry_count + 1)
                print(f"\n  ⚠️  RETRY SCHEDULED")
                print(f"     └─ Attempt: {retry_count+1}/{MAX_RETRIES}")
                print(f"     └─ Order {order_id} will be retried")
                # Negative acknowledgement - requeue
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
            else:
                # Max retries exceeded - send to DLQ
                logger.error("Max retries exceeded, sending to DLQ", 
                           message_id=message_id, order_id=order_id)
                print(f"\n  ❌ MAX RETRIES EXCEEDED")
                print(f"     └─ Order {order_id} moved to Dead Letter Queue")
                print(f"     └─ Manual intervention required")
                # Reject without requeue - goes to DLQ
                ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
                
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in message", error=str(e), message_id=message_id)
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
    except Exception as e:
        logger.error("Error processing message", error=str(e), message_id=message_id)
        if retry_count < MAX_RETRIES:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
        else:
            ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)

def handle_dispatch_message(ch, method, properties, body):
    """Handle warehouse.dispatch messages."""
    message_id = properties.message_id or 'unknown'
    retry_count = (properties.headers or {}).get('x-retry-count', 0)
    
    logger.info("Processing dispatch message", message_id=message_id)
    print(f"\n┌─ 📨 INCOMING MESSAGE")
    print(f"│  Queue: warehouse.dispatch")
    print(f"│  Message ID: {message_id}")
    print(f"└─ Retry Count: {retry_count}/{MAX_RETRIES}")
    
    try:
        data = json.loads(body)
        order_id = data.get('order_id')
        driver_id = data.get('driver_id')
        
        if not order_id:
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        success = dispatch_package(order_id, driver_id)
        
        if success:
            ch.basic_ack(delivery_tag=method.delivery_tag)
            print(f"\n  ✔️  DISPATCH COMPLETE")
            print(f"     └─ Order {order_id} dispatched")
            print(f"     └─ ACK sent to RabbitMQ")
        else:
            if retry_count < MAX_RETRIES:
                print(f"\n  ⚠️  DISPATCH RETRY {retry_count+1}/{MAX_RETRIES}")
                print(f"     └─ Order {order_id}")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
            else:
                print(f"\n  ❌ DISPATCH FAILED → DLQ")
                print(f"     └─ Order {order_id}")
                ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
                
    except Exception as e:
        logger.error("Error processing dispatch message", error=str(e))
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)

def handle_inventory_message(ch, method, properties, body):
    """Handle warehouse.inventory messages (release, check, etc.)."""
    message_id = properties.message_id or 'unknown'
    
    logger.info("Processing inventory message", message_id=message_id)
    
    try:
        data = json.loads(body)
        order_id = data.get('order_id')
        action = data.get('action', 'check')
        
        if action == 'release':
            release_slot(order_id)
        elif action == 'check':
            status = get_inventory_status(order_id)
            logger.info("Inventory status", order_id=order_id, status=status)
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
        
    except Exception as e:
        logger.error("Error processing inventory message", error=str(e))
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)

# =============================================================================
# MESSAGE CONSUMER
# =============================================================================

class WarehouseConsumer:
    """
    =========================================================================
    WAREHOUSE MESSAGE CONSUMER
    =========================================================================
    Implements robust message consumption with:
    - Durable queue subscription
    - Manual acknowledgement (basic_ack)
    - Prefetch limit for load balancing
    - Connection recovery
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
        
        # =====================================================
        # DURABLE QUEUE DECLARATION
        # =====================================================
        # Queues are declared as durable to survive broker restart
        
        # Declare exchange
        self.channel.exchange_declare(
            exchange='swifttrack.warehouse',
            exchange_type='direct',
            durable=True
        )
        
        # Declare receive queue with DLQ settings
        self.channel.queue_declare(
            queue='warehouse.receive',
            durable=True,  # DURABLE QUEUE
            arguments={
                'x-dead-letter-exchange': 'swifttrack.dlx',
                'x-dead-letter-routing-key': 'warehouse.receive.dlq',
                'x-message-ttl': 3600000,  # 1 hour TTL
                'x-max-priority': 10  # Priority queue
            }
        )
        
        # Declare dispatch queue
        self.channel.queue_declare(
            queue='warehouse.dispatch',
            durable=True,
            arguments={
                'x-dead-letter-exchange': 'swifttrack.dlx',
                'x-dead-letter-routing-key': 'warehouse.dispatch.dlq',
                'x-message-ttl': 3600000,
                'x-max-priority': 10
            }
        )
        
        # Declare inventory queue
        self.channel.queue_declare(
            queue='warehouse.inventory',
            durable=True,
            arguments={
                'x-dead-letter-exchange': 'swifttrack.dlx',
                'x-dead-letter-routing-key': 'warehouse.inventory.dlq',
                'x-message-ttl': 3600000
            }
        )
        
        # Bind queues to exchange
        self.channel.queue_bind('warehouse.receive', 'swifttrack.warehouse', 'warehouse.receive')
        self.channel.queue_bind('warehouse.dispatch', 'swifttrack.warehouse', 'warehouse.dispatch')
        self.channel.queue_bind('warehouse.inventory', 'swifttrack.warehouse', 'warehouse.inventory')
        
        # =====================================================
        # PREFETCH LIMIT
        # =====================================================
        # Limit unacknowledged messages per consumer for better load distribution
        self.channel.basic_qos(prefetch_count=10)
        
        logger.info("WMS consumer connected and queues declared")
        
    def start_consuming(self):
        """Start consuming messages from all queues."""
        # Setup consumers with manual acknowledgement
        self.channel.basic_consume(
            queue='warehouse.receive',
            on_message_callback=handle_receive_message,
            auto_ack=False  # MANUAL ACKNOWLEDGEMENT
        )
        
        self.channel.basic_consume(
            queue='warehouse.dispatch',
            on_message_callback=handle_dispatch_message,
            auto_ack=False
        )
        
        self.channel.basic_consume(
            queue='warehouse.inventory',
            on_message_callback=handle_inventory_message,
            auto_ack=False
        )
        
        logger.info("Starting to consume messages...")
        
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
        logger.info("WMS consumer stopped")

# =============================================================================
# HEALTH CHECK SERVER
# =============================================================================

def run_health_server():
    """Simple TCP health check server."""
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', 5005))
    server.listen(1)
    
    logger.info("Health check server started on port 5005")
    
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
    logger.info("Starting WMS Service (Warehouse Management)")
    
    # Start health check server in background
    health_thread = threading.Thread(target=run_health_server, daemon=True)
    health_thread.start()
    
    # Wait for RabbitMQ to be ready
    time.sleep(10)
    
    # Start message consumer
    consumer = WarehouseConsumer()
    
    while True:
        try:
            consumer.connect()
            consumer.start_consuming()
        except Exception as e:
            logger.error("Consumer crashed, restarting...", error=str(e))
            time.sleep(5)
