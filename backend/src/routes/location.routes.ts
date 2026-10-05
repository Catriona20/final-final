import { Router, Request, Response } from 'express';
import { mapRoutingBackendService } from '../services/mapRoutingBackendService';

export const locationRouter = Router();

// In-memory cache for reverse-geocoding requests
const geocodeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes cache

// GET /api/location/reverse-geocode
locationRouter.get('/reverse-geocode', async (req: Request, res: Response): Promise<void> => {
  try {
    const lat = parseFloat((req.query.lat || req.query.latitude) as string);
    const lng = parseFloat((req.query.lng || req.query.longitude) as string);
    const forceRefresh = req.query.refresh === 'true';

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ success: false, error: 'Valid latitude and longitude are required.' });
      return;
    }

    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = geocodeCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.status(200).json(cached.data);
      return;
    }

    const localityInfo = await mapRoutingBackendService.reverseGeocode(lat, lng);
    const responseData = {
      success: true,
      latitude: lat,
      longitude: lng,
      name: localityInfo.name,
      displayName: localityInfo.locality,
      locality: localityInfo.locality,
      city: 'Chennai',
      district: 'Chennai District',
      state: 'Tamil Nadu',
      country: 'India',
    };

    geocodeCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    res.status(200).json(responseData);
  } catch (err: any) {
    console.error('Location reverse-geocode error:', err);
    res.status(500).json({ success: false, error: 'Failed to reverse geocode coordinates.' });
  }
});

// GET /api/location/geocode
locationRouter.get('/geocode', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = (req.query.query || req.query.q || '') as string;
    if (!query.trim()) {
      res.status(200).json({ success: true, locations: [] });
      return;
    }

    const locations = await mapRoutingBackendService.geocodeQuery(query);
    res.status(200).json({ success: true, locations });
  } catch (err: any) {
    console.error('Location geocode error:', err);
    res.status(500).json({ success: false, error: 'Failed to geocode query.' });
  }
});
