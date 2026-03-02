import { useState, useCallback, useRef } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { MapPin, X, Check, Loader2, Navigation } from 'lucide-react';
import { Button, Modal } from './index';
import { useGoogleMaps } from '../../context/GoogleMapsContext';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBqHwJGmEk2G4vKXGXk3FqH_4RJWOg8i-M';

const mapContainerStyle = {
  width: '100%',
  height: '500px',
  borderRadius: '0.75rem',
};

// Default center: Colombo, Sri Lanka
const defaultCenter = {
  lat: 6.9271,
  lng: 79.8612,
};

const MapPicker = ({ isOpen, onClose, onSelectLocation, initialLocation, title = 'Select Location' }) => {
  const { isLoaded, loadError } = useGoogleMaps();
  const [selectedPosition, setSelectedPosition] = useState(initialLocation || null);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState(initialLocation || defaultCenter);
  const mapRef = useRef(null);

  const onMapClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setSelectedPosition({ lat, lng });
    reverseGeocode(lat, lng);
  }, []);

  const reverseGeocode = async (lat, lng) => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        setAddress(data.results[0].formatted_address);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const newPos = { lat, lng };
          setSelectedPosition(newPos);
          setMapCenter(newPos);
          reverseGeocode(lat, lng);
          if (mapRef.current) {
            mapRef.current.panTo(newPos);
          }
          setLoading(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          setLoading(false);
          alert('Unable to get your current location. Please select a location on the map.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  const handleConfirm = () => {
    if (selectedPosition) {
      onSelectLocation({
        lat: selectedPosition.lat,
        lng: selectedPosition.lng,
        address: address || 'Selected Location',
      });
      onClose();
    }
  };

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  if (loadError) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
        <div className="p-8 text-center">
          <div className="text-red-500 mb-4">
            <MapPin className="w-12 h-12 mx-auto" />
          </div>
          <p className="text-red-600 dark:text-red-400">
            Error loading Google Maps. Please check your API key and try again.
          </p>
        </div>
      </Modal>
    );
  }

  if (!isLoaded) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
        <div className="p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary-500 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading Google Maps...</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="space-y-4">
        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Click on the map to select a location, or use your current location
          </p>
        </div>

        {/* Current Location Button */}
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            size="sm"
            icon={Navigation}
            onClick={handleGetCurrentLocation}
            disabled={loading}
          >
            Use Current Location
          </Button>
          {loading && (
            <span className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Getting location...
            </span>
          )}
        </div>

        {/* Map Container */}
        <div className="border-2 border-gray-200 dark:border-slate-600 rounded-xl overflow-hidden">
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={13}
            onClick={onMapClick}
            onLoad={onMapLoad}
            options={{
              streetViewControl: false,
              mapTypeControl: true,
              fullscreenControl: true,
              zoomControl: true,
            }}
          >
            {selectedPosition && (
              <Marker
                position={selectedPosition}
                animation={window.google?.maps?.Animation?.DROP}
              />
            )}
          </GoogleMap>
        </div>

        {/* Selected Address Display */}
        {selectedPosition && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">
              Selected Location:
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {address || `Lat: ${selectedPosition.lat.toFixed(6)}, Lng: ${selectedPosition.lng.toFixed(6)}`}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
          <Button variant="ghost" onClick={onClose} icon={X}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedPosition}
            icon={Check}
          >
            Confirm Location
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default MapPicker;
