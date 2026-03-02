# Google Maps API Setup Guide

## Problem
Getting error: "This page didn't load Google Maps correctly"

## Cause
The current API key (`AIzaSyBqHwJGmEk2G4vKXGXk3FqH_4RJWOg8i-M`) is not properly configured or has restrictions.

## Solution: Get Your Own API Key

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Create a new project or select existing project

### Step 2: Enable Required APIs
Go to **APIs & Services** → **Library** and enable:
- ✅ **Maps JavaScript API** (Required for map display)
- ✅ **Geocoding API** (Required for address lookup)
- ✅ **Places API** (Optional but recommended)

### Step 3: Create API Key
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **API Key**
3. Copy your new API key

### Step 4: Configure API Key (Important!)
Click **Edit API Key** and configure:

#### Application Restrictions:
- Select: **HTTP referrers (web sites)**
- Add referrers:
  ```
  http://localhost:*
  http://127.0.0.1:*
  http://localhost:5173/*
  http://localhost:5174/*
  ```

#### API Restrictions:
- Select: **Restrict key**
- Check only:
  - Maps JavaScript API
  - Geocoding API
  - Places API

### Step 5: Update .env File
Edit `/swifttrack-frontend/.env`:
```bash
VITE_GOOGLE_MAPS_API_KEY=YOUR_NEW_API_KEY_HERE
```

### Step 6: Restart Frontend
```bash
cd swifttrack-frontend
npm run dev
```

## Alternative: Manual Coordinate Entry

If you can't configure Google Maps, the app now provides a fallback:
1. Click "Pick on Map" 
2. Use the manual lat/lng input fields
3. Example coordinates:
   - Colombo: `6.9271, 79.8612`
   - Kandy: `7.2906, 80.6337`
   - Galle: `6.0535, 80.2210`
   - Jaffna: `9.6615, 80.0255`

## Testing Your API Key

Test if Geocoding API works:
```bash
curl "https://maps.googleapis.com/maps/api/geocode/json?latlng=6.9271,79.8612&key=YOUR_KEY"
```

Should return `"status": "OK"` (not "REQUEST_DENIED")

## Free Tier Limits
Google provides:
- $200 free credit per month
- Sufficient for ~28,000 map loads
- Perfect for development/testing

## Support
If issues persist, check:
1. Billing is enabled in Google Cloud (required even for free tier)
2. API key has no IP restrictions blocking localhost
3. Browser console for specific error messages
