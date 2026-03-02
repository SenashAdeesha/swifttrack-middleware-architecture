import { createContext, useContext, useEffect, useState } from 'react';
import { useLoadScript } from '@react-google-maps/api';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBqHwJGmEk2G4vKXGXk3FqH_4RJWOg8i-M';

const GoogleMapsContext = createContext({
  isLoaded: false,
  loadError: null,
});

export const useGoogleMaps = () => {
  const context = useContext(GoogleMapsContext);
  if (!context) {
    throw new Error('useGoogleMaps must be used within GoogleMapsProvider');
  }
  return context;
};

const libraries = ['places'];

export const GoogleMapsProvider = ({ children }) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries, // Use constant array reference
  });

  const [displayError, setDisplayError] = useState(null);

  useEffect(() => {
    if (loadError) {
      console.error('Google Maps Load Error:', loadError);
      setDisplayError('Failed to load Google Maps. Please check API key configuration.');
    }
  }, [loadError]);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError: displayError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
};
