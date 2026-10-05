import bcrypt from 'bcryptjs';
import { memoryDb, query, saveStateToFile } from './db';
import { timeService, CLINIC_TIMEZONE } from '../services/timeService';

// -------------------------------------------------------------
// TYPES
// -------------------------------------------------------------
export interface PatientEntity {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  blood_group: string;
  age: number;
  gender: string;
  avatar?: string;
  address: string;
  emergency_contact: string;
  preferred_specialization?: string;
  preferred_doctor?: string;
  notifications_enabled: boolean;
  theme_preference: string;
  role?: string;
  clinic_id?: string;
  clinic_name?: string;
  staff_id?: string;
  initials?: string;
  email_verified?: boolean;
  phone_verified?: boolean;
  account_status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AssistantEntity {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  clinic_id: string;
  clinic_name: string;
  location?: string;
  staff_id: string;
  initials: string;
  role: 'CLINIC_ADMIN';
  notifications_enabled?: boolean;
  theme_preference?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SavedLocationEntity {
  id: string;
  patient_id: string;
  label: 'Home' | 'College' | 'Work' | 'Other';
  name: string;
  locality: string;
  latitude: number;
  longitude: number;
  address: string;
  created_at?: string;
}

export interface DepartmentEntity {
  id: string;
  name: string;
  icon: string;
  description: string;
  clinic_count: number;
  doctor_count: number;
  keywords: string[];
  popular_symptoms: string[];
}

export interface ClinicEntity {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviews_count: number;
  image: string;
  category: string;
  doctors_count: number;
  open_hours: string;
  phone: string;
  is_open: boolean;
  opens_at?: string;
  is_popular: boolean;
  is_nearby: boolean;
  wait_time: string;
  consultation_fee: string;
  google_place_id?: string;
  departments?: string[];
  email?: string;
  clinic_number?: number | string;
  registration_number?: string;
  locality?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  clinic_type?: string;
  status?: 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  verification_status?: 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  email_verified?: boolean;
  phone_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type DoctorVerificationStatus =
  | 'PENDING'
  | 'PENDING_REVIEW'
  | 'REGISTERED'
  | 'DOCUMENTS_SUBMITTED'
  | 'DOCUMENTS_PENDING'
  | 'UNDER_REVIEW'
  | 'ACTION_REQUIRED'
  | 'VERIFIED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'RESUBMISSION_REQUIRED';

export type DoctorAvailabilityStatus = 'AVAILABLE' | 'BUSY' | 'ON_BREAK' | 'OFFLINE';

export interface DoctorVerificationDocEntity {
  id: string;
  doctor_id: string;
  document_type: 'medical_reg_cert' | 'degree_cert' | 'gov_id' | 'additional_cert';
  document_name: string;
  uri: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED';
  rejection_reason?: string;
  uploaded_at: string;
  verified_at?: string;
  verifier_id?: string;
}

export interface ProcedureEntity {
  id: string;
  name: string;
  department: string;
  description?: string;
  is_verified: boolean;
  created_at?: string;
}

export interface DoctorProcedureEntity {
  id: string;
  doctor_id: string;
  procedure_id: string;
  procedure_name: string;
  is_verified: boolean;
  created_at?: string;
}

export interface DoctorScheduleExceptionEntity {
  id: string;
  doctor_id: string;
  date: string;
  reason: string;
  is_full_day: boolean;
  created_at?: string;
}

export interface ConsultationEntity {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  clinic_id: string;
  clinical_notes?: string;
  symptoms: string[];
  assessment?: string;
  diagnosis: string;
  follow_up_date?: string;
  follow_up_reason?: string;
  vitals?: {
    bp?: string;
    pulse?: string;
    temperature?: string;
    weight?: string;
    spO2?: string;
  };
  created_at?: string;
  updated_at?: string;
}

export interface AuditLogEntity {
  id: string;
  doctor_id?: string;
  doctor_name?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: string;
  ip_address?: string;
  timestamp: string;
}

export interface DoctorEntity {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  password_hash?: string;
  specialization: string;
  qualification: string;
  rating: number;
  reviews_count: number;
  experience_years: number;
  avatar: string;
  clinic_id: string;
  clinic_name: string;
  available_days: string[];
  wait_time: string;
  is_available_today: boolean;
  status: DoctorAvailabilityStatus;
  languages: string[];
  consultation_fee: string;
  is_preferred?: boolean;
  about?: string;
  is_verified: boolean;
  verification_status: DoctorVerificationStatus;
  verification_rejection_reason?: string;
  verified_at?: string;
  verifier_id?: string;
  registration_number?: string;
  registration_authority?: string;
  primary_specialization?: string;
  secondary_specialization?: string;
  university?: string;
  grad_year?: number;
  dob?: string;
  gender?: string;
  consultation_duration: string;
  clinic_affiliations?: string[];
  procedures?: string[];
  schedule?: Record<string, { start: string; end: string; slot_duration: number; is_off: boolean }>;
  email_verified?: boolean;
  phone_verified?: boolean;
  account_status?: 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  created_at?: string;
  updated_at?: string;
}

export interface AppointmentEntity {
  id: string;
  patient_id: string;
  patient_name?: string;
  patient_phone?: string;
  clinic_id: string;
  doctor_id: string;
  doctor_name: string;
  doctor_specialization: string;
  doctor_avatar: string;
  clinic_name: string;
  clinic_address: string;
  department: string;
  date: string;
  time: string;
  appointmentDate?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  timezone?: string;
  appointmentStatus?: 'BOOKED' | 'CHECKED_IN' | 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  queueToken?: string;
  queueStatus?: 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED' | 'REMOVED';
  doctorId?: string;
  doctorName?: string;
  clinicId?: string;
  clinicName?: string;
  patientId?: string;
  patientName?: string;
  checkedInAt?: string;
  consultationStartedAt?: string;
  consultationCompletedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  noShowAt?: string;
  duration: string;
  procedure_id?: string;
  procedure_name?: string;
  procedure?: string;
  status:
    | 'Booked'
    | 'BOOKED'
    | 'Arrived'
    | 'Confirmed'
    | 'Checked In'
    | 'CHECKED_IN'
    | 'Waiting'
    | 'WAITING'
    | 'Almost Your Turn'
    | 'Next'
    | 'In Consultation'
    | 'IN_CONSULTATION'
    | 'Completed'
    | 'COMPLETED'
    | 'Delayed'
    | 'Cancelled'
    | 'CANCELLED'
    | 'NO_SHOW'
    | 'No Show';
  queue_number: number;
  token_number: string;
  queue_position: number;
  patients_ahead: number;
  estimated_wait: string;
  travel_time: string;
  distance: string;
  reason: string;
  custom_reason_text?: string;
  symptoms: string[];
  consultation_fee: string;
  notes?: string;
  prescription_available: boolean;
  earlier_slot_offered?: {
    newDate: string;
    newTime: string;
    timeDifference: string;
    estimatedWait: string;
    status?: 'PENDING' | 'OFFERED' | 'ACCEPTED' | 'DECLINED';
    clinicId?: string;
    clinicName?: string;
    doctorId?: string;
    doctorName?: string;
    originalDate?: string;
    originalTime?: string;
    offeredAt?: string;
    acceptedAt?: string;
    declinedAt?: string;
  };
  transfer_history?: any[];
  created_at?: string;
  updated_at?: string;
}

export interface NotificationEntity {
  id: string;
  recipient_id?: string;
  recipient_type?: 'PATIENT' | 'DOCTOR' | 'CLINIC';
  patient_id?: string;
  doctor_id?: string;
  clinic_id?: string;
  appointment_id?: string;
  queue_id?: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  is_read?: boolean;
  category: string;
  type: string;
  action_data?: any;
  actionData?: any;
  created_at?: string;
}

export interface MedicalFileEntity {
  id: string;
  patient_id: string;
  appointment_id?: string;
  clinic_id?: string;
  file_name: string;
  file_type: string;
  file_size?: string;
  uri?: string;
  upload_date: string;
  test_name: string;
  category: string;
  clinic_performed: string;
  test_date: string;
  reason_for_test?: string;
  notes?: string;
  created_at?: string;
}

export interface PrescriptionEntity {
  id: string;
  appointment_id: string;
  patient_id: string;
  patient_name?: string;
  doctor_id: string;
  doctor_name: string;
  doctor_specialization: string;
  doctor_registration_number?: string;
  clinic_id: string;
  clinic_name: string;
  clinic_address: string;
  date: string;
  diagnosis: string;
  clinical_notes?: string;
  follow_up_date?: string;
  medicines: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
  }>;
  created_at?: string;
}

// -------------------------------------------------------------
// MODELS / REPOSITORIES
// -------------------------------------------------------------

export const PatientModel = {
  async findByEmail(email: string): Promise<PatientEntity | null> {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    for (const patient of memoryDb.patients.values()) {
      if (patient.email && patient.email.toLowerCase() === cleanEmail) {
        return patient;
      }
    }
    const direct = memoryDb.patients.get(cleanEmail);
    if (direct) return direct;
    if (memoryDb.assistants) {
      const asst = memoryDb.assistants.get(cleanEmail);
      if (asst) return asst as unknown as PatientEntity;
      for (const a of memoryDb.assistants.values()) {
        if (a.email && a.email.toLowerCase() === cleanEmail) {
          return a as unknown as PatientEntity;
        }
      }
    }
    return null;
  },

  async findByPhone(phone: string): Promise<PatientEntity | null> {
    if (!phone) return null;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    for (const patient of memoryDb.patients.values()) {
      if (patient.phone && patient.phone.replace(/[^0-9]/g, '').endsWith(cleanPhone.slice(-10))) {
        return patient;
      }
    }
    return null;
  },

  async findById(id: string): Promise<PatientEntity | null> {
    if (!id) return null;
    const direct = memoryDb.patients.get(id);
    if (direct) return direct;

    const patientAliasMap: Record<string, string> = {
      'patient-001': 'pat-demo-01',
      'patient-002': 'pat-demo-02',
      'patient-003': 'pat-demo-03',
      'patient-1': 'pat-demo-01',
      'patient-2': 'pat-demo-02',
      'patient-3': 'pat-demo-03',
      'pat-001': 'pat-demo-01',
      'pat-002': 'pat-demo-02',
      'pat-003': 'pat-demo-03',
      'pat-1': 'pat-demo-01',
      'pat-2': 'pat-demo-02',
      'pat-3': 'pat-demo-03',
    };
    const mapped = patientAliasMap[id.toLowerCase()];
    if (mapped) {
      return memoryDb.patients.get(mapped) || null;
    }

    if (id === 'pat-demo-ramesh-emergency' || id === 'pat-walk-demo-moon-emergency') {
      return memoryDb.patients.get('pat-demo-ramesh-emergency') || null;
    }
    if (id.startsWith('pat-walk-')) {
      const walkinId = id.replace(/^pat-/, '');
      const w = memoryDb.walk_ins.get(walkinId);
      if (w) {
        return {
          id,
          name: w.patient_name,
          email: `${walkinId}@walkin.medlink.test`,
          phone: w.patient_phone || '+91 9000000039',
          blood_group: 'O+',
          age: w.age || 26,
          gender: w.gender || 'Male',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
          address: 'Villivakkam, Chennai',
          locality: 'Villivakkam',
          city: 'Chennai',
          created_at: w.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as unknown as PatientEntity;
      }
    }
    return null;
  },

  async create(data: Omit<PatientEntity, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<PatientEntity> {
    const id = data.id || `pat-${Date.now()}`;
    const newPatient: PatientEntity = {
      ...data,
      id,
      email_verified: data.email_verified ?? false,
      phone_verified: data.phone_verified ?? false,
      account_status: data.account_status ?? 'PENDING',
      is_active: data.is_active ?? (data.account_status === 'ACTIVE'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.patients.set(id, newPatient);
    saveStateToFile();
    return newPatient;
  },

  async update(id: string, updates: Partial<PatientEntity>): Promise<PatientEntity | null> {
    const patient = memoryDb.patients.get(id);
    if (!patient) return null;
    const updated = {
      ...patient,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    memoryDb.patients.set(id, updated);
    saveStateToFile();
    return updated;
  },
};

export const AssistantModel = {
  async getAll(): Promise<AssistantEntity[]> {
    return Array.from(memoryDb.assistants.values());
  },
  async findById(id: string): Promise<AssistantEntity | null> {
    if (!id) return null;
    return memoryDb.assistants.get(id) || null;
  },
  async findByEmail(email: string): Promise<AssistantEntity | null> {
    if (!email) return null;
    const clean = email.trim().toLowerCase();
    for (const asst of memoryDb.assistants.values()) {
      if (asst.email && asst.email.toLowerCase() === clean) {
        return asst;
      }
    }
    const direct = memoryDb.assistants.get(clean);
    if (direct) return direct;
    return null;
  },
  async findByClinicId(clinicId: string): Promise<AssistantEntity | null> {
    if (!clinicId) return null;
    const canonical = resolveCanonicalClinicId(clinicId);
    for (const asst of memoryDb.assistants.values()) {
      if (resolveCanonicalClinicId(asst.clinic_id) === canonical) {
        return asst;
      }
    }
    return null;
  },
  async create(data: AssistantEntity): Promise<AssistantEntity> {
    memoryDb.assistants.set(data.id, data);
    saveStateToFile();
    return data;
  },
};

export const SavedLocationModel = {
  async getByPatientId(patientId: string): Promise<SavedLocationEntity[]> {
    const results: SavedLocationEntity[] = [];
    for (const loc of memoryDb.saved_locations.values()) {
      if (loc.patient_id === patientId) {
        results.push(loc);
      }
    }
    return results;
  },

  async create(data: Omit<SavedLocationEntity, 'id'>): Promise<SavedLocationEntity> {
    const id = `loc-${Date.now()}`;
    const newLoc: SavedLocationEntity = { ...data, id, created_at: new Date().toISOString() };
    memoryDb.saved_locations.set(id, newLoc);
    saveStateToFile();
    return newLoc;
  },
};

export const DepartmentModel = {
  async getAll(): Promise<DepartmentEntity[]> {
    return Array.from(memoryDb.departments.values());
  },
};

export const CLINIC_ALIAS_MAP: Record<string, string> = {
  'c-demo': 'c-demo-moon-01',
  'c5': 'c-demo-moon-01',
  'c-demo-moon': 'c-demo-moon-01',
  'c-demo-moon-01': 'c-demo-moon-01',
  'c1': 'c-demo-apollo-02',
  'c2': 'c-demo-apollo-02',
  'c3': 'c-demo-greenlife-03',
  'c4': 'c-demo-heart-04',
  'c-demo-apollo-02': 'c-demo-apollo-02',
  'c-demo-greenlife-03': 'c-demo-greenlife-03',
  'c-demo-heart-04': 'c-demo-heart-04',
  'c-demo-vision-05': 'c-demo-vision-05',
  'c-demo-ortho-06': 'c-demo-ortho-06',
  'c-demo-skin-07': 'c-demo-skin-07',
  'c-demo-neuro-08': 'c-demo-neuro-08',
  'c-demo-nova-09': 'c-demo-nova-09',
  'c-demo-smile-10': 'c-demo-smile-10',
  'c-demo-multi-02': 'c-demo-apollo-02',
  'c-demo-heart-03': 'c-demo-heart-04',
  'c-demo-rainbow-04': 'c-demo-smile-10',
  'c-demo-skin-05': 'c-demo-skin-07',
  'c-demo-ent-06': 'c-demo-nova-09',
  'c-demo-pulmo-11': 'c-demo-pulmo-11',
  'c-demo-renal-12': 'c-demo-renal-12',
  'c-demo-digestive-13': 'c-demo-digestive-13',
  'c-demo-endowell-14': 'c-demo-endowell-14',
  'c-demo-uro-15': 'c-demo-uro-15',
  'c-demo-physio-16': 'c-demo-physio-16',
  'c-demo-mind-17': 'c-demo-mind-17',
  'clinic-001': 'c-demo-moon-01',
  'clinic-002': 'c-demo-apollo-02',
  'clinic-003': 'c-demo-greenlife-03',
  'clinic-004': 'c-demo-heart-04',
  'clinic-005': 'c-demo-vision-05',
  'clinic-006': 'c-demo-ortho-06',
  'clinic-007': 'c-demo-skin-07',
  'clinic-008': 'c-demo-neuro-08',
  'clinic-009': 'c-demo-nova-09',
  'clinic-010': 'c-demo-smile-10',
  'clinic-011': 'c-demo-pulmo-11',
  'clinic-012': 'c-demo-renal-12',
  'clinic-013': 'c-demo-digestive-13',
  'clinic-014': 'c-demo-endowell-14',
  'clinic-015': 'c-demo-uro-15',
  'clinic-016': 'c-demo-physio-16',
  'clinic-017': 'c-demo-mind-17',
  'clinic-018': 'c-demo-besant-18',
  'clinic-019': 'c-demo-avadi-18',
  'clinic-020': 'c-demo-royapuram-20',
  'clinic-1': 'c-demo-moon-01',
  'clinic-2': 'c-demo-apollo-02',
  'clinic-3': 'c-demo-greenlife-03',
  'clinic-4': 'c-demo-heart-04',
  'clinic-5': 'c-demo-vision-05',
  'clinic-6': 'c-demo-ortho-06',
  'clinic-7': 'c-demo-skin-07',
  'clinic-8': 'c-demo-neuro-08',
  'clinic-9': 'c-demo-nova-09',
  'clinic-10': 'c-demo-smile-10',
  'clinic-11': 'c-demo-pulmo-11',
  'clinic-12': 'c-demo-renal-12',
  'clinic-13': 'c-demo-digestive-13',
  'clinic-14': 'c-demo-endowell-14',
  'clinic-15': 'c-demo-uro-15',
  'clinic-16': 'c-demo-physio-16',
  'clinic-17': 'c-demo-mind-17',
  'clinic-18': 'c-demo-besant-18',
  'clinic-19': 'c-demo-avadi-18',
  'clinic-20': 'c-demo-royapuram-20',
  'c-moon-dental-villivakkam-2773': 'c-moon-dental-villivakkam-2773',
  'clinic-2773': 'c-moon-dental-villivakkam-2773',
  '2773': 'c-moon-dental-villivakkam-2773',
  'c-2773': 'c-moon-dental-villivakkam-2773',
  'moon dental clinic villivakkam': 'c-moon-dental-villivakkam-2773',
};

export function resolveCanonicalClinicId(clinicIdOrAlias: string): string {
  if (!clinicIdOrAlias) return clinicIdOrAlias;
  const clean = clinicIdOrAlias.toLowerCase().trim();
  return CLINIC_ALIAS_MAP[clean] || clean;
}

export const ClinicModel = {
  async getAll(includeUnapproved = false): Promise<ClinicEntity[]> {
    const list = Array.from(memoryDb.clinics.values());
    if (includeUnapproved) {
      return list;
    }
    return list.filter((c) => c.status !== 'PENDING_REVIEW' && c.status !== 'REJECTED');
  },

  async getById(id: string): Promise<ClinicEntity | null> {
    if (!id) return null;
    const direct = memoryDb.clinics.get(id);
    if (direct) return direct;
    const canonicalId = resolveCanonicalClinicId(id);
    return memoryDb.clinics.get(canonicalId) || null;
  },

  async findByEmail(email: string): Promise<ClinicEntity | null> {
    if (!email) return null;
    const clean = email.toLowerCase().trim();
    for (const clinic of memoryDb.clinics.values()) {
      if (clinic.email && clinic.email.toLowerCase().trim() === clean) {
        return clinic;
      }
    }
    return null;
  },

  async findByPhone(phone: string): Promise<ClinicEntity | null> {
    if (!phone) return null;
    const clean = phone.replace(/[^0-9]/g, '');
    for (const clinic of memoryDb.clinics.values()) {
      if (clinic.phone && clinic.phone.replace(/[^0-9]/g, '').endsWith(clean.slice(-10))) {
        return clinic;
      }
    }
    return null;
  },

  async getPendingVerifications(): Promise<ClinicEntity[]> {
    const list: ClinicEntity[] = [];
    for (const clinic of memoryDb.clinics.values()) {
      if (clinic.status === 'PENDING_REVIEW' || clinic.verification_status === 'PENDING_REVIEW') {
        list.push(clinic);
      }
    }
    return list;
  },

  async updateVerificationStatus(
    id: string,
    status: 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'PENDING_REVIEW',
    rejectionReason?: string
  ): Promise<ClinicEntity | null> {
    const clinic = await this.getById(id);
    if (!clinic) return null;

    clinic.status = status;
    clinic.verification_status = status;
    clinic.is_open = status === 'ACTIVE';
    clinic.updated_at = new Date().toISOString();

    memoryDb.clinics.set(clinic.id, clinic);
    saveStateToFile();
    return clinic;
  },

  async update(id: string, updates: Partial<ClinicEntity>): Promise<ClinicEntity | null> {
    const clinic = await this.getById(id);
    if (!clinic) return null;

    const updated = {
      ...clinic,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    memoryDb.clinics.set(clinic.id, updated);
    saveStateToFile();
    return updated;
  },

  async create(clinic: ClinicEntity): Promise<ClinicEntity> {
    const norm = clinic.name.toLowerCase().trim();
    const normAddr = (clinic.address || '').toLowerCase().trim();
    for (const [id, existing] of memoryDb.clinics.entries()) {
      const existingAddr = (existing.address || '').toLowerCase().trim();
      if (existing.name.toLowerCase().trim() === norm && existingAddr === normAddr && id !== clinic.id) {
        memoryDb.clinics.delete(id);
      }
    }
    const newClinic: ClinicEntity = {
      ...clinic,
      status: clinic.status || 'ACTIVE',
      verification_status: clinic.verification_status || 'ACTIVE',
      created_at: clinic.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.clinics.set(clinic.id, newClinic);
    saveStateToFile();
    return newClinic;
  },
};

export const DoctorModel = {
  async getAll(): Promise<DoctorEntity[]> {
    const uniqueMap = new Map<string, DoctorEntity>();
    for (const doc of memoryDb.doctors.values()) {
      if (doc && doc.id && !uniqueMap.has(doc.id)) {
        uniqueMap.set(doc.id, doc);
      }
    }
    return Array.from(uniqueMap.values());
  },

  async getById(id: string): Promise<DoctorEntity | null> {
    if (!id) return null;
    const direct = memoryDb.doctors.get(id);
    if (direct) return direct;

    const canonicalId = resolveCanonicalDoctorId(id);
    return memoryDb.doctors.get(canonicalId) || null;
  },

  async findByEmail(email: string): Promise<DoctorEntity | null> {
    const clean = email.trim().toLowerCase();
    for (const doc of memoryDb.doctors.values()) {
      if (doc.email && doc.email.toLowerCase() === clean) {
        return doc;
      }
    }
    const direct = memoryDb.doctors.get(clean);
    if (direct) return direct;
    const canonicalId = resolveCanonicalDoctorId(clean);
    if (canonicalId && canonicalId !== clean) {
      const canonicalDoc = memoryDb.doctors.get(canonicalId);
      if (canonicalDoc) return canonicalDoc;
    }
    const demoAliasMap: Record<string, string> = {
      'dr.alagu@moondental.test': 'doc-alagu-vimalesh-2773',
      'dr.alagu.vimalesh@moondental.test': 'doc-alagu-vimalesh-2773',
      'dr.jeffrey@moondental.test': 'doc-alagu-vimalesh-2773',
      'dr.jeffrey.vimalesh@moondental.test': 'doc-alagu-vimalesh-2773',
      'dr.merlin@moondental.test': 'doc-merlin-rajan-2773',
      'dr.merlin.rajan@moondental.test': 'doc-merlin-rajan-2773',
      'doctor01@demo.medlink.test': 'doc-demo-arun-01',
      'dr.arun@medlink.health': 'doc-demo-arun-01',
      'arun.kumar@medlink.health': 'doc-demo-arun-01',
      'dr.arun.demo@medlink.test': 'doc-demo-arun-01',
      'doctor02@demo.medlink.test': 'doc-demo-priya-02',
      'priya.sharma@medlink.test': 'doc-demo-priya-02',
      'doctor03@demo.medlink.test': 'doc-demo-karthik-03',
      'dr.karthik.raman@medlink.test': 'doc-demo-karthik-03',
      'doctor04@demo.medlink.test': 'doc-demo-kavitha-04',
      'dr.kavitha.reddy@medlink.test': 'doc-demo-kavitha-04',
      'doctor05@demo.medlink.test': 'doc-demo-priya-05',
      'dr.priya.nair@medlink.test': 'doc-demo-priya-05',
      'doctor06@demo.medlink.test': 'doc-demo-venkat-06',
      'dr.venkat.raman@medlink.test': 'doc-demo-venkat-06',
      'doctor07@demo.medlink.test': 'doc-demo-ramesh-10',
      'dr.ramesh.chandran@medlink.test': 'doc-demo-ramesh-10',
      'doctor08@demo.medlink.test': 'doc-demo-aditya-11',
      'dr.aditya.rao@medlink.test': 'doc-demo-aditya-11',
      'doctor09@demo.medlink.test': 'doc-demo-radha-09',
      'dr.radha.sundaram@medlink.test': 'doc-demo-radha-09',
      'doctor10@demo.medlink.test': 'doc-demo-arvind-12',
      'dr.arvind.swami@medlink.test': 'doc-demo-arvind-12',
      'doctor11@demo.medlink.test': 'doc-demo-sanjay-29',
      'dr.sanjay.krishnan@medlink.test': 'doc-demo-sanjay-29',
      'doctor12@demo.medlink.test': 'doc-demo-balaji-31',
      'dr.balaji.natarajan@medlink.test': 'doc-demo-balaji-31',
      'doctor13@demo.medlink.test': 'doc-demo-manoj-33',
      'dr.manoj.kulkarni@medlink.test': 'doc-demo-manoj-33',
      'doctor14@demo.medlink.test': 'doc-demo-kiran-35',
      'dr.kiran.chawla@medlink.test': 'doc-demo-kiran-35',
      'doctor15@demo.medlink.test': 'doc-demo-dinesh-37',
      'dr.dinesh.karthikeyan@medlink.test': 'doc-demo-dinesh-37',
      'doctor16@demo.medlink.test': 'doc-demo-antony-39',
      'dr.antony.raj@medlink.test': 'doc-demo-antony-39',
      'doctor17@demo.medlink.test': 'doc-demo-siddharth-41',
      'dr.siddharth.sen@medlink.test': 'doc-demo-siddharth-41',
      'doctor18@demo.medlink.test': 'doc-demo-shalini-15',
      'dr.shalini.mukerjee@medlink.test': 'doc-demo-shalini-15',
      'doctor19@demo.medlink.test': 'doc-demo-rajesh-14',
      'dr.rajesh@medlink.test': 'doc-demo-rajesh-14',
      'doctor20@demo.medlink.test': 'doc-demo-ananya-08',
      'dr.ananya@medlink.health': 'doc-demo-ananya-08',
    };
    if (demoAliasMap[clean]) {
      return memoryDb.doctors.get(demoAliasMap[clean]) || null;
    }
    return null;
  },

  async findByPhone(phone: string): Promise<DoctorEntity | null> {
    const clean = phone.trim().replace(/[^0-9]/g, '');
    for (const doc of memoryDb.doctors.values()) {
      if (doc.phone && doc.phone.replace(/[^0-9]/g, '') === clean) {
        return doc;
      }
    }
    return null;
  },

  async findByRegistrationNumber(regNum: string): Promise<DoctorEntity | null> {
    const clean = regNum.trim().toLowerCase();
    for (const doc of memoryDb.doctors.values()) {
      if (doc.registration_number && doc.registration_number.toLowerCase() === clean) {
        return doc;
      }
    }
    return null;
  },

  async create(data: Omit<DoctorEntity, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<DoctorEntity> {
    const id = data.id || `d-${Date.now()}`;
    const newDoc: DoctorEntity = {
      ...data,
      id,
      rating: data.rating || 5.0,
      reviews_count: data.reviews_count || 0,
      status: data.status || 'AVAILABLE',
      verification_status: data.verification_status || 'PENDING_REVIEW',
      account_status: data.account_status || (data.verification_status === 'VERIFIED' || data.verification_status === 'ACTIVE' ? 'ACTIVE' : 'PENDING_REVIEW'),
      is_verified: data.verification_status === 'VERIFIED' || data.verification_status === 'ACTIVE',
      email_verified: data.email_verified ?? false,
      phone_verified: data.phone_verified ?? false,
      available_days: data.available_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      wait_time: data.wait_time || '10 min',
      is_available_today: true,
      languages: data.languages || ['English', 'Tamil'],
      consultation_duration: data.consultation_duration || '25 min',
      clinic_affiliations: data.clinic_affiliations || [data.clinic_name],
      procedures: data.procedures || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.doctors.set(id, newDoc);
    saveStateToFile();
    return newDoc;
  },

  async update(id: string, updates: Partial<DoctorEntity>): Promise<DoctorEntity | null> {
    const doc = memoryDb.doctors.get(id);
    if (!doc) return null;
    const updated = {
      ...doc,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    memoryDb.doctors.set(id, updated);
    saveStateToFile();
    return updated;
  },

  async getByClinic(clinicId: string): Promise<DoctorEntity[]> {
    if (!clinicId) return [];
    const clean = clinicId.toLowerCase().trim();
    const canonicalClinicId = resolveCanonicalClinicId(clean);

    const uniqueMap = new Map<string, DoctorEntity>();
    for (const d of memoryDb.doctors.values()) {
      if (!d || !d.id) continue;
      const docClinic = (d.clinic_id || '').toLowerCase().trim();
      const docCanonical = resolveCanonicalClinicId(docClinic);

      if (docCanonical === canonicalClinicId || docClinic === clean) {
        if (!uniqueMap.has(d.id)) {
          uniqueMap.set(d.id, d);
        }
      }
    }

    if (memoryDb.doctor_clinic_assignments) {
      for (const a of memoryDb.doctor_clinic_assignments.values()) {
        const aClinic = resolveCanonicalClinicId(a.clinic_id || '');
        if ((aClinic === canonicalClinicId || (a.clinic_id && a.clinic_id.toLowerCase().trim() === clean)) && a.active) {
          const doc = memoryDb.doctors.get(a.doctor_id) || memoryDb.doctors.get(resolveCanonicalDoctorId(a.doctor_id));
          if (doc && !uniqueMap.has(doc.id)) {
            uniqueMap.set(doc.id, doc);
          }
        }
      }
    }

    const result: DoctorEntity[] = [];
    for (const doc of uniqueMap.values()) {
      const clinicStatus = await DoctorClinicAssignmentModel.getStatus(doc.id, canonicalClinicId);
      const effectiveStatus = clinicStatus || doc.status;
      result.push({
        ...doc,
        status: effectiveStatus,
        is_available_today: effectiveStatus !== 'OFFLINE',
      });
    }
    return result;
  },

  async getByDepartment(departmentName: string): Promise<DoctorEntity[]> {
    const term = departmentName.toLowerCase();
    return Array.from(memoryDb.doctors.values()).filter(
      (d) => d.specialization.toLowerCase().includes(term) || term.includes(d.specialization.toLowerCase())
    );
  },

  async getVerifiedDoctors(): Promise<DoctorEntity[]> {
    return Array.from(memoryDb.doctors.values()).filter(
      (d) => d.is_verified || d.verification_status === 'VERIFIED' || d.verification_status === 'ACTIVE'
    );
  },

  async searchByProcedure(procedureQuery: string): Promise<DoctorEntity[]> {
    const clean = procedureQuery.toLowerCase().trim();
    return Array.from(memoryDb.doctors.values()).filter((d) => {
      const matchInArray = d.procedures?.some((p: string) => p.toLowerCase().includes(clean) || clean.includes(p.toLowerCase()));
      const matchInSpecialty = d.specialization.toLowerCase().includes(clean) || clean.includes(d.specialization.toLowerCase());
      return matchInArray || matchInSpecialty;
    });
  },
};

export const AppointmentModel = {
  async create(data: Omit<AppointmentEntity, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<AppointmentEntity> {
    const normDate = timeService.normalizeDateString(data.appointmentDate || data.date);
    const normTime = timeService.normalizeTimeString(data.slotStartTime || data.time);
    const calculatedEndTime = data.slotEndTime || timeService.calculateSlotEndTime(normTime, data.duration || '20 min');

    // Atomic Double Booking Prevention Check
    for (const existing of memoryDb.appointments.values()) {
      const existingDate = existing.appointmentDate || timeService.normalizeDateString(existing.date);
      const existingTime = existing.slotStartTime || timeService.normalizeTimeString(existing.time);
      if (
        existing.doctor_id === data.doctor_id &&
        existingDate === normDate &&
        existingTime === normTime &&
        existing.status !== 'Cancelled' &&
        existing.status !== 'CANCELLED' &&
        existing.status !== 'NO_SHOW' &&
        existing.status !== 'No Show'
      ) {
        throw new Error('This slot is no longer available.');
      }
    }

    const id = data.id || `apt-${Date.now()}`;
    const newApt: AppointmentEntity = {
      ...data,
      id,
      date: normDate,
      time: normTime,
      appointmentDate: normDate,
      slotStartTime: normTime,
      slotEndTime: calculatedEndTime,
      timezone: data.timezone || CLINIC_TIMEZONE,
      appointmentStatus: data.appointmentStatus || 'BOOKED',
      queueToken: data.queueToken || data.token_number,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.appointments.set(id, newApt);

    // Only add to live queue tracking if scheduled for TODAY and already checked in / waiting
    if (timeService.isToday(normDate) && ['Checked In', 'CHECKED_IN', 'Waiting', 'WAITING', 'In Consultation', 'IN_CONSULTATION'].includes(newApt.status)) {
      memoryDb.appointment_queue.set(id, {
        id: `queue-${id}`,
        clinic_id: newApt.clinic_id,
        doctor_id: newApt.doctor_id,
        appointment_id: id,
        token_number: newApt.token_number,
        queue_position: newApt.queue_position,
        patients_ahead: newApt.patients_ahead,
        status: newApt.status,
        estimated_wait_minutes: parseInt((newApt.estimated_wait || '10').replace(/[^0-9]/g, ''), 10) || 10,
        updated_at: new Date().toISOString(),
      });
    }

    saveStateToFile();
    return newApt;
  },

  async getById(id: string): Promise<AppointmentEntity | null> {
    return memoryDb.appointments.get(id) || null;
  },

  async getByPatientId(patientId: string): Promise<AppointmentEntity[]> {
    const list: AppointmentEntity[] = [];
    const patientAliasMap: Record<string, string> = {
      'patient-001': 'pat-101',
      'patient-002': 'pat-102',
      'patient-003': 'pat-demo-03',
      'patient-1': 'pat-101',
      'patient-2': 'pat-102',
      'patient-3': 'pat-demo-03',
      'pat-001': 'pat-101',
      'pat-002': 'pat-102',
      'pat-003': 'pat-demo-03',
      'pat-1': 'pat-101',
      'pat-2': 'pat-102',
      'pat-3': 'pat-demo-03',
    };
    const canonical = patientAliasMap[patientId.toLowerCase()] || patientId;
    for (const apt of memoryDb.appointments.values()) {
      if (apt.patient_id === patientId || apt.patient_id === canonical) {
        list.push(apt);
      }
    }
    // Sort latest first
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async getByDoctorId(doctorId: string): Promise<AppointmentEntity[]> {
    const list: AppointmentEntity[] = [];
    for (const apt of memoryDb.appointments.values()) {
      if (apt.doctor_id === doctorId) {
        list.push(apt);
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async getByClinicId(clinicId: string): Promise<AppointmentEntity[]> {
    if (!clinicId) return [];
    const cleanId = clinicId.toLowerCase().trim();
    const canonicalId =
      cleanId === 'c-demo' || cleanId === 'c5' || cleanId === 'c-demo-moon-01' ? 'c-demo-moon-01' :
      cleanId === 'c1' || cleanId === 'c-demo-apollo-02' || cleanId === 'c-demo-multi-02' ? 'c-demo-apollo-02' :
      cleanId === 'c-demo-greenlife-03' ? 'c-demo-greenlife-03' :
      cleanId === 'c-demo-heart-04' || cleanId === 'c-demo-heart-03' ? 'c-demo-heart-04' :
      cleanId === 'c-demo-vision-05' || cleanId === 'c-demo-rainbow-04' ? 'c-demo-vision-05' :
      cleanId === 'c-demo-ortho-06' ? 'c-demo-ortho-06' :
      cleanId === 'c-demo-skin-07' || cleanId === 'c-demo-skin-05' ? 'c-demo-skin-07' :
      cleanId === 'c-demo-neuro-08' ? 'c-demo-neuro-08' :
      cleanId === 'c-demo-nova-09' || cleanId === 'c-demo-ent-06' ? 'c-demo-nova-09' :
      cleanId === 'c-demo-smile-10' ? 'c-demo-smile-10' :
      cleanId === 'c-demo-pulmo-11' ? 'c-demo-pulmo-11' :
      cleanId === 'c-demo-renal-12' ? 'c-demo-renal-12' :
      cleanId === 'c-demo-digestive-13' ? 'c-demo-digestive-13' :
      cleanId === 'c-demo-endowell-14' ? 'c-demo-endowell-14' :
      cleanId === 'c-demo-uro-15' ? 'c-demo-uro-15' :
      cleanId === 'c-demo-physio-16' ? 'c-demo-physio-16' :
      cleanId === 'c-demo-mind-17' ? 'c-demo-mind-17' :
      cleanId;

    const list: AppointmentEntity[] = [];
    const targetClinic = memoryDb.clinics.get(canonicalId) || memoryDb.clinics.get(cleanId);
    for (const apt of memoryDb.appointments.values()) {
      const aptClinicId = (apt.clinic_id || '').toLowerCase().trim();
      const aptCanonical =
        aptClinicId === 'c-demo' || aptClinicId === 'c5' || aptClinicId === 'c-demo-moon-01' ? 'c-demo-moon-01' :
        aptClinicId === 'c1' || aptClinicId === 'c-demo-apollo-02' || aptClinicId === 'c-demo-multi-02' ? 'c-demo-apollo-02' :
        aptClinicId === 'c-demo-heart-04' || aptClinicId === 'c-demo-heart-03' ? 'c-demo-heart-04' :
        aptClinicId === 'c-demo-vision-05' || aptClinicId === 'c-demo-rainbow-04' ? 'c-demo-vision-05' :
        aptClinicId === 'c-demo-skin-07' || aptClinicId === 'c-demo-skin-05' ? 'c-demo-skin-07' :
        aptClinicId === 'c-demo-nova-09' || aptClinicId === 'c-demo-ent-06' ? 'c-demo-nova-09' :
        aptClinicId;

      const matchesId = aptCanonical === canonicalId || aptClinicId === cleanId;
      const matchesName = targetClinic && apt.clinic_name && apt.clinic_name.toLowerCase().trim() === targetClinic.name.toLowerCase().trim();
      if (matchesId || matchesName) {
        list.push(apt);
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async updateStatus(id: string, status: AppointmentEntity['status']): Promise<AppointmentEntity | null> {
    const apt = memoryDb.appointments.get(id);
    if (!apt) return null;
    apt.status = status;
    const norm = status.toUpperCase().replace(/[\s_-]+/g, '_');
    if (norm === 'CANCELLED') {
      apt.appointmentStatus = 'CANCELLED';
      apt.cancelledAt = new Date().toISOString();
      memoryDb.appointment_queue.delete(id);
    } else if (norm === 'NO_SHOW') {
      apt.appointmentStatus = 'NO_SHOW';
      apt.noShowAt = new Date().toISOString();
      memoryDb.appointment_queue.delete(id);
    } else if (norm === 'CHECKED_IN') {
      apt.appointmentStatus = 'CHECKED_IN';
      apt.checkedInAt = apt.checkedInAt || new Date().toISOString();
    } else if (norm === 'IN_CONSULTATION') {
      apt.appointmentStatus = 'IN_CONSULTATION';
      apt.consultationStartedAt = apt.consultationStartedAt || new Date().toISOString();
    } else if (norm === 'COMPLETED') {
      apt.status = 'Completed';
      apt.appointmentStatus = 'COMPLETED';
      apt.patients_ahead = 0;
      apt.queue_position = 0;
      apt.estimated_wait = 'Completed';
      apt.consultationCompletedAt = apt.consultationCompletedAt || new Date().toISOString();
      memoryDb.appointment_queue.delete(id);
    }

    apt.updated_at = new Date().toISOString();
    memoryDb.appointments.set(id, apt);

    const queueItem = memoryDb.appointment_queue.get(id);
    if (queueItem) {
      queueItem.status = status;
      queueItem.updated_at = new Date().toISOString();
      memoryDb.appointment_queue.set(id, queueItem);
    }

    saveStateToFile();
    return apt;
  },

  async update(id: string, updates: Partial<AppointmentEntity>): Promise<AppointmentEntity | null> {
    const apt = memoryDb.appointments.get(id);
    if (!apt) return null;
    const updated = { ...apt, ...updates, updated_at: new Date().toISOString() };
    if (updated.date) {
      updated.appointmentDate = timeService.normalizeDateString(updated.date);
    }
    if (updated.time) {
      updated.slotStartTime = timeService.normalizeTimeString(updated.time);
    }
    const norm = (updated.status || updated.appointmentStatus || '').toUpperCase().replace(/[\s_-]+/g, '_');
    if (norm === 'CANCELLED' || norm === 'NO_SHOW') {
      memoryDb.appointment_queue.delete(id);
    } else if (norm === 'COMPLETED') {
      updated.status = 'Completed';
      updated.appointmentStatus = 'COMPLETED';
      updated.patients_ahead = 0;
      updated.queue_position = 0;
      updated.estimated_wait = 'Completed';
      updated.consultationCompletedAt = updated.consultationCompletedAt || new Date().toISOString();
      memoryDb.appointment_queue.delete(id);
    }
    memoryDb.appointments.set(id, updated);
    saveStateToFile();
    return updated;
  },

  async getTodayAppointments(filter?: { clinicId?: string; doctorId?: string; status?: string }): Promise<AppointmentEntity[]> {
    const list: AppointmentEntity[] = [];
    const targetClinic = filter?.clinicId ? memoryDb.clinics.get(filter.clinicId) : null;

    for (const apt of memoryDb.appointments.values()) {
      // Must be scheduled for TODAY's clinic date
      const aptDate = apt.appointmentDate || apt.date;
      if (!timeService.isToday(aptDate)) {
        continue;
      }

      if (filter?.clinicId) {
        const matchesId = apt.clinic_id === filter.clinicId;
        const matchesName = targetClinic && apt.clinic_name.toLowerCase().trim() === targetClinic.name.toLowerCase().trim();
        const matchesDirect = apt.clinic_name.toLowerCase().includes(filter.clinicId.toLowerCase());
        if (!matchesId && !matchesName && !matchesDirect) {
          continue;
        }
      }
      if (filter?.doctorId && apt.doctor_id !== filter.doctorId && !apt.doctor_name.toLowerCase().includes(filter.doctorId.toLowerCase())) {
        continue;
      }
      if (filter?.status && filter.status !== 'ALL') {
        const target = filter.status.toUpperCase().replace(/[\s_-]+/g, '');
        const current = apt.status.toUpperCase().replace(/[\s_-]+/g, '');
        if (target === 'ACTIVE') {
          if (['CANCELLED', 'CANCELED', 'COMPLETED', 'NOSHOW', 'NO_SHOW'].includes(current)) {
            continue;
          }
        } else if (target !== current) {
          continue;
        }
      }
      list.push(apt);
    }
    return list.sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));
  },
};

export const NotificationModel = {
  async getAll(): Promise<NotificationEntity[]> {
    return Array.from(memoryDb.notifications.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  },

  async getByPatientId(patientId: string): Promise<NotificationEntity[]> {
    const list: NotificationEntity[] = [];
    const targetSet = new Set<string>();
    targetSet.add(patientId);

    if (memoryDb.patients?.getAliases) {
      const aliasMap = memoryDb.patients.getAliases();
      const canonical = aliasMap.get(patientId.toLowerCase()) || patientId;
      targetSet.add(canonical);
      for (const [alias, canId] of aliasMap.entries()) {
        if (canId === canonical || canId === patientId) {
          targetSet.add(alias);
        }
      }
    }

    for (const n of memoryDb.notifications.values()) {
      const matchPatientId =
        (n.patient_id && targetSet.has(n.patient_id)) ||
        ((n as any).patientId && targetSet.has((n as any).patientId));
      const matchRecipient =
        n.recipient_type === 'PATIENT' && n.recipient_id && targetSet.has(n.recipient_id);
      if (matchPatientId || matchRecipient) {
        list.push(n);
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async getByDoctorId(doctorId: string): Promise<NotificationEntity[]> {
    const list: NotificationEntity[] = [];
    const canonical = resolveCanonicalDoctorId(doctorId);
    for (const n of memoryDb.notifications.values()) {
      const docId = n.doctor_id ? resolveCanonicalDoctorId(n.doctor_id) : '';
      const recId = (n.recipient_type === 'DOCTOR' && n.recipient_id) ? resolveCanonicalDoctorId(n.recipient_id) : '';
      if (
        n.doctor_id === doctorId ||
        docId === canonical ||
        (n.recipient_type === 'DOCTOR' && (n.recipient_id === doctorId || recId === canonical))
      ) {
        list.push(n);
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async getByClinicId(clinicId: string): Promise<NotificationEntity[]> {
    const list: NotificationEntity[] = [];
    for (const n of memoryDb.notifications.values()) {
      if (n.clinic_id === clinicId || (n.recipient_type === 'CLINIC' && n.recipient_id === clinicId)) {
        list.push(n);
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async create(data: Omit<NotificationEntity, 'id' | 'created_at'>): Promise<NotificationEntity> {
    const id = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const actionDataObj = (data as any).actionData || data.action_data || {};
    const newNotif: NotificationEntity = {
      ...data,
      id,
      patient_id: data.patient_id || (data.recipient_type === 'PATIENT' ? data.recipient_id : undefined),
      doctor_id: data.doctor_id || (data.recipient_type === 'DOCTOR' ? data.recipient_id : undefined),
      clinic_id: data.clinic_id || (data.recipient_type === 'CLINIC' ? data.recipient_id : undefined),
      recipient_id: data.recipient_id || data.patient_id || data.doctor_id || data.clinic_id || 'system',
      recipient_type: data.recipient_type || (data.patient_id ? 'PATIENT' : data.doctor_id ? 'DOCTOR' : 'CLINIC'),
      read: data.read ?? false,
      is_read: data.read ?? false,
      action_data: actionDataObj,
      actionData: actionDataObj,
      created_at: new Date().toISOString(),
    };
    memoryDb.notifications.set(id, newNotif);
    saveStateToFile();
    return newNotif;
  },

  async markAsRead(id: string): Promise<boolean> {
    const n = memoryDb.notifications.get(id);
    if (n) {
      n.read = true;
      n.is_read = true;
      saveStateToFile();
      return true;
    }
    return false;
  },

  async markAllAsRead(recipientId: string): Promise<number> {
    let count = 0;
    for (const n of memoryDb.notifications.values()) {
      if (
        (n.patient_id === recipientId || n.doctor_id === recipientId || n.clinic_id === recipientId || n.recipient_id === recipientId) &&
        (!n.read && !n.is_read)
      ) {
        n.read = true;
        n.is_read = true;
        count++;
      }
    }
    if (count > 0) saveStateToFile();
    return count;
  },

  async clearAll(recipientId: string): Promise<number> {
    let count = 0;
    for (const [id, n] of memoryDb.notifications.entries()) {
      if (n.patient_id === recipientId || n.doctor_id === recipientId || n.clinic_id === recipientId || n.recipient_id === recipientId) {
        memoryDb.notifications.delete(id);
        count++;
      }
    }
    if (count > 0) saveStateToFile();
    return count;
  },
};

export const MedicalFileModel = {
  async getByPatientId(patientId: string): Promise<MedicalFileEntity[]> {
    const list: MedicalFileEntity[] = [];
    for (const f of memoryDb.medical_files.values()) {
      if (f.patient_id === patientId) {
        list.push(f);
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async create(data: Omit<MedicalFileEntity, 'id' | 'created_at'>): Promise<MedicalFileEntity> {
    const id = `file-${Date.now()}`;
    const newFile: MedicalFileEntity = {
      ...data,
      id,
      created_at: new Date().toISOString(),
    };
    memoryDb.medical_files.set(id, newFile);
    saveStateToFile();
    return newFile;
  },
};

export const PrescriptionModel = {
  async getById(id: string): Promise<PrescriptionEntity | null> {
    for (const p of memoryDb.prescriptions.values()) {
      if (p.id === id || p.appointment_id === id) {
        return p;
      }
    }
    return null;
  },

  async getByAppointmentId(appointmentId: string): Promise<PrescriptionEntity | null> {
    if (memoryDb.prescriptions.has(appointmentId)) {
      return memoryDb.prescriptions.get(appointmentId)!;
    }
    for (const p of memoryDb.prescriptions.values()) {
      if (p.appointment_id === appointmentId || p.id === appointmentId || p.id === `rx-${appointmentId}`) {
        return p;
      }
    }
    return null;
  },

  async getByPatientId(patientId: string): Promise<PrescriptionEntity[]> {
    const list: PrescriptionEntity[] = [];
    for (const p of memoryDb.prescriptions.values()) {
      if (p.patient_id === patientId) {
        list.push(p);
      }
    }
    return list;
  },

  async getAll(clinicId?: string): Promise<PrescriptionEntity[]> {
    const list: PrescriptionEntity[] = [];
    const canonicalClinic = clinicId ? resolveCanonicalClinicId(clinicId) : undefined;
    for (const p of memoryDb.prescriptions.values()) {
      if (!canonicalClinic || resolveCanonicalClinicId(p.clinic_id) === canonicalClinic) {
        const pat = memoryDb.patients.get(p.patient_id);
        list.push({
          ...p,
          patient_name: p.patient_name || pat?.name || 'Patient',
        });
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async updateStatus(id: string, status: string): Promise<PrescriptionEntity | null> {
    for (const p of memoryDb.prescriptions.values()) {
      if (p.id === id || p.appointment_id === id) {
        (p as any).status = status;
        saveStateToFile();
        return p;
      }
    }
    return null;
  },

  async create(data: Partial<PrescriptionEntity> & { appointment_id?: string; patient_id: string; clinic_id: string; medicines: any[] }): Promise<PrescriptionEntity> {
    const id = data.id || `rx-${Date.now()}`;
    const rx: PrescriptionEntity = {
      ...data,
      id,
      appointment_id: data.appointment_id || id,
      status: (data as any).status || 'pending',
      created_at: (data as any).created_at || new Date().toISOString(),
    } as PrescriptionEntity;
    memoryDb.prescriptions.set(id, rx);
    if (rx.appointment_id) {
      memoryDb.prescriptions.setAlias(rx.appointment_id, id);
    }
    saveStateToFile();
    return rx;
  },
};

export const AnnouncementModel = {
  async getAll(): Promise<any[]> {
    return Array.from(memoryDb.clinic_announcements.values());
  },
};

export const ProcedureModel = {
  async getAll(): Promise<ProcedureEntity[]> {
    return Array.from(memoryDb.procedures.values());
  },

  async getByDepartment(department: string): Promise<ProcedureEntity[]> {
    const dept = department.toLowerCase();
    return Array.from(memoryDb.procedures.values()).filter(
      (p) => p.department.toLowerCase() === dept || dept.includes(p.department.toLowerCase())
    );
  },

  async search(query: string): Promise<ProcedureEntity[]> {
    const clean = query.toLowerCase().trim();
    return Array.from(memoryDb.procedures.values()).filter(
      (p) => p.name.toLowerCase().includes(clean) || p.department.toLowerCase().includes(clean)
    );
  },

  async getById(id: string): Promise<ProcedureEntity | null> {
    return memoryDb.procedures.get(id) || null;
  },

  async create(data: Omit<ProcedureEntity, 'id' | 'created_at'>): Promise<ProcedureEntity> {
    const id = `proc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newProc: ProcedureEntity = {
      ...data,
      id,
      created_at: new Date().toISOString(),
    };
    memoryDb.procedures.set(id, newProc);
    saveStateToFile();
    return newProc;
  },
};

export const DoctorProcedureModel = {
  async getByDoctorId(doctorId: string): Promise<DoctorProcedureEntity[]> {
    const list: DoctorProcedureEntity[] = [];
    for (const dp of memoryDb.doctor_procedures.values()) {
      if (dp.doctor_id === doctorId) {
        list.push(dp);
      }
    }
    return list;
  },

  async addProcedure(doctorId: string, procedureName: string, procedureId?: string): Promise<DoctorProcedureEntity> {
    const id = `dp-${doctorId}-${Date.now()}`;
    const newDp: DoctorProcedureEntity = {
      id,
      doctor_id: doctorId,
      procedure_id: procedureId || `p-${Date.now()}`,
      procedure_name: procedureName,
      is_verified: true,
      created_at: new Date().toISOString(),
    };
    memoryDb.doctor_procedures.set(id, newDp);

    const doc = memoryDb.doctors.get(doctorId);
    if (doc) {
      if (!doc.procedures) doc.procedures = [];
      if (!doc.procedures.includes(procedureName)) {
        doc.procedures.push(procedureName);
        doc.updated_at = new Date().toISOString();
        memoryDb.doctors.set(doctorId, doc);
      }
    }
    saveStateToFile();

    return newDp;
  },

  async removeProcedure(doctorId: string, procedureName: string): Promise<boolean> {
    for (const [id, dp] of memoryDb.doctor_procedures.entries()) {
      if (dp.doctor_id === doctorId && dp.procedure_name.toLowerCase() === procedureName.toLowerCase()) {
        memoryDb.doctor_procedures.delete(id);
      }
    }

    const doc = memoryDb.doctors.get(doctorId);
    if (doc && doc.procedures) {
      doc.procedures = doc.procedures.filter((p: string) => p.toLowerCase() !== procedureName.toLowerCase());
      doc.updated_at = new Date().toISOString();
      memoryDb.doctors.set(doctorId, doc);
    }
    saveStateToFile();

    return true;
  },
};

export const DoctorVerificationModel = {
  async getDocumentsByDoctorId(doctorId: string): Promise<DoctorVerificationDocEntity[]> {
    const list: DoctorVerificationDocEntity[] = [];
    for (const doc of memoryDb.doctor_verification_documents.values()) {
      if (doc.doctor_id === doctorId) {
        list.push(doc);
      }
    }
    return list;
  },

  async getPendingVerifications(): Promise<DoctorEntity[]> {
    const list: DoctorEntity[] = [];
    for (const doc of memoryDb.doctors.values()) {
      if (doc.verification_status !== 'VERIFIED' && doc.verification_status !== 'ACTIVE') {
        list.push(doc);
      }
    }
    return list;
  },

  async addDocument(
    data: Omit<DoctorVerificationDocEntity, 'id' | 'uploaded_at' | 'status'>
  ): Promise<DoctorVerificationDocEntity> {
    const id = `verif-doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newDoc: DoctorVerificationDocEntity = {
      ...data,
      id,
      status: 'UNDER_REVIEW',
      uploaded_at: new Date().toISOString(),
    };
    memoryDb.doctor_verification_documents.set(id, newDoc);

    const doctor = memoryDb.doctors.get(data.doctor_id);
    if (doctor && doctor.verification_status !== 'VERIFIED' && doctor.verification_status !== 'ACTIVE') {
      doctor.verification_status = 'UNDER_REVIEW';
      doctor.updated_at = new Date().toISOString();
      memoryDb.doctors.set(data.doctor_id, doctor);
    }
    saveStateToFile();
    return newDoc;
  },

  async updateVerificationStatus(
    doctorId: string,
    status: DoctorVerificationStatus,
    verifierId?: string,
    rejectionReason?: string
  ): Promise<DoctorEntity | null> {
    const doctor = memoryDb.doctors.get(doctorId);
    if (!doctor) return null;

    doctor.verification_status = status;
    doctor.account_status = status === 'VERIFIED' || status === 'ACTIVE' ? 'ACTIVE' : (status === 'REJECTED' ? 'REJECTED' : 'PENDING_REVIEW');
    doctor.is_verified = status === 'VERIFIED' || status === 'ACTIVE';
    doctor.verifier_id = verifierId || 'admin-auto-verifier';
    if (status === 'VERIFIED' || status === 'ACTIVE') {
      doctor.verified_at = new Date().toISOString();
      doctor.verification_rejection_reason = undefined;
    } else if (status === 'REJECTED' || status === 'RESUBMISSION_REQUIRED') {
      doctor.verification_rejection_reason = rejectionReason || 'Requires clearer medical license certificate upload.';
    }
    doctor.updated_at = new Date().toISOString();
    memoryDb.doctors.set(doctorId, doctor);
    saveStateToFile();
    return doctor;
  },
};

export const AuditLogModel = {
  async log(
    action: string,
    entityType: string,
    entityId?: string,
    details?: string,
    doctor?: { id: string; name: string; [key: string]: any },
    ipAddress?: string
  ): Promise<AuditLogEntity> {
    const id = `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const entry: AuditLogEntity = {
      id,
      doctor_id: doctor?.id,
      doctor_name: doctor?.name,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      ip_address: ipAddress || '127.0.0.1',
      timestamp: new Date().toISOString(),
    };
    memoryDb.audit_logs.set(id, entry);
    return entry;
  },

  async getByDoctorId(doctorId: string): Promise<AuditLogEntity[]> {
    const list: AuditLogEntity[] = [];
    for (const entry of memoryDb.audit_logs.values()) {
      if (entry.doctor_id === doctorId) {
        list.push(entry);
      }
    }
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },
};

export const ConsultationModel = {
  async getByPatientId(patientId: string): Promise<ConsultationEntity[]> {
    const list: ConsultationEntity[] = [];
    for (const c of memoryDb.consultations.values()) {
      if (c.patient_id === patientId) {
        list.push(c);
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async getByAppointmentId(appointmentId: string): Promise<ConsultationEntity | null> {
    if (memoryDb.consultations.has(appointmentId)) {
      return memoryDb.consultations.get(appointmentId)!;
    }
    for (const c of memoryDb.consultations.values()) {
      if (c.appointment_id === appointmentId || c.id === appointmentId || c.id === `cons-${appointmentId}`) {
        return c;
      }
    }
    return null;
  },

  async create(data: Omit<ConsultationEntity, 'id' | 'created_at' | 'updated_at'>): Promise<ConsultationEntity> {
    const id = `cons-${data.appointment_id}`;
    const newConsultation: ConsultationEntity = {
      ...data,
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.consultations.set(data.appointment_id, newConsultation);
    saveStateToFile();
    return newConsultation;
  },
};

export const DoctorScheduleModel = {
  async getExceptionsByDoctorId(doctorId: string): Promise<DoctorScheduleExceptionEntity[]> {
    const list: DoctorScheduleExceptionEntity[] = [];
    for (const item of memoryDb.doctor_schedule_exceptions.values()) {
      if (item.doctor_id === doctorId) {
        list.push(item);
      }
    }
    return list;
  },

  async addException(doctorId: string, date: string, reason: string, isFullDay: boolean = true): Promise<DoctorScheduleExceptionEntity> {
    const id = `ex-${doctorId}-${Date.now()}`;
    const ex: DoctorScheduleExceptionEntity = {
      id,
      doctor_id: doctorId,
      date,
      reason,
      is_full_day: isFullDay,
      created_at: new Date().toISOString(),
    };
    memoryDb.doctor_schedule_exceptions.set(id, ex);
    saveStateToFile();
    return ex;
  },
};

export interface DoctorBreakInterval {
  start: string;
  end: string;
  reason?: string;
}

export type DoctorAvailabilityState = 'AVAILABLE' | 'UNAVAILABLE' | 'ON_LEAVE' | 'EMERGENCY_CLOSED' | 'FULLY_BOOKED';

export interface DoctorAvailabilityEntity {
  id: string;
  doctor_id: string;
  clinic_id: string;
  date: string;
  start_time: string;
  end_time: string;
  breaks: DoctorBreakInterval[];
  consultation_duration_minutes: number;
  availability_status: DoctorAvailabilityState;
  leave_status: boolean;
  emergency_closure: boolean;
  notes?: string;
  updated_at: string;
}

export const DoctorAvailabilityModel = {
  async getByDoctorAndDate(doctorId: string, dateStr: string): Promise<DoctorAvailabilityEntity> {
    const normDate = timeService.normalizeDateString(dateStr);
    const key = `${doctorId}_${normDate}`;
    const existing = memoryDb.doctor_availability.get(key);
    if (existing) return existing;

    const doctor = await DoctorModel.getById(doctorId);
    const clinicId = doctor?.clinic_id || 'c-demo-moon-01';

    const exceptions = await DoctorScheduleModel.getExceptionsByDoctorId(doctorId);
    const leaveException = exceptions.find((ex) => ex.date === normDate || ex.date === dateStr);

    let status: DoctorAvailabilityState = 'AVAILABLE';
    const isToday = timeService.isToday(normDate);
    if (isToday && (doctor?.status === 'OFFLINE' || doctor?.is_available_today === false)) {
      status = 'UNAVAILABLE';
    }
    if (leaveException) {
      status = 'ON_LEAVE';
    }

    const durMinutes = parseInt(doctor?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;

    const [year, month, day] = normDate.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayShortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dow = parsedDate.getUTCDay();
    const dayName = dayNames[dow] || 'Monday';
    const dayShort = dayShortNames[dow] || 'Mon';
    const daySchedule = doctor?.schedule ? doctor.schedule[dayName] : null;

    let startTime = daySchedule?.start || '09:00 AM';
    let endTime = daySchedule?.end || '05:00 PM';
    if (daySchedule?.is_off) {
      status = 'UNAVAILABLE';
    } else if (!daySchedule && doctor?.available_days && doctor.available_days.length > 0) {
      const isWorkingDay = doctor.available_days.some(
        (ad) => ad.toLowerCase() === dayShort.toLowerCase() || ad.toLowerCase() === dayName.toLowerCase()
      );
      if (!isWorkingDay) {
        status = 'UNAVAILABLE';
      }
    }

    const defaultAvailability: DoctorAvailabilityEntity = {
      id: key,
      doctor_id: doctorId,
      clinic_id: clinicId,
      date: normDate,
      start_time: startTime,
      end_time: endTime,
      breaks: [
        { start: '01:00 PM', end: '02:00 PM', reason: 'Lunch Break' },
      ],
      consultation_duration_minutes: durMinutes,
      availability_status: status,
      leave_status: !!leaveException,
      emergency_closure: false,
      updated_at: new Date().toISOString(),
    };

    memoryDb.doctor_availability.set(key, defaultAvailability);
    return defaultAvailability;
  },

  async setAvailability(
    doctorId: string,
    dateStr: string,
    updates: Partial<DoctorAvailabilityEntity>
  ): Promise<{ availability: DoctorAvailabilityEntity; affectedAppointments: any[] }> {
    const current = await this.getByDoctorAndDate(doctorId, dateStr);
    const normDate = timeService.normalizeDateString(dateStr);
    const key = `${doctorId}_${normDate}`;

    const updated: DoctorAvailabilityEntity = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    memoryDb.doctor_availability.set(key, updated);
    saveStateToFile();

    const affectedAppointments: any[] = [];
    for (const apt of memoryDb.appointments.values()) {
      const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);
      if (apt.doctor_id === doctorId && aptDate === normDate && !['Cancelled', 'CANCELLED'].includes(apt.status)) {
        affectedAppointments.push(apt);
      }
    }

    return {
      availability: updated,
      affectedAppointments,
    };
  },
};

export interface WalkInEntity {
  id: string;
  clinic_id?: string;
  doctor_id?: string;
  patient_id?: string;
  patient_name: string;
  phone: string;
  reason: string;
  preferred_doctor: string;
  priority: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  status: 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED';
  token_number?: string;
  queue_number?: number;
  queue_position?: number;
  estimated_wait_minutes?: number;
  registered_at: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

export const WalkInModel = {
  async getAll(clinicId?: string): Promise<WalkInEntity[]> {
    const list: WalkInEntity[] = [];
    for (const w of memoryDb.walk_ins.values()) {
      if (
        !clinicId ||
        w.clinic_id === clinicId ||
        (w.preferred_doctor && w.preferred_doctor.toLowerCase().includes(clinicId.toLowerCase()))
      ) {
        list.push(w);
      }
    }
    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async create(data: Omit<WalkInEntity, 'id' | 'created_at'> & { id?: string }): Promise<WalkInEntity> {
    const id = data.id || `w-${Date.now()}`;
    const newWalkIn: WalkInEntity = {
      ...data,
      id,
      priority: data.priority || 'NORMAL',
      status: data.status || 'WAITING',
      created_at: new Date().toISOString(),
    };
    memoryDb.walk_ins.set(id, newWalkIn);
    saveStateToFile();
    return newWalkIn;
  },

  async getById(id: string): Promise<WalkInEntity | null> {
    return memoryDb.walk_ins.get(id) || null;
  },

  async updateStatus(id: string, status: WalkInEntity['status']): Promise<WalkInEntity | null> {
    const w = memoryDb.walk_ins.get(id);
    if (!w) return null;
    w.status = status;
    if (status === 'COMPLETED') {
      w.queue_position = 0;
      w.estimated_wait_minutes = 0;
    }
    memoryDb.walk_ins.set(id, w);
    saveStateToFile();
    return w;
  },
};

export interface PharmacyItemEntity {
  id: string;
  clinic_id?: string;
  sku?: string;
  name: string;
  generic_name?: string;
  category: string;
  dosage_form: string;
  strength: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  min_stock_level: number;
  reorder_quantity: number;
  unit_price: number;
  created_at?: string;
  updated_at?: string;
}

export interface PharmacyDispensationEntity {
  id: string;
  inventory_id?: string;
  medicine_name: string;
  prescription_id?: string;
  patient_id?: string;
  patient_name?: string;
  quantity_dispensed: number;
  batch_number: string;
  dispensed_at: string;
  dispensed_by: string;
}

export function normalizeMedicineName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/&/g, 'and')
    .replace(/\+/g, 'and')
    .replace(/(\d+)\s*mg/g, '$1mg')
    .replace(/(\d+)\s*g/g, '$1g')
    .replace(/(\d+)\s*ml/g, '$1ml')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMedicineMatch(
  targetName: string,
  item: { name: string; generic_name?: string; batch_number?: string; sku?: string; strength?: string }
): boolean {
  if (!targetName || !item) return false;
  const rawTarget = targetName.toLowerCase().trim();
  const rawName = item.name.toLowerCase().trim();
  const rawGeneric = (item.generic_name || '').toLowerCase().trim();
  const rawBatch = (item.batch_number || '').toLowerCase().trim();
  const rawSku = (item.sku || '').toLowerCase().trim();

  // 1. SKU exact or contained match
  if (rawSku && (rawSku === rawTarget || rawTarget.includes(rawSku) || rawSku.includes(rawTarget))) {
    return true;
  }

  // 2. Batch number exact/prefix match
  if (rawBatch && (rawBatch === rawTarget || rawBatch.includes(rawTarget))) {
    return true;
  }

  // 3. Exact match
  if (rawName === rawTarget || rawGeneric === rawTarget) {
    return true;
  }

  // 4. Normalized comparison
  const normTarget = normalizeMedicineName(targetName);
  const normName = normalizeMedicineName(item.name);
  const normGeneric = normalizeMedicineName(item.generic_name || '');

  if (normName === normTarget || normGeneric === normTarget) {
    return true;
  }

  // Extract explicit strength (e.g. '500mg', '625mg', '650mg')
  const targetStrength = normTarget.match(/\b\d+(?:mg|g|ml)\b/)?.[0];
  const itemStrength = normName.match(/\b\d+(?:mg|g|ml)\b/)?.[0];

  // Strict Rule: If both strings have a dosage/strength and they differ, they NEVER match!
  // E.g. 'Amoxicillin 500mg' must NEVER match 'Amoxicillin & Potassium Clavulanate 625 mg'
  if (targetStrength && itemStrength && targetStrength !== itemStrength) {
    return false;
  }

  // Combination drug rule:
  // If item contains clavulanate and target explicitly has a strength but does NOT mention clavulanate,
  // do not match (e.g. 'Amoxicillin 500mg' prescribed must NOT match combination 'Amoxicillin & Potassium Clavulanate 625 mg')
  const targetHasClav = normTarget.includes('clav');
  const itemHasClav = normName.includes('clav') || normGeneric.includes('clav');
  if (itemHasClav && !targetHasClav && targetStrength) {
    return false;
  }
  if (!itemHasClav && targetHasClav) {
    return false;
  }

  // Substring matching on normalized strings
  if (normName.includes(normTarget) || normTarget.includes(normName)) {
    return true;
  }
  if (normGeneric && (normGeneric.includes(normTarget) || normTarget.includes(normGeneric))) {
    return true;
  }

  // Token-based overlap match for compound medicines
  const targetTokens = normTarget.split(' ').filter((t) => t.length >= 3);
  const itemTokens = `${normName} ${normGeneric}`.split(' ').filter((t) => t.length >= 3);
  if (targetTokens.length >= 2) {
    const allTokensPresent = targetTokens.every((t) => itemTokens.includes(t));
    if (allTokensPresent) return true;
  }

  return false;
}

export const PharmacyModel = {
  async getAll(filter?: { search?: string; category?: string; clinicId?: string }): Promise<PharmacyItemEntity[]> {
    const list: PharmacyItemEntity[] = [];
    const search = filter?.search?.trim();
    const targetClinic = filter?.clinicId ? resolveCanonicalClinicId(filter.clinicId) : undefined;
    for (const item of memoryDb.pharmacy_inventory.values()) {
      if (targetClinic && resolveCanonicalClinicId(item.clinic_id || '') !== targetClinic) continue;
      if (filter?.category && filter.category !== 'All' && item.category !== filter.category) continue;
      if (search) {
        if (!isMedicineMatch(search, item)) continue;
      }
      list.push(item);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  },

  async getById(id: string): Promise<PharmacyItemEntity | null> {
    return memoryDb.pharmacy_inventory.get(id) || null;
  },

  async create(data: Omit<PharmacyItemEntity, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<PharmacyItemEntity> {
    const id = data.id || `rx-item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newItem: PharmacyItemEntity = {
      ...data,
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.pharmacy_inventory.set(id, newItem);
    saveStateToFile();
    return newItem;
  },

  async updateQuantity(id: string, newQuantity: number): Promise<PharmacyItemEntity | null> {
    const item = memoryDb.pharmacy_inventory.get(id);
    if (!item) return null;
    item.quantity = Math.max(0, newQuantity);
    item.updated_at = new Date().toISOString();
    memoryDb.pharmacy_inventory.set(id, item);
    saveStateToFile();
    return item;
  },

  async getLowStockItems(clinicId?: string): Promise<PharmacyItemEntity[]> {
    const list: PharmacyItemEntity[] = [];
    const targetClinic = clinicId ? resolveCanonicalClinicId(clinicId) : undefined;
    for (const item of memoryDb.pharmacy_inventory.values()) {
      if (targetClinic && resolveCanonicalClinicId(item.clinic_id || '') !== targetClinic) continue;
      if (item.quantity <= item.min_stock_level) {
        list.push(item);
      }
    }
    return list.sort((a, b) => a.quantity - b.quantity);
  },

  async getExpiringItems(withinDays: number = 90, clinicId?: string): Promise<PharmacyItemEntity[]> {
    const now = new Date();
    const threshold = new Date(now.getTime() + withinDays * 86400000);
    const list: PharmacyItemEntity[] = [];
    const targetClinic = clinicId ? resolveCanonicalClinicId(clinicId) : undefined;
    for (const item of memoryDb.pharmacy_inventory.values()) {
      if (targetClinic && resolveCanonicalClinicId(item.clinic_id || '') !== targetClinic) continue;
      const exp = new Date(item.expiry_date);
      if (exp <= threshold && exp > now) {
        list.push(item);
      }
    }
    return list.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
  },

  async logDispensation(dispensation: Omit<PharmacyDispensationEntity, 'id' | 'dispensed_at'>): Promise<PharmacyDispensationEntity> {
    const id = `disp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newDisp: PharmacyDispensationEntity = {
      ...dispensation,
      id,
      dispensed_at: new Date().toISOString(),
    };
    memoryDb.pharmacy_dispensations.set(id, newDisp);
    saveStateToFile();
    return newDisp;
  },

  async getDispensations(filter?: { medicineName?: string; patientId?: string; clinicId?: string }): Promise<PharmacyDispensationEntity[]> {
    const list: PharmacyDispensationEntity[] = [];
    for (const d of memoryDb.pharmacy_dispensations.values()) {
      if (filter?.medicineName && !d.medicine_name.toLowerCase().includes(filter.medicineName.toLowerCase())) continue;
      if (filter?.patientId && d.patient_id !== filter.patientId) continue;
      list.push(d);
    }
    return list.sort((a, b) => new Date(b.dispensed_at).getTime() - new Date(a.dispensed_at).getTime());
  },
};

// ============================================================
// DOCTOR-CLINIC ASSIGNMENTS & AVAILABILITY REQUEST MODELS
// ============================================================

export const DOCTOR_ALIAS_MAP: Record<string, string> = {
  'doc-arun': 'doc-demo-arun-01',
  'd1': 'doc-demo-arun-01',
  'd2': 'doc-demo-priya-02',
  'd3': 'doc-demo-karthik-03',
  'd4': 'doc-demo-kavitha-04',
  'd5': 'doc-demo-priya-05',
  'd6': 'doc-demo-venkat-06',
  'doc-demo-vikram-03': 'doc-demo-karthik-03',
  'doc-demo-neha-04': 'doc-demo-kavitha-04',
  'doc-demo-rahul-05': 'doc-demo-priya-05',
  'doc-demo-kavya-06': 'doc-demo-venkat-06',
  'doc-demo-verification-005': 'doc-demo-suresh-07',
  'doc-fixture-ananya': 'doc-demo-ananya-08',
  'doc-001': 'doc-demo-arun-01',
  'doc-002': 'doc-demo-priya-02',
  'doc-003': 'doc-demo-karthik-03',
  'doc-004': 'doc-demo-kavitha-04',
  'doc-005': 'doc-demo-priya-05',
  'doc-006': 'doc-demo-venkat-06',
  'doc-007': 'doc-demo-suresh-07',
  'doc-008': 'doc-demo-ananya-08',
  'doc-009': 'doc-demo-radha-09',
  'doc-010': 'doc-demo-ramesh-10',
  'doc-011': 'doc-demo-aditya-11',
  'doc-012': 'doc-demo-arvind-12',
  'doc-013': 'doc-demo-nithya-13',
  'doc-014': 'doc-demo-rajesh-14',
  'doc-015': 'doc-demo-shalini-15',
  'doc-016': 'doc-demo-deepa-16',
  'doc-017': 'doc-demo-sneha-17',
  'doc-018': 'doc-demo-harish-18',
  'doc-019': 'doc-demo-gayatri-19',
  'doc-020': 'doc-demo-swetha-20',
  'doc-021': 'doc-demo-arun-21',
  'doc-022': 'doc-demo-vikram-22',
  'doc-023': 'doc-demo-meenakshi-23',
  'doc-024': 'doc-demo-balaji-24',
  'doc-025': 'doc-demo-kavya-25',
  'doc-026': 'doc-demo-rahul-26',
  'doc-027': 'doc-demo-divya-27',
  'doc-028': 'doc-demo-sanjay-28',
  'doc-029': 'doc-demo-pooja-29',
  'doc-030': 'doc-demo-vignesh-30',
  'doc-1': 'doc-demo-arun-01',
  'doc-2': 'doc-demo-priya-02',
  'doc-3': 'doc-demo-karthik-03',
  'doc-4': 'doc-demo-kavitha-04',
  'doc-5': 'doc-demo-priya-05',
  'doc-6': 'doc-demo-venkat-06',
  'doc-7': 'doc-demo-suresh-07',
  'doc-8': 'doc-demo-ananya-08',
  'doc-9': 'doc-demo-radha-09',
  'doc-10': 'doc-demo-ramesh-10',
  'doc-11': 'doc-demo-aditya-11',
  'doc-12': 'doc-demo-arvind-12',
  'doc-13': 'doc-demo-nithya-13',
  'doc-14': 'doc-demo-rajesh-14',
  'doc-15': 'doc-demo-shalini-15',
  'doc-16': 'doc-demo-deepa-16',
  'doc-17': 'doc-demo-sneha-17',
  'doc-18': 'doc-demo-harish-18',
  'doc-19': 'doc-demo-gayatri-19',
  'doc-20': 'doc-demo-swetha-20',
  'doc-21': 'doc-demo-arun-21',
  'doc-22': 'doc-demo-vikram-22',
  'doc-23': 'doc-demo-meenakshi-23',
  'doc-24': 'doc-demo-balaji-24',
  'doc-25': 'doc-demo-kavya-25',
  'doc-26': 'doc-demo-rahul-26',
  'doc-27': 'doc-demo-divya-27',
  'doc-28': 'doc-demo-sanjay-28',
  'doc-29': 'doc-demo-pooja-29',
  'doc-30': 'doc-demo-vignesh-30',
  'doc-alagu-vimalesh-2773': 'doc-alagu-vimalesh-2773',
  'doc-merlin-rajan-2773': 'doc-merlin-rajan-2773',
  'dr-alagu-vimalesh': 'doc-alagu-vimalesh-2773',
  'dr-merlin-rajan': 'doc-merlin-rajan-2773',
  'dr.alagu.vimalesh@moondental.test': 'doc-alagu-vimalesh-2773',
  'dr.alagu@moondental.test': 'doc-alagu-vimalesh-2773',
  'dr.jeffrey@moondental.test': 'doc-alagu-vimalesh-2773',
  'dr.jeffrey.vimalesh@moondental.test': 'doc-alagu-vimalesh-2773',
  'dr-jeffrey-vimalesh': 'doc-alagu-vimalesh-2773',
  'dr-jeffrey-vimalesh-2773': 'doc-alagu-vimalesh-2773',
  'dr.merlin.rajan@moondental.test': 'doc-merlin-rajan-2773',
  'dr.merlin@moondental.test': 'doc-merlin-rajan-2773',
};

export function resolveCanonicalDoctorId(id: string): string {
  if (!id) return id;
  const clean = id.toLowerCase().trim();
  return DOCTOR_ALIAS_MAP[clean] || DOCTOR_ALIAS_MAP[id] || id;
}

export interface DoctorClinicAssignmentEntity {
  id: string;
  doctor_id: string;
  clinic_id: string;
  specialty?: string;
  active: boolean;
  status?: DoctorAvailabilityStatus;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at?: string;
}

export const DoctorClinicAssignmentModel = {
  async assign(
    dataOrDocId: string | Omit<DoctorClinicAssignmentEntity, 'id' | 'created_at'>,
    clinicId?: string,
    specialty?: string
  ): Promise<DoctorClinicAssignmentEntity> {
    let data: Omit<DoctorClinicAssignmentEntity, 'id' | 'created_at'>;
    if (typeof dataOrDocId === 'string') {
      data = {
        doctor_id: dataOrDocId,
        clinic_id: clinicId!,
        specialty,
        active: true,
        status: 'AVAILABLE',
      };
    } else {
      data = {
        status: 'AVAILABLE',
        ...dataOrDocId,
      };
    }
    const id = `dca-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const entity: DoctorClinicAssignmentEntity = {
      id,
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.doctor_clinic_assignments.set(id, entity);
    saveStateToFile();
    return entity;
  },

  async getStatus(doctorId: string, clinicId: string): Promise<DoctorAvailabilityStatus | null> {
    const canonicalDoc = resolveCanonicalDoctorId(doctorId);
    const canonicalClinic = resolveCanonicalClinicId(clinicId);
    for (const a of memoryDb.doctor_clinic_assignments.values()) {
      const matchDoc =
        a.doctor_id === doctorId ||
        a.doctor_id === canonicalDoc ||
        resolveCanonicalDoctorId(a.doctor_id) === canonicalDoc;
      const matchClinic =
        a.clinic_id === clinicId ||
        a.clinic_id === canonicalClinic ||
        resolveCanonicalClinicId(a.clinic_id) === canonicalClinic;
      if (matchDoc && matchClinic && a.active && a.status) {
        return a.status;
      }
    }
    return null;
  },

  async setStatus(
    doctorId: string,
    clinicId: string,
    status: DoctorAvailabilityStatus
  ): Promise<DoctorClinicAssignmentEntity> {
    const canonicalDoc = resolveCanonicalDoctorId(doctorId);
    const canonicalClinic = resolveCanonicalClinicId(clinicId);

    for (const a of memoryDb.doctor_clinic_assignments.values()) {
      const matchDoc =
        a.doctor_id === doctorId ||
        a.doctor_id === canonicalDoc ||
        resolveCanonicalDoctorId(a.doctor_id) === canonicalDoc;
      const matchClinic =
        a.clinic_id === clinicId ||
        a.clinic_id === canonicalClinic ||
        resolveCanonicalClinicId(a.clinic_id) === canonicalClinic;
      if (matchDoc && matchClinic && a.active) {
        a.status = status;
        a.updated_at = new Date().toISOString();
        memoryDb.doctor_clinic_assignments.set(a.id, a);
        saveStateToFile();
        return a;
      }
    }

    const doc = memoryDb.doctors.get(doctorId) || memoryDb.doctors.get(canonicalDoc);
    const id = `dca-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const entity: DoctorClinicAssignmentEntity = {
      id,
      doctor_id: canonicalDoc,
      clinic_id: canonicalClinic,
      specialty: doc?.specialization,
      active: true,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.doctor_clinic_assignments.set(id, entity);
    saveStateToFile();
    return entity;
  },

  async getByDoctorId(doctorId: string): Promise<DoctorClinicAssignmentEntity[]> {
    const canonicalDoc = resolveCanonicalDoctorId(doctorId);
    const list: DoctorClinicAssignmentEntity[] = [];
    for (const a of memoryDb.doctor_clinic_assignments.values()) {
      if ((a.doctor_id === doctorId || a.doctor_id === canonicalDoc) && a.active) {
        list.push(a);
      }
    }
    return list;
  },

  async getByClinicId(clinicId: string): Promise<DoctorClinicAssignmentEntity[]> {
    const canonicalClinic = resolveCanonicalClinicId(clinicId);
    const list: DoctorClinicAssignmentEntity[] = [];
    for (const a of memoryDb.doctor_clinic_assignments.values()) {
      if ((a.clinic_id === clinicId || a.clinic_id === canonicalClinic) && a.active) {
        list.push(a);
      }
    }
    return list;
  },

  async isAssigned(doctorId: string, clinicId: string): Promise<boolean> {
    const canonicalDoc = resolveCanonicalDoctorId(doctorId);
    const canonicalClinic = resolveCanonicalClinicId(clinicId);
    for (const a of memoryDb.doctor_clinic_assignments.values()) {
      const matchDoc = a.doctor_id === doctorId || a.doctor_id === canonicalDoc;
      const matchClinic = a.clinic_id === clinicId || a.clinic_id === canonicalClinic;
      if (matchDoc && matchClinic && a.active) {
        return true;
      }
    }
    return false;
  },
};

export type AvailabilityRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface AvailabilityRequestEntity {
  id: string;
  clinic_id: string;
  clinic_name: string;
  doctor_id: string;
  doctor_name: string;
  specialty: string;
  date: string;
  requested_date: string;
  start_time: string;
  end_time: string;
  status: AvailabilityRequestStatus;
  notes?: string;
  response_notes?: string;
  requested_by?: string;
  created_at: string;
  updated_at: string;
}

function parseTimeToMinsHelper(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim();
  const isPM = clean.toUpperCase().includes('PM');
  const isAM = clean.toUpperCase().includes('AM');
  const parts = clean.replace(/[^\d:]/g, '').split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export const AvailabilityRequestModel = {
  async create(data: Omit<AvailabilityRequestEntity, 'id' | 'status' | 'created_at' | 'updated_at'>): Promise<AvailabilityRequestEntity> {
    const id = `avail-req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const rawDate = data.date || data.requested_date || (data as any).requestedDate || '';
    const canonicalDate = timeService.normalizeDateString(rawDate);
    const entity: AvailabilityRequestEntity = {
      ...data,
      id,
      date: canonicalDate,
      requested_date: canonicalDate,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.availability_requests.set(id, entity);
    saveStateToFile();
    return entity;
  },

  async getById(id: string): Promise<AvailabilityRequestEntity | null> {
    const r = memoryDb.availability_requests.get(id);
    if (!r) return null;
    const canonicalDate = timeService.normalizeDateString(r.date || r.requested_date);
    r.date = canonicalDate;
    r.requested_date = canonicalDate;
    return r;
  },

  async getRequests(filter?: { doctorId?: string; clinicId?: string; status?: AvailabilityRequestStatus; date?: string }): Promise<AvailabilityRequestEntity[]> {
    const list: AvailabilityRequestEntity[] = [];
    const canonicalDoc = filter?.doctorId ? resolveCanonicalDoctorId(filter.doctorId) : undefined;
    const canonicalClinic = filter?.clinicId ? resolveCanonicalClinicId(filter.clinicId) : undefined;
    const filterDate = filter?.date ? timeService.normalizeDateString(filter.date) : undefined;

    for (const r of memoryDb.availability_requests.values()) {
      const canonicalDate = timeService.normalizeDateString(r.date || r.requested_date);
      r.date = canonicalDate;
      r.requested_date = canonicalDate;

      if (filter?.doctorId && r.doctor_id !== filter.doctorId && r.doctor_id !== canonicalDoc) continue;
      if (filter?.clinicId && r.clinic_id !== filter.clinicId && r.clinic_id !== canonicalClinic) continue;
      if (filter?.status && r.status !== filter.status) continue;
      if (filterDate && canonicalDate !== filterDate) continue;
      list.push(r);
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async updateStatus(id: string, status: AvailabilityRequestStatus, responseNotes?: string): Promise<AvailabilityRequestEntity | null> {
    const r = memoryDb.availability_requests.get(id);
    if (!r) return null;
    r.status = status;
    if (responseNotes !== undefined) r.response_notes = responseNotes;
    r.updated_at = new Date().toISOString();
    const canonicalDate = timeService.normalizeDateString(r.date || r.requested_date);
    r.date = canonicalDate;
    r.requested_date = canonicalDate;
    memoryDb.availability_requests.set(id, r);
    saveStateToFile();
    return r;
  },

  async hasScheduleConflict(
    doctorId: string,
    clinicId: string,
    date: string,
    startTime: string,
    endTime: string,
    excludeRequestId?: string
  ): Promise<{ conflict: boolean; conflictingRequest?: AvailabilityRequestEntity; reason?: string }> {
    const canonicalDoc = resolveCanonicalDoctorId(doctorId);
    const canonicalClinic = resolveCanonicalClinicId(clinicId);
    const normDate = timeService.normalizeDateString(date);
    const newStart = parseTimeToMinsHelper(startTime);
    const newEnd = parseTimeToMinsHelper(endTime);

    if (newStart >= newEnd) {
      return {
        conflict: true,
        reason: `Invalid shift time interval: Start time (${startTime}) must be earlier than end time (${endTime}).`,
      };
    }

    for (const r of memoryDb.availability_requests.values()) {
      if (excludeRequestId && r.id === excludeRequestId) continue;
      // Only consider active requests (APPROVED or PENDING). Cancelled / Rejected do not block new requests.
      if (r.status !== 'APPROVED' && r.status !== 'PENDING') continue;

      const matchDoc = r.doctor_id === doctorId || r.doctor_id === canonicalDoc;
      const matchClinic = r.clinic_id === clinicId || r.clinic_id === canonicalClinic;
      const rDate = timeService.normalizeDateString(r.date || r.requested_date);

      if (matchDoc && matchClinic && rDate === normDate) {
        const existStart = parseTimeToMinsHelper(r.start_time);
        const existEnd = parseTimeToMinsHelper(r.end_time);

        // Check interval overlap: max(start1, start2) < min(end1, end2)
        const overlaps = Math.max(newStart, existStart) < Math.min(newEnd, existEnd);
        if (overlaps) {
          return {
            conflict: true,
            conflictingRequest: r,
            reason: `Shift overlaps with an existing ${r.status.toLowerCase()} schedule (${r.start_time} – ${r.end_time}) on ${rDate}.`,
          };
        }
      }
    }

    return { conflict: false };
  },

  async getAllApprovedForDoctorAndClinic(
    doctorId: string,
    clinicId: string,
    date: string
  ): Promise<AvailabilityRequestEntity[]> {
    const canonicalDoc = resolveCanonicalDoctorId(doctorId);
    const canonicalClinic = resolveCanonicalClinicId(clinicId);
    const normDate = timeService.normalizeDateString(date);
    const results: AvailabilityRequestEntity[] = [];

    for (const r of memoryDb.availability_requests.values()) {
      const matchDoc = r.doctor_id === doctorId || r.doctor_id === canonicalDoc;
      const matchClinic = r.clinic_id === clinicId || r.clinic_id === canonicalClinic;
      const rDate = timeService.normalizeDateString(r.date || r.requested_date);
      if (matchDoc && matchClinic && r.status === 'APPROVED' && rDate === normDate) {
        r.date = rDate;
        r.requested_date = rDate;
        results.push(r);
      }
    }

    return results.sort((a, b) => parseTimeToMinsHelper(a.start_time) - parseTimeToMinsHelper(b.start_time));
  },

  async hasApprovedAvailability(doctorId: string, clinicId: string, date: string, timeStr?: string): Promise<boolean> {
    const all = await this.getAllApprovedForDoctorAndClinic(doctorId, clinicId, date);
    if (all.length === 0) return false;
    if (!timeStr) return true;

    const slotMins = parseTimeToMinsHelper(timeStr);
    return all.some((r) => {
      const startMins = parseTimeToMinsHelper(r.start_time);
      const endMins = parseTimeToMinsHelper(r.end_time);
      return slotMins >= startMins && slotMins < endMins;
    });
  },

  async getApprovedForDoctorAndClinic(doctorId: string, clinicId: string, date: string): Promise<AvailabilityRequestEntity | null> {
    const all = await this.getAllApprovedForDoctorAndClinic(doctorId, clinicId, date);
    return all.length > 0 ? all[0] : null;
  },
};

// -------------------------------------------------------------
// LOAD BALANCER PROPOSAL MODEL
// -------------------------------------------------------------
export type LoadBalanceConsentStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
export type LoadBalanceProposalStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMMITTED' | 'CANCELLED' | 'EXPIRED';

export interface LoadBalanceProposalEntity {
  id: string;
  clinic_id: string;
  clinic_name: string;
  source_doctor_id: string;
  source_doctor_name: string;
  target_doctor_id: string;
  target_doctor_name: string;
  appointment_id?: string;
  walk_in_id?: string;
  patient_id: string;
  patient_name: string;
  procedure_name?: string;
  department_name?: string;
  source_queue_count: number;
  target_queue_count: number;
  estimated_wait_minutes?: number;
  new_estimated_wait_minutes?: number;
  doctor_consent: LoadBalanceConsentStatus;
  doctor_consented_at?: string;
  doctor_decline_reason?: string;
  patient_consent: LoadBalanceConsentStatus;
  patient_consented_at?: string;
  patient_decline_reason?: string;
  status: LoadBalanceProposalStatus;
  transferred_at?: string;
  created_at: string;
  updated_at: string;
}

export const LoadBalanceProposalModel = {
  async getAll(clinicId?: string): Promise<LoadBalanceProposalEntity[]> {
    const list: LoadBalanceProposalEntity[] = [];
    const canonicalClinic = clinicId ? resolveCanonicalClinicId(clinicId) : undefined;
    for (const p of memoryDb.load_balance_proposals.values()) {
      if (!canonicalClinic || resolveCanonicalClinicId(p.clinic_id) === canonicalClinic) {
        list.push(p);
      }
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getById(id: string): Promise<LoadBalanceProposalEntity | null> {
    return memoryDb.load_balance_proposals.get(id) || null;
  },

  async getByDoctorId(doctorId: string): Promise<LoadBalanceProposalEntity[]> {
    const canonicalDoc = resolveCanonicalDoctorId(doctorId);
    const list: LoadBalanceProposalEntity[] = [];
    for (const p of memoryDb.load_balance_proposals.values()) {
      if (
        p.target_doctor_id === doctorId ||
        resolveCanonicalDoctorId(p.target_doctor_id) === canonicalDoc ||
        p.source_doctor_id === doctorId ||
        resolveCanonicalDoctorId(p.source_doctor_id) === canonicalDoc
      ) {
        list.push(p);
      }
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getByPatientId(patientId: string): Promise<LoadBalanceProposalEntity[]> {
    const list: LoadBalanceProposalEntity[] = [];
    const targetSet = new Set<string>([patientId]);
    if (memoryDb.patients?.getAliases) {
      const aliasMap = memoryDb.patients.getAliases();
      const canonical = aliasMap.get(patientId.toLowerCase()) || patientId;
      targetSet.add(canonical);
      for (const [alias, canId] of aliasMap.entries()) {
        if (canId === canonical || canId === patientId) {
          targetSet.add(alias);
        }
      }
    }
    for (const p of memoryDb.load_balance_proposals.values()) {
      if (targetSet.has(p.patient_id)) {
        list.push(p);
      }
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async findActiveByPatient(
    patientId: string,
    appointmentId?: string,
    walkInId?: string
  ): Promise<LoadBalanceProposalEntity | null> {
    for (const p of memoryDb.load_balance_proposals.values()) {
      if (p.status === 'PENDING') {
        if (appointmentId && p.appointment_id === appointmentId) return p;
        if (walkInId && p.walk_in_id === walkInId) return p;
        if (p.patient_id === patientId) return p;
      }
    }
    return null;
  },

  async create(
    data: Omit<LoadBalanceProposalEntity, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<LoadBalanceProposalEntity> {
    const id = data.id || `lbp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const newProposal: LoadBalanceProposalEntity = {
      ...data,
      id,
      doctor_consent: data.doctor_consent || 'PENDING',
      patient_consent: data.patient_consent || 'PENDING',
      status: data.status || 'PENDING',
      created_at: now,
      updated_at: now,
    };
    memoryDb.load_balance_proposals.set(id, newProposal);
    saveStateToFile();
    return newProposal;
  },

  async update(id: string, updates: Partial<LoadBalanceProposalEntity>): Promise<LoadBalanceProposalEntity | null> {
    const existing = memoryDb.load_balance_proposals.get(id);
    if (!existing) return null;
    const updated: LoadBalanceProposalEntity = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    memoryDb.load_balance_proposals.set(id, updated);
    saveStateToFile();
    return updated;
  },
};


