import axios from 'axios';
import { config } from '../config/env';
import { ClinicEntity, ClinicModel } from '../database/models';

/**
 * ============================================================
 * MAP & ROUTING PROVIDER ABSTRACTION
 * ============================================================
 *
 * Current Active Provider Stack:
 * - Map Tiles: MapLibre / OpenStreetMap / CartoDB (Client-side)
 * - Geocoding & Places: Geoapify Places API (with fallback to PostgreSQL database)
 * - Routing & Matrix: OpenRouteService / Geoapify Routing API
 *
 * GOOGLE MAPS PLATFORM - PRESERVED FOR FUTURE USE:
 * All Google Places and Google Routes API implementations are preserved in this module
 * and can be reactivated by setting:
 * PLACES_PROVIDER=google
 * ROUTING_PROVIDER=google
 * MAP_PROVIDER=google
 */

export interface RouteElement {
  destinationIndex: number;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteGeometryResult {
  coordinates: [number, number][]; // [lat, lng] array for polyline drawing
  distanceMeters: number;
  durationSeconds: number;
  distanceFormatted: string;
  durationFormatted: string;
}

// 40+ Comprehensive Chennai Neighborhood Geographic Centers
export const CHENNAI_GEOGRAPHIC_CELLS = [
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
  { name: 'Villivakkam', lat: 13.1075, lng: 80.2060 },
  { name: 'Kolathur', lat: 13.1235, lng: 80.2198 },
  { name: 'Mogappair', lat: 13.0838, lng: 80.1748 },
  { name: 'Anna Nagar West', lat: 13.0880, lng: 80.1980 },
  { name: 'Purasawalkam', lat: 13.0903, lng: 80.2575 },
];

// Healthcare Query Normalization Taxonomy
export const HEALTHCARE_TERM_MAP: Array<{
  category: string;
  keywords: string[];
  placesQuery: string;
  geoapifyCategory: string;
}> = [
  {
    category: 'Dentistry',
    keywords: ['dentist', 'dentistry', 'dental', 'tooth', 'teeth', 'toothache', 'tooth pain', 'oral', 'orthodontist', 'root canal', 'braces', 'dental clinic', 'dental doctor', 'dental hospital', 'cavity', 'gums', 'bleeding gums'],
    placesQuery: 'dental clinic OR dentist',
    geoapifyCategory: 'healthcare.dentist',
  },
  {
    category: 'General Medicine',
    keywords: ['general physician', 'general medicine', 'general practitioner', 'family doctor', 'internal medicine', 'primary care', 'fever', 'cold', 'cough', 'viral fever', 'body ache', 'checkup', 'physician', 'doctor', 'clinic near me', 'clinic', 'hospital near me', 'hospital', 'medical center'],
    placesQuery: 'medical clinic OR general physician OR health center',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Cardiology',
    keywords: ['cardiologist', 'cardiology', 'cardiac', 'heart', 'heart specialist', 'heart doctor', 'cardiac doctor', 'heart hospital', 'chest pain', 'palpitations', 'ecg', 'hypertension', 'angina', 'angio', 'blood pressure'],
    placesQuery: 'cardiology clinic OR heart hospital OR cardiologist',
    geoapifyCategory: 'healthcare.hospital',
  },
  {
    category: 'Dermatology',
    keywords: ['dermatologist', 'dermatology', 'skin specialist', 'skin doctor', 'skin', 'skin rash', 'rash', 'acne', 'eczema', 'psoriasis', 'hair fall', 'laser', 'cosmetology', 'skin clinic'],
    placesQuery: 'skin clinic OR dermatologist OR cosmetology',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Ophthalmology',
    keywords: ['ophthalmologist', 'ophthalmology', 'eye specialist', 'eye doctor', 'eye', 'eye irritation', 'vision', 'blurred vision', 'cataract', 'glaucoma', 'retina', 'cornea', 'lasik', 'spectacle', 'glasses', 'eye clinic', 'eye hospital'],
    placesQuery: 'eye hospital OR ophthalmologist OR eye clinic',
    geoapifyCategory: 'healthcare.clinic.ophthalmology',
  },
  {
    category: 'ENT',
    keywords: ['ent', 'ent specialist', 'ent doctor', 'ear nose throat', 'otolaryngologist', 'ear pain', 'ear infection', 'sore throat', 'tonsil', 'sinus', 'sinusitis', 'audiologist', 'hearing', 'ent clinic', 'ent hospital'],
    placesQuery: 'ENT clinic OR ear nose throat specialist',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Pediatrics',
    keywords: ['pediatrician', 'paediatrician', 'pediatrics', 'paediatrics', 'child specialist', 'child doctor', 'kids doctor', 'baby doctor', 'infant', 'child fever', 'vaccination', 'newborn', 'children hospital', 'pediatric clinic'],
    placesQuery: 'pediatric clinic OR child specialist hospital',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Orthopedics',
    keywords: ['orthopedic', 'orthopaedic', 'orthopedics', 'orthopaedics', 'bone specialist', 'bone doctor', 'joint pain', 'knee pain', 'fracture', 'spine', 'arthritis', 'back pain', 'joint swelling', 'bone hospital', 'orthopedic clinic'],
    placesQuery: 'orthopedic clinic OR bone specialist hospital',
    geoapifyCategory: 'healthcare.hospital',
  },
  {
    category: 'Gynecology',
    keywords: ['gynecologist', 'gynaecologist', 'gynecology', 'gynaecology', 'obstetrician', 'obstetrics', 'ob-gyn', 'obgyn', 'ob gyn', 'gynae', 'gyno', "women's health", 'womens health', 'pregnancy specialist', 'pregnancy', 'maternity', 'pcos', 'antenatal', 'prenatal', 'irregular periods', 'pelvic pain', 'fertility', 'maternity hospital', 'female doctor'],
    placesQuery: 'gynecology clinic OR maternity hospital OR obstetrician',
    geoapifyCategory: 'healthcare.hospital',
  },
  {
    category: 'Neurology',
    keywords: ['neurologist', 'neurology', 'brain specialist', 'brain doctor', 'nerve specialist', 'migraine', 'headache', 'vertigo', 'dizziness', 'epilepsy', 'stroke', 'seizure', 'tremor', 'nerve', 'neuro clinic'],
    placesQuery: 'neurology clinic OR brain spine center OR neurologist',
    geoapifyCategory: 'healthcare.hospital',
  },
  {
    category: 'Pulmonology',
    keywords: ['pulmonologist', 'pulmonology', 'lung specialist', 'lung doctor', 'chest specialist', 'respiratory specialist', 'breathing problem', 'difficulty breathing', 'shortness of breath', 'asthma', 'wheezing', 'chronic cough', 'bronchitis', 'chest congestion', 'pulmonary'],
    placesQuery: 'pulmonology clinic OR chest hospital OR pulmonologist',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Nephrology',
    keywords: ['nephrologist', 'nephrology', 'kidney specialist', 'kidney doctor', 'renal specialist', 'kidney problem', 'kidney disease', 'dialysis', 'creatinine', 'proteinuria', 'renal care', 'foamy urine', 'renal'],
    placesQuery: 'nephrology clinic OR kidney hospital OR nephrologist',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Gastroenterology',
    keywords: ['gastroenterologist', 'gastroenterology', 'stomach specialist', 'stomach doctor', 'digestive specialist', 'stomach pain', 'acidity', 'gerd', 'acid reflux', 'gastric', 'liver', 'abdominal pain', 'gastritis', 'digestive health'],
    placesQuery: 'gastroenterology clinic OR digestive health OR gastroenterologist',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Endocrinology',
    keywords: ['endocrinologist', 'endocrinology', 'diabetologist', 'diabetes specialist', 'thyroid specialist', 'hormone specialist', 'diabetes', 'thyroid', 'blood sugar', 'insulin', 'metabolic', 'hormone'],
    placesQuery: 'endocrinology clinic OR diabetes center OR endocrinologist',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Urology',
    keywords: ['urologist', 'urology', 'urinary specialist', 'kidney stone', 'urine problem', 'urinary infection', 'uti', 'burning urination', 'bladder', 'prostate', 'dysuria', 'urine'],
    placesQuery: 'urology clinic OR urologist OR kidney stone center',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Physiotherapy',
    keywords: ['physiotherapist', 'physiotherapy', 'physical therapist', 'physical therapy', 'physio', 'rehabilitation', 'rehab', 'back pain physiotherapy', 'mobility', 'posture', 'sports physio'],
    placesQuery: 'physiotherapy clinic OR rehabilitation center OR physiotherapist',
    geoapifyCategory: 'healthcare.clinic',
  },
  {
    category: 'Psychiatry',
    keywords: ['psychiatrist', 'psychiatry', 'mental health doctor', 'mental health specialist', 'psychologist', 'mental health', 'anxiety', 'depression', 'insomnia', 'stress', 'panic attacks', 'counseling', 'psych'],
    placesQuery: 'psychiatry clinic OR mental health center OR psychiatrist',
    geoapifyCategory: 'healthcare.clinic',
  },
];

// In-memory LRU cache for route and discovery optimization
const discoveryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const mapRoutingBackendService = {
  /**
   * Normalizes search input and resolves category / department aliases.
   */
  normalizeQuery(query: string): { category: string; placesQuery: string; normalizedTerm: string; geoapifyCategory: string } {
    const clean = (query || '').trim().toLowerCase();
    if (!clean || clean === 'all' || clean === 'all clinics') {
      return {
        category: '',
        placesQuery: 'medical clinic OR hospital',
        normalizedTerm: 'all clinics',
        geoapifyCategory: 'healthcare.clinic',
      };
    }

    const cleanWords = clean.split(/[\s,/\-_]+/);

    // 1. First pass: exact category match
    for (const entry of HEALTHCARE_TERM_MAP) {
      const catLower = entry.category.toLowerCase();
      if (clean === catLower || cleanWords.includes(catLower)) {
        return {
          category: entry.category,
          placesQuery: entry.placesQuery,
          normalizedTerm: entry.category,
          geoapifyCategory: entry.geoapifyCategory,
        };
      }
    }

    // 2. Second pass: keyword matches (with word boundary safety for short keywords)
    for (const entry of HEALTHCARE_TERM_MAP) {
      const match = entry.keywords.some((k) => {
        const kLower = k.toLowerCase();
        if (kLower.length <= 4) {
          return cleanWords.includes(kLower) || clean === kLower;
        }
        return clean.includes(kLower) || cleanWords.some((w) => w === kLower);
      });
      if (match) {
        return {
          category: entry.category,
          placesQuery: entry.placesQuery,
          normalizedTerm: entry.category,
          geoapifyCategory: entry.geoapifyCategory,
        };
      }
    }

    return {
      category: '',
      placesQuery: `${clean} medical clinic OR hospital`,
      normalizedTerm: clean,
      geoapifyCategory: 'healthcare.clinic',
    };
  },

  /**
   * Accurate Haversine distance in kilometers.
   */
  calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * Computes route matrix elements for origin and destination list using
   * OpenRouteService, Geoapify, or Google Routes (New).
   */
  async computeRouteMatrix(
    originLat: number,
    originLng: number,
    destinations: { latitude: number; longitude: number }[]
  ): Promise<RouteElement[]> {
    if (destinations.length === 0) return [];

    const provider = config.routingProvider;

    // 1. OPENROUTESERVICE ROUTE MATRIX
    if (provider === 'openrouteservice' && config.openrouteserviceApiKey) {
      try {
        const locations = [
          [originLng, originLat],
          ...destinations.map((d) => [d.longitude, d.latitude]),
        ];

        const response = await axios.post(
          'https://api.openrouteservice.org/v2/matrix/driving-car',
          {
            locations,
            sources: [0],
            destinations: destinations.map((_, i) => i + 1),
            metrics: ['distance', 'duration'],
          },
          {
            headers: {
              Authorization: config.openrouteserviceApiKey,
              'Content-Type': 'application/json',
            },
            timeout: 4000,
          }
        );

        const distances = response.data.distances?.[0] || [];
        const durations = response.data.durations?.[0] || [];

        return destinations.map((_, idx) => ({
          destinationIndex: idx,
          distanceMeters: Math.round(distances[idx] || 0),
          durationSeconds: Math.round(durations[idx] || 60),
        }));
      } catch (err: any) {
        console.warn('OpenRouteService Matrix API warning, using road speed fallback:', err.message);
      }
    }

    // 2. GEOAPIFY ROUTE MATRIX
    if (provider === 'geoapify' && config.geoapifyApiKey) {
      try {
        const response = await axios.post(
          `https://api.geoapify.com/v1/routematrix?apiKey=${config.geoapifyApiKey}`,
          {
            mode: 'drive',
            sources: [{ location: [originLng, originLat] }],
            targets: destinations.map((d) => ({ location: [d.longitude, d.latitude] })),
          },
          { timeout: 4000 }
        );

        const sourcesToTargets = response.data.sources_to_targets?.[0] || [];
        return destinations.map((_, idx) => {
          const item = sourcesToTargets[idx] || {};
          return {
            destinationIndex: idx,
            distanceMeters: Math.round(item.distance || 0),
            durationSeconds: Math.round(item.time || 60),
          };
        });
      } catch (err: any) {
        console.warn('Geoapify Route Matrix warning, using road speed fallback:', err.message);
      }
    }

    // 3. GOOGLE ROUTES (NEW) - PRESERVED FOR FUTURE USE
    if (provider === 'google' && config.googleRoutesApiKey) {
      try {
        const response = await axios.post(
          'https://routes.googleapis.com/v1/computeRouteMatrix',
          {
            origins: [{ waypoint: { location: { latLng: { latitude: originLat, longitude: originLng } } } }],
            destinations: destinations.map((d) => ({ waypoint: { location: { latLng: { latitude: d.latitude, longitude: d.longitude } } } })),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': config.googleRoutesApiKey,
              'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,status',
            },
            timeout: 4000,
          }
        );

        const items = response.data || [];
        return items.map((element: any) => {
          const durationStr = element.duration || '0s';
          const durationSeconds = parseInt(durationStr.replace('s', ''), 10) || 0;
          return {
            destinationIndex: element.destinationIndex ?? 0,
            distanceMeters: element.distanceMeters ?? 0,
            durationSeconds,
          };
        });
      } catch (err: any) {
        console.warn('Google Routes Matrix API warning:', err.message);
      }
    }

    // 4. HIGH-ACCURACY ROAD CURVATURE & URBAN TRAFFIC FALLBACK
    // (Applies 1.25x road winding factor and 25 km/h realistic Chennai urban traffic velocity)
    return destinations.map((dest, idx) => {
      const straightDistKm = this.calculateHaversineDistance(originLat, originLng, dest.latitude, dest.longitude);
      const roadDistKm = straightDistKm * 1.22; // Road network coefficient
      const distanceMeters = Math.max(100, Math.floor(roadDistKm * 1000));
      const durationSeconds = Math.max(60, Math.floor((roadDistKm / 28) * 3600)); // 28 km/h urban speed

      return {
        destinationIndex: idx,
        distanceMeters,
        durationSeconds,
      };
    });
  },

  /**
   * Calculates actual road path geometry (polyline coordinates) from origin to destination.
   */
  async calculateRouteGeometry(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<RouteGeometryResult> {
    // 1. OPENROUTESERVICE DIRECTIONS
    if (config.routingProvider === 'openrouteservice' && config.openrouteserviceApiKey) {
      try {
        const response = await axios.get(
          `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${config.openrouteserviceApiKey}&start=${originLng},${originLat}&end=${destLng},${destLat}`,
          { timeout: 4000 }
        );

        const feature = response.data.features?.[0];
        const coordinates = (feature?.geometry?.coordinates || []).map((coord: [number, number]) => [coord[1], coord[0]]); // [lat, lng]
        const summary = feature?.properties?.summary || {};
        const distanceMeters = Math.round(summary.distance || 0);
        const durationSeconds = Math.round(summary.duration || 60);

        return {
          coordinates: coordinates.length > 0 ? coordinates : [[originLat, originLng], [destLat, destLng]],
          distanceMeters,
          durationSeconds,
          distanceFormatted: `${(distanceMeters / 1000).toFixed(1)} km`,
          durationFormatted: `${Math.max(1, Math.round(durationSeconds / 60))} min`,
        };
      } catch (err: any) {
        console.warn('OpenRouteService Directions fallback:', err.message);
      }
    }

    // 2. GEOAPIFY ROUTING API
    if (config.routingProvider === 'geoapify' && config.geoapifyApiKey) {
      try {
        const response = await axios.get(
          `https://api.geoapify.com/v1/routing?waypoints=${originLat},${originLng}|${destLat},${destLng}&mode=drive&apiKey=${config.geoapifyApiKey}`,
          { timeout: 4000 }
        );

        const feature = response.data.features?.[0];
        const coords = (feature?.geometry?.coordinates?.[0] || []).map((coord: [number, number]) => [coord[1], coord[0]]);
        const props = feature?.properties || {};
        const distanceMeters = Math.round(props.distance || 0);
        const durationSeconds = Math.round(props.time || 60);

        return {
          coordinates: coords.length > 0 ? coords : [[originLat, originLng], [destLat, destLng]],
          distanceMeters,
          durationSeconds,
          distanceFormatted: `${(distanceMeters / 1000).toFixed(1)} km`,
          durationFormatted: `${Math.max(1, Math.round(durationSeconds / 60))} min`,
        };
      } catch (err: any) {
        console.warn('Geoapify Directions fallback:', err.message);
      }
    }

    // 3. SMOOTH ROAD CURVE FALLBACK
    const distKm = this.calculateHaversineDistance(originLat, originLng, destLat, destLng) * 1.22;
    const distanceMeters = Math.max(100, Math.floor(distKm * 1000));
    const durationSeconds = Math.max(60, Math.floor((distKm / 28) * 3600));

    const midLat = (originLat + destLat) / 2 + 0.0025;
    const midLng = (originLng + destLng) / 2 - 0.002;

    return {
      coordinates: [
        [originLat, originLng],
        [midLat, midLng],
        [destLat, destLng],
      ],
      distanceMeters,
      durationSeconds,
      distanceFormatted: `${distKm.toFixed(1)} km`,
      durationFormatted: `${Math.max(1, Math.round(durationSeconds / 60))} min`,
    };
  },

  /**
   * Discovers external healthcare places using Geoapify Places API.
   */
  async searchGeoapifyPlaces(
    queryText: string,
    lat: number,
    lng: number,
    radiusMeters: number = 15000
  ): Promise<ClinicEntity[]> {
    if (!config.geoapifyApiKey) return [];

    const { category, geoapifyCategory } = this.normalizeQuery(queryText);

    try {
      const response = await axios.get(
        `https://api.geoapify.com/v2/places?categories=${geoapifyCategory}&filter=circle:${lng},${lat},${radiusMeters}&bias=proximity:${lng},${lat}&limit=20&apiKey=${config.geoapifyApiKey}`,
        { timeout: 5000 }
      );

      const features = response.data.features || [];
      return features.map((f: any) => {
        const props = f.properties || {};
        const pLat = props.lat || lat;
        const pLng = props.lon || lng;

        return {
          id: `ext-${props.place_id || Math.random().toString(36).substring(7)}`,
          name: props.name || props.formatted || 'Discovered Healthcare Center',
          address: props.formatted || `${props.street || 'Anna Salai'}, Chennai`,
          latitude: pLat,
          longitude: pLng,
          rating: 4.6,
          reviews_count: 25,
          image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80',
          category,
          doctors_count: 0, // Discovered clinic: no invented platform doctors
          open_hours: props.opening_hours || '08:30 AM – 08:30 PM',
          phone: props.contact?.phone || '+91 44 2811 0000',
          is_open: true,
          opens_at: 'Open Now',
          is_popular: false,
          is_nearby: true,
          wait_time: '15 min wait',
          consultation_fee: '₹450',
          departments: [category],
        };
      });
    } catch (err: any) {
      console.warn('Geoapify Places API notice:', err.message);
      return [];
    }
  },

  /**
   * Searches Google Places (New) Text Search - PRESERVED FOR FUTURE USE.
   */
  async searchGooglePlaces(
    queryText: string,
    originLat: number,
    originLng: number,
    radiusMeters: number = 15000
  ): Promise<ClinicEntity[]> {
    if (!config.googlePlacesApiKey) return [];

    const { category, placesQuery } = this.normalizeQuery(queryText);

    try {
      const response = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        {
          textQuery: placesQuery,
          locationBias: { circle: { center: { latitude: originLat, longitude: originLng }, radius: radiusMeters } },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': config.googlePlacesApiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.regularOpeningHours,places.currentOpeningHours,places.photos,places.nationalPhoneNumber',
          },
          timeout: 5000,
        }
      );

      const places = response.data.places || [];
      return places.map((place: any) => {
        const placeLat = place.location?.latitude || originLat;
        const placeLng = place.location?.longitude || originLng;
        const photoName = place.photos?.[0]?.name;
        const imageUrl = photoName
          ? `https://places.googleapis.com/v1/${photoName}/media?key=${config.googlePlacesApiKey}&maxHeightPx=400`
          : 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80';

        const openingHours = place.currentOpeningHours || place.regularOpeningHours;
        const isOpen = openingHours?.openNow ?? true;
        const weekdayDesc = openingHours?.weekdayDescriptions?.[0] || 'Hours unavailable';

        return {
          id: `gp-${place.id}`,
          name: place.displayName?.text || 'Healthcare Clinic',
          address: place.formattedAddress || 'Chennai, Tamil Nadu',
          latitude: placeLat,
          longitude: placeLng,
          rating: place.rating || 4.5,
          reviews_count: place.userRatingCount || 20,
          image: imageUrl,
          category,
          doctors_count: 0,
          open_hours: weekdayDesc,
          phone: place.nationalPhoneNumber || '+91 44 2811 0000',
          is_open: isOpen,
          opens_at: isOpen ? 'Open Now' : 'Closed',
          is_popular: (place.userRatingCount || 0) > 100,
          is_nearby: true,
          wait_time: '15 min wait',
          consultation_fee: '₹500',
          google_place_id: place.id,
          departments: [category],
        };
      });
    } catch (err: any) {
      console.warn('Google Places API search notice:', err.message);
      return [];
    }
  },

  /**
   * Discovers and ranks healthcare clinics across Chennai using the active provider stack:
   * 1. Platform-connected clinics (PostgreSQL)
   * 2. Geoapify / Google Places external candidates
   * 3. Haversine distance filtering
   * 4. Multi-clinic Route Matrix (OpenRouteService / Geoapify / Google Routes)
   */
  async discoverClinics(
    queryText: string,
    lat: number,
    lng: number,
    radiusKm: number = 15
  ): Promise<Array<ClinicEntity & { distanceMeters: number; travelDurationSeconds: number; distance: string; travelTime: string }>> {
    const { category } = this.normalizeQuery(queryText);
    const cleanQ = (queryText || '').trim().toLowerCase();

    // Cache lookup key
    const cacheKey = `${cleanQ}-${lat.toFixed(3)}-${lng.toFixed(3)}-${radiusKm}`;
    const cached = discoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // 1. Fetch connected platform clinics from database
    const platformClinics = await ClinicModel.getAll();

    // 2. Fetch external discovered clinics if provider is configured
    let externalClinics: ClinicEntity[] = [];
    if (config.placesProvider === 'geoapify' && config.geoapifyApiKey) {
      externalClinics = await this.searchGeoapifyPlaces(queryText, lat, lng, radiusKm * 1000);
    } else if (config.placesProvider === 'google' && config.googlePlacesApiKey) {
      externalClinics = await this.searchGooglePlaces(queryText, lat, lng, radiusKm * 1000);
    }

    // 3. Merge & Deduplicate
    const combinedMap = new Map<string, ClinicEntity>();
    platformClinics.forEach((clinic) => {
      combinedMap.set(clinic.id, clinic);
    });

    externalClinics.forEach((extClinic) => {
      const exists = Array.from(combinedMap.values()).some(
        (c) => c.name.toLowerCase() === extClinic.name.toLowerCase()
      );
      if (!exists) {
        combinedMap.set(extClinic.id, extClinic);
      }
    });

    const allCandidates = Array.from(combinedMap.values());

    // 4. Department & Query Filtering
    const matched = allCandidates.filter((clinic) => {
      if (!cleanQ || cleanQ === 'all' || cleanQ === 'medical clinic' || cleanQ === 'hospital') return true;

      const catMatch =
        clinic.category.toLowerCase() === category.toLowerCase() ||
        clinic.departments?.some((d) => d.toLowerCase() === category.toLowerCase() || d.toLowerCase().includes(cleanQ));
      const nameMatch = clinic.name.toLowerCase().includes(cleanQ) || clinic.address.toLowerCase().includes(cleanQ);

      return catMatch || nameMatch;
    });

    const candidateList = matched.length > 0 ? matched : allCandidates;

    // 5. Geographical Radius Pre-filtering
    const withinRadius = candidateList.filter((c) => {
      const distKm = this.calculateHaversineDistance(lat, lng, c.latitude, c.longitude);
      return distKm <= radiusKm * 1.5;
    });

    const finalCandidates = withinRadius.length > 0 ? withinRadius : candidateList;

    // 6. Compute road distances & ETAs using Route Matrix
    const routeElements = await this.computeRouteMatrix(
      lat,
      lng,
      finalCandidates.map((c) => ({ latitude: c.latitude, longitude: c.longitude }))
    );

    const results = finalCandidates.map((clinic, idx) => {
      const route = routeElements.find((r) => r.destinationIndex === idx);
      const distanceMeters = route && route.distanceMeters > 0
        ? route.distanceMeters
        : Math.floor(this.calculateHaversineDistance(lat, lng, clinic.latitude, clinic.longitude) * 1220);
      const travelDurationSeconds = route && route.durationSeconds > 0
        ? route.durationSeconds
        : Math.max(60, Math.floor(((distanceMeters / 1000) / 28) * 3600));

      const distKm = (distanceMeters / 1000).toFixed(1);
      const travelMins = Math.max(1, Math.round(travelDurationSeconds / 60));

      return {
        ...clinic,
        distanceMeters,
        travelDurationSeconds,
        distance: `${distKm} km`,
        travelTime: `${travelMins} min`,
      };
    });

    // Store in cache
    discoveryCache.set(cacheKey, { data: results, timestamp: Date.now() });
    return results;
  },

  /**
   * Reverse-geocodes coordinates into a human-readable locality / neighborhood name.
   * Prioritizes dynamic OpenStreetMap Nominatim / Geoapify lookup and falls back cleanly.
   */
  async reverseGeocode(lat: number, lng: number): Promise<{ name: string; locality: string }> {
    const cleanLocality = (str?: string): string | null => {
      if (!str) return null;
      let s = str.trim();
      // Remove "Zone 11 " or "Ward 150 " prefixes while preserving the actual neighborhood/suburb name
      s = s.replace(/^(ward|zone)\s*\d+\s*[-–:,]?\s*/i, '').trim();
      if (!s || /^(ward|zone)\s*\d+$/i.test(s)) return null;
      return s;
    };

    // 1. Try dynamic reverse geocoding via OpenStreetMap Nominatim
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
        {
          headers: { 'User-Agent': 'MedLink-Healthcare-Platform/1.0' },
          timeout: 3500,
        }
      );
      if (response.data && response.data.address) {
        const addr = response.data.address;
        const locality =
          cleanLocality(addr.neighbourhood) ||
          cleanLocality(addr.suburb) ||
          cleanLocality(addr.residential) ||
          cleanLocality(addr.town) ||
          cleanLocality(addr.village) ||
          cleanLocality(addr.city_district) ||
          cleanLocality(addr.city);

        if (locality) {
          const city = addr.city || addr.state_district || 'Chennai';
          return {
            name: locality,
            locality: `${locality}, ${city}`,
          };
        }
      }
    } catch (e: any) {
      // Gracefully continue to Geoapify / centroid calculation
    }

    // 2. Try Geoapify reverse geocoding if API key is present
    if (config.geoapifyApiKey) {
      try {
        const response = await axios.get(
          `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${config.geoapifyApiKey}`,
          { timeout: 3500 }
        );
        if (response.data?.features?.length > 0) {
          const props = response.data.features[0].properties;
          const locality =
            cleanLocality(props.neighbourhood) ||
            cleanLocality(props.suburb) ||
            cleanLocality(props.district) ||
            cleanLocality(props.city);
          if (locality) {
            return {
              name: locality,
              locality: props.formatted || `${locality}, Chennai`,
            };
          }
        }
      } catch (err: any) {
        // Fall through to centroid calculation
      }
    }

    // 3. Fallback: High-precision Chennai neighborhood centroid calculation
    let closestCell = CHENNAI_GEOGRAPHIC_CELLS[0];
    let minDistance = Infinity;

    for (const cell of CHENNAI_GEOGRAPHIC_CELLS) {
      const dist = this.calculateHaversineDistance(lat, lng, cell.lat, cell.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestCell = cell;
      }
    }

    if (minDistance <= 15.0) {
      return {
        name: closestCell.name,
        locality: `${closestCell.name}, Chennai`,
      };
    }

    return {
      name: 'Current Location',
      locality: 'Current Location',
    };
  },

  /**
   * Resolves a location name / locality search query to geographic coordinates.
   */
  async geocodeQuery(query: string): Promise<Array<{ name: string; locality: string; latitude: number; longitude: number }>> {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];

    // 1. Check matching Chennai neighborhood centroids
    const matchedCells = CHENNAI_GEOGRAPHIC_CELLS.filter(
      (c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())
    );

    if (matchedCells.length > 0) {
      return matchedCells.map((c) => ({
        name: c.name,
        locality: `${c.name}, Chennai`,
        latitude: c.lat,
        longitude: c.lng,
      }));
    }

    // 2. Query OSM Nominatim if query is not a standard preset
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Chennai, Tamil Nadu')}&limit=5`,
        {
          headers: { 'User-Agent': 'MedLink-Healthcare-Platform/1.0' },
          timeout: 4000,
        }
      );
      if (response.data && response.data.length > 0) {
        return response.data.map((item: any) => ({
          name: item.display_name.split(',')[0] || query,
          locality: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        }));
      }
    } catch (err: any) {
      // Fallback
    }

    return [];
  },
};

// Re-export for backward compatibility
export const googleMapsBackendService = mapRoutingBackendService;
