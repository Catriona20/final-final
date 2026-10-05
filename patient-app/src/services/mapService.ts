import { LocationCoords } from '../types';

/**
 * ============================================================
 * CENTRALIZED MAP SERVICE & PROVIDER CONFIGURATION
 * ============================================================
 *
 * Current Active Provider: MapLibre / OpenStreetMap / CartoDB Tile Stack
 *
 * GOOGLE MAPS IMPLEMENTATION - PRESERVED FOR FUTURE USE:
 * Switch provider through configuration (EXPO_PUBLIC_MAP_PROVIDER='google')
 * when Google Cloud Platform enterprise billing is active.
 */

export type MapProviderType = 'maplibre' | 'google';

export const CHENNAI_DEFAULT_COORDS: LocationCoords = {
  latitude: 13.0338,
  longitude: 80.2677,
};

export const CHENNAI_BOUNDS = {
  minLat: 12.80,
  maxLat: 13.25,
  minLng: 79.95,
  maxLng: 80.35,
};

export interface MapStyleConfig {
  tileUrl: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
  backgroundColor: string;
}

export const mapService = {
  /**
   * Returns the active map rendering provider.
   */
  getActiveProvider(): MapProviderType {
    const provider = process.env.EXPO_PUBLIC_MAP_PROVIDER;
    if (provider === 'google') {
      return 'google';
    }
    return 'maplibre';
  },

  /**
   * Returns tile layer configuration for MapLibre / OpenStreetMap based on theme mode.
   * Uses standard keyless OpenStreetMap tiles with zero watermark or API key requirement.
   */
  getTileConfig(isDark: boolean): MapStyleConfig {
    const geoapifyKey = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;
    if (geoapifyKey) {
      return {
        tileUrl: `https://maps.geoapify.com/v1/tile/${isDark ? 'dark-matter-purple-roads' : 'osm-bright'}/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.geoapify.com/">Geoapify</a>',
        maxZoom: 20,
        minZoom: 9,
        backgroundColor: isDark ? '#06152F' : '#F8FAFC',
      };
    }

    if (isDark) {
      return {
        tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        minZoom: 9,
        backgroundColor: '#06152F',
      };
    }

    return {
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      minZoom: 9,
      backgroundColor: '#F8FAFC',
    };
  },

  /**
   * Category icon map for clinic markers across all 10 departments.
   */
  getCategoryIcon(category: string): string {
    const categoryIconMap: Record<string, string> = {
      'General Medicine': '🩺',
      Cardiology: '❤️',
      Dermatology: '✨',
      Ophthalmology: '👁️',
      Dentistry: '🦷',
      ENT: '👂',
      Pediatrics: '👶',
      Orthopedics: '🦴',
      Gynecology: '🌸',
      Neurology: '🧠',
    };
    return categoryIconMap[category] || '🏥';
  },

  /**
   * Route line styling configuration.
   */
  getRouteStyle(isDark: boolean) {
    return {
      color: '#0D47C9',
      weight: 5.5,
      opacity: 0.9,
      dashArray: '8, 8',
      lineCap: 'round',
      lineJoin: 'round',
    };
  },

  /**
   * Formats distance and ETA for map badge display.
   */
  formatRouteBadge(travelTime?: string, distance?: string): string {
    const time = travelTime || '5 min';
    const dist = distance || '1.2 km';
    return `🚗 ${time} · 📍 ${dist}`;
  },
};

/**
 * ============================================================
 * GOOGLE MAPS CONFIGURATION - PRESERVED FOR FUTURE USE
 * ============================================================
 * export const GOOGLE_MAPS_PRESERVED_CONFIG = {
 *   apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
 *   libraries: ['places', 'geometry'],
 *   defaultCenter: CHENNAI_DEFAULT_COORDS,
 *   mapType: 'roadmap',
 * };
 */
