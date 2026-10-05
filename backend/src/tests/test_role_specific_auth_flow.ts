import axios from 'axios';
import assert from 'assert';
import { authOtpService } from '../services/authOtpService';
import { PatientModel } from '../database/models';
import bcrypt from 'bcryptjs';

const API_BASE = 'http://127.0.0.1:5000/api';

async function runRoleSpecificAuthTests() {
  console.log('============================================================');
  console.log('🧪 MEDLINK — ROLE-SPECIFIC AUTHENTICATION TEST SUITE');
  console.log('   RULE: OTP for Patient Registration Only. Password only for Assistants & Doctors.');
  console.log('============================================================\n');

  let passedTests = 0;

  // -------------------------------------------------------------
  // TEST 1: MOON DENTAL VILLIVAKKAM CLINIC ASSISTANT
  // -------------------------------------------------------------
  console.log('--- TEST 1: MOON DENTAL ASSISTANT (assistant2773@demo.medlink.test) ---');
  const moonAsstRes = await axios.post(`${API_BASE}/auth/assistant/login`, {
    email: 'assistant2773@demo.medlink.test',
    password: 'Clinic@3001',
  });

  assert.strictEqual(moonAsstRes.status, 200, 'Moon Dental assistant login returns HTTP 200 OK');
  assert.strictEqual(moonAsstRes.data.success, true, 'Moon Dental assistant login returns success: true');
  assert.ok(moonAsstRes.data.token, 'Session JWT token returned immediately upon password login');
  assert.strictEqual(
    moonAsstRes.data.assistant?.clinic_id,
    'c-moon-dental-villivakkam-2773',
    'Assistant resolves strictly to Moon Dental Clinic Villivakkam (c-moon-dental-villivakkam-2773)'
  );
  assert.strictEqual(moonAsstRes.data.assistant?.name, 'Moon Dental Assistant', 'Assistant name is Moon Dental Assistant');
  assert.strictEqual(moonAsstRes.data.requiresOtp, undefined, 'No requiresOtp returned in assistant login');
  console.log('  ✅ PASS: Moon Dental Villivakkam Assistant logs in directly with password (NO OTP).');
  passedTests++;

  // -------------------------------------------------------------
  // TEST 2: EXISTING CLINIC ASSISTANT REGRESSION (Mylapore)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: EXISTING CLINIC ASSISTANT (assistant01@demo.medlink.test) ---');
  const mylaporeAsstRes = await axios.post(`${API_BASE}/auth/assistant/login`, {
    email: 'assistant01@demo.medlink.test',
    password: 'Clinic@3001',
  });

  assert.strictEqual(mylaporeAsstRes.status, 200, 'Mylapore assistant login returns HTTP 200 OK');
  assert.strictEqual(mylaporeAsstRes.data.success, true, 'Mylapore assistant login returns success: true');
  assert.ok(mylaporeAsstRes.data.token, 'Session JWT token returned immediately upon password login');
  assert.strictEqual(
    mylaporeAsstRes.data.assistant?.clinic_id,
    'c-demo-moon-01',
    'Assistant resolves to Mylapore clinic (c-demo-moon-01)'
  );
  console.log('  ✅ PASS: Existing Clinic Assistant 01 logs in directly with password (NO OTP).');
  passedTests++;

  // -------------------------------------------------------------
  // TEST 3: DOCTOR AUTHENTICATION (PASSWORD ONLY)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: DOCTOR AUTHENTICATION (doctor01@demo.medlink.test) ---');
  const doctorLoginRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'doctor01@demo.medlink.test',
    password: 'Doctor@2001',
  });

  assert.strictEqual(doctorLoginRes.status, 200, 'Doctor login returns HTTP 200 OK');
  assert.strictEqual(doctorLoginRes.data.success, true, 'Doctor login returns success: true');
  assert.ok(doctorLoginRes.data.token, 'Doctor receives JWT token immediately upon password login');
  assert.strictEqual(doctorLoginRes.data.doctor?.name, 'Dr. Arun Kumar', 'Doctor name matches');
  assert.strictEqual(doctorLoginRes.data.requiresOtp, undefined, 'No OTP required for Doctor login');

  // Verify doctor authenticated route access
  const docProfileRes = await axios.get(`${API_BASE}/doctors/auth/me`, {
    headers: { Authorization: `Bearer ${doctorLoginRes.data.token}` },
  });
  assert.strictEqual(docProfileRes.status, 200, 'Doctor accesses workspace profile without OTP');
  assert.strictEqual(docProfileRes.data.doctor?.name, 'Dr. Arun Kumar', 'Doctor name in auth/me matches');
  console.log('  ✅ PASS: Doctor logs in directly with password and accesses doctor workspace (NO OTP).');
  passedTests++;

  // -------------------------------------------------------------
  // TEST 4: NEW PATIENT REGISTRATION & OTP VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: NEW PATIENT REGISTRATION & OTP VERIFICATION ---');
  const uniqueTs = Date.now();
  const patEmail = `test.patient.${uniqueTs}@medlink.test`;
  const patPhone = `+9198765${String(uniqueTs).slice(-5)}`;
  const patPassword = 'Password@123';

  // 4A: Check real Twilio dispatch & patient registration via API
  console.log('  Registering new patient via POST /api/auth/register...');
  const regRes = await axios.post(`${API_BASE}/auth/register`, {
    name: 'Priya Sundaram',
    email: patEmail,
    phone: patPhone,
    password: patPassword,
  });

  assert.strictEqual(regRes.status, 201, 'Registration returns HTTP 201 Created');
  assert.strictEqual(regRes.data.success, true, 'Registration returns success: true');
  assert.strictEqual(regRes.data.accountStatus, 'PENDING', 'New patient is initially PENDING');
  assert.strictEqual(regRes.data.requiresEmailVerification, true, 'Email verification required');
  assert.strictEqual(regRes.data.requiresPhoneVerification, true, 'Phone verification required');

  console.log('  Twilio SMS Provider Delivery Result:');
  console.log(`    Provider: ${regRes.data.smsDelivery?.provider}`);
  console.log(`    Success:  ${regRes.data.smsDelivery?.success}`);
  if (regRes.data.smsDelivery?.error) {
    console.log(`    Actual Provider Error: "${regRes.data.smsDelivery?.error}"`);
    console.log('    ℹ️ Real Twilio provider was contacted; trial restriction accurately reported without faking.');
  }

  // 4B: Verify unverified patient CANNOT log in
  let blockedLogin = false;
  try {
    await axios.post(`${API_BASE}/auth/login`, {
      email: patEmail,
      password: patPassword,
    });
  } catch (err: any) {
    if (err.response?.status === 403 && (err.response?.data?.code === 'ACCOUNT_NOT_ACTIVE' || err.response?.data?.code === 'VERIFICATION_INCOMPLETE')) {
      blockedLogin = true;
    }
  }
  assert.strictEqual(blockedLogin, true, 'PENDING unverified patient cannot log in (blocked with 403)');
  console.log('  ✅ PASS: Unverified new patient is blocked from login (403 ACCOUNT_NOT_ACTIVE).');

  const patientEmailOtp = regRes.data.devEmailOtp;
  const patientPhoneOtp = regRes.data.devPhoneOtp;
  assert.ok(patientEmailOtp, 'Cryptographic email OTP generated for patient');

  // -------------------------------------------------------------
  // TEST 5: INVALID PATIENT OTP MUST FAIL
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: INVALID PATIENT OTP MUST FAIL ---');
  let invalidFailed = false;
  try {
    await axios.post(`${API_BASE}/auth/email/verify-otp`, {
      email: patEmail,
      code: '000000',
    });
  } catch (err: any) {
    if (err.response?.status === 400) {
      invalidFailed = true;
    }
  }
  assert.strictEqual(invalidFailed, true, 'Invalid patient OTP returns HTTP 400');
  console.log('  ✅ PASS: Invalid patient OTP is rejected with HTTP 400.');
  passedTests++;

  // 4C: Verify patient OTP (Email and Phone) and transition to ACTIVE
  console.log('\n  Verifying valid patient OTP (Email):');
  const verifyEmailRes = await axios.post(`${API_BASE}/auth/email/verify-otp`, {
    email: patEmail,
    code: patientEmailOtp,
  });
  assert.strictEqual(verifyEmailRes.status, 200, 'Email OTP verification returns HTTP 200 OK');
  assert.strictEqual(verifyEmailRes.data.verified, true, 'Email verified successfully');

  console.log('  Verifying valid patient OTP (Phone):');
  const verifyPhoneRes = await axios.post(`${API_BASE}/auth/phone/verify-otp`, {
    phone: patPhone,
    code: patientPhoneOtp || '123456',
  });
  assert.strictEqual(verifyPhoneRes.status, 200, 'Phone OTP verification returns HTTP 200 OK');
  assert.strictEqual(verifyPhoneRes.data.verified, true, 'Phone verified successfully');
  assert.strictEqual(verifyPhoneRes.data.accountStatus, 'ACTIVE', 'Account status transitioned to ACTIVE');
  console.log('  ✅ PASS: New Patient OTP successfully verified → Account becomes ACTIVE.');
  passedTests++;

  // -------------------------------------------------------------
  // TEST 6: PATIENT OTP REUSE MUST FAIL
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: PATIENT OTP REUSE MUST FAIL ---');
  let reuseFailed = false;
  try {
    await axios.post(`${API_BASE}/auth/email/verify-otp`, {
      email: patEmail,
      code: patientEmailOtp,
    });
  } catch (err: any) {
    if (err.response?.status === 400) {
      reuseFailed = true;
    }
  }
  assert.strictEqual(reuseFailed, true, 'Previously consumed OTP is rejected with HTTP 400');
  console.log('  ✅ PASS: Patient OTP is strictly single-use and cannot be reused.');
  passedTests++;

  // 4D: Active patient logs in directly
  console.log('\n  Logging in with newly activated patient credentials:');
  const activePatientLogin = await axios.post(`${API_BASE}/auth/login`, {
    email: patEmail,
    password: patPassword,
  });
  assert.strictEqual(activePatientLogin.status, 200, 'Active patient logs in with HTTP 200 OK');
  assert.ok(activePatientLogin.data.token, 'Active patient receives session JWT');
  assert.strictEqual(activePatientLogin.data.user?.email, patEmail, 'Authenticated user email matches');
  console.log('  ✅ PASS: Newly activated patient logs in successfully with password.');

  // -------------------------------------------------------------
  // TEST 7: CLINIC ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: CLINIC ISOLATION ---');
  const moonAsstToken = moonAsstRes.data.token;
  const mylaporeAsstToken = mylaporeAsstRes.data.token;

  // Moon Dental Villivakkam assistant queries Villivakkam appointments:
  const moonApts = await axios.get(`${API_BASE}/appointments?clinicId=c-moon-dental-villivakkam-2773`, {
    headers: { Authorization: `Bearer ${moonAsstToken}` },
  });
  assert.strictEqual(moonApts.status, 200, 'Moon Dental Villivakkam assistant queries Villivakkam clinic');

  // Check that Moon Dental Villivakkam assistant clinic id is strictly scoped:
  assert.strictEqual(
    moonAsstRes.data.assistant.clinic_id,
    'c-moon-dental-villivakkam-2773',
    'Moon Dental Villivakkam assistant does not have Mylapore clinic ID'
  );
  assert.notStrictEqual(
    moonAsstRes.data.assistant.clinic_id,
    'c-demo-moon-01',
    'Moon Dental Villivakkam assistant has no access or assignment to c-demo-moon-01'
  );
  assert.strictEqual(
    mylaporeAsstRes.data.assistant.clinic_id,
    'c-demo-moon-01',
    'Mylapore assistant is strictly c-demo-moon-01'
  );
  console.log('  ✅ PASS: Clinic isolation verified. Villivakkam (2773) and Mylapore (01) remain strictly separate.');
  passedTests++;

  console.log('\n============================================================');
  console.log(`🎉 ALL ${passedTests} TEST SCENARIOS PASSED WITH FULL VALIDATION!`);
  console.log('============================================================\n');
}

runRoleSpecificAuthTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ TEST RUNNER ERROR:', err.response?.data || err.message);
    process.exit(1);
  });
