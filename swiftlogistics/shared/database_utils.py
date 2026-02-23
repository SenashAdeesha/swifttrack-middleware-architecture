# =============================================================================
# SwiftTrack Logistics - Database Utilities
# =============================================================================
# Production-grade PostgreSQL utilities with connection pooling
# Implements: Connection pooling, Transactional decorator, Health checks
# =============================================================================

import os
import threading
import time
from contextlib import contextmanager
from datetime import datetime
from functools import wraps
from typing import Any, Callable, Dict, Generator, List, Optional, Tuple

import psycopg2
from psycopg2 import pool, sql
from psycopg2.extras import RealDictCursor

from .logging_utils import get_logger

logger = get_logger('database-utils')


# =============================================================================
# CONFIGURATION
# =============================================================================

class DatabaseConfig:
    """Database connection configuration."""
    
    def __init__(
        self,
        host: str = None,
        port: int = None,
        database: str = None,
        user: str = None,
        password: str = None,
        min_connections: int = 2,
        max_connections: int = 10
    ):
        self.host = host or os.environ.get('DB_HOST', 'localhost')
        self.port = port or int(os.environ.get('DB_PORT', 5432))
        self.database = database or os.environ.get('DB_NAME', 'swifttrack')
        self.user = user or os.environ.get('DB_USER', 'swifttrack_user')
        self.password = password or os.environ.get('DB_PASSWORD', 'swifttrack_secure_pass_2026')
        self.min_connections = min_connections
        self.max_connections = max_connections
    
    def get_connection_string(self) -> str:
        """Get PostgreSQL connection string."""
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"
    
    def get_connection_dict(self) -> Dict[str, Any]:
        """Get connection parameters as dictionary."""
        return {
            'host': self.host,
            'port': self.port,
            'database': self.database,
            'user': self.user,
            'password': self.password
        }


# =============================================================================
# CONNECTION POOL
# =============================================================================

class ConnectionPool:
    """
    =========================================================================
    DATABASE CONNECTION POOL
    =========================================================================
    
    Thread-safe PostgreSQL connection pool with:
    - Automatic connection management
    - Health checking
    - Connection recycling
    - Metrics collection
    
    Usage:
        pool = ConnectionPool(config)
        
        with pool.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM orders")
                rows = cur.fetchall()
    
    =========================================================================
    """
    
    _instance: Optional['ConnectionPool'] = None
    _lock = threading.Lock()
    
    def __init__(self, config: DatabaseConfig = None):
        self.config = config or DatabaseConfig()
        self._pool: Optional[pool.ThreadedConnectionPool] = None
        self._stats = {
            'connections_created': 0,
            'connections_returned': 0,
            'errors': 0
        }
        self._initialize_pool()
    
    @classmethod
    def get_instance(cls, config: DatabaseConfig = None) -> 'ConnectionPool':
        """Get or create singleton pool instance."""
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls(config)
            return cls._instance
    
    def _initialize_pool(self) -> None:
        """Initialize the connection pool."""
        try:
            self._pool = pool.ThreadedConnectionPool(
                minconn=self.config.min_connections,
                maxconn=self.config.max_connections,
                **self.config.get_connection_dict()
            )
            logger.info(
                "Database connection pool initialized",
                min_connections=self.config.min_connections,
                max_connections=self.config.max_connections
            )
        except Exception as e:
            logger.error("Failed to initialize connection pool", error=str(e))
            raise
    
    @contextmanager
    def get_connection(self) -> Generator:
        """
        Get a connection from the pool.
        
        Usage:
            with pool.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
        """
        conn = None
        try:
            conn = self._pool.getconn()
            self._stats['connections_created'] += 1
            yield conn
            conn.commit()
        except Exception as e:
            self._stats['errors'] += 1
            if conn:
                conn.rollback()
            logger.error("Database error", error=str(e))
            raise
        finally:
            if conn:
                self._pool.putconn(conn)
                self._stats['connections_returned'] += 1
    
    @contextmanager
    def get_cursor(
        self,
        cursor_factory=RealDictCursor
    ) -> Generator:
        """
        Get a cursor with automatic connection management.
        
        Usage:
            with pool.get_cursor() as cur:
                cur.execute("SELECT * FROM orders")
                rows = cur.fetchall()
        """
        with self.get_connection() as conn:
            cursor = conn.cursor(cursor_factory=cursor_factory)
            try:
                yield cursor
            finally:
                cursor.close()
    
    def execute(
        self,
        query: str,
        params: Tuple = None,
        fetch: bool = True
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Execute a query and optionally fetch results.
        
        Args:
            query: SQL query string
            params: Query parameters
            fetch: Whether to fetch results
        
        Returns:
            List of rows as dictionaries, or None if fetch=False
        """
        with self.get_cursor() as cur:
            cur.execute(query, params)
            if fetch:
                return cur.fetchall()
            return None
    
    def execute_many(
        self,
        query: str,
        params_list: List[Tuple]
    ) -> int:
        """
        Execute a query multiple times with different parameters.
        
        Returns:
            Number of rows affected
        """
        with self.get_cursor() as cur:
            cur.executemany(query, params_list)
            return cur.rowcount
    
    def health_check(self) -> Dict[str, Any]:
        """
        Check database connection health.
        
        Returns:
            Health check result with status and stats
        """
        try:
            with self.get_cursor() as cur:
                cur.execute("SELECT 1 AS health")
                result = cur.fetchone()
                
            return {
                'status': 'healthy',
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'database': self.config.database,
                'stats': self._stats
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'error': str(e),
                'stats': self._stats
            }
    
    def close(self) -> None:
        """Close all connections in the pool."""
        if self._pool:
            self._pool.closeall()
            logger.info("Database connection pool closed")


# =============================================================================
# TRANSACTIONAL DECORATOR
# =============================================================================

def transactional(
    isolation_level: str = None,
    read_only: bool = False
):
    """
    Decorator for transactional database operations.
    
    Features:
    - Automatic commit on success
    - Automatic rollback on failure
    - Configurable isolation level
    - Read-only transaction support
    
    Usage:
        @transactional()
        def create_order(order_data, db_conn):
            cursor = db_conn.cursor()
            cursor.execute("INSERT INTO orders ...")
            return cursor.lastrowid
        
        # With isolation level
        @transactional(isolation_level='SERIALIZABLE')
        def transfer_funds(from_id, to_id, amount, db_conn):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            pool_instance = ConnectionPool.get_instance()
            
            with pool_instance.get_connection() as conn:
                # Set isolation level if specified
                if isolation_level:
                    conn.set_isolation_level(
                        getattr(psycopg2.extensions, f'ISOLATION_LEVEL_{isolation_level}')
                    )
                
                # Set read-only if specified
                if read_only:
                    conn.set_session(readonly=True)
                
                try:
                    # Add connection to kwargs
                    result = func(*args, db_conn=conn, **kwargs)
                    conn.commit()
                    return result
                except Exception as e:
                    conn.rollback()
                    logger.error(
                        "Transaction failed",
                        function=func.__name__,
                        error=str(e)
                    )
                    raise
                finally:
                    # Reset session settings
                    if read_only:
                        conn.set_session(readonly=False)
        
        return wrapper
    return decorator


# =============================================================================
# REPOSITORY BASE CLASS
# =============================================================================

class BaseRepository:
    """
    =========================================================================
    BASE REPOSITORY
    =========================================================================
    
    Base class for database repositories with common operations.
    
    Usage:
        class OrderRepository(BaseRepository):
            def __init__(self):
                super().__init__('orders')
            
            def find_by_status(self, status):
                return self.find({"status": status})
    
    =========================================================================
    """
    
    def __init__(self, table_name: str):
        self.table_name = table_name
        self.pool = ConnectionPool.get_instance()
    
    def find_by_id(self, id: Any) -> Optional[Dict[str, Any]]:
        """Find a record by primary key."""
        query = f"SELECT * FROM {self.table_name} WHERE id = %s"
        
        with self.pool.get_cursor() as cur:
            cur.execute(query, (id,))
            return cur.fetchone()
    
    def find_all(
        self,
        limit: int = 100,
        offset: int = 0,
        order_by: str = 'id'
    ) -> List[Dict[str, Any]]:
        """Find all records with pagination."""
        query = f"""
            SELECT * FROM {self.table_name}
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
        """
        
        with self.pool.get_cursor() as cur:
            cur.execute(query, (limit, offset))
            return cur.fetchall()
    
    def find(
        self,
        conditions: Dict[str, Any],
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Find records matching conditions.
        
        Args:
            conditions: Dictionary of column: value pairs
            limit: Maximum records to return
        """
        where_clauses = []
        params = []
        
        for column, value in conditions.items():
            where_clauses.append(f"{column} = %s")
            params.append(value)
        
        where_sql = " AND ".join(where_clauses)
        query = f"""
            SELECT * FROM {self.table_name}
            WHERE {where_sql}
            LIMIT %s
        """
        params.append(limit)
        
        with self.pool.get_cursor() as cur:
            cur.execute(query, tuple(params))
            return cur.fetchall()
    
    def insert(self, data: Dict[str, Any]) -> Any:
        """
        Insert a new record.
        
        Returns:
            The inserted record's ID
        """
        columns = list(data.keys())
        values = list(data.values())
        placeholders = ["%s"] * len(values)
        
        query = f"""
            INSERT INTO {self.table_name} ({", ".join(columns)})
            VALUES ({", ".join(placeholders)})
            RETURNING id
        """
        
        with self.pool.get_cursor() as cur:
            cur.execute(query, tuple(values))
            result = cur.fetchone()
            return result['id'] if result else None
    
    def update(
        self,
        id: Any,
        data: Dict[str, Any]
    ) -> bool:
        """
        Update a record by ID.
        
        Returns:
            True if updated, False if not found
        """
        set_clauses = []
        params = []
        
        for column, value in data.items():
            set_clauses.append(f"{column} = %s")
            params.append(value)
        
        params.append(id)
        
        query = f"""
            UPDATE {self.table_name}
            SET {", ".join(set_clauses)}
            WHERE id = %s
        """
        
        with self.pool.get_cursor() as cur:
            cur.execute(query, tuple(params))
            return cur.rowcount > 0
    
    def delete(self, id: Any) -> bool:
        """
        Delete a record by ID.
        
        Returns:
            True if deleted, False if not found
        """
        query = f"DELETE FROM {self.table_name} WHERE id = %s"
        
        with self.pool.get_cursor() as cur:
            cur.execute(query, (id,))
            return cur.rowcount > 0
    
    def count(self, conditions: Dict[str, Any] = None) -> int:
        """Count records matching conditions."""
        if conditions:
            where_clauses = []
            params = []
            
            for column, value in conditions.items():
                where_clauses.append(f"{column} = %s")
                params.append(value)
            
            where_sql = " AND ".join(where_clauses)
            query = f"SELECT COUNT(*) as count FROM {self.table_name} WHERE {where_sql}"
        else:
            query = f"SELECT COUNT(*) as count FROM {self.table_name}"
            params = []
        
        with self.pool.get_cursor() as cur:
            cur.execute(query, tuple(params))
            result = cur.fetchone()
            return result['count'] if result else 0
    
    def exists(self, id: Any) -> bool:
        """Check if a record exists."""
        query = f"SELECT 1 FROM {self.table_name} WHERE id = %s LIMIT 1"
        
        with self.pool.get_cursor() as cur:
            cur.execute(query, (id,))
            return cur.fetchone() is not None


# =============================================================================
# MIGRATION UTILITIES
# =============================================================================

class MigrationRunner:
    """
    Simple migration runner for schema changes.
    
    Usage:
        runner = MigrationRunner()
        runner.run_migrations('/path/to/migrations')
    """
    
    def __init__(self):
        self.pool = ConnectionPool.get_instance()
    
    def ensure_migrations_table(self) -> None:
        """Create migrations tracking table if it doesn't exist."""
        query = """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                version VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                checksum VARCHAR(64)
            )
        """
        self.pool.execute(query, fetch=False)
    
    def get_applied_migrations(self) -> List[str]:
        """Get list of applied migration versions."""
        self.ensure_migrations_table()
        
        result = self.pool.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        )
        return [row['version'] for row in result]
    
    def run_migration(self, version: str, sql_content: str) -> bool:
        """
        Run a single migration.
        
        Returns:
            True if applied, False if already applied
        """
        applied = self.get_applied_migrations()
        
        if version in applied:
            logger.info(f"Migration already applied", version=version)
            return False
        
        with self.pool.get_connection() as conn:
            cursor = conn.cursor()
            try:
                # Execute migration
                cursor.execute(sql_content)
                
                # Record migration
                cursor.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s)",
                    (version,)
                )
                
                conn.commit()
                logger.info(f"Migration applied", version=version)
                return True
            except Exception as e:
                conn.rollback()
                logger.error(f"Migration failed", version=version, error=str(e))
                raise


# =============================================================================
# FACTORY FUNCTIONS
# =============================================================================

_pool_instance: Optional[ConnectionPool] = None


def configure_database(
    host: str = None,
    port: int = None,
    database: str = None,
    user: str = None,
    password: str = None,
    min_connections: int = 2,
    max_connections: int = 10
) -> DatabaseConfig:
    """Configure database connection settings."""
    global _pool_instance
    
    config = DatabaseConfig(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password,
        min_connections=min_connections,
        max_connections=max_connections
    )
    
    # Reset pool instance to use new config
    _pool_instance = ConnectionPool(config)
    ConnectionPool._instance = _pool_instance
    
    return config


def get_pool() -> ConnectionPool:
    """Get the database connection pool."""
    return ConnectionPool.get_instance()


def get_connection():
    """Get a database connection from the pool."""
    return get_pool().get_connection()


def get_cursor(cursor_factory=RealDictCursor):
    """Get a cursor with automatic connection management."""
    return get_pool().get_cursor(cursor_factory)


def execute_query(
    query: str,
    params: Tuple = None,
    fetch: bool = True
) -> Optional[List[Dict[str, Any]]]:
    """Execute a query using the connection pool."""
    return get_pool().execute(query, params, fetch)


def health_check() -> Dict[str, Any]:
    """Check database health."""
    return get_pool().health_check()
