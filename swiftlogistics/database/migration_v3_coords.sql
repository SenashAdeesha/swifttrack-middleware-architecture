-- ============================================================================
-- Migration V3: Add Latitude/Longitude columns for addresses
-- Date: 2026-02-25
-- Description: Add geographic coordinates for pickup and delivery locations
-- ============================================================================

-- Add latitude/longitude columns for pickup location
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_lat DECIMAL(10, 8);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_lng DECIMAL(11, 8);

-- Add latitude/longitude columns for delivery location
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat DECIMAL(10, 8);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng DECIMAL(11, 8);

-- Add comments for documentation
COMMENT ON COLUMN orders.pickup_lat IS 'Pickup location latitude (WGS84)';
COMMENT ON COLUMN orders.pickup_lng IS 'Pickup location longitude (WGS84)';
COMMENT ON COLUMN orders.delivery_lat IS 'Delivery location latitude (WGS84)';
COMMENT ON COLUMN orders.delivery_lng IS 'Delivery location longitude (WGS84)';

-- Create index for geospatial queries (optional, for future optimization)
CREATE INDEX IF NOT EXISTS idx_orders_pickup_coords ON orders(pickup_lat, pickup_lng);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_coords ON orders(delivery_lat, delivery_lng);

-- Commit the changes
COMMIT;

-- Display success message
SELECT 'Migration V3 completed: Geographic coordinates columns added to orders table' AS status;
