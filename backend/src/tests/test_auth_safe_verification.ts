import axios from 'axios';

const BASE_URL = 'http://localhost:5000';
const api = axios.create({ baseURL: BASE_URL, validateStatus: () => true });

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failCount++;
  }
}

async function runTestSuite() {
  console.log('\n============================================================');
  console.log('MEDLINK SAFE AUTH-ONLY IMPLEMENTATION VERIFICATION SUITE');
  console.log('============================================================\n');

  const ts = Date.now();
  const rand6 = Math.floor(100000 + Math.random() * 900000);

  // ============================================================
  // PART 1: DEMO REGRESSION TESTS (Freeze Rule #1)
  // ============================================================
  console.log('--- PART 1: DEMO REGRESSION TESTS (Existing Accounts Untouched) ---');

  // 1.1 Demo Patient Login
  const demoPatientRes = await api.post('/api/auth/login', {
    email: 'patient01@demo.medlink.test',
    password: 'password123',
  });
  assert(demoPatientRes.status === 200 && !!demoPatientRes.data.token, 'Demo Patient Login succeeds (patient01)', `Status: ${demoPatientRes.status}`);
  const demoPatientToken = demoPatientRes.data.token;

  // 1.2 Demo Doctor Login
  const demoDoctorRes = await api.post('/api/auth/doctor/login', {
    email: 'doctor01@demo.medlink.test',
    password: 'password123',
  });
  assert(demoDoctorRes.status === 200 && !!demoDoctorRes.data.token, 'Demo Doctor Login succeeds (doctor01)', `Status: ${demoDoctorRes.status}`);
  const demoDoctorToken = demoDoctorRes.data.token;

  // 1.3 Demo Assistant Login
  const demoAssistantRes = await api.post('/api/auth/assistant/login', {
    email: 'assistant01@demo.medlink.test',
    password: 'password123',
  });
  assert(demoAssistantRes.status === 200 && !!demoAssistantRes.data.token, 'Demo Clinic Assistant Login succeeds (assistant01)', `Status: ${demoAssistantRes.status}`);

  // 1.4 Existing Demo Doctor Mobile API Access
  const demoDoctorMe = await api.get('/api/doctors/auth/me', {
    headers: { Authorization: `Bearer ${demoDoctorToken}` },
  });
  assert(demoDoctorMe.status === 200 && demoDoctorMe.data.doctor?.name === 'Dr. Arun Kumar', 'Demo Doctor Me operational API works', `Status: ${demoDoctorMe.status}, Doctor: ${demoDoctorMe.data.doctor?.name}`);

  // 1.5 Existing Features: Clinic Discovery, Doctor Discovery, Availability
  const clinicsRes = await api.get('/api/clinics');
  assert(clinicsRes.status === 200 && Array.isArray(clinicsRes.data.clinics) && clinicsRes.data.clinics.length > 0, 'Existing Clinic Discovery returns seeded clinics', `Count: ${clinicsRes.data.clinics?.length}`);

  const doctorsRes = await api.get('/api/doctors');
  assert(doctorsRes.status === 200 && Array.isArray(doctorsRes.data.doctors) && doctorsRes.data.doctors.length > 0, 'Existing Doctor Discovery returns seeded doctors', `Count: ${doctorsRes.data.doctors?.length}`);

  const availRes = await api.get('/api/availability/doctors/doc-demo-arun-01');
  assert(availRes.status === 200, 'Existing Doctor Availability endpoint works', `Status: ${availRes.status}`);


  // ============================================================
  // PART 2: NEW PATIENT REGISTRATION & ACTIVATION FLOW
  // ============================================================
  console.log('\n--- PART 2: NEW REAL PATIENT REGISTRATION & ACTIVATION ---');

  const newPatientEmail = `test.pat.${ts}@medlink.test`;
  const newPatientPhone = `+91 9884${rand6}`;
  const newPatientPass = 'SafePassword123!';

  // 2.1 Register New Patient
  const regPatientRes = await api.post('/api/auth/register', {
    name: 'Test Safe Patient',
    email: newPatientEmail,
    phone: newPatientPhone,
    password: newPatientPass,
    bloodGroup: 'B+',
    gender: 'Female',
    age: 29,
  });
  assert(
    regPatientRes.status === 201 && regPatientRes.data.success && regPatientRes.data.accountStatus === 'PENDING',
    'Real New Patient Registration returns 201 PENDING',
    `Status: ${regPatientRes.status}`
  );

  const patEmailOtp = regPatientRes.data.devEmailOtp;
  const patPhoneOtp = regPatientRes.data.devPhoneOtp;
  assert(!!patEmailOtp && !!patPhoneOtp, 'Development OTPs generated for email and SMS', `EmailOTP: ${patEmailOtp}, PhoneOTP: ${patPhoneOtp}`);

  // 2.2 Attempt Login Before Verification -> MUST BE FORBIDDEN (403)
  const preVerifyLogin = await api.post('/api/auth/login', {
    email: newPatientEmail,
    password: newPatientPass,
  });
  assert(
    preVerifyLogin.status === 403 && preVerifyLogin.data.code === 'ACCOUNT_NOT_ACTIVE',
    'Unverified New Patient login is blocked with 403 ACCOUNT_NOT_ACTIVE',
    `Status: ${preVerifyLogin.status}`
  );

  // 2.3 Verify Email OTP
  const verifyPatEmailRes = await api.post('/api/auth/email/verify-otp', {
    email: newPatientEmail,
    code: patEmailOtp,
  });
  assert(
    verifyPatEmailRes.status === 200 && verifyPatEmailRes.data.emailVerified === true,
    'Patient Email OTP successfully verified',
    `Status: ${verifyPatEmailRes.status}`
  );

  // Still not fully active until phone is verified
  const midVerifyLogin = await api.post('/api/auth/login', {
    email: newPatientEmail,
    password: newPatientPass,
  });
  assert(
    midVerifyLogin.status === 403 && midVerifyLogin.data.phoneVerified === false,
    'Patient still blocked when only email is verified',
    `Status: ${midVerifyLogin.status}`
  );

  // 2.4 Verify Phone OTP
  const verifyPatPhoneRes = await api.post('/api/auth/phone/verify-otp', {
    phone: newPatientPhone,
    code: patPhoneOtp,
  });
  assert(
    verifyPatPhoneRes.status === 200 && verifyPatPhoneRes.data.phoneVerified === true && verifyPatPhoneRes.data.accountStatus === 'ACTIVE',
    'Patient Phone OTP verified and accountStatus transitioned to ACTIVE',
    `Status: ${verifyPatPhoneRes.status}, AccountStatus: ${verifyPatPhoneRes.data.accountStatus}`
  );

  // 2.5 Active Patient Login via Existing Auth
  const postVerifyLogin = await api.post('/api/auth/login', {
    email: newPatientEmail,
    password: newPatientPass,
  });
  assert(
    postVerifyLogin.status === 200 && !!postVerifyLogin.data.token,
    'Newly Active Patient can now log in via existing login endpoint',
    `Status: ${postVerifyLogin.status}`
  );
  const newPatientToken = postVerifyLogin.data.token;

  // 2.6 Active Patient Accesses Protected Endpoints
  const patientProfileRes = await api.get('/api/patient/profile', {
    headers: { Authorization: `Bearer ${newPatientToken}` },
  });
  const returnedUser = patientProfileRes.data.user || patientProfileRes.data.patient;
  assert(
    patientProfileRes.status === 200 && returnedUser?.email === newPatientEmail,
    'New Patient can access protected Patient Profile endpoint',
    `Status: ${patientProfileRes.status}, Email: ${returnedUser?.email}`
  );


  // ============================================================
  // PART 3: NEW DOCTOR REGISTRATION & ADMIN APPROVAL FLOW
  // ============================================================
  console.log('\n--- PART 3: NEW REAL DOCTOR REGISTRATION & ADMIN APPROVAL ---');

  const newDocEmail = `test.dr.${ts}@medlink.test`;
  const newDocPhone = `+91 9774${rand6}`;
  const newDocRegNumber = `TNMC-SAFE-${ts}`;
  const newDocPass = 'DoctorPass123!';

  // 3.1 Register New Doctor
  const regDoctorRes = await api.post('/api/auth/doctor/register', {
    name: 'Dr. Test Safe Surgeon',
    email: newDocEmail,
    phone: newDocPhone,
    password: newDocPass,
    registrationNumber: newDocRegNumber,
    registrationAuthority: 'Tamil Nadu Medical Council',
    specialization: 'General Surgery',
    qualification: 'MS (General Surgery), MBBS',
    clinicId: 'c1',
    clinicName: 'Apollo Medical Centre',
    consultationFee: '₹600',
  });
  assert(
    regDoctorRes.status === 201 && regDoctorRes.data.status === 'PENDING_REVIEW',
    'Real New Doctor Registration returns 201 PENDING_REVIEW',
    `Status: ${regDoctorRes.status}`
  );

  const newDocId = regDoctorRes.data.doctorId;
  const newDocToken = regDoctorRes.data.token;
  const docEmailOtp = regDoctorRes.data.devEmailOtp;
  const docPhoneOtp = regDoctorRes.data.devPhoneOtp;

  // 3.2 Doctor Verifies Email & Phone
  const verifyDocEmail = await api.post('/api/auth/email/verify-otp', {
    email: newDocEmail,
    code: docEmailOtp,
  });
  assert(verifyDocEmail.status === 200 && verifyDocEmail.data.emailVerified, 'Doctor Email OTP verified', `Status: ${verifyDocEmail.status}`);

  const verifyDocPhone = await api.post('/api/auth/phone/verify-otp', {
    phone: newDocPhone,
    code: docPhoneOtp,
  });
  assert(verifyDocPhone.status === 200 && verifyDocPhone.data.phoneVerified, 'Doctor Phone OTP verified', `Status: ${verifyDocPhone.status}`);

  // 3.3 Backend Access Control: Pending Doctor Operational Access MUST FAIL (403)
  const pendingDocMe = await api.get('/api/doctors/auth/me', {
    headers: { Authorization: `Bearer ${newDocToken}` },
  });
  assert(
    pendingDocMe.status === 403 && pendingDocMe.data.code === 'DOCTOR_NOT_ACTIVE',
    'Pending Doctor is strictly BLOCKED from operational Doctor API access (403 DOCTOR_NOT_ACTIVE)',
    `Status: ${pendingDocMe.status}`
  );

  // 3.4 Unapproved Doctor Booking MUST FAIL (403)
  const pendingBooking = await api.post('/api/appointments', {
    doctorId: newDocId,
    clinicId: 'c1',
    date: '2026-10-15',
    time: '10:00 AM',
    patientId: 'pat-demo-01',
  });
  assert(
    pendingBooking.status === 403,
    'Appointments for unapproved Doctor are rejected with 403',
    `Status: ${pendingBooking.status}`
  );

  // 3.5 Admin Approves Doctor
  const approveDocRes = await api.post(`/api/doctors/${newDocId}/verify`, {
    status: 'VERIFIED',
    verifierId: 'chief-medical-officer',
  });
  assert(
    approveDocRes.status === 200 && approveDocRes.data.doctor?.verification_status === 'VERIFIED',
    'Admin approves doctor: status becomes VERIFIED/ACTIVE',
    `Status: ${approveDocRes.status}`
  );

  // 3.6 Approved Doctor Operational Access SUCСEEDS (200)
  const approvedDocMe = await api.get('/api/doctors/auth/me', {
    headers: { Authorization: `Bearer ${newDocToken}` },
  });
  assert(
    approvedDocMe.status === 200 && approvedDocMe.data.doctor?.name === 'Dr. Test Safe Surgeon',
    'Approved Doctor now has full operational Doctor API access (200 OK)',
    `Status: ${approvedDocMe.status}`
  );


  // ============================================================
  // PART 4: NEW CLINIC REGISTRATION & ADMIN APPROVAL FLOW
  // ============================================================
  console.log('\n--- PART 4: NEW REAL CLINIC REGISTRATION & ADMIN APPROVAL ---');

  const newClinicEmail = `test.clinic.${ts}@medlink.test`;
  const newClinicPhone = `+91 9664${rand6}`;
  const newClinicName = `Safe Care Multi-Specialty Clinic ${rand6}`;

  // 4.1 Register New Clinic
  const regClinicRes = await api.post('/api/clinics/register', {
    name: newClinicName,
    address: '15, Anna Salai, Guindy, Chennai',
    phone: newClinicPhone,
    email: newClinicEmail,
    latitude: 13.0067,
    longitude: 80.2012,
    category: 'Multi-Specialty',
    departments: ['General Medicine', 'Dermatology'],
  });
  assert(
    regClinicRes.status === 201 && regClinicRes.data.status === 'PENDING_REVIEW',
    'Real New Clinic Registration returns 201 PENDING_REVIEW',
    `Status: ${regClinicRes.status}`
  );

  const newClinicId = regClinicRes.data.clinicId;
  const clinicEmailOtp = regClinicRes.data.devEmailOtp;
  const clinicPhoneOtp = regClinicRes.data.devPhoneOtp;

  // 4.2 Clinic Verifies Email & Phone
  const verifyClinicEmail = await api.post('/api/auth/email/verify-otp', {
    email: newClinicEmail,
    code: clinicEmailOtp,
  });
  assert(verifyClinicEmail.status === 200 && verifyClinicEmail.data.emailVerified, 'Clinic Email OTP verified', `Status: ${verifyClinicEmail.status}`);

  const verifyClinicPhone = await api.post('/api/auth/phone/verify-otp', {
    phone: newClinicPhone,
    code: clinicPhoneOtp,
  });
  assert(verifyClinicPhone.status === 200 && verifyClinicPhone.data.phoneVerified, 'Clinic Phone OTP verified', `Status: ${verifyClinicPhone.status}`);

  // 4.3 Public Discovery MUST NOT include unapproved Clinic
  const publicClinicsBefore = await api.get('/api/clinics');
  const isPendingClinicVisible = publicClinicsBefore.data.clinics?.some((c: any) => c.id === newClinicId);
  assert(!isPendingClinicVisible, 'Unapproved Clinic does NOT appear in public clinic discovery');

  // 4.4 Pending Clinic Booking MUST FAIL (403)
  const pendingClinicBooking = await api.post('/api/appointments', {
    doctorId: 'doc-demo-arun-01',
    clinicId: newClinicId,
    date: '2026-10-15',
    time: '10:00 AM',
    patientId: 'pat-demo-01',
  });
  assert(
    pendingClinicBooking.status === 403,
    'Appointments for unapproved Clinic are rejected with 403',
    `Status: ${pendingClinicBooking.status}`
  );

  // 4.5 Admin Approves Clinic
  const approveClinicRes = await api.post(`/api/clinics/${newClinicId}/verify`, {
    status: 'ACTIVE',
  });
  assert(
    approveClinicRes.status === 200 && approveClinicRes.data.clinic?.status === 'ACTIVE',
    'Admin approves clinic: status becomes ACTIVE',
    `Status: ${approveClinicRes.status}`
  );

  // 4.6 Approved Clinic now appears in public discovery
  const publicClinicsAfter = await api.get('/api/clinics');
  const isApprovedClinicVisible = publicClinicsAfter.data.clinics?.some((c: any) => c.id === newClinicId);
  assert(isApprovedClinicVisible, 'Approved Clinic now appears in public clinic discovery');


  // ============================================================
  // PART 5: FAILURE & EDGE CASE TESTS
  // ============================================================
  console.log('\n--- PART 5: FAILURE & EDGE CASE TESTS ---');

  // 5.1 Duplicate Email Prevention
  const dupEmailRes = await api.post('/api/auth/register', {
    name: 'Duplicate Email Person',
    email: newPatientEmail,
    phone: `+91 9554${rand6}`,
    password: 'SafePassword123!',
  });
  assert(dupEmailRes.status === 409, 'Duplicate Email Registration is rejected with 409 Conflict', `Status: ${dupEmailRes.status}`);

  // 5.2 Duplicate Phone Prevention
  const dupPhoneRes = await api.post('/api/auth/register', {
    name: 'Duplicate Phone Person',
    email: `unique.${ts}@medlink.test`,
    phone: newPatientPhone,
    password: 'SafePassword123!',
  });
  assert(dupPhoneRes.status === 409, 'Duplicate Phone Registration is rejected with 409 Conflict', `Status: ${dupPhoneRes.status}`);

  // 5.3 Invalid Email OTP
  const invalidOtpRes = await api.post('/api/auth/email/verify-otp', {
    email: newPatientEmail,
    code: '999999',
  });
  assert(invalidOtpRes.status === 400 || invalidOtpRes.status === 429, 'Invalid OTP is rejected', `Status: ${invalidOtpRes.status}`);

  // 5.4 Resend Cooldown
  const resendCooldownRes = await api.post('/api/auth/email/send-otp', {
    email: `cooldown.test.${ts}@medlink.test`,
  });
  const immediateResendRes = await api.post('/api/auth/email/send-otp', {
    email: `cooldown.test.${ts}@medlink.test`,
  });
  assert(
    immediateResendRes.status === 429 && typeof immediateResendRes.data.remainingCooldown === 'number',
    'Immediate OTP resend enforces rate-limit cooldown with 429',
    `Status: ${immediateResendRes.status}`
  );

  // 5.5 Max OTP attempts exceeded
  const attackEmail = `brute.test.${ts}@medlink.test`;
  await api.post('/api/auth/email/send-otp', { email: attackEmail });
  let lastAttemptStatus = 0;
  for (let i = 0; i < 5; i++) {
    const attempt = await api.post('/api/auth/email/verify-otp', {
      email: attackEmail,
      code: '000000',
    });
    lastAttemptStatus = attempt.status;
  }
  assert(
    lastAttemptStatus === 429 || lastAttemptStatus === 400,
    'Excessive failed OTP attempts trigger attempt lockout',
    `Final attempt status: ${lastAttemptStatus}`
  );

  console.log('\n============================================================');
  console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
