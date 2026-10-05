import { Router, Request, Response } from 'express';
import { ClinicModel, DepartmentModel, DoctorModel } from '../database/models';
import { mapRoutingBackendService, googleMapsBackendService, CHENNAI_GEOGRAPHIC_CELLS } from '../services/mapRoutingBackendService';
import { chennaiClinicDiscoveryService } from '../services/chennaiClinicDiscoveryService';
import { recommendationEngine } from '../services/recommendationEngine';
import { authNotificationService } from '../services/authNotificationService';
import { authOtpService } from '../services/authOtpService';

export const clinicRouter = Router();

// GET /api/clinics/route
clinicRouter.get('/route', async (req: Request, res: Response): Promise<void> => {
  try {
    const originLat = parseFloat((req.query.originLat as string) || '13.0338');
    const originLng = parseFloat((req.query.originLng as string) || '80.2677');
    const destLat = parseFloat((req.query.destLat as string) || '13.0368');
    const destLng = parseFloat((req.query.destLng as string) || '80.2647');

    const route = await mapRoutingBackendService.calculateRouteGeometry(originLat, originLng, destLat, destLng);
    res.status(200).json({ success: true, route });
  } catch (err: any) {
    console.error('Route calculation error:', err);
    res.status(500).json({ success: false, error: 'Failed to calculate route geometry.' });
  }
});

// GET /api/clinics/reverse-geocode
clinicRouter.get('/reverse-geocode', async (req: Request, res: Response): Promise<void> => {
  try {
    const lat = parseFloat((req.query.latitude || req.query.lat) as string);
    const lng = parseFloat((req.query.longitude || req.query.lng) as string);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ success: false, error: 'Valid latitude and longitude required.' });
      return;
    }

    const localityInfo = await mapRoutingBackendService.reverseGeocode(lat, lng);
    res.status(200).json({
      success: true,
      name: localityInfo.name,
      locality: localityInfo.locality,
      latitude: lat,
      longitude: lng,
    });
  } catch (err: any) {
    console.error('Reverse geocode error:', err);
    res.status(500).json({ success: false, error: 'Failed to reverse geocode coordinates.' });
  }
});

// GET /api/clinics/geocode
clinicRouter.get('/geocode', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = (req.query.query as string) || '';
    if (!query.trim()) {
      res.status(200).json({ success: true, locations: [] });
      return;
    }

    const locations = await mapRoutingBackendService.geocodeQuery(query);
    res.status(200).json({ success: true, locations });
  } catch (err: any) {
    console.error('Geocode search error:', err);
    res.status(500).json({ success: false, error: 'Failed to geocode query.' });
  }
});

// GET /api/clinics/specializations
clinicRouter.get('/specializations', async (_req: Request, res: Response): Promise<void> => {
  try {
    const departments = await DepartmentModel.getAll();
    res.status(200).json({ success: true, specializations: departments, departments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch specializations.' });
  }
});

// GET /api/clinics/departments
clinicRouter.get('/departments', async (_req: Request, res: Response): Promise<void> => {
  try {
    const departments = await DepartmentModel.getAll();
    res.status(200).json({ success: true, departments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch departments.' });
  }
});

// GET /api/clinics/discovery
clinicRouter.get('/discovery', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = (req.query.query as string) || '';
    const department = (req.query.department as string) || '';
    const lat = parseFloat((req.query.latitude as string) || '13.0338');
    const lng = parseFloat((req.query.longitude as string) || '80.2677');
    const radius = parseFloat((req.query.radius as string) || '20');
    const userPrefSpecialty = (req.query.preference as string) || null;
    const openNow = req.query.openNow === 'true';
    const minRating = parseFloat((req.query.minRating as string) || '0');
    const sort = ((req.query.sort as string) || 'best') as 'best' | 'fastest' | 'shortest';

    // 1. Chennai-Wide Grid Discovery (Geoapify + OSM + PostgreSQL)
    const discovery = await chennaiClinicDiscoveryService.discoverClinics({
      query,
      department,
      latitude: lat,
      longitude: lng,
      radiusKm: radius,
      userPreference: userPrefSpecialty,
      openNow,
      minRating,
      sort,
    });

    // 2. Attach real verified doctor counts only for platform-connected clinics
    const allDoctors = await DoctorModel.getAll();
    const enrichedClinics = discovery.clinics.map((clinic) => {
      if (clinic.isConnected) {
        const docs = allDoctors.filter(
          (d) => d.clinic_id === clinic.id || d.clinic_affiliations?.includes(clinic.name)
        );
        return {
          ...clinic,
          doctors_count: docs.length,
          consultation_fee: docs.length > 0 ? docs[0].consultation_fee : clinic.consultation_fee,
          wait_time: docs.length > 0 ? `${docs[0].wait_time} wait` : clinic.wait_time,
        };
      }
      return clinic;
    });

    res.status(200).json({
      success: true,
      count: enrichedClinics.length,
      total: enrichedClinics.length,
      source: discovery.source,
      totalPlatform: discovery.totalPlatform,
      totalExternal: discovery.totalExternal,
      departments: discovery.departments,
      clinics: enrichedClinics,
      results: enrichedClinics,
    });
  } catch (err: any) {
    console.error('Clinic discovery error:', err);
    res.status(500).json({ success: false, error: 'Failed to discover nearby clinics.' });
  }
});

// GET /api/clinics
clinicRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let clinics = await ClinicModel.getAll();
    const dept = ((req.query.department || req.query.specialty) as string || '').trim().toLowerCase();
    if (dept) {
      clinics = clinics.filter((c: any) => {
        const depts: string[] = (c.departments || []).map((d: string) => d.toLowerCase());
        const specs: string[] = (c.specialties || []).map((s: string) => s.toLowerCase());
        return depts.includes(dept) || specs.includes(dept) || depts.some((d: string) => d.includes(dept) || dept.includes(d));
      });
    }
    res.status(200).json({ success: true, count: clinics.length, clinics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch clinics.' });
  }
});

// GET /api/clinics/:id
clinicRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinic = await ClinicModel.getById(req.params.id);
    if (!clinic) {
      res.status(404).json({ success: false, error: 'Clinic not found.' });
      return;
    }

    const doctors = await DoctorModel.getByClinic(clinic.id);
    res.status(200).json({
      success: true,
      clinic: {
        ...clinic,
        doctors,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch clinic details.' });
  }
});

// GET /api/clinics/:id/doctors
clinicRouter.get('/:id/doctors', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinic = await ClinicModel.getById(req.params.id);
    if (clinic && (clinic.status === 'PENDING_REVIEW' || clinic.status === 'REJECTED')) {
      res.status(403).json({
        success: false,
        error: `Access forbidden: Clinic ${clinic.name} is ${clinic.status}. Operational clinic access is denied until approved by administrator.`,
        code: 'CLINIC_NOT_ACTIVE',
        status: clinic.status,
      });
      return;
    }
    const doctors = await DoctorModel.getByClinic(req.params.id);
    res.status(200).json({ success: true, doctors });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch clinic doctors.' });
  }
});

// GET /api/clinics/:id/operational (Operational check)
clinicRouter.get('/:id/operational', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinic = await ClinicModel.getById(req.params.id);
    if (!clinic) {
      res.status(404).json({ success: false, error: 'Clinic not found.' });
      return;
    }
    if (clinic.status === 'PENDING_REVIEW' || clinic.status === 'REJECTED') {
      res.status(403).json({
        success: false,
        error: `Access forbidden: Clinic ${clinic.name} is ${clinic.status}. Operational clinic access is denied until approved by administrator.`,
        code: 'CLINIC_NOT_ACTIVE',
        status: clinic.status,
      });
      return;
    }
    res.status(200).json({ success: true, operational: true, clinic });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to verify operational clinic status.' });
  }
});

// GET /api/clinics/verification/pending (Admin: Fetch pending clinics)
clinicRouter.get('/verification/pending', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pendingClinics = await ClinicModel.getPendingVerifications();
    res.status(200).json({
      success: true,
      count: pendingClinics.length,
      clinics: pendingClinics,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch pending clinics.' });
  }
});

// POST & PUT /api/clinics/:id/verify (Admin: Approve or Reject clinic)
const handleClinicVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status = 'ACTIVE', rejectionReason } = req.body || {};
    const clinic = await ClinicModel.getById(req.params.id);

    if (!clinic) {
      res.status(404).json({ success: false, error: 'Clinic not found.' });
      return;
    }

    const updated = await ClinicModel.updateVerificationStatus(req.params.id, status, rejectionReason);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Clinic not found.' });
      return;
    }

    // Trigger auth-only email and SMS notifications (independent, non-blocking)
    if (status === 'ACTIVE') {
      if (updated.email) {
        authNotificationService.sendClinicApprovalEmail(updated.email, updated.name).catch((err) =>
          console.warn('Clinic approval email error:', err.message)
        );
      }
      if (updated.phone) {
        authNotificationService.sendClinicApprovalSms(updated.phone, updated.name).catch((err) =>
          console.warn('Clinic approval SMS error:', err.message)
        );
      }
    } else if (status === 'REJECTED') {
      if (updated.email) {
        authNotificationService.sendClinicRejectionEmail(updated.email, updated.name, rejectionReason).catch((err) =>
          console.warn('Clinic rejection email error:', err.message)
        );
      }
      if (updated.phone) {
        authNotificationService.sendClinicRejectionSms(updated.phone, updated.name, rejectionReason).catch((err) =>
          console.warn('Clinic rejection SMS error:', err.message)
        );
      }
    }

    emitBroadcast('clinic:verified', updated);

    res.status(200).json({
      success: true,
      clinic: updated,
      message: `Clinic ${updated.name} verification status set to ${status}.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update clinic verification.' });
  }
};
clinicRouter.post('/:id/verify', handleClinicVerification);
clinicRouter.put('/:id/verify', handleClinicVerification);

import { emitBroadcast } from '../services/socketService';

// POST /api/clinics (Clinic Registration Endpoint)
const registerClinicHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      address,
      latitude,
      longitude,
      phone,
      email,
      category = 'Dental Care',
      departments = ['Dentistry'],
      openHours = '09:00 AM - 05:00 PM',
      consultationFee = '₹400',
    } = req.body;

    if (!name || !name.trim() || !address || !address.trim() || !email || !phone) {
      res.status(400).json({ success: false, error: 'Clinic name, address, email, and phone number are required.' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    // Prevent duplicate email
    const existingEmail = await ClinicModel.findByEmail(cleanEmail);
    if (existingEmail) {
      res.status(409).json({ success: false, error: 'A clinic with this email address already exists.' });
      return;
    }

    // Prevent duplicate phone
    const existingPhone = await ClinicModel.findByPhone(cleanPhone);
    if (existingPhone) {
      res.status(409).json({ success: false, error: 'A clinic with this phone number already exists.' });
      return;
    }

    let lat = typeof latitude === 'number' ? latitude : parseFloat(latitude);
    let lng = typeof longitude === 'number' ? longitude : parseFloat(longitude);

    // If coordinates are missing, zero, or default standard fallback, resolve accurately from address
    const isDefaultCoords = (lat === 13.0078 && lng === 80.2567) || (lat === 13.0338 && lng === 80.2677);
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0) || isDefaultCoords) {
      const geocoded = await mapRoutingBackendService.geocodeQuery(address);
      if (geocoded.length > 0) {
        lat = geocoded[0].latitude;
        lng = geocoded[0].longitude;
      } else {
        // Check if address matches any Chennai cell centroid
        const cleanAddr = address.toLowerCase();
        const matchedCell = CHENNAI_GEOGRAPHIC_CELLS.find((c) => cleanAddr.includes(c.name.toLowerCase()));
        if (matchedCell) {
          lat = matchedCell.lat;
          lng = matchedCell.lng;
        } else if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
          lat = 13.1075; // Standard Chennai centroid
          lng = 80.2060;
        }
      }
    }

    const id = `clinic-${Date.now()}`;
    const newClinic = await ClinicModel.create({
      id,
      name: name.trim(),
      address: address.trim(),
      latitude: lat,
      longitude: lng,
      rating: 4.85,
      reviews_count: 0,
      image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=600',
      category: category || 'Dentistry',
      doctors_count: 0,
      open_hours: openHours,
      phone: cleanPhone,
      email: cleanEmail,
      is_open: false,
      is_popular: false,
      is_nearby: true,
      wait_time: '10 min',
      consultation_fee: consultationFee,
      departments: Array.isArray(departments) ? departments : [departments],
      status: 'PENDING_REVIEW',
      verification_status: 'PENDING_REVIEW',
      email_verified: false,
      phone_verified: false,
      created_at: new Date().toISOString(),
    });

    // Generate Clinic Email & SMS OTPs
    const emailOtpRes = await authOtpService.generateOtp('clinic_email', cleanEmail);
    const phoneOtpRes = await authOtpService.generateOtp('clinic_sms', cleanPhone);

    if (emailOtpRes.otp) {
      await authNotificationService.sendClinicEmailOtp(cleanEmail, emailOtpRes.otp);
    }
    if (phoneOtpRes.otp) {
      await authNotificationService.sendClinicSmsOtp(cleanPhone, phoneOtpRes.otp);
    }

    // Broadcast real-time clinic creation event
    emitBroadcast('clinic:created', newClinic);

    const isDev = process.env.NODE_ENV !== 'production';
    res.status(201).json({
      success: true,
      message: 'Clinic registered successfully. Please verify your email and phone to submit for administrative approval.',
      clinic: newClinic,
      clinicId: newClinic.id,
      status: 'PENDING_REVIEW',
      requiresEmailVerification: true,
      requiresPhoneVerification: true,
      ...(isDev ? { devEmailOtp: emailOtpRes.otp, devPhoneOtp: phoneOtpRes.otp } : {}),
    });
  } catch (err: any) {
    console.error('Error registering clinic:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to register clinic.' });
  }
};

clinicRouter.post('/', registerClinicHandler);
clinicRouter.post('/register', registerClinicHandler);

