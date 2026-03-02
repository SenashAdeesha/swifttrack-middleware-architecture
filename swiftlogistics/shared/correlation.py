# =============================================================================
# SwiftTrack Logistics - Correlation ID & Context Propagation
# =============================================================================
# Enables distributed tracing across microservices
# Implements: Context propagation, Request tracking, Trace correlation
# =============================================================================

import uuid
import threading
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime
from contextlib import contextmanager
import functools


# Thread-local storage for correlation context
_context_storage = threading.local()


@dataclass
class CorrelationContext:
    """
    =========================================================================
    CORRELATION CONTEXT
    =========================================================================
    
    Holds tracing information that propagates across service boundaries.
    
    Headers to propagate:
    - X-Correlation-ID: Unique ID for the entire request chain
    - X-Request-ID: Unique ID for this specific request
    - X-Causation-ID: ID of the request that caused this one
    - X-User-ID: Authenticated user ID (if any)
    - X-Tenant-ID: Multi-tenant identifier (if applicable)
    
    =========================================================================
    """
    correlation_id: str
    request_id: str
    causation_id: Optional[str] = None
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    service_name: Optional[str] = None
    trace_start: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def new(
        cls,
        correlation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        service_name: Optional[str] = None
    ) -> 'CorrelationContext':
        """Create a new correlation context (entry point of a request chain)."""
        return cls(
            correlation_id=correlation_id or str(uuid.uuid4()),
            request_id=str(uuid.uuid4()),
            causation_id=None,
            user_id=user_id,
            service_name=service_name
        )
    
    @classmethod
    def from_parent(
        cls,
        parent: 'CorrelationContext',
        service_name: Optional[str] = None
    ) -> 'CorrelationContext':
        """Create a child context from parent (for downstream calls)."""
        return cls(
            correlation_id=parent.correlation_id,
            request_id=str(uuid.uuid4()),
            causation_id=parent.request_id,
            user_id=parent.user_id,
            tenant_id=parent.tenant_id,
            service_name=service_name or parent.service_name,
            metadata=parent.metadata.copy()
        )
    
    @classmethod
    def from_headers(
        cls,
        headers: Dict[str, str],
        service_name: Optional[str] = None
    ) -> 'CorrelationContext':
        """Extract correlation context from HTTP headers."""
        correlation_id = headers.get('X-Correlation-ID') or str(uuid.uuid4())
        request_id = str(uuid.uuid4())
        causation_id = headers.get('X-Request-ID')  # Parent's request ID
        
        return cls(
            correlation_id=correlation_id,
            request_id=request_id,
            causation_id=causation_id,
            user_id=headers.get('X-User-ID'),
            tenant_id=headers.get('X-Tenant-ID'),
            service_name=service_name
        )
    
    @classmethod
    def from_message(
        cls,
        message_headers: Dict[str, Any],
        service_name: Optional[str] = None
    ) -> 'CorrelationContext':
        """Extract correlation context from RabbitMQ message headers."""
        return cls(
            correlation_id=message_headers.get('correlation_id', str(uuid.uuid4())),
            request_id=str(uuid.uuid4()),
            causation_id=message_headers.get('request_id'),
            user_id=message_headers.get('user_id'),
            tenant_id=message_headers.get('tenant_id'),
            service_name=service_name
        )
    
    def to_headers(self) -> Dict[str, str]:
        """Convert context to HTTP headers for propagation."""
        headers = {
            'X-Correlation-ID': self.correlation_id,
            'X-Request-ID': self.request_id,
        }
        
        if self.causation_id:
            headers['X-Causation-ID'] = self.causation_id
        if self.user_id:
            headers['X-User-ID'] = self.user_id
        if self.tenant_id:
            headers['X-Tenant-ID'] = self.tenant_id
        
        return headers
    
    def to_message_headers(self) -> Dict[str, str]:
        """Convert context to RabbitMQ message headers."""
        headers = {
            'correlation_id': self.correlation_id,
            'request_id': self.request_id,
        }
        
        if self.causation_id:
            headers['causation_id'] = self.causation_id
        if self.user_id:
            headers['user_id'] = self.user_id
        if self.tenant_id:
            headers['tenant_id'] = self.tenant_id
        
        return headers
    
    def to_log_context(self) -> Dict[str, Any]:
        """Get context fields for structured logging."""
        return {
            'correlation_id': self.correlation_id,
            'request_id': self.request_id,
            'causation_id': self.causation_id,
            'user_id': self.user_id,
            'service': self.service_name
        }


# =============================================================================
# CONTEXT MANAGEMENT
# =============================================================================

def get_current_context() -> Optional[CorrelationContext]:
    """Get the current correlation context for this thread."""
    return getattr(_context_storage, 'context', None)


def set_current_context(context: CorrelationContext) -> None:
    """Set the correlation context for this thread."""
    _context_storage.context = context


def clear_current_context() -> None:
    """Clear the correlation context for this thread."""
    if hasattr(_context_storage, 'context'):
        delattr(_context_storage, 'context')


@contextmanager
def correlation_context(
    context: Optional[CorrelationContext] = None,
    correlation_id: Optional[str] = None,
    service_name: Optional[str] = None
):
    """
    Context manager for setting correlation context.
    
    Usage:
        with correlation_context(CorrelationContext.new(service_name='api-gateway')):
            # All operations in this block have access to the context
            process_request()
    """
    if context is None:
        context = CorrelationContext.new(
            correlation_id=correlation_id,
            service_name=service_name
        )
    
    previous_context = get_current_context()
    set_current_context(context)
    
    try:
        yield context
    finally:
        if previous_context:
            set_current_context(previous_context)
        else:
            clear_current_context()


def with_correlation(service_name: str = None):
    """
    Decorator to ensure function runs with correlation context.
    
    Usage:
        @with_correlation(service_name='middleware-service')
        def process_order(order_id):
            pass
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            current = get_current_context()
            if current is None:
                with correlation_context(service_name=service_name):
                    return func(*args, **kwargs)
            return func(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# FLASK MIDDLEWARE
# =============================================================================

def correlation_middleware(app, service_name: str):
    """
    Flask middleware to extract/create correlation context.
    
    Usage:
        from flask import Flask
        
        app = Flask(__name__)
        correlation_middleware(app, 'api-gateway')
    """
    from flask import request, g
    
    @app.before_request
    def before_request():
        """Extract or create correlation context from request headers."""
        context = CorrelationContext.from_headers(
            dict(request.headers),
            service_name=service_name
        )
        set_current_context(context)
        g.correlation_context = context
    
    @app.after_request
    def after_request(response):
        """Add correlation headers to response."""
        context = get_current_context()
        if context:
            response.headers['X-Correlation-ID'] = context.correlation_id
            response.headers['X-Request-ID'] = context.request_id
        clear_current_context()
        return response


class CorrelationMiddleware:
    """
    Class-based wrapper for correlation_middleware function.
    
    Usage:
        from flask import Flask
        
        app = Flask(__name__)
        CorrelationMiddleware(app)
    """
    
    def __init__(self, app, service_name: str = 'unknown'):
        correlation_middleware(app, service_name)


# =============================================================================
# HTTP CLIENT INTEGRATION
# =============================================================================

class CorrelatedRequests:
    """
    Wrapper around requests library that propagates correlation context.
    
    Usage:
        http_client = CorrelatedRequests()
        response = http_client.get('http://service/api/endpoint')
    """
    
    def __init__(self):
        import requests
        self._session = requests.Session()
    
    def _get_headers(self, extra_headers: Optional[Dict] = None) -> Dict[str, str]:
        """Get headers with correlation context."""
        headers = {}
        
        context = get_current_context()
        if context:
            headers.update(context.to_headers())
        
        if extra_headers:
            headers.update(extra_headers)
        
        return headers
    
    def get(self, url: str, **kwargs):
        headers = self._get_headers(kwargs.pop('headers', None))
        return self._session.get(url, headers=headers, **kwargs)
    
    def post(self, url: str, **kwargs):
        headers = self._get_headers(kwargs.pop('headers', None))
        return self._session.post(url, headers=headers, **kwargs)
    
    def put(self, url: str, **kwargs):
        headers = self._get_headers(kwargs.pop('headers', None))
        return self._session.put(url, headers=headers, **kwargs)
    
    def delete(self, url: str, **kwargs):
        headers = self._get_headers(kwargs.pop('headers', None))
        return self._session.delete(url, headers=headers, **kwargs)
    
    def patch(self, url: str, **kwargs):
        headers = self._get_headers(kwargs.pop('headers', None))
        return self._session.patch(url, headers=headers, **kwargs)


# =============================================================================
# RABBITMQ INTEGRATION
# =============================================================================

def publish_with_correlation(
    channel,
    exchange: str,
    routing_key: str,
    body: bytes,
    properties=None
):
    """
    Publish message with correlation context in headers.
    
    Usage:
        publish_with_correlation(
            channel,
            'orders',
            'order.created',
            json.dumps(order_data).encode()
        )
    """
    import pika
    
    context = get_current_context()
    
    headers = {}
    if context:
        headers = context.to_message_headers()
    
    if properties is None:
        properties = pika.BasicProperties(
            headers=headers,
            delivery_mode=2  # Persistent
        )
    else:
        # Merge headers
        existing_headers = properties.headers or {}
        existing_headers.update(headers)
        properties.headers = existing_headers
    
    channel.basic_publish(
        exchange=exchange,
        routing_key=routing_key,
        body=body,
        properties=properties
    )


def consume_with_correlation(
    service_name: str,
    handler
):
    """
    Wrapper for message handler that sets correlation context.
    
    Usage:
        @consume_with_correlation('wms-service')
        def handle_message(ch, method, properties, body):
            # Correlation context is available here
            pass
    """
    def wrapper(ch, method, properties, body):
        headers = properties.headers or {}
        
        context = CorrelationContext.from_message(headers, service_name)
        
        with correlation_context(context):
            return handler(ch, method, properties, body)
    
    return wrapper
