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
    IN_PROGRESS = 'in_progress'
    COMPLETED = 'completed'
    COMPENSATING = 'compensating'
    FAILED = 'failed'
    COMPENSATED = 'compensated'

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
    'create_order': {
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
            INSERT INTO saga_state (id, saga_type, status, current_step, data, step_states)
            VALUES (%s, %s, %s, 0, %s, %s)
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
        
        cursor.execute("SELECT * FROM saga_state WHERE id = %s", (saga_id,))
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
            SET status = %s, error = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (status.value if isinstance(status, SagaStatus) else status, 
              error, saga_id))
        
        conn.commit()
        conn.close()
    
    @staticmethod
    def update_step_status(saga_id, step_index, status):
        """Update individual step status."""
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT step_states FROM saga_state WHERE id = %s", (saga_id,))
        result = cursor.fetchone()
        
        if result:
            step_states = result['step_states']
            if isinstance(step_states, str):
                step_states = json.loads(step_states)
                
            if 0 <= step_index < len(step_states):
                step_states[step_index]['status'] = status
                
                cursor.execute("""
                    UPDATE saga_state 
                    SET step_states = %s, current_step = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (json.dumps(step_states), step_index, saga_id))
                
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
        """Validate customer via CMS SOAP service."""
        try:
            customer_id = data.get('client_id')
            
            # Call CMS SOAP service
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
                timeout=30
            )
            
            if response.status_code == 200 and '<cms:is_valid>true</cms:is_valid>' in response.text:
                return {'success': True, 'message': 'Customer validated'}
            else:
                return {'success': False, 'message': 'Customer validation failed'}
                
        except Exception as e:
            logger.error("Customer validation failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def reserve_slot(data):
        """Reserve warehouse slot via WMS messaging."""
        try:
            order_id = data.get('order_id')
            
            publish_message('swifttrack.warehouse', 'warehouse.receive', {
                'order_id': order_id,
                'package_type': data.get('package_type', 'standard'),
                'priority': data.get('priority', 'normal'),
                'action': 'reserve'
            })
            
            return {'success': True, 'message': 'Warehouse slot reserved'}
            
        except Exception as e:
            logger.error("Warehouse reservation failed", error=str(e))
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
        """Calculate optimized route via ROS REST service."""
        try:
            response = requests.post(
                f"{ROS_SERVICE_URL}/route/optimize",
                json={
                    'driver_id': data.get('driver_id'),
                    'order_ids': [data.get('order_id')],
                    'origin': data.get('pickup_coordinates', {'lat': 6.93, 'lon': 79.84}),
                    'destination': data.get('delivery_coordinates', {'lat': 6.90, 'lon': 79.86})
                },
                timeout=30
            )
            
            if response.status_code == 200:
                route_data = response.json()
                return {
                    'success': True, 
                    'message': 'Route optimized',
                    'route_id': route_data.get('route_id')
                }
            else:
                return {'success': False, 'message': 'Route optimization failed'}
                
        except Exception as e:
            logger.error("Route optimization failed", error=str(e))
            return {'success': False, 'message': str(e)}
    
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
        saga_data = data.get('data', {})
        
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
