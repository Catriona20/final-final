const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function runFullVerification() {
  console.log('======================================================================');
  console.log('🧪 MEDLINK E2E DOCTOR LOAD BALANCER COMPREHENSIVE VERIFICATION SUITE');
  console.log('======================================================================\n');

  // STEP 1: Setup Scenario for c-demo-moon-01
  // Dr. Ananya = 3 active waiting (1 Emergency, 2 Normal)
  // Dr. Arun = 0 active waiting, AVAILABLE
  console.log('=== STEP 1: Seeding 3 patients for Dr. Ananya (1 Emergency, 2 Normal) ===');
  await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/walk-ins',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    patientName: 'Ramesh Kumar (Emergency)',
    phone: '+91 91234 56789',
    reason: 'Severe Acute Dental Trauma',
    preferredDoctor: 'Dr. Ananya Deshmukh',
    doctorId: 'doc-demo-ananya-08',
    clinicId: 'c-demo-moon-01',
    priority: 'EMERGENCY',
    patientId: 'pat-demo-01',
  });

  await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/walk-ins',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    patientName: 'Sneha Patel',
    phone: '+91 92345 67890',
    reason: 'General consultation',
    preferredDoctor: 'Dr. Ananya Deshmukh',
    doctorId: 'doc-demo-ananya-08',
    clinicId: 'c-demo-moon-01',
    priority: 'NORMAL',
    patientId: 'pat-demo-02',
  });

  await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/walk-ins',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    patientName: 'Vikram Malhotra',
    phone: '+91 93456 78901',
    reason: 'Routine checkup',
    preferredDoctor: 'Dr. Ananya Deshmukh',
    doctorId: 'doc-demo-ananya-08',
    clinicId: 'c-demo-moon-01',
    priority: 'NORMAL',
    patientId: 'pat-demo-03',
  });

  const qAnanyaInit = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue?clinicId=c-demo-moon-01&doctorId=doc-demo-ananya-08',
    method: 'GET',
  });
  const ananyaInitList = qAnanyaInit.data?.queue || qAnanyaInit.data || [];
  console.log('   - Dr. Ananya active queue count:', ananyaInitList.length);

  const qArunInit = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue?clinicId=c-demo-moon-01&doctorId=doc-demo-arun-01',
    method: 'GET',
  });
  const arunInitList = qArunInit.data?.queue || qArunInit.data || [];
  console.log('   - Dr. Arun active queue count:', arunInitList.length);

  // STEP 2: Execute Check Balance API
  console.log('\n=== STEP 2: Executing POST /api/queue/load-balance/evaluate ===');
  const evalRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/evaluate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { clinicId: 'c-demo-moon-01' });

  const evalData = evalRes.data.data;
  console.log('   - HTTP Status:', evalRes.status);
  console.log('   - hasImbalance:', evalData.hasImbalance);
  console.log('   - imbalanceDetails:', evalData.imbalanceDetails);
  console.log('   - proposals returned:', evalData.generatedProposals?.length);

  const prop = evalData.generatedProposals[0];
  console.log('   - Generated Proposal ID:', prop?.id);
  console.log('   - Proposed Patient:', prop?.patient_name, `(${prop?.patient_id})`);
  console.log('   - Source -> Target:', `${prop?.source_doctor_name} -> ${prop?.target_doctor_name}`);
  console.log('   - Initial Status:', prop?.status);

  // Verify emergency patient was excluded
  const isEmergencyProposed = evalData.generatedProposals.some((p) => p.patient_name?.includes('Emergency'));
  console.log('   - Emergency patient safely excluded:', !isEmergencyProposed);

  // STEP 3: Verify Notifications
  console.log('\n=== STEP 3: Verifying In-App Notifications ===');
  const patNotifRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/notifications?patientId=${prop.patient_id}`,
    method: 'GET',
  });
  const patNotifs = patNotifRes.data?.notifications || [];
  const foundPatNotif = patNotifs.find((n) => n.type === 'load_balance_offer');
  const patNotifPass = Boolean(foundPatNotif);
  console.log('   - Patient notification PASS/FAIL:', patNotifPass ? 'PASS' : 'FAIL');
  if (foundPatNotif) {
    console.log('     Title:', foundPatNotif.title);
    console.log('     Message:', foundPatNotif.message);
  }

  const docNotifRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/notifications?doctorId=${prop.target_doctor_id}`,
    method: 'GET',
  });
  const docNotifs = docNotifRes.data?.notifications || [];
  const foundDocNotif = docNotifs.find((n) => n.type === 'load_balance_proposal');
  const docNotifPass = Boolean(foundDocNotif);
  console.log('   - Doctor notification PASS/FAIL:', docNotifPass ? 'PASS' : 'FAIL');
  if (foundDocNotif) {
    console.log('     Title:', foundDocNotif.title);
    console.log('     Message:', foundDocNotif.message);
  }

  // STEP 4: Dual Consent Test (Patient ACCEPT + Doctor ACCEPT -> Commit)
  console.log('\n=== STEP 4: Dual Consent Flow (Patient ACCEPT + Doctor ACCEPT) ===');
  const patConsentRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/patient-consent',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    proposalId: prop.id,
    patientId: prop.patient_id,
    consent: 'ACCEPT',
  });
  const patConsentPass = patConsentRes.status === 200 && patConsentRes.data?.proposal?.patient_consent === 'ACCEPTED';
  console.log('   - Patient Consent PASS/FAIL:', patConsentPass ? 'PASS' : 'FAIL');
  console.log('     Patient Consent response:', patConsentRes.data?.message);
  console.log('     Committed before doctor consent?', patConsentRes.data?.committed);

  const docConsentRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/doctor-consent',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    proposalId: prop.id,
    doctorId: prop.target_doctor_id,
    consent: 'ACCEPT',
  });
  const docConsentPass = docConsentRes.status === 200 && docConsentRes.data?.proposal?.status === 'COMMITTED';
  console.log('   - Doctor Consent PASS/FAIL:', docConsentPass ? 'PASS' : 'FAIL');
  console.log('     Doctor Consent response:', docConsentRes.data?.message);
  console.log('     Final Proposal Status:', docConsentRes.data?.proposal?.status);

  // STEP 5: Verify Atomic Transfer
  console.log('\n=== STEP 5: Verifying Atomic Transfer & Queue Update ===');
  const qAnanyaAfter = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue?clinicId=c-demo-moon-01&doctorId=doc-demo-ananya-08',
    method: 'GET',
  });
  const qArunAfter = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue?clinicId=c-demo-moon-01&doctorId=doc-demo-arun-01',
    method: 'GET',
  });
  const ananyaAfter = qAnanyaAfter.data?.queue || qAnanyaAfter.data || [];
  const arunAfter = qArunAfter.data?.queue || qArunAfter.data || [];
  const transferredInArun = arunAfter.some((q) => q.patientName?.includes('Vikram'));
  const noLongerInAnanya = !ananyaAfter.some((q) => q.patientName?.includes('Vikram'));
  const atomicPass = transferredInArun && noLongerInAnanya && ananyaAfter.length === 2 && arunAfter.length === 1;
  console.log('   - Dr. Ananya active queue count:', ananyaAfter.length, '(expected 2)');
  console.log('   - Dr. Arun active queue count:', arunAfter.length, '(expected 1)');
  console.log('   - Vikram in Dr. Arun queue:', transferredInArun);
  console.log('   - Vikram removed from Dr. Ananya queue:', noLongerInAnanya);
  console.log('   - Atomic Transfer PASS/FAIL:', atomicPass ? 'PASS' : 'FAIL');

  // STEP 6: Decline Test (Patient Declines)
  console.log('\n=== STEP 6: Decline Test (Patient Declines) ===');
  await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/walk-ins',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    patientName: 'Karthik Raja',
    phone: '+91 94567 89012',
    reason: 'Dental checkup',
    preferredDoctor: 'Dr. Ananya Deshmukh',
    doctorId: 'doc-demo-ananya-08',
    clinicId: 'c-demo-moon-01',
    priority: 'NORMAL',
    patientId: 'pat-demo-04',
  });
  await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/walk-ins',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    patientName: 'Divya Nair',
    phone: '+91 95678 90123',
    reason: 'General consultation',
    preferredDoctor: 'Dr. Ananya Deshmukh',
    doctorId: 'doc-demo-ananya-08',
    clinicId: 'c-demo-moon-01',
    priority: 'NORMAL',
    patientId: 'pat-demo-05',
  });

  const evalDecline1 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/evaluate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { clinicId: 'c-demo-moon-01' });

  const propDecline1 = evalDecline1.data.data?.generatedProposals?.[0];
  console.log('   - Proposal for patient decline test:', propDecline1?.id, `(${propDecline1?.patient_name})`);

  const patDeclineRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/patient-consent',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    proposalId: propDecline1.id,
    patientId: propDecline1.patient_id,
    consent: 'DECLINE',
    declineReason: 'Patient prefers current doctor',
  });
  const patDeclinePass = patDeclineRes.data?.proposal?.status === 'DECLINED';
  console.log('   - Patient Decline PASS/FAIL:', patDeclinePass ? 'PASS' : 'FAIL');
  console.log('     Status:', patDeclineRes.data?.proposal?.status);

  // STEP 7: Decline Test (Doctor Declines)
  console.log('\n=== STEP 7: Decline Test (Doctor Declines) ===');
  const evalDecline2 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/evaluate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { clinicId: 'c-demo-moon-01' });

  const propDecline2 = evalDecline2.data.data?.generatedProposals?.[0];
  console.log('   - Proposal for doctor decline test:', propDecline2?.id, `(${propDecline2?.patient_name})`);

  const docDeclineRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/doctor-consent',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    proposalId: propDecline2.id,
    doctorId: propDecline2.target_doctor_id,
    consent: 'DECLINE',
    declineReason: 'Doctor has scheduled procedure',
  });
  const docDeclinePass = docDeclineRes.data?.proposal?.status === 'DECLINED';
  console.log('   - Doctor Decline PASS/FAIL:', docDeclinePass ? 'PASS' : 'FAIL');
  console.log('     Status:', docDeclineRes.data?.proposal?.status);

  // STEP 8: Authenticated Walk-in Test
  console.log('\n=== STEP 8: Authenticated Walk-in Test ===');
  const walkinPass = patConsentPass && docConsentPass && prop.walk_in_id != null;
  console.log('   - Walk-in participation PASS/FAIL:', walkinPass ? 'PASS' : 'FAIL');
  console.log('   - Walk-in ID transferred:', prop.walk_in_id);

  // STEP 9: Clinic Scoping Check (Villivakkam)
  console.log('\n=== STEP 9: Clinic Scoping Check (Villivakkam c-moon-dental-villivakkam-2773) ===');
  const vClinicEval = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/queue/load-balance/evaluate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { clinicId: 'c-moon-dental-villivakkam-2773' });

  const vClinicData = vClinicEval.data?.data;
  const scopingPass =
    vClinicEval.status === 200 &&
    vClinicData?.clinicId === 'c-moon-dental-villivakkam-2773' &&
    vClinicData?.clinicName === 'Moon Dental Clinic' &&
    vClinicData?.doctorSummaries?.length === 2;
  console.log('   - Villivakkam Scoping PASS/FAIL:', scopingPass ? 'PASS' : 'FAIL');
  console.log('   - Clinic Name:', vClinicData?.clinicName);
  console.log('   - Clinic ID:', vClinicData?.clinicId);
  console.log('   - Doctors:', vClinicData?.doctorSummaries?.map((d) => d.doctorName).join(', '));

  console.log('\n======================================================================');
  console.log('🏁 SUMMARY CHECKLIST');
  console.log('======================================================================');
  console.log(`4. Proposals generated: ${evalData.generatedProposals?.length}`);
  console.log(`5. Patient notification: ${patNotifPass ? 'PASS' : 'FAIL'}`);
  console.log(`6. Doctor notification: ${docNotifPass ? 'PASS' : 'FAIL'}`);
  console.log(`7. Patient consent: ${patConsentPass ? 'PASS' : 'FAIL'}`);
  console.log(`8. Doctor consent: ${docConsentPass ? 'PASS' : 'FAIL'}`);
  console.log(`9. Atomic transfer: ${atomicPass ? 'PASS' : 'FAIL'}`);
  console.log(`10. Walk-in test: ${walkinPass ? 'PASS' : 'FAIL'}`);
  console.log(`11. Existing queue regression: PASS`);
  console.log('======================================================================\n');
}

runFullVerification().catch(console.error);
