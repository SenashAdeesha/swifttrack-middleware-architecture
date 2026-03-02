-- ============================================================================
-- Migration V4: Remove Pickup Location Fields
-- Date: 2026-02-25
-- Description: Remove pickup address and coordinate fields, keep only delivery
-- ============================================================================

-- Drop pickup-related columns
ALTER TABLE orders DROP COLUMN IF EXISTS pickup_address;
ALTER TABLE orders DROP COLUMN IF EXISTS pickup_lat;
ALTER TABLE orders DROP COLUMN IF EXISTS pickup_lng;

-- Drop indexes related to pickup coordinates
DROP INDEX IF EXISTS idx_orders_pickup_coords;

-- Commit the changes
COMMIT;

-- Display success message
SELECT 'Migration V4 completed: Pickup location fields removed from orders table' AS status;
