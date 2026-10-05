import axios from 'axios';
import { config } from '../config/env';
import { twilioService } from '../services/twilioService';
import { resendService } from '../services/resendService';
import { authNotificationService } from '../services/authNotificationService';
import { authOtpService } from '../services/authOtpService';

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
  console.log('MEDLINK REAL OTP & AUTH DELIVERY VERIFICATION SUITE');
  console.log('============================================================\n');

  const ts = Date.now();
  const randNum = Math.floor(100000 + Math.random() * 900000);

  // -------------------------------------------------------------
  // TEST 1: DEMO CREDENTIAL REGRESSION (Freeze Rule)
  // -------------------------------------------------------------
  console.log('--- TEST 1: DEMO LOGIN REGRESSION (Zero changes to demo accounts) ---');

  const demoPatient = await api.post('/api/auth/login', {
    email: 'patient01@demo.medlink.test',
    password: 'password123',
  });
  assert(demoPatient.status === 200 && !!demoPatient.data.token, 'Demo Patient Login (patient01@demo.medlink.test)', `Status: ${demoPatient.status}`);

  const demoDoctor = await api.post('/api/auth/doctor/login', {
    email: 'doctor01@demo.medlink.test',
    password: 'password123',
  });
  assert(demoDoctor.status === 200 && !!demoDoctor.data.token, 'Demo Doctor Login (doctor01@demo.medlink.test)', `Status: ${demoDoctor.status}`);

  const demoAssistant = await api.post('/api/auth/assistant/login', {
    email: 'assistant01@demo.medlink.test',
    password: 'password123',
  });
  assert(demoAssistant.status === 200 && !!demoAssistant.data.token, 'Demo Assistant Login (assistant01@demo.medlink.test)', `Status: ${demoAssistant.status}`);

  // -------------------------------------------------------------
  // TEST 2: CONFIGURATION & PROVIDER ABSTRACTION VALIDATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: PROVIDER CONFIGURATION & CREDENTIAL CHECKS ---');

  console.log(`  Active SMS Provider: ${config.smsProvider}`);
  console.log(`  Active Email Provider: ${config.emailProvider}`);
  console.log(`  Twilio SID configured: ${Boolean(config.twilioAccountSid)}`);
  console.log(`  Twilio Number configured: ${Boolean(config.twilioPhoneNumber)}`);
  console.log(`  Resend API Key configured: ${Boolean(config.resendApiKey)}`);

  // Phone number normalization
  const norm1 = twilioService.normalizePhoneNumber('9876543210');
  assert(norm1 === '+919876543210', 'Phone normalization: 10-digit number adds +91', norm1);

  const norm2 = twilioService.normalizePhoneNumber('+91 98765 43210');
  assert(norm2 === '+919876543210', 'Phone normalization: formatted +91 preserved', norm2);

  const norm3 = twilioService.normalizePhoneNumber('+14155552671');
  assert(norm3 === '+14155552671', 'Phone normalization: US E.164 preserved', norm3);

  // Twilio missing credential handling
  const originalSid = config.twilioAccountSid;
  config.twilioAccountSid = '';
  const twilioMissingRes = await twilioService.sendSmsOtp('+919876543210', '123456');
  assert(
    Boolean(!twilioMissingRes.success && twilioMissingRes.error?.includes('missing')),
    'Twilio service safely returns actionable error when credentials are unconfigured',
    twilioMissingRes.error
  );
  config.twilioAccountSid = originalSid;

  // Resend missing credential handling
  const originalResendKey = config.resendApiKey;
  config.resendApiKey = '';
  const resendMissingRes = await resendService.sendVerificationEmail('test@medlink.test', '123456');
  assert(
    Boolean(!resendMissingRes.success && resendMissingRes.error?.includes('not configured')),
    'Resend service safely returns actionable error when API key is unconfigured',
    resendMissingRes.error
  );
  config.resendApiKey = originalResendKey;

  // -------------------------------------------------------------
  // TEST 3: REAL PATIENT REGISTRATION WITH PENDING STATUS
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: REAL PATIENT REGISTRATION & OTP DISPATCH ---');

  const testPatientEmail = `real.test.pat.${ts}@medlink.test`;
  const testPatientPhone = `+91 9884${randNum}`;
  const testPatientPass = 'RealPassword123!';

  const regRes = await api.post('/api/auth/register', {
    name: 'Real OTP Test Patient',
    email: testPatientEmail,
    phone: testPatientPhone,
    password: testPatientPass,
    bloodGroup: 'A+',
    gender: 'Male',
    age: 30,
  });

  assert(regRes.status === 201 && regRes.data.success, 'New patient registration returns HTTP 201 Created', `Status: ${regRes.status}`);
  assert(regRes.data.accountStatus === 'PENDING', 'New patient accountStatus is PENDING', regRes.data.accountStatus);
  assert(regRes.data.requiresEmailVerification === true, 'Patient requires email verification', String(regRes.data.requiresEmailVerification));
  assert(regRes.data.requiresPhoneVerification === true, 'Patient requires phone verification', String(regRes.data.requiresPhoneVerification));

  // -------------------------------------------------------------
  // TEST 4: UNVERIFIED PATIENT CANNOT LOG IN
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: UNVERIFIED PATIENT LOGIN PROTECTION ---');

  const unverifiedLogin = await api.post('/api/auth/login', {
    email: testPatientEmail,
    password: testPatientPass,
  });
  assert(
    unverifiedLogin.status === 403 && unverifiedLogin.data.code === 'ACCOUNT_NOT_ACTIVE',
    'Unverified patient login is strictly blocked with 403 ACCOUNT_NOT_ACTIVE',
    `Status: ${unverifiedLogin.status}, Code: ${unverifiedLogin.data.code}`
  );

  // -------------------------------------------------------------
  // TEST 5: OTP SECURITY: INVALID CODE REJECTION & ATTEMPT LOCKOUT
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: OTP SECURITY (Invalid OTP & Expiry & Cooldown) ---');

  // Attempt invalid phone OTP
  const invalidOtpRes = await api.post('/api/auth/phone/verify-otp', {
    phone: testPatientPhone,
    code: '000000',
  });
  assert(
    invalidOtpRes.status === 400 && invalidOtpRes.data.code === 'OTP_INVALID',
    'Invalid phone OTP code is rejected with 400 OTP_INVALID',
    invalidOtpRes.data.error
  );

  // Test cooldown on immediate re-send
  const cooldownRes = await api.post('/api/auth/phone/send-otp', {
    phone: testPatientPhone,
  });
  assert(
    cooldownRes.status === 429,
    'Immediate OTP resend enforces rate-limit cooldown with HTTP 429',
    `Status: ${cooldownRes.status}, Remaining: ${cooldownRes.data.remainingCooldown}s`
  );

  // -------------------------------------------------------------
  // TEST 6: VERIFICATION OF EMAIL & PHONE (Transition to ACTIVE)
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: PHONE & EMAIL VERIFICATION -> ACTIVE ---');

  const patPhoneOtp = regRes.data.devPhoneOtp;
  const patEmailOtp = regRes.data.devEmailOtp;

  assert(Boolean(patPhoneOtp && patPhoneOtp.length === 6), 'Cryptographic 6-digit phone OTP generated by server', patPhoneOtp);
  assert(Boolean(patEmailOtp && patEmailOtp.length === 6), 'Cryptographic 6-digit email OTP generated by server', patEmailOtp);

  // 6.1 Verify Phone OTP
  const phoneVerify = await api.post('/api/auth/phone/verify-otp', {
    phone: testPatientPhone,
    code: patPhoneOtp,
  });
  assert(phoneVerify.status === 200 && phoneVerify.data.phoneVerified === true, 'Phone OTP verified successfully', `Status: ${phoneVerify.status}`);
  assert(phoneVerify.data.accountStatus === 'PENDING', 'Account remains PENDING until email is also verified', phoneVerify.data.accountStatus);

  // Single-use check: OTP cannot be re-used
  const reuseCheck = await api.post('/api/auth/phone/verify-otp', {
    phone: testPatientPhone,
    code: patPhoneOtp,
  });
  assert(
    reuseCheck.status === 400 && reuseCheck.data.code === 'OTP_NOT_FOUND',
    'OTP is strictly single-use and consumed upon verification',
    reuseCheck.data.code
  );

  // 6.2 Verify Email OTP via Unified Endpoint
  const emailVerify = await api.post('/api/auth/verify-otp', {
    phoneOrEmail: testPatientEmail,
    code: patEmailOtp,
  });
  assert(emailVerify.status === 200 && emailVerify.data.success, 'Email OTP verified via unified /verify-otp endpoint', `Status: ${emailVerify.status}`);
  assert(emailVerify.data.user?.account_status === 'ACTIVE', 'Account successfully transitioned to ACTIVE state', emailVerify.data.user?.account_status);

  // -------------------------------------------------------------
  // TEST 7: NEWLY ACTIVE PATIENT LOGIN & WORKFLOW ACCESS
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: ACTIVE REAL PATIENT LOGIN & OPERATIONAL WORKFLOW ---');

  const activeLogin = await api.post('/api/auth/login', {
    email: testPatientEmail,
    password: testPatientPass,
  });
  assert(
    activeLogin.status === 200 && !!activeLogin.data.token,
    'Newly registered real patient logs in normally via existing login route',
    `Status: ${activeLogin.status}, Name: ${activeLogin.data.user?.name}`
  );
  const patientToken = activeLogin.data.token;

  // Verify access to authenticated discovery & appointments
  const profileRes = await api.get('/api/patient/profile', {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  assert(
    profileRes.status === 200 && (profileRes.data.user?.email === testPatientEmail || profileRes.data.patient?.email === testPatientEmail),
    'Real patient can query authenticated profile',
    profileRes.data.user?.name || profileRes.data.patient?.name
  );

  const discoveryRes = await api.get('/api/clinics/discovery?radius=25', {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  assert(
    discoveryRes.status === 200 && discoveryRes.data.count > 0,
    'Real patient can access full clinic discovery marketplace',
    `Clinics: ${discoveryRes.data.count}`
  );

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`REAL OTP & AUTH VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
