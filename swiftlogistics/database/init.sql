-- ============================================================================
-- SwiftTrack Logistics - Database Schema
-- ============================================================================
-- PostgreSQL database schema for the logistics system
-- Includes: Users, Orders, Drivers, Clients, Saga State, Audit Logs
-- ============================================================================

-- Enable UUID extension (for other tables that still use it)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE (Authentication & Authorization)
-- ============================================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('client', 'driver', 'admin')),
    phone VARCHAR(50),
    avatar VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CLIENTS TABLE
-- ============================================================================
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    company VARCHAR(255),
    address TEXT,
    total_orders INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DRIVERS TABLE
-- ============================================================================
CREATE TABLE drivers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type VARCHAR(100),
    vehicle_plate VARCHAR(50),
    license_number VARCHAR(100),
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_deliveries INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 100.00,
    current_lat DECIMAL(10,8),
    current_lng DECIMAL(11,8),
    status VARCHAR(50) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'busy', 'offline')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ORDERS TABLE
-- ============================================================================
CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id),
    driver_id INTEGER REFERENCES drivers(id),
    pickup_address TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    package_weight DECIMAL(10,2),
    package_type VARCHAR(50),
    priority VARCHAR(50) DEFAULT 'normal' CHECK (priority IN ('normal', 'express', 'same_day')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_warehouse', 'out_for_delivery', 'delivered', 'failed', 'cancelled')),
    estimated_delivery TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failure_reason VARCHAR(255),
    failure_notes TEXT,
    special_instructions TEXT,
    amount DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ORDER TIMELINE TABLE (Tracking history)
-- ============================================================================
CREATE TABLE order_timeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(50) REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- WAREHOUSE INVENTORY TABLE (WMS)
-- ============================================================================
CREATE TABLE warehouse_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(50) REFERENCES orders(id),
    location_code VARCHAR(50),
    shelf_number VARCHAR(50),
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    dispatched_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'received' CHECK (status IN ('received', 'stored', 'picked', 'dispatched'))
);

-- ============================================================================
-- ROUTES TABLE (ROS)
-- ============================================================================
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id INTEGER REFERENCES drivers(id),
    date DATE NOT NULL,
    optimized BOOLEAN DEFAULT FALSE,
    total_distance DECIMAL(10,2),
    estimated_duration INTEGER, -- in minutes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ROUTE STOPS TABLE
-- ============================================================================
CREATE TABLE route_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    order_id VARCHAR(50) REFERENCES orders(id),
    sequence_number INTEGER NOT NULL,
    estimated_arrival TIMESTAMP WITH TIME ZONE,
    actual_arrival TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped'))
);

-- ============================================================================
-- SAGA STATE TABLE (Distributed Transaction Management)
-- ============================================================================
CREATE TABLE saga_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    saga_id VARCHAR(100) UNIQUE NOT NULL,
    saga_type VARCHAR(100) NOT NULL,
    current_step VARCHAR(100),
    status VARCHAR(50) DEFAULT 'started' CHECK (status IN ('started', 'processing', 'completed', 'compensating', 'failed')),
    payload JSONB,
    steps_completed JSONB DEFAULT '[]'::jsonb,
    compensation_data JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SYSTEM LOGS TABLE
-- ============================================================================
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('info', 'warning', 'error', 'success')),
    message TEXT NOT NULL,
    source VARCHAR(100),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    message TEXT,
    read BOOLEAN DEFAULT FALSE,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- BILLING HISTORY TABLE
-- ============================================================================
CREATE TABLE billing_history (
    id VARCHAR(50) PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id),
    amount DECIMAL(10,2) NOT NULL,
    orders_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
    billing_date DATE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MESSAGE OUTBOX TABLE (Transactional Outbox Pattern)
-- ============================================================================
CREATE TABLE message_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- DELIVERY PROOFS TABLE
-- ============================================================================
CREATE TABLE delivery_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(50) REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
    proof_type VARCHAR(50) NOT NULL CHECK (proof_type IN ('photo', 'signature', 'both')),
    proof_data TEXT NOT NULL,
    recipient_name VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_driver_id ON orders(driver_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_timeline_order_id ON order_timeline(order_id);
CREATE INDEX idx_saga_state_saga_id ON saga_state(saga_id);
CREATE INDEX idx_saga_state_status ON saga_state(status);
CREATE INDEX idx_system_logs_type ON system_logs(type);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_message_outbox_status ON message_outbox(status);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert demo users with bcrypt hashed password 'password123'
INSERT INTO users (id, email, password_hash, name, role, phone, status) VALUES
    (1, 'client@swifttrack.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G/tmZ/5.5.XFTS', 'John Client', 'client', '+1 234 567 8901', 'active'),
    (2, 'driver@swifttrack.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G/tmZ/5.5.XFTS', 'Mike Driver', 'driver', '+1 234 567 8902', 'active'),
    (3, 'admin@swifttrack.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G/tmZ/5.5.XFTS', 'Sarah Admin', 'admin', '+1 234 567 8903', 'active')
ON CONFLICT (id) DO NOTHING;

-- Reset sequence to continue from 4
SELECT setval('users_id_seq', 3, true);

-- Insert client profile
INSERT INTO clients (id, user_id, company, address, total_orders, status) VALUES
    (1, 1, 'TechCorp Inc.', '123 Business Ave, New York, NY 10001', 45, 'active')
ON CONFLICT (id) DO NOTHING;

-- Reset sequence
SELECT setval('clients_id_seq', 1, true);

-- Insert driver profile
INSERT INTO drivers (id, user_id, vehicle_type, vehicle_plate, rating, total_deliveries, success_rate, current_lat, current_lng, status) VALUES
    (1, 2, 'Van', 'NYC-1234', 4.80, 1247, 98.50, 40.7128, -74.0060, 'active')
ON CONFLICT (id) DO NOTHING;

-- Reset sequence
SELECT setval('drivers_id_seq', 1, true);

-- Insert sample orders
INSERT INTO orders (id, client_id, driver_id, pickup_address, delivery_address, package_weight, package_type, priority, status, estimated_delivery, created_at) VALUES
    ('ORD-001', 1, 1, '123 Business Ave, New York, NY 10001', '456 Residential St, Brooklyn, NY 11201', 2.5, 'small_box', 'express', 'out_for_delivery', '2026-02-20 14:00:00+00', '2026-02-19 10:00:00+00'),
    ('ORD-002', 1, 1, '789 Tech Park, Manhattan, NY 10012', '321 Garden Lane, Queens, NY 11375', 0.5, 'document', 'normal', 'delivered', '2026-02-19 17:00:00+00', '2026-02-17 09:00:00+00'),
    ('ORD-003', 1, NULL, '555 Market St, Manhattan, NY 10013', '888 Lake View, Bronx, NY 10451', 5.0, 'electronics', 'express', 'pending', '2026-02-21 17:00:00+00', '2026-02-20 08:00:00+00'),
    ('ORD-004', 1, 1, '100 Innovation Blvd, Manhattan, NY 10014', '200 Sunset Dr, Staten Island, NY 10301', 1.2, 'fragile', 'same_day', 'in_warehouse', '2026-02-20 18:00:00+00', '2026-02-20 06:00:00+00'),
    ('ORD-005', 1, 1, '777 Corporate Ave, Manhattan, NY 10015', '333 Elm Street, Brooklyn, NY 11215', 3.0, 'medium_box', 'normal', 'failed', '2026-02-18 17:00:00+00', '2026-02-15 11:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- Insert order timeline entries
INSERT INTO order_timeline (order_id, status, description, created_at) VALUES
    ('ORD-001', 'created', 'Order placed', '2026-02-19 10:00:00+00'),
    ('ORD-001', 'confirmed', 'Order confirmed', '2026-02-19 10:15:00+00'),
    ('ORD-001', 'in_warehouse', 'Package received at warehouse', '2026-02-19 12:00:00+00'),
    ('ORD-001', 'out_for_delivery', 'Out for delivery', '2026-02-20 08:00:00+00'),
    ('ORD-002', 'created', 'Order placed', '2026-02-17 09:00:00+00'),
    ('ORD-002', 'confirmed', 'Order confirmed', '2026-02-17 09:10:00+00'),
    ('ORD-002', 'delivered', 'Delivered successfully', '2026-02-19 15:30:00+00'),
    ('ORD-003', 'created', 'Order placed', '2026-02-20 08:00:00+00'),
    ('ORD-004', 'created', 'Order placed', '2026-02-20 06:00:00+00'),
    ('ORD-004', 'confirmed', 'Order confirmed', '2026-02-20 06:05:00+00'),
    ('ORD-004', 'in_warehouse', 'Package received at warehouse', '2026-02-20 09:00:00+00'),
    ('ORD-005', 'created', 'Order placed', '2026-02-15 11:00:00+00'),
    ('ORD-005', 'failed', 'Delivery failed - Customer not available', '2026-02-18 14:00:00+00');

-- Insert sample billing history
INSERT INTO billing_history (id, client_id, amount, orders_count, status, billing_date) VALUES
    ('INV-001', 1, 125.50, 5, 'paid', '2026-02-15'),
    ('INV-002', 1, 287.00, 12, 'paid', '2026-02-01'),
    ('INV-003', 1, 156.75, 7, 'paid', '2026-01-15'),
    ('INV-004', 1, 342.25, 15, 'paid', '2026-01-01')
ON CONFLICT (id) DO NOTHING;

-- Insert sample system logs
INSERT INTO system_logs (type, message, source, created_at) VALUES
    ('info', 'System startup completed', 'system', '2026-02-20 06:00:00+00'),
    ('success', 'Database backup completed', 'database', '2026-02-20 05:00:00+00'),
    ('warning', 'High server load detected', 'server', '2026-02-20 04:30:00+00'),
    ('error', 'Payment gateway timeout', 'payment', '2026-02-20 03:45:00+00'),
    ('info', 'New driver registered', 'auth', '2026-02-20 03:00:00+00'),
    ('success', 'Route optimization completed', 'routing', '2026-02-20 02:30:00+00'),
    ('error', 'SMS notification failed', 'notification', '2026-02-20 02:00:00+00'),
    ('info', 'Cache cleared', 'cache', '2026-02-20 01:30:00+00');

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_saga_state_updated_at BEFORE UPDATE ON saga_state FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate order ID
CREATE OR REPLACE FUNCTION generate_order_id()
RETURNS VARCHAR AS $$
DECLARE
    next_id INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 5) AS INTEGER)), 0) + 1 INTO next_id FROM orders WHERE id LIKE 'ORD-%';
    RETURN 'ORD-' || LPAD(next_id::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

COMMIT;
