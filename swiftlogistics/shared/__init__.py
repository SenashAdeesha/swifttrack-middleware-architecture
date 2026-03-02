# =============================================================================
# SwiftTrack Logistics - Shared Utilities Package
# =============================================================================
# Production-grade utilities for distributed microservices
# =============================================================================

from .circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerFactory,
    CircuitBreakerOpen,
    CircuitState
)

from .retry_handler import (
    RetryHandler,
    retry,
    retry_with_backoff,
    ExponentialBackoff,
    FibonacciBackoff
)

from .idempotency import (
    IdempotencyKey,
    IdempotencyStore,
    idempotent,
    FlaskIdempotencyMiddleware
)

from .correlation import (
    CorrelationContext,
    CorrelationMiddleware,
    correlation_middleware,
    get_current_context,
    set_current_context,
    clear_current_context,
    with_correlation,
    publish_with_correlation,
    consume_with_correlation
)

from .logging_utils import (
    StructuredLogger,
    JsonFormatter,
    get_logger,
    configure_logging
)

from .rabbitmq_utils import (
    RabbitMQConfig,
    RabbitMQPublisher,
    RabbitMQConsumer,
    DLQProcessor,
    configure_rabbitmq,
    get_publisher,
    publish_message
)

from .database_utils import (
    DatabaseConfig,
    ConnectionPool,
    BaseRepository,
    transactional,
    configure_database,
    get_pool,
    get_connection,
    get_cursor,
    execute_query,
    health_check
)

__all__ = [
    # Circuit Breaker
    'CircuitBreaker',
    'CircuitBreakerFactory',
    'CircuitBreakerOpen',
    'CircuitState',
    
    # Retry Handler
    'RetryHandler',
    'retry',
    'retry_with_backoff',
    'ExponentialBackoff',
    'FibonacciBackoff',
    
    # Idempotency
    'IdempotencyKey',
    'IdempotencyStore',
    'idempotent',
    'FlaskIdempotencyMiddleware',
    
    # Correlation
    'CorrelationContext',
    'CorrelationMiddleware',
    'correlation_middleware',
    'get_current_context',
    'set_current_context',
    'clear_current_context',
    'with_correlation',
    'publish_with_correlation',
    'consume_with_correlation',
    
    # Logging
    'StructuredLogger',
    'JsonFormatter',
    'get_logger',
    'configure_logging',
    
    # RabbitMQ
    'RabbitMQConfig',
    'RabbitMQPublisher',
    'RabbitMQConsumer',
    'DLQProcessor',
    'configure_rabbitmq',
    'get_publisher',
    'publish_message',
    
    # Database
    'DatabaseConfig',
    'ConnectionPool',
    'BaseRepository',
    'transactional',
    'configure_database',
    'get_pool',
    'get_connection',
    'get_cursor',
    'execute_query',
    'health_check'
]

__version__ = '1.0.0'
