# Google Maps Integration Guide

## Overview
The SwiftTrack application now includes Google Maps integration for precise location selection when creating orders. Clients can click on a map to select exact pickup and delivery locations, ensuring accurate geocoding.

## Features Added

### 1. **MapPicker Component**
- Interactive Google Map with click-to-select functionality
- Current location detection using browser geolocation
- Reverse geocoding to convert coordinates to addresses
- Visual marker showing selected location
- Responsive modal interface

### 2. **Order Creation Integration**
- "Pick on Map" buttons for both pickup and delivery addresses
- Automatic address population from selected coordinates
- Visual confirmation when location is selected on map
- Coordinates (lat/lng) stored with each order

### 3. **Database Changes**
- Added `pickup_lat` and `pickup_lng` columns to orders table
- Added `delivery_lat` and `delivery_lng` columns to orders table
- Geographic indexes for future optimization
- Migration script: `database/migration_v3_coords.sql`

## How to Use

### For Clients Creating Orders:

1. **Navigate to New Order Page**
   ```
   http://localhost:5173/client/new-order
   ```

2. **Select Pickup Location**
   - Click the "Pick on Map" button in the Pickup Location section
   - The map modal will open centered on Colombo, Sri Lanka
   - Click "Use Current Location" to automatically detect your location (requires browser permission)
   - OR click anywhere on the map to select a location
   - The selected address will be displayed
   - Click "Confirm Location" to save

3. **Select Delivery Location**
   - Same process as pickup location
   - Click "Pick on Map" in the Delivery Location section

4. **Complete Order**
   - Continue with package details and schedule as usual
   - The coordinates are automatically included with the order

## Configuration

### Google Maps API Key

The application uses the Google Maps JavaScript API. To configure:

1. **Get API Key**
   - Visit: https://console.cloud.google.com/google/maps-apis
   - Create a project (or use existing)
   - Enable the following APIs:
     - Maps JavaScript API
     - Geocoding API

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env` in the frontend folder:
     ```bash
     cd swifttrack-frontend
     cp .env.example .env
     ```
   - Update `VITE_GOOGLE_MAPS_API_KEY` with your API key:
     ```
     VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
     ```

3. **Restart Frontend Development Server**
   ```bash
   npm run dev
   ```

## Technical Implementation

### Frontend Components

**MapPicker.jsx** (`/src/components/common/MapPicker.jsx`)
- Uses `@react-google-maps/api` library
- Handles map interactions and geolocation
- Reverse geocodes coordinates to addresses

**NewOrder.jsx** (`/src/pages/client/NewOrder.jsx`)
- Integrates MapPicker modals
- Manages pickup/delivery coordinate state
- Includes coordinates in order submission

### Backend Changes

**Database Migration** (`/database/migration_v3_coords.sql`)
```sql
ALTER TABLE orders ADD COLUMN pickup_lat DECIMAL(10, 8);
ALTER TABLE orders ADD COLUMN pickup_lng DECIMAL(11, 8);
ALTER TABLE orders ADD COLUMN delivery_lat DECIMAL(10, 8);
ALTER TABLE orders ADD COLUMN delivery_lng DECIMAL(11, 8);
```

**Middleware Service** (`/middleware-service/app.py`)
- Updated `create_order()` endpoint to accept and store coordinates
- Coordinates are optional (orders work without them)

## API Changes

### POST /api/orders
Now accepts additional fields:
```json
{
  "pickupAddress": "123 Main St",
  "deliveryAddress": "456 Oak Ave",
  "pickupLat": 6.9271,
  "pickupLng": 79.8612,
  "deliveryLat": 6.9319,
  "deliveryLng": 79.8478,
  // ... other fields
}
```

## Future Enhancements

1. **Address Autocomplete**
   - Use Google Places Autocomplete API
   - Suggest addresses as user types

2. **Route Visualization**
   - Show optimal route on map
   - Display estimated travel time

3. **Driver Location Tracking**
   - Real-time driver position on map
   - Live ETA updates

4. **Geofencing**
   - Automatic notifications when driver enters delivery zone
   - Delivery confirmation based on GPS proximity

## Troubleshooting

### Map Not Loading
- Check if `VITE_GOOGLE_MAPS_API_KEY` is set correctly
- Verify Maps JavaScript API is enabled in Google Cloud Console
- Check browser console for API errors

### "Use Current Location" Not Working
- Ensure browser has location permissions
- HTTPS required in production (localhost works for testing)
- Check browser console for geolocation errors

### Coordinates Not Saved
- Verify database migration was applied successfully
- Check middleware service logs for errors
- Ensure request payload includes lat/lng fields

## Database Verification

To verify coordinates are being stored:
```sql
-- Connect to database
docker exec -it swifttrack-postgres psql -U swifttrack_user -d swifttrack

-- Check recent orders with coordinates
SELECT id, pickup_address, pickup_lat, pickup_lng, 
       delivery_address, delivery_lat, delivery_lng 
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;
```

## Support

For issues or questions:
- Check browser console for errors
- Review Docker logs: `docker logs swiftlogistics-middleware-service-1`
- Ensure all services are running: `docker compose ps`
