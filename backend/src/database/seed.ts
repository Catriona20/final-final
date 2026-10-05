import bcrypt from 'bcryptjs';
import { memoryDb, saveStateToFile } from './db';
import { PatientEntity, ClinicEntity, DoctorEntity, DepartmentEntity, AppointmentEntity, DoctorClinicAssignmentModel } from './models';
import { timeService, CLINIC_TIMEZONE } from '../services/timeService';
import { seedMoonDentalVillivakkam } from './seedMoonDental';

export interface SeedSummary {
  patientsCount: number;
  clinicsCount: number;
  doctorsCount: number;
  assistantsCount: number;
  appointmentsCount: number;
  queuesCount: number;
  consultationsCount: number;
  prescriptionsCount: number;
  medicalReportsCount: number;
  totalCount: number;
  duplicateIds: number;
}

export const seedDatabase = async (): Promise<SeedSummary> => {
  console.log('🌱 Seeding MedLink presentation dataset (220 relationally connected records)...');

  // Reset in-memory DB collections to ensure deterministic clean state
  for (const key of Object.keys(memoryDb) as (keyof typeof memoryDb)[]) {
    if (memoryDb[key] && typeof (memoryDb[key] as any).clear === 'function') {
      (memoryDb[key] as any).clear();
    }
  }

  const todayStr = timeService.getTodayDateString();

  // Common password hashes
  const genericPassHash = await bcrypt.hash('password123', 10);
  const docPassHash = await bcrypt.hash('Doctor@2001', 10);
  const asstPassHash = await bcrypt.hash('Clinic@3001', 10);

  // ============================================================
  // 1. SEED 20 REALISTIC PATIENT DEMO ACCOUNTS (Indian / Chennai Demographics)
  // ============================================================
  const patientProfiles: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    age: number;
    gender: string;
    blood: string;
    locality: string;
    address: string;
    contact: string;
    spec: string;
    doc: string;
  }> = [
    { id: 'pat-demo-01', name: 'Aarav Sharma', email: 'patient01@demo.medlink.test', phone: '+91 9000000001', age: 32, gender: 'Male', blood: 'B+', locality: 'Mylapore', address: '24, Luz Church Road, Mylapore, Chennai', contact: '+91 9000000091 (Pooja Sharma - Spouse)', spec: 'Dentistry', doc: 'Dr. Arun Kumar' },
    { id: 'pat-demo-02', name: 'Sneha Patel', email: 'patient02@demo.medlink.test', phone: '+91 9000000002', age: 29, gender: 'Female', blood: 'O+', locality: 'Adyar', address: '12, Gandhi Nagar 1st Main Rd, Adyar, Chennai', contact: '+91 9000000092 (Ramesh Patel - Father)', spec: 'General Medicine', doc: 'Dr. Priya Sharma' },
    { id: 'pat-demo-03', name: 'Rajesh Kumar', email: 'patient03@demo.medlink.test', phone: '+91 9000000003', age: 52, gender: 'Male', blood: 'A+', locality: 'T Nagar', address: '18, Venkatnarayana Road, T Nagar, Chennai', contact: '+91 9000000093 (Kavita Kumar - Spouse)', spec: 'Cardiology', doc: 'Dr. Karthik Raman' },
    { id: 'pat-demo-04', name: 'Priya Raman', email: 'patient04@demo.medlink.test', phone: '+91 9000000004', age: 28, gender: 'Female', blood: 'AB+', locality: 'Guindy', address: '154, Mount Road, Guindy, Chennai', contact: '+91 9000000094 (Maya Raman - Mother)', spec: 'Pediatrics', doc: 'Dr. Kavitha Reddy' },
    { id: 'pat-demo-05', name: 'Vikram Malhotra', email: 'patient05@demo.medlink.test', phone: '+91 9000000005', age: 45, gender: 'Male', blood: 'O-', locality: 'Velachery', address: '42, 100 Feet Bypass Road, Velachery, Chennai', contact: '+91 9000000095 (Deepak Malhotra - Brother)', spec: 'Dermatology', doc: 'Dr. Priya Nair' },
    { id: 'pat-demo-06', name: 'Ananya Iyer', email: 'patient06@demo.medlink.test', phone: '+91 9000000006', age: 31, gender: 'Female', blood: 'B-', locality: 'Anna Nagar', address: 'Plot 102, 2nd Avenue, Anna Nagar West, Chennai', contact: '+91 9000000096 (Raghav Iyer - Spouse)', spec: 'ENT', doc: 'Dr. Venkat Raman' },
    { id: 'pat-demo-07', name: 'Rahul Verma', email: 'patient07@demo.medlink.test', phone: '+91 9000000007', age: 38, gender: 'Male', blood: 'A-', locality: 'R.A. Puram', address: '77, Chamiers Road, R.A. Puram, Chennai', contact: '+91 9000000097 (Lavanya Verma - Spouse)', spec: 'Orthopedics', doc: 'Dr. Aditya Rao' },
    { id: 'pat-demo-08', name: 'Pooja Nair', email: 'patient08@demo.medlink.test', phone: '+91 9000000008', age: 26, gender: 'Female', blood: 'B+', locality: 'Kilpauk', address: '33, Ormes Road, Kilpauk, Chennai', contact: '+91 9000000098 (Sarala Nair - Mother)', spec: 'Gynecology', doc: 'Dr. Radha Sundaram' },
    { id: 'pat-demo-09', name: 'Rahul Menon', email: 'patient09@demo.medlink.test', phone: '+91 9000000009', age: 33, gender: 'Male', blood: 'O-', locality: 'Mylapore', address: '55, Kutchery Road, Mylapore, Chennai', contact: '+91 9000000099 (Deepa Menon - Sister)', spec: 'Dentistry', doc: 'Dr. Arun Kumar' },
    { id: 'pat-demo-10', name: 'Priya Balaji', email: 'patient10@demo.medlink.test', phone: '+91 9000000010', age: 58, gender: 'Female', blood: 'B+', locality: 'Perungudi', address: '82, OMR Phase 1, Perungudi, Chennai', contact: '+91 9000000010 (Balaji Varadan - Spouse)', spec: 'Cardiology', doc: 'Dr. Karthik Raman' },
    { id: 'pat-demo-11', name: 'Nithya Raj', email: 'patient11@demo.medlink.test', phone: '+91 9000000011', age: 27, gender: 'Female', blood: 'A+', locality: 'OMR', address: '104, Rajiv Gandhi Salai, Thoraipakkam, Chennai', contact: '+91 9000000011 (Rajasekar M - Father)', spec: 'General Medicine', doc: 'Dr. Priya Sharma' },
    { id: 'pat-demo-12', name: 'Sanjay Prakash', email: 'patient12@demo.medlink.test', phone: '+91 9000000012', age: 49, gender: 'Male', blood: 'O+', locality: 'Sholinganallur', address: '33, Medavakkam High Road, Sholinganallur, Chennai', contact: '+91 9000000012 (Usha Prakash - Spouse)', spec: 'Orthopedics', doc: 'Dr. Aditya Rao' },
    { id: 'pat-demo-13', name: 'Deepa Sundaram', email: 'patient13@demo.medlink.test', phone: '+91 9000000013', age: 34, gender: 'Female', blood: 'B+', locality: 'Tambaram', address: '18, GST Road, West Tambaram, Chennai', contact: '+91 9000000013 (Sundaram V - Father)', spec: 'Dermatology', doc: 'Dr. Priya Nair' },
    { id: 'pat-demo-14', name: 'Vikram Seth', email: 'patient14@demo.medlink.test', phone: '+91 9000000014', age: 44, gender: 'Male', blood: 'AB-', locality: 'Chromepet', address: '47, Radha Nagar Main Rd, Chromepet, Chennai', contact: '+91 9000000014 (Deepak Seth - Brother)', spec: 'ENT', doc: 'Dr. Venkat Raman' },
    { id: 'pat-demo-15', name: 'Sunita Reddy', email: 'patient15@demo.medlink.test', phone: '+91 9000000015', age: 61, gender: 'Female', blood: 'A+', locality: 'Guindy', address: '12, Race Course Road, Guindy, Chennai', contact: '+91 9000000015 (Varun Reddy - Son)', spec: 'Cardiology', doc: 'Dr. Karthik Raman' },
    { id: 'pat-demo-16', name: 'Suresh Menon', email: 'patient16@demo.medlink.test', phone: '+91 9000000016', age: 63, gender: 'Male', blood: 'B+', locality: 'Kilpauk', address: '25, Ormes Road, Kilpauk, Chennai', contact: '+91 9000000016 (Radhika Menon - Spouse)', spec: 'General Medicine', doc: 'Dr. Priya Sharma' },
    { id: 'pat-demo-17', name: 'Neha Agarwal', email: 'patient17@demo.medlink.test', phone: '+91 9000000017', age: 30, gender: 'Female', blood: 'O-', locality: 'Royapettah', address: '71, Whites Road, Royapettah, Chennai', contact: '+91 9000000017 (Sangeeta Agarwal - Mother)', spec: 'Gynecology', doc: 'Dr. Radha Sundaram' },
    { id: 'pat-demo-18', name: 'Arjun Rao', email: 'patient18@demo.medlink.test', phone: '+91 9000000018', age: 36, gender: 'Male', blood: 'A+', locality: 'Besant Nagar', address: '15, 5th Avenue, Besant Nagar, Chennai', contact: '+91 9000000018 (Priya Rao - Sister)', spec: 'Ophthalmology', doc: 'Dr. Ramesh Chandran' },
    { id: 'pat-demo-19', name: 'Kavita Deshmukh', email: 'patient19@demo.medlink.test', phone: '+91 9000000019', age: 41, gender: 'Female', blood: 'AB+', locality: 'Thiruvanmiyur', address: '22, East Coast Road, Thiruvanmiyur, Chennai', contact: '+91 9000000019 (Nitin Deshmukh - Spouse)', spec: 'Neurology', doc: 'Dr. Arvind Swaminathan' },
    { id: 'pat-demo-20', name: 'Manoj Pillai', email: 'patient20@demo.medlink.test', phone: '+91 9000000020', age: 52, gender: 'Male', blood: 'B-', locality: 'Ambattur', address: '93, MTH Road, Ambattur Industrial Estate, Chennai', contact: '+91 9000000020 (Usha Pillai - Spouse)', spec: 'Pediatrics', doc: 'Dr. Kavitha Reddy' },
    { id: 'pat-101', name: 'Sarah Jenkins', email: 'sarah.jenkins@example.com', phone: '+91 98401 23456', age: 34, gender: 'Female', blood: 'O+', locality: 'Mylapore', address: '24, Luz Church Road, Mylapore, Chennai', contact: '+91 98401 23499 (David Jenkins - Spouse)', spec: 'Dentistry', doc: 'Dr. Ananya Deshmukh' },
    { id: 'pat-102', name: 'Priya Sharma', email: 'priya.sharma@example.com', phone: '+91 98401 23457', age: 29, gender: 'Female', blood: 'A+', locality: 'Anna Nagar', address: '88 Healthcare Blvd, Anna Nagar West, Chennai', contact: '+91 98401 23498 (Ramesh Sharma - Father)', spec: 'General Medicine', doc: 'Dr. Priya Sharma' },
    { id: 'pat-demo-ramesh-emergency', name: 'Emergency Patient Ramesh', email: 'ramesh.emergency@demo.medlink.test', phone: '+91 9000000039', age: 26, gender: 'Male', blood: 'O+', locality: 'Villivakkam', address: '14, Market Road, Villivakkam, Chennai', contact: '+91 9000000099 (Suresh Kumar - Father)', spec: 'Dentistry', doc: 'Dr. Arun Kumar' },
  ];

  for (let idx = 0; idx < patientProfiles.length; idx++) {
    const p = patientProfiles[idx];
    let patPassword = 'password123';
    const match = p.id.match(/^pat-demo-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= 1 && num <= 20) {
        patPassword = `Demo@${1000 + num}`;
      }
    }
    const passHash = await bcrypt.hash(patPassword, 10);

    const patientEntity: PatientEntity = {
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      password_hash: passHash,
      blood_group: p.blood,
      age: p.age,
      gender: p.gender,
      avatar: `https://images.unsplash.com/photo-${1500000000000 + p.age * 12345}?auto=format&fit=crop&q=80&w=200`,
      address: p.address,
      emergency_contact: p.contact,
      preferred_specialization: p.spec,
      preferred_doctor: p.doc,
      notifications_enabled: true,
      theme_preference: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.patients.set(p.id, patientEntity);
  }

  // Set backward-compatible patient aliases (1 to 20)
  for (let i = 1; i <= 20; i++) {
    const pad = String(i).padStart(2, '0');
    const canonId = `pat-demo-${pad}`;
    memoryDb.patients.setAlias(`patient-${pad}`, canonId);
    memoryDb.patients.setAlias(`patient-0${pad}`, canonId);
    memoryDb.patients.setAlias(`patient-${i}`, canonId);
    memoryDb.patients.setAlias(`pat-${pad}`, canonId);
    memoryDb.patients.setAlias(`pat-0${pad}`, canonId);
    memoryDb.patients.setAlias(`pat-${i}`, canonId);
    memoryDb.patients.setAlias(`patient${pad}@demo.medlink.test`, canonId);
  }

  // ============================================================
  // 1B. SEED 20 CLINIC ASSISTANTS (One for each primary clinic)
  // ============================================================
  const demoAssistantsList = [
    { id: 'asst-demo-01', name: 'Sheryl Thomas', email: 'assistant01@demo.medlink.test', phone: '+91 9000000021', clinicId: 'c-demo-moon-01', clinicName: 'Moon Dental Clinic', staffId: 'STAFF-MDC-01', initials: 'ST' },
    { id: 'asst-demo-02', name: 'Rahul Joseph', email: 'assistant02@demo.medlink.test', phone: '+91 9000000022', clinicId: 'c-demo-apollo-02', clinicName: 'Apollo Family Care Centre', staffId: 'STAFF-AFC-02', initials: 'RJ' },
    { id: 'asst-demo-03', name: 'Nisha Kumar', email: 'assistant03@demo.medlink.test', phone: '+91 9000000023', clinicId: 'c-demo-greenlife-03', clinicName: "GreenLife Women's & Maternity Clinic", staffId: 'STAFF-GLW-03', initials: 'NK' },
    { id: 'asst-demo-04', name: 'Ravi Shankar', email: 'assistant04@demo.medlink.test', phone: '+91 9000000024', clinicId: 'c-demo-heart-04', clinicName: 'Chennai Heart & Vascular Centre', staffId: 'STAFF-CHV-04', initials: 'RS' },
    { id: 'asst-demo-05', name: 'Deepak Raj', email: 'assistant05@demo.medlink.test', phone: '+91 9000000025', clinicId: 'c-demo-vision-05', clinicName: 'VisionPlus Eye Centre', staffId: 'STAFF-VPE-05', initials: 'DR' },
    { id: 'asst-demo-06', name: 'Lavanya S', email: 'assistant06@demo.medlink.test', phone: '+91 9000000026', clinicId: 'c-demo-ortho-06', clinicName: 'OrthoCare Chennai', staffId: 'STAFF-OCC-06', initials: 'LS' },
    { id: 'asst-demo-07', name: 'Joseph Mathew', email: 'assistant07@demo.medlink.test', phone: '+91 9000000027', clinicId: 'c-demo-skin-07', clinicName: 'SkinSphere Dermatology', staffId: 'STAFF-SSD-07', initials: 'JM' },
    { id: 'asst-demo-08', name: 'Priyanka Das', email: 'assistant08@demo.medlink.test', phone: '+91 9000000028', clinicId: 'c-demo-neuro-08', clinicName: 'NeuroBridge Care Clinic', staffId: 'STAFF-NBC-08', initials: 'PD' },
    { id: 'asst-demo-09', name: 'Karthik V', email: 'assistant09@demo.medlink.test', phone: '+91 9000000029', clinicId: 'c-demo-nova-09', clinicName: 'Nova ENT Care', staffId: 'STAFF-PMS-09', initials: 'KV' },
    { id: 'asst-demo-10', name: 'Divya Raj', email: 'assistant10@demo.medlink.test', phone: '+91 9000000030', clinicId: 'c-demo-smile-10', clinicName: 'Smile & Child Pediatric Centre', staffId: 'STAFF-SCP-10', initials: 'DR' },
    { id: 'asst-demo-11', name: 'Suresh Nair', email: 'assistant11@demo.medlink.test', phone: '+91 9000000031', clinicId: 'c-demo-pulmo-11', clinicName: 'CarePoint Pulmonology', staffId: 'STAFF-CPP-11', initials: 'SN' },
    { id: 'asst-demo-12', name: 'Meenakshi R', email: 'assistant12@demo.medlink.test', phone: '+91 9000000032', clinicId: 'c-demo-renal-12', clinicName: 'RenalCare Clinic', staffId: 'STAFF-RCC-12', initials: 'MR' },
    { id: 'asst-demo-13', name: 'Anand K', email: 'assistant13@demo.medlink.test', phone: '+91 9000000033', clinicId: 'c-demo-digestive-13', clinicName: 'Digestive Health Centre', staffId: 'STAFF-DHC-13', initials: 'AK' },
    { id: 'asst-demo-14', name: 'Shalini G', email: 'assistant14@demo.medlink.test', phone: '+91 9000000034', clinicId: 'c-demo-endowell-14', clinicName: 'EndoWell Clinic', staffId: 'STAFF-EWC-14', initials: 'SG' },
    { id: 'asst-demo-15', name: 'Vignesh B', email: 'assistant15@demo.medlink.test', phone: '+91 9000000035', clinicId: 'c-demo-uro-15', clinicName: 'UroCare Chennai', staffId: 'STAFF-UCC-15', initials: 'VB' },
    { id: 'asst-demo-16', name: 'Reshma T', email: 'assistant16@demo.medlink.test', phone: '+91 9000000036', clinicId: 'c-demo-physio-16', clinicName: 'PhysioMotion Rehabilitation', staffId: 'STAFF-PMR-16', initials: 'RT' },
    { id: 'asst-demo-17', name: 'Arjun P', email: 'assistant17@demo.medlink.test', phone: '+91 9000000037', clinicId: 'c-demo-mind-17', clinicName: 'MindCare Psychiatry Centre', staffId: 'STAFF-MPC-17', initials: 'AP' },
    { id: 'asst-demo-18', name: 'Pooja M', email: 'assistant18@demo.medlink.test', phone: '+91 9000000038', clinicId: 'c-demo-besant-18', clinicName: 'Besant Nagar Coastal Health Care', staffId: 'STAFF-BNC-18', initials: 'PM' },
    { id: 'asst-demo-19', name: 'Manoj S', email: 'assistant19@demo.medlink.test', phone: '+91 9000000039', clinicId: 'c-demo-avadi-18', clinicName: 'Avadi Central Care Hospital', staffId: 'STAFF-ACC-19', initials: 'MS' },
    { id: 'asst-demo-20', name: 'Kavitha R', email: 'assistant20@demo.medlink.test', phone: '+91 9000000040', clinicId: 'c-demo-royapuram-20', clinicName: 'Royapuram Community Health Clinic', staffId: 'STAFF-RCH-20', initials: 'KR' },
  ];

  for (let i = 0; i < demoAssistantsList.length; i++) {
    const asst = demoAssistantsList[i];
    const asstPass = `Clinic@${3001 + i}`;
    const asstHash = await bcrypt.hash(asstPass, 10);
    const asstEntity = {
      id: asst.id,
      name: asst.name,
      email: asst.email,
      phone: asst.phone,
      password_hash: asstHash,
      role: 'CLINIC_ADMIN',
      clinic_id: asst.clinicId,
      clinic_name: asst.clinicName,
      staff_id: asst.staffId,
      initials: asst.initials,
      notifications_enabled: true,
      theme_preference: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryDb.assistants.set(asst.id, asstEntity);
    memoryDb.patients.set(asst.id, asstEntity as any);

    const padIdx = String(i + 1).padStart(2, '0');
    memoryDb.assistants.setAlias(asst.email, asst.id);
    memoryDb.assistants.setAlias(`assistant-${padIdx}`, asst.id);
    memoryDb.assistants.setAlias(`assistant-0${padIdx}`, asst.id);
    memoryDb.assistants.setAlias(`asst-${padIdx}`, asst.id);

    memoryDb.patients.setAlias(asst.email, asst.id);
    memoryDb.patients.setAlias(`assistant-${padIdx}`, asst.id);
    memoryDb.patients.setAlias(`assistant-0${padIdx}`, asst.id);
    memoryDb.patients.setAlias(`asst-${padIdx}`, asst.id);
  }

  // Saved location for pat-demo-01 & pat-demo-02
  memoryDb.saved_locations.set('loc-demo-01', {
    id: 'loc-demo-01',
    patient_id: 'pat-demo-01',
    label: 'Home',
    name: 'Mylapore Residence',
    locality: 'Mylapore, Chennai',
    latitude: 13.0338,
    longitude: 80.2677,
    address: '24, Luz Church Road, Mylapore, Chennai',
    created_at: new Date().toISOString(),
  });
  memoryDb.saved_locations.set('loc-demo-02', {
    id: 'loc-demo-02',
    patient_id: 'pat-demo-02',
    label: 'Home',
    name: 'Adyar Residence',
    locality: 'Adyar, Chennai',
    latitude: 13.0012,
    longitude: 80.2565,
    address: '12, Gandhi Nagar 1st Main Rd, Adyar, Chennai',
    created_at: new Date().toISOString(),
  });

  // ============================================================
  // 2. SEED DEPARTMENTS CATALOG (10 Core Healthcare Specialties + 7 Clinical Subspecialties)
  // ============================================================
  const departmentsData = [
    { id: 'dept-gen', name: 'General Medicine', icon: '🩺', desc: 'Comprehensive adult health, acute viral fever, metabolic screening, and preventive primary care', keywords: ['General Physician', 'Fever', 'Cough', 'Internal Medicine', 'Primary Care', 'Family Doctor'], symptoms: ['Fever', 'Fatigue', 'Cold / Cough', 'Body Ache', 'Headache'] },
    { id: 'dept-cardio', name: 'Cardiology', icon: '❤️', desc: 'Heart health, resting ECG, arterial pressure, lipid profiles, and cardiovascular diagnostics', keywords: ['Cardiologist', 'Heart', 'ECG', 'Hypertension', 'Chest Pain', 'Cardiac Consultation'], symptoms: ['Chest Pain', 'Palpitations', 'High BP', 'Shortness of Breath', 'Dizziness'] },
    { id: 'dept-derma', name: 'Dermatology', icon: '✨', desc: 'Skin rashes, acne treatment, eczema, psoriasis, cutaneous allergy, and dermatosurgery', keywords: ['Dermatologist', 'Skin', 'Acne', 'Rash', 'Eczema', 'Hair Fall'], symptoms: ['Skin Rash', 'Severe Acne', 'Itching / Redness', 'Eczema Flare', 'Scalp Flaking'] },
    { id: 'dept-opht', name: 'Ophthalmology', icon: '👁️', desc: 'Visual acuity, slit-lamp bio-microscopy, cataract checks, glaucoma, and refractive corrections', keywords: ['Ophthalmologist', 'Eye Specialist', 'Vision', 'Cataract', 'Glaucoma', 'Eye Irritation'], symptoms: ['Eye Irritation', 'Blurred Vision', 'Red Eyes', 'Watery Eyes', 'Eye Strain'] },
    { id: 'dept-dent', name: 'Dentistry', icon: '🦷', desc: 'Oral hygiene, toothache, root canal therapy, cavity fillings, cleaning & dental restorations', keywords: ['Dentist', 'Toothache', 'Teeth', 'Root Canal', 'Cleaning', 'Cavity', 'Dental Filling', 'Tooth Extraction'], symptoms: ['Toothache', 'Tooth Sensitivity', 'Bleeding Gums', 'Jaw Pain', 'Cavity Pain'] },
    { id: 'dept-ent', name: 'ENT', icon: '👂', desc: 'Ear infections, otoscopy, sinus disorders, throat discomfort, and audiometric evaluations', keywords: ['ENT Specialist', 'Ear Pain', 'Ear Infection', 'Sinus', 'Throat', 'Hearing'], symptoms: ['Ear Pain', 'Ear Infection', 'Sore Throat', 'Nasal Blockage', 'Sinus Pressure'] },
    { id: 'dept-pedia', name: 'Pediatrics', icon: '👶', desc: 'Infant and child wellness, developmental milestones, pediatric fevers, and immunization', keywords: ['Pediatrician', 'Child Fever', 'Child Specialist', 'Vaccination', 'Infant Care'], symptoms: ['Child Fever', 'Pediatric Cough', 'Loss of Appetite', 'Child Vomiting'] },
    { id: 'dept-ortho', name: 'Orthopedics', icon: '🦴', desc: 'Bone fractures, joint pain, spine care, sports injuries, and arthritis management', keywords: ['Orthopedic', 'Bone', 'Joint Pain', 'Back Pain', 'Fracture', 'Knee Pain'], symptoms: ['Knee Pain', 'Lower Back Pain', 'Joint Swelling', 'Shoulder Stiffness'] },
    { id: 'dept-gyn', name: 'Gynecology', icon: '🌸', desc: 'Women\'s reproductive health, prenatal checkups, PCOS management, and hormonal evaluations', keywords: ['Gynecologist', 'Pregnancy', 'Obstetrics', 'PCOS', 'Women\'s Health', 'Maternity'], symptoms: ['Pregnancy Checkup', 'Pelvic Pain', 'Irregular Periods', 'Hormonal Imbalance'] },
    { id: 'dept-neuro', name: 'Neurology', icon: '🧠', desc: 'Cranial nerve evaluation, migraine therapy, neuro-vascular health, and vertigo management', keywords: ['Neurologist', 'Migraine', 'Brain', 'Headache', 'Nerve', 'Dizziness', 'Vertigo'], symptoms: ['Headache and Dizziness', 'Severe Migraine', 'Numbness / Tingling', 'Vertigo', 'Tremors'] },
    { id: 'dept-pulmo', name: 'Pulmonology', icon: '🫁', desc: 'Pulmonary function, asthma management, spirometry, chronic cough, and bronchial airflow', keywords: ['Pulmonologist', 'Breathing Problem', 'Asthma', 'Lung', 'Chronic Cough', 'Wheezing'], symptoms: ['Breathing Problem', 'Shortness of Breath', 'Chronic Cough', 'Wheezing', 'Chest Congestion'] },
    { id: 'dept-nephro', name: 'Nephrology', icon: '🧪', desc: 'Renal clearance profiles, chronic kidney disease, proteinuria, and fluid-electrolyte balance', keywords: ['Nephrologist', 'Kidney Problem', 'Renal', 'Dialysis', 'Creatinine'], symptoms: ['Kidney Problem', 'Foamy Urine', 'Decreased Urine Output', 'Swollen Ankles / Edema'] },
    { id: 'dept-gastro', name: 'Gastroenterology', icon: '🍽️', desc: 'Digestive tract health, gastric acidity, GERD, abdominal discomfort, and hepatobiliary care', keywords: ['Gastroenterologist', 'Stomach Pain', 'Acidity', 'GERD', 'Digestive Health', 'Gastritis'], symptoms: ['Stomach Pain', 'Severe Acid Reflux', 'Bloating / Indigestion', 'Nausea / Vomiting'] },
    { id: 'dept-endo', name: 'Endocrinology', icon: '⚖️', desc: 'Glycemic profiling, Type 1/2 diabetes therapy, thyroid disorders, and metabolic regulation', keywords: ['Endocrinologist', 'Diabetes', 'Thyroid', 'Blood Sugar', 'Hormone', 'Metabolic'], symptoms: ['Diabetes Checkup', 'Fatigue / Weight Change', 'Thyroid Swelling', 'Frequent Urination'] },
    { id: 'dept-uro', name: 'Urology', icon: '💧', desc: 'Urinary tract health, lithotripsy for kidney stones, prostate profiling, and uro-diagnostics', keywords: ['Urologist', 'Kidney Stone', 'Urine Problem', 'Urinary Infection', 'Prostate'], symptoms: ['Urine Problem', 'Kidney Stone Flank Pain', 'Burning Urination', 'Urinary Hesitancy'] },
    { id: 'dept-physio', name: 'Physiotherapy', icon: '🏃', desc: 'Musculoskeletal conditioning, sports injury recovery, postural alignment, and physical therapy', keywords: ['Physiotherapist', 'Physiotherapy', 'Back Pain Physiotherapy', 'Rehab', 'Mobility'], symptoms: ['Back Pain Physiotherapy', 'Post-Op Knee Stiffness', 'Neck & Shoulder Spasm', 'Sports Sprain'] },
    { id: 'dept-psych', name: 'Psychiatry', icon: '🧘', desc: 'Comprehensive psychiatric evaluation, mental wellness support, psychotherapy, and clinical care', keywords: ['Psychiatrist', 'Anxiety', 'Depression', 'Stress', 'Insomnia', 'Mental Health'], symptoms: ['Anxiety', 'Panic Attacks', 'Chronic Stress', 'Severe Insomnia', 'Persistent Low Mood'] },
  ];

  for (const d of departmentsData) {
    memoryDb.departments.set(d.id, {
      id: d.id,
      name: d.name,
      icon: d.icon,
      description: d.desc,
      clinic_count: 5,
      doctor_count: 8,
      keywords: d.keywords,
      popular_symptoms: d.symptoms,
    });
  }

  // ============================================================
  // 3. SEED ALL 17 CHENNAI SPECIALTY DEMO CLINICS + LOCALITY CLINICS
  // ============================================================
  const demoClinics: ClinicEntity[] = [
    { id: 'c-demo-moon-01', name: 'Moon Dental Clinic', address: '24 Luz Church Road, Mylapore, Chennai', latitude: 13.0338, longitude: 80.2677, rating: 4.97, reviews_count: 320, image: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80', category: 'Dentistry', doctors_count: 3, open_hours: '09:00 AM – 08:30 PM', phone: '+91 44 2498 0001', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹400', departments: ['Dentistry'], created_at: new Date().toISOString() },
    { id: 'c-demo-apollo-02', name: 'Apollo Family Care Centre', address: '88 Healthcare Blvd, Anna Nagar, Chennai', latitude: 13.0850, longitude: 80.2101, rating: 4.92, reviews_count: 410, image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80', category: 'General Medicine', doctors_count: 2, open_hours: '08:00 AM – 09:00 PM', phone: '+91 44 2621 0002', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹500', departments: ['General Medicine'], created_at: new Date().toISOString() },
    { id: 'c-demo-greenlife-03', name: "GreenLife Women's Clinic", address: '25 Maternity Way, Kilpauk, Chennai', latitude: 13.0827, longitude: 80.2407, rating: 4.94, reviews_count: 215, image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80', category: 'Gynecology', doctors_count: 2, open_hours: '09:00 AM – 07:30 PM', phone: '+91 44 2641 0003', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹600', departments: ['Gynecology'], created_at: new Date().toISOString() },
    { id: 'c-demo-heart-04', name: 'Chennai Heart & Vascular Centre', address: '42 Cardio Boulevard, Nungambakkam, Chennai', latitude: 13.0569, longitude: 80.2425, rating: 4.98, reviews_count: 450, image: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80', category: 'Cardiology', doctors_count: 2, open_hours: '08:00 AM – 09:00 PM', phone: '+91 44 2821 0004', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹700', departments: ['Cardiology'], created_at: new Date().toISOString() },
    { id: 'c-demo-vision-05', name: 'VisionPlus Eye Centre', address: '19 Optics Road, T. Nagar, Chennai', latitude: 13.0418, longitude: 80.2341, rating: 4.93, reviews_count: 280, image: 'https://images.unsplash.com/photo-1580281657527-47f249e8f4df?auto=format&fit=crop&w=800&q=80', category: 'Ophthalmology', doctors_count: 2, open_hours: '09:00 AM – 08:00 PM', phone: '+91 44 2834 0005', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹450', departments: ['Ophthalmology'], created_at: new Date().toISOString() },
    { id: 'c-demo-ortho-06', name: 'OrthoCare Chennai', address: '56 Mount Road, Guindy, Chennai', latitude: 13.0112, longitude: 80.2195, rating: 4.90, reviews_count: 195, image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80', category: 'Orthopedics', doctors_count: 2, open_hours: '09:00 AM – 08:30 PM', phone: '+91 44 2661 0006', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹550', departments: ['Orthopedics'], created_at: new Date().toISOString() },
    { id: 'c-demo-skin-07', name: 'SkinSphere Dermatology', address: '14 Derma Plaza, Adyar, Chennai', latitude: 13.0078, longitude: 80.2567, rating: 4.95, reviews_count: 310, image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80', category: 'Dermatology', doctors_count: 2, open_hours: '09:30 AM – 08:00 PM', phone: '+91 44 2441 0007', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹500', departments: ['Dermatology'], created_at: new Date().toISOString() },
    { id: 'c-demo-neuro-08', name: 'NeuroBridge Clinic', address: '73 Neuro Street, Velachery, Chennai', latitude: 12.9815, longitude: 80.2180, rating: 4.96, reviews_count: 220, image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80', category: 'Neurology', doctors_count: 2, open_hours: '09:00 AM – 07:00 PM', phone: '+91 44 2235 0008', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹700', departments: ['Neurology'], created_at: new Date().toISOString() },
    { id: 'c-demo-nova-09', name: 'Nova ENT Care', address: '45 Madhavaram High Road, Perambur, Chennai', latitude: 13.1075, longitude: 80.2435, rating: 4.89, reviews_count: 185, image: 'https://images.unsplash.com/photo-1578496479914-7ef3b0193be3?auto=format&fit=crop&w=800&q=80', category: 'ENT', doctors_count: 2, open_hours: '09:00 AM – 08:00 PM', phone: '+91 44 2656 0009', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹450', departments: ['ENT'], created_at: new Date().toISOString() },
    { id: 'c-demo-smile-10', name: 'Smile & Child Pediatric Centre', address: '10 Pediatric Square, Porur, Chennai', latitude: 13.0382, longitude: 80.1565, rating: 4.97, reviews_count: 360, image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80', category: 'Pediatrics', doctors_count: 2, open_hours: '08:30 AM – 08:30 PM', phone: '+91 44 2476 0010', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹450', departments: ['Pediatrics'], created_at: new Date().toISOString() },
    { id: 'c-demo-pulmo-11', name: 'CarePoint Pulmonology', address: '61 Bronchial Way, Velachery, Chennai', latitude: 12.9759, longitude: 80.2212, rating: 4.94, reviews_count: 210, image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80', category: 'Pulmonology', doctors_count: 2, open_hours: '09:00 AM – 07:30 PM', phone: '+91 44 2244 0011', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹600', departments: ['Pulmonology'], created_at: new Date().toISOString() },
    { id: 'c-demo-renal-12', name: 'RenalCare Clinic', address: '18 Dialysis Enclave, Egmore, Chennai', latitude: 13.0826, longitude: 80.2607, rating: 4.95, reviews_count: 180, image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80', category: 'Nephrology', doctors_count: 2, open_hours: '08:00 AM – 08:00 PM', phone: '+91 44 2819 0012', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹650', departments: ['Nephrology'], created_at: new Date().toISOString() },
    { id: 'c-demo-digestive-13', name: 'Digestive Health Centre', address: '92 Gastro Street, Mylapore, Chennai', latitude: 13.0368, longitude: 80.2676, rating: 4.93, reviews_count: 240, image: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80', category: 'Gastroenterology', doctors_count: 2, open_hours: '09:00 AM – 08:00 PM', phone: '+91 44 2498 0013', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹550', departments: ['Gastroenterology'], created_at: new Date().toISOString() },
    { id: 'c-demo-endowell-14', name: 'EndoWell Clinic', address: '33 Hormone Avenue, Adyar, Chennai', latitude: 13.0033, longitude: 80.2550, rating: 4.94, reviews_count: 220, image: 'https://images.unsplash.com/photo-1578496479914-7ef3b0193be3?auto=format&fit=crop&w=800&q=80', category: 'Endocrinology', doctors_count: 2, open_hours: '08:30 AM – 07:30 PM', phone: '+91 44 2442 0014', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹600', departments: ['Endocrinology'], created_at: new Date().toISOString() },
    { id: 'c-demo-uro-15', name: 'UroCare Chennai', address: '47 Uro Complex, Saidapet, Chennai', latitude: 13.0213, longitude: 80.2231, rating: 4.92, reviews_count: 190, image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80', category: 'Urology', doctors_count: 2, open_hours: '09:00 AM – 08:30 PM', phone: '+91 44 2435 0015', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹650', departments: ['Urology'], created_at: new Date().toISOString() },
    { id: 'c-demo-physio-16', name: 'PhysioMotion Rehabilitation', address: '82 Movement Blvd, Koyambedu, Chennai', latitude: 13.0694, longitude: 80.1948, rating: 4.96, reviews_count: 215, image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80', category: 'Physiotherapy', doctors_count: 2, open_hours: '08:00 AM – 08:00 PM', phone: '+91 44 2479 0016', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹450', departments: ['Physiotherapy'], created_at: new Date().toISOString() },
    { id: 'c-demo-mind-17', name: 'MindCare Psychiatry Centre', address: '15 Serenity Road, Besant Nagar, Chennai', latitude: 12.9983, longitude: 80.2667, rating: 4.98, reviews_count: 250, image: 'https://images.unsplash.com/photo-1580281657527-47f249e8f4df?auto=format&fit=crop&w=800&q=80', category: 'Psychiatry', doctors_count: 2, open_hours: '10:00 AM – 08:00 PM', phone: '+91 44 2491 0017', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹800', departments: ['Psychiatry'], created_at: new Date().toISOString() },
    { id: 'c-demo-ramapuram-11', name: 'Ramapuram Family Medical Centre', address: '12 Mount Poonamallee High Rd, Ramapuram, Chennai', latitude: 13.0304, longitude: 80.1802, rating: 4.91, reviews_count: 175, image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80', category: 'Cardiology', doctors_count: 1, open_hours: '08:30 AM – 08:30 PM', phone: '+91 44 2496 0011', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹600', departments: ['Cardiology', 'General Medicine'], created_at: new Date().toISOString() },
    { id: 'c-demo-omr-12', name: 'OMR Health City Clinic', address: '104 Rajiv Gandhi Salai, Thoraipakkam, Chennai', latitude: 12.9348, longitude: 80.2312, rating: 4.93, reviews_count: 210, image: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80', category: 'General Medicine', doctors_count: 1, open_hours: '08:00 AM – 09:00 PM', phone: '+91 44 2450 0012', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹500', departments: ['General Medicine'], created_at: new Date().toISOString() },
    { id: 'c-demo-sholinganallur-13', name: 'Sholinganallur Family Healthcare', address: '33 Medavakkam High Rd, Sholinganallur, Chennai', latitude: 12.9010, longitude: 80.2279, rating: 4.88, reviews_count: 160, image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80', category: 'Orthopedics', doctors_count: 1, open_hours: '09:00 AM – 08:00 PM', phone: '+91 44 2453 0013', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹550', departments: ['Orthopedics'], created_at: new Date().toISOString() },
    { id: 'c-demo-tambaram-14', name: 'Tambaram Prime Healthcare', address: '18 GST Road, West Tambaram, Chennai', latitude: 12.9249, longitude: 80.1478, rating: 4.92, reviews_count: 230, image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80', category: 'Dermatology', doctors_count: 1, open_hours: '09:00 AM – 08:30 PM', phone: '+91 44 2226 0014', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹500', departments: ['Dermatology'], created_at: new Date().toISOString() },
    { id: 'c-demo-chromepet-15', name: 'Chromepet Medical Pavilion', address: '47 Radha Nagar Main Rd, Chromepet, Chennai', latitude: 12.9517, longitude: 80.1408, rating: 4.90, reviews_count: 190, image: 'https://images.unsplash.com/photo-1578496479914-7ef3b0193be3?auto=format&fit=crop&w=800&q=80', category: 'ENT', doctors_count: 1, open_hours: '09:00 AM – 08:00 PM', phone: '+91 44 2238 0015', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹450', departments: ['ENT'], created_at: new Date().toISOString() },
    { id: 'c-demo-pallavaram-16', name: 'Pallavaram Prime Health Clinic', address: '71 GST Road, Pallavaram, Chennai', latitude: 12.9675, longitude: 80.1491, rating: 4.94, reviews_count: 240, image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80', category: 'General Medicine', doctors_count: 1, open_hours: '08:00 AM – 09:00 PM', phone: '+91 44 2852 0017', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹500', departments: ['General Medicine'], created_at: new Date().toISOString() },
    { id: 'c-demo-ambattur-17', name: 'Ambattur Industrial Care Clinic', address: '93 MTH Road, Ambattur, Chennai', latitude: 13.1143, longitude: 80.1548, rating: 4.89, reviews_count: 150, image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80', category: 'Pediatrics', doctors_count: 1, open_hours: '08:30 AM – 08:00 PM', phone: '+91 44 2658 0016', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹450', departments: ['Pediatrics'], created_at: new Date().toISOString() },
    { id: 'c-demo-besant-18', name: 'Besant Nagar Coastal Health Care', address: '15 5th Avenue, Besant Nagar, Chennai', latitude: 13.0002, longitude: 80.2667, rating: 4.96, reviews_count: 275, image: 'https://images.unsplash.com/photo-1580281657527-47f249e8f4df?auto=format&fit=crop&w=800&q=80', category: 'Ophthalmology', doctors_count: 1, open_hours: '09:00 AM – 08:00 PM', phone: '+91 44 2491 0018', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹500', departments: ['Ophthalmology'], created_at: new Date().toISOString() },
    { id: 'c-demo-avadi-18', name: 'Avadi Central Care Hospital', address: '28 CTH Road, Avadi, Chennai', latitude: 13.1147, longitude: 80.1008, rating: 4.95, reviews_count: 260, image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80', category: 'Neurology', doctors_count: 1, open_hours: '09:00 AM – 07:30 PM', phone: '+91 44 2448 0019', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹650', departments: ['Neurology'], created_at: new Date().toISOString() },
    { id: 'c-demo-royapuram-20', name: 'Royapuram Community Health Clinic', address: '64 Mannarsamy Koil St, Royapuram, Chennai', latitude: 13.1137, longitude: 80.2952, rating: 4.88, reviews_count: 165, image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80', category: 'General Medicine', doctors_count: 1, open_hours: '08:30 AM – 08:00 PM', phone: '+91 44 2595 0020', is_open: true, is_popular: true, is_nearby: true, wait_time: '0 min wait', consultation_fee: '₹400', departments: ['General Medicine'], created_at: new Date().toISOString() },
  ];

  demoClinics.forEach((c) => {
    memoryDb.clinics.set(c.id, c);
  });

  // Set backward-compatibility aliases on memoryDb.clinics
  memoryDb.clinics.setAlias('c1', 'c-demo-apollo-02');
  memoryDb.clinics.setAlias('c2', 'c-demo-apollo-02');
  memoryDb.clinics.setAlias('c3', 'c-demo-greenlife-03');
  memoryDb.clinics.setAlias('c4', 'c-demo-heart-04');
  memoryDb.clinics.setAlias('c5', 'c-demo-moon-01');
  memoryDb.clinics.setAlias('c-demo', 'c-demo-moon-01');
  memoryDb.clinics.setAlias('c-demo-multi-02', 'c-demo-apollo-02');
  memoryDb.clinics.setAlias('c-demo-heart-03', 'c-demo-heart-04');
  memoryDb.clinics.setAlias('c-demo-rainbow-04', 'c-demo-smile-10');
  memoryDb.clinics.setAlias('c-demo-skin-05', 'c-demo-skin-07');
  memoryDb.clinics.setAlias('c-demo-ent-06', 'c-demo-nova-09');
  memoryDb.clinics.setAlias('c-demo-nova-09', 'c-demo-nova-09');
  memoryDb.clinics.setAlias('c-demo-perambur-19', 'c-demo-nova-09');
  memoryDb.clinics.setAlias('c-demo-perungudi-11', 'c-demo-ramapuram-11');
  memoryDb.clinics.setAlias('c-demo-ambattur-16', 'c-demo-ambattur-17');
  memoryDb.clinics.setAlias('c-demo-royapettah-17', 'c-demo-pallavaram-16');
  memoryDb.clinics.setAlias('c-demo-thiruvanmiyur-19', 'c-demo-avadi-18');
  memoryDb.clinics.setAlias('moon dental & medical clinic', 'c-demo-moon-01');
  memoryDb.clinics.setAlias('greenlife women\'s & maternity clinic', 'c-demo-greenlife-03');
  memoryDb.clinics.setAlias('neurobridge care clinic', 'c-demo-neuro-08');
  memoryDb.clinics.setAlias('perambur multi-specialty clinic', 'c-demo-nova-09');

  // Standard 20 Demo Clinic aliases
  const demoClinicAliases: [string, string][] = [
    ['clinic-001', 'c-demo-moon-01'],
    ['clinic-002', 'c-demo-apollo-02'],
    ['clinic-003', 'c-demo-greenlife-03'],
    ['clinic-004', 'c-demo-heart-04'],
    ['clinic-005', 'c-demo-vision-05'],
    ['clinic-006', 'c-demo-ortho-06'],
    ['clinic-007', 'c-demo-skin-07'],
    ['clinic-008', 'c-demo-neuro-08'],
    ['clinic-009', 'c-demo-nova-09'],
    ['clinic-010', 'c-demo-smile-10'],
    ['clinic-011', 'c-demo-pulmo-11'],
    ['clinic-012', 'c-demo-renal-12'],
    ['clinic-013', 'c-demo-digestive-13'],
    ['clinic-014', 'c-demo-endowell-14'],
    ['clinic-015', 'c-demo-uro-15'],
    ['clinic-016', 'c-demo-physio-16'],
    ['clinic-017', 'c-demo-mind-17'],
    ['clinic-018', 'c-demo-besant-18'],
    ['clinic-019', 'c-demo-avadi-18'],
    ['clinic-020', 'c-demo-royapuram-20'],
  ];
  for (const [alias, id] of demoClinicAliases) {
    memoryDb.clinics.setAlias(alias, id);
    const shortAlias = alias.replace('-00', '-').replace('-0', '-');
    memoryDb.clinics.setAlias(shortAlias, id);
  }

  // ============================================================
  // 4. SEED PROCEDURES CATALOG
  // ============================================================
  const coreProcedures = [
    { id: 'proc-rc', name: 'Root Canal Treatment', department: 'Dentistry', description: 'Single/multi-visit endodontic root canal therapy & bio-ceramic obturation.' },
    { id: 'proc-dc', name: 'Dental Cleaning', department: 'Dentistry', description: 'Ultrasonic scaling, subgingival plaque debridement, and enamel polishing.' },
    { id: 'proc-te', name: 'Tooth Extraction', department: 'Dentistry', description: 'Atraumatic dental extraction, socket preservation, and surgical removal.' },
    { id: 'proc-df', name: 'Dental Filling', department: 'Dentistry', description: 'Composite tooth-colored restorative cavity restoration.' },
    { id: 'proc-fc', name: 'Fever Consultation', department: 'General Medicine', description: 'Acute pyrexia evaluation, CBC platelet check, and symptom triage.' },
    { id: 'proc-gh', name: 'General Health Consultation', department: 'General Medicine', description: 'Routine clinical checkup, metabolic and primary health screening.' },
    { id: 'proc-db', name: 'Diabetes Consultation', department: 'General Medicine', description: 'Glycemic control review, diet counseling, and oral hypoglycemic modulation.' },
    { id: 'proc-anc', name: 'Antenatal Checkup', department: 'Gynecology', description: 'Prenatal maternal health review, fetal Doppler monitoring, and obstetric care.' },
    { id: 'proc-pcos', name: 'PCOS Management', department: 'Gynecology', description: 'Endocrine and pelvic ultrasound review for polycystic ovarian syndrome.' },
    { id: 'proc-card', name: 'Cardiac Consultation', department: 'Cardiology', description: 'Comprehensive cardiopulmonary examination and lipid profiling.' },
    { id: 'proc-ecg', name: 'Electrocardiogram (ECG)', department: 'Cardiology', description: '12-lead Electrocardiogram recording and cardiac rhythm analysis.' },
    { id: 'proc-ht', name: 'Hypertension Consultation', department: 'Cardiology', description: 'Blood pressure mapping, secondary hypertension screening, and therapy.' },
    { id: 'proc-eye-ex', name: 'Comprehensive Eye Examination', department: 'Ophthalmology', description: 'Slit-lamp ocular examination, refraction check, and intraocular pressure test.' },
    { id: 'proc-cataract', name: 'Cataract Evaluation', department: 'Ophthalmology', description: 'Lens opacification assessment and intraocular lens planning.' },
    { id: 'proc-joint', name: 'Joint Pain Consultation', department: 'Orthopedics', description: 'Articular cartilage assessment, range of motion tests, and joint review.' },
    { id: 'proc-knee', name: 'Knee Arthritis Evaluation', department: 'Orthopedics', description: 'Degenerative joint evaluation, radiographic review, and viscosupplementation.' },
    { id: 'proc-sk-c', name: 'Skin Consultation', department: 'Dermatology', description: 'Dermatologic clinical evaluation of skin lesions, pigmentation, and rashes.' },
    { id: 'proc-sk-a', name: 'Acne Treatment', department: 'Dermatology', description: 'Grade 1-4 acne vulgaris protocol, chemical peel assessment, and topicals.' },
    { id: 'proc-migraine', name: 'Migraine Consultation', department: 'Neurology', description: 'Neurovascular headache workup, aura profiling, and abortive/prophylactic therapy.' },
    { id: 'proc-nerve', name: 'Neurological Examination', department: 'Neurology', description: 'Cranial nerve reflex testing, peripheral neuropathy and sensory review.' },
    { id: 'proc-ent-c', name: 'ENT Consultation', department: 'ENT', description: 'Otolaryngology examination of ear canals, nasal septum, and pharynx.' },
    { id: 'proc-ear-inf', name: 'Ear Infection Consultation', department: 'ENT', description: 'Otitis media/externa diagnosis, micro-suctioning, and topical antibiotic therapy.' },
    { id: 'proc-ped-c', name: 'Child Consultation', department: 'Pediatrics', description: 'Pediatric physical exam, growth milestones, and pediatric symptom review.' },
    { id: 'proc-ped-f', name: 'Child Fever Evaluation', department: 'Pediatrics', description: 'Pediatric viral fever protocol, hydration assessment, and weight-based dosing.' },

    // 11. Pulmonology
    { id: 'proc-asthma', name: 'Asthma Consultation', department: 'Pulmonology', description: 'Airflow obstruction review, metered-dose inhaler optimization, and allergy workup.' },
    { id: 'proc-spiro', name: 'Spirometry Breathing Test', department: 'Pulmonology', description: 'Forced expiratory volume (FEV1) testing and pulmonary function analysis.' },

    // 12. Nephrology
    { id: 'proc-renal', name: 'Renal Function Review', department: 'Nephrology', description: 'Glomerular filtration rate (eGFR) profiling, proteinuria check, and kidney health.' },
    { id: 'proc-kidney-c', name: 'Kidney Disease Consultation', department: 'Nephrology', description: 'Chronic kidney disease evaluation, electrolyte monitoring, and blood pressure control.' },

    // 13. Gastroenterology
    { id: 'proc-gerd', name: 'Acidity & GERD Consultation', department: 'Gastroenterology', description: 'Gastroesophageal reflux evaluation, gastric mucosa assessment, and PPI therapy.' },
    { id: 'proc-ab-pain', name: 'Abdominal Pain Evaluation', department: 'Gastroenterology', description: 'Comprehensive gastrointestinal workup, mesenteric palpation, and ultrasound triage.' },

    // 14. Endocrinology
    { id: 'proc-endo-db', name: 'Diabetes Management', department: 'Endocrinology', description: 'HbA1c glycemic profiling, continuous glucose review, and insulin adjustment.' },
    { id: 'proc-thyroid', name: 'Thyroid Evaluation', department: 'Endocrinology', description: 'Free T3/T4, TSH hormonal mapping, and thyroid nodule clinical assessment.' },

    // 15. Urology
    { id: 'proc-k-stone', name: 'Kidney Stone Management', department: 'Urology', description: 'Renal calculus ultrasound review, medical expulsive therapy, and lithotripsy check.' },
    { id: 'proc-uti', name: 'Urinary Tract Consultation', department: 'Urology', description: 'Dysuria workup, urine microscopy analysis, and targeted antimicrobial care.' },

    // 16. Physiotherapy
    { id: 'proc-physio-rehab', name: 'Musculoskeletal Rehabilitation', department: 'Physiotherapy', description: 'Manual therapy, biomechanical alignment, posture correction, and exercise protocol.' },
    { id: 'proc-back-physio', name: 'Back Pain Physiotherapy', department: 'Physiotherapy', description: 'Lumbar core stabilization, decompression therapy, and therapeutic ultrasound.' },

    // 17. Psychiatry
    { id: 'proc-psych-eval', name: 'Anxiety & Depression Assessment', department: 'Psychiatry', description: 'Clinical psychometric evaluation, cognitive assessment, and therapeutic counseling.' },
    { id: 'proc-stress', name: 'Stress & Sleep Consultation', department: 'Psychiatry', description: 'Sleep architecture analysis, circadian modulation, and psychotherapy guidance.' },
  ];

  coreProcedures.forEach((p) => {
    memoryDb.procedures.set(p.id, { ...p, is_verified: true, created_at: new Date().toISOString() });
  });

  const defaultSchedule = {
    Monday: { start: '09:00 AM', end: '01:00 PM', slot_duration: 20, is_off: false },
    Tuesday: { start: '09:00 AM', end: '01:00 PM', slot_duration: 20, is_off: false },
    Wednesday: { start: '09:00 AM', end: '01:00 PM', slot_duration: 20, is_off: false },
    Thursday: { start: '02:00 PM', end: '06:00 PM', slot_duration: 20, is_off: false },
    Friday: { start: '09:00 AM', end: '01:00 PM', slot_duration: 20, is_off: false },
    Saturday: { start: '09:00 AM', end: '02:00 PM', slot_duration: 20, is_off: false },
    Sunday: { start: '10:00 AM', end: '01:00 PM', slot_duration: 20, is_off: true },
  };

  // ============================================================
  // 5. SEED EXACTLY 30 SPECIALIST DOCTORS ACROSS 17 DEPARTMENTS
  // ============================================================
  const rawDoctorsList = [
    // 1. Dentistry (doctor01, doctor20)
    { id: 'doc-demo-arun-01', name: 'Dr. Arun Kumar', spec: 'Dentistry', subSpec: 'Endodontics', clinicId: 'c-demo-moon-01', clinicName: 'Moon Dental Clinic', fee: '₹400', rating: 4.97, exp: 12, email: 'doctor01@demo.medlink.test', procs: ['Root Canal Treatment', 'Dental Cleaning', 'Tooth Extraction', 'Dental Filling'] },
    { id: 'doc-demo-ananya-08', name: 'Dr. Ananya Deshmukh', spec: 'Dentistry', subSpec: 'Oral & Maxillofacial Surgery', clinicId: 'c-demo-moon-01', clinicName: 'Moon Dental Clinic', fee: '₹400', rating: 4.93, exp: 9, email: 'doctor20@demo.medlink.test', procs: ['Dental Consultation', 'Root Canal Treatment', 'Dental Filling', 'Tooth Extraction'] },
    { id: 'doc-demo-suresh-07', name: 'Dr. Suresh Babu', spec: 'Dentistry', subSpec: 'Conservative Dentistry', clinicId: 'c-demo-moon-01', clinicName: 'Moon Dental Clinic', fee: '₹350', rating: 4.60, exp: 3, email: 'suresh.babu@medlink.test', status: 'UNDER_REVIEW', verified: false, procs: ['Dental Consultation', 'Dental Filling'] },

    // 2. General Medicine (doctor02, doctor19)
    { id: 'doc-demo-priya-02', name: 'Dr. Priya Sharma', spec: 'General Medicine', subSpec: 'Internal Medicine', clinicId: 'c-demo-apollo-02', clinicName: 'Apollo Family Care Centre', fee: '₹500', rating: 4.92, exp: 11, email: 'doctor02@demo.medlink.test', procs: ['Fever Consultation', 'General Health Consultation', 'Diabetes Consultation'] },
    { id: 'doc-demo-rajesh-14', name: 'Dr. Rajesh Varma', spec: 'General Medicine', subSpec: 'Family Medicine', clinicId: 'c-demo-apollo-02', clinicName: 'Apollo Family Care Centre', fee: '₹450', rating: 4.89, exp: 13, email: 'doctor19@demo.medlink.test', procs: ['General Health Consultation', 'Fever Consultation'] },
    { id: 'doc-demo-meenakshi-23', name: 'Dr. Meenakshi Iyer', spec: 'General Medicine', subSpec: 'Internal Medicine', clinicId: 'c-demo-omr-12', clinicName: 'OMR Health City Clinic', fee: '₹500', rating: 4.94, exp: 10, email: 'dr.meenakshi@medlink.test', procs: ['General Health Consultation', 'Fever Consultation'] },

    // 3. Cardiology (doctor03)
    { id: 'doc-demo-karthik-03', name: 'Dr. Karthik Raman', spec: 'Cardiology', subSpec: 'Interventional Cardiology', clinicId: 'c-demo-heart-04', clinicName: 'Chennai Heart & Vascular Centre', fee: '₹700', rating: 4.98, exp: 16, email: 'doctor03@demo.medlink.test', procs: ['Cardiac Consultation', 'Electrocardiogram (ECG)', 'Hypertension Consultation'] },
    { id: 'doc-demo-nithya-13', name: 'Dr. Nithya Menon', spec: 'Cardiology', subSpec: 'Preventive Cardiology', clinicId: 'c-demo-ramapuram-11', clinicName: 'Ramapuram Family Medical Centre', fee: '₹650', rating: 4.92, exp: 11, email: 'dr.nithya@medlink.test', procs: ['Cardiac Consultation', 'Electrocardiogram (ECG)'] },
    { id: 'doc-demo-vikram-22', name: 'Dr. Vikram Sundaram', spec: 'Cardiology', subSpec: 'Clinical Cardiology', clinicId: 'c-demo-heart-04', clinicName: 'Chennai Heart & Vascular Centre', fee: '₹700', rating: 4.95, exp: 14, email: 'dr.vikram.sundaram@medlink.test', procs: ['Cardiac Consultation', 'Hypertension Consultation'] },

    // 4. Pediatrics (doctor04)
    { id: 'doc-demo-kavitha-04', name: 'Dr. Kavitha Reddy', spec: 'Pediatrics', subSpec: 'Pediatrics & Neonatology', clinicId: 'c-demo-smile-10', clinicName: 'Smile & Child Pediatric Centre', fee: '₹450', rating: 4.96, exp: 11, email: 'doctor04@demo.medlink.test', procs: ['Child Consultation', 'Child Fever Evaluation'] },
    { id: 'doc-demo-arun-21', name: 'Dr. Arun Prakash', spec: 'Pediatrics', subSpec: 'Pediatric Care', clinicId: 'c-demo-smile-10', clinicName: 'Smile & Child Pediatric Centre', fee: '₹500', rating: 4.91, exp: 8, email: 'dr.arun.prakash@medlink.test', procs: ['Child Consultation', 'Child Fever Evaluation'] },
    { id: 'doc-demo-divya-27', name: 'Dr. Divya Krishnan', spec: 'Pediatrics', subSpec: 'Child Wellness', clinicId: 'c-demo-ambattur-17', clinicName: 'Ambattur Industrial Care Clinic', fee: '₹450', rating: 4.90, exp: 9, email: 'dr.divya.krishnan@medlink.test', procs: ['Child Consultation'] },

    // 5. Dermatology (doctor05)
    { id: 'doc-demo-priya-05', name: 'Dr. Priya Nair', spec: 'Dermatology', subSpec: 'Clinical Dermatology', clinicId: 'c-demo-skin-07', clinicName: 'SkinSphere Dermatology', fee: '₹500', rating: 4.95, exp: 10, email: 'doctor05@demo.medlink.test', procs: ['Skin Consultation', 'Acne Treatment'] },
    { id: 'doc-demo-harish-18', name: 'Dr. Harish Menon', spec: 'Dermatology', subSpec: 'Aesthetic Dermatosurgery', clinicId: 'c-demo-skin-07', clinicName: 'SkinSphere Dermatology', fee: '₹550', rating: 4.91, exp: 12, email: 'dr.harish.menon@medlink.test', procs: ['Skin Consultation', 'Acne Treatment'] },
    { id: 'doc-demo-kavya-25', name: 'Dr. Kavya Narayanan', spec: 'Dermatology', subSpec: 'Cutaneous Medicine', clinicId: 'c-demo-tambaram-14', clinicName: 'Tambaram Prime Healthcare', fee: '₹500', rating: 4.93, exp: 8, email: 'dr.kavya.narayanan@medlink.test', procs: ['Skin Consultation'] },

    // 6. ENT (doctor06)
    { id: 'doc-demo-venkat-06', name: 'Dr. Venkat Raman', spec: 'ENT', subSpec: 'Otolaryngology', clinicId: 'c-demo-nova-09', clinicName: 'Nova ENT Care', fee: '₹450', rating: 4.91, exp: 13, email: 'doctor06@demo.medlink.test', procs: ['ENT Consultation', 'Ear Infection Consultation'] },
    { id: 'doc-demo-swetha-20', name: 'Dr. Swetha Narayanan', spec: 'ENT', subSpec: 'Rhinology & Sinus', clinicId: 'c-demo-nova-09', clinicName: 'Nova ENT Care', fee: '₹500', rating: 4.88, exp: 8, email: 'dr.swetha.narayanan@medlink.test', procs: ['ENT Consultation'] },
    { id: 'doc-demo-rahul-26', name: 'Dr. Rahul Srinivasan', spec: 'ENT', subSpec: 'Otolaryngology', clinicId: 'c-demo-chromepet-15', clinicName: 'Chromepet Medical Pavilion', fee: '₹450', rating: 4.92, exp: 10, email: 'dr.rahul.srinivasan@medlink.test', procs: ['ENT Consultation'] },

    // 7. Ophthalmology (doctor07)
    { id: 'doc-demo-ramesh-10', name: 'Dr. Ramesh Chandran', spec: 'Ophthalmology', subSpec: 'Cataract & Refractive', clinicId: 'c-demo-vision-05', clinicName: 'VisionPlus Eye Centre', fee: '₹450', rating: 4.94, exp: 14, email: 'doctor07@demo.medlink.test', procs: ['Comprehensive Eye Examination', 'Cataract Evaluation'] },
    { id: 'doc-demo-deepa-16', name: 'Dr. Deepa Sundar', spec: 'Ophthalmology', subSpec: 'Glaucoma & Cornea', clinicId: 'c-demo-vision-05', clinicName: 'VisionPlus Eye Centre', fee: '₹450', rating: 4.90, exp: 9, email: 'dr.deepa.sundar@medlink.test', procs: ['Comprehensive Eye Examination'] },
    { id: 'doc-demo-pooja-29', name: 'Dr. Pooja Balaji', spec: 'Ophthalmology', subSpec: 'Ophthalmic Surgery', clinicId: 'c-demo-besant-18', clinicName: 'Besant Nagar Coastal Health Care', fee: '₹500', rating: 4.95, exp: 11, email: 'dr.pooja.balaji@medlink.test', procs: ['Comprehensive Eye Examination'] },

    // 8. Orthopedics (doctor08)
    { id: 'doc-demo-aditya-11', name: 'Dr. Aditya Rao', spec: 'Orthopedics', subSpec: 'Joint Replacement & Spine', clinicId: 'c-demo-ortho-06', clinicName: 'OrthoCare Chennai', fee: '₹550', rating: 4.93, exp: 13, email: 'doctor08@demo.medlink.test', procs: ['Joint Pain Consultation', 'Knee Arthritis Evaluation'] },
    { id: 'doc-demo-sneha-17', name: 'Dr. Sneha Krishnan', spec: 'Orthopedics', subSpec: 'Sports Medicine', clinicId: 'c-demo-ortho-06', clinicName: 'OrthoCare Chennai', fee: '₹500', rating: 4.88, exp: 8, email: 'dr.sneha.krishnan@medlink.test', procs: ['Joint Pain Consultation'] },
    { id: 'doc-demo-balaji-24', name: 'Dr. Suresh Balaji', spec: 'Orthopedics', subSpec: 'Trauma & Musculoskeletal', clinicId: 'c-demo-sholinganallur-13', clinicName: 'Sholinganallur Family Healthcare', fee: '₹550', rating: 4.92, exp: 12, email: 'dr.suresh.balaji@medlink.test', procs: ['Joint Pain Consultation'] },

    // 9. Gynecology (doctor09, doctor18)
    { id: 'doc-demo-radha-09', name: 'Dr. Radha Sundaram', spec: 'Gynecology', subSpec: 'Obstetrics & Gynecology', clinicId: 'c-demo-greenlife-03', clinicName: "GreenLife Women's & Maternity Clinic", fee: '₹600', rating: 4.95, exp: 15, email: 'doctor09@demo.medlink.test', procs: ['Antenatal Checkup', 'PCOS Management'] },
    { id: 'doc-demo-shalini-15', name: 'Dr. Shalini Mukerjee', spec: 'Gynecology', subSpec: 'Reproductive Medicine', clinicId: 'c-demo-greenlife-03', clinicName: "GreenLife Women's & Maternity Clinic", fee: '₹650', rating: 4.91, exp: 10, email: 'doctor18@demo.medlink.test', procs: ['PCOS Management', 'Antenatal Checkup'] },

    // 10. Neurology (doctor10)
    { id: 'doc-demo-arvind-12', name: 'Dr. Arvind Swaminathan', spec: 'Neurology', subSpec: 'Clinical Neurology & Stroke', clinicId: 'c-demo-neuro-08', clinicName: 'NeuroBridge Care Clinic', fee: '₹700', rating: 4.96, exp: 16, email: 'doctor10@demo.medlink.test', procs: ['Migraine Consultation', 'Neurological Examination'] },
    { id: 'doc-demo-gayatri-19', name: 'Dr. Gayatri Mohan', spec: 'Neurology', subSpec: 'Neurophysiology', clinicId: 'c-demo-neuro-08', clinicName: 'NeuroBridge Care Clinic', fee: '₹650', rating: 4.90, exp: 11, email: 'dr.gayatri.mohan@medlink.test', procs: ['Neurological Examination'] },
    { id: 'doc-demo-vignesh-30', name: 'Dr. Vignesh Kumar', spec: 'Neurology', subSpec: 'Neuro-Vascular Care', clinicId: 'c-demo-avadi-18', clinicName: 'Avadi Central Care Hospital', fee: '₹650', rating: 4.94, exp: 10, email: 'dr.vignesh.kumar@medlink.test', procs: ['Migraine Consultation'] },
    { id: 'doc-demo-sanjay-28', name: 'Dr. Sanjay Prakash', spec: 'General Medicine', subSpec: 'Primary Health & Preventive', clinicId: 'c-demo-pallavaram-16', clinicName: 'Pallavaram Prime Health Clinic', fee: '₹500', rating: 4.91, exp: 9, email: 'dr.sanjay.prakash@medlink.test', procs: ['General Health Consultation'] },

    // 11. Pulmonology (doctor11)
    { id: 'doc-demo-sanjay-29', name: 'Dr. Sanjay Krishnan', spec: 'Pulmonology', subSpec: 'Pulmonary & Critical Care', clinicId: 'c-demo-pulmo-11', clinicName: 'CarePoint Pulmonology', fee: '₹600', rating: 4.94, exp: 13, email: 'doctor11@demo.medlink.test', procs: ['Asthma Consultation', 'Spirometry Breathing Test'] },
    { id: 'doc-demo-preeti-30', name: 'Dr. Preeti Varghese', spec: 'Pulmonology', subSpec: 'Respiratory Medicine', clinicId: 'c-demo-pulmo-11', clinicName: 'CarePoint Pulmonology', fee: '₹550', rating: 4.89, exp: 9, email: 'dr.preeti.varghese@medlink.test', procs: ['Asthma Consultation', 'Spirometry Breathing Test'] },

    // 12. Nephrology (doctor12)
    { id: 'doc-demo-balaji-31', name: 'Dr. Balaji Natarajan', spec: 'Nephrology', subSpec: 'Nephrology & Renal Care', clinicId: 'c-demo-renal-12', clinicName: 'RenalCare Clinic', fee: '₹650', rating: 4.95, exp: 14, email: 'doctor12@demo.medlink.test', procs: ['Renal Function Review', 'Kidney Disease Consultation'] },
    { id: 'doc-demo-malini-32', name: 'Dr. Malini Sridhar', spec: 'Nephrology', subSpec: 'Clinical Nephrology', clinicId: 'c-demo-renal-12', clinicName: 'RenalCare Clinic', fee: '₹600', rating: 4.90, exp: 8, email: 'dr.malini.sridhar@medlink.test', procs: ['Renal Function Review', 'Kidney Disease Consultation'] },

    // 13. Gastroenterology (doctor13)
    { id: 'doc-demo-manoj-33', name: 'Dr. Manoj Kulkarni', spec: 'Gastroenterology', subSpec: 'Gastroenterology & Hepatology', clinicId: 'c-demo-digestive-13', clinicName: 'Digestive Health Centre', fee: '₹550', rating: 4.93, exp: 11, email: 'doctor13@demo.medlink.test', procs: ['Acidity & GERD Consultation', 'Abdominal Pain Evaluation'] },
    { id: 'doc-demo-lakshmi-34', name: 'Dr. Lakshmi Narayanan', spec: 'Gastroenterology', subSpec: 'Digestive Endoscopy', clinicId: 'c-demo-digestive-13', clinicName: 'Digestive Health Centre', fee: '₹600', rating: 4.88, exp: 10, email: 'dr.lakshmi.narayanan@medlink.test', procs: ['Acidity & GERD Consultation', 'Abdominal Pain Evaluation'] },

    // 14. Endocrinology (doctor14)
    { id: 'doc-demo-kiran-35', name: 'Dr. Kiran Chawla', spec: 'Endocrinology', subSpec: 'Endocrinology & Diabetology', clinicId: 'c-demo-endowell-14', clinicName: 'EndoWell Clinic', fee: '₹600', rating: 4.95, exp: 12, email: 'doctor14@demo.medlink.test', procs: ['Diabetes Management', 'Thyroid Evaluation'] },
    { id: 'doc-demo-reka-36', name: 'Dr. Rekha Gopal', spec: 'Endocrinology', subSpec: 'Metabolic Disorders', clinicId: 'c-demo-endowell-14', clinicName: 'EndoWell Clinic', fee: '₹550', rating: 4.90, exp: 9, email: 'dr.rekha.gopal@medlink.test', procs: ['Diabetes Management', 'Thyroid Evaluation'] },

    // 15. Urology (doctor15)
    { id: 'doc-demo-dinesh-37', name: 'Dr. Dinesh Karthikeyan', spec: 'Urology', subSpec: 'Urology & Andrology', clinicId: 'c-demo-uro-15', clinicName: 'UroCare Chennai', fee: '₹650', rating: 4.93, exp: 14, email: 'doctor15@demo.medlink.test', procs: ['Kidney Stone Management', 'Urinary Tract Consultation'] },
    { id: 'doc-demo-madhav-38', name: 'Dr. Madhavan Pillai', spec: 'Urology', subSpec: 'Endourology & Lithotripsy', clinicId: 'c-demo-uro-15', clinicName: 'UroCare Chennai', fee: '₹600', rating: 4.89, exp: 10, email: 'dr.madhavan.pillai@medlink.test', procs: ['Kidney Stone Management', 'Urinary Tract Consultation'] },

    // 16. Physiotherapy (doctor16)
    { id: 'doc-demo-antony-39', name: 'Dr. Antony Raj', spec: 'Physiotherapy', subSpec: 'Musculoskeletal & Sports Physio', clinicId: 'c-demo-physio-16', clinicName: 'PhysioMotion Rehabilitation', fee: '₹450', rating: 4.96, exp: 11, email: 'doctor16@demo.medlink.test', procs: ['Musculoskeletal Rehabilitation', 'Back Pain Physiotherapy'] },
    { id: 'doc-demo-saranya-40', name: 'Dr. Saranya Devi', spec: 'Physiotherapy', subSpec: 'Post-Op Rehab & Mobility', clinicId: 'c-demo-physio-16', clinicName: 'PhysioMotion Rehabilitation', fee: '₹400', rating: 4.92, exp: 7, email: 'dr.saranya.devi@medlink.test', procs: ['Musculoskeletal Rehabilitation', 'Back Pain Physiotherapy'] },

    // 17. Psychiatry (doctor17)
    { id: 'doc-demo-siddharth-41', name: 'Dr. Siddharth Sen', spec: 'Psychiatry', subSpec: 'Adult Psychiatry & Psychotherapy', clinicId: 'c-demo-mind-17', clinicName: 'MindCare Psychiatry Centre', fee: '₹800', rating: 4.98, exp: 15, email: 'doctor17@demo.medlink.test', procs: ['Anxiety & Depression Assessment', 'Stress & Sleep Consultation'] },
    { id: 'doc-demo-tanvi-42', name: 'Dr. Tanvi Hegde', spec: 'Psychiatry', subSpec: 'Cognitive Behavioral Therapy', clinicId: 'c-demo-mind-17', clinicName: 'MindCare Psychiatry Centre', fee: '₹750', rating: 4.94, exp: 8, email: 'dr.tanvi.hegde@medlink.test', procs: ['Anxiety & Depression Assessment', 'Stress & Sleep Consultation'] },
  ];

  for (const doc of rawDoctorsList) {
    const isUnderReview = doc.status === 'UNDER_REVIEW';

    let currentDocPass = 'Doctor@2001';
    const emailMatch = doc.email.match(/^doctor(\d+)@demo\.medlink\.test$/);
    if (emailMatch) {
      currentDocPass = `Doctor@${2000 + parseInt(emailMatch[1], 10)}`;
    }
    const currentDocPassHash = await bcrypt.hash(currentDocPass, 10);

    const docEntity: DoctorEntity = {
      id: doc.id,
      name: doc.name,
      email: doc.email,
      phone: '+91 98402 ' + String(10000 + memoryDb.doctors.size).slice(-5),
      password_hash: currentDocPassHash,
      specialization: doc.spec,
      primary_specialization: doc.subSpec,
      qualification: `MBBS, MD (${doc.subSpec})`,
      university: 'Tamil Nadu Dr. M.G.R. Medical University',
      grad_year: 2012,
      dob: '1984-06-15',
      gender: 'Male',
      rating: doc.rating,
      reviews_count: 150 + Math.floor(doc.rating * 20),
      experience_years: doc.exp,
      avatar: `https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400`,
      clinic_id: doc.clinicId,
      clinic_name: doc.clinicName,
      available_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      wait_time: '10 min',
      is_available_today: true,
      status: isUnderReview ? 'AVAILABLE' : 'AVAILABLE',
      languages: ['English', 'Tamil'],
      consultation_fee: doc.fee,
      is_preferred: true,
      about: `Senior Specialist in ${doc.subSpec} with ${doc.exp}+ years clinical experience.`,
      is_verified: !isUnderReview,
      verification_status: isUnderReview ? 'UNDER_REVIEW' : 'VERIFIED',
      verified_at: isUnderReview ? undefined : '2025-01-10T10:00:00.000Z',
      registration_number: `TN-REG-${doc.id.toUpperCase()}`,
      registration_authority: 'Tamil Nadu Medical / Dental Council',
      consultation_duration: '20 minutes',
      clinic_affiliations: [doc.clinicName],
      procedures: doc.procs,
      schedule: defaultSchedule,
    };
    memoryDb.doctors.set(doc.id, docEntity);

    // Register email aliases
    if (doc.email) {
      memoryDb.doctors.setAlias(doc.email, doc.id);
      memoryDb.doctors.setAlias(doc.email.replace('@demo.medlink.test', ''), doc.id);
    }
  }

  // Set backward-compatible doctor aliases on memoryDb.doctors
  memoryDb.doctors.setAlias('d1', 'doc-demo-arun-01');
  memoryDb.doctors.setAlias('d2', 'doc-demo-priya-02');
  memoryDb.doctors.setAlias('d3', 'doc-demo-karthik-03');
  memoryDb.doctors.setAlias('d4', 'doc-demo-kavitha-04');
  memoryDb.doctors.setAlias('d5', 'doc-demo-priya-05');
  memoryDb.doctors.setAlias('d6', 'doc-demo-venkat-06');
  memoryDb.doctors.setAlias('doc-demo-vikram-03', 'doc-demo-karthik-03');
  memoryDb.doctors.setAlias('doc-demo-neha-04', 'doc-demo-kavitha-04');
  memoryDb.doctors.setAlias('doc-demo-rahul-05', 'doc-demo-priya-05');
  memoryDb.doctors.setAlias('doc-demo-kavya-06', 'doc-demo-venkat-06');

  // Standard doc-001..044 aliases
  const standardDocAliases: [string, string][] = [
    ['doc-001', 'doc-demo-arun-01'],
    ['doc-002', 'doc-demo-priya-02'],
    ['doc-003', 'doc-demo-karthik-03'],
    ['doc-004', 'doc-demo-kavitha-04'],
    ['doc-005', 'doc-demo-priya-05'],
    ['doc-006', 'doc-demo-venkat-06'],
    ['doc-007', 'doc-demo-suresh-07'],
    ['doc-008', 'doc-demo-ananya-08'],
    ['doc-009', 'doc-demo-radha-09'],
    ['doc-010', 'doc-demo-ramesh-10'],
    ['doc-011', 'doc-demo-aditya-11'],
    ['doc-012', 'doc-demo-arvind-12'],
    ['doc-013', 'doc-demo-nithya-13'],
    ['doc-014', 'doc-demo-rajesh-14'],
    ['doc-015', 'doc-demo-shalini-15'],
    ['doc-016', 'doc-demo-deepa-16'],
    ['doc-017', 'doc-demo-sneha-17'],
    ['doc-018', 'doc-demo-harish-18'],
    ['doc-019', 'doc-demo-gayatri-19'],
    ['doc-020', 'doc-demo-swetha-20'],
    ['doc-021', 'doc-demo-arun-21'],
    ['doc-022', 'doc-demo-vikram-22'],
    ['doc-023', 'doc-demo-meenakshi-23'],
    ['doc-024', 'doc-demo-balaji-24'],
    ['doc-025', 'doc-demo-kavya-25'],
    ['doc-026', 'doc-demo-rahul-26'],
    ['doc-027', 'doc-demo-divya-27'],
    ['doc-028', 'doc-demo-sanjay-28'],
    ['doc-029', 'doc-demo-pooja-29'],
    ['doc-030', 'doc-demo-vignesh-30'],
    ['doc-031', 'doc-demo-sanjay-29'],
    ['doc-032', 'doc-demo-preeti-30'],
    ['doc-033', 'doc-demo-balaji-31'],
    ['doc-034', 'doc-demo-malini-32'],
    ['doc-035', 'doc-demo-manoj-33'],
    ['doc-036', 'doc-demo-lakshmi-34'],
    ['doc-037', 'doc-demo-kiran-35'],
    ['doc-038', 'doc-demo-reka-36'],
    ['doc-039', 'doc-demo-dinesh-37'],
    ['doc-040', 'doc-demo-madhav-38'],
    ['doc-041', 'doc-demo-antony-39'],
    ['doc-042', 'doc-demo-saranya-40'],
    ['doc-043', 'doc-demo-siddharth-41'],
    ['doc-044', 'doc-demo-tanvi-42'],
  ];
  for (const [alias, id] of standardDocAliases) {
    memoryDb.doctors.setAlias(alias, id);
    const shortAlias = alias.replace('-00', '-').replace('-0', '-');
    memoryDb.doctors.setAlias(shortAlias, id);
  }

  // ============================================================
  // DOCTOR-CLINIC ASSIGNMENTS (Many-to-Many Multi-Clinic Architecture)
  // ============================================================
  // 1. Primary assignments for all 30 doctors
  for (const doc of rawDoctorsList) {
    await DoctorClinicAssignmentModel.assign(doc.id, doc.clinicId, doc.spec);
  }

  // 2. Multi-clinic assignments across Chennai platform clinics
  // Dr. Arun Kumar (Dentistry) assigned to 4 clinics
  await DoctorClinicAssignmentModel.assign('doc-demo-arun-01', 'c-demo-moon-01', 'Dentistry');
  await DoctorClinicAssignmentModel.assign('doc-demo-arun-01', 'c-demo-apollo-02', 'Dentistry');
  await DoctorClinicAssignmentModel.assign('doc-demo-arun-01', 'c-demo-vision-05', 'Dentistry');
  await DoctorClinicAssignmentModel.assign('doc-demo-arun-01', 'c-demo-ramapuram-11', 'Dentistry');

  // Dr. Priya Sharma (General Medicine) assigned to 3 clinics
  await DoctorClinicAssignmentModel.assign('doc-demo-priya-02', 'c-demo-apollo-02', 'General Medicine');
  await DoctorClinicAssignmentModel.assign('doc-demo-priya-02', 'c-demo-moon-01', 'General Medicine');
  await DoctorClinicAssignmentModel.assign('doc-demo-priya-02', 'c-demo-heart-04', 'General Medicine');

  // Dr. Karthik Raman (Cardiology) assigned to 2 clinics
  await DoctorClinicAssignmentModel.assign('doc-demo-karthik-03', 'c-demo-heart-04', 'Cardiology');
  await DoctorClinicAssignmentModel.assign('doc-demo-karthik-03', 'c-demo-apollo-02', 'Cardiology');

  // Dr. Priya Nair (Dermatology) assigned to 2 clinics
  await DoctorClinicAssignmentModel.assign('doc-demo-priya-05', 'c-demo-skin-07', 'Dermatology');
  await DoctorClinicAssignmentModel.assign('doc-demo-priya-05', 'c-demo-tambaram-14', 'Dermatology');

  // Dr. Aditya Rao (Orthopedics) assigned to 2 clinics
  await DoctorClinicAssignmentModel.assign('doc-demo-aditya-11', 'c-demo-ortho-06', 'Orthopedics');
  await DoctorClinicAssignmentModel.assign('doc-demo-aditya-11', 'c-demo-sholinganallur-13', 'Orthopedics');

  // ============================================================
  // ============================================================
  // 6. MASTER PHARMACY INVENTORY BATCHES (FEFO Support)
  // ============================================================
  const demoPharmacyItems = [
    // Moon Dental Clinic FEFO Batches
    { id: 'rx-item-dolo-01', clinic_id: 'c-demo-moon-01', sku: 'MED-ATC-N02BE', name: 'Paracetamol 650mg (Dolo)', generic_name: 'Paracetamol', category: 'Analgesics', dosage_form: 'Tablet', strength: '650mg', batch_number: 'BATCH-DOLO-2026A', expiry_date: '2026-11-30', quantity: 50, min_stock_level: 20, reorder_quantity: 100, unit_price: 3.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-dolo-02', clinic_id: 'c-demo-moon-01', sku: 'MED-ATC-N02BE', name: 'Paracetamol 650mg (Dolo)', generic_name: 'Paracetamol', category: 'Analgesics', dosage_form: 'Tablet', strength: '650mg', batch_number: 'BATCH-DOLO-2027B', expiry_date: '2027-12-31', quantity: 100, min_stock_level: 20, reorder_quantity: 100, unit_price: 3.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-amox-01', clinic_id: 'c-demo-moon-01', sku: 'MED-AMOX-500', name: 'Amoxicillin 500mg', generic_name: 'Amoxicillin', category: 'Antibiotics', dosage_form: 'Capsule', strength: '500mg', batch_number: 'BATCH-AMOX-2027A', expiry_date: '2027-06-30', quantity: 5, min_stock_level: 15, reorder_quantity: 50, unit_price: 8.0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-amxclv-01', clinic_id: 'c-demo-moon-01', sku: 'MED-ATC-J01CR', name: 'Amoxicillin & Potassium Clavulanate 625 mg', generic_name: 'Amoxicillin + Potassium Clavulanate', category: 'Antibiotics', dosage_form: 'Tablet', strength: '625 mg', batch_number: 'BATCH-AMXCLV-2026A', expiry_date: '2026-11-30', quantity: 50, min_stock_level: 20, reorder_quantity: 100, unit_price: 22.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-amxclv-02', clinic_id: 'c-demo-moon-01', sku: 'MED-ATC-J01CR', name: 'Amoxicillin & Potassium Clavulanate 625 mg', generic_name: 'Amoxicillin + Potassium Clavulanate', category: 'Antibiotics', dosage_form: 'Tablet', strength: '625 mg', batch_number: 'BATCH-AMXCLV-2027B', expiry_date: '2027-10-31', quantity: 100, min_stock_level: 20, reorder_quantity: 100, unit_price: 22.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-cet-01', clinic_id: 'c-demo-moon-01', sku: 'MED-ATC-R06', name: 'Cetirizine 10mg', generic_name: 'Cetirizine', category: 'Antihistamines', dosage_form: 'Tablet', strength: '10mg', batch_number: 'BATCH-CET-2027A', expiry_date: '2027-09-30', quantity: 60, min_stock_level: 20, reorder_quantity: 50, unit_price: 4.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-amxclv-apollo-01', clinic_id: 'c-demo-apollo-02', sku: 'MED-ATC-J01CR', name: 'Amoxicillin & Potassium Clavulanate 625 mg', generic_name: 'Amoxicillin + Potassium Clavulanate', category: 'Antibiotics', dosage_form: 'Tablet', strength: '625 mg', batch_number: 'BATCH-AMXCLV-APOLLO', expiry_date: '2027-08-31', quantity: 80, min_stock_level: 20, reorder_quantity: 100, unit_price: 22.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-levo-01', clinic_id: 'c-demo-apollo-02', sku: 'MED-ATC-R06', name: 'Levocetirizine 5mg', generic_name: 'Levocetirizine', category: 'Antihistamines', dosage_form: 'Tablet', strength: '5mg', batch_number: 'BATCH-LEVO-2028A', expiry_date: '2028-01-31', quantity: 80, min_stock_level: 20, reorder_quantity: 40, unit_price: 5.0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-met-01', clinic_id: 'c-demo-omr-12', sku: 'MED-ATC-A10BA', name: 'Metformin 500mg', generic_name: 'Metformin', category: 'Antidiabetic', dosage_form: 'Tablet', strength: '500mg', batch_number: 'BATCH-MET-2027A', expiry_date: '2027-08-31', quantity: 120, min_stock_level: 30, reorder_quantity: 100, unit_price: 4.0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-ator-01', clinic_id: 'c-demo-heart-04', sku: 'MED-ATC-C10AA', name: 'Atorvastatin 20mg', generic_name: 'Atorvastatin', category: 'Cardiovascular', dosage_form: 'Tablet', strength: '20mg', batch_number: 'BATCH-ATOR-2027B', expiry_date: '2027-10-31', quantity: 90, min_stock_level: 25, reorder_quantity: 100, unit_price: 11.0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },

    // SkinSphere Dermatology (c-demo-skin-07) FEFO Batches & Clinical Inventory
    { id: 'rx-item-dolo-skin-01', clinic_id: 'c-demo-skin-07', sku: 'MED-ATC-N02BE', name: 'Paracetamol 650mg (Dolo)', generic_name: 'Paracetamol', category: 'Analgesics', dosage_form: 'Tablet', strength: '650mg', batch_number: 'BATCH-DOLO-SKIN-2026A', expiry_date: '2026-11-30', quantity: 50, min_stock_level: 20, reorder_quantity: 100, unit_price: 3.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-dolo-skin-02', clinic_id: 'c-demo-skin-07', sku: 'MED-ATC-N02BE', name: 'Paracetamol 650mg (Dolo)', generic_name: 'Paracetamol', category: 'Analgesics', dosage_form: 'Tablet', strength: '650mg', batch_number: 'BATCH-DOLO-SKIN-2027B', expiry_date: '2027-12-31', quantity: 100, min_stock_level: 20, reorder_quantity: 100, unit_price: 3.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-amxclv-skin-01', clinic_id: 'c-demo-skin-07', sku: 'MED-ATC-J01CR', name: 'Amoxicillin & Potassium Clavulanate 625 mg', generic_name: 'Amoxicillin + Potassium Clavulanate', category: 'Antibiotics', dosage_form: 'Tablet', strength: '625 mg', batch_number: 'BATCH-AMXCLV-SKIN-2026A', expiry_date: '2026-11-30', quantity: 50, min_stock_level: 20, reorder_quantity: 100, unit_price: 22.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-amxclv-skin-02', clinic_id: 'c-demo-skin-07', sku: 'MED-ATC-J01CR', name: 'Amoxicillin & Potassium Clavulanate 625 mg', generic_name: 'Amoxicillin + Potassium Clavulanate', category: 'Antibiotics', dosage_form: 'Tablet', strength: '625 mg', batch_number: 'BATCH-AMXCLV-SKIN-2027B', expiry_date: '2027-10-31', quantity: 100, min_stock_level: 20, reorder_quantity: 100, unit_price: 22.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-amox-skin-01', clinic_id: 'c-demo-skin-07', sku: 'MED-AMOX-500', name: 'Amoxicillin 500mg', generic_name: 'Amoxicillin', category: 'Antibiotics', dosage_form: 'Capsule', strength: '500mg', batch_number: 'BATCH-AMOX-SKIN-2027A', expiry_date: '2027-06-30', quantity: 5, min_stock_level: 15, reorder_quantity: 50, unit_price: 8.0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-levo-skin-01', clinic_id: 'c-demo-skin-07', sku: 'MED-ATC-R06', name: 'Levocetirizine 5mg', generic_name: 'Levocetirizine', category: 'Antihistamines', dosage_form: 'Tablet', strength: '5mg', batch_number: 'BATCH-LEVO-SKIN-2028A', expiry_date: '2028-01-31', quantity: 80, min_stock_level: 20, reorder_quantity: 40, unit_price: 5.0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-cet-skin-01', clinic_id: 'c-demo-skin-07', sku: 'MED-ATC-R06', name: 'Cetirizine HCl 10mg', generic_name: 'Cetirizine', category: 'Antihistamines', dosage_form: 'Tablet', strength: '10mg', batch_number: 'BATCH-CET-SKIN-2027C', expiry_date: '2027-09-30', quantity: 60, min_stock_level: 20, reorder_quantity: 50, unit_price: 4.5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'rx-item-dicl-skin-01', clinic_id: 'c-demo-skin-07', sku: 'MED-ATC-M01AB', name: 'Diclofenac Sodium 50mg', generic_name: 'Diclofenac', category: 'Analgesics', dosage_form: 'Tablet', strength: '50mg', batch_number: 'BATCH-DICL-SKIN-2027A', expiry_date: '2027-07-31', quantity: 70, min_stock_level: 20, reorder_quantity: 50, unit_price: 6.0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ];
  demoPharmacyItems.forEach((item) => memoryDb.pharmacy_inventory.set(item.id, item));

  // ============================================================
  // 7. OPERATIONAL CLEAN STATE: BASELINE CLINICAL DEMO ACTIVITY
  // ============================================================
  memoryDb.appointments.clear();
  memoryDb.appointment_queue.clear();
  memoryDb.walk_ins.clear();
  memoryDb.consultations.clear();
  memoryDb.prescriptions.clear();
  memoryDb.notifications.clear();
  memoryDb.pharmacy_dispensations.clear();
  memoryDb.availability_requests.clear();

  // Baseline ready-for-dispensing prescriptions for SkinSphere Dermatology (c-demo-skin-07)
  const baselinePrescriptions = [
    {
      id: 'rx-w-1790777236622',
      appointment_id: 'w-1790777236622',
      patient_id: 'pat-w-1790777236622',
      patient_name: 'emergency patient 1',
      doctor_id: 'doc-demo-priya-05',
      doctor_name: 'Dr. Priya Nair',
      doctor_specialization: 'Dermatology',
      doctor_registration_number: 'TN-REG-DOC-DEMO-PRIYA-05',
      clinic_id: 'c-demo-skin-07',
      clinic_name: 'SkinSphere Dermatology',
      clinic_address: 'Villivakkam, Chennai',
      date: 'Sep 30, 2026',
      diagnosis: 'Clinical evaluation of heavy swelling',
      clinical_notes: 'Patient presented with chief complaints. Vitals stable. Systemic examination normal.',
      follow_up_date: 'Nov 27, 2026',
      status: 'pending',
      medicines: [
        {
          name: 'Amoxicillin & Potassium Clavulanate 625 mg',
          dosage: '625 mg',
          frequency: '1-0-1',
          duration: '5 days',
          instructions: 'After food',
        },
        {
          name: 'Paracetamol 650mg (Dolo)',
          dosage: '650 mg',
          frequency: '1-0-1 (SOS)',
          duration: '3 days',
          instructions: 'After food during fever or pain',
        },
      ],
      created_at: '2026-09-30T14:08:48.313Z',
    },
    {
      id: 'rx-w-1790777276533',
      appointment_id: 'w-1790777276533',
      patient_id: 'pat-w-1790777276533',
      patient_name: 'normal patient 1',
      doctor_id: 'doc-demo-priya-05',
      doctor_name: 'Dr. Priya Nair',
      doctor_specialization: 'Dermatology',
      doctor_registration_number: 'TN-REG-DOC-DEMO-PRIYA-05',
      clinic_id: 'c-demo-skin-07',
      clinic_name: 'SkinSphere Dermatology',
      clinic_address: 'Villivakkam, Chennai',
      date: 'Sep 30, 2026',
      diagnosis: 'Clinical evaluation of dry skin',
      clinical_notes: 'Patient presented with chief complaints. Vitals stable. Systemic examination normal.',
      follow_up_date: 'Nov 27, 2026',
      status: 'pending',
      medicines: [
        {
          name: 'Amoxicillin & Potassium Clavulanate 625 mg',
          dosage: '625 mg',
          frequency: '1-0-1',
          duration: '5 days',
          instructions: 'After food',
        },
        {
          name: 'Paracetamol 650mg (Dolo)',
          dosage: '650 mg',
          frequency: '1-0-1 (SOS)',
          duration: '3 days',
          instructions: 'After food during fever or pain',
        },
      ],
      created_at: '2026-09-30T14:09:37.446Z',
    },
    // Moon Dental Clinic (c-demo-moon-01) Prescriptions Waiting for Dispensation
    {
      id: 'rx-apt-1791196893198',
      appointment_id: 'apt-1791196893198',
      patient_id: 'pat-demo-01',
      patient_name: 'Aarav Sharma',
      doctor_id: 'doc-demo-ananya-08',
      doctor_name: 'Dr. Ananya Deshmukh',
      doctor_specialization: 'Dentistry',
      doctor_registration_number: 'TN-REG-DOC-DEMO-ANANYA-08',
      clinic_id: 'c-demo-moon-01',
      clinic_name: 'Moon Dental Clinic',
      clinic_address: '24 Luz Church Road, Mylapore, Chennai',
      date: 'Oct 5, 2026',
      diagnosis: 'Clinical evaluation of Dental Consultation',
      clinical_notes: 'Patient presented with chief complaints. Vitals stable. Systemic examination normal.',
      follow_up_date: 'Nov 27, 2026',
      status: 'pending',
      medicines: [
        {
          name: 'Amoxicillin & Potassium Clavulanate 625 mg',
          dosage: '625 mg',
          frequency: '1-0-1',
          duration: '5 days',
          instructions: 'After food',
        },
        {
          name: 'Paracetamol 650mg (Dolo)',
          dosage: '650 mg',
          frequency: '1-0-1 (SOS)',
          duration: '3 days',
          instructions: 'After food during fever or pain',
        },
      ],
      created_at: '2026-10-05T10:50:54.368Z',
    },
    {
      id: 'rx-1791196894635',
      appointment_id: 'apt-1791196795904',
      patient_id: 'pat-demo-03',
      patient_name: 'Rajesh Kumar',
      doctor_id: 'doc-demo-ananya-08',
      doctor_name: 'Dr. Ananya Deshmukh',
      doctor_specialization: 'Dentistry',
      doctor_registration_number: 'TN-MED-44281-2012',
      clinic_id: 'c-demo-moon-01',
      clinic_name: 'Moon Dental Clinic',
      clinic_address: '24 Luz Church Road, Mylapore, Chennai',
      date: 'Oct 5, 2026',
      diagnosis: 'Root Canal Treatment',
      clinical_notes: 'Follow prescribed course. Rest well and maintain adequate hydration.',
      follow_up_date: 'In 2 weeks',
      status: 'pending',
      medicines: [
        {
          name: 'Amoxicillin 500mg',
          dosage: '1 Capsule',
          frequency: 'Three times daily (After meals)',
          duration: '5 days',
          instructions: 'Complete full 5-day course',
        },
        {
          name: 'Paracetamol 650mg',
          dosage: '1 Tablet',
          frequency: 'As needed for fever / pain',
          duration: '3 days',
          instructions: 'Maximum 3 tablets daily',
        },
        {
          name: 'Cetirizine 10mg',
          dosage: '1 Tablet',
          frequency: 'Once daily at bedtime',
          duration: '7 days',
          instructions: 'Take after dinner',
        },
      ],
      created_at: '2026-10-05T10:41:34.636Z',
    },
  ];
  baselinePrescriptions.forEach((rx) => {
    memoryDb.prescriptions.set(rx.id, rx);
    memoryDb.prescriptions.setAlias(rx.appointment_id, rx.id);
  });

  // ============================================================
  // 8. SEED APPROVED CLINICAL AVAILABILITY REQUESTS (17 DEPARTMENTS)
  // ============================================================
  // Preserves Dr. Arun Kumar's approved 9 PM–11 PM session (covering 10 PM–11 PM)
  // and establishes verified booking slots for every primary demo clinic across 2026-09-29 and 2026-09-30.
  const baselineDoctors = [
    { clinicId: 'c-demo-moon-01', clinicName: 'Moon Dental & Medical Clinic', doctorId: 'doc-demo-arun-01', doctorName: 'Dr. Arun Kumar', specialty: 'Dentistry', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '01:00 PM' },
      { date: '2026-09-29', start: '09:00 PM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-apollo-02', clinicName: 'Apollo Family Care Centre', doctorId: 'doc-demo-priya-02', doctorName: 'Dr. Priya Sharma', specialty: 'General Medicine', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-greenlife-03', clinicName: "GreenLife Women's & Maternity Clinic", doctorId: 'doc-demo-radha-09', doctorName: 'Dr. Radha Sundaram', specialty: 'Gynecology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-heart-04', clinicName: 'Chennai Heart & Vascular Centre', doctorId: 'doc-demo-karthik-03', doctorName: 'Dr. Karthik Raman', specialty: 'Cardiology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-vision-05', clinicName: 'VisionPlus Eye Centre', doctorId: 'doc-demo-ramesh-10', doctorName: 'Dr. Ramesh Chandran', specialty: 'Ophthalmology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-ortho-06', clinicName: 'OrthoCare Chennai', doctorId: 'doc-demo-aditya-11', doctorName: 'Dr. Aditya Rao', specialty: 'Orthopedics', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-skin-07', clinicName: 'SkinSphere Dermatology', doctorId: 'doc-demo-priya-05', doctorName: 'Dr. Priya Nair', specialty: 'Dermatology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
      { date: '2026-09-30', start: '09:00 PM', end: '11:59 PM' },
      { date: '2026-10-01', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-neuro-08', clinicName: 'NeuroBridge Care Clinic', doctorId: 'doc-demo-arvind-12', doctorName: 'Dr. Arvind Swaminathan', specialty: 'Neurology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-nova-09', clinicName: 'Nova ENT Care', doctorId: 'doc-demo-venkat-06', doctorName: 'Dr. Venkat Raman', specialty: 'ENT', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-smile-10', clinicName: 'Smile & Child Pediatric Centre', doctorId: 'doc-demo-kavitha-04', doctorName: 'Dr. Kavitha Reddy', specialty: 'Pediatrics', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-pulmo-11', clinicName: 'CarePoint Pulmonology', doctorId: 'doc-demo-sanjay-29', doctorName: 'Dr. Sanjay Krishnan', specialty: 'Pulmonology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-renal-12', clinicName: 'RenalCare Clinic', doctorId: 'doc-demo-balaji-31', doctorName: 'Dr. Balaji Natarajan', specialty: 'Nephrology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-digestive-13', clinicName: 'Digestive Health Centre', doctorId: 'doc-demo-manoj-33', doctorName: 'Dr. Manoj Kulkarni', specialty: 'Gastroenterology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-endowell-14', clinicName: 'EndoWell Clinic', doctorId: 'doc-demo-kiran-35', doctorName: 'Dr. Kiran Chawla', specialty: 'Endocrinology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-uro-15', clinicName: 'UroCare Chennai', doctorId: 'doc-demo-dinesh-37', doctorName: 'Dr. Dinesh Karthikeyan', specialty: 'Urology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-physio-16', clinicName: 'PhysioMotion Rehabilitation', doctorId: 'doc-demo-antony-39', doctorName: 'Dr. Antony Raj', specialty: 'Physiotherapy', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-mind-17', clinicName: 'MindCare Psychiatry Centre', doctorId: 'doc-demo-siddharth-41', doctorName: 'Dr. Siddharth Sen', specialty: 'Psychiatry', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-greenlife-03', clinicName: "GreenLife Women's & Maternity Clinic", doctorId: 'doc-demo-shalini-15', doctorName: 'Dr. Shalini Mukerjee', specialty: 'Gynecology', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-apollo-02', clinicName: 'Apollo Family Care Centre', doctorId: 'doc-demo-rajesh-14', doctorName: 'Dr. Rajesh Varma', specialty: 'General Medicine', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
    { clinicId: 'c-demo-moon-01', clinicName: 'Moon Dental Clinic', doctorId: 'doc-demo-ananya-08', doctorName: 'Dr. Ananya Deshmukh', specialty: 'Dentistry', shifts: [
      { date: '2026-09-29', start: '09:00 AM', end: '11:00 PM' },
      { date: '2026-09-30', start: '09:00 AM', end: '05:00 PM' },
    ]},
  ];

  let reqIdx = 100;
  for (const b of baselineDoctors) {
    for (const s of b.shifts) {
      reqIdx++;
      const reqId = `avail-req-seed-${b.doctorId}-${b.clinicId}-${s.date}-${reqIdx}`;
      memoryDb.availability_requests.set(reqId, {
        id: reqId,
        clinic_id: b.clinicId,
        clinic_name: b.clinicName,
        doctor_id: b.doctorId,
        doctor_name: b.doctorName,
        specialty: b.specialty,
        date: s.date,
        requested_date: s.date,
        start_time: s.start,
        end_time: s.end,
        status: 'APPROVED',
        notes: 'Approved baseline presentation schedule',
        requested_by: 'Clinic Assistant',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (s.date === '2026-09-30') {
        reqIdx++;
        const pastReqId = `avail-req-seed-${b.doctorId}-${b.clinicId}-2026-09-09-${reqIdx}`;
        memoryDb.availability_requests.set(pastReqId, {
          id: pastReqId,
          clinic_id: b.clinicId,
          clinic_name: b.clinicName,
          doctor_id: b.doctorId,
          doctor_name: b.doctorName,
          specialty: b.specialty,
          date: '2026-09-09',
          requested_date: '2026-09-09',
          start_time: s.start,
          end_time: s.end,
          status: 'APPROVED',
          notes: 'Approved baseline schedule',
          requested_by: 'Clinic Assistant',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // Reset live doctor statuses to clean default
  for (const a of memoryDb.doctor_clinic_assignments.values()) {
    a.status = 'AVAILABLE';
    a.updated_at = new Date().toISOString();
  }
  for (const doc of memoryDb.doctors.values()) {
    doc.status = 'AVAILABLE';
    doc.is_available_today = true;
  }

  // 9. Add Moon Dental Clinic Villivakkam (Clinic 2773) and its doctors
  await seedMoonDentalVillivakkam();

  // Save to persistent file
  saveStateToFile();

  const purePatients = Array.from(memoryDb.patients.values()).filter((p: any) => p.role !== 'CLINIC_ADMIN');
  const asstCount = memoryDb.assistants.size;

  const totalRecords =
    memoryDb.patients.size +
    memoryDb.clinics.size +
    memoryDb.doctors.size +
    memoryDb.appointments.size +
    memoryDb.appointment_queue.size +
    memoryDb.consultations.size +
    memoryDb.prescriptions.size +
    memoryDb.medical_files.size;

  console.log('\n==================================================');
  console.log('=== DEMO DATA COUNTS ===');
  console.log('==================================================');
  console.log(`Clinics: ${memoryDb.clinics.size}`);
  console.log(`Doctors: ${memoryDb.doctors.size}`);
  console.log(`Patients: ${purePatients.length}`);
  console.log(`Assistants: ${asstCount}`);
  console.log('--------------------------------------------------');
  console.log('DOCTORS');
  for (let i = 1; i <= 20; i++) {
    const pad = String(i).padStart(2, '0');
    console.log(`doctor${pad}@demo.medlink.test`);
  }
  console.log('--------------------------------------------------');
  console.log('PATIENTS');
  for (let i = 1; i <= 20; i++) {
    const pad = String(i).padStart(2, '0');
    console.log(`patient${pad}@demo.medlink.test`);
  }
  console.log('--------------------------------------------------');
  console.log('ASSISTANTS');
  for (let i = 1; i <= 20; i++) {
    const pad = String(i).padStart(2, '0');
    console.log(`assistant${pad}@demo.medlink.test`);
  }
  console.log('==================================================\n');

  return {
    patientsCount: purePatients.length,
    clinicsCount: memoryDb.clinics.size,
    doctorsCount: memoryDb.doctors.size,
    assistantsCount: asstCount,
    appointmentsCount: memoryDb.appointments.size,
    queuesCount: memoryDb.appointment_queue.size,
    consultationsCount: memoryDb.consultations.size,
    prescriptionsCount: memoryDb.prescriptions.size,
    medicalReportsCount: memoryDb.medical_files.size,
    totalCount: totalRecords,
    duplicateIds: 0,
  };
};

export const seedPresentationData = seedDatabase;

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Seed execution completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seed execution failed:', err);
      process.exit(1);
    });
}

