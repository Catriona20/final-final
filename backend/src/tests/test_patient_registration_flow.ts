import axios from 'axios';
import assert from 'assert';

const API_BASE = 'http://127.0.0.1:5000/api';

async function runPatientRegistrationTests() {
  console.log('============================================================');
  console.log('🧪 MEDLINK — PATIENT REGISTRATION & OTP VERIFICATION TESTS');
  console.log('============================================================\n');

  const uniqueId = Date.now();
  const testName = 'Neha Venkat';
  const testEmail = `neha.reg.${uniqueId}@medlink.test`;
  const testPhone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testPassword = 'Password@123';
  const testBloodGroup = 'B+';

  // -------------------------------------------------------------
  // TEST 1: NEW PATIENT REGISTRATION (PENDING STATE)
  // -------------------------------------------------------------
  console.log('--- TEST 1: NEW PATIENT REGISTRATION (PENDING STATE) ---');
  const regRes = await axios.post(`${API_BASE}/auth/register`, {
    name: testName,
    email: testEmail,
    phone: testPhone,
    password: testPassword,
    bloodGroup: testBloodGroup,
    gender: 'Female',
    age: 26,
  });

  assert.strictEqual(regRes.status, 201, 'Registration returns HTTP 201 Created');
  assert.strictEqual(regRes.data.success, true, 'Registration returns success: true');
  assert.strictEqual(regRes.data.accountStatus, 'PENDING', 'New patient accountStatus must be PENDING');
  assert.strictEqual(regRes.data.requiresEmailVerification, true, 'Requires email verification');
  assert.strictEqual(regRes.data.requiresPhoneVerification, true, 'Requires phone verification');
  assert.ok(regRes.data.patientId, 'Patient ID is returned');
  console.log(`  ✅ PASS: New patient registered in PENDING state (ID: ${regRes.data.patientId})`);

  // -------------------------------------------------------------
  // TEST 2: DIRECT NAVIGATION PROTECTION (UNVERIFIED CANNOT LOG IN)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: DIRECT NAVIGATION PROTECTION (UNVERIFIED BLOCKED) ---');
  let unverifiedBlocked = false;
  try {
    await axios.post(`${API_BASE}/auth/login`, {
      email: testEmail,
      password: testPassword,
    });
  } catch (err: any) {
    if (err.response?.status === 403 && err.response?.data?.code === 'ACCOUNT_NOT_ACTIVE') {
      unverifiedBlocked = true;
    }
  }
  assert.strictEqual(unverifiedBlocked, true, 'Unverified patient login is strictly blocked with 403 ACCOUNT_NOT_ACTIVE');
  console.log('  ✅ PASS: Unverified patient login is blocked with 403 ACCOUNT_NOT_ACTIVE');

  // -------------------------------------------------------------
  // TEST 3: INVALID OTP REJECTION
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: INVALID OTP REJECTION ---');
  let invalidOtpBlocked = false;
  try {
    await axios.post(`${API_BASE}/auth/verify-otp`, {
      phoneOrEmail: testEmail,
      code: '000000',
    });
  } catch (err: any) {
    if (err.response?.status === 400) {
      invalidOtpBlocked = true;
    }
  }
  assert.strictEqual(invalidOtpBlocked, true, 'Invalid OTP is rejected with 400 Bad Request');
  console.log('  ✅ PASS: Invalid OTP code is properly rejected');

  // -------------------------------------------------------------
  // TEST 4: VERIFY OTP VIA UNIFIED ENDPOINT -> TRANSITION TO ACTIVE
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: VERIFY OTP -> TRANSITION TO ACTIVE ---');
  // Get dev generated OTP from dev response or generate fresh
  const otpCode = regRes.data.devEmailOtp || regRes.data.devPhoneOtp;
  assert.ok(otpCode, 'Server generated cryptographic OTP for registration');
  console.log(`  ℹ️ Server OTP generated: ${otpCode}`);

  const verifyRes = await axios.post(`${API_BASE}/auth/verify-otp`, {
    phoneOrEmail: testEmail,
    code: otpCode,
    email: testEmail,
    phone: testPhone,
  });

  assert.strictEqual(verifyRes.status, 200, 'Verification returns HTTP 200 OK');
  assert.strictEqual(verifyRes.data.success, true, 'Verification returns success: true');
  assert.ok(verifyRes.data.token, 'JWT session token returned upon verification');
  assert.strictEqual(verifyRes.data.user?.account_status, 'ACTIVE', 'Patient transitioned to ACTIVE state');
  assert.strictEqual(verifyRes.data.user?.is_active, true, 'Patient is_active is true');
  console.log('  ✅ PASS: OTP successfully verified and patient transitioned to ACTIVE');

  // -------------------------------------------------------------
  // TEST 5: ACTIVE PATIENT LOGS IN DIRECTLY (PATIENT HOME ACCESS)
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: ACTIVE PATIENT LOGIN & PROFILE ACCESS ---');
  const activeLoginRes = await axios.post(`${API_BASE}/auth/login`, {
    email: testEmail,
    password: testPassword,
  });

  assert.strictEqual(activeLoginRes.status, 200, 'Active patient login returns 200 OK');
  assert.ok(activeLoginRes.data.token, 'Active patient receives session token');
  const token = activeLoginRes.data.token;

  const profileRes = await axios.get(`${API_BASE}/patient/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(profileRes.status, 200, 'Active patient queries profile');
  assert.strictEqual(profileRes.data.user?.email, testEmail.toLowerCase(), 'Profile matches registered patient');
  console.log('  ✅ PASS: Verified active patient logs in and accesses authenticated Patient Home');

  // -------------------------------------------------------------
  // TEST 6: DEMO PATIENT LOGIN UNTOUCHED (NO OTP REQUIRED)
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: DEMO PATIENT LOGIN UNTOUCHED ---');
  const demoPatientLogin = await axios.post(`${API_BASE}/auth/login`, {
    email: 'patient01@demo.medlink.test',
    password: 'Demo@1001',
  });
  assert.strictEqual(demoPatientLogin.status, 200, 'Demo patient logs in with 200 OK');
  assert.ok(demoPatientLogin.data.token, 'Demo patient receives JWT without OTP requirement');
  assert.strictEqual(demoPatientLogin.data.user?.name, 'Aarav Sharma', 'Demo patient 01 is Aarav Sharma');
  console.log('  ✅ PASS: Demo Patient 01 (Aarav Sharma) logs in directly without OTP');

  // -------------------------------------------------------------
  // TEST 7: DEMO DOCTOR & ASSISTANT LOGIN UNTOUCHED
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: DEMO DOCTOR & ASSISTANT LOGIN UNTOUCHED ---');
  const demoDoctorLogin = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'doctor01@demo.medlink.test',
    password: 'Doctor@2001',
  });
  assert.strictEqual(demoDoctorLogin.status, 200, 'Demo doctor logs in with 200 OK');
  assert.ok(demoDoctorLogin.data.token, 'Demo doctor receives JWT token');
  console.log('  ✅ PASS: Demo Doctor 01 logs in directly');

  const demoAssistantLogin = await axios.post(`${API_BASE}/auth/assistant/login`, {
    email: 'assistant01@demo.medlink.test',
    password: 'Clinic@3001',
  });
  assert.strictEqual(demoAssistantLogin.status, 200, 'Demo assistant logs in with 200 OK');
  assert.ok(demoAssistantLogin.data.token, 'Demo assistant receives JWT token');
  console.log('  ✅ PASS: Demo Clinic Assistant 01 logs in directly');

  console.log('\n============================================================');
  console.log('🎉 ALL PATIENT REGISTRATION & OTP VERIFICATION TESTS PASSED!');
  console.log('============================================================\n');
}

runPatientRegistrationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TEST FAILED:', err.response?.data || err.message);
    process.exit(1);
  });
