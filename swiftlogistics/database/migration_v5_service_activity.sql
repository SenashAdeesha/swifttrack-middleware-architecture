-- ============================================================================
-- Migration V5: Service Activity Logs Table
-- ============================================================================
-- Records all CMS, WMS, and ROS service interactions for audit and monitoring
-- ============================================================================

-- ============================================================================
-- SERVICE ACTIVITY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS service_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(50) REFERENCES orders(id) ON DELETE CASCADE,
    service_name VARCHAR(50) NOT NULL CHECK (service_name IN ('CMS', 'WMS', 'ROS')),
    service_type VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('started', 'success', 'failed', 'skipped')),
    protocol VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255),
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_service_activity_order_id ON service_activity(order_id);
CREATE INDEX IF NOT EXISTS idx_service_activity_service_name ON service_activity(service_name);
CREATE INDEX IF NOT EXISTS idx_service_activity_status ON service_activity(status);
CREATE INDEX IF NOT EXISTS idx_service_activity_created_at ON service_activity(created_at DESC);

-- Add comment
COMMENT ON TABLE service_activity IS 'Logs all CMS (SOAP/XML), WMS (RabbitMQ), and ROS (REST/JSON) service interactions';
