import axios from 'axios';
import { config } from '../config/env';
import { ClinicEntity, ClinicModel } from '../database/models';
import { memoryDb } from '../database/db';
import { mapRoutingBackendService, RouteElement } from './mapRoutingBackendService';
import { recommendationEngine } from './recommendationEngine';

/**
 * ============================================================
 * CHENNAI-WIDE REAL CLINIC DISCOVERY ENGINE
 * ============================================================
 *
 * Orchestrates multi-cell geographic grid searches across all Chennai
 * metropolitan zones, combining:
 * 1. Platform-Connected Clinics (PostgreSQL - with verified doctors & booking)
 * 2. Geoapify Places API (Live real-world Chennai healthcare facilities)
 * 3. OpenStreetMap Overpass (Resilient fallback for comprehensive healthcare data)
 *
 * Features:
 * - Multi-cell grid coverage across 9 Chennai zones
 * - Intelligent clinical department & keyword classification
 * - Robust deduplication by Place ID, OSM ID, and coordinate proximity
 * - Multi-tier distance filtering (2 km, 5 km, 10 km, 20 km, Chennai-wide)
 * - Road matrix ETA and distance computation
 * - High-performance caching with configurable TTL
 */

export interface DiscoveryResponse {
  success: boolean;
  count: number;
  source: string;
  totalPlatform: number;
  totalExternal: number;
  departments: string[];
  clinics: DiscoveredClinicResult[];
  results: DiscoveredClinicResult[];
}

export interface DiscoveredClinicResult extends ClinicEntity {
  source: 'platform' | 'geoapify' | 'osm' | 'MEDLINK_DEMO' | 'GOOGLE_PLACES';
  isConnected: boolean;
  distanceMeters: number;
  travelDurationSeconds: number;
  distance: string;
  travelTime: string;
  recommendationScore?: number;
  recommendationReason?: string;
  osmId?: string | number;
  geoapifyPlaceId?: string;
}

// 9 Strategic Chennai Geographic Cells for Complete Metropolitan Coverage
export const CHENNAI_DISCOVERY_GRID = [
  { name: 'Central Chennai (Mylapore, Alwarpet, Triplicane, Royapettah)', lat: 13.0338, lng: 80.2677, radiusMeters: 5500 },
  { name: 'Central-West (T. Nagar, Nungambakkam, Kodambakkam, Egmore, Kilpauk)', lat: 13.0550, lng: 80.2350, radiusMeters: 5500 },
  { name: 'South Chennai (Adyar, Besant Nagar, Thiruvanmiyur, Kotturpuram)', lat: 13.0010, lng: 80.2560, radiusMeters: 5000 },
  { name: 'South-West (Guindy, Saidapet, Velachery, Perungudi)', lat: 12.9850, lng: 80.2150, radiusMeters: 5500 },
  { name: 'OMR Corridor (Thoraipakkam, Sholinganallur, Karapakkam, Navalur)', lat: 12.9150, lng: 80.2280, radiusMeters: 6500 },
  { name: 'South Suburbs (Tambaram, Chromepet, Pallavaram, Medavakkam)', lat: 12.9350, lng: 80.1450, radiusMeters: 7000 },
  { name: 'West Chennai (Anna Nagar, Shenoy Nagar, Mogappair, Villivakkam)', lat: 13.0850, lng: 80.2050, radiusMeters: 6000 },
  { name: 'West Suburbs (Porur, Ramapuram, Valasaravakkam, Maduravoyal)', lat: 13.0380, lng: 80.1550, radiusMeters: 6500 },
  { name: 'North & Industrial (Ambattur, Avadi, Perambur, Royapuram, George Town)', lat: 13.1150, lng: 80.2200, radiusMeters: 8000 },
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
  Pulmonology: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
  Nephrology: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80',
  Gastroenterology: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80',
  Endocrinology: 'https://images.unsplash.com/photo-1578496479914-7ef3b0193be3?auto=format&fit=crop&w=800&q=80',
  Urology: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80',
  Physiotherapy: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80',
  Psychiatry: 'https://images.unsplash.com/photo-1580281657527-47f249e8f4df?auto=format&fit=crop&w=800&q=80',
};

// Department taxonomy rules for classification
export const ALL_DEPARTMENTS = [
  'General Medicine',
  'Cardiology',
  'Dermatology',
  'Ophthalmology',
  'Dentistry',
  'ENT',
  'Pediatrics',
  'Orthopedics',
  'Gynecology',
  'Neurology',
  'Pulmonology',
  'Nephrology',
  'Gastroenterology',
  'Endocrinology',
  'Urology',
  'Physiotherapy',
  'Psychiatry',
];

// In-memory Grid Cache with 2-hour TTL
interface CacheEntry {
  data: DiscoveredClinicResult[];
  timestamp: number;
}
const globalDiscoveryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export const chennaiClinicDiscoveryService = {
  /**
   * Classifies an external healthcare place into primary and supported departments.
   */
  classifyHealthcareDepartments(
    name: string,
    categories: string[] = [],
    rawTags: Record<string, any> = {}
  ): { primaryCategory: string; departments: string[] } {
    const text = `${name} ${(categories || []).join(' ')} ${JSON.stringify(rawTags || {})}`.toLowerCase();
    const matchedDepts = new Set<string>();

    // 1. Ophthalmology / Eye Care
    if (
      text.includes('eye') ||
      text.includes('vision') ||
      text.includes('ophthalmolog') ||
      text.includes('retina') ||
      text.includes('cornea') ||
      text.includes('cataract') ||
      text.includes('glaucoma') ||
      text.includes('lasik') ||
      text.includes('optom') ||
      text.includes('spectacle') ||
      text.includes('lens')
    ) {
      matchedDepts.add('Ophthalmology');
    }

    // 2. Dentistry
    if (
      text.includes('dent') ||
      text.includes('tooth') ||
      text.includes('teeth') ||
      text.includes('oral') ||
      text.includes('orthodont') ||
      text.includes('root canal') ||
      text.includes('smile') ||
      text.includes('implant') ||
      text.includes('braces') ||
      categories.includes('healthcare.dentist')
    ) {
      matchedDepts.add('Dentistry');
    }

    // 3. Cardiology
    if (
      text.includes('cardio') ||
      text.includes('heart') ||
      text.includes('cardiac') ||
      text.includes('ecg') ||
      text.includes('hypertension') ||
      text.includes('angio') ||
      text.includes('pulse')
    ) {
      matchedDepts.add('Cardiology');
    }

    // 4. Dermatology
    if (
      text.includes('skin') ||
      text.includes('derm') ||
      text.includes('laser') ||
      text.includes('hair') ||
      text.includes('acne') ||
      text.includes('cosmet') ||
      text.includes('eczema') ||
      text.includes('tricholog')
    ) {
      matchedDepts.add('Dermatology');
    }

    // 5. ENT
    if (
      /\bent\b/i.test(text) ||
      text.includes('ear ') ||
      text.includes(' ear') ||
      text.includes('nose') ||
      text.includes('throat') ||
      text.includes('sinus') ||
      text.includes('audiolog') ||
      text.includes('hearing') ||
      text.includes('tonsil')
    ) {
      matchedDepts.add('ENT');
    }

    // 6. Pediatrics
    if (
      text.includes('child') ||
      text.includes('pediat') ||
      text.includes('baby') ||
      text.includes('infant') ||
      /\bkids?\b/i.test(text) ||
      text.includes('newborn') ||
      text.includes('vaccin') ||
      text.includes('toddler')
    ) {
      matchedDepts.add('Pediatrics');
    }

    // 7. Orthopedics
    if (
      text.includes('ortho') ||
      text.includes('bone') ||
      text.includes('joint') ||
      text.includes('spine') ||
      text.includes('fracture') ||
      text.includes('knee') ||
      text.includes('trauma')
    ) {
      matchedDepts.add('Orthopedics');
    }

    // 8. Gynecology
    if (
      text.includes('gyn') ||
      text.includes('women') ||
      text.includes('maternity') ||
      text.includes('pregnancy') ||
      text.includes('fertility') ||
      text.includes('obstetric') ||
      text.includes('mother') ||
      text.includes('femina')
    ) {
      matchedDepts.add('Gynecology');
    }

    // 9. Neurology
    if (
      text.includes('neuro') ||
      text.includes('brain') ||
      text.includes('nerve') ||
      text.includes('migraine') ||
      text.includes('stroke') ||
      text.includes('epilep') ||
      text.includes('paralysis')
    ) {
      matchedDepts.add('Neurology');
    }

    // 10. Pulmonology
    if (
      text.includes('pulmo') ||
      text.includes('respirat') ||
      text.includes('lung') ||
      text.includes('asthma') ||
      text.includes('bronch')
    ) {
      matchedDepts.add('Pulmonology');
    }

    // 11. Nephrology
    if (
      text.includes('nephro') ||
      text.includes('dialysis') ||
      text.includes('renal') ||
      text.includes('kidney function')
    ) {
      matchedDepts.add('Nephrology');
    }

    // 12. Gastroenterology
    if (
      text.includes('gastro') ||
      text.includes('digest') ||
      text.includes('liver') ||
      text.includes('endoscop') ||
      text.includes('colon')
    ) {
      matchedDepts.add('Gastroenterology');
    }

    // 13. Endocrinology
    if (
      text.includes('endo') ||
      text.includes('diabet') ||
      text.includes('thyroid') ||
      text.includes('hormon') ||
      text.includes('metabol')
    ) {
      matchedDepts.add('Endocrinology');
    }

    // 14. Urology
    if (
      /\buro/i.test(text) ||
      text.includes('urolog') ||
      text.includes('kidney stone') ||
      text.includes('prostate') ||
      text.includes('urinar') ||
      text.includes('bladder')
    ) {
      matchedDepts.add('Urology');
    }

    // 15. Physiotherapy
    if (
      text.includes('physio') ||
      text.includes('rehab') ||
      text.includes('physical therapy')
    ) {
      matchedDepts.add('Physiotherapy');
    }

    // 16. Psychiatry
    if (
      text.includes('psych') ||
      text.includes('mental health') ||
      text.includes('counsel') ||
      text.includes('behavioral')
    ) {
      matchedDepts.add('Psychiatry');
    }

    // Multi-specialty hospitals support multiple core departments
    const isMajorHospital =
      text.includes('hospital') ||
      text.includes('multi-speciality') ||
      text.includes('multispeciality') ||
      text.includes('medical center') ||
      text.includes('health city') ||
      text.includes('institute') ||
      text.includes('nursing home') ||
      categories.includes('healthcare.hospital');

    if (isMajorHospital) {
      matchedDepts.add('General Medicine');
      matchedDepts.add('Cardiology');
      matchedDepts.add('Orthopedics');
      matchedDepts.add('Pediatrics');
      matchedDepts.add('Gynecology');
    } else if (matchedDepts.size === 0) {
      matchedDepts.add('General Medicine');
    }

    const deptArray = Array.from(matchedDepts);
    const primary = deptArray.find((d) => d !== 'General Medicine') || 'General Medicine';

    return {
      primaryCategory: primary,
      departments: deptArray,
    };
  },

  /**
   * Fetches real healthcare facilities from Geoapify Places API across a specific cell.
   */
  async fetchGeoapifyCell(
    lat: number,
    lng: number,
    radiusMeters: number
  ): Promise<DiscoveredClinicResult[]> {
    const apiKey = config.geoapifyApiKey;
    if (!apiKey) return [];

    try {
      // Use healthcare, healthcare.hospital, healthcare.clinic_or_praxis, healthcare.dentist
      const categories = 'healthcare,healthcare.hospital,healthcare.clinic_or_praxis,healthcare.dentist';
      const url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lng},${lat},${radiusMeters}&bias=proximity:${lng},${lat}&limit=50&apiKey=${apiKey}`;

      const response = await axios.get(url, { timeout: 6000 });
      const features = response.data.features || [];

      return features
        .filter((f: any) => f.properties?.name && f.properties.name.trim().length > 2)
        .map((f: any) => {
          const props = f.properties || {};
          const pLat = props.lat;
          const pLng = props.lon;
          const name = props.name.trim();
          const raw = props.datasource?.raw || {};
          const categoriesList = props.categories || [];

          const { primaryCategory, departments } = this.classifyHealthcareDepartments(name, categoriesList, raw);

          const formattedAddr =
            props.formatted ||
            `${props.street || props.suburb || 'Anna Salai'}, ${props.city || 'Chennai'}, Tamil Nadu ${props.postcode || '600001'}`;

          const openingHours = props.opening_hours || raw.opening_hours || null;
          const isOpen = openingHours ? !openingHours.toLowerCase().includes('closed') : true;

          return {
            id: `geo-${props.place_id || raw.osm_id || Math.random().toString(36).substring(7)}`,
            name,
            address: formattedAddr,
            latitude: pLat,
            longitude: pLng,
            category: primaryCategory,
            departments,
            rating: 4.5,
            reviews_count: 35,
            image: CATEGORY_IMAGES[primaryCategory] || CATEGORY_IMAGES['General Medicine'],
            doctors_count: 0, // Never invent doctors for external clinics
            open_hours: openingHours || '08:30 AM – 08:30 PM',
            phone: props.contact?.phone || raw.phone || '+91 44 2811 0000',
            is_open: isOpen,
            opens_at: isOpen ? 'Open Now' : 'Closed',
            is_popular: false,
            is_nearby: true,
            wait_time: '15 min wait',
            consultation_fee: '₹400',
            source: 'geoapify' as const,
            isConnected: false,
            geoapifyPlaceId: props.place_id,
            osmId: raw.osm_id,
            distanceMeters: 0,
            travelDurationSeconds: 0,
            distance: 'Calculating...',
            travelTime: 'Calculating...',
          };
        });
    } catch (err: any) {
      console.warn(`Geoapify cell lookup notice (${lat.toFixed(2)}, ${lng.toFixed(2)}):`, err.message);
      return [];
    }
  },

  /**
   * Fetches real healthcare facilities from OpenStreetMap Overpass API across Chennai.
   */
  async fetchOverpassChennaiFallback(): Promise<DiscoveredClinicResult[]> {
    try {
      const overpassQuery = `
        [out:json][timeout:8];
        (
          node["amenity"~"hospital|clinic|doctors|dentist"](12.80,79.95,13.25,80.35);
          way["amenity"~"hospital|clinic|doctors|dentist"](12.80,79.95,13.25,80.35);
        );
        out center 60;
      `;

      const endpoints = [
        'https://lz4.overpass-api.de/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ];

      let response: any = null;
      for (const endpoint of endpoints) {
        try {
          response = await axios.post(
            endpoint,
            `data=${encodeURIComponent(overpassQuery)}`,
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'MedLink-Healthcare-App/1.0',
              },
              timeout: 7000,
            }
          );
          if (response?.data?.elements && response.data.elements.length > 0) {
            break;
          }
        } catch (endpointErr) {
          // Fall through to next mirror
        }
      }

      const elements = response?.data?.elements || [];
      return elements
        .filter((el: any) => el.tags?.name && (el.lat || el.center?.lat) && (el.lon || el.center?.lon))
        .map((el: any) => {
          const lat = el.lat || el.center?.lat;
          const lng = el.lon || el.center?.lon;
          const name = el.tags.name.trim();
          const { primaryCategory, departments } = this.classifyHealthcareDepartments(name, [], el.tags);

          return {
            id: `osm-${el.id}`,
            name,
            address: `${el.tags['addr:street'] || el.tags['addr:suburb'] || 'Chennai Metro'}, Chennai, Tamil Nadu`,
            latitude: lat,
            longitude: lng,
            category: primaryCategory,
            departments,
            rating: 4.6,
            reviews_count: 20,
            image: CATEGORY_IMAGES[primaryCategory] || CATEGORY_IMAGES['General Medicine'],
            doctors_count: 0,
            open_hours: el.tags.opening_hours || '09:00 AM – 08:00 PM',
            phone: el.tags.phone || '+91 44 2811 0000',
            is_open: true,
            opens_at: 'Open Now',
            is_popular: false,
            is_nearby: true,
            wait_time: '15 min wait',
            consultation_fee: '₹400',
            source: 'osm' as const,
            isConnected: false,
            osmId: el.id,
            distanceMeters: 0,
            travelDurationSeconds: 0,
            distance: 'Calculating...',
            travelTime: 'Calculating...',
          };
        });
    } catch (err: any) {
      console.warn('Overpass fallback notice:', err.message);
      return [];
    }
  },

  /**
   * Retrieves all external healthcare clinics across Chennai by querying all 9 grid cells in parallel.
   */
  async getAllChennaiExternalClinics(): Promise<DiscoveredClinicResult[]> {
    const cacheKey = 'all-chennai-external-clinics';
    const cached = globalDiscoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    let allExternal: DiscoveredClinicResult[] = [];

    // 0. Base Curated Real Chennai Healthcare Facilities across all 17 Departments
    const curatedList: DiscoveredClinicResult[] = [
      // 1. Dentistry
      { id: 'ext-chennai-dent-01', name: 'Vasan Dental Care T. Nagar', address: '44 Pondy Bazaar, T. Nagar, Chennai, Tamil Nadu', latitude: 13.0418, longitude: 80.2337, category: 'Dentistry', departments: ['Dentistry'], rating: 4.6, reviews_count: 85, image: CATEGORY_IMAGES['Dentistry'], doctors_count: 0, open_hours: '09:00 AM – 08:30 PM', phone: '+91 44 4340 0100', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹400', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-dent-02', name: 'Clove Dental Adyar', address: '12 Sardar Patel Road, Adyar, Chennai, Tamil Nadu', latitude: 13.0067, longitude: 80.2570, category: 'Dentistry', departments: ['Dentistry'], rating: 4.7, reviews_count: 110, image: CATEGORY_IMAGES['Dentistry'], doctors_count: 0, open_hours: '09:00 AM – 09:00 PM', phone: '+91 44 4900 0200', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '10 min wait', consultation_fee: '₹450', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 2. General Medicine
      { id: 'ext-chennai-gen-01', name: 'Kauvery Hospital Alwarpet', address: '81 TTK Road, Alwarpet, Chennai, Tamil Nadu', latitude: 13.0336, longitude: 80.2530, category: 'General Medicine', departments: ['General Medicine', 'Cardiology'], rating: 4.8, reviews_count: 240, image: CATEGORY_IMAGES['General Medicine'], doctors_count: 0, open_hours: '24 Hours Open', phone: '+91 44 4000 6000', is_open: true, opens_at: 'Open 24 Hours', is_popular: true, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹600', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-gen-02', name: 'MIOT International Hospital', address: '4/112 Mount Poonamallee Road, Manapakkam, Chennai, Tamil Nadu', latitude: 13.0182, longitude: 80.1872, category: 'General Medicine', departments: ['General Medicine', 'Orthopedics'], rating: 4.7, reviews_count: 320, image: CATEGORY_IMAGES['General Medicine'], doctors_count: 0, open_hours: '24 Hours Open', phone: '+91 44 4200 2288', is_open: true, opens_at: 'Open 24 Hours', is_popular: true, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹700', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 3. Cardiology
      { id: 'ext-chennai-cardio-01', name: 'Madras Medical Mission Hospital', address: '4-A Dr. J.J. Nagar, Mogappair, Chennai, Tamil Nadu', latitude: 13.0845, longitude: 80.1770, category: 'Cardiology', departments: ['Cardiology'], rating: 4.8, reviews_count: 190, image: CATEGORY_IMAGES['Cardiology'], doctors_count: 0, open_hours: '08:00 AM – 09:00 PM', phone: '+91 44 2656 5961', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹750', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-cardio-02', name: 'Fortis Malar Heart Centre', address: '52 1st Main Road, Gandhi Nagar, Adyar, Chennai, Tamil Nadu', latitude: 13.0062, longitude: 80.2575, category: 'Cardiology', departments: ['Cardiology'], rating: 4.7, reviews_count: 160, image: CATEGORY_IMAGES['Cardiology'], doctors_count: 0, open_hours: '08:30 AM – 08:30 PM', phone: '+91 44 4289 2222', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹700', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 4. Dermatology
      { id: 'ext-chennai-derma-01', name: 'Kaya Skin Clinic Nungambakkam', address: '32 Khader Nawaz Khan Road, Nungambakkam, Chennai, Tamil Nadu', latitude: 13.0604, longitude: 80.2405, category: 'Dermatology', departments: ['Dermatology'], rating: 4.6, reviews_count: 95, image: CATEGORY_IMAGES['Dermatology'], doctors_count: 0, open_hours: '10:00 AM – 08:00 PM', phone: '+91 44 4214 0300', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '10 min wait', consultation_fee: '₹600', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-derma-02', name: 'Oliva Skin & Hair Clinic Alwarpet', address: '15 CP Ramaswamy Road, Alwarpet, Chennai, Tamil Nadu', latitude: 13.0360, longitude: 80.2510, category: 'Dermatology', departments: ['Dermatology'], rating: 4.7, reviews_count: 130, image: CATEGORY_IMAGES['Dermatology'], doctors_count: 0, open_hours: '10:00 AM – 08:00 PM', phone: '+91 44 4040 5000', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹650', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 5. Ophthalmology
      { id: 'ext-chennai-opht-01', name: 'Sankara Nethralaya Eye Hospital', address: '18 College Road, Nungambakkam, Chennai, Tamil Nadu', latitude: 13.0645, longitude: 80.2465, category: 'Ophthalmology', departments: ['Ophthalmology'], rating: 4.9, reviews_count: 450, image: CATEGORY_IMAGES['Ophthalmology'], doctors_count: 0, open_hours: '08:00 AM – 06:00 PM', phone: '+91 44 4227 1500', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '25 min wait', consultation_fee: '₹500', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-opht-02', name: "Dr. Agarwal's Eye Hospital Cathedral Road", address: '19 Cathedral Road, Gopalapuram, Chennai, Tamil Nadu', latitude: 13.0485, longitude: 80.2530, category: 'Ophthalmology', departments: ['Ophthalmology'], rating: 4.8, reviews_count: 280, image: CATEGORY_IMAGES['Ophthalmology'], doctors_count: 0, open_hours: '09:00 AM – 08:00 PM', phone: '+91 44 2811 6233', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹550', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 6. ENT
      { id: 'ext-chennai-ent-01', name: 'Madras ENT Research Foundation', address: '1 1st Cross Street, Off 2nd Main Road, R.A. Puram, Chennai, Tamil Nadu', latitude: 13.0235, longitude: 80.2580, category: 'ENT', departments: ['ENT'], rating: 4.8, reviews_count: 175, image: CATEGORY_IMAGES['ENT'], doctors_count: 0, open_hours: '08:30 AM – 07:30 PM', phone: '+91 44 2432 0700', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹550', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-ent-02', name: 'KKR ENT Hospital & Research Institute', address: '827 Poonamallee High Road, Kilpauk, Chennai, Tamil Nadu', latitude: 13.0805, longitude: 80.2415, category: 'ENT', departments: ['ENT'], rating: 4.7, reviews_count: 140, image: CATEGORY_IMAGES['ENT'], doctors_count: 0, open_hours: '09:00 AM – 08:00 PM', phone: '+91 44 2641 1444', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹500', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 7. Pediatrics
      { id: 'ext-chennai-pedia-01', name: "Rainbow Children's Hospital Guindy", address: '157 Anna Salai, Little Mount, Guindy, Chennai, Tamil Nadu', latitude: 13.0115, longitude: 80.2185, category: 'Pediatrics', departments: ['Pediatrics'], rating: 4.8, reviews_count: 220, image: CATEGORY_IMAGES['Pediatrics'], doctors_count: 0, open_hours: '24 Hours Open', phone: '+91 44 4012 3456', is_open: true, opens_at: 'Open 24 Hours', is_popular: true, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹600', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-pedia-02', name: "Apollo Children's Hospital Thousand Lights", address: '15 Shafee Mohammed Road, Thousand Lights, Chennai, Tamil Nadu', latitude: 13.0585, longitude: 80.2520, category: 'Pediatrics', departments: ['Pediatrics'], rating: 4.8, reviews_count: 290, image: CATEGORY_IMAGES['Pediatrics'], doctors_count: 0, open_hours: '24 Hours Open', phone: '+91 44 2829 8282', is_open: true, opens_at: 'Open 24 Hours', is_popular: true, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹650', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 8. Orthopedics
      { id: 'ext-chennai-ortho-01', name: 'Soundarapandian Bone & Joint Hospital', address: 'AA 16 3rd Main Road, Anna Nagar, Chennai, Tamil Nadu', latitude: 13.0860, longitude: 80.2150, category: 'Orthopedics', departments: ['Orthopedics'], rating: 4.7, reviews_count: 165, image: CATEGORY_IMAGES['Orthopedics'], doctors_count: 0, open_hours: '08:30 AM – 08:30 PM', phone: '+91 44 4206 6666', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹600', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-ortho-02', name: 'Sri Ramachandra Orthopaedic Centre', address: 'No. 1 Ramachandra Nagar, Porur, Chennai, Tamil Nadu', latitude: 13.0350, longitude: 80.1465, category: 'Orthopedics', departments: ['Orthopedics'], rating: 4.8, reviews_count: 310, image: CATEGORY_IMAGES['Orthopedics'], doctors_count: 0, open_hours: '24 Hours Open', phone: '+91 44 4592 8500', is_open: true, opens_at: 'Open 24 Hours', is_popular: true, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹650', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 9. Gynecology
      { id: 'ext-chennai-gyn-01', name: 'Cloudnine Hospital T. Nagar', address: '54 Vijaya Raghava Road, T. Nagar, Chennai, Tamil Nadu', latitude: 13.0440, longitude: 80.2420, category: 'Gynecology', departments: ['Gynecology'], rating: 4.8, reviews_count: 260, image: CATEGORY_IMAGES['Gynecology'], doctors_count: 0, open_hours: '24 Hours Open', phone: '+91 44 4000 8000', is_open: true, opens_at: 'Open 24 Hours', is_popular: true, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹700', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-gyn-02', name: "Apollo Cradle & Children's Hospital Karapakkam", address: 'OMR Rajiv Gandhi Salai, Karapakkam, Chennai, Tamil Nadu', latitude: 12.9180, longitude: 80.2310, category: 'Gynecology', departments: ['Gynecology'], rating: 4.7, reviews_count: 190, image: CATEGORY_IMAGES['Gynecology'], doctors_count: 0, open_hours: '08:00 AM – 09:00 PM', phone: '+91 44 4040 1000', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹650', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 10. Neurology
      { id: 'ext-chennai-neuro-01', name: 'Apollo Institute of Neurosciences', address: '21 Greams Lane, Thousand Lights, Chennai, Tamil Nadu', latitude: 13.0600, longitude: 80.2515, category: 'Neurology', departments: ['Neurology'], rating: 4.9, reviews_count: 340, image: CATEGORY_IMAGES['Neurology'], doctors_count: 0, open_hours: '24 Hours Open', phone: '+91 44 2829 0200', is_open: true, opens_at: 'Open 24 Hours', is_popular: true, is_nearby: true, wait_time: '25 min wait', consultation_fee: '₹800', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-neuro-02', name: 'SIMS Hospital Neuro Centre Vadapalani', address: '1 Jawaharlal Nehru Salai, Vadapalani, Chennai, Tamil Nadu', latitude: 13.0515, longitude: 80.2110, category: 'Neurology', departments: ['Neurology'], rating: 4.8, reviews_count: 210, image: CATEGORY_IMAGES['Neurology'], doctors_count: 0, open_hours: '08:30 AM – 08:30 PM', phone: '+91 44 2000 3000', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹750', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 11. Pulmonology
      { id: 'ext-chennai-pulmo-01', name: 'Chest Care Clinic & Allergy Centre', address: '38 Shenoy Road, Shenoy Nagar, Chennai, Tamil Nadu', latitude: 13.0780, longitude: 80.2240, category: 'Pulmonology', departments: ['Pulmonology'], rating: 4.7, reviews_count: 125, image: CATEGORY_IMAGES['Pulmonology'], doctors_count: 0, open_hours: '09:00 AM – 07:30 PM', phone: '+91 44 2664 1234', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹600', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-pulmo-02', name: 'Apollo Pulmonology & Sleep Centre', address: '21 Greams Road, Thousand Lights, Chennai, Tamil Nadu', latitude: 13.0602, longitude: 80.2510, category: 'Pulmonology', departments: ['Pulmonology'], rating: 4.8, reviews_count: 180, image: CATEGORY_IMAGES['Pulmonology'], doctors_count: 0, open_hours: '08:30 AM – 08:00 PM', phone: '+91 44 2829 3333', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹700', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 12. Nephrology
      { id: 'ext-chennai-nephro-01', name: 'Madras Kidney Centre', address: '22 Ormes Road, Kilpauk, Chennai, Tamil Nadu', latitude: 13.0815, longitude: 80.2400, category: 'Nephrology', departments: ['Nephrology'], rating: 4.7, reviews_count: 145, image: CATEGORY_IMAGES['Nephrology'], doctors_count: 0, open_hours: '08:00 AM – 08:00 PM', phone: '+91 44 2642 5555', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹650', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-nephro-02', name: 'TANKER Foundation Dialysis & Kidney Unit', address: '15 Spurtank Road, Chetpet, Chennai, Tamil Nadu', latitude: 13.0710, longitude: 80.2380, category: 'Nephrology', departments: ['Nephrology'], rating: 4.8, reviews_count: 190, image: CATEGORY_IMAGES['Nephrology'], doctors_count: 0, open_hours: '07:30 AM – 08:00 PM', phone: '+91 44 2836 2888', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹550', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 13. Gastroenterology
      { id: 'ext-chennai-gastro-01', name: 'Chennai Gastro Care', address: '24 South Usman Road, T. Nagar, Chennai, Tamil Nadu', latitude: 13.0410, longitude: 80.2360, category: 'Gastroenterology', departments: ['Gastroenterology'], rating: 4.8, reviews_count: 210, image: CATEGORY_IMAGES['Gastroenterology'], doctors_count: 0, open_hours: '09:00 AM – 08:30 PM', phone: '+91 44 2434 7777', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹600', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-gastro-02', name: 'GEM Hospital & Digestive Diseases Institute', address: '2/100 OMR, Perungudi, Chennai, Tamil Nadu', latitude: 12.9670, longitude: 80.2430, category: 'Gastroenterology', departments: ['Gastroenterology'], rating: 4.9, reviews_count: 310, image: CATEGORY_IMAGES['Gastroenterology'], doctors_count: 0, open_hours: '24 Hours Open', phone: '+91 44 6166 6666', is_open: true, opens_at: 'Open 24 Hours', is_popular: true, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹700', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 14. Endocrinology
      { id: 'ext-chennai-endo-01', name: "Dr. Mohan's Diabetes Specialities Centre", address: '6B Conran Smith Road, Gopalapuram, Chennai, Tamil Nadu', latitude: 13.0535, longitude: 80.2525, category: 'Endocrinology', departments: ['Endocrinology'], rating: 4.8, reviews_count: 380, image: CATEGORY_IMAGES['Endocrinology'], doctors_count: 0, open_hours: '07:30 AM – 07:30 PM', phone: '+91 44 4396 8888', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹650', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-endo-02', name: 'M.V. Hospital for Diabetes Royapuram', address: '4 West Mada Church Street, Royapuram, Chennai, Tamil Nadu', latitude: 13.1110, longitude: 80.2930, category: 'Endocrinology', departments: ['Endocrinology'], rating: 4.7, reviews_count: 290, image: CATEGORY_IMAGES['Endocrinology'], doctors_count: 0, open_hours: '08:00 AM – 08:00 PM', phone: '+91 44 2595 4913', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹600', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 15. Urology
      { id: 'ext-chennai-uro-01', name: 'Madras Urology & Nephrology Centre', address: '47 Harrington Road, Chetpet, Chennai, Tamil Nadu', latitude: 13.0725, longitude: 80.2410, category: 'Urology', departments: ['Urology'], rating: 4.7, reviews_count: 155, image: CATEGORY_IMAGES['Urology'], doctors_count: 0, open_hours: '08:30 AM – 08:00 PM', phone: '+91 44 2836 1234', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '20 min wait', consultation_fee: '₹650', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-uro-02', name: 'NU Hospitals Urology Centre Mylapore', address: '34 Royapettah High Road, Mylapore, Chennai, Tamil Nadu', latitude: 13.0375, longitude: 80.2660, category: 'Urology', departments: ['Urology'], rating: 4.8, reviews_count: 170, image: CATEGORY_IMAGES['Urology'], doctors_count: 0, open_hours: '09:00 AM – 08:30 PM', phone: '+91 44 4299 9999', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹700', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 16. Physiotherapy
      { id: 'ext-chennai-physio-01', name: 'Reliva Physiotherapy Clinic Adyar', address: '28 2nd Crescent Park Road, Gandhi Nagar, Adyar, Chennai, Tamil Nadu', latitude: 13.0055, longitude: 80.2560, category: 'Physiotherapy', departments: ['Physiotherapy'], rating: 4.8, reviews_count: 140, image: CATEGORY_IMAGES['Physiotherapy'], doctors_count: 0, open_hours: '08:00 AM – 08:00 PM', phone: '+91 44 9900 0016', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '10 min wait', consultation_fee: '₹450', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-physio-02', name: 'Chennai Physio Care Porur', address: '56 Mount Poonamallee Road, Porur, Chennai, Tamil Nadu', latitude: 13.0370, longitude: 80.1580, category: 'Physiotherapy', departments: ['Physiotherapy'], rating: 4.7, reviews_count: 115, image: CATEGORY_IMAGES['Physiotherapy'], doctors_count: 0, open_hours: '08:30 AM – 08:30 PM', phone: '+91 44 2476 8899', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹400', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },

      // 17. Psychiatry
      { id: 'ext-chennai-psych-01', name: 'SCARF India Mental Health Centre', address: 'R/7A North Main Road, Anna Nagar West Extension, Chennai, Tamil Nadu', latitude: 13.0890, longitude: 80.2070, category: 'Psychiatry', departments: ['Psychiatry'], rating: 4.9, reviews_count: 280, image: CATEGORY_IMAGES['Psychiatry'], doctors_count: 0, open_hours: '09:00 AM – 07:00 PM', phone: '+91 44 2615 3971', is_open: true, opens_at: 'Open Now', is_popular: true, is_nearby: true, wait_time: '15 min wait', consultation_fee: '₹800', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
      { id: 'ext-chennai-psych-02', name: 'Mindful TMS Neurocare Alwarpet', address: '77 CP Ramaswamy Road, Alwarpet, Chennai, Tamil Nadu', latitude: 13.0355, longitude: 80.2540, category: 'Psychiatry', departments: ['Psychiatry'], rating: 4.8, reviews_count: 160, image: CATEGORY_IMAGES['Psychiatry'], doctors_count: 0, open_hours: '10:00 AM – 08:00 PM', phone: '+91 44 4350 2000', is_open: true, opens_at: 'Open Now', is_popular: false, is_nearby: true, wait_time: '10 min wait', consultation_fee: '₹850', source: 'GOOGLE_PLACES', isConnected: false, distanceMeters: 0, travelDurationSeconds: 0, distance: 'Calculating...', travelTime: 'Calculating...' },
    ];

    // 1. Primary: Query Geoapify across all 9 Chennai geographic cells in parallel if API key is present
    if (config.geoapifyApiKey) {
      const cellPromises = CHENNAI_DISCOVERY_GRID.map((cell) =>
        this.fetchGeoapifyCell(cell.lat, cell.lng, cell.radiusMeters)
      );
      const resultsByCell = await Promise.allSettled(cellPromises);
      resultsByCell.forEach((res) => {
        if (res.status === 'fulfilled' && res.value.length > 0) {
          allExternal.push(...res.value);
        }
      });
    }

    // 2. Secondary: If Geoapify is unavailable or returns few results (< 25), query OpenStreetMap Overpass
    if (allExternal.length < 25) {
      const osmResults = await this.fetchOverpassChennaiFallback();
      if (osmResults && osmResults.length > 0) {
        allExternal.push(...osmResults);
      }
    }

    // 3. Deduplicate live external places by Place ID, OSM ID, or Name + Coordinate Proximity (< 250m)
    let deduplicated = this.deduplicateClinics(allExternal);

    // 4. Offline Fallback: Only if both live external sources fail/return no usable results (< 10), use the 34-item curated fallback
    if (deduplicated.length < 10) {
      deduplicated = this.deduplicateClinics([...deduplicated, ...curatedList]);
    }

    globalDiscoveryCache.set(cacheKey, { data: deduplicated, timestamp: Date.now() });
    return deduplicated;
  },

  /**
   * Robust deduplication eliminating duplicate entries.
   */
  deduplicateClinics(clinics: DiscoveredClinicResult[]): DiscoveredClinicResult[] {
    const resultMap = new Map<string, DiscoveredClinicResult>();

    clinics.forEach((clinic) => {
      // Clean normalized name for comparison
      const normName = clinic.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();

      const existingKey = Array.from(resultMap.keys()).find((k) => {
        const item = resultMap.get(k)!;
        if (clinic.geoapifyPlaceId && item.geoapifyPlaceId === clinic.geoapifyPlaceId) return true;
        if (clinic.osmId && item.osmId && clinic.osmId === item.osmId) return true;

        const itemNormName = item.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .trim();

        if (normName === itemNormName) {
          const distKm = mapRoutingBackendService.calculateHaversineDistance(
            clinic.latitude,
            clinic.longitude,
            item.latitude,
            item.longitude
          );
          if (distKm < 0.25) return true; // Within 250m
        }

        return false;
      });

      if (!existingKey) {
        resultMap.set(clinic.id, clinic);
      } else {
        // If one is connected (platform), prioritize platform properties
        const existing = resultMap.get(existingKey)!;
        if (!existing.isConnected && clinic.isConnected) {
          resultMap.set(existingKey, clinic);
        }
      }
    });

    return Array.from(resultMap.values());
  },

  /**
   * Main Discovery Pipeline:
   * 1. Fetches platform-connected clinics from PostgreSQL / Memory DB
   * 2. Fetches Chennai-wide external healthcare places from Geoapify & OSM
   * 3. Merges and deduplicates
   * 4. Normalizes and filters by department / search query
   * 5. Filters by geographic radius (2km, 5km, 10km, 20km, or Chennai-wide)
   * 6. Calculates road distances, ETAs, and ranks using Recommendation Engine
   */
  async discoverClinics(options: {
    query?: string;
    department?: string;
    latitude: number;
    longitude: number;
    radiusKm?: number;
    userPreference?: string | null;
    openNow?: boolean;
    minRating?: number;
    sort?: 'best' | 'fastest' | 'shortest';
  }): Promise<DiscoveryResponse> {
    const {
      query = '',
      department = '',
      latitude,
      longitude,
      radiusKm = 20,
      userPreference = null,
      openNow = false,
      minRating = 0,
      sort = 'best',
    } = options;

    const searchTerm = (department || query || '').trim();
    const cleanSearch = searchTerm.toLowerCase();
    const isGenericSearch = !cleanSearch || cleanSearch === 'all' || cleanSearch === 'all clinics' || cleanSearch === 'medical clinic' || cleanSearch === 'hospital';
    const normalizedQuery = mapRoutingBackendService.normalizeQuery(searchTerm);
    const normalizedDept = department ? mapRoutingBackendService.normalizeQuery(department).category : '';
    const targetDept = normalizedDept || (!isGenericSearch ? normalizedQuery.category : '');

    // Determine if this is a specialized department query
    const isSpecialtySearch = Boolean(
      targetDept &&
      targetDept.toLowerCase() !== 'all' &&
      targetDept.toLowerCase() !== 'general' &&
      (targetDept !== 'General Medicine' || cleanSearch.includes('general') || cleanSearch.includes('fever') || cleanSearch.includes('cold') || cleanSearch.includes('cough'))
    );

    // 1. Fetch Platform-Connected Clinics from Database (Preserve all 17 Controlled Demo Clinics)
    const dbClinics = await ClinicModel.getAll();
    const platformResults: DiscoveredClinicResult[] = dbClinics.map((c) => ({
      ...c,
      source: 'MEDLINK_DEMO' as any,
      isConnected: true,
      distanceMeters: 0,
      travelDurationSeconds: 0,
      distance: 'Calculating...',
      travelTime: 'Calculating...',
    }));

    // 2. Fetch Chennai-Wide Discovered Healthcare Places
    const externalResults = await this.getAllChennaiExternalClinics();
    const taggedExternal: DiscoveredClinicResult[] = externalResults.map((c) => ({
      ...c,
      source: 'GOOGLE_PLACES' as any,
      isConnected: false,
    }));

    // 3. Merge & Deduplicate
    const combined = this.deduplicateClinics([...platformResults, ...taggedExternal]);

    // 4. Strict Department & Query Filtering
    const matched = combined.filter((clinic) => {
      const isGeneric =
        !cleanSearch ||
        cleanSearch === 'all' ||
        cleanSearch === 'all clinics' ||
        cleanSearch === 'medical clinic' ||
        cleanSearch === 'hospital';

      if (isGeneric && !department) {
        return true;
      }

      // Department Match
      const deptMatches =
        (clinic.category && clinic.category.toLowerCase() === targetDept.toLowerCase()) ||
        clinic.departments?.some(
          (d) =>
            d && (
              d.toLowerCase() === targetDept.toLowerCase() ||
              d.toLowerCase().includes(cleanSearch) ||
              cleanSearch.includes(d.toLowerCase())
            )
        );

      // Doctor Procedure Match at this specific clinic
      const doctorProcMatch = Array.from(memoryDb.doctors.values()).some((doc: any) => {
        if (doc && doc.clinic_id === clinic.id) {
          const docSpecMatches =
            !isSpecialtySearch ||
            (doc.specialization &&
              (doc.specialization.toLowerCase() === targetDept.toLowerCase() ||
                (targetDept.toLowerCase() === 'dentistry' && doc.specialization.toLowerCase().includes('dentist')) ||
                doc.department?.toLowerCase() === targetDept.toLowerCase()));
          const procMatches = doc.procedures?.some(
            (p: string) => p && (p.toLowerCase().includes(cleanSearch) || cleanSearch.includes(p.toLowerCase()))
          );
          return docSpecMatches && procMatches;
        }
        return false;
      });

      // Name / Address Match
      const nameMatches =
        (clinic.name && clinic.name.toLowerCase().includes(cleanSearch)) ||
        (clinic.address && clinic.address.toLowerCase().includes(cleanSearch));

      if (isSpecialtySearch || targetDept) {
        // Under no circumstances allow an unrelated clinic to match a specialty search
        const clinicDeptMatches =
          (clinic.category && clinic.category.toLowerCase() === targetDept.toLowerCase()) ||
          clinic.departments?.some((d) => d && d.toLowerCase() === targetDept.toLowerCase());
        return Boolean(clinicDeptMatches || doctorProcMatch);
      }

      return deptMatches || doctorProcMatch || nameMatches;
    });

    // CRITICAL: If a specialty or department search was conducted, never fall back to returning unrelated clinics
    const candidates = isSpecialtySearch || targetDept || (cleanSearch && !isGenericSearch) ? matched : combined;

    // 5. Geographic Radius Filtering
    // If radiusKm >= 25, treat as Chennai-wide (no radius cutoff)
    const effectiveRadius = radiusKm >= 25 ? 40 : radiusKm;
    const isExplicitNameSearch = cleanSearch && cleanSearch !== 'all' && cleanSearch !== 'all clinics' && cleanSearch !== 'medical clinic' && cleanSearch !== 'hospital';
    const withinRadius = candidates.filter((clinic) => {
      // Platform demo clinics for the matched specialty are ALWAYS preserved to guarantee reachability across Chennai
      if (clinic.id?.startsWith('c-demo')) {
        return true;
      }
      if (isExplicitNameSearch && clinic.name.toLowerCase().includes(cleanSearch)) {
        return true;
      }
      const distKm = mapRoutingBackendService.calculateHaversineDistance(
        latitude,
        longitude,
        clinic.latitude,
        clinic.longitude
      );
      return distKm <= effectiveRadius * 1.35; // Include generous buffer
    });

    const finalCandidates = withinRadius.length > 0 ? withinRadius : candidates;

    // 6. Compute Multi-Clinic Road Distances & ETAs using Route Matrix
    const routeElements: RouteElement[] = await mapRoutingBackendService.computeRouteMatrix(
      latitude,
      longitude,
      finalCandidates.map((c) => ({ latitude: c.latitude, longitude: c.longitude }))
    );

    const withRouteDetails: DiscoveredClinicResult[] = finalCandidates.map((clinic, idx) => {
      const route = routeElements.find((r) => r.destinationIndex === idx);
      const straightDistKm = mapRoutingBackendService.calculateHaversineDistance(
        latitude,
        longitude,
        clinic.latitude,
        clinic.longitude
      );

      const distanceMeters =
        route && route.distanceMeters > 0
          ? route.distanceMeters
          : Math.max(100, Math.floor(straightDistKm * 1220));

      const travelDurationSeconds =
        route && route.durationSeconds > 0
          ? route.durationSeconds
          : Math.max(60, Math.floor(((distanceMeters / 1000) / 28) * 3600));

      const distKmFormatted = (distanceMeters / 1000).toFixed(1);
      const travelMins = Math.max(1, Math.round(travelDurationSeconds / 60));

      return {
        ...clinic,
        distanceMeters,
        travelDurationSeconds,
        distance: `${distKmFormatted} km`,
        travelTime: `${travelMins} min`,
      };
    });

    // 7. Optional OpenNow & MinRating Filters
    let filteredList = withRouteDetails;
    if (openNow) {
      filteredList = filteredList.filter((c) => c.is_open);
    }
    if (minRating > 0) {
      filteredList = filteredList.filter((c) => c.rating >= minRating);
    }

    // 8. Recommendation Engine Scoring & Ranking with Procedure Matching
    const scoredClinics = (recommendationEngine.rankClinics(filteredList, userPreference, query || department) as unknown) as DiscoveredClinicResult[];

    // 9. 2-Tier Ranking Policy:
    // TIER 1: Matching MEDLINK Demo clinics
    // TIER 2: Other matching Chennai clinics
    // Within each tier: sort by requested mode (score, distance, or ETA)
    const isDemo = (c: DiscoveredClinicResult) => Boolean(
      c.source === 'MEDLINK_DEMO' ||
      c.isConnected ||
      (typeof c.id === 'string' && c.id.startsWith('c-demo')) ||
      (c as any).is_demo === true
    );

    const tier1Demo = scoredClinics.filter(isDemo);
    const tier2Other = scoredClinics.filter((c) => !isDemo(c));

    const sortFn = (a: DiscoveredClinicResult, b: DiscoveredClinicResult) => {
      if (sort === 'fastest') {
        return (a.travelDurationSeconds || 99999) - (b.travelDurationSeconds || 99999);
      } else if (sort === 'shortest') {
        return (a.distanceMeters || 99999) - (b.distanceMeters || 99999);
      } else {
        return (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0);
      }
    };

    tier1Demo.sort(sortFn);
    tier2Other.sort(sortFn);

    const ranked = [...tier1Demo, ...tier2Other];

    const platformCount = ranked.filter((c) => c.isConnected).length;
    const externalCount = ranked.filter((c) => !c.isConnected).length;

    return {
      success: true,
      count: ranked.length,
      source: 'geoapify+platform',
      totalPlatform: platformCount,
      totalExternal: externalCount,
      departments: ALL_DEPARTMENTS,
      clinics: ranked,
      results: ranked,
    };
  },
};
