# =============================================================================
# SwiftTrack Logistics - Retry Handler with Exponential Backoff
# =============================================================================
# Production-grade retry logic with jitter and exponential backoff
# Implements: Configurable retry strategies, Circuit breaker integration
# =============================================================================

import time
import random
import functools
import logging
from typing import Callable, Any, Optional, Tuple, Type, Union
from dataclasses import dataclass
from enum import Enum


class BackoffStrategy(Enum):
    """Backoff strategy types."""
    CONSTANT = "constant"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    EXPONENTIAL_JITTER = "exponential_jitter"
    FIBONACCI = "fibonacci"


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    max_retries: int = 3
    base_delay: float = 1.0  # seconds
    max_delay: float = 60.0  # seconds
    exponential_base: float = 2.0
    jitter: bool = True
    jitter_factor: float = 0.5  # Random factor 0-1
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,)
    non_retryable_exceptions: Tuple[Type[Exception], ...] = ()
    on_retry: Optional[Callable[[int, Exception, float], None]] = None


class ExponentialBackoff:
    """
    =========================================================================
    EXPONENTIAL BACKOFF CALCULATOR
    =========================================================================
    
    Calculates delay between retries using exponential backoff with jitter.
    
    Formula: delay = min(base_delay * (exponential_base ^ attempt), max_delay)
    With jitter: delay = delay * (1 + random(-jitter_factor, jitter_factor))
    
    Benefits of jitter:
    - Prevents thundering herd problem when multiple clients retry
    - Distributes load more evenly across time
    - Reduces server pressure during outages
    
    =========================================================================
    """
    
    def __init__(
        self,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        jitter_factor: float = 0.5
    ):
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.jitter_factor = jitter_factor
    
    def get_delay(self, attempt: int) -> float:
        """
        Calculate delay for given attempt number.
        
        Args:
            attempt: Current attempt number (0-indexed)
            
        Returns:
            Delay in seconds
        """
        # Calculate exponential delay
        delay = self.base_delay * (self.exponential_base ** attempt)
        
        # Cap at max delay
        delay = min(delay, self.max_delay)
        
        # Add jitter
        if self.jitter:
            jitter_range = delay * self.jitter_factor
            delay = delay + random.uniform(-jitter_range, jitter_range)
            delay = max(0.1, delay)  # Ensure minimum delay
        
        return delay
    
    def get_delays(self, max_attempts: int) -> list:
        """Get list of all delays for given max attempts."""
        return [self.get_delay(i) for i in range(max_attempts)]


class FibonacciBackoff:
    """
    Fibonacci backoff - slower growth than exponential.
    Sequence: base, base, 2*base, 3*base, 5*base, 8*base, ...
    """
    
    def __init__(
        self,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        jitter: bool = True
    ):
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter
        self._fib_cache = {0: 1, 1: 1}
    
    def _fibonacci(self, n: int) -> int:
        """Calculate nth Fibonacci number with caching."""
        if n not in self._fib_cache:
            self._fib_cache[n] = self._fibonacci(n - 1) + self._fibonacci(n - 2)
        return self._fib_cache[n]
    
    def get_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt."""
        delay = self.base_delay * self._fibonacci(attempt)
        delay = min(delay, self.max_delay)
        
        if self.jitter:
            delay = delay + random.uniform(0, self.base_delay)
        
        return delay


class RetryHandler:
    """
    =========================================================================
    RETRY HANDLER
    =========================================================================
    
    Handles retry logic with configurable strategies.
    
    Features:
    - Multiple backoff strategies (exponential, linear, fibonacci)
    - Jitter support for distributed systems
    - Exception filtering (retryable vs non-retryable)
    - Callback hooks for logging/metrics
    - Circuit breaker integration ready
    
    Usage:
        retry = RetryHandler(max_retries=3, strategy='exponential_jitter')
        
        @retry
        def flaky_operation():
            # Something that might fail
            pass
        
        # Or manually
        result = retry.execute(flaky_operation, arg1, arg2)
    
    =========================================================================
    """
    
    def __init__(
        self,
        max_retries: int = 3,
        strategy: Union[str, BackoffStrategy] = BackoffStrategy.EXPONENTIAL_JITTER,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        jitter_factor: float = 0.5,
        retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
        non_retryable_exceptions: Tuple[Type[Exception], ...] = (),
        on_retry: Optional[Callable[[int, Exception, float], None]] = None,
        on_success: Optional[Callable[[int], None]] = None,
        on_failure: Optional[Callable[[int, Exception], None]] = None,
        logger: Optional[logging.Logger] = None
    ):
        self.max_retries = max_retries
        self.strategy = BackoffStrategy(strategy) if isinstance(strategy, str) else strategy
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.jitter_factor = jitter_factor
        self.retryable_exceptions = retryable_exceptions
        self.non_retryable_exceptions = non_retryable_exceptions
        self.on_retry = on_retry
        self.on_success = on_success
        self.on_failure = on_failure
        self.logger = logger or logging.getLogger(__name__)
        
        # Initialize backoff calculator
        self._backoff = self._create_backoff()
    
    def _create_backoff(self):
        """Create appropriate backoff calculator based on strategy."""
        if self.strategy == BackoffStrategy.FIBONACCI:
            return FibonacciBackoff(
                self.base_delay,
                self.max_delay,
                self.jitter
            )
        else:
            return ExponentialBackoff(
                self.base_delay,
                self.max_delay,
                self.exponential_base,
                self.jitter,
                self.jitter_factor
            )
    
    def _get_delay(self, attempt: int) -> float:
        """Get delay for current attempt based on strategy."""
        if self.strategy == BackoffStrategy.CONSTANT:
            return self.base_delay
        elif self.strategy == BackoffStrategy.LINEAR:
            return min(self.base_delay * (attempt + 1), self.max_delay)
        else:
            return self._backoff.get_delay(attempt)
    
    def _is_retryable(self, exception: Exception) -> bool:
        """Check if exception should be retried."""
        # Non-retryable exceptions take precedence
        if isinstance(exception, self.non_retryable_exceptions):
            return False
        
        # Check if it's a retryable exception
        return isinstance(exception, self.retryable_exceptions)
    
    def execute(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """
        Execute function with retry logic.
        
        Args:
            func: Function to execute
            *args, **kwargs: Arguments for the function
            
        Returns:
            Result of successful function execution
            
        Raises:
            Exception: Last exception if all retries exhausted
        """
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                result = func(*args, **kwargs)
                
                # Success callback
                if self.on_success and attempt > 0:
                    self.on_success(attempt)
                
                if attempt > 0:
                    self.logger.info(f"Operation succeeded on attempt {attempt + 1}")
                
                return result
                
            except Exception as e:
                last_exception = e
                
                # Check if this exception should be retried
                if not self._is_retryable(e):
                    self.logger.warning(f"Non-retryable exception: {type(e).__name__}")
                    raise
                
                # Check if we have retries left
                if attempt >= self.max_retries:
                    self.logger.error(
                        f"All {self.max_retries + 1} attempts failed. "
                        f"Last error: {type(e).__name__}: {str(e)}"
                    )
                    
                    # Failure callback
                    if self.on_failure:
                        self.on_failure(attempt, e)
                    
                    raise
                
                # Calculate delay
                delay = self._get_delay(attempt)
                
                self.logger.warning(
                    f"Attempt {attempt + 1} failed: {type(e).__name__}: {str(e)}. "
                    f"Retrying in {delay:.2f}s..."
                )
                
                # Retry callback
                if self.on_retry:
                    self.on_retry(attempt, e, delay)
                
                # Wait before next attempt
                time.sleep(delay)
        
        # Should not reach here, but just in case
        if last_exception:
            raise last_exception
    
    def __call__(self, func: Callable) -> Callable:
        """Decorator to wrap a function with retry logic."""
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return self.execute(func, *args, **kwargs)
        return wrapper


# =============================================================================
# RETRY DECORATORS
# =============================================================================

def retry(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True,
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
    non_retryable_exceptions: Tuple[Type[Exception], ...] = ()
) -> Callable:
    """
    Decorator factory for retry with exponential backoff.
    
    Usage:
        @retry(max_retries=3, base_delay=1.0)
        def call_external_service():
            # Make external call
            pass
    """
    handler = RetryHandler(
        max_retries=max_retries,
        strategy=BackoffStrategy.EXPONENTIAL_JITTER,
        base_delay=base_delay,
        max_delay=max_delay,
        exponential_base=exponential_base,
        jitter=jitter,
        retryable_exceptions=retryable_exceptions,
        non_retryable_exceptions=non_retryable_exceptions
    )
    return handler


# Create alias for backward compatibility
retry_with_backoff = retry


def retry_with_circuit_breaker(
    circuit_breaker,
    max_retries: int = 3,
    base_delay: float = 1.0,
    **kwargs
) -> Callable:
    """
    Combines retry logic with circuit breaker.
    
    Usage:
        from shared.circuit_breaker import CircuitBreaker
        
        cb = CircuitBreaker('cms-service')
        
        @retry_with_circuit_breaker(cb, max_retries=3)
        def call_cms():
            pass
    """
    retry_handler = RetryHandler(
        max_retries=max_retries,
        base_delay=base_delay,
        **kwargs
    )
    
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Retry wraps circuit breaker execution
            def cb_wrapped():
                return circuit_breaker.execute(func, *args, **kwargs)
            return retry_handler.execute(cb_wrapped)
        return wrapper
    return decorator


# =============================================================================
# ASYNC RETRY SUPPORT (for future use)
# =============================================================================

class AsyncRetryHandler:
    """
    Async version of RetryHandler for asyncio-based applications.
    """
    
    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
        non_retryable_exceptions: Tuple[Type[Exception], ...] = ()
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.retryable_exceptions = retryable_exceptions
        self.non_retryable_exceptions = non_retryable_exceptions
        self._backoff = ExponentialBackoff(
            base_delay, max_delay, exponential_base, jitter
        )
    
    async def execute(self, func: Callable, *args, **kwargs) -> Any:
        """Execute async function with retry logic."""
        import asyncio
        
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                
                if isinstance(e, self.non_retryable_exceptions):
                    raise
                
                if not isinstance(e, self.retryable_exceptions):
                    raise
                
                if attempt >= self.max_retries:
                    raise
                
                delay = self._backoff.get_delay(attempt)
                await asyncio.sleep(delay)
        
        if last_exception:
            raise last_exception


# =============================================================================
# PRESET RETRY CONFIGURATIONS
# =============================================================================

class RetryPresets:
    """Pre-configured retry handlers for common scenarios."""
    
    @staticmethod
    def http_api() -> RetryHandler:
        """Retry configuration for HTTP API calls."""
        import requests
        return RetryHandler(
            max_retries=3,
            base_delay=1.0,
            max_delay=30.0,
            retryable_exceptions=(
                requests.exceptions.ConnectionError,
                requests.exceptions.Timeout,
                requests.exceptions.HTTPError,
            ),
            non_retryable_exceptions=(
                requests.exceptions.InvalidURL,
            )
        )
    
    @staticmethod
    def database() -> RetryHandler:
        """Retry configuration for database operations."""
        return RetryHandler(
            max_retries=5,
            base_delay=0.5,
            max_delay=10.0,
            jitter=True
        )
    
    @staticmethod
    def message_queue() -> RetryHandler:
        """Retry configuration for message queue operations."""
        return RetryHandler(
            max_retries=5,
            base_delay=1.0,
            max_delay=60.0,
            strategy=BackoffStrategy.EXPONENTIAL_JITTER
        )
    
    @staticmethod
    def aggressive() -> RetryHandler:
        """Aggressive retry for critical operations."""
        return RetryHandler(
            max_retries=10,
            base_delay=0.5,
            max_delay=120.0,
            strategy=BackoffStrategy.FIBONACCI
        )
