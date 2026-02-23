# =============================================================================
# SwiftTrack Logistics - Idempotency Implementation
# =============================================================================
# Prevents duplicate processing of requests in distributed systems
# Implements: Idempotency key storage, TTL management, Response caching
# =============================================================================

import json
import hashlib
import time
import threading
from typing import Any, Optional, Dict, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import wraps
import psycopg2
from psycopg2.extras import RealDictCursor


@dataclass
class IdempotencyRecord:
    """Record of an idempotent operation."""
    key: str
    status: str  # 'processing', 'completed', 'failed'
    response: Optional[Any]
    created_at: datetime
    expires_at: datetime
    request_hash: str


class IdempotencyKey:
    """
    =========================================================================
    IDEMPOTENCY KEY GENERATOR
    =========================================================================
    
    Generates unique idempotency keys for requests.
    
    Key generation strategies:
    1. Client-provided key (e.g., X-Idempotency-Key header)
    2. Hash-based key (hash of request body)
    3. Composite key (user_id + operation + timestamp)
    
    =========================================================================
    """
    
    @staticmethod
    def from_header(header_value: str) -> str:
        """Use client-provided idempotency key."""
        return f"idem:{header_value}"
    
    @staticmethod
    def from_request(
        method: str,
        path: str,
        body: Optional[dict] = None,
        user_id: Optional[str] = None
    ) -> str:
        """
        Generate idempotency key from request details.
        
        Args:
            method: HTTP method
            path: Request path
            body: Request body (optional)
            user_id: User ID (optional)
            
        Returns:
            Generated idempotency key
        """
        components = [method.upper(), path]
        
        if user_id:
            components.append(str(user_id))
        
        if body:
            # Sort keys for consistent hashing
            body_str = json.dumps(body, sort_keys=True, default=str)
            components.append(body_str)
        
        combined = "|".join(components)
        key_hash = hashlib.sha256(combined.encode()).hexdigest()[:32]
        
        return f"idem:{key_hash}"
    
    @staticmethod
    def from_message(
        exchange: str,
        routing_key: str,
        message_id: str
    ) -> str:
        """
        Generate idempotency key for message processing.
        
        Args:
            exchange: RabbitMQ exchange name
            routing_key: Message routing key
            message_id: Unique message ID
            
        Returns:
            Generated idempotency key
        """
        return f"msg:{exchange}:{routing_key}:{message_id}"
    
    @staticmethod
    def for_saga(
        saga_id: str,
        step_name: str
    ) -> str:
        """
        Generate idempotency key for saga step execution.
        
        Ensures saga steps are executed exactly once even during retries.
        """
        return f"saga:{saga_id}:{step_name}"


class IdempotencyStore:
    """
    =========================================================================
    IDEMPOTENCY STORE
    =========================================================================
    
    Stores idempotency records in PostgreSQL for durability.
    
    Design Decisions:
    1. Uses PostgreSQL for durability (survives restarts)
    2. TTL-based cleanup to prevent unbounded growth
    3. Row-level locking for concurrent access
    4. Response caching to return same result for duplicate requests
    
    Table Schema:
        CREATE TABLE idempotency_keys (
            key VARCHAR(255) PRIMARY KEY,
            status VARCHAR(50) NOT NULL,
            response JSONB,
            request_hash VARCHAR(64),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    
    =========================================================================
    """
    
    def __init__(
        self,
        db_config: dict,
        default_ttl: int = 86400,  # 24 hours in seconds
        cleanup_interval: int = 3600  # 1 hour in seconds
    ):
        """
        Initialize idempotency store.
        
        Args:
            db_config: PostgreSQL connection configuration
            default_ttl: Default TTL for idempotency keys (seconds)
            cleanup_interval: Interval for cleanup of expired keys
        """
        self.db_config = db_config
        self.default_ttl = default_ttl
        self.cleanup_interval = cleanup_interval
        self._local_cache: Dict[str, IdempotencyRecord] = {}
        self._cache_lock = threading.Lock()
        
        # Ensure table exists
        self._init_table()
    
    def _get_connection(self):
        """Get database connection."""
        return psycopg2.connect(
            **self.db_config,
            cursor_factory=RealDictCursor
        )
    
    def _init_table(self):
        """Create idempotency table if not exists."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS idempotency_keys (
                key VARCHAR(255) PRIMARY KEY,
                status VARCHAR(50) NOT NULL DEFAULT 'processing',
                response JSONB,
                request_hash VARCHAR(64),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_idempotency_expires 
            ON idempotency_keys(expires_at);
            
            CREATE INDEX IF NOT EXISTS idx_idempotency_status 
            ON idempotency_keys(status);
        """)
        
        conn.commit()
        conn.close()
    
    def check(self, key: str) -> Optional[IdempotencyRecord]:
        """
        Check if idempotency key exists.
        
        Args:
            key: Idempotency key to check
            
        Returns:
            IdempotencyRecord if exists and not expired, None otherwise
        """
        # Check local cache first
        with self._cache_lock:
            if key in self._local_cache:
                record = self._local_cache[key]
                if record.expires_at > datetime.utcnow():
                    return record
                else:
                    del self._local_cache[key]
        
        # Check database
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT key, status, response, request_hash, created_at, expires_at
            FROM idempotency_keys
            WHERE key = %s AND expires_at > NOW()
        """, (key,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            record = IdempotencyRecord(
                key=row['key'],
                status=row['status'],
                response=row['response'],
                created_at=row['created_at'],
                expires_at=row['expires_at'],
                request_hash=row['request_hash'] or ''
            )
            
            # Update local cache
            with self._cache_lock:
                self._local_cache[key] = record
            
            return record
        
        return None
    
    def acquire(
        self,
        key: str,
        request_hash: Optional[str] = None,
        ttl: Optional[int] = None
    ) -> bool:
        """
        Attempt to acquire idempotency key (start processing).
        
        Uses INSERT ... ON CONFLICT to ensure atomicity.
        
        Args:
            key: Idempotency key
            request_hash: Hash of request for validation
            ttl: TTL in seconds (uses default if not provided)
            
        Returns:
            True if acquired, False if key already exists
        """
        ttl = ttl or self.default_ttl
        expires_at = datetime.utcnow() + timedelta(seconds=ttl)
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Try to insert new record
            cursor.execute("""
                INSERT INTO idempotency_keys (key, status, request_hash, expires_at)
                VALUES (%s, 'processing', %s, %s)
                ON CONFLICT (key) DO NOTHING
                RETURNING key
            """, (key, request_hash, expires_at))
            
            result = cursor.fetchone()
            conn.commit()
            
            if result:
                # Successfully acquired
                record = IdempotencyRecord(
                    key=key,
                    status='processing',
                    response=None,
                    created_at=datetime.utcnow(),
                    expires_at=expires_at,
                    request_hash=request_hash or ''
                )
                
                with self._cache_lock:
                    self._local_cache[key] = record
                
                return True
            
            return False
            
        finally:
            conn.close()
    
    def complete(
        self,
        key: str,
        response: Any,
        success: bool = True
    ) -> None:
        """
        Mark idempotency key as completed and store response.
        
        Args:
            key: Idempotency key
            response: Response to cache
            success: Whether operation succeeded
        """
        status = 'completed' if success else 'failed'
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE idempotency_keys
            SET status = %s, 
                response = %s,
                updated_at = NOW()
            WHERE key = %s
        """, (status, json.dumps(response, default=str), key))
        
        conn.commit()
        conn.close()
        
        # Update local cache
        with self._cache_lock:
            if key in self._local_cache:
                self._local_cache[key].status = status
                self._local_cache[key].response = response
    
    def release(self, key: str) -> None:
        """
        Release idempotency key (cancel processing).
        
        Used when operation is cancelled or needs to be retried by another worker.
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM idempotency_keys WHERE key = %s
        """, (key,))
        
        conn.commit()
        conn.close()
        
        # Remove from local cache
        with self._cache_lock:
            self._local_cache.pop(key, None)
    
    def cleanup_expired(self) -> int:
        """
        Remove expired idempotency keys.
        
        Returns:
            Number of removed keys
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM idempotency_keys WHERE expires_at < NOW()
            RETURNING key
        """)
        
        deleted = cursor.fetchall()
        conn.commit()
        conn.close()
        
        # Clear expired from local cache
        with self._cache_lock:
            now = datetime.utcnow()
            expired_keys = [
                k for k, v in self._local_cache.items()
                if v.expires_at < now
            ]
            for k in expired_keys:
                del self._local_cache[k]
        
        return len(deleted)


class InMemoryIdempotencyStore:
    """
    In-memory idempotency store for testing and development.
    Not suitable for production distributed systems.
    """
    
    def __init__(self, default_ttl: int = 86400):
        self.default_ttl = default_ttl
        self._store: Dict[str, IdempotencyRecord] = {}
        self._lock = threading.Lock()
    
    def check(self, key: str) -> Optional[IdempotencyRecord]:
        with self._lock:
            record = self._store.get(key)
            if record and record.expires_at > datetime.utcnow():
                return record
            elif record:
                del self._store[key]
            return None
    
    def acquire(
        self,
        key: str,
        request_hash: Optional[str] = None,
        ttl: Optional[int] = None
    ) -> bool:
        with self._lock:
            existing = self._store.get(key)
            if existing and existing.expires_at > datetime.utcnow():
                return False
            
            self._store[key] = IdempotencyRecord(
                key=key,
                status='processing',
                response=None,
                created_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(seconds=ttl or self.default_ttl),
                request_hash=request_hash or ''
            )
            return True
    
    def complete(self, key: str, response: Any, success: bool = True) -> None:
        with self._lock:
            if key in self._store:
                self._store[key].status = 'completed' if success else 'failed'
                self._store[key].response = response
    
    def release(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)


# =============================================================================
# IDEMPOTENCY DECORATORS
# =============================================================================

def idempotent(
    key_generator: Callable[..., str],
    store: IdempotencyStore,
    ttl: int = 86400
) -> Callable:
    """
    Decorator to make a function idempotent.
    
    Usage:
        @idempotent(
            key_generator=lambda order_id: f"create_order:{order_id}",
            store=idempotency_store
        )
        def create_order(order_id, data):
            # Create order
            pass
    
    Args:
        key_generator: Function to generate idempotency key from args
        store: IdempotencyStore instance
        ttl: TTL for the idempotency key
        
    Returns:
        Decorated function
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate idempotency key
            key = key_generator(*args, **kwargs)
            
            # Check for existing record
            existing = store.check(key)
            if existing:
                if existing.status == 'completed':
                    # Return cached response
                    return existing.response
                elif existing.status == 'processing':
                    # Another worker is processing
                    raise IdempotencyConflict(
                        f"Request {key} is already being processed"
                    )
                elif existing.status == 'failed':
                    # Previous attempt failed - allow retry
                    store.release(key)
            
            # Try to acquire the key
            if not store.acquire(key, ttl=ttl):
                raise IdempotencyConflict(
                    f"Request {key} is already being processed"
                )
            
            try:
                # Execute the function
                result = func(*args, **kwargs)
                
                # Store success result
                store.complete(key, result, success=True)
                
                return result
                
            except Exception as e:
                # Store failure
                store.complete(key, {'error': str(e)}, success=False)
                raise
        
        return wrapper
    return decorator


class IdempotencyConflict(Exception):
    """Raised when idempotency conflict is detected."""
    pass


# =============================================================================
# FLASK MIDDLEWARE
# =============================================================================

class FlaskIdempotencyMiddleware:
    """
    Flask middleware for handling idempotency headers.
    
    Usage:
        from flask import Flask
        
        app = Flask(__name__)
        idempotency_middleware = FlaskIdempotencyMiddleware(app, store)
    """
    
    def __init__(
        self,
        app,
        store: IdempotencyStore,
        header_name: str = 'X-Idempotency-Key',
        methods: tuple = ('POST', 'PUT', 'PATCH')
    ):
        self.store = store
        self.header_name = header_name
        self.methods = methods
        
        app.before_request(self.before_request)
        app.after_request(self.after_request)
    
    def before_request(self):
        from flask import request, g, jsonify
        
        # Only apply to specified methods
        if request.method not in self.methods:
            return None
        
        # Get idempotency key from header
        idempotency_key = request.headers.get(self.header_name)
        if not idempotency_key:
            return None
        
        key = IdempotencyKey.from_header(idempotency_key)
        g.idempotency_key = key
        
        # Check for existing record
        existing = self.store.check(key)
        if existing:
            if existing.status == 'completed':
                # Return cached response
                g.idempotent_response = existing.response
                return jsonify(existing.response), 200
            elif existing.status == 'processing':
                return jsonify({
                    'error': 'Request is already being processed'
                }), 409
        
        # Acquire the key
        if not self.store.acquire(key):
            return jsonify({
                'error': 'Request is already being processed'
            }), 409
        
        return None
    
    def after_request(self, response):
        from flask import g
        
        idempotency_key = getattr(g, 'idempotency_key', None)
        if idempotency_key and response.status_code in (200, 201):
            try:
                response_data = response.get_json()
                self.store.complete(idempotency_key, response_data)
            except:
                pass
        
        return response
