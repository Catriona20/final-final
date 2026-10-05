import { Clinic, FilterOptions, LocationCoords } from '../types';
import { locationService } from './locationService';
import { apiClient } from './apiClient';
import { googlePlacesService } from './googlePlacesService';
import { googleRoutesService } from './googleRoutesService';
import { clinicRecommendationService } from './clinicRecommendationService';
import { MOCK_DOCTORS } from '../data/mockData';

export interface SearchResult {
  clinics: Clinic[];
  total: number;
  userCoords: LocationCoords;
  isOutOfBounds: boolean;
  error?: string;
}

export const discoveredClinicCache = new Map<string, Clinic>();

export const clinicSearchService = {
  /**
   * Performs healthcare place discovery using backend API (PostgreSQL + Routes + Places + Recommendation Engine).
   */
  async discoverNearby(
    query: string,
    radiusKm: number = 15,
    activeCoords?: LocationCoords | null,
    userPrefSpecialty?: string | null,
    filters?: Partial<FilterOptions>
  ): Promise<SearchResult> {
    const userCoords = activeCoords || locationService.getDefaultLocation();
    const isOutOfBounds = !locationService.isWithinBounds(userCoords);

    try {
      // 1. Query Backend Discovery API
      const params = new URLSearchParams();
      const cleanQ = (query || '').trim();
      if (cleanQ && cleanQ !== 'all' && cleanQ !== 'all clinics' && cleanQ !== 'medical clinic') {
        params.append('query', cleanQ);
      }
      const targetDept = filters?.department || filters?.specialization || '';
      if (targetDept && targetDept !== 'all') {
        params.append('department', targetDept);
      }
      params.append('latitude', userCoords.latitude.toString());
      params.append('longitude', userCoords.longitude.toString());
      const effectiveRadius = filters?.distance || radiusKm || 20;
      params.append('radius', effectiveRadius.toString());
      if (userPrefSpecialty) params.append('preference', userPrefSpecialty);
      if (filters?.openNow) params.append('openNow', 'true');
      if (filters?.minRating) params.append('minRating', filters.minRating.toString());

      const response = await apiClient.get(`/clinics/discovery?${params.toString()}`);
      if (response.data && (Array.isArray(response.data.clinics) || Array.isArray(response.data.results))) {
        const clinics: Clinic[] = response.data.clinics || response.data.results || [];
        const total = typeof response.data.total === 'number'
          ? response.data.total
          : (typeof response.data.count === 'number' ? response.data.count : clinics.length);
        clinics.forEach((c) => discoveredClinicCache.set(c.id, c));
        return {
          clinics,
          total,
          userCoords,
          isOutOfBounds,
        };
      }
    } catch (err: any) {
      console.warn('Backend discovery API call error, falling back to local service pipeline:', err.message);
    }

    // 2. Resilient Client-Side Fallback Pipeline
    try {
      const radiusMeters = radiusKm * 1000;
      const rawClinics = await googlePlacesService.searchNearbyClinics(
        query,
        userCoords.latitude,
        userCoords.longitude,
        radiusMeters
      );

      const clinicsWithAppMetadata = rawClinics.map((clinic) => {
        const matchingDoctors = MOCK_DOCTORS.filter(
          (d) => d.clinicId === clinic.id || d.clinicAffiliations?.includes(clinic.name)
        );
        return {
          ...clinic,
          doctorsCount: matchingDoctors.length,
          consultationFee: matchingDoctors.length > 0 ? matchingDoctors[0].consultationFee : clinic.consultationFee,
          waitTime: matchingDoctors.length > 0 ? `${matchingDoctors[0].waitTime} wait` : undefined,
        };
      });

      const topCandidates = clinicsWithAppMetadata.slice(0, 12);
      const remainingCandidates = clinicsWithAppMetadata.slice(12);

      const routeElements = await googleRoutesService.computeRouteMatrix(
        userCoords.latitude,
        userCoords.longitude,
        topCandidates.map((c) => ({
          latitude: c.latitude || userCoords.latitude,
          longitude: c.longitude || userCoords.longitude,
        }))
      );

      const updatedTop = topCandidates.map((clinic, idx) => {
        const route = routeElements.find((r) => r.destinationIndex === idx);
        if (route && route.distanceMeters > 0) {
          const distKm = route.distanceMeters / 1000;
          const travelMins = Math.max(1, Math.round(route.durationSeconds / 60));
          return {
            ...clinic,
            distanceMeters: route.distanceMeters,
            travelDurationSeconds: route.durationSeconds,
            distance: `${distKm.toFixed(1)} km`,
            travelTime: `${travelMins} min`,
          };
        }

        const distanceKm = googleRoutesService.calculateHaversineDistance(
          userCoords.latitude,
          userCoords.longitude,
          clinic.latitude || userCoords.latitude,
          clinic.longitude || userCoords.longitude
        );
        const estMinutes = Math.max(1, Math.round((distanceKm / 28) * 60));
        return {
          ...clinic,
          distanceMeters: Math.floor(distanceKm * 1000),
          travelDurationSeconds: estMinutes * 60,
          distance: `${distanceKm.toFixed(1)} km`,
          travelTime: `${estMinutes} min`,
        };
      });

      const updatedRemaining = remainingCandidates.map((clinic) => {
        const distanceKm = googleRoutesService.calculateHaversineDistance(
          userCoords.latitude,
          userCoords.longitude,
          clinic.latitude || userCoords.latitude,
          clinic.longitude || userCoords.longitude
        );
        const estMinutes = Math.max(1, Math.round((distanceKm / 28) * 60));
        return {
          ...clinic,
          distanceMeters: Math.floor(distanceKm * 1000),
          travelDurationSeconds: estMinutes * 60,
          distance: `${distanceKm.toFixed(1)} km`,
          travelTime: `${estMinutes} min`,
        };
      });

      let allUpdated = [...updatedTop, ...updatedRemaining];

      if (filters) {
        if (filters.openNow) allUpdated = allUpdated.filter((c) => c.isOpen);
        if (filters.minRating && filters.minRating > 0) allUpdated = allUpdated.filter((c) => c.rating >= (filters.minRating || 0));
        if (filters.distance && filters.distance > 0) allUpdated = allUpdated.filter((c) => (c.distanceMeters || 0) <= (filters.distance || 10) * 1000);
      }

      const rankedClinics = clinicRecommendationService.rankClinics(allUpdated, userPrefSpecialty);
      rankedClinics.forEach((c) => discoveredClinicCache.set(c.id, c));

      return {
        clinics: rankedClinics,
        total: rankedClinics.length,
        userCoords,
        isOutOfBounds: false,
      };
    } catch (fallbackErr: any) {
      console.error('Discover nearby fallback error:', fallbackErr);
      return {
        clinics: [],
        total: 0,
        userCoords,
        isOutOfBounds: false,
        error: fallbackErr.message || 'Discovery error',
      };
    }
  },
};
