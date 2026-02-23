# =============================================================================
# SwiftTrack Logistics - Circuit Breaker Pattern Implementation
# =============================================================================
# Prevents cascading failures by failing fast when downstream services are down
# Implements: CLOSED → OPEN → HALF_OPEN → CLOSED cycle
# =============================================================================

import time
import threading
from enum import Enum
from dataclasses import dataclass, field
from typing import Callable, Any, Optional
from datetime import datetime
import functools


class CircuitState(Enum):
    """
    Circuit Breaker States:
    - CLOSED: Normal operation, requests flow through
    - OPEN: Failures exceeded threshold, requests fail fast
    - HALF_OPEN: Testing if service recovered, limited requests allowed
    """
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpen(Exception):
    """Exception raised when circuit breaker is open and request is rejected."""
    def __init__(self, service_name: str, timeout_remaining: float):
        self.service_name = service_name
        self.timeout_remaining = timeout_remaining
        super().__init__(
            f"Circuit breaker is OPEN for service '{service_name}'. "
            f"Retry in {timeout_remaining:.1f} seconds."
        )


@dataclass
class CircuitBreakerMetrics:
    """Tracks circuit breaker metrics for monitoring."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0  # Calls rejected while circuit is OPEN
    state_transitions: list = field(default_factory=list)
    last_failure_time: Optional[datetime] = None
    last_success_time: Optional[datetime] = None


class CircuitBreaker:
    """
    =========================================================================
    CIRCUIT BREAKER IMPLEMENTATION
    =========================================================================
    
    Design Decisions:
    1. Thread-safe using locks for concurrent access
    2. Configurable failure threshold and timeout
    3. Automatic state transitions based on success/failure
    4. Metrics tracking for observability
    5. Decorator pattern for easy integration
    
    State Machine:
    
    CLOSED --[failures >= threshold]--> OPEN
    OPEN --[timeout expires]--> HALF_OPEN
    HALF_OPEN --[success]--> CLOSED
    HALF_OPEN --[failure]--> OPEN
    
    =========================================================================
    """
    
    # Class-level registry for all circuit breakers (for monitoring)
    _registry: dict = {}
    _registry_lock = threading.Lock()
    
    def __init__(
        self,
        service_name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
        failure_rate_threshold: float = 0.5,
        sliding_window_size: int = 10
    ):
        """
        Initialize circuit breaker.
        
        Args:
            service_name: Name of the protected service
            failure_threshold: Number of failures before opening circuit
            recovery_timeout: Seconds to wait before transitioning to HALF_OPEN
            half_open_max_calls: Max calls allowed in HALF_OPEN state
            failure_rate_threshold: Failure rate (0-1) to trigger OPEN
            sliding_window_size: Number of calls in sliding window
        """
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.failure_rate_threshold = failure_rate_threshold
        self.sliding_window_size = sliding_window_size
        
        # State
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None
        self._half_open_calls = 0
        
        # Sliding window for failure rate calculation
        self._call_results: list = []  # True = success, False = failure
        
        # Thread safety
        self._lock = threading.RLock()
        
        # Metrics
        self.metrics = CircuitBreakerMetrics()
        
        # Register this circuit breaker
        with CircuitBreaker._registry_lock:
            CircuitBreaker._registry[service_name] = self
    
    @property
    def state(self) -> CircuitState:
        """Get current circuit state with automatic state transition check."""
        with self._lock:
            self._check_state_transition()
            return self._state
    
    @property
    def is_available(self) -> bool:
        """Check if circuit allows requests."""
        return self.state != CircuitState.OPEN
    
    def _check_state_transition(self) -> None:
        """Check and perform automatic state transitions."""
        if self._state == CircuitState.OPEN:
            if self._last_failure_time is not None:
                elapsed = time.time() - self._last_failure_time
                if elapsed >= self.recovery_timeout:
                    self._transition_to(CircuitState.HALF_OPEN)
    
    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to a new state."""
        old_state = self._state
        self._state = new_state
        
        # Record state transition
        self.metrics.state_transitions.append({
            'from': old_state.value,
            'to': new_state.value,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        # Reset counters based on new state
        if new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._call_results.clear()
        elif new_state == CircuitState.HALF_OPEN:
            self._half_open_calls = 0
    
    def _record_success(self) -> None:
        """Record a successful call."""
        with self._lock:
            self.metrics.total_calls += 1
            self.metrics.successful_calls += 1
            self.metrics.last_success_time = datetime.utcnow()
            
            self._success_count += 1
            self._call_results.append(True)
            
            # Keep sliding window size
            if len(self._call_results) > self.sliding_window_size:
                self._call_results.pop(0)
            
            if self._state == CircuitState.HALF_OPEN:
                self._half_open_calls += 1
                # Successful call in HALF_OPEN state - close the circuit
                if self._half_open_calls >= self.half_open_max_calls:
                    self._transition_to(CircuitState.CLOSED)
    
    def _record_failure(self, exception: Exception) -> None:
        """Record a failed call."""
        with self._lock:
            self.metrics.total_calls += 1
            self.metrics.failed_calls += 1
            self.metrics.last_failure_time = datetime.utcnow()
            
            self._failure_count += 1
            self._last_failure_time = time.time()
            self._call_results.append(False)
            
            # Keep sliding window size
            if len(self._call_results) > self.sliding_window_size:
                self._call_results.pop(0)
            
            if self._state == CircuitState.HALF_OPEN:
                # Any failure in HALF_OPEN state opens the circuit
                self._transition_to(CircuitState.OPEN)
            elif self._state == CircuitState.CLOSED:
                # Check if we should open the circuit
                if self._should_open():
                    self._transition_to(CircuitState.OPEN)
    
    def _should_open(self) -> bool:
        """Determine if circuit should open based on failures."""
        # Check failure count threshold
        if self._failure_count >= self.failure_threshold:
            return True
        
        # Check failure rate threshold (if we have enough data)
        if len(self._call_results) >= self.sliding_window_size:
            failure_rate = self._call_results.count(False) / len(self._call_results)
            if failure_rate >= self.failure_rate_threshold:
                return True
        
        return False
    
    def execute(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute a function with circuit breaker protection.
        
        Args:
            func: Function to execute
            *args, **kwargs: Arguments to pass to function
            
        Returns:
            Result of function execution
            
        Raises:
            CircuitBreakerOpen: If circuit is open
            Exception: Any exception from the wrapped function
        """
        with self._lock:
            self._check_state_transition()
            
            if self._state == CircuitState.OPEN:
                self.metrics.rejected_calls += 1
                timeout_remaining = self.recovery_timeout - (time.time() - self._last_failure_time)
                raise CircuitBreakerOpen(self.service_name, max(0, timeout_remaining))
        
        try:
            result = func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure(e)
            raise
    
    def __call__(self, func: Callable) -> Callable:
        """Decorator to wrap a function with circuit breaker."""
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return self.execute(func, *args, **kwargs)
        return wrapper
    
    def reset(self) -> None:
        """Manually reset circuit breaker to CLOSED state."""
        with self._lock:
            self._transition_to(CircuitState.CLOSED)
            self._last_failure_time = None
    
    def get_status(self) -> dict:
        """Get circuit breaker status for monitoring."""
        with self._lock:
            timeout_remaining = 0
            if self._state == CircuitState.OPEN and self._last_failure_time:
                timeout_remaining = max(0, self.recovery_timeout - (time.time() - self._last_failure_time))
            
            return {
                'service_name': self.service_name,
                'state': self._state.value,
                'failure_count': self._failure_count,
                'success_count': self._success_count,
                'failure_threshold': self.failure_threshold,
                'recovery_timeout': self.recovery_timeout,
                'timeout_remaining': timeout_remaining,
                'metrics': {
                    'total_calls': self.metrics.total_calls,
                    'successful_calls': self.metrics.successful_calls,
                    'failed_calls': self.metrics.failed_calls,
                    'rejected_calls': self.metrics.rejected_calls
                }
            }
    
    @classmethod
    def get_all_status(cls) -> dict:
        """Get status of all registered circuit breakers."""
        with cls._registry_lock:
            return {
                name: cb.get_status()
                for name, cb in cls._registry.items()
            }


# =============================================================================
# CIRCUIT BREAKER FACTORY
# =============================================================================

class CircuitBreakerFactory:
    """Factory for creating circuit breakers with preset configurations."""
    
    # Preset configurations for different service types
    PRESETS = {
        'external_api': {
            'failure_threshold': 5,
            'recovery_timeout': 30.0,
            'half_open_max_calls': 3,
            'failure_rate_threshold': 0.5,
            'sliding_window_size': 10
        },
        'database': {
            'failure_threshold': 3,
            'recovery_timeout': 10.0,
            'half_open_max_calls': 2,
            'failure_rate_threshold': 0.3,
            'sliding_window_size': 5
        },
        'message_queue': {
            'failure_threshold': 5,
            'recovery_timeout': 15.0,
            'half_open_max_calls': 3,
            'failure_rate_threshold': 0.4,
            'sliding_window_size': 10
        },
        'critical_service': {
            'failure_threshold': 2,
            'recovery_timeout': 60.0,
            'half_open_max_calls': 1,
            'failure_rate_threshold': 0.2,
            'sliding_window_size': 5
        }
    }
    
    @classmethod
    def create(cls, service_name: str, preset: str = 'external_api', **overrides) -> CircuitBreaker:
        """
        Create a circuit breaker with preset configuration.
        
        Args:
            service_name: Name of the service
            preset: Preset configuration name
            **overrides: Override specific settings
            
        Returns:
            Configured CircuitBreaker instance
        """
        config = cls.PRESETS.get(preset, cls.PRESETS['external_api']).copy()
        config.update(overrides)
        
        return CircuitBreaker(service_name, **config)


# =============================================================================
# CONVENIENCE DECORATORS
# =============================================================================

def circuit_breaker(
    service_name: str,
    failure_threshold: int = 5,
    recovery_timeout: float = 30.0,
    **kwargs
) -> Callable:
    """
    Decorator factory for circuit breaker protection.
    
    Usage:
        @circuit_breaker('cms-service', failure_threshold=3)
        def call_cms_service(data):
            # Make external call
            pass
    """
    cb = CircuitBreaker(
        service_name,
        failure_threshold=failure_threshold,
        recovery_timeout=recovery_timeout,
        **kwargs
    )
    return cb
