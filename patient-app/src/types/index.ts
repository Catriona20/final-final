export interface LocationCoords {
  latitude: number;
  longitude: number;
}

export interface ActiveLocation {
  id: string;
  name: string;
  locality: string;
  displayName?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
  type: 'gps' | 'saved' | 'manual' | 'preset';
  label?: 'Home' | 'College' | 'Work' | 'Other' | 'Current Location';
}

export interface SavedLocation {
  id: string;
  label: 'Home' | 'College' | 'Work' | 'Other';
  name: string;
  locality: string;
  latitude: number;
  longitude: number;
  address: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string;
  bloodGroup: string;
  age: number;
  gender: string;
  avatar?: string;
  address: string;
  emergencyContact: string;
  preferredSpecialization?: string;
  preferredDoctor?: string;
  location?: string;
  notificationsEnabled?: boolean;
}

export interface Department {
  id: string;
  name: string;
  icon: string;
  description: string;
  clinicCount?: number;
  doctorCount?: number;
  keywords?: string[];
  popularSymptoms?: string[];
}

export interface Specialization {
  id: string;
  name: string;
  iconName: string;
  clinicCount: number;
  description: string;
}

export interface Review {
  id: string;
  patientName: string;
  patientAvatar?: string;
  rating: number;
  date: string;
  comment: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  qualification: string;
  rating: number;
  reviewsCount: number;
  experienceYears: number;
  avatar: string;
  clinicId: string;
  clinicName: string;
  availableDays: string[];
  waitTime?: string;
  isAvailableToday?: boolean;
  status?: string;
  liveStatus?: string;
  availabilityStatus?: string;
  hasApprovedSchedule?: boolean;
  isInsideSchedule?: boolean;
  languages: string[];
  consultationFee: string;
  isPreferred?: boolean;
  about?: string;
  clinicAffiliations?: string[];
  reviews?: Review[];
  
  // Real Verification & Licensing attributes
  isVerified?: boolean;
  registrationNumber?: string;
  registrationAuthority?: string;
  consultationDuration?: string; // e.g. "25 min"

  // Continuity attributes
  previousVisitsCount?: number;
  lastVisitedDate?: string;
}

export interface Clinic {
  id: string;
  name: string;
  address: string;
  distance: string;
  travelTime?: string;
  rating: number;
  reviewsCount: number;
  image: string;
  category: string;
  doctorsCount: number;
  openHours: string;
  phone: string;
  isPopular?: boolean;
  isNearby?: boolean;
  waitTime?: string;
  consultationFee?: string;
  isOpen?: boolean;
  opensAt?: string; // e.g. "Opens at 8:00 AM tomorrow"
  
  // Google Places / Routes parameters
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  distanceMeters?: number;
  travelDurationSeconds?: number;
  userRatingCount?: number;
  photoReference?: string;
  recommendationScore?: number;
  recommendationReason?: string;
  departments?: string[];
  is_open?: boolean;
  reviews_count?: number;

  // Healthcare directory metadata
  source?: 'platform' | 'geoapify' | 'osm';
  isConnected?: boolean;

  // Continuity attributes
  previousVisitsCount?: number;
  lastVisitedDate?: string;
  previousDoctorName?: string;
}

export type AppointmentStatus =
  | 'Booked'
  | 'Arrived'
  | 'Confirmed'
  | 'Checked In'
  | 'Waiting'
  | 'Almost Your Turn'
  | 'Next'
  | 'In Consultation'
  | 'Completed'
  | 'Delayed'
  | 'Cancelled'
  | 'CANCELLED'
  | 'No-show'
  | 'NO_SHOW';

export type ConsultationReason =
  | 'General consultation'
  | 'Follow-up'
  | 'New symptoms'
  | 'Routine check-up'
  | 'Prescription review'
  | 'Report/test review'
  | 'Other';

export interface UploadedMedicalFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize?: string;
  uri?: string;
  uploadDate: string;
  testName: string;
  category: 'Lab report' | 'Scan' | 'Prescription' | 'Medical document' | 'Test result' | 'Other';
  clinicPerformed: string;
  testDate: string;
  reasonForTest: string;
  notes?: string;
}

export interface PrescriptionMedicine {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface DigitalPrescription {
  id: string;
  appointmentId: string;
  doctorName: string;
  doctorSpecialization: string;
  doctorRegistrationNumber?: string;
  clinicName: string;
  clinicAddress: string;
  date: string;
  diagnosis?: string;
  clinicalNotes?: string;
  medicines: PrescriptionMedicine[];
  followUpDate?: string;
}

export interface PreviousVisitInfo {
  count: number;
  lastDate: string;
  doctorName: string;
  department: string;
  reason: string;
  prescriptionAvailable: boolean;
}

export interface Appointment {
  id: string;
  doctorName: string;
  doctorSpecialization: string;
  doctorAvatar: string;
  clinicName: string;
  clinicAddress: string;
  clinicId?: string;
  doctorId?: string;
  department?: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  queueNumber?: number;
  tokenNumber?: string;
  queuePosition?: number;
  patientsAhead?: number;
  estimatedWait?: string;
  travelTime?: string;
  distance?: string;
  prescriptionAvailable?: boolean;
  currentServingToken?: string;
  currentServingPatient?: string;
  reason?: string;
  customReasonText?: string;
  symptoms?: string[];
  uploadedFiles?: UploadedMedicalFile[];
  prescription?: DigitalPrescription;
  expectedDuration?: string;
  consultationFee?: string;
  notes?: string;
  previousVisitInfo?: PreviousVisitInfo;
}

export interface HealthRecord {
  id: string;
  type: 'lab' | 'prescription' | 'report';
  title: string;
  clinic: string;
  clinicId?: string;
  appointmentId?: string;
  doctorId?: string;
  patientId?: string;
  date: string;
  doctor: string;
  status: string;
  prescriptionAvailable?: boolean;
  reason?: string;
  details?: string;
  doctorLicense?: string;
  fileSize?: string;
  downloadUrl?: string;
  medicines?: PrescriptionMedicine[];
}

export type NotificationCategory =
  | 'Appointments'
  | 'Queue Updates'
  | 'Clinic Updates'
  | 'Reminders'
  | 'System'
  | 'Announcements'
  | 'Emergency'
  | 'Doctor Delays';

export type NotificationType =
  | 'appointment'
  | 'system'
  | 'reminder'
  | 'announcement'
  | 'emergency'
  | 'delay'
  | 'verification'
  | 'prescription'
  | 'queue'
  | 'load_balance_proposal'
  | 'load_balance_offer'
  | 'load_balance_status';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  category: NotificationCategory;
  type?: NotificationType;
  actionData?: {
    appointmentId?: string;
    clinicId?: string;
    doctorId?: string;
    url?: string;
    offerStatus?: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
    offeredTime?: string;
    currentTime?: string;
    offeredDate?: string;
    clinicName?: string;
    doctorName?: string;
    timeDifference?: string;
    // Load balance proposal & doctor transfer fields
    proposalId?: string;
    sourceDoctorId?: string;
    sourceDoctorName?: string;
    currentDoctorName?: string;
    targetDoctorId?: string;
    targetDoctorName?: string;
    proposedDoctorName?: string;
    procedureName?: string;
    estimatedWait?: number;
    newEstimatedWait?: number;
    status?: string;
    doctorConsent?: string;
    patientConsent?: string;
    [key: string]: any;
  };
}

export interface Announcement {
  id: string;
  title: string;
  summary: string;
  content: string;
  date: string;
  category: 'Clinic' | 'Holiday' | 'Health' | 'System';
  isImportant?: boolean;
  clinicName?: string;
}

export type ChatbotIntent =
  | 'GENERAL_CHECKUP'
  | 'GENERAL_MEDICINE'
  | 'CARDIOLOGY'
  | 'DERMATOLOGY'
  | 'OPHTHALMOLOGY'
  | 'DENTISTRY'
  | 'ENT'
  | 'PEDIATRICS'
  | 'ORTHOPEDICS'
  | 'GYNECOLOGY'
  | 'NEUROLOGY'
  | 'EMERGENCY'
  | 'EMERGENCY_REDIRECT'
  | 'APPOINTMENT_HELP'
  | 'APPOINTMENT_STATUS'
  | 'CLINIC_SEARCH'
  | 'CLINIC_RECOMMENDATION'
  | 'FIND_CLINIC'
  | 'FIND_DOCTOR'
  | 'FIND_SPECIALIZATION'
  | 'BOOK_APPOINTMENT'
  | 'BOOKING_HELP'
  | 'CANCEL_APPOINTMENT'
  | 'RESCHEDULE_APPOINTMENT'
  | 'PRESCRIPTION_HELP'
  | 'HEALTH_RECORDS'
  | 'ANNOUNCEMENT'
  | 'ANNOUNCEMENT_QUERY'
  | 'CLINIC_HOURS'
  | 'LOCATION_HELP'
  | 'APP_HELP'
  | 'UNKNOWN';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  intent?: ChatbotIntent;
  quickReplies?: string[];
  actionLink?: {
    type: 'map' | 'booking' | 'appointment' | 'clinic' | 'search' | 'emergency' | 'records';
    targetId?: string;
    department?: string;
    label: string;
  };
}

export interface EarlierSlotSuggestion {
  appointmentId: string;
  newDate: string;
  newTime: string;
  timeDifference: string;
  estimatedWait: string;
}

export interface AuthState {
  user: Patient | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitializing?: boolean;
  error: string | null;
  hasCompletedOnboarding: boolean;
  pendingVerification?: {
    patientId?: string;
    phoneOrEmail: string;
    phone?: string;
    email?: string;
    purpose: 'register' | 'forgot';
  } | null;
}

export interface FilterOptions {
  specialization: string | null;
  department?: string | null;
  distance: number; // km
  availability: 'all' | 'today' | 'now';
  maxWait: number;
  minRating: number;
  openNow: boolean;
  maxFee?: number;
  preferredDoctorOnly?: boolean;
}

export type AuthStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  Login: { email?: string } | undefined;
  Register: undefined;
  OtpVerification: {
    phoneOrEmail: string;
    purpose: 'register' | 'forgot';
    patientId?: string;
    phone?: string;
    email?: string;
  };
  ForgotPassword: undefined;
  PasswordReset: { token: string };
};

export type AppStackParamList = {
  MainTabs: { screen?: keyof MainTabParamList; params?: any } | undefined;
  SelectDepartment: undefined;
  ClinicDetail: { clinicId: string; department?: string };
  DoctorProfile: { doctorId: string };
  Booking: {
    department?: string;
    clinicId?: string;
    doctorId?: string;
    procedure?: string;
    isPreviousDoctor?: boolean;
  } | undefined;
  AppointmentDetail: { appointmentId: string; showSuccess?: boolean };
  MapView: { department?: string; clinicId?: string } | undefined;
  Notifications: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  SearchTab: { category?: string; query?: string } | undefined;
  AppointmentsTab: undefined;
  HealthRecordsTab: undefined;
  ProfileTab: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  ClinicDetail: { clinicId: string };
  MapView: { department?: string; clinicId?: string } | undefined;
};
