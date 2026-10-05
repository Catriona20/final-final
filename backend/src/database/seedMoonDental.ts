import bcrypt from 'bcryptjs';
import { memoryDb, saveStateToFile, loadStateFromFile } from './db';
import {
  ClinicEntity,
  DoctorEntity,
  AssistantEntity,
  DoctorClinicAssignmentModel,
  DoctorProcedureModel,
} from './models';

export interface AdditiveSeedResult {
  success: boolean;
  clinicId: string;
  clinicNumber: number;
  clinicName: string;
  doctorsAdded: string[];
  assignmentsAdded: string[];
  alreadyExisted: boolean;
}

/**
 * Additive and Idempotent seed function for Moon Dental Clinic, Villivakkam (Clinic #2773).
 * Safely creates or updates ONLY Moon Dental Clinic (Villivakkam) and its two doctors
 * without touching, resetting, or altering any existing demo clinics, doctors, patients,
 * appointments, queues, consultations, or login credentials.
 */
export async function seedMoonDentalVillivakkam(): Promise<AdditiveSeedResult> {
  // Ensure existing persistent state is loaded first if running standalone
  if (memoryDb.clinics.size === 0) {
    loadStateFromFile();
  }

  const CLINIC_ID = 'c-moon-dental-villivakkam-2773';
  const CLINIC_NUM = 2773;
  const DOC_1_ID = 'doc-alagu-vimalesh-2773';
  const DOC_2_ID = 'doc-merlin-rajan-2773';
  const ASST_ID = 'asst-moon-villivakkam-2773';

  const alreadyExisted = memoryDb.clinics.has(CLINIC_ID);

  // 1. Password hashes
  const docPassHash = await bcrypt.hash('Doctor@2773', 10);
  const asstPassHash = await bcrypt.hash('Clinic@3001', 10);

  // 2. Add / Update Moon Dental Clinic (Villivakkam, Clinic #2773)
  const existingClinic = memoryDb.clinics.get(CLINIC_ID);
  const clinicEntity: ClinicEntity = {
    id: CLINIC_ID,
    clinic_number: CLINIC_NUM,
    registration_number: String(CLINIC_NUM),
    name: 'Moon Dental Clinic',
    locality: 'Villivakkam',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postal_code: '600082',
    address: '28/15, Sannathi Street, Villivakkam, Chennai, Tamil Nadu 600082',
    category: 'Dentistry',
    clinic_type: 'Dental clinic',
    departments: ['Dentistry'],
    // Geocoded coordinates via existing CHENNAI_GEOGRAPHIC_CELLS & geocoding workflow for Villivakkam
    latitude: 13.1075,
    longitude: 80.2060,
    rating: existingClinic?.rating || 4.90,
    reviews_count: existingClinic?.reviews_count || 48,
    doctors_count: 2,
    open_hours: '09:00 AM – 08:30 PM',
    phone: '+91 44 2617 2773',
    email: 'contact@moondentalvillivakkam.test',
    is_open: true,
    is_popular: false,
    is_nearby: true,
    wait_time: '10 min wait',
    consultation_fee: '₹400',
    status: 'ACTIVE',
    verification_status: 'ACTIVE',
    email_verified: true,
    phone_verified: true,
    image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=800&q=80',
    created_at: existingClinic?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  memoryDb.clinics.set(CLINIC_ID, clinicEntity);

  // Register Clinic Aliases
  memoryDb.clinics.setAlias('2773', CLINIC_ID);
  memoryDb.clinics.setAlias('clinic-2773', CLINIC_ID);
  memoryDb.clinics.setAlias('c-2773', CLINIC_ID);
  memoryDb.clinics.setAlias('c-moon-dental-villivakkam-2773', CLINIC_ID);
  memoryDb.clinics.setAlias('moon dental clinic villivakkam', CLINIC_ID);

  // 3. Add / Update Doctor 1: Dr. Alagu Vimalesh (RCT Specialist)
  const defaultSchedule = {
    monday: { start: '09:00 AM', end: '08:30 PM', slot_duration: 25, is_off: false },
    tuesday: { start: '09:00 AM', end: '08:30 PM', slot_duration: 25, is_off: false },
    wednesday: { start: '09:00 AM', end: '08:30 PM', slot_duration: 25, is_off: false },
    thursday: { start: '09:00 AM', end: '08:30 PM', slot_duration: 25, is_off: false },
    friday: { start: '09:00 AM', end: '08:30 PM', slot_duration: 25, is_off: false },
    saturday: { start: '09:00 AM', end: '08:30 PM', slot_duration: 25, is_off: false },
    sunday: { start: '10:00 AM', end: '02:00 PM', slot_duration: 25, is_off: true },
  };

  const existingDoc1 = memoryDb.doctors.get(DOC_1_ID);
  const doc1Entity: DoctorEntity = {
    id: DOC_1_ID,
    name: 'Dr. Alagu Vimalesh',
    email: 'dr.alagu.vimalesh@moondental.test',
    phone: '+91 98402 27731',
    password_hash: existingDoc1?.password_hash || docPassHash,
    specialization: 'Dentistry',
    primary_specialization: 'Conservative Dentistry and Endodontics',
    secondary_specialization: 'Endodontics (RCT Specialist)',
    qualification: 'BDS, MDS — Conservative Dentistry and Endodontics',
    university: 'The Tamil Nadu Dr. M.G.R. Medical University',
    grad_year: 2013,
    dob: '1987-04-18',
    gender: 'Male',
    rating: existingDoc1?.rating || 4.96,
    reviews_count: existingDoc1?.reviews_count || 140,
    experience_years: 12,
    avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400',
    clinic_id: CLINIC_ID,
    clinic_name: 'Moon Dental Clinic',
    available_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    wait_time: '10 min',
    is_available_today: true,
    status: 'AVAILABLE',
    languages: ['English', 'Tamil'],
    consultation_fee: '₹400',
    is_preferred: true,
    about: 'Specialist in Conservative Dentistry and Endodontics with extensive clinical focus on Root Canal Treatment (RCT) and modern painless restorative dental procedures.',
    is_verified: true,
    verification_status: 'VERIFIED',
    verified_at: '2025-01-10T10:00:00.000Z',
    registration_number: 'TN-DENT-2773-01',
    registration_authority: 'Tamil Nadu Dental Council',
    consultation_duration: '25 min',
    clinic_affiliations: ['Moon Dental Clinic'],
    procedures: ['Root Canal Treatment', 'Root Canal Treatment (RCT)', 'Dental Cleaning', 'Dental Filling', 'Tooth Extraction'],
    schedule: defaultSchedule,
    created_at: existingDoc1?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  memoryDb.doctors.set(DOC_1_ID, doc1Entity);
  memoryDb.doctors.setAlias('doc-alagu-vimalesh-2773', DOC_1_ID);
  memoryDb.doctors.setAlias('dr-alagu-vimalesh', DOC_1_ID);
  memoryDb.doctors.setAlias('dr.alagu.vimalesh@moondental.test', DOC_1_ID);
  memoryDb.doctors.setAlias('dr.alagu@moondental.test', DOC_1_ID);
  memoryDb.doctors.setAlias('dr.jeffrey@moondental.test', DOC_1_ID);
  memoryDb.doctors.setAlias('dr.jeffrey.vimalesh@moondental.test', DOC_1_ID);
  memoryDb.doctors.setAlias('dr-jeffrey-vimalesh', DOC_1_ID);
  memoryDb.doctors.setAlias('dr-jeffrey-vimalesh-2773', DOC_1_ID);

  // 4. Add / Update Doctor 2: Dr. Merlin Rajan (General & Conservative Dentistry)
  const existingDoc2 = memoryDb.doctors.get(DOC_2_ID);
  const doc2Entity: DoctorEntity = {
    id: DOC_2_ID,
    name: 'Dr. Merlin Rajan',
    email: 'dr.merlin.rajan@moondental.test',
    phone: '+91 98402 27732',
    password_hash: existingDoc2?.password_hash || docPassHash,
    specialization: 'Dentistry',
    primary_specialization: 'Conservative Dentistry and Endodontics',
    secondary_specialization: 'Conservative Dentistry',
    qualification: 'Conservative Dentistry and Endodontics',
    university: 'The Tamil Nadu Dr. M.G.R. Medical University',
    grad_year: 2016,
    dob: '1990-08-22',
    gender: 'Female',
    rating: existingDoc2?.rating || 4.91,
    reviews_count: existingDoc2?.reviews_count || 95,
    experience_years: 9,
    avatar: 'https://images.unsplash.com/photo-1594824813680-4824244ec5f4?auto=format&fit=crop&q=80&w=400',
    clinic_id: CLINIC_ID,
    clinic_name: 'Moon Dental Clinic',
    available_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    wait_time: '10 min',
    is_available_today: true,
    status: 'AVAILABLE',
    languages: ['English', 'Tamil'],
    consultation_fee: '₹400',
    is_preferred: true,
    about: 'Specialist in Conservative Dentistry and Endodontics providing routine dental cleaning, composite tooth fillings, and general dental procedures.',
    is_verified: true,
    verification_status: 'VERIFIED',
    verified_at: '2025-01-10T10:00:00.000Z',
    registration_number: 'TN-DENT-2773-02',
    registration_authority: 'Tamil Nadu Dental Council',
    consultation_duration: '25 min',
    clinic_affiliations: ['Moon Dental Clinic'],
    procedures: ['Dental Cleaning', 'Dental Filling', 'Tooth Extraction'],
    schedule: defaultSchedule,
    created_at: existingDoc2?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  memoryDb.doctors.set(DOC_2_ID, doc2Entity);
  memoryDb.doctors.setAlias('doc-merlin-rajan-2773', DOC_2_ID);
  memoryDb.doctors.setAlias('dr-merlin-rajan', DOC_2_ID);
  memoryDb.doctors.setAlias('dr.merlin.rajan@moondental.test', DOC_2_ID);
  memoryDb.doctors.setAlias('dr.merlin@moondental.test', DOC_2_ID);

  // 5. Doctor-Clinic Assignments (Many-to-Many Model)
  await DoctorClinicAssignmentModel.assign(DOC_1_ID, CLINIC_ID, 'Dentistry');
  await DoctorClinicAssignmentModel.assign(DOC_2_ID, CLINIC_ID, 'Dentistry');

  // 6. Map procedures in DoctorProcedureModel
  for (const proc of doc1Entity.procedures || []) {
    await DoctorProcedureModel.addProcedure(DOC_1_ID, proc);
  }
  for (const proc of doc2Entity.procedures || []) {
    await DoctorProcedureModel.addProcedure(DOC_2_ID, proc);
  }

  // 7. Add Clinic Assistant user for Moon Dental Clinic (Villivakkam)
  const existingAsst = memoryDb.assistants.get(ASST_ID);
  const assistantEntity: AssistantEntity = {
    id: ASST_ID,
    name: 'Moon Dental Assistant',
    email: 'assistant2773@demo.medlink.test',
    phone: '+91 9000002773',
    password_hash: existingAsst?.password_hash || asstPassHash,
    clinic_id: CLINIC_ID,
    clinic_name: 'Moon Dental Clinic',
    location: '28/15, Sannathi Street, Villivakkam, Chennai',
    staff_id: 'STAFF-MDC-2773',
    initials: 'MD',
    role: 'CLINIC_ADMIN',
    notifications_enabled: true,
    theme_preference: 'system',
    created_at: existingAsst?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  memoryDb.assistants.set(ASST_ID, assistantEntity);
  memoryDb.assistants.setAlias('assistant2773@demo.medlink.test', ASST_ID);
  memoryDb.assistants.setAlias('assistant2773', ASST_ID);

  // 8. Add basic pharmacy items for Moon Dental Clinic (Villivakkam) if none exist
  const existingPharm = Array.from(memoryDb.pharmacy_inventory.values()).filter(
    (item: any) => item.clinic_id === CLINIC_ID
  );
  if (existingPharm.length === 0) {
    const rx1 = {
      id: 'rx-2773-amox-01',
      clinic_id: CLINIC_ID,
      sku: 'MED-DENT-AMOX-500',
      name: 'Amoxicillin 500mg',
      generic_name: 'Amoxicillin',
      category: 'Antibiotics',
      dosage_form: 'Capsule',
      strength: '500mg',
      batch_number: 'BATCH-2773-AMOX-26A',
      expiry_date: '2027-06-30',
      quantity: 50,
      min_stock_level: 15,
      reorder_quantity: 50,
      unit_price: 8.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const rx2 = {
      id: 'rx-2773-dolo-01',
      clinic_id: CLINIC_ID,
      sku: 'MED-DENT-DOLO-650',
      name: 'Paracetamol 650mg (Dolo)',
      generic_name: 'Paracetamol',
      category: 'Analgesics',
      dosage_form: 'Tablet',
      strength: '650mg',
      batch_number: 'BATCH-2773-DOLO-26B',
      expiry_date: '2027-12-31',
      quantity: 80,
      min_stock_level: 20,
      reorder_quantity: 100,
      unit_price: 3.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.pharmacy_inventory.set(rx1.id, rx1);
    memoryDb.pharmacy_inventory.set(rx2.id, rx2);
  }

  // 9. Persist all changes safely to disk
  saveStateToFile();

  console.log(`✅ Additively seeded Moon Dental Clinic (Villivakkam, Clinic #2773)`);
  console.log(`   Internal ID: ${CLINIC_ID}`);
  console.log(`   Address: 28/15, Sannathi Street, Villivakkam, Chennai, Tamil Nadu 600082`);
  console.log(`   Doctors: Dr. Alagu Vimalesh (${DOC_1_ID}), Dr. Merlin Rajan (${DOC_2_ID})`);
  console.log(`   Assistant: assistant2773@demo.medlink.test`);

  return {
    success: true,
    clinicId: CLINIC_ID,
    clinicNumber: CLINIC_NUM,
    clinicName: 'Moon Dental Clinic',
    doctorsAdded: [DOC_1_ID, DOC_2_ID],
    assignmentsAdded: [`${DOC_1_ID}->${CLINIC_ID}`, `${DOC_2_ID}->${CLINIC_ID}`],
    alreadyExisted,
  };
}

// Allow standalone script execution via: npx ts-node src/database/seedMoonDental.ts
if (require.main === module) {
  seedMoonDentalVillivakkam()
    .then((res) => {
      console.log('Result:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Additive seed failed:', err);
      process.exit(1);
    });
}
