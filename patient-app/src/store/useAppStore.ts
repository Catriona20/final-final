import { create } from 'zustand';
import { ActiveLocation, SavedLocation } from '../types';
import { PRESET_LOCATIONS, DEFAULT_SAVED_LOCATIONS, locationService } from '../services/locationService';

interface AppStoreState {
  activeLocation: ActiveLocation;
  savedLocations: SavedLocation[];
  selectedCategory: string | null;
  searchQuery: string;
  isFirstLaunch: boolean;
  isGpsActive: boolean;
  gpsError: string | null;
  isLocating: boolean;

  setActiveLocation: (loc: ActiveLocation) => void;
  setSavedLocations: (saved: SavedLocation[]) => void;
  addSavedLocation: (loc: SavedLocation) => void;
  setSelectedCategory: (cat: string | null) => void;
  setSearchQuery: (query: string) => void;
  setIsFirstLaunch: (isFirst: boolean) => void;
  startGpsWatching: () => () => void;
  requestCurrentGpsLocation: () => Promise<ActiveLocation>;
  initializeLocation: () => Promise<void>;
}

// Monotonic sequence to prevent asynchronous storage loads from overwriting newer user selections / GPS results
let locationUpdateSeq = 0;

export const useAppStore = create<AppStoreState>((set) => ({
  activeLocation: PRESET_LOCATIONS[0], // Default: Mylapore, Chennai
  savedLocations: DEFAULT_SAVED_LOCATIONS,
  selectedCategory: null,
  searchQuery: '',
  isFirstLaunch: false,
  isGpsActive: false,
  gpsError: null,
  isLocating: false,

  initializeLocation: async () => {
    const currentSeq = locationUpdateSeq;
    try {
      const persisted = await locationService.getPersistedLocation();
      // Guard against race condition: only apply if no newer location update has occurred
      if (persisted && locationUpdateSeq === currentSeq) {
        set({
          activeLocation: persisted,
          isGpsActive: persisted.type === 'gps',
          gpsError: null,
        });
      }
    } catch (e) {
      console.warn('Failed to restore persisted location:', e);
    }
  },

  setActiveLocation: (activeLocation) => {
    locationUpdateSeq++;
    set({
      activeLocation,
      isGpsActive: activeLocation.type === 'gps',
      gpsError: null,
    });
    locationService.persistLocation(activeLocation).catch(() => {});
  },

  setSavedLocations: (savedLocations) => set({ savedLocations }),
  addSavedLocation: (loc) =>
    set((state) => ({
      savedLocations: [loc, ...state.savedLocations.filter((s) => s.id !== loc.id)],
    })),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsFirstLaunch: (isFirstLaunch) => set({ isFirstLaunch }),

  startGpsWatching: () => {
    const unwatch = locationService.watchLiveLocation(
      (gpsLoc) => {
        // Only overwrite activeLocation when user is explicitly in GPS mode.
        // If user chose a preset or saved location, preserve it without disruption.
        set((state) => {
          if (state.activeLocation.type === 'gps') {
            locationUpdateSeq++;
            locationService.persistLocation(gpsLoc).catch(() => {});
            return {
              activeLocation: {
                ...gpsLoc,
                displayName: gpsLoc.locality || `${gpsLoc.name}, Chennai`,
              },
              isGpsActive: true,
              gpsError: null,
            };
          }
          return { isGpsActive: false, gpsError: null };
        });
      },
      (err) => {
        console.warn('Live GPS watch notice:', err);
      }
    );
    return unwatch;
  },

  requestCurrentGpsLocation: async (): Promise<ActiveLocation> => {
    set({ isLocating: true, gpsError: null });
    try {
      const coords = await locationService.getCurrentLocation();
      const locality = await locationService.reverseGeocode(coords);
      const name = locality?.name || 'Current Location';
      const locStr = locality?.locality || `${name}, Chennai`;

      const gpsLocation: ActiveLocation = {
        id: `loc-live-gps-${Date.now()}`,
        name,
        locality: locStr,
        displayName: locStr,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        timestamp: coords.timestamp || Date.now(),
        type: 'gps',
        label: 'Current Location',
      };

      locationUpdateSeq++;
      set({
        activeLocation: gpsLocation,
        isGpsActive: true,
        gpsError: null,
        isLocating: false,
      });

      await locationService.persistLocation(gpsLocation);
      return gpsLocation;
    } catch (e: any) {
      set({
        gpsError: e.message || 'Unable to retrieve device GPS location.',
        isGpsActive: false,
        isLocating: false,
      });
      throw e;
    }
  },
}));

