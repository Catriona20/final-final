import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationCoords, ActiveLocation, SavedLocation } from '../types';
import { apiClient } from './apiClient';

export const LOCATION_STORAGE_KEY = '@patient_app_active_location';

export const CHENNAI_NEIGHBORHOOD_CELLS = [
  { name: 'Mylapore', lat: 13.0338, lng: 80.2677 },
  { name: 'Alwarpet', lat: 13.0335, lng: 80.2522 },
  { name: 'Adyar', lat: 13.0078, lng: 80.2567 },
  { name: 'Besant Nagar', lat: 13.0002, lng: 80.2667 },
  { name: 'Thiruvanmiyur', lat: 12.9830, lng: 80.2590 },
  { name: 'T. Nagar', lat: 13.0418, lng: 80.2341 },
  { name: 'Nungambakkam', lat: 13.0594, lng: 80.2425 },
  { name: 'Guindy', lat: 13.0112, lng: 80.2195 },
  { name: 'Saidapet', lat: 13.0213, lng: 80.2231 },
  { name: 'Kotturpuram', lat: 13.0188, lng: 80.2435 },
  { name: 'Anna Nagar', lat: 13.0850, lng: 80.2101 },
  { name: 'Shenoy Nagar', lat: 13.0780, lng: 80.2230 },
  { name: 'Kilpauk', lat: 13.0780, lng: 80.2420 },
  { name: 'Chetpet', lat: 13.0690, lng: 80.2410 },
  { name: 'Egmore', lat: 13.0784, lng: 80.2608 },
  { name: 'Royapettah', lat: 13.0540, lng: 80.2630 },
  { name: 'Triplicane', lat: 13.0580, lng: 80.2780 },
  { name: 'George Town', lat: 13.0900, lng: 80.2880 },
  { name: 'Royapuram', lat: 13.1075, lng: 80.2936 },
  { name: 'Perambur', lat: 13.1089, lng: 80.2412 },
  { name: 'Kodambakkam', lat: 13.0526, lng: 80.2215 },
  { name: 'Vadapalani', lat: 13.0500, lng: 80.2120 },
  { name: 'Ashok Nagar', lat: 13.0360, lng: 80.2130 },
  { name: 'K.K. Nagar', lat: 13.0380, lng: 80.1960 },
  { name: 'West Mambalam', lat: 13.0370, lng: 80.2250 },
  { name: 'Koyambedu', lat: 13.0694, lng: 80.1948 },
  { name: 'Porur', lat: 13.0382, lng: 80.1565 },
  { name: 'Ramapuram', lat: 13.0315, lng: 80.1790 },
  { name: 'Manapakkam', lat: 13.0205, lng: 80.1635 },
  { name: 'Nandambakkam', lat: 13.0118, lng: 80.1680 },
  { name: 'Mugalivakkam', lat: 13.0195, lng: 80.1620 },
  { name: 'Velachery', lat: 12.9815, lng: 80.2180 },
  { name: 'Madipakkam', lat: 12.9647, lng: 80.1961 },
  { name: 'Medavakkam', lat: 12.9185, lng: 80.1912 },
  { name: 'Perungudi', lat: 12.9654, lng: 80.2461 },
  { name: 'Taramani', lat: 12.9863, lng: 80.2432 },
  { name: 'Thoraipakkam (OMR)', lat: 12.9348, lng: 80.2312 },
  { name: 'Sholinganallur', lat: 12.8988, lng: 80.2281 },
  { name: 'ECR (Neelankarai)', lat: 12.9512, lng: 80.2567 },
  { name: 'Tambaram', lat: 12.9249, lng: 80.1478 },
  { name: 'Chromepet', lat: 12.9516, lng: 80.1408 },
  { name: 'Pallavaram', lat: 12.9682, lng: 80.1512 },
  { name: 'Ambattur', lat: 13.1143, lng: 80.1548 },
  { name: 'Avadi', lat: 13.1147, lng: 80.1009 },
];

export const PRESET_LOCATIONS: ActiveLocation[] = [
  {
    id: 'loc-mylapore',
    name: 'Mylapore',
    locality: 'Mylapore, Chennai',
    latitude: 13.0368,
    longitude: 80.2676,
    type: 'preset',
    label: 'Home',
  },
  {
    id: 'loc-kancheepuram',
    name: 'Kancheepuram',
    locality: 'Kancheepuram, Tamil Nadu',
    latitude: 12.8342,
    longitude: 79.7036,
    type: 'preset',
    label: 'College',
  },
  {
    id: 'loc-tnagar',
    name: 'T. Nagar',
    locality: 'T. Nagar, Chennai',
    latitude: 13.0405,
    longitude: 80.2337,
    type: 'preset',
    label: 'Work',
  },
  {
    id: 'loc-adyar',
    name: 'Adyar',
    locality: 'Adyar, Chennai',
    latitude: 13.0067,
    longitude: 80.2206,
    type: 'preset',
    label: 'Other',
  },
  {
    id: 'loc-annanagar',
    name: 'Anna Nagar',
    locality: 'Anna Nagar, Chennai',
    latitude: 13.0850,
    longitude: 80.2101,
    type: 'preset',
    label: 'Other',
  },
  {
    id: 'loc-velachery',
    name: 'Velachery',
    locality: 'Velachery, Chennai',
    latitude: 12.9759,
    longitude: 80.2212,
    type: 'preset',
    label: 'Other',
  },
  {
    id: 'loc-guindy',
    name: 'Guindy',
    locality: 'Guindy, Chennai',
    latitude: 13.0067,
    longitude: 80.2025,
    type: 'preset',
    label: 'Other',
  },
  {
    id: 'loc-porur',
    name: 'Porur',
    locality: 'Porur, Chennai',
    latitude: 13.0382,
    longitude: 80.1565,
    type: 'preset',
    label: 'Other',
  },
  {
    id: 'loc-ramapuram',
    name: 'Ramapuram',
    locality: 'Ramapuram, Chennai',
    latitude: 13.0315,
    longitude: 80.1790,
    type: 'preset',
    label: 'Other',
  },
  {
    id: 'loc-manapakkam',
    name: 'Manapakkam',
    locality: 'Manapakkam, Chennai',
    latitude: 13.0205,
    longitude: 80.1635,
    type: 'preset',
    label: 'Other',
  },
  {
    id: 'loc-mugalivakkam',
    name: 'Mugalivakkam',
    locality: 'Mugalivakkam, Chennai',
    latitude: 13.0195,
    longitude: 80.1620,
    type: 'preset',
    label: 'Other',
  },
];

export const DEFAULT_SAVED_LOCATIONS: SavedLocation[] = [
  {
    id: 'saved-home',
    label: 'Home',
    name: 'Mylapore Residence',
    locality: 'Mylapore, Chennai',
    latitude: 13.0368,
    longitude: 80.2676,
    address: '14, 2nd Main Road, Mylapore, Chennai',
  },
  {
    id: 'saved-college',
    label: 'College',
    name: 'Kancheepuram Campus',
    locality: 'Kancheepuram, Tamil Nadu',
    latitude: 12.8342,
    longitude: 79.7036,
    address: 'Academic Zone, Kancheepuram',
  },
  {
    id: 'saved-work',
    label: 'Work',
    name: 'T. Nagar Office',
    locality: 'T. Nagar, Chennai',
    latitude: 13.0405,
    longitude: 80.2337,
    address: '45 GN Chetty Road, T. Nagar, Chennai',
  },
  {
    id: 'saved-other',
    label: 'Other',
    name: 'Adyar Family Home',
    locality: 'Adyar, Chennai',
    latitude: 13.0067,
    longitude: 80.2206,
    address: '88 Gandhi Nagar 1st Main, Adyar, Chennai',
  },
];

let lastLat = 0;
let lastLng = 0;
let lastUpdateTimestamp = 0;

export const locationService = {
  getDefaultLocation(): ActiveLocation {
    return PRESET_LOCATIONS[0];
  },

  /**
   * Persists active location to AsyncStorage so it survives refreshes.
   */
  async persistLocation(location: ActiveLocation): Promise<void> {
    try {
      if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
        await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
      }
    } catch (e) {
      console.warn('Failed to persist active location:', e);
    }
  },

  /**
   * Retrieves last successfully persisted location on app boot/refresh.
   */
  async getPersistedLocation(): Promise<ActiveLocation | null> {
    try {
      const data = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (
        parsed &&
        typeof parsed.latitude === 'number' &&
        isFinite(parsed.latitude) &&
        typeof parsed.longitude === 'number' &&
        isFinite(parsed.longitude) &&
        parsed.name
      ) {
        return parsed as ActiveLocation;
      }
    } catch (e) {
      console.warn('Failed to parse persisted location:', e);
    }
    return null;
  },

  /**
   * Retrieves user's live device GPS coordinates using browser Geolocation API.
   * Throws explicit errors on permission denial, timeout, or unavailable position.
   * Never silently swallows errors with hardcoded fallback coordinates.
   */
  async getCurrentLocation(): Promise<LocationCoords & { accuracy?: number; timestamp: number }> {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && navigator.geolocation) {
      return new Promise((resolve, reject) => {
        // Attempt high-accuracy positioning first with sensible timeout
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp || Date.now(),
            });
          },
          (highAccError) => {
            // If high accuracy times out or position unavailable, fall back to standard accuracy
            if (highAccError.code === 3 || highAccError.code === 2) {
              navigator.geolocation.getCurrentPosition(
                (fallbackPos) => {
                  resolve({
                    latitude: fallbackPos.coords.latitude,
                    longitude: fallbackPos.coords.longitude,
                    accuracy: fallbackPos.coords.accuracy,
                    timestamp: fallbackPos.timestamp || Date.now(),
                  });
                },
                (finalError) => {
                  reject(new Error(this.formatGeolocationError(finalError)));
                },
                { enableHighAccuracy: false, timeout: 8000, maximumAge: 10000 }
              );
            } else {
              // Permission denied (code 1) or other terminal error
              reject(new Error(this.formatGeolocationError(highAccError)));
            }
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
        );
      });
    }
    throw new Error('Geolocation is not supported by your browser or device environment.');
  },

  formatGeolocationError(error: GeolocationPositionError | any): string {
    if (!error) return 'Unable to retrieve live device GPS coordinates.';
    switch (error.code) {
      case 1: // PERMISSION_DENIED
        return 'Location access was denied. Please allow location permissions in your browser settings to use live GPS.';
      case 2: // POSITION_UNAVAILABLE
        return 'GPS position unavailable. Please check your device location settings or select a location manually.';
      case 3: // TIMEOUT
        return 'Location request timed out. Please check your connection/GPS and try again.';
      default:
        return error.message || 'Unable to retrieve live device GPS location.';
    }
  },

  /**
   * Continuous device location watcher with debouncing and movement threshold.
   */
  watchLiveLocation(
    onUpdate: (location: ActiveLocation, coords: LocationCoords) => void,
    onError?: (err: any) => void
  ): () => void {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          const timestamp = position.timestamp || Date.now();
          const now = Date.now();

          // Calculate distance delta in meters approximately
          const dLat = Math.abs(lat - lastLat) * 111000;
          const dLng = Math.abs(lng - lastLng) * 111000;
          const moveDist = Math.sqrt(dLat * dLat + dLng * dLng);

          // Update only on meaningful movement (> 15m) or after 25s
          if (moveDist > 15 || now - lastUpdateTimestamp > 25000 || lastUpdateTimestamp === 0) {
            lastLat = lat;
            lastLng = lng;
            lastUpdateTimestamp = now;

            const localityInfo = await this.reverseGeocode({ latitude: lat, longitude: lng });
            const gpsLocation: ActiveLocation = {
              id: 'loc-live-gps',
              name: localityInfo.name,
              locality: localityInfo.locality,
              latitude: lat,
              longitude: lng,
              accuracy,
              timestamp,
              type: 'gps',
              label: 'Current Location',
            };

            onUpdate(gpsLocation, { latitude: lat, longitude: lng });
          }
        },
        (err) => {
          if (onError) onError(err);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
    return () => {};
  },

  /**
   * Performs reverse geocoding via server endpoints, Nominatim direct fallback, or neighborhood grid.
   * Guarantees returning a human-readable locality and never corrupting coordinates.
   */
  async reverseGeocode(coords: LocationCoords): Promise<{ name: string; locality: string }> {
    const { latitude, longitude } = coords;

    // 1. Try dedicated location endpoint
    try {
      const res = await apiClient.get('/location/reverse-geocode', {
        params: { lat: latitude, lng: longitude },
      });
      if (res.data?.success && res.data.name && res.data.name !== 'Unknown') {
        let cleanName = res.data.name;
        cleanName = cleanName.replace(/^(ward|zone)\s*\d+\s*[-–:,]?\s*/i, '').trim() || res.data.name;
        return {
          name: cleanName,
          locality: res.data.locality || `${cleanName}, Chennai`,
        };
      }
    } catch (err) {
      // Try fallback route
      try {
        const res2 = await apiClient.get('/clinics/reverse-geocode', {
          params: { latitude, longitude },
        });
        if (res2.data?.success && res2.data.name && res2.data.name !== 'Unknown') {
          return {
            name: res2.data.name,
            locality: res2.data.locality || `${res2.data.name}, Chennai`,
          };
        }
      } catch (e2) {
        // Fall through to client direct lookup
      }
    }

    // 2. Direct browser OSM Nominatim lookup if backend is unreachable
    try {
      const cleanLocality = (str?: string): string | null => {
        if (!str) return null;
        let s = str.trim();
        // Remove "Zone 11 " or "Ward 150 " prefixes while preserving the actual neighborhood/suburb name
        s = s.replace(/^(ward|zone)\s*\d+\s*[-–:,]?\s*/i, '').trim();
        if (!s || /^(ward|zone)\s*\d+$/i.test(s)) return null;
        return s;
      };

      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=17&addressdetails=1`,
        { headers: { Accept: 'application/json' } }
      );
      if (nomRes.ok) {
        const data = await nomRes.json();
        const addr = data.address || {};
        const locality =
          cleanLocality(addr.neighbourhood) ||
          cleanLocality(addr.suburb) ||
          cleanLocality(addr.residential) ||
          cleanLocality(addr.town) ||
          cleanLocality(addr.village) ||
          cleanLocality(addr.city_district) ||
          cleanLocality(addr.city);

        if (locality) {
          return {
            name: locality,
            locality: `${locality}, Chennai`,
          };
        }
      }
    } catch (e3) {
      // Fall through to local neighborhood calculation
    }

    // 3. High-precision nearest Chennai neighborhood centroid calculation
    let closestNeighborhood = CHENNAI_NEIGHBORHOOD_CELLS[0];
    let minDistance = Infinity;

    for (const cell of CHENNAI_NEIGHBORHOOD_CELLS) {
      const dLat = (cell.lat - latitude) * 111.0;
      const dLng = (cell.lng - longitude) * 111.0 * Math.cos((latitude * Math.PI) / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < minDistance) {
        minDistance = dist;
        closestNeighborhood = cell;
      }
    }

    if (minDistance <= 15.0) {
      return {
        name: closestNeighborhood.name,
        locality: `${closestNeighborhood.name}, Chennai`,
      };
    }

    return {
      name: 'Current Location',
      locality: 'Current Location',
    };
  },

  /**
   * Search for locations by address query or locality name via backend geocoding.
   */
  async searchLocations(query: string): Promise<ActiveLocation[]> {
    const q = query.trim().toLowerCase();
    if (!q) return PRESET_LOCATIONS;

    // 1. Check matching presets & cells
    const matchedPresets = PRESET_LOCATIONS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.locality.toLowerCase().includes(q) ||
        (p.label && p.label.toLowerCase().includes(q))
    );

    const matchedCells: ActiveLocation[] = CHENNAI_NEIGHBORHOOD_CELLS.filter((c) =>
      c.name.toLowerCase().includes(q)
    ).map((c) => ({
      id: `loc-cell-${c.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: c.name,
      locality: `${c.name}, Chennai`,
      latitude: c.lat,
      longitude: c.lng,
      type: 'manual',
    }));

    // 2. Query backend geocoder
    try {
      const res = await apiClient.get('/location/geocode', { params: { query } });
      if (res.data?.success && res.data.locations?.length > 0) {
        const serverLocations: ActiveLocation[] = res.data.locations.map((loc: any) => ({
          id: `loc-geo-${loc.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: loc.name,
          locality: loc.locality || `${loc.name}, Chennai`,
          latitude: loc.latitude,
          longitude: loc.longitude,
          type: 'manual',
        }));

        const combined = [...matchedPresets, ...matchedCells, ...serverLocations];
        return combined.filter(
          (loc, idx, self) =>
            idx === self.findIndex((t) => t.name.toLowerCase() === loc.name.toLowerCase())
        );
      }
    } catch (err) {
      // Fallback to local matches
    }

    const localCombined = [...matchedPresets, ...matchedCells];
    return localCombined.length > 0
      ? localCombined.filter(
          (loc, idx, self) =>
            idx === self.findIndex((t) => t.name.toLowerCase() === loc.name.toLowerCase())
        )
      : [
          {
            id: `loc-custom-${Date.now()}`,
            name: query,
            locality: `${query}, Chennai`,
            latitude: 13.0338,
            longitude: 80.2677,
            type: 'manual',
          },
        ];
  },

  isWithinBounds(coords: LocationCoords): boolean {
    const { latitude, longitude } = coords;
    return latitude >= 12.0 && latitude <= 14.0 && longitude >= 79.0 && longitude <= 81.0;
  },
};
