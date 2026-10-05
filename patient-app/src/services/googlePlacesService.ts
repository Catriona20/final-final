import axios from 'axios';
import { Clinic } from '../types';
import { MOCK_CLINICS } from '../data/mockData';
import { apiClient } from './apiClient';

/**
 * ============================================================
 * PLACES & CLINIC DISCOVERY SERVICE
 * ============================================================
 *
 * Current Active Provider: OpenStreetMap / Geoapify / PostgreSQL Backend
 *
 * GOOGLE MAPS IMPLEMENTATION - PRESERVED FOR FUTURE USE:
 * Google Places API (New) implementation preserved below and switchable
 * through configuration (EXPO_PUBLIC_MAP_PROVIDER='google').
 */

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Canonical category mapping dictionary for healthcare search terms across all 10 departments
export const HEALTHCARE_TERM_MAP: Array<{
  category: string;
  keywords: string[];
  placesQuery: string;
}> = [
  {
    category: 'Ophthalmology',
    keywords: [
      'eye',
      'opt',
      'vision',
      'ophthalmolog',
      'retina',
      'cornea',
      'glaucoma',
      'cataract',
      'spectacle',
      'lasik',
      'eye specialist',
      'eye doctor',
      'eye clinic',
    ],
    placesQuery: 'eye hospital OR ophthalmologist OR eye clinic',
  },
  {
    category: 'Dentistry',
    keywords: [
      'dent',
      'tooth',
      'teeth',
      'oral',
      'orthodont',
      'root canal',
      'braces',
      'dental clinic',
      'dental doctor',
      'dentist',
    ],
    placesQuery: 'dental clinic OR dentist',
  },
  {
    category: 'Cardiology',
    keywords: [
      'cardio',
      'heart',
      'ecg',
      'cardiac',
      'hypertension',
      'angio',
      'blood pressure',
      'cardiologist',
      'heart specialist',
      'cardiac doctor',
      'heart doctor',
    ],
    placesQuery: 'cardiology clinic OR heart hospital OR cardiologist',
  },
  {
    category: 'Dermatology',
    keywords: [
      'derm',
      'skin',
      'laser',
      'acne',
      'cosmet',
      'hair',
      'eczema',
      'dermatologist',
      'skin doctor',
      'skin specialist',
    ],
    placesQuery: 'skin clinic OR dermatologist OR cosmetology',
  },
  {
    category: 'ENT',
    keywords: [
      'ent',
      'ear',
      'nose',
      'throat',
      'sinus',
      'audiolog',
      'tonsil',
      'ent specialist',
      'ear nose throat',
      'ent doctor',
    ],
    placesQuery: 'ENT clinic OR ear nose throat specialist',
  },
  {
    category: 'Pediatrics',
    keywords: [
      'pediat',
      'child',
      'baby',
      'infant',
      'vaccination',
      'newborn',
      'children doctor',
      'child specialist',
    ],
    placesQuery: 'pediatric clinic OR child specialist hospital',
  },
  {
    category: 'Orthopedics',
    keywords: [
      'ortho',
      'bone',
      'joint',
      'spine',
      'fracture',
      'knee',
      'orthopedic',
      'bone doctor',
      'orthopedic specialist',
      'joint pain',
      'back pain',
    ],
    placesQuery: 'orthopedic clinic OR bone specialist hospital',
  },
  {
    category: 'Gynecology',
    keywords: [
      'gyn',
      'women',
      'maternity',
      'pregnancy',
      'obstetric',
      'female',
      'gynecologist',
      'fertility',
      'pregnant',
      'period',
      'pelvic',
    ],
    placesQuery: 'gynecology clinic OR maternity hospital OR obstetrician',
  },
  {
    category: 'Neurology',
    keywords: [
      'neuro',
      'brain',
      'migraine',
      'nerve',
      'vertigo',
      'tremor',
      'headache',
      'neurologist',
      'epilepsy',
      'stroke',
    ],
    placesQuery: 'neurology clinic OR brain spine center OR neurologist',
  },
  {
    category: 'General Medicine',
    keywords: [
      'general',
      'physician',
      'doctor',
      'fever',
      'cold',
      'cough',
      'family doctor',
      'checkup',
      'primary care',
      'clinic near me',
      'clinic',
      'hospital near me',
      'hospital',
      'internal medicine',
    ],
    placesQuery: 'medical clinic OR general physician OR health center',
  },
];

const CATEGORY_IMAGES: Record<string, string> = {
  Dentistry: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80',
  Ophthalmology: 'https://images.unsplash.com/photo-1580281657527-47f249e8f4df?auto=format&fit=crop&w=800&q=80',
  Cardiology: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80',
  Dermatology: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80',
  ENT: 'https://images.unsplash.com/photo-1578496479914-7ef3b0193be3?auto=format&fit=crop&w=800&q=80',
  'General Medicine': 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80',
  Orthopedics: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80',
  Pediatrics: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
  Gynecology: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
  Neurology: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80',
};

export const googlePlacesService = {
  /**
   * Normalizes arbitrary user query to identify healthcare category and construct Places query.
   */
  normalizeHealthcareQuery(rawInput: string): {
    category: string;
    googlePlacesQuery: string;
    normalizedTerm: string;
  } {
    const cleanInput = (rawInput || '').trim().toLowerCase();

    if (!cleanInput) {
      return {
        category: 'General Medicine',
        googlePlacesQuery: 'medical clinic OR hospital',
        normalizedTerm: 'all clinics',
      };
    }

    for (const entry of HEALTHCARE_TERM_MAP) {
      const isMatch = entry.keywords.some((keyword) => cleanInput.includes(keyword)) ||
        cleanInput.includes(entry.category.toLowerCase()) ||
        entry.category.toLowerCase().includes(cleanInput);
      if (isMatch) {
        return {
          category: entry.category,
          googlePlacesQuery: `${entry.placesQuery}`,
          normalizedTerm: entry.category,
        };
      }
    }

    return {
      category: 'General Medicine',
      googlePlacesQuery: `${cleanInput} medical clinic OR hospital`,
      normalizedTerm: cleanInput,
    };
  },

  /**
   * Retrieves healthcare clinics around user coordinates using active backend discovery.
   */
  async searchNearbyClinics(
    query: string,
    latitude: number,
    longitude: number,
    radiusMeters: number = 15000
  ): Promise<Clinic[]> {
    try {
      // 1. Primary: Use backend clinic discovery (which orchestrates OpenRouteService / Geoapify / PostgreSQL)
      const res = await apiClient.get('/clinics/discovery', {
        params: {
          query,
          latitude,
          longitude,
          radius: radiusMeters / 1000,
        },
      });

      if (res.data?.success && res.data.clinics && res.data.clinics.length > 0) {
        return res.data.clinics.map((c: any) => ({
          ...c,
          image: c.image || CATEGORY_IMAGES[c.category] || CATEGORY_IMAGES['General Medicine'],
        }));
      }
    } catch (err: any) {
      console.warn('Backend discovery notice, trying client fallback:', err.message);
    }

    // 2. Google Places Fallback if GOOGLE_API_KEY is present and provider configured
    if (process.env.EXPO_PUBLIC_MAP_PROVIDER === 'google' && GOOGLE_API_KEY) {
      return this.executeGooglePlacesSearch(query, latitude, longitude, radiusMeters);
    }

    // 3. Fallback to categorized mock clinics
    return this.getMockFallbackClinics(query, latitude, longitude);
  },

  /**
   * ============================================================
   * GOOGLE PLACES IMPLEMENTATION - PRESERVED FOR FUTURE USE
   * ============================================================
   */
  async executeGooglePlacesSearch(
    query: string,
    latitude: number,
    longitude: number,
    radiusMeters: number = 10000
  ): Promise<Clinic[]> {
    const { category, googlePlacesQuery } = this.normalizeHealthcareQuery(query);

    if (!GOOGLE_API_KEY) {
      return this.getMockFallbackClinics(query, latitude, longitude);
    }

    try {
      const response = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        {
          textQuery: googlePlacesQuery,
          locationBias: {
            circle: {
              center: { latitude, longitude },
              radius: radiusMeters,
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.regularOpeningHours,places.photos,places.nationalPhoneNumber',
          },
        }
      );

      const places = response.data.places || [];
      if (places.length === 0) {
        return this.getMockFallbackClinics(query, latitude, longitude);
      }

      return places.map((place: any) => {
        const placeLat = place.location?.latitude;
        const placeLng = place.location?.longitude;
        const photoName = place.photos?.[0]?.name;

        const imageUrl = photoName
          ? `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_API_KEY}&maxHeightPx=400`
          : CATEGORY_IMAGES[category] || CATEGORY_IMAGES['General Medicine'];

        return {
          id: place.id,
          name: place.displayName?.text || 'Healthcare Clinic',
          address: place.formattedAddress || 'Chennai, Tamil Nadu',
          distance: 'Calculating...',
          travelTime: 'Calculating...',
          rating: place.rating || 4.5,
          reviewsCount: place.userRatingCount || 15,
          image: imageUrl,
          category: category,
          doctorsCount: 0,
          openHours: place.regularOpeningHours?.weekdayDescriptions?.[0] || '09:00 AM – 08:00 PM',
          phone: place.nationalPhoneNumber || '+91 44 2811 0000',
          isOpen: place.regularOpeningHours?.openNow ?? true,
          latitude: placeLat || latitude,
          longitude: placeLng || longitude,
          googlePlaceId: place.id,
          userRatingCount: place.userRatingCount,
        };
      });
    } catch (err: any) {
      console.warn('Google Places API call error:', err.message || err);
      return this.getMockFallbackClinics(query, latitude, longitude);
    }
  },

  /**
   * Provides fallback clinics matched to the department & query.
   */
  getMockFallbackClinics(query: string, originLat: number, originLng: number): Clinic[] {
    const q = (query || '').trim().toLowerCase();
    const isGeneric = !q || q === 'all' || q === 'all clinics' || q === 'clinic' || q === 'hospital' || q === 'medical clinic';

    if (isGeneric) {
      return MOCK_CLINICS.map((clinic) => ({
        ...clinic,
        image: CATEGORY_IMAGES[clinic.category] || clinic.image,
      }));
    }

    const { category } = this.normalizeHealthcareQuery(query);

    // Filter clinics specifically by department/category
    const matched = MOCK_CLINICS.filter((clinic) => {
      const catMatch =
        clinic.category.toLowerCase() === category.toLowerCase() ||
        clinic.departments?.some((d) => d.toLowerCase() === category.toLowerCase() || d.toLowerCase().includes(q));

      const nameMatch = clinic.name.toLowerCase().includes(q);
      return catMatch || nameMatch;
    });

    const resultsToUse = matched.length > 0 ? matched : MOCK_CLINICS;

    return resultsToUse.map((clinic) => ({
      ...clinic,
      image: CATEGORY_IMAGES[clinic.category] || clinic.image,
    }));
  },
};
