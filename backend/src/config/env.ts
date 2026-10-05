import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'fyp_patient_app_super_secure_jwt_secret_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/patient_app_db',
  
  // Active Providers Configuration (MapLibre / OpenStreetMap / Geoapify / OpenRouteService vs Google Cloud)
  mapProvider: process.env.MAP_PROVIDER || 'maplibre', // 'maplibre' | 'google'
  routingProvider: process.env.ROUTING_PROVIDER || 'openrouteservice', // 'openrouteservice' | 'geoapify' | 'google'
  placesProvider: process.env.PLACES_PROVIDER || 'geoapify', // 'geoapify' | 'google'

  // Open & Free Map Stack API Keys
  geoapifyApiKey: process.env.GEOAPIFY_API_KEY || '',
  openrouteserviceApiKey: process.env.OPENROUTESERVICE_API_KEY || '',

  // GOOGLE MAPS PLATFORM (PRESERVED FOR FUTURE USE)
  // Switch provider through configuration (MAP_PROVIDER=google, ROUTING_PROVIDER=google, PLACES_PROVIDER=google)
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
  googleRoutesApiKey: process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
  
  // Twilio Verify & SMS
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',

  // Resend Transactional Email
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'MedLink Health <no-reply@medlink.health>',

  // Auth Notification Providers ('console' | 'resend' | 'twilio')
  emailProvider: (process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'console')).toLowerCase(),
  smsProvider: (process.env.SMS_PROVIDER || (process.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'console')).toLowerCase(),

  frontendUrl: process.env.FRONTEND_URL || '*',

  // Cloned Microservices Integration Endpoints
  nlpServiceUrl: process.env.NLP_SERVICE_URL || 'http://localhost:8000',
  pharmacySecurityServiceUrl: process.env.PHARMACY_SECURITY_SERVICE_URL || 'http://localhost:4000',
};

