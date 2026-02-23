-- ============================================================================
-- SwiftTrack Logistics - Additional Schema for Enhanced Features
-- ============================================================================
-- This migration adds tables for:
-- - Dead Letter Queue message persistence
-- - Idempotency keys
-- - Enhanced SAGA state
-- - Circuit breaker metrics
-- ============================================================================

-- ============================================================================
-- DROP EXISTING TABLES IF RECREATING
-- ============================================================================
-- Only run these if you need to reset:
-- DROP TABLE IF EXISTS dlq_messages CASCADE;
-- DROP TABLE IF EXISTS idempotency_keys CASCADE;
-- DROP TABLE IF EXISTS circuit_breaker_metrics CASCADE;

-- ============================================================================
-- DEAD LETTER QUEUE MESSAGES TABLE
-- ============================================================================
-- Stores failed messages from RabbitMQ DLQ for analysis and retry
CREATE TABLE IF NOT EXISTS dlq_messages (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    queue_name VARCHAR(255) NOT NULL,
    exchange VARCHAR(255),
    routing_key VARCHAR(255),
    payload JSONB NOT NULL,
    headers JSONB,
    error_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'retried', 'archived', 'discarded')),
    original_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for DLQ queries
CREATE INDEX IF NOT EXISTS idx_dlq_messages_queue ON dlq_messages(queue_name);
CREATE INDEX IF NOT EXISTS idx_dlq_messages_status ON dlq_messages(status);
CREATE INDEX IF NOT EXISTS idx_dlq_messages_created_at ON dlq_messages(created_at);

-- ============================================================================
-- IDEMPOTENCY KEYS TABLE
-- ============================================================================
-- Stores idempotency keys to prevent duplicate request processing
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    request_hash VARCHAR(64),
    response JSONB,
    status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for idempotency key lookup
CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_keys(key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- ============================================================================
-- CIRCUIT BREAKER METRICS TABLE
-- ============================================================================
-- Tracks circuit breaker state changes and metrics
CREATE TABLE IF NOT EXISTS circuit_breaker_metrics (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(255) NOT NULL,
    state VARCHAR(50) NOT NULL CHECK (state IN ('closed', 'open', 'half_open')),
    failure_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    last_failure_time TIMESTAMP WITH TIME ZONE,
    last_success_time TIMESTAMP WITH TIME ZONE,
    state_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for circuit breaker queries
CREATE INDEX IF NOT EXISTS idx_cb_metrics_service ON circuit_breaker_metrics(service_name);
CREATE INDEX IF NOT EXISTS idx_cb_metrics_state ON circuit_breaker_metrics(state);

-- ============================================================================
-- ENHANCED SAGA STATE TABLE (if not exists)
-- ============================================================================
-- Drop and recreate saga_state with enhanced schema if needed
-- Note: This will only create if it doesn't exist due to IF NOT EXISTS

-- Add new columns to existing saga_state if needed
DO $$
BEGIN
    -- Add correlation_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'saga_state' AND column_name = 'correlation_id') THEN
        ALTER TABLE saga_state ADD COLUMN correlation_id VARCHAR(255);
    END IF;
    
    -- Add completed_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'saga_state' AND column_name = 'completed_at') THEN
        ALTER TABLE saga_state ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add step_states column (JSONB) if using legacy schema
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'saga_state' AND column_name = 'step_states') THEN
        ALTER TABLE saga_state ADD COLUMN step_states JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- Add data column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'saga_state' AND column_name = 'data') THEN
        ALTER TABLE saga_state ADD COLUMN data JSONB;
    END IF;
    
    -- Add error column if it doesn't exist (rename from error_message)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'saga_state' AND column_name = 'error') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'saga_state' AND column_name = 'error_message') THEN
            ALTER TABLE saga_state RENAME COLUMN error_message TO error;
        ELSE
            ALTER TABLE saga_state ADD COLUMN error TEXT;
        END IF;
    END IF;
END $$;

-- Create new saga_state table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS saga_state (
    id VARCHAR(100) PRIMARY KEY,
    saga_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'completed', 'compensating', 'failed', 'compensated')),
    current_step INTEGER DEFAULT 0,
    data JSONB,
    step_states JSONB DEFAULT '[]'::jsonb,
    correlation_id VARCHAR(255),
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- REQUEST CORRELATION TABLE
-- ============================================================================
-- Tracks distributed request correlation across services
CREATE TABLE IF NOT EXISTS request_correlations (
    id SERIAL PRIMARY KEY,
    correlation_id VARCHAR(255) NOT NULL,
    request_id VARCHAR(255),
    parent_id VARCHAR(255),
    service_name VARCHAR(100) NOT NULL,
    operation VARCHAR(255),
    user_id INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
    metadata JSONB
);

-- Indexes for correlation lookup
CREATE INDEX IF NOT EXISTS idx_correlation_id ON request_correlations(correlation_id);
CREATE INDEX IF NOT EXISTS idx_correlation_request ON request_correlations(request_id);
CREATE INDEX IF NOT EXISTS idx_correlation_started ON request_correlations(started_at);

-- ============================================================================
-- SERVICE HEALTH TABLE
-- ============================================================================
-- Tracks service health status over time
CREATE TABLE IF NOT EXISTS service_health (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    response_time_ms INTEGER,
    error_rate DECIMAL(5,2),
    last_check_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details JSONB
);

-- Index for health queries
CREATE INDEX IF NOT EXISTS idx_health_service ON service_health(service_name);
CREATE INDEX IF NOT EXISTS idx_health_status ON service_health(status);

-- ============================================================================
-- AUDIT LOG TABLE
-- ============================================================================
-- Comprehensive audit log for compliance and debugging
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    correlation_id VARCHAR(255),
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    service_name VARCHAR(100),
    metadata JSONB
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function to clean up expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM idempotency_keys 
    WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to archive old DLQ messages
CREATE OR REPLACE FUNCTION archive_old_dlq_messages(days_old INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER;
BEGIN
    UPDATE dlq_messages 
    SET status = 'archived', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending' 
    AND created_at < CURRENT_TIMESTAMP - (days_old || ' days')::INTERVAL;
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger for DLQ messages updated_at
DROP TRIGGER IF EXISTS update_dlq_messages_updated_at ON dlq_messages;
CREATE TRIGGER update_dlq_messages_updated_at 
    BEFORE UPDATE ON dlq_messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for idempotency keys updated_at
DROP TRIGGER IF EXISTS update_idempotency_keys_updated_at ON idempotency_keys;
CREATE TRIGGER update_idempotency_keys_updated_at 
    BEFORE UPDATE ON idempotency_keys 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANTS (if needed for specific users)
-- ============================================================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO swifttrack_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO swifttrack_user;

COMMIT;
