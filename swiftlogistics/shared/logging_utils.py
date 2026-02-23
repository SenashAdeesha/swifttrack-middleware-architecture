# =============================================================================
# SwiftTrack Logistics - Enhanced Structured Logging
# =============================================================================
# Production-grade structured logging with correlation support
# Implements: JSON logging, Log levels, Context enrichment, Metrics
# =============================================================================

import json
import logging
import sys
import traceback
from datetime import datetime
from typing import Any, Dict, Optional
from .correlation import get_current_context


class JsonFormatter(logging.Formatter):
    """
    =========================================================================
    JSON LOG FORMATTER
    =========================================================================
    
    Formats log records as JSON for structured logging.
    
    Output format:
    {
        "timestamp": "2026-02-23T10:30:00.000Z",
        "level": "INFO",
        "service": "api-gateway",
        "message": "Request processed",
        "correlation_id": "abc-123",
        "request_id": "def-456",
        "user_id": "user-789",
        "duration_ms": 150,
        "extra": { ... }
    }
    
    =========================================================================
    """
    
    def __init__(
        self,
        service_name: str,
        include_traceback: bool = True,
        additional_fields: Optional[Dict[str, Any]] = None
    ):
        super().__init__()
        self.service_name = service_name
        self.include_traceback = include_traceback
        self.additional_fields = additional_fields or {}
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        # Base log structure
        log_dict = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'service': self.service_name,
            'logger': record.name,
            'message': record.getMessage()
        }
        
        # Add correlation context if available
        context = get_current_context()
        if context:
            log_dict.update(context.to_log_context())
        
        # Add extra fields from the log record
        if hasattr(record, 'extra'):
            log_dict['extra'] = record.extra
        
        # Add any kwargs passed to log methods
        for key in ['duration_ms', 'order_id', 'saga_id', 'step', 
                    'error_code', 'status_code', 'method', 'path',
                    'attempt', 'retry_delay']:
            if hasattr(record, key):
                log_dict[key] = getattr(record, key)
        
        # Add exception info if present
        if record.exc_info and self.include_traceback:
            log_dict['exception'] = {
                'type': record.exc_info[0].__name__ if record.exc_info[0] else None,
                'message': str(record.exc_info[1]) if record.exc_info[1] else None,
                'traceback': traceback.format_exception(*record.exc_info) if record.exc_info[0] else None
            }
        
        # Add source location
        log_dict['source'] = {
            'file': record.filename,
            'line': record.lineno,
            'function': record.funcName
        }
        
        # Add additional configured fields
        log_dict.update(self.additional_fields)
        
        return json.dumps(log_dict, default=str)


class StructuredLogger:
    """
    =========================================================================
    STRUCTURED LOGGER
    =========================================================================
    
    Enhanced logger with structured JSON output and context awareness.
    
    Features:
    - JSON formatted output
    - Automatic correlation context injection
    - Timing measurements
    - Error categorization
    - Child logger support
    
    Usage:
        logger = StructuredLogger('api-gateway')
        
        logger.info("Request received", path="/api/orders", method="POST")
        logger.error("Database error", error=str(e), order_id="ORD-001")
        
        with logger.timed("process_order"):
            process_order()
    
    =========================================================================
    """
    
    # Class-level configuration
    _loggers: Dict[str, 'StructuredLogger'] = {}
    _default_level = logging.INFO
    
    def __init__(
        self,
        name: str,
        level: int = None,
        additional_fields: Optional[Dict[str, Any]] = None
    ):
        self.name = name
        self.level = level or self._default_level
        self.additional_fields = additional_fields or {}
        
        # Create underlying Python logger
        self._logger = logging.getLogger(name)
        self._logger.setLevel(self.level)
        
        # Remove existing handlers to avoid duplicates
        self._logger.handlers.clear()
        
        # Add JSON formatter
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter(
            service_name=name,
            additional_fields=additional_fields
        ))
        self._logger.addHandler(handler)
        
        # Prevent propagation to root logger
        self._logger.propagate = False
    
    @classmethod
    def get_logger(cls, name: str, **kwargs) -> 'StructuredLogger':
        """Get or create a logger instance."""
        if name not in cls._loggers:
            cls._loggers[name] = cls(name, **kwargs)
        return cls._loggers[name]
    
    @classmethod
    def set_default_level(cls, level: int) -> None:
        """Set default log level for new loggers."""
        cls._default_level = level
    
    def _log(self, level: int, message: str, **kwargs) -> None:
        """Internal log method with extra context."""
        # Create extra dict for additional fields
        extra = {**self.additional_fields, **kwargs}
        
        # Create log record with extra fields attached
        record = self._logger.makeRecord(
            self._logger.name,
            level,
            "(unknown file)",
            0,
            message,
            args=(),
            exc_info=None
        )
        
        # Attach extra fields to record
        for key, value in extra.items():
            setattr(record, key, value)
        
        self._logger.handle(record)
    
    def debug(self, message: str, **kwargs) -> None:
        """Log debug message."""
        self._log(logging.DEBUG, message, **kwargs)
    
    def info(self, message: str, **kwargs) -> None:
        """Log info message."""
        self._log(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs) -> None:
        """Log warning message."""
        self._log(logging.WARNING, message, **kwargs)
    
    def error(self, message: str, exc_info: bool = False, **kwargs) -> None:
        """Log error message."""
        if exc_info:
            self._logger.error(message, exc_info=True, extra=kwargs)
        else:
            self._log(logging.ERROR, message, **kwargs)
    
    def critical(self, message: str, **kwargs) -> None:
        """Log critical message."""
        self._log(logging.CRITICAL, message, **kwargs)
    
    def exception(self, message: str, **kwargs) -> None:
        """Log exception with traceback."""
        self._logger.exception(message, extra=kwargs)
    
    # -------------------------------------------------------------------------
    # Convenience Methods
    # -------------------------------------------------------------------------
    
    def request_start(
        self,
        method: str,
        path: str,
        **kwargs
    ) -> None:
        """Log incoming request."""
        self.info(
            "Request received",
            method=method,
            path=path,
            **kwargs
        )
    
    def request_end(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        **kwargs
    ) -> None:
        """Log request completion."""
        level = logging.INFO if status_code < 400 else logging.WARNING
        self._log(
            level,
            "Request completed",
            method=method,
            path=path,
            status_code=status_code,
            duration_ms=round(duration_ms, 2),
            **kwargs
        )
    
    def saga_start(self, saga_id: str, saga_type: str, **kwargs) -> None:
        """Log saga transaction start."""
        self.info(
            "SAGA started",
            saga_id=saga_id,
            saga_type=saga_type,
            **kwargs
        )
    
    def saga_step(
        self,
        saga_id: str,
        step: str,
        status: str,
        **kwargs
    ) -> None:
        """Log saga step execution."""
        self.info(
            "SAGA step",
            saga_id=saga_id,
            step=step,
            status=status,
            **kwargs
        )
    
    def saga_complete(self, saga_id: str, success: bool, **kwargs) -> None:
        """Log saga completion."""
        level = logging.INFO if success else logging.ERROR
        self._log(
            level,
            "SAGA completed",
            saga_id=saga_id,
            success=success,
            **kwargs
        )
    
    def message_published(
        self,
        exchange: str,
        routing_key: str,
        **kwargs
    ) -> None:
        """Log message publication."""
        self.info(
            "Message published",
            exchange=exchange,
            routing_key=routing_key,
            **kwargs
        )
    
    def message_received(
        self,
        queue: str,
        routing_key: str,
        **kwargs
    ) -> None:
        """Log message receipt."""
        self.info(
            "Message received",
            queue=queue,
            routing_key=routing_key,
            **kwargs
        )
    
    def retry_attempt(
        self,
        operation: str,
        attempt: int,
        max_attempts: int,
        error: str,
        retry_delay: float = None,
        **kwargs
    ) -> None:
        """Log retry attempt."""
        self.warning(
            "Retry attempt",
            operation=operation,
            attempt=attempt,
            max_attempts=max_attempts,
            error=error,
            retry_delay=retry_delay,
            **kwargs
        )
    
    def circuit_breaker_state(
        self,
        service: str,
        state: str,
        **kwargs
    ) -> None:
        """Log circuit breaker state change."""
        level = logging.WARNING if state == 'open' else logging.INFO
        self._log(
            level,
            "Circuit breaker state change",
            circuit_breaker_service=service,
            circuit_breaker_state=state,
            **kwargs
        )
    
    def timed(self, operation_name: str):
        """
        Context manager for timing operations.
        
        Usage:
            with logger.timed("database_query"):
                result = db.query(...)
        """
        return TimedOperation(self, operation_name)


class TimedOperation:
    """Context manager for timing operations with logging."""
    
    def __init__(self, logger: StructuredLogger, operation_name: str):
        self.logger = logger
        self.operation_name = operation_name
        self.start_time = None
    
    def __enter__(self):
        self.start_time = datetime.utcnow()
        self.logger.debug(f"Starting: {self.operation_name}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (datetime.utcnow() - self.start_time).total_seconds() * 1000
        
        if exc_type:
            self.logger.error(
                f"Failed: {self.operation_name}",
                duration_ms=round(duration_ms, 2),
                error=str(exc_val)
            )
        else:
            self.logger.info(
                f"Completed: {self.operation_name}",
                duration_ms=round(duration_ms, 2)
            )
        
        return False  # Don't suppress exceptions


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_logger(name: str, **kwargs) -> StructuredLogger:
    """
    Get or create a structured logger.
    
    Usage:
        from shared.logging_utils import get_logger
        
        logger = get_logger('api-gateway')
        logger.info("Service started")
    """
    return StructuredLogger.get_logger(name, **kwargs)


# =============================================================================
# LOG LEVEL CONFIGURATION
# =============================================================================

def configure_logging(
    level: str = 'INFO',
    service_name: str = 'swifttrack'
) -> None:
    """
    Configure global logging settings.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        service_name: Default service name
    """
    log_level = getattr(logging, level.upper(), logging.INFO)
    StructuredLogger.set_default_level(log_level)
    
    # Configure root logger to use JSON format too
    root = logging.getLogger()
    root.setLevel(log_level)
    
    # Remove existing handlers
    root.handlers.clear()
    
    # Add JSON handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service_name))
    root.addHandler(handler)
