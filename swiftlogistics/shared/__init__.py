# =============================================================================
# SwiftTrack Logistics - Shared Utilities Package
# =============================================================================
# Production-grade utilities for distributed microservices
# =============================================================================

from .circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerFactory,
    CircuitBreakerError,
    CircuitState
)

from .retry_handler import (
    RetryHandler,
    retry_with_backoff,
    ExponentialBackoff,
    FibonacciBackoff
)

from .idempotency import (
    IdempotencyKey,
    IdempotencyStore,
    idempotency_middleware,
    check_idempotency
)

from .correlation import (
    CorrelationContext,
    CorrelationMiddleware,
    get_current_context,
    set_context,
    clear_context,
    correlation_required,
    inject_correlation_rabbitmq,
    extract_correlation_rabbitmq
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
    'CircuitBreakerError',
    'CircuitState',
    
    # Retry Handler
    'RetryHandler',
    'retry_with_backoff',
    'ExponentialBackoff',
    'FibonacciBackoff',
    
    # Idempotency
    'IdempotencyKey',
    'IdempotencyStore',
    'idempotency_middleware',
    'check_idempotency',
    
    # Correlation
    'CorrelationContext',
    'CorrelationMiddleware',
    'get_current_context',
    'set_context',
    'clear_context',
    'correlation_required',
    'inject_correlation_rabbitmq',
    'extract_correlation_rabbitmq',
    
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
