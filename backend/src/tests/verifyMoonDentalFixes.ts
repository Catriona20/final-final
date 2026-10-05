import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

async function runVerification() {
  console.log('====================================================');
  console.log('🩺 MEDLINK: VERIFYING MOON DENTAL FIXES & ACCOUNTS');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;
  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // -----------------------------------------------------------------
  // 1. Clinic Assistant Login & OTP Flow
  // -----------------------------------------------------------------
  console.log('--- 1. Clinic Assistant Authentication & Flow ---');
  // 1.1 Login request reaches backend and returns valid JSON
  const asstLoginRes = await axios.post(`${API_BASE}/auth/assistant/login`, {
    email: 'assistant2773@demo.medlink.test',
    password: 'Clinic@3001',
  });
  assert(asstLoginRes.status === 200, 'Assistant login request reaches backend and returns HTTP 200');
  assert(asstLoginRes.data && typeof asstLoginRes.data === 'object', 'Assistant login returns valid JSON');
  assert(Boolean(asstLoginRes.data.token), 'Assistant login returns valid JWT token');
  assert(asstLoginRes.data.assistant?.clinic_id === 'c-moon-dental-villivakkam-2773', 'Assistant resolves to Moon Dental Clinic (c-moon-dental-villivakkam-2773)');

  // 1.2 OTP verification advances correctly
  const asstOtpRes = await axios.post(`${API_BASE}/auth/assistant/verify-otp`, {
    email: 'assistant2773@demo.medlink.test',
    otp: '302773',
  });
  assert(asstOtpRes.status === 200, 'Assistant OTP verification returns HTTP 200');
  assert(asstOtpRes.data.verified === true, 'Assistant OTP verification advances correctly (verified: true)');
  assert(asstOtpRes.data.clinic_id === 'c-moon-dental-villivakkam-2773', 'Assistant OTP verification returns clinic_id c-moon-dental-villivakkam-2773');

  // 1.3 Clinic details check for clinic selector
  const clinicRes = await axios.get(`${API_BASE}/clinics/c-moon-dental-villivakkam-2773`);
  assert(clinicRes.data.clinic?.name === 'Moon Dental Clinic', 'Clinic selector resolves to "Moon Dental Clinic"');
  assert(clinicRes.data.clinic?.clinic_number === 2773, 'Clinic number is 2773');

  // -----------------------------------------------------------------
  // 2. Doctor App Authentication & Identity Resolution
  // -----------------------------------------------------------------
  console.log('\n--- 2. Doctor App Authentication & Accounts ---');
  // 2.1 Dr. Alagu Vimalesh primary email password authentication
  const doc1Res = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'dr.alagu.vimalesh@moondental.test',
    password: 'Doctor@2773',
  });
  assert(doc1Res.data.doctor?.id === 'doc-alagu-vimalesh-2773', 'Dr. Alagu Vimalesh authenticates with primary email');
  assert(doc1Res.data.doctor?.name === 'Dr. Alagu Vimalesh', 'Dr. Alagu Vimalesh resolves to correct doctor record');

  // 2.2 Dr. Alagu Vimalesh demo alias authentication (dr.alagu@moondental.test)
  const doc1AliasRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'dr.alagu@moondental.test',
    password: 'Doctor@2773',
  });
  assert(doc1AliasRes.data.doctor?.id === 'doc-alagu-vimalesh-2773', 'Dr. Alagu Vimalesh authenticates with demo alias email (dr.alagu@moondental.test)');

  // 2.3 Identity resolution: Dr. Jeffrey Vimalesh resolves to Dr. Alagu Vimalesh without duplicates
  const doc1JeffreyRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'dr.jeffrey@moondental.test',
    password: 'Doctor@2773',
  });
  assert(doc1JeffreyRes.data.doctor?.id === 'doc-alagu-vimalesh-2773', 'Dr. Jeffrey Vimalesh resolves to Dr. Alagu Vimalesh identity without duplicates');

  // 2.4 Dr. Alagu Vimalesh OTP authentication
  const doc1OtpRes = await axios.post(`${API_BASE}/auth/doctor/verify-otp`, {
    email: 'dr.alagu@moondental.test',
    otp: '202773',
  });
  assert(doc1OtpRes.data.verified === true, 'Dr. Alagu Vimalesh authenticates via supported demo OTP (202773)');

  // 2.5 Dr. Alagu Vimalesh Clinic context & isolation
  const doc1ClinicsRes = await axios.get(`${API_BASE}/doctors/auth/clinics`, {
    headers: { Authorization: `Bearer ${doc1Res.data.token}` },
  });
  assert(doc1ClinicsRes.data.assignedClinicsCount === 1, 'Dr. Alagu Vimalesh is assigned to exactly 1 authorized clinic');
  assert(doc1ClinicsRes.data.clinics[0]?.id === 'c-moon-dental-villivakkam-2773', 'Dr. Alagu Vimalesh clinic context is c-moon-dental-villivakkam-2773');
  assert(doc1ClinicsRes.data.clinics[0]?.isPrimary === true, 'Moon Dental Clinic is primary');

  // 2.6 Dr. Merlin Rajan primary email password authentication
  const doc2Res = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'dr.merlin.rajan@moondental.test',
    password: 'Doctor@2773',
  });
  assert(doc2Res.data.doctor?.id === 'doc-merlin-rajan-2773', 'Dr. Merlin Rajan authenticates with primary email');
  assert(doc2Res.data.doctor?.name === 'Dr. Merlin Rajan', 'Dr. Merlin Rajan resolves to correct doctor record');

  // 2.7 Dr. Merlin Rajan demo alias authentication (dr.merlin@moondental.test)
  const doc2AliasRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'dr.merlin@moondental.test',
    password: 'Doctor@2773',
  });
  assert(doc2AliasRes.data.doctor?.id === 'doc-merlin-rajan-2773', 'Dr. Merlin Rajan authenticates with demo alias email (dr.merlin@moondental.test)');

  // 2.8 Dr. Merlin Rajan OTP authentication
  const doc2OtpRes = await axios.post(`${API_BASE}/auth/doctor/verify-otp`, {
    email: 'dr.merlin@moondental.test',
    otp: '202773',
  });
  assert(doc2OtpRes.data.verified === true, 'Dr. Merlin Rajan authenticates via supported demo OTP (202773)');

  // 2.9 Dr. Merlin Rajan Clinic context & isolation
  const doc2ClinicsRes = await axios.get(`${API_BASE}/doctors/auth/clinics`, {
    headers: { Authorization: `Bearer ${doc2Res.data.token}` },
  });
  assert(doc2ClinicsRes.data.assignedClinicsCount === 1, 'Dr. Merlin Rajan is assigned to exactly 1 authorized clinic');
  assert(doc2ClinicsRes.data.clinics[0]?.id === 'c-moon-dental-villivakkam-2773', 'Dr. Merlin Rajan clinic context is c-moon-dental-villivakkam-2773');
  assert(doc2ClinicsRes.data.clinics[0]?.isPrimary === true, 'Moon Dental Clinic is primary');

  // -----------------------------------------------------------------
  // 3. Regression & Strict Isolation Verification
  // -----------------------------------------------------------------
  console.log('\n--- 3. Regression & Isolation Verification ---');
  // 3.1 Existing demo assistant login still works
  const demoAsstRes = await axios.post(`${API_BASE}/auth/assistant/login`, {
    email: 'assistant01@demo.medlink.test',
    password: 'Clinic@3001',
  });
  assert(demoAsstRes.status === 200 && demoAsstRes.data.success, 'Existing demo assistant (assistant01@demo.medlink.test) still works');

  // 3.2 Existing demo doctor login still works
  const demoDocRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'doctor01@demo.medlink.test',
    password: 'Doctor@2001',
  });
  assert(demoDocRes.data.doctor?.id === 'doc-demo-arun-01', 'Existing demo doctor (doctor01@demo.medlink.test) still works');

  // 3.3 Mylapore Moon Dental Clinic remains unchanged
  const mylaporeRes = await axios.get(`${API_BASE}/clinics/c-demo-moon-01`);
  assert(mylaporeRes.data.clinic?.id === 'c-demo-moon-01', 'Existing Mylapore clinic (c-demo-moon-01) preserved');
  assert((mylaporeRes.data.clinic?.address || '').includes('Mylapore'), 'Mylapore location in address preserved');

  // 3.4 Strict Doctor Isolation
  const villivakkamDocsRes = await axios.get(`${API_BASE}/clinics/c-moon-dental-villivakkam-2773/doctors`);
  const vDocs = (villivakkamDocsRes.data.doctors || []).map((d: any) => d.id);
  assert(vDocs.includes('doc-alagu-vimalesh-2773') && vDocs.includes('doc-merlin-rajan-2773'), 'Villivakkam has both doctors');
  assert(!vDocs.includes('doc-demo-arun-01'), 'No cross-clinic leakage from Mylapore to Villivakkam');

  const mylaporeDocsRes = await axios.get(`${API_BASE}/clinics/c-demo-moon-01/doctors`);
  const mDocs = (mylaporeDocsRes.data.doctors || []).map((d: any) => d.id);
  assert(mDocs.includes('doc-demo-arun-01'), 'Mylapore has Dr. Arun Kumar');
  assert(!mDocs.includes('doc-alagu-vimalesh-2773') && !mDocs.includes('doc-merlin-rajan-2773'), 'No cross-clinic leakage from Villivakkam to Mylapore');

  // 3.5 No duplicate doctor records in the database
  const allDocsRes = await axios.get(`${API_BASE}/doctors`);
  const allDocs = allDocsRes.data.doctors || allDocsRes.data || [];
  const alaguMatches = allDocs.filter((d: any) => d.name.toLowerCase().includes('alagu') || d.name.toLowerCase().includes('vimalesh'));
  assert(alaguMatches.length === 1, `Exactly 1 Dr. Alagu Vimalesh record exists in database (Found: ${alaguMatches.length})`);
  const merlinMatches = allDocs.filter((d: any) => d.name.toLowerCase().includes('merlin'));
  assert(merlinMatches.length === 1, `Exactly 1 Dr. Merlin Rajan record exists in database (Found: ${merlinMatches.length})`);

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed}/${total} TARGETED CHECKS PASSED SUCCESSFULLY!`);
  console.log('====================================================\n');
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err.message, err.response?.data);
  process.exit(1);
});
