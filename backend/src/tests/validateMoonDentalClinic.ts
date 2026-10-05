import axios from 'axios';
import bcrypt from 'bcryptjs';

const API_BASE = 'http://localhost:5000/api';

async function runValidation() {
  console.log('====================================================');
  console.log('🩺 MEDLINK: VALIDATING MOON DENTAL CLINIC (2773)');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, msg: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // ----------------------------------------------------
  // TEST 1: Clinic Record & Verification
  // ----------------------------------------------------
  console.log('--- TEST 1: Clinic Record Verification ---');
  const clinicRes = await axios.get(`${API_BASE}/clinics/c-moon-dental-villivakkam-2773`);
  const clinic = clinicRes.data.clinic || clinicRes.data;
  assert(clinic.id === 'c-moon-dental-villivakkam-2773', 'Clinic internal ID is c-moon-dental-villivakkam-2773');
  assert(clinic.name === 'Moon Dental Clinic', 'Clinic name is Moon Dental Clinic');
  assert(clinic.clinic_number === 2773, 'Clinic number is 2773');
  assert(clinic.locality === 'Villivakkam', 'Locality is Villivakkam');
  assert(clinic.city === 'Chennai', 'City is Chennai');
  assert(clinic.state === 'Tamil Nadu', 'State is Tamil Nadu');
  assert(clinic.postal_code === '600082', 'Postal code is 600082');
  assert(clinic.address.includes('28/15, Sannathi Street, Villivakkam'), 'Address matches 28/15, Sannathi Street, Villivakkam');
  assert(clinic.latitude === 13.1075 && clinic.longitude === 80.2060, 'Coordinates resolved to 13.1075, 80.2060 via geocoding');
  assert(clinic.status === 'ACTIVE' || clinic.is_verified === true, 'Clinic is active and verified');
  assert(clinic.departments.includes('Dentistry'), 'Department includes Dentistry');

  // ----------------------------------------------------
  // TEST 2: Both Doctor Records & Procedures
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Doctor Records & Procedure Mappings ---');
  const doc1Res = await axios.get(`${API_BASE}/doctors/doc-alagu-vimalesh-2773`);
  const doc1 = doc1Res.data.doctor || doc1Res.data;
  assert(doc1.name === 'Dr. Alagu Vimalesh', 'Dr. Alagu Vimalesh record exists');
  assert((doc1.qualification || doc1.qualifications || '').includes('BDS') && (doc1.qualification || doc1.qualifications || '').includes('MDS'), 'Dr. Alagu qualifications include BDS, MDS');
  assert((doc1.primary_specialization || doc1.specialization || '').includes('Conservative Dentistry and Endodontics'), 'Dr. Alagu specialty is Conservative Dentistry and Endodontics');
  assert(doc1.procedures.some((p: string) => p.includes('Root Canal Treatment')), 'Dr. Alagu procedure list includes Root Canal Treatment (RCT)');
  assert(doc1.procedures.some((p: string) => p.toLowerCase().includes('cleaning') || p.toLowerCase().includes('extraction')), 'Dr. Alagu provides general dental procedures');

  const doc2Res = await axios.get(`${API_BASE}/doctors/doc-merlin-rajan-2773`);
  const doc2 = doc2Res.data.doctor || doc2Res.data;
  assert(doc2.name === 'Dr. Merlin Rajan', 'Dr. Merlin Rajan record exists');
  assert((doc2.qualification || doc2.qualifications || '').includes('Conservative Dentistry and Endodontics'), 'Dr. Merlin qualification is Conservative Dentistry and Endodontics');
  assert((doc2.primary_specialization || doc2.specialization || '').includes('Conservative Dentistry and Endodontics'), 'Dr. Merlin specialty is Conservative Dentistry and Endodontics');
  assert(doc2.procedures.some((p: string) => p.toLowerCase().includes('cleaning') || p.toLowerCase().includes('extraction')), 'Dr. Merlin provides general dental procedures');

  // ----------------------------------------------------
  // TEST 3: Doctor-Clinic Scoping & Multi-Clinic Isolation
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Doctor-Clinic Scoping & Isolation ---');
  const villivakkamDocsRes = await axios.get(`${API_BASE}/clinics/c-moon-dental-villivakkam-2773/doctors`);
  const villivakkamDocs = villivakkamDocsRes.data.doctors || villivakkamDocsRes.data;
  const villivakkamDocIds = villivakkamDocs.map((d: any) => d.id);
  assert(villivakkamDocIds.includes('doc-alagu-vimalesh-2773'), 'Dr. Alagu Vimalesh is assigned to Villivakkam');
  assert(villivakkamDocIds.includes('doc-merlin-rajan-2773'), 'Dr. Merlin Rajan is assigned to Villivakkam');
  assert(!villivakkamDocIds.includes('doc-demo-arun-01'), 'Dr. Arun Kumar is NOT in Villivakkam (no cross-leakage)');

  const mylaporeDocsRes = await axios.get(`${API_BASE}/clinics/c-demo-moon-01/doctors`);
  const mylaporeDocs = mylaporeDocsRes.data.doctors || mylaporeDocsRes.data;
  const mylaporeDocIds = mylaporeDocs.map((d: any) => d.id);
  assert(mylaporeDocIds.includes('doc-demo-arun-01'), 'Dr. Arun Kumar is assigned to Mylapore demo clinic');
  assert(!mylaporeDocIds.includes('doc-alagu-vimalesh-2773'), 'Dr. Alagu Vimalesh is NOT in Mylapore (strict isolation)');
  assert(!mylaporeDocIds.includes('doc-merlin-rajan-2773'), 'Dr. Merlin Rajan is NOT in Mylapore (strict isolation)');

  // ----------------------------------------------------
  // TEST 4: Clinic Discovery & Radius Rules
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Discovery & Radius Filtering ---');
  // 4a. Near Villivakkam (e.g. Villivakkam center 13.1075, 80.2060 with 5km radius)
  const discoverNear = await axios.get(`${API_BASE}/clinics/discovery`, {
    params: {
      latitude: 13.1075,
      longitude: 80.2060,
      radius: 5,
      department: 'Dentistry',
    },
  });
  const nearClinics = discoverNear.data.clinics || [];
  assert(
    nearClinics.some((c: any) => c.id === 'c-moon-dental-villivakkam-2773'),
    'Moon Dental Clinic Villivakkam appears when searching Dentistry in Villivakkam'
  );

  // 4b. Explicit Name search
  const discoverByName = await axios.get(`${API_BASE}/clinics/discovery`, {
    params: {
      latitude: 13.0827,
      longitude: 80.2707,
      radius: 15,
      query: 'Moon Dental',
    },
  });
  const nameClinics = discoverByName.data.clinics || [];
  assert(
    nameClinics.some((c: any) => c.id === 'c-moon-dental-villivakkam-2773'),
    'Moon Dental Clinic Villivakkam appears on explicit name query "Moon Dental"'
  );
  assert(
    nameClinics.some((c: any) => c.id === 'c-demo-moon-01'),
    'Mylapore Moon Dental demo clinic also appears on explicit name query'
  );

  // 4c. Far away location with small radius (e.g. Siruseri 12.8250, 80.2180, radius 5km)
  // Distance from Villivakkam (13.1075) to Siruseri (12.8250) is ~31 km > 5km * 1.35
  const discoverFar = await axios.get(`${API_BASE}/clinics/discovery`, {
    params: {
      latitude: 12.8250,
      longitude: 80.2180,
      radius: 5,
      department: 'Dentistry',
    },
  });
  const farClinics = discoverFar.data.clinics || [];
  const villivakkamInFar = farClinics.some((c: any) => c.id === 'c-moon-dental-villivakkam-2773');
  assert(!villivakkamInFar, 'Moon Dental Clinic Villivakkam is NOT forced into far-away search (Siruseri 5km radius)');

  // ----------------------------------------------------
  // TEST 5: Availability & Booking Integrity
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Real Availability & Booking Integrity ---');
  const testDate = '2026-10-04';
  const testStartTime = '10:00 PM';
  const testEndTime = '11:30 PM';

  // Initially no approved schedule = 0 slots
  const initialSlotsRes = await axios.get(
    `${API_BASE}/doctors/doc-alagu-vimalesh-2773/slots?clinicId=c-moon-dental-villivakkam-2773&date=${testDate}`
  );
  const initialSlotsCount = initialSlotsRes.data.totalSlotsCount ?? 0;
  assert(initialSlotsCount === 0, 'No fabricated availability: 0 slots before doctor schedule approval');

  let reqId: string | undefined;
  let appointmentId: string | undefined;

  try {
    // Assistant creates an availability request
    const reqRes = await axios.post(`${API_BASE}/availability/requests`, {
      clinic_id: 'c-moon-dental-villivakkam-2773',
      doctor_id: 'doc-alagu-vimalesh-2773',
      requested_date: testDate,
      start_time: testStartTime,
      end_time: testEndTime,
      notes: 'Test evening shift for Moon Dental Villivakkam',
      requested_by: 'Assistant Test',
    });
    reqId = reqRes.data.request?.id || reqRes.data.id;
    assert(Boolean(reqId), 'Availability request created successfully');

    // Doctor logs in to obtain auth JWT token
    const docAuthRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
      email: 'dr.alagu.vimalesh@moondental.test',
      password: 'Doctor@2773',
    });
    const docToken = docAuthRes.data.token;
    assert(Boolean(docToken), 'Dr. Alagu Vimalesh authenticated and acquired JWT token');

    // Doctor approves the availability request using token
    const approveRes = await axios.post(
      `${API_BASE}/availability/requests/${reqId}/approve`,
      { notes: 'Approved by Dr. Alagu Vimalesh' },
      { headers: { Authorization: `Bearer ${docToken}` } }
    );
    assert(approveRes.data.success === true, 'Doctor approved availability request with JWT');

    // Verify real generated slots now exist
    const slotsAfterRes = await axios.get(
      `${API_BASE}/doctors/doc-alagu-vimalesh-2773/slots?clinicId=c-moon-dental-villivakkam-2773&date=${testDate}`
    );
    const slotsObj = slotsAfterRes.data.slots || {};
    const allSlots = [
      ...(slotsObj.morning || []),
      ...(slotsObj.afternoon || []),
      ...(slotsObj.evening || []),
    ];
    assert(allSlots.length > 0, `Real slots generated after schedule approval (Count: ${allSlots.length})`);

    // Book an appointment on slot 0
    const chosenSlot = allSlots[0];
    const slotTime = chosenSlot.time || chosenSlot.start_time || '10:00 AM';
    const bookingRes = await axios.post(`${API_BASE}/appointments`, {
      clinic_id: 'c-moon-dental-villivakkam-2773',
      doctor_id: 'doc-alagu-vimalesh-2773',
      patient_id: 'pat-demo-01',
      patientId: 'pat-demo-01',
      patient_name: 'Aarav Sharma',
      patient_email: 'patient01@demo.medlink.test',
      patient_phone: '+91 98765 43210',
      date: testDate,
      time: slotTime,
      appointment_date: testDate,
      appointment_time: slotTime,
      department: 'Dentistry',
      procedure_name: 'Root Canal Treatment (RCT)',
      consultation_type: 'IN_PERSON',
    });
    appointmentId = bookingRes.data.appointment?.id || bookingRes.data.id;
    assert(Boolean(appointmentId), `Appointment booked successfully (ID: ${appointmentId})`);

    // Test duplicate booking prevention on the exact same slot
    let duplicateRejected = false;
    try {
      await axios.post(`${API_BASE}/appointments`, {
        clinic_id: 'c-moon-dental-villivakkam-2773',
        doctor_id: 'doc-alagu-vimalesh-2773',
        patient_id: 'pat-demo-02',
        patientId: 'pat-demo-02',
        patient_name: 'Sneha Patel',
        patient_email: 'patient02@demo.medlink.test',
        patient_phone: '+91 98765 43211',
        date: testDate,
        time: slotTime,
        appointment_date: testDate,
        appointment_time: slotTime,
        department: 'Dentistry',
        procedure_name: 'Dental Cleaning',
        consultation_type: 'IN_PERSON',
      });
    } catch (err: any) {
      duplicateRejected = err.response?.status === 400 || err.response?.status === 409;
    }
    assert(duplicateRejected, 'Duplicate booking on the exact same doctor slot is rejected');

    // Test patient check-in (reception desk check-in)
    let checkInRes;
    try {
      checkInRes = await axios.post(`${API_BASE}/appointments/${appointmentId}/check-in`, {
        notes: 'Patient arrived at Villivakkam clinic reception',
        forceDeskCheckIn: true,
      });
    } catch (err: any) {
      console.log('Check-in error response:', err.response?.data);
      throw err;
    }
    assert(checkInRes.data.success === true, 'Patient check-in completed');

    // Verify OPD queue entry for Villivakkam clinic
    const queueRes = await axios.get(`${API_BASE}/queue?clinicId=c-moon-dental-villivakkam-2773&date=${testDate}`);
    const queueItems = queueRes.data.queue || queueRes.data || [];
    assert(
      queueItems.some(
        (q: any) =>
          q.appointmentId === appointmentId ||
          q.appointment_id === appointmentId ||
          q.id === `q-${appointmentId}`
      ),
      'Patient appears in live OPD queue'
    );
  } finally {
    // Clean up test records via API endpoints on running server
    if (appointmentId) {
      await axios.delete(`${API_BASE}/appointments/${appointmentId}`).catch(() => {});
    }
    if (reqId) {
      await axios.delete(`${API_BASE}/availability/requests/${reqId}`).catch(() => {});
    }
    console.log('Cleaned up all test records (appointment, queue, and availability request).');
  }

  // ----------------------------------------------------
  // TEST 6: Regression & Demo Baseline Integrity
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Baseline Demo Integrity & Credentials ---');
  const demoCountsRes = await axios.get(`${API_BASE}/simulation/demo-counts`);
  const counts = demoCountsRes.data.counts;
  assert(counts.patients >= 20, `Preserved all baseline demo patients (Found: ${counts.patients})`);
  for (let i = 1; i <= 20; i++) {
    const pad = String(i).padStart(2, '0');
    assert(
      demoCountsRes.data.emails.patients.includes(`patient${pad}@demo.medlink.test`),
      `Baseline patient patient${pad}@demo.medlink.test is preserved`
    );
  }
  assert(counts.assistants >= 20, `Preserved all baseline assistants (Found: ${counts.assistants})`);
  assert(counts.clinics >= 18, `Clinics count reflects addition without replacement (Found: ${counts.clinics})`);

  // Verify doctor login auth endpoint
  const docLoginRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'dr.alagu.vimalesh@moondental.test',
    password: 'Doctor@2773',
  });
  assert(docLoginRes.data.doctor?.id === 'doc-alagu-vimalesh-2773', 'Dr. Alagu Vimalesh successfully logs in with Doctor@2773');

  const doc2LoginRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'dr.merlin.rajan@moondental.test',
    password: 'Doctor@2773',
  });
  assert(doc2LoginRes.data.doctor?.id === 'doc-merlin-rajan-2773', 'Dr. Merlin Rajan successfully logs in with Doctor@2773');

  const demoDocLoginRes = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'doctor01@demo.medlink.test',
    password: 'Doctor@2001',
  });
  assert(Boolean(demoDocLoginRes.data.doctor?.id), 'Existing demo login (doctor01@demo.medlink.test) preserved');

  const asstLoginRes = await axios.post(`${API_BASE}/auth/assistant/login`, {
    email: 'assistant2773@demo.medlink.test',
    password: 'Clinic@3001',
  });
  assert(asstLoginRes.data.assistant?.clinic_id === 'c-moon-dental-villivakkam-2773', 'Moon Dental Assistant login verified');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests} TESTS PASSED OUT OF ${totalTests}!`);
  console.log('====================================================\n');
}

runValidation().catch((err) => {
  console.error('\n❌ VALIDATION TEST FAILED:', err.message);
  process.exit(1);
});
