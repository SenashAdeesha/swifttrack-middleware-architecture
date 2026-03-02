# =============================================================================
# SwiftTrack Logistics - Dead Letter Queue Handler Service
# =============================================================================
# Processes failed messages from DLQ for retry, analysis, and archival
# Port: 5008
# =============================================================================

import json
import os
import sys
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS

# Add shared module to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.logging_utils import get_logger, configure_logging
from shared.rabbitmq_utils import (
    RabbitMQConfig, 
    RabbitMQConsumer, 
    RabbitMQPublisher,
    DLQProcessor
)
from shared.database_utils import (
    configure_database,
    get_pool,
    BaseRepository,
    transactional
)
from shared.correlation import CorrelationMiddleware, correlation_middleware

# =============================================================================
# CONFIGURATION
# =============================================================================

configure_logging(level='INFO', service_name='dlq-handler')
logger = get_logger('dlq-handler')

app = Flask(__name__)
CORS(app)

# Apply correlation middleware
CorrelationMiddleware(app)

# Database configuration
configure_database(
    host=os.environ.get('DB_HOST', 'localhost'),
    port=int(os.environ.get('DB_PORT', 5432)),
    database=os.environ.get('DB_NAME', 'swifttrack'),
    user=os.environ.get('DB_USER', 'swifttrack_user'),
    password=os.environ.get('DB_PASSWORD', 'swifttrack_secure_pass_2026')
)

# RabbitMQ configuration
rabbitmq_config = RabbitMQConfig(
    host=os.environ.get('RABBITMQ_HOST', 'localhost'),
    port=int(os.environ.get('RABBITMQ_PORT', 5672)),
    username=os.environ.get('RABBITMQ_USER', 'swifttrack_user'),
    password=os.environ.get('RABBITMQ_PASS', 'swifttrack_pass_2026'),
    vhost=os.environ.get('RABBITMQ_VHOST', 'swifttrack_vhost')
)


# =============================================================================
# DLQ MESSAGE REPOSITORY
# =============================================================================

class DLQMessageRepository(BaseRepository):
    """Repository for persisting DLQ messages."""
    
    def __init__(self):
        super().__init__('dlq_messages')
    
    def save_message(
        self,
        message_id: str,
        queue_name: str,
        exchange: str,
        routing_key: str,
        payload: dict,
        error_reason: str,
        headers: dict,
        retry_count: int = 0
    ) -> int:
        """Save a DLQ message to the database."""
        return self.insert({
            'message_id': message_id,
            'queue_name': queue_name,
            'exchange': exchange,
            'routing_key': routing_key,
            'payload': json.dumps(payload),
            'error_reason': error_reason,
            'headers': json.dumps(headers),
            'retry_count': retry_count,
            'status': 'pending',
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        })
    
    def get_pending_messages(
        self,
        queue_name: str = None,
        limit: int = 100
    ) -> list:
        """Get pending DLQ messages."""
        conditions = {'status': 'pending'}
        if queue_name:
            conditions['queue_name'] = queue_name
        return self.find(conditions, limit=limit)
    
    def mark_as_retried(self, id: int) -> bool:
        """Mark a message as retried."""
        return self.update(id, {
            'status': 'retried',
            'retry_count': 'retry_count + 1',
            'updated_at': datetime.utcnow()
        })
    
    def mark_as_archived(self, id: int) -> bool:
        """Mark a message as archived."""
        return self.update(id, {
            'status': 'archived',
            'updated_at': datetime.utcnow()
        })
    
    def mark_as_discarded(self, id: int, reason: str) -> bool:
        """Mark a message as discarded."""
        return self.update(id, {
            'status': 'discarded',
            'error_reason': reason,
            'updated_at': datetime.utcnow()
        })
    
    def get_statistics(self) -> dict:
        """Get DLQ message statistics."""
        pool = get_pool()
        
        with pool.get_cursor() as cur:
            cur.execute("""
                SELECT 
                    queue_name,
                    status,
                    COUNT(*) as count,
                    AVG(retry_count) as avg_retries
                FROM dlq_messages
                GROUP BY queue_name, status
            """)
            rows = cur.fetchall()
        
        stats = {}
        for row in rows:
            queue = row['queue_name']
            if queue not in stats:
                stats[queue] = {}
            stats[queue][row['status']] = {
                'count': row['count'],
                'avg_retries': float(row['avg_retries']) if row['avg_retries'] else 0
            }
        
        return stats


# =============================================================================
# DLQ HANDLER SERVICE
# =============================================================================

class DLQHandlerService:
    """
    =========================================================================
    DEAD LETTER QUEUE HANDLER SERVICE
    =========================================================================
    
    Manages failed messages from various queues:
    - Persists failed messages to database
    - Provides retry mechanism
    - Tracks failure patterns
    - Supports manual/automatic reprocessing
    
    DLQ Queues monitored:
    - orders.process.dlq
    - inventory.update.dlq
    - notifications.send.dlq
    - saga.events.dlq
    
    =========================================================================
    """
    
    # Define DLQ configurations
    DLQ_CONFIGS = {
        'orders.process.dlq': {
            'retry_exchange': 'swifttrack.orders',
            'retry_routing_key': 'order.process',
            'max_retries': 3,
            'retry_delay_seconds': 300  # 5 minutes
        },
        'inventory.update.dlq': {
            'retry_exchange': 'swifttrack.inventory',
            'retry_routing_key': 'inventory.update',
            'max_retries': 5,
            'retry_delay_seconds': 60
        },
        'notifications.send.dlq': {
            'retry_exchange': 'swifttrack.notifications',
            'retry_routing_key': 'notification.send',
            'max_retries': 3,
            'retry_delay_seconds': 120
        },
        'saga.events.dlq': {
            'retry_exchange': 'swifttrack.saga',
            'retry_routing_key': 'saga.event',
            'max_retries': 5,
            'retry_delay_seconds': 60
        }
    }
    
    def __init__(self):
        self.repository = DLQMessageRepository()
        self.publisher = RabbitMQPublisher(rabbitmq_config)
        self.processor = DLQProcessor(rabbitmq_config)
        self._running = False
        self._consumer_threads = []
    
    def start(self):
        """Start DLQ monitoring and processing."""
        self._running = True
        
        # Start consumer threads for each DLQ
        for queue_name in self.DLQ_CONFIGS.keys():
            thread = threading.Thread(
                target=self._consume_dlq,
                args=(queue_name,),
                daemon=True
            )
            thread.start()
            self._consumer_threads.append(thread)
            logger.info(f"Started DLQ consumer", queue=queue_name)
        
        # Start automatic retry processor
        retry_thread = threading.Thread(
            target=self._auto_retry_processor,
            daemon=True
        )
        retry_thread.start()
        self._consumer_threads.append(retry_thread)
        
        logger.info("DLQ Handler Service started")
    
    def stop(self):
        """Stop DLQ processing."""
        self._running = False
        logger.info("DLQ Handler Service stopped")
    
    def _consume_dlq(self, queue_name: str):
        """Consume messages from a specific DLQ."""
        consumer = RabbitMQConsumer(
            config=rabbitmq_config,
            max_retries=0  # We handle retries ourselves
        )
        
        def handle_dlq_message(message: dict, headers: dict):
            """Process a DLQ message."""
            try:
                # Extract metadata
                correlation_id = headers.get('X-Correlation-ID', 'unknown')
                original_queue = headers.get('x-original-queue', queue_name.replace('.dlq', ''))
                original_exchange = headers.get('x-original-exchange', '')
                original_routing_key = headers.get('x-original-routing-key', '')
                error_reason = headers.get('x-death-reason', 'Unknown error')
                retry_count = headers.get('x-retry-count', 0)
                
                # Generate message ID
                message_id = f"{correlation_id}_{datetime.utcnow().timestamp()}"
                
                # Persist to database
                self.repository.save_message(
                    message_id=message_id,
                    queue_name=queue_name,
                    exchange=original_exchange,
                    routing_key=original_routing_key,
                    payload=message,
                    error_reason=error_reason,
                    headers=headers,
                    retry_count=retry_count
                )
                
                logger.info(
                    "DLQ message persisted",
                    message_id=message_id,
                    queue=queue_name,
                    error=error_reason,
                    retry_count=retry_count
                )
                
                # Check if eligible for automatic retry
                config = self.DLQ_CONFIGS.get(queue_name, {})
                max_retries = config.get('max_retries', 3)
                
                if retry_count < max_retries:
                    # Schedule for retry
                    self._schedule_retry(
                        message_id=message_id,
                        message=message,
                        headers=headers,
                        queue_name=queue_name,
                        retry_count=retry_count + 1
                    )
                else:
                    # Max retries exceeded - archive
                    logger.warning(
                        "Max retries exceeded, archiving message",
                        message_id=message_id,
                        queue=queue_name,
                        retry_count=retry_count
                    )
                
            except Exception as e:
                logger.error(
                    "Error processing DLQ message",
                    queue=queue_name,
                    error=str(e),
                    exc_info=True
                )
        
        try:
            # Ensure DLQ exists
            consumer._ensure_connection()
            consumer.channel.queue_declare(
                queue=queue_name,
                durable=True,
                arguments={
                    'x-message-ttl': 604800000  # 7 days
                }
            )
            
            # Start consuming (blocking)
            consumer.consume(
                queue=queue_name,
                callback=handle_dlq_message,
                enable_dlq=False  # Don't create DLQ for DLQ
            )
        except Exception as e:
            if self._running:
                logger.error(
                    "DLQ consumer error",
                    queue=queue_name,
                    error=str(e)
                )
                # Reconnect after delay
                time.sleep(5)
                if self._running:
                    self._consume_dlq(queue_name)
    
    def _schedule_retry(
        self,
        message_id: str,
        message: dict,
        headers: dict,
        queue_name: str,
        retry_count: int
    ):
        """Schedule a message for retry."""
        config = self.DLQ_CONFIGS.get(queue_name, {})
        retry_delay = config.get('retry_delay_seconds', 60)
        
        # Exponential backoff
        actual_delay = retry_delay * (2 ** (retry_count - 1))
        
        logger.info(
            "Scheduling message retry",
            message_id=message_id,
            retry_count=retry_count,
            delay_seconds=actual_delay
        )
        
        # In production, use a delay queue or scheduler
        # For now, we'll use a simple thread-based delay
        def delayed_publish():
            time.sleep(actual_delay)
            self._retry_message(message_id, message, headers, queue_name, retry_count)
        
        thread = threading.Thread(target=delayed_publish, daemon=True)
        thread.start()
    
    def _retry_message(
        self,
        message_id: str,
        message: dict,
        headers: dict,
        queue_name: str,
        retry_count: int
    ):
        """Retry a failed message."""
        config = self.DLQ_CONFIGS.get(queue_name, {})
        
        retry_exchange = config.get('retry_exchange', 'swifttrack.default')
        retry_routing_key = config.get('retry_routing_key', 'default')
        
        # Update headers
        retry_headers = dict(headers)
        retry_headers['x-retry-count'] = retry_count
        retry_headers['x-retried-at'] = datetime.utcnow().isoformat() + 'Z'
        retry_headers['x-retried-from'] = queue_name
        
        try:
            success = self.publisher.publish(
                exchange=retry_exchange,
                routing_key=retry_routing_key,
                message=message,
                headers=retry_headers
            )
            
            if success:
                logger.info(
                    "Message retry published",
                    message_id=message_id,
                    exchange=retry_exchange,
                    routing_key=retry_routing_key
                )
            else:
                logger.error(
                    "Failed to publish retry message",
                    message_id=message_id
                )
        except Exception as e:
            logger.error(
                "Error retrying message",
                message_id=message_id,
                error=str(e)
            )
    
    def _auto_retry_processor(self):
        """Background processor for automatic retries."""
        while self._running:
            try:
                # Process pending messages older than their retry delay
                for queue_name, config in self.DLQ_CONFIGS.items():
                    messages = self.repository.get_pending_messages(
                        queue_name=queue_name,
                        limit=50
                    )
                    
                    for msg in messages:
                        retry_count = msg.get('retry_count', 0)
                        max_retries = config.get('max_retries', 3)
                        
                        if retry_count >= max_retries:
                            # Archive the message
                            self.repository.mark_as_archived(msg['id'])
                            continue
                        
                        # Check if enough time has passed
                        retry_delay = config.get('retry_delay_seconds', 60)
                        actual_delay = retry_delay * (2 ** retry_count)
                        
                        updated_at = msg.get('updated_at')
                        if updated_at:
                            elapsed = (datetime.utcnow() - updated_at).total_seconds()
                            if elapsed >= actual_delay:
                                # Time to retry
                                payload = json.loads(msg['payload'])
                                headers = json.loads(msg['headers'])
                                
                                self._retry_message(
                                    message_id=msg['message_id'],
                                    message=payload,
                                    headers=headers,
                                    queue_name=queue_name,
                                    retry_count=retry_count + 1
                                )
                                
                                self.repository.mark_as_retried(msg['id'])
                
            except Exception as e:
                logger.error("Auto-retry processor error", error=str(e))
            
            # Check every 30 seconds
            time.sleep(30)
    
    def manual_retry(self, message_id: int) -> dict:
        """Manually retry a specific message."""
        messages = self.repository.find({'id': message_id})
        
        if not messages:
            return {'success': False, 'error': 'Message not found'}
        
        msg = messages[0]
        queue_name = msg['queue_name']
        config = self.DLQ_CONFIGS.get(queue_name, {})
        
        payload = json.loads(msg['payload'])
        headers = json.loads(msg['headers'])
        
        self._retry_message(
            message_id=msg['message_id'],
            message=payload,
            headers=headers,
            queue_name=queue_name,
            retry_count=msg.get('retry_count', 0) + 1
        )
        
        self.repository.mark_as_retried(msg['id'])
        
        return {'success': True, 'message_id': msg['message_id']}
    
    def discard_message(self, message_id: int, reason: str) -> dict:
        """Discard a message (won't be retried)."""
        self.repository.mark_as_discarded(message_id, reason)
        return {'success': True, 'message_id': message_id}
    
    def get_statistics(self) -> dict:
        """Get DLQ statistics."""
        return self.repository.get_statistics()


# =============================================================================
# INITIALIZE SERVICE
# =============================================================================

dlq_service = DLQHandlerService()


# =============================================================================
# REST API ENDPOINTS
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'dlq-handler',
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    })


@app.route('/api/dlq/messages', methods=['GET'])
def list_messages():
    """List DLQ messages."""
    queue_name = request.args.get('queue')
    status = request.args.get('status', 'pending')
    limit = int(request.args.get('limit', 100))
    
    conditions = {'status': status}
    if queue_name:
        conditions['queue_name'] = queue_name
    
    messages = dlq_service.repository.find(conditions, limit=limit)
    
    # Parse JSON fields
    for msg in messages:
        if 'payload' in msg and isinstance(msg['payload'], str):
            msg['payload'] = json.loads(msg['payload'])
        if 'headers' in msg and isinstance(msg['headers'], str):
            msg['headers'] = json.loads(msg['headers'])
    
    return jsonify({
        'success': True,
        'count': len(messages),
        'messages': messages
    })


@app.route('/api/dlq/messages/<int:message_id>/retry', methods=['POST'])
def retry_message(message_id: int):
    """Manually retry a message."""
    result = dlq_service.manual_retry(message_id)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 404


@app.route('/api/dlq/messages/<int:message_id>/discard', methods=['POST'])
def discard_message(message_id: int):
    """Discard a message."""
    data = request.get_json() or {}
    reason = data.get('reason', 'Manually discarded')
    
    result = dlq_service.discard_message(message_id, reason)
    return jsonify(result)


@app.route('/api/dlq/statistics', methods=['GET'])
def get_statistics():
    """Get DLQ statistics."""
    stats = dlq_service.get_statistics()
    
    return jsonify({
        'success': True,
        'statistics': stats,
        'queues_monitored': list(DLQHandlerService.DLQ_CONFIGS.keys())
    })


@app.route('/api/dlq/queues/<queue_name>/reprocess', methods=['POST'])
def reprocess_queue(queue_name: str):
    """Reprocess all pending messages in a queue."""
    data = request.get_json() or {}
    limit = data.get('limit', 100)
    
    messages = dlq_service.repository.get_pending_messages(
        queue_name=queue_name,
        limit=limit
    )
    
    processed = 0
    for msg in messages:
        result = dlq_service.manual_retry(msg['id'])
        if result['success']:
            processed += 1
    
    return jsonify({
        'success': True,
        'queue': queue_name,
        'processed': processed,
        'total': len(messages)
    })


@app.route('/api/dlq/queues/<queue_name>/purge', methods=['DELETE'])
def purge_queue(queue_name: str):
    """Purge all messages from a DLQ (marks as discarded)."""
    messages = dlq_service.repository.get_pending_messages(
        queue_name=queue_name,
        limit=1000
    )
    
    purged = 0
    for msg in messages:
        dlq_service.discard_message(msg['id'], 'Purged via API')
        purged += 1
    
    return jsonify({
        'success': True,
        'queue': queue_name,
        'purged': purged
    })


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

if __name__ == '__main__':
    # Start DLQ service
    dlq_service.start()
    
    # Run Flask app
    port = int(os.environ.get('DLQ_SERVICE_PORT', 5008))
    logger.info(f"DLQ Handler Service starting on port {port}")
    
    try:
        app.run(
            host='0.0.0.0',
            port=port,
            debug=False,
            threaded=True
        )
    finally:
        dlq_service.stop()
