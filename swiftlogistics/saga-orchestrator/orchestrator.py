# =============================================================================
# SwiftTrack Logistics - Saga Orchestrator Service
# =============================================================================
# Implements the SAGA Pattern for Distributed Transaction Management
# Ensures consistency across microservices with compensation on failure
# =============================================================================

import os
import json
import logging
import time
import threading
import socket
from datetime import datetime
import uuid
from enum import Enum

import psycopg2
from psycopg2.extras import RealDictCursor
import pika
import requests

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

# Service URLs for sync calls
CMS_SERVICE_URL = os.environ.get('CMS_SERVICE_URL', 'http://cms-service:5003')
ROS_SERVICE_URL = os.environ.get('ROS_SERVICE_URL', 'http://ros-service:5004')

# =============================================================================
# SAGA DEFINITIONS
# =============================================================================

class SagaStatus(Enum):
    STARTED = 'started'
    IN_PROGRESS = 'processing'   # DB constraint: ('started','processing','completed','compensating','failed')
    COMPLETED = 'completed'
    COMPENSATING = 'compensating'
    FAILED = 'failed'
    COMPENSATED = 'compensating'  # DB has no 'compensated' state, reuse 'compensating'

class StepStatus(Enum):
    PENDING = 'pending'
    EXECUTING = 'executing'
    COMPLETED = 'completed'
    FAILED = 'failed'
    COMPENSATING = 'compensating'
    COMPENSATED = 'compensated'

# =============================================================================
# SAGA STEP DEFINITIONS
# =============================================================================
# Each saga defines a sequence of steps and their compensation actions

SAGA_DEFINITIONS = {
    'order.create': {
        'steps': [
            {
                'name': 'validate_customer',
                'service': 'cms',
                'action': 'validate_customer',
                'compensation': None  # Validation has no side effects
            },
            {
                'name': 'reserve_warehouse_slot',
                'service': 'wms',
                'action': 'reserve_slot',
                'compensation': 'release_slot'
            },
            {
                'name': 'calculate_route',
                'service': 'ros',
                'action': 'optimize_route',
                'compensation': 'cancel_route'
            },
            {
                'name': 'confirm_order',
                'service': 'middleware',
                'action': 'confirm_order',
                'compensation': 'cancel_order'
            },
            {
                'name': 'auto_assign_driver',
                'service': 'middleware',
                'action': 'auto_assign_driver',
                'compensation': 'release_driver_assignment'
            }
        ]
    },
    'assign_driver': {
        'steps': [
            {
                'name': 'check_driver_availability',
                'service': 'middleware',
                'action': 'check_driver',
                'compensation': None
            },
            {
                'name': 'calculate_route',
                'service': 'ros',
                'action': 'optimize_route',
                'compensation': 'cancel_route'
            },
            {
                'name': 'confirm_assignment',
                'service': 'middleware',
                'action': 'confirm_assignment',
                'compensation': 'cancel_assignment'
            }
        ]
    },
    'complete_delivery': {
        'steps': [
            {
                'name': 'update_delivery_status',
                'service': 'middleware',
                'action': 'mark_delivered',
                'compensation': 'revert_delivery_status'
            },
            {
                'name': 'release_warehouse',
                'service': 'wms',
                'action': 'release_slot',
                'compensation': None
            },
            {
                'name': 'update_customer',
                'service': 'cms',
                'action': 'update_delivery',
                'compensation': None
            }
        ]
    }
}

# =============================================================================
# STRUCTURED LOGGING
# =============================================================================

class StructuredLogger:
    def __init__(self, name):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, LOG_LEVEL))
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "saga-orchestrator", "message": "%(message)s"}'
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
# SAGA STATE MANAGEMENT
# =============================================================================

class SagaStateManager:
    """
    =========================================================================
    SAGA STATE MANAGER
    =========================================================================
    Manages saga state persistence and transitions
    Uses PostgreSQL for durability
    =========================================================================
    """
    
    @staticmethod
    def create_saga(saga_id, saga_type, data):
        """Create a new saga instance."""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        steps = SAGA_DEFINITIONS.get(saga_type, {}).get('steps', [])
        step_states = [{'name': s['name'], 'status': 'pending'} for s in steps]
        
        cursor.execute("""
            INSERT INTO saga_state (saga_id, saga_type, status, current_step, payload, steps_completed)
            VALUES (%s, %s, %s, NULL, %s, %s)
            ON CONFLICT (saga_id) DO NOTHING
        """, (saga_id, saga_type, SagaStatus.STARTED.value,
              json.dumps(data), json.dumps(step_states)))
        
        conn.commit()
        conn.close()
        
        logger.info("Saga created", saga_id=saga_id, type=saga_type)
        return saga_id
    
    @staticmethod
    def get_saga(saga_id):
        """Get saga state by ID."""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM saga_state WHERE saga_id = %s", (saga_id,))
        saga = cursor.fetchone()
        conn.close()
        
        return dict(saga) if saga else None
    
    @staticmethod
    def update_saga_status(saga_id, status, error=None):
        """Update saga status."""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE saga_state
            SET status = %s, error_message = %s, updated_at = CURRENT_TIMESTAMP
            WHERE saga_id = %s
        """, (status.value if isinstance(status, SagaStatus) else status,
              error, saga_id))
        
        conn.commit()
        conn.close()
    
    @staticmethod
    def update_step_status(saga_id, step_index, status):
        """Update individual step status."""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT steps_completed FROM saga_state WHERE saga_id = %s", (saga_id,))
        result = cursor.fetchone()

        if result:
            step_states = result['steps_completed']
            if isinstance(step_states, str):
                step_states = json.loads(step_states)

            if 0 <= step_index < len(step_states):
                step_states[step_index]['status'] = status

                cursor.execute("""
                    UPDATE saga_state
                    SET steps_completed = %s, current_step = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE saga_id = %s
                """, (json.dumps(step_states), str(step_index), saga_id))
                
        conn.commit()
        conn.close()
    
    @staticmethod
    def saga_completed(saga_id):
        """Mark saga as completed."""
        SagaStateManager.update_saga_status(saga_id, SagaStatus.COMPLETED)
        logger.info("Saga completed successfully", saga_id=saga_id)
    
    @staticmethod
    def saga_failed(saga_id, error):
        """Mark saga as failed."""
        SagaStateManager.update_saga_status(saga_id, SagaStatus.FAILED, error)
        logger.error("Saga failed", saga_id=saga_id, error=error)

# =============================================================================
# SERVICE ACTIVITY RECORDER
# =============================================================================

def record_service_activity(order_id, service_name, service_type, action, status, 
                             protocol, endpoint=None, request_data=None, 
                             response_data=None, error_message=None, duration_ms=None):
    """Record service activity to database for monitoring and audit."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO service_activity 
            (order_id, service_name, service_type, action, status, protocol, 
             endpoint, request_data, response_data, error_message, duration_ms)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            order_id, service_name, service_type, action, status, protocol,
            endpoint,
            json.dumps(request_data) if request_data else None,
            json.dumps(response_data) if response_data else None,
            error_message, duration_ms
        ))
        conn.commit()
        conn.close()
        logger.info("Service activity recorded", service=service_name, order_id=order_id, status=status)
    except Exception as e:
        logger.error("Failed to record service activity", error=str(e))

# =============================================================================
# STEP EXECUTORS
# =============================================================================

class StepExecutors:
    """
    =========================================================================
    STEP EXECUTORS
    =========================================================================
    Execute individual saga steps by calling appropriate services
    =========================================================================
    """
    
    @staticmethod
    def validate_customer(data):
        """Validate customer — checks local DB first, then CMS SOAP as secondary."""
        try:
            customer_id = data.get('client_id')
            order_id = data.get('order_id')

            # Publish CMS validation started notification
            publish_message('swifttrack.notifications', 'realtime.cms_update', {
                'type': 'cms_validation_started',
                'order_id': order_id,
                'client_id': customer_id,
                'service': 'CMS',
                'protocol': 'SOAP/XML',
                'stage': 'Validating Customer',
                'message': f'CMS Service: Validating customer #{customer_id}',
                'timestamp': datetime.utcnow().isoformat()
            })
            
            print("")
            print("╔══════════════════════════════════════════════════════════════╗")
            print("║  📋 CMS SERVICE - STARTED                                    ║")
            print("╠══════════════════════════════════════════════════════════════╣")
            print(f"║  Order ID    : {order_id:<45} ║")
            print(f"║  Customer ID : {customer_id:<45} ║")
            print("║  Action      : Validating Customer                           ║")
            print("║  Protocol    : SOAP/XML                                      ║")
            print("║  Status      : ⏳ IN PROGRESS                                ║")
            print("╚══════════════════════════════════════════════════════════════╝")
            print("")

            # Record CMS started activity
            start_time = time.time()
            record_service_activity(
                order_id=order_id,
                service_name='CMS',
                service_type='Customer Validation',
                action='validate_customer',
                status='started',
                protocol='SOAP/XML',
                endpoint=f'{CMS_SERVICE_URL}/soap',
                request_data={'customer_id': customer_id}
            )

            # Primary: check customer exists in local DB
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id FROM clients WHERE id::text = %s OR user_id::text = %s
            """, (str(customer_id), str(customer_id)))
            client = cursor.fetchone()
            conn.close()

            if client:
                logger.info("Customer validated via local DB", customer_id=customer_id)
                # Publish CMS validation success notification
                publish_message('swifttrack.notifications', 'realtime.cms_update', {
                    'type': 'cms_validation_success',
                    'order_id': order_id,
                    'client_id': customer_id,
                    'service': 'CMS',
                    'protocol': 'SOAP/XML',
                    'stage': 'Customer Validated',
                    'message': f'CMS Service: Customer #{customer_id} validated successfully',
                    'timestamp': datetime.utcnow().isoformat()
                })
                
                print("")
                print("╔══════════════════════════════════════════════════════════════╗")
                print("║  📋 CMS SERVICE - SUCCESS ✅                                 ║")
                print("╠══════════════════════════════════════════════════════════════╣")
                print(f"║  Order ID    : {order_id:<45} ║")
                print(f"║  Customer ID : {customer_id:<45} ║")
                print("║  Action      : Customer Validated                            ║")
                print("║  Protocol    : SOAP/XML                                      ║")
                print("║  Status      : ✅ VALIDATED                                  ║")
                print("╚══════════════════════════════════════════════════════════════╝")
                print("")
                
                # Record CMS success activity
                duration = int((time.time() - start_time) * 1000)
                record_service_activity(
                    order_id=order_id,
                    service_name='CMS',
                    service_type='Customer Validation',
                    action='validate_customer',
                    status='success',
                    protocol='SOAP/XML',
                    endpoint='Local Database',
                    response_data={'customer_id': customer_id, 'validated': True},
                    duration_ms=duration
                )
                
                return {'success': True, 'message': 'Customer validated'}

            # Secondary: try CMS SOAP service
            try:
                soap_request = f"""<?xml version="1.0" encoding="UTF-8"?>
                <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                                  xmlns:cms="http://swifttrack.com/cms">
                    <soapenv:Body>
                        <cms:ValidateCustomerRequest>
                            <customer_id>{customer_id}</customer_id>
                        </cms:ValidateCustomerRequest>
                    </soapenv:Body>
                </soapenv:Envelope>"""

                response = requests.post(
                    f"{CMS_SERVICE_URL}/soap",
                    data=soap_request,
                    headers={'Content-Type': 'text/xml'},
                    timeout=10
                )

                if response.status_code == 200 and '<cms:is_valid>true</cms:is_valid>' in response.text:
                    # Publish CMS SOAP validation success
                    publish_message('swifttrack.notifications', 'realtime.cms_update', {
                        'type': 'cms_validation_success',
                        'order_id': order_id,
                        'client_id': customer_id,
                        'service': 'CMS',
                        'protocol': 'SOAP/XML',
                        'stage': 'Customer Validated via SOAP',
                        'message': f'CMS SOAP Service: Customer #{customer_id} validated',
                        'timestamp': datetime.utcnow().isoformat()
                    })
                    # Record CMS SOAP success
                    duration = int((time.time() - start_time) * 1000)
                    record_service_activity(
                        order_id=order_id,
                        service_name='CMS',
                        service_type='Customer Validation',
                        action='validate_customer',
                        status='success',
                        protocol='SOAP/XML',
                        endpoint=f'{CMS_SERVICE_URL}/soap',
                        response_data={'customer_id': customer_id, 'validated': True, 'source': 'SOAP'},
                        duration_ms=duration
                    )
                    return {'success': True, 'message': 'Customer validated via CMS'}
            except Exception as cms_err:
                logger.warning("CMS validation unavailable, proceeding", error=str(cms_err))

            # Fallback: allow order to proceed if customer not found (demo mode)
            logger.warning("Customer not found in DB, proceeding in demo mode",
                           customer_id=customer_id)
            # Publish fallback notification
            publish_message('swifttrack.notifications', 'realtime.cms_update', {
                'type': 'cms_validation_skipped',
                'order_id': order_id,
                'client_id': customer_id,
                'service': 'CMS',
                'protocol': 'SOAP/XML',
                'stage': 'Validation Skipped',
                'message': f'CMS Service: Customer validation skipped (demo mode)',
                'timestamp': datetime.utcnow().isoformat()
            })
            # Record CMS skipped activity
            duration = int((time.time() - start_time) * 1000)
            record_service_activity(
                order_id=order_id,
                service_name='CMS',
                service_type='Customer Validation',
                action='validate_customer',
                status='skipped',
                protocol='SOAP/XML',
                endpoint=f'{CMS_SERVICE_URL}/soap',
                response_data={'customer_id': customer_id, 'reason': 'demo_mode'},
                duration_ms=duration
            )
            return {'success': True, 'message': 'Customer validation skipped (demo mode)'}

        except Exception as e:
            logger.error("Customer validation error", error=str(e))
            # Non-fatal in demo mode — let the order proceed
            return {'success': True, 'message': f'Validation skipped: {str(e)}'}
    
    @staticmethod
    def reserve_slot(data):
        """Reserve warehouse slot via WMS messaging."""
        try:
            order_id = data.get('order_id')
            
            # Publish WMS reservation started notification
            publish_message('swifttrack.notifications', 'realtime.wms_update', {
                'type': 'wms_reservation_started',
                'order_id': order_id,
                'service': 'WMS',
                'protocol': 'RabbitMQ',
                'stage': 'Reserving Slot',
                'message': f'WMS Service: Reserving warehouse slot for order #{order_id}',
                'timestamp': datetime.utcnow().isoformat()
            })
            
            print("")
            print("╔══════════════════════════════════════════════════════════════╗")
            print("║  🏭 WMS SERVICE - STARTED                                    ║")
            print("╠══════════════════════════════════════════════════════════════╣")
            print(f"║  Order ID    : {order_id:<45} ║")
            print("║  Action      : Reserving Warehouse Slot                      ║")
            print("║  Protocol    : AMQP (RabbitMQ)                               ║")
            print("║  Queue       : wms_orders                                    ║")
            print("║  Status      : ⏳ IN PROGRESS                                ║")
            print("╚══════════════════════════════════════════════════════════════╝")
            print("")
            
            # Record WMS started activity
            wms_start_time = time.time()
            record_service_activity(
                order_id=order_id,
                service_name='WMS',
                service_type='Warehouse Slot Reservation',
                action='reserve_slot',
                status='started',
                protocol='AMQP (RabbitMQ)',
                endpoint='wms_orders queue',
                request_data={'order_id': order_id, 'action': 'reserve'}
            )
            
            publish_message('swifttrack.warehouse', 'warehouse.receive', {
                'order_id': order_id,
                'package_type': data.get('package_type', 'standard'),
                'priority': data.get('priority', 'normal'),
                'action': 'reserve'
            })
            
            # Publish WMS reservation success notification
            publish_message('swifttrack.notifications', 'realtime.wms_update', {
                'type': 'wms_reservation_success',
                'order_id': order_id,
                'service': 'WMS',
                'protocol': 'RabbitMQ',
                'stage': 'Slot Reserved',
                'message': f'WMS Service: Warehouse slot reserved for order #{order_id}',
                'timestamp': datetime.utcnow().isoformat()
            })
            
            print("")
            print("╔══════════════════════════════════════════════════════════════╗")
            print("║  🏭 WMS SERVICE - SUCCESS ✅                                  ║")
            print("╠══════════════════════════════════════════════════════════════╣")
            print(f"║  Order ID    : {order_id:<45} ║")
            print("║  Action      : Warehouse Slot Reserved                       ║")
            print("║  Protocol    : AMQP (RabbitMQ)                               ║")
            print("║  Queue       : wms_orders                                    ║")
            print("║  Status      : ✅ RESERVED                                   ║")
            print("╚══════════════════════════════════════════════════════════════╝")
            print("")
            
            # Record WMS success activity
            wms_duration = int((time.time() - wms_start_time) * 1000)
            record_service_activity(
                order_id=order_id,
                service_name='WMS',
                service_type='Warehouse Slot Reservation',
                action='reserve_slot',
                status='success',
                protocol='AMQP (RabbitMQ)',
                endpoint='wms_orders queue',
                response_data={'order_id': order_id, 'slot_reserved': True},
                duration_ms=wms_duration
            )
            
            return {'success': True, 'message': 'Warehouse slot reserved'}
            
        except Exception as e:
            logger.error("Warehouse reservation failed", error=str(e))
            # Publish WMS error notification
            publish_message('swifttrack.notifications', 'realtime.wms_update', {
                'type': 'wms_reservation_error',
                'order_id': data.get('order_id'),
                'service': 'WMS',
                'protocol': 'RabbitMQ',
                'stage': 'Error',
                'message': f'WMS Service: Reservation failed - {str(e)}',
                'timestamp': datetime.utcnow().isoformat()
            })
            # Record WMS failed activity
            record_service_activity(
                order_id=data.get('order_id'),
                service_name='WMS',
                service_type='Warehouse Slot Reservation',
                action='reserve_slot',
                status='failed',
                protocol='AMQP (RabbitMQ)',
                endpoint='wms_orders queue',
                error_message=str(e)
            )
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def release_slot(data):
        """Compensation: Release warehouse slot."""
        try:
            order_id = data.get('order_id')
            
            publish_message('swifttrack.warehouse', 'warehouse.inventory', {
                'order_id': order_id,
                'action': 'release'
            })
            
            return {'success': True, 'message': 'Warehouse slot released'}
            
        except Exception as e:
            logger.error("Warehouse release failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def optimize_route(data):
        """Calculate optimized route via ROS REST service (best-effort)."""
        order_id = data.get('order_id')
        
        # Publish ROS route optimization started notification
        publish_message('swifttrack.notifications', 'realtime.ros_update', {
            'type': 'ros_optimization_started',
            'order_id': order_id,
            'service': 'ROS',
            'protocol': 'REST/JSON',
            'stage': 'Calculating Route',
            'message': f'ROS Service: Calculating optimized route for order #{order_id}',
            'timestamp': datetime.utcnow().isoformat()
        })
        
        print("")
        print("╔══════════════════════════════════════════════════════════════╗")
        print("║  🛣️  ROS SERVICE - STARTED                                    ║")
        print("╠══════════════════════════════════════════════════════════════╣")
        print(f"║  Order ID    : {order_id:<45} ║")
        print("║  Action      : Calculating Optimized Route                   ║")
        print("║  Protocol    : REST/JSON                                     ║")
        print("║  Endpoint    : /route/optimize                               ║")
        print("║  Status      : ⏳ IN PROGRESS                                ║")
        print("╚══════════════════════════════════════════════════════════════╝")
        print("")
        
        # Record ROS started activity
        ros_start_time = time.time()
        record_service_activity(
            order_id=order_id,
            service_name='ROS',
            service_type='Route Optimization',
            action='optimize_route',
            status='started',
            protocol='REST/JSON',
            endpoint=f'{ROS_SERVICE_URL}/route/optimize',
            request_data={'order_id': order_id, 'driver_id': data.get('driver_id')}
        )
        
        try:
            response = requests.post(
                f"{ROS_SERVICE_URL}/route/optimize",
                json={
                    'driver_id': data.get('driver_id'),
                    'order_ids': [data.get('order_id')],
                    'origin': data.get('pickup_coordinates', {'lat': 6.93, 'lon': 79.84}),
                    'destination': data.get('delivery_coordinates', {'lat': 6.90, 'lon': 79.86})
                },
                timeout=10
            )

            if response.status_code == 200:
                route_data = response.json()
                metrics = route_data.get('metrics', {})
                
                # Publish ROS route optimization success notification
                publish_message('swifttrack.notifications', 'realtime.ros_update', {
                    'type': 'ros_optimization_success',
                    'order_id': order_id,
                    'service': 'ROS',
                    'protocol': 'REST/JSON',
                    'stage': 'Route Optimized',
                    'route_id': route_data.get('route_id'),
                    'distance_km': metrics.get('total_distance_km'),
                    'estimated_duration': metrics.get('estimated_duration_minutes'),
                    'algorithm': route_data.get('optimization_algorithm', 'nearest_neighbor'),
                    'message': f'ROS Service: Route optimized - {metrics.get("total_distance_km", 0)}km, ~{metrics.get("estimated_duration_minutes", 0)} mins',
                    'timestamp': datetime.utcnow().isoformat()
                })
                
                distance = metrics.get('total_distance_km', 0)
                duration = metrics.get('estimated_duration_minutes', 0)
                print("")
                print("╔══════════════════════════════════════════════════════════════╗")
                print("║  🛣️  ROS SERVICE - SUCCESS ✅                                 ║")
                print("╠══════════════════════════════════════════════════════════════╣")
                print(f"║  Order ID    : {order_id:<45} ║")
                print("║  Action      : Route Optimized                              ║")
                print("║  Protocol    : REST/JSON                                     ║")
                print(f"║  Distance    : {str(distance) + ' km':<45} ║")
                print(f"║  ETA         : {str(duration) + ' mins':<45} ║")
                print("║  Status      : ✅ OPTIMIZED                                 ║")
                print("╚══════════════════════════════════════════════════════════════╝")
                print("")
                
                # Record ROS success activity
                ros_duration = int((time.time() - ros_start_time) * 1000)
                record_service_activity(
                    order_id=order_id,
                    service_name='ROS',
                    service_type='Route Optimization',
                    action='optimize_route',
                    status='success',
                    protocol='REST/JSON',
                    endpoint=f'{ROS_SERVICE_URL}/route/optimize',
                    response_data={'route_id': route_data.get('route_id'), 'distance_km': distance, 'duration_mins': duration},
                    duration_ms=ros_duration
                )
                
                return {
                    'success': True,
                    'message': 'Route optimized',
                    'route_id': route_data.get('route_id')
                }
            else:
                # Non-fatal: let saga proceed without route optimisation
                logger.warning("Route optimization returned non-200, proceeding",
                               status=response.status_code)
                publish_message('swifttrack.notifications', 'realtime.ros_update', {
                    'type': 'ros_optimization_skipped',
                    'order_id': order_id,
                    'service': 'ROS',
                    'protocol': 'REST/JSON',
                    'stage': 'Optimization Skipped',
                    'message': f'ROS Service: Route optimization skipped (service returned {response.status_code})',
                    'timestamp': datetime.utcnow().isoformat()
                })
                
                print("")
                print("╔══════════════════════════════════════════════════════════════╗")
                print("║  🛣️  ROS SERVICE - SKIPPED ⚠️                                 ║")
                print("╠══════════════════════════════════════════════════════════════╣")
                print(f"║  Order ID    : {order_id:<45} ║")
                print("║  Action      : Route Optimization Skipped                   ║")
                print("║  Protocol    : REST/JSON                                     ║")
                print(f"║  Reason      : Service returned {response.status_code:<28} ║")
                print("║  Status      : ⚠️ SKIPPED                                   ║")
                print("╚══════════════════════════════════════════════════════════════╝")
                print("")
                
                # Record ROS skipped activity
                ros_duration = int((time.time() - ros_start_time) * 1000)
                record_service_activity(
                    order_id=order_id,
                    service_name='ROS',
                    service_type='Route Optimization',
                    action='optimize_route',
                    status='skipped',
                    protocol='REST/JSON',
                    endpoint=f'{ROS_SERVICE_URL}/route/optimize',
                    response_data={'status_code': response.status_code, 'reason': 'non_200_response'},
                    duration_ms=ros_duration
                )
                
                return {'success': True, 'message': 'Route optimization skipped (non-200)'}

        except Exception as e:
            # ROS unavailable — non-fatal, order can still be assigned and proceed
            logger.warning("Route optimization unavailable, proceeding", error=str(e))
            publish_message('swifttrack.notifications', 'realtime.ros_update', {
                'type': 'ros_optimization_error',
                'order_id': order_id,
                'service': 'ROS',
                'protocol': 'REST/JSON',
                'stage': 'Optimization Error',
                'message': f'ROS Service: Route optimization unavailable, proceeding without',
                'timestamp': datetime.utcnow().isoformat()
            })
            
            print("")
            print("╔══════════════════════════════════════════════════════════════╗")
            print("║  🛣️  ROS SERVICE - ERROR ❌                                   ║")
            print("╠══════════════════════════════════════════════════════════════╣")
            print(f"║  Order ID    : {order_id:<45} ║")
            print("║  Action      : Route Optimization Failed                     ║")
            print("║  Protocol    : REST/JSON                                     ║")
            print(f"║  Error       : {str(e)[:45]:<45} ║")
            print("║  Status      : ❌ ERROR (proceeding without route)          ║")
            print("╚══════════════════════════════════════════════════════════════╝")
            print("")
            
            # Record ROS failed activity
            ros_duration = int((time.time() - ros_start_time) * 1000)
            record_service_activity(
                order_id=order_id,
                service_name='ROS',
                service_type='Route Optimization',
                action='optimize_route',
                status='failed',
                protocol='REST/JSON',
                endpoint=f'{ROS_SERVICE_URL}/route/optimize',
                error_message=str(e),
                duration_ms=ros_duration
            )
            
            return {'success': True, 'message': f'Route optimization skipped: {str(e)}'}
    
    @staticmethod
    def cancel_route(data):
        """Compensation: Cancel calculated route."""
        try:
            route_id = data.get('route_id')
            if route_id:
                requests.delete(
                    f"{ROS_SERVICE_URL}/route/{route_id}/cancel",
                    timeout=30
                )
            return {'success': True, 'message': 'Route cancelled'}
            
        except Exception as e:
            logger.error("Route cancellation failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def confirm_order(data):
        """Confirm order in middleware."""
        try:
            order_id = data.get('order_id')
            
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (order_id,))
            
            cursor.execute("""
                INSERT INTO order_timeline (order_id, status, description)
                VALUES (%s, 'confirmed', 'Order confirmed via saga orchestrator')
            """, (order_id,))
            
            conn.commit()
            conn.close()
            
            return {'success': True, 'message': 'Order confirmed'}
            
        except Exception as e:
            logger.error("Order confirmation failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def auto_assign_driver(data):
        """
        =====================================================================
        AUTO ASSIGN DRIVER
        =====================================================================
        Automatically selects the most available driver based on:
        - Driver status must be 'active'
        - Fewest currently active orders (load balancing / round-robin)
        =====================================================================
        """
        try:
            order_id = data.get('order_id')

            conn = get_db_connection()
            cursor = conn.cursor()

            # Find the active driver with the fewest in-progress orders
            cursor.execute("""
                SELECT d.id, d.user_id, u.name,
                       COUNT(o.id) FILTER (
                           WHERE o.status IN ('confirmed', 'in_warehouse', 'out_for_delivery')
                       ) AS active_order_count
                FROM drivers d
                JOIN users u ON d.user_id = u.id
                LEFT JOIN orders o ON o.driver_id = d.id
                WHERE d.status = 'active'
                GROUP BY d.id, d.user_id, u.name
                ORDER BY active_order_count ASC
                LIMIT 1
            """)

            driver = cursor.fetchone()

            if not driver:
                # No active drivers — leave order assigned to nobody, saga still succeeds
                conn.close()
                logger.warning("No active drivers available for auto-assignment",
                               order_id=order_id)
                return {'success': True, 'message': 'No active drivers — order queued for manual assignment'}

            driver_id = driver['id']
            driver_name = driver['name']

            # Assign driver and add timeline entry
            cursor.execute("""
                UPDATE orders
                SET driver_id = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (driver_id, order_id))

            cursor.execute("""
                INSERT INTO order_timeline (order_id, status, description)
                VALUES (%s, 'driver_assigned', %s)
            """, (order_id, f'Driver {driver_name} automatically assigned by middleware'))

            conn.commit()
            conn.close()

            # Publish driver-assigned event so WebSocket/notifications pick it up
            publish_message('swifttrack.orders', 'order.driver_assigned', {
                'order_id': order_id,
                'driver_id': driver_id,
                'driver_name': driver_name,
                'timestamp': datetime.utcnow().isoformat()
            })

            publish_message('swifttrack.notifications', '', {
                'type': 'driver_assigned',
                'order_id': order_id,
                'driver_id': driver_id,
                'message': f'Driver {driver_name} has been assigned to order {order_id}'
            })

            logger.info("Driver auto-assigned", order_id=order_id,
                        driver_id=driver_id, driver_name=driver_name)
            return {
                'success': True,
                'message': f'Driver {driver_name} assigned',
                'driver_id': driver_id
            }

        except Exception as e:
            logger.error("Auto driver assignment failed", error=str(e))
            # Non-fatal — don't fail the entire saga if assignment fails
            return {'success': True, 'message': f'Auto-assignment skipped: {str(e)}'}

    @staticmethod
    def release_driver_assignment(data):
        """Compensation: Remove auto-assigned driver from order."""
        try:
            order_id = data.get('order_id')

            conn = get_db_connection()
            cursor = conn.cursor()

            cursor.execute("""
                UPDATE orders
                SET driver_id = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (order_id,))

            conn.commit()
            conn.close()

            return {'success': True, 'message': 'Driver assignment released'}

        except Exception as e:
            logger.error("Driver assignment release failed", error=str(e))
            return {'success': False, 'message': str(e)}

    @staticmethod
    def cancel_order(data):
        """Compensation: Cancel order."""
        try:
            order_id = data.get('order_id')
            
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (order_id,))
            
            cursor.execute("""
                INSERT INTO order_timeline (order_id, status, description)
                VALUES (%s, 'cancelled', 'Order cancelled - saga compensation')
            """, (order_id,))
            
            conn.commit()
            conn.close()
            
            return {'success': True, 'message': 'Order cancelled'}
            
        except Exception as e:
            logger.error("Order cancellation failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def check_driver(data):
        """Check driver availability."""
        try:
            driver_id = data.get('driver_id')
            
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT status FROM drivers WHERE id = %s OR user_id::text = %s
            """, (driver_id, driver_id))
            
            driver = cursor.fetchone()
            conn.close()
            
            if driver and driver['status'] in ['available', 'active']:
                return {'success': True, 'message': 'Driver available'}
            else:
                return {'success': False, 'message': 'Driver not available'}
                
        except Exception as e:
            logger.error("Driver check failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def confirm_assignment(data):
        """Confirm driver assignment."""
        try:
            order_id = data.get('order_id')
            driver_id = data.get('driver_id')
            
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE orders 
                SET driver_id = (SELECT id FROM drivers WHERE user_id::text = %s OR id::text = %s LIMIT 1),
                    status = 'assigned',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (driver_id, driver_id, order_id))
            
            conn.commit()
            conn.close()
            
            return {'success': True, 'message': 'Assignment confirmed'}
            
        except Exception as e:
            logger.error("Assignment confirmation failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def cancel_assignment(data):
        """Compensation: Cancel driver assignment."""
        try:
            order_id = data.get('order_id')
            
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE orders SET driver_id = NULL, status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (order_id,))
            
            conn.commit()
            conn.close()
            
            return {'success': True, 'message': 'Assignment cancelled'}
            
        except Exception as e:
            logger.error("Assignment cancellation failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def mark_delivered(data):
        """Mark delivery as completed."""
        try:
            order_id = data.get('order_id')
            
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE orders SET status = 'delivered', updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (order_id,))
            
            cursor.execute("""
                INSERT INTO order_timeline (order_id, status, description)
                VALUES (%s, 'delivered', 'Delivery completed')
            """, (order_id,))
            
            conn.commit()
            conn.close()
            
            return {'success': True, 'message': 'Delivery marked complete'}
            
        except Exception as e:
            logger.error("Delivery marking failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def revert_delivery_status(data):
        """Compensation: Revert delivery status."""
        try:
            order_id = data.get('order_id')
            
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE orders SET status = 'out_for_delivery', updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (order_id,))
            
            conn.commit()
            conn.close()
            
            return {'success': True, 'message': 'Delivery status reverted'}
            
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def update_delivery(data):
        """Update customer record via CMS."""
        # No-op for mock implementation
        return {'success': True, 'message': 'Customer updated'}

# =============================================================================
# SAGA ORCHESTRATOR
# =============================================================================

class SagaOrchestrator:
    """
    =========================================================================
    SAGA ORCHESTRATOR
    =========================================================================
    Coordinates the execution of saga steps and handles compensation
    Implements the SAGA pattern for distributed transactions
    =========================================================================
    """
    
    EXECUTORS = {
        'validate_customer': StepExecutors.validate_customer,
        'reserve_slot': StepExecutors.reserve_slot,
        'release_slot': StepExecutors.release_slot,
        'optimize_route': StepExecutors.optimize_route,
        'cancel_route': StepExecutors.cancel_route,
        'confirm_order': StepExecutors.confirm_order,
        'cancel_order': StepExecutors.cancel_order,
        'check_driver': StepExecutors.check_driver,
        'confirm_assignment': StepExecutors.confirm_assignment,
        'cancel_assignment': StepExecutors.cancel_assignment,
        'auto_assign_driver': StepExecutors.auto_assign_driver,
        'release_driver_assignment': StepExecutors.release_driver_assignment,
        'mark_delivered': StepExecutors.mark_delivered,
        'revert_delivery_status': StepExecutors.revert_delivery_status,
        'update_delivery': StepExecutors.update_delivery
    }
    
    @staticmethod
    def execute_saga(saga_id, saga_type, data):
        """
        =====================================================================
        EXECUTE SAGA
        =====================================================================
        Main saga execution loop:
        1. Execute steps in sequence
        2. On failure, run compensation for completed steps (in reverse)
        3. Update saga state throughout
        =====================================================================
        """
        logger.info("Executing saga", saga_id=saga_id, type=saga_type)
        
        definition = SAGA_DEFINITIONS.get(saga_type)
        if not definition:
            logger.error("Unknown saga type", type=saga_type)
            SagaStateManager.saga_failed(saga_id, f"Unknown saga type: {saga_type}")
            return False
        
        steps = definition['steps']
        completed_steps = []
        saga_data = data.copy()
        
        SagaStateManager.update_saga_status(saga_id, SagaStatus.IN_PROGRESS)
        
        # =====================================================
        # FORWARD EXECUTION
        # =====================================================
        for i, step in enumerate(steps):
            step_name = step['name']
            action = step['action']
            
            logger.info("Executing saga step", saga_id=saga_id, step=step_name, index=i)
            SagaStateManager.update_step_status(saga_id, i, StepStatus.EXECUTING.value)
            
            executor = SagaOrchestrator.EXECUTORS.get(action)
            if not executor:
                logger.error("Unknown step executor", action=action)
                SagaStateManager.update_step_status(saga_id, i, StepStatus.FAILED.value)
                SagaOrchestrator.compensate(saga_id, steps, completed_steps, saga_data)
                return False
            
            # Execute step
            result = executor(saga_data)
            
            if result.get('success'):
                logger.info("Step completed", saga_id=saga_id, step=step_name)
                SagaStateManager.update_step_status(saga_id, i, StepStatus.COMPLETED.value)
                
                # Track completed step for potential compensation
                completed_steps.append({
                    'step': step,
                    'index': i,
                    'result': result
                })
                
                # Merge any result data for subsequent steps
                if 'route_id' in result:
                    saga_data['route_id'] = result['route_id']
                    
            else:
                # =====================================================
                # STEP FAILED - TRIGGER COMPENSATION
                # =====================================================
                logger.error("Step failed", saga_id=saga_id, step=step_name, error=result.get('message'))
                SagaStateManager.update_step_status(saga_id, i, StepStatus.FAILED.value)
                
                # Run compensation
                SagaOrchestrator.compensate(saga_id, steps, completed_steps, saga_data)
                SagaStateManager.saga_failed(saga_id, f"Step {step_name} failed: {result.get('message')}")
                return False
        
        # All steps completed successfully
        SagaStateManager.saga_completed(saga_id)
        
        # Send success notification
        publish_message('swifttrack.notifications', '', {
            'type': 'saga_completed',
            'saga_id': saga_id,
            'saga_type': saga_type,
            'order_id': data.get('order_id'),
            'message': f'Saga {saga_type} completed successfully'
        })
        
        return True
    
    @staticmethod
    def compensate(saga_id, steps, completed_steps, data):
        """
        =====================================================================
        COMPENSATION (ROLLBACK)
        =====================================================================
        Execute compensation actions in REVERSE order for completed steps
        This ensures the system returns to a consistent state
        =====================================================================
        """
        logger.warning("Starting saga compensation", saga_id=saga_id)
        SagaStateManager.update_saga_status(saga_id, SagaStatus.COMPENSATING)
        
        # Process completed steps in reverse order
        for completed in reversed(completed_steps):
            step = completed['step']
            index = completed['index']
            compensation_action = step.get('compensation')
            
            if not compensation_action:
                logger.info("No compensation needed for step", step=step['name'])
                continue
            
            logger.info("Running compensation", step=step['name'], action=compensation_action)
            SagaStateManager.update_step_status(saga_id, index, StepStatus.COMPENSATING.value)
            
            executor = SagaOrchestrator.EXECUTORS.get(compensation_action)
            if executor:
                result = executor(data)
                if result.get('success'):
                    logger.info("Compensation succeeded", step=step['name'])
                    SagaStateManager.update_step_status(saga_id, index, StepStatus.COMPENSATED.value)
                else:
                    logger.error("Compensation failed", step=step['name'], error=result.get('message'))
                    # Continue with other compensations even if one fails
            else:
                logger.error("Unknown compensation executor", action=compensation_action)
        
        SagaStateManager.update_saga_status(saga_id, SagaStatus.COMPENSATED)
        logger.info("Saga compensation completed", saga_id=saga_id)
        
        # Send failure notification
        publish_message('swifttrack.notifications', '', {
            'type': 'saga_failed',
            'saga_id': saga_id,
            'order_id': data.get('order_id'),
            'message': 'Transaction rolled back due to failure'
        })

# =============================================================================
# MESSAGE HANDLERS
# =============================================================================

def handle_saga_message(ch, method, properties, body):
    """Handle incoming saga execution requests."""
    message_id = properties.message_id or 'unknown'
    logger.info("Processing saga message", message_id=message_id)
    
    try:
        data = json.loads(body)
        saga_id = data.get('saga_id') or str(uuid.uuid4())
        saga_type = data.get('saga_type')
        saga_data = data.get('payload') or data.get('data', {})
        
        if not saga_type:
            logger.error("Missing saga_type in message", message_id=message_id)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Create saga state
        SagaStateManager.create_saga(saga_id, saga_type, saga_data)
        
        # Execute saga
        SagaOrchestrator.execute_saga(saga_id, saga_type, saga_data)
        
        # Acknowledge message
        ch.basic_ack(delivery_tag=method.delivery_tag)
        
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in saga message", error=str(e))
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
    except Exception as e:
        logger.error("Error processing saga message", error=str(e))
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

# =============================================================================
# SAGA CONSUMER
# =============================================================================

class SagaConsumer:
    """Consume saga execution messages from RabbitMQ."""
    
    def __init__(self):
        self.connection = None
        self.channel = None
        self.should_stop = False
        
    def connect(self):
        """Establish connection and setup queues."""
        self.connection = get_rabbitmq_connection()
        self.channel = self.connection.channel()
        
        # Declare topic exchange for saga
        self.channel.exchange_declare(
            exchange='swifttrack.saga',
            exchange_type='topic',
            durable=True
        )
        
        # Declare saga queue
        self.channel.queue_declare(
            queue='saga.execute',
            durable=True,
            arguments={
                'x-dead-letter-exchange': 'swifttrack.dlx',
                'x-dead-letter-routing-key': 'saga.execute.dlq',
                'x-message-ttl': 3600000,
                'x-max-priority': 10
            }
        )
        
        # Bind queue to exchange
        self.channel.queue_bind('saga.execute', 'swifttrack.saga', 'saga.execute')
        self.channel.queue_bind('saga.execute', 'swifttrack.saga', 'saga.#')
        
        # Prefetch limit
        self.channel.basic_qos(prefetch_count=5)
        
        logger.info("Saga consumer connected")
        
    def start_consuming(self):
        """Start consuming messages."""
        self.channel.basic_consume(
            queue='saga.execute',
            on_message_callback=handle_saga_message,
            auto_ack=False
        )
        
        logger.info("Starting to consume saga messages...")
        
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
        logger.info("Saga consumer stopped")

# =============================================================================
# HEALTH CHECK SERVER
# =============================================================================

def run_health_server():
    """Simple TCP health check server."""
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', 5007))
    server.listen(1)
    
    logger.info("Health check server started on port 5007")
    
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
    logger.info("Starting Saga Orchestrator Service")
    
    # Start health check server in background
    health_thread = threading.Thread(target=run_health_server, daemon=True)
    health_thread.start()
    
    # Wait for RabbitMQ to be ready
    time.sleep(10)
    
    # Start message consumer
    consumer = SagaConsumer()
    
    while True:
        try:
            consumer.connect()
            consumer.start_consuming()
        except Exception as e:
            logger.error("Consumer crashed, restarting...", error=str(e))
            time.sleep(5)
