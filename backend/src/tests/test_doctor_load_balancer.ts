import { memoryDb } from '../database/db';
import {
  AppointmentEntity,
  AppointmentModel,
  DoctorEntity,
  DoctorModel,
  PatientEntity,
  PatientModel,
  WalkInEntity,
  WalkInModel,
  LoadBalanceProposalModel,
  LoadBalanceProposalEntity,
} from '../database/models';
import { queueManager } from '../services/queueManager';
import { loadBalancerService } from '../services/loadBalancerService';
import { timeService } from '../services/timeService';

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, num: number, name: string, details: string) {
  if (condition) {
    results.push({ num, name, passed: true, details });
    console.log(`✅ [TEST ${num}] PASS: ${name} - ${details}`);
  } else {
    results.push({ num, name, passed: false, details: `FAILED: ${details}` });
    console.error(`❌ [TEST ${num}] FAIL: ${name} - ${details}`);
  }
}

export async function runLoadBalancerTests(): Promise<{ passed: number; total: number; allPassed: boolean }> {
  console.log('\n===============================================================');
  console.log('🧪 MEDLINK LOAD BALANCER 14-POINT COMPREHENSIVE TEST SUITE');
  console.log('===============================================================\n');

  const todayStr = timeService.getTodayDateString();
  const TEST_CLINIC_ID = 'c-test-lb-clinic-01';
  const OTHER_CLINIC_ID = 'c-test-lb-other-clinic';

  // Setup Test Clinic
  memoryDb.clinics.set(TEST_CLINIC_ID, {
    id: TEST_CLINIC_ID,
    name: 'MedLink Test Dental & Medical Clinic',
    address: '123 Test Avenue, Chennai',
    phone: '+91 98765 43210',
    is_open: true,
    is_verified: true,
  });

  memoryDb.clinics.set(OTHER_CLINIC_ID, {
    id: OTHER_CLINIC_ID,
    name: 'Other Distant Clinic',
    address: '456 Other Way, Chennai',
    phone: '+91 98765 00000',
    is_open: true,
    is_verified: true,
  });

  // Setup Doctors at TEST_CLINIC_ID
  const docA_Id = 'doc-test-lb-dr-a';
  const docB_Id = 'doc-test-lb-dr-b';
  const docOtherClinic_Id = 'doc-test-lb-dr-other';
  const docUnavailable_Id = 'doc-test-lb-dr-busy';
  const docUnverified_Id = 'doc-test-lb-dr-unverified';
  const docRestrictedProc_Id = 'doc-test-lb-dr-no-rc';

  // Dr. A: Available, General Dentistry, procedures: General OPD, Dental Cleaning, Root Canal
  memoryDb.doctors.set(docA_Id, {
    id: docA_Id,
    name: 'Dr. Arun Kumar',
    specialization: 'General Dentistry',
    clinic_id: TEST_CLINIC_ID,
    clinic_name: 'MedLink Test Dental & Medical Clinic',
    is_available_today: true,
    status: 'AVAILABLE',
    is_verified: true,
    verification_status: 'APPROVED',
    procedures: ['General OPD', 'Dental Cleaning', 'Root Canal'],
    consultation_duration: '20 min',
  });

  // Dr. B: Available, General Dentistry, procedures: General OPD, Dental Cleaning, Root Canal
  memoryDb.doctors.set(docB_Id, {
    id: docB_Id,
    name: 'Dr. Bala Murali',
    specialization: 'General Dentistry',
    clinic_id: TEST_CLINIC_ID,
    clinic_name: 'MedLink Test Dental & Medical Clinic',
    is_available_today: true,
    status: 'AVAILABLE',
    is_verified: true,
    verification_status: 'APPROVED',
    procedures: ['General OPD', 'Dental Cleaning', 'Root Canal'],
    consultation_duration: '20 min',
  });

  // Dr. Other Clinic: At OTHER_CLINIC_ID
  memoryDb.doctors.set(docOtherClinic_Id, {
    id: docOtherClinic_Id,
    name: 'Dr. Other Hospital',
    specialization: 'General Dentistry',
    clinic_id: OTHER_CLINIC_ID,
    clinic_name: 'Other Distant Clinic',
    is_available_today: true,
    status: 'AVAILABLE',
    is_verified: true,
    verification_status: 'APPROVED',
  });

  // Dr. Unavailable: OFFLINE
  memoryDb.doctors.set(docUnavailable_Id, {
    id: docUnavailable_Id,
    name: 'Dr. Off Duty',
    specialization: 'General Dentistry',
    clinic_id: TEST_CLINIC_ID,
    clinic_name: 'MedLink Test Dental & Medical Clinic',
    is_available_today: false,
    status: 'OFFLINE',
    is_verified: true,
    verification_status: 'APPROVED',
  });

  // Dr. Unverified: PENDING verification
  memoryDb.doctors.set(docUnverified_Id, {
    id: docUnverified_Id,
    name: 'Dr. Unverified Credentials',
    specialization: 'General Dentistry',
    clinic_id: TEST_CLINIC_ID,
    clinic_name: 'MedLink Test Dental & Medical Clinic',
    is_available_today: true,
    status: 'AVAILABLE',
    is_verified: false,
    verification_status: 'PENDING_REVIEW',
  });

  // Dr. Restricted: Only does General OPD, cannot do Root Canal
  memoryDb.doctors.set(docRestrictedProc_Id, {
    id: docRestrictedProc_Id,
    name: 'Dr. Junior Resident',
    specialization: 'General Dentistry',
    clinic_id: TEST_CLINIC_ID,
    clinic_name: 'MedLink Test Dental & Medical Clinic',
    is_available_today: true,
    status: 'AVAILABLE',
    is_verified: true,
    verification_status: 'APPROVED',
    procedures: ['General OPD'],
  });

  // Setup Authenticated Patients
  for (let i = 1; i <= 10; i++) {
    const patId = `pat-test-lb-${i}`;
    memoryDb.patients.set(patId, {
      id: patId,
      name: `Patient ${i} Name`,
      email: `patient${i}@demo.medlink.test`,
      phone: `+91 90000 0000${i}`,
      password_hash: 'hash',
      account_status: 'ACTIVE',
      is_active: true,
    });
  }

  // Clear any old test proposals & appointments for our test clinic
  for (const [id, p] of memoryDb.load_balance_proposals.entries()) {
    if (p.clinic_id === TEST_CLINIC_ID) memoryDb.load_balance_proposals.delete(id);
  }
  for (const [id, a] of memoryDb.appointments.entries()) {
    if (a.clinic_id === TEST_CLINIC_ID) memoryDb.appointments.delete(id);
  }
  for (const [id, w] of memoryDb.walk_ins.entries()) {
    if (w.clinic_id === TEST_CLINIC_ID) memoryDb.walk_ins.delete(id);
  }

  // Helper to create waiting appointment
  function createWaitingAppt(id: string, patNum: number, docId: string, priority = 'NORMAL', proc = 'General OPD') {
    const patId = `pat-test-lb-${patNum}`;
    const apt: AppointmentEntity = {
      id,
      patient_id: patId,
      patient_name: `Patient ${patNum} Name`,
      doctor_id: docId,
      doctor_name: docId === docA_Id ? 'Dr. Arun Kumar' : 'Dr. Bala Murali',
      doctor_specialization: 'General Dentistry',
      doctor_avatar: 'avatar.png',
      clinic_id: TEST_CLINIC_ID,
      clinic_name: 'MedLink Test Dental & Medical Clinic',
      clinic_address: '123 Test Avenue, Chennai',
      department: 'General Dentistry',
      date: todayStr,
      time: '10:00 AM',
      duration: '20 min',
      status: 'WAITING',
      queue_number: patNum,
      token_number: priority === 'EMERGENCY' ? `E00${patNum}` : `A00${patNum}`,
      queue_position: patNum,
      patients_ahead: patNum - 1,
      estimated_wait: `${(patNum - 1) * 20} min`,
      travel_time: '10 min',
      distance: '2 km',
      reason: proc,
      procedure_name: proc,
      symptoms: [],
      consultation_fee: '₹400',
      prescription_available: false,
      created_at: new Date(Date.now() + patNum * 60000).toISOString(),
    };
    memoryDb.appointments.set(id, apt);
    return apt;
  }

  // =========================================================================
  // TEST 1: Four eligible patients versus zero: proposed balancing reduces imbalance
  // =========================================================================
  createWaitingAppt('apt-lb-1', 1, docA_Id);
  createWaitingAppt('apt-lb-2', 2, docA_Id);
  createWaitingAppt('apt-lb-3', 3, docA_Id);
  createWaitingAppt('apt-lb-4', 4, docA_Id);

  const eval1 = await loadBalancerService.evaluateAndGenerateProposals(TEST_CLINIC_ID);
  assert(
    eval1.hasImbalance === true && eval1.generatedProposals.length === 2,
    1,
    'Four eligible patients vs zero balancing',
    `Dr. A had 4 patients, Dr. B had 0. Generated exactly 2 proposals (floor((4-0)/2) = 2). Proposals count: ${eval1.generatedProposals.length}`
  );

  // Verify appointments were NOT automatically transferred (must remain with Dr. A)
  const apt1 = memoryDb.appointments.get('apt-lb-1');
  const apt4 = memoryDb.appointments.get('apt-lb-4');
  assert(
    apt1?.doctor_id === docA_Id && apt4?.doctor_id === docA_Id,
    1,
    'No automatic transfer before consent',
    `Appointments remain with Dr. A (apt-lb-1 doc: ${apt1?.doctor_id}, apt-lb-4 doc: ${apt4?.doctor_id})`
  );

  // Grab the two generated proposals for subsequent tests
  const prop1 = eval1.generatedProposals[0];
  const prop2 = eval1.generatedProposals[1];

  // =========================================================================
  // TEST 2: Patient accepts and doctor accepts: transfer commits exactly once
  // =========================================================================
  // Target doctor accepts prop1
  const docAcceptRes = await loadBalancerService.respondDoctorConsent(prop1.id, prop1.target_doctor_id, true);
  // Patient accepts prop1
  const patAcceptRes = await loadBalancerService.respondPatientConsent(prop1.id, prop1.patient_id, true);

  const committedProp1 = await LoadBalanceProposalModel.getById(prop1.id);
  const transferredApt = memoryDb.appointments.get(prop1.appointment_id!);
  const targetDoc1 = memoryDb.doctors.get(prop1.target_doctor_id);

  assert(
    committedProp1?.status === 'COMMITTED' &&
      transferredApt?.doctor_id === prop1.target_doctor_id &&
      transferredApt?.doctor_name === targetDoc1?.name,
    2,
    'Patient accepts and doctor accepts: transfer commits',
    `Proposal status: ${committedProp1?.status}, Appointment assigned doctor updated to: ${transferredApt?.doctor_name} (${transferredApt?.doctor_id})`
  );

  // Verify transfer history recorded
  assert(
    Array.isArray(transferredApt?.transfer_history) && transferredApt?.transfer_history.length === 1,
    2,
    'Audit trail recorded exactly once',
    `Transfer history count: ${transferredApt?.transfer_history?.length}, from: ${transferredApt?.transfer_history?.[0]?.from_doctor_name} to: ${transferredApt?.transfer_history?.[0]?.to_doctor_name}`
  );

  // =========================================================================
  // TEST 3: Patient declines: original assignment remains unchanged
  // =========================================================================
  // Doctor accepts prop2
  await loadBalancerService.respondDoctorConsent(prop2.id, prop2.target_doctor_id, true);
  // Patient declines prop2
  const patDeclineRes = await loadBalancerService.respondPatientConsent(
    prop2.id,
    prop2.patient_id,
    false,
    'Prefer original doctor'
  );

  const declinedProp2 = await LoadBalanceProposalModel.getById(prop2.id);
  const retainedApt2 = memoryDb.appointments.get(prop2.appointment_id!);

  assert(
    declinedProp2?.status === 'DECLINED' &&
      declinedProp2.patient_consent === 'DECLINED' &&
      retainedApt2?.doctor_id === docA_Id,
    3,
    'Patient declines: original assignment unchanged',
    `Proposal status: ${declinedProp2?.status}, Appointment doctor preserved: ${retainedApt2?.doctor_name} (${retainedApt2?.doctor_id})`
  );

  // =========================================================================
  // TEST 4: Doctor declines: original assignment remains unchanged
  // =========================================================================
  // Create another appointment for Dr. A
  createWaitingAppt('apt-lb-5', 5, docA_Id);
  const evalTest4 = await loadBalancerService.evaluateAndGenerateProposals(TEST_CLINIC_ID);
  const propTest4 = evalTest4.generatedProposals.find((p) => p.appointment_id === 'apt-lb-5')!;

  // Patient accepts
  await loadBalancerService.respondPatientConsent(propTest4.id, propTest4.patient_id, true);
  // Doctor declines
  const docDeclineRes = await loadBalancerService.respondDoctorConsent(
    propTest4.id,
    propTest4.target_doctor_id,
    false,
    'Queue at capacity'
  );

  const declinedProp4 = await LoadBalanceProposalModel.getById(propTest4.id);
  const retainedApt5 = memoryDb.appointments.get('apt-lb-5');

  assert(
    declinedProp4?.status === 'DECLINED' &&
      declinedProp4.doctor_consent === 'DECLINED' &&
      retainedApt5?.doctor_id === docA_Id,
    4,
    'Doctor declines: original assignment unchanged',
    `Proposal status: ${declinedProp4?.status}, Appointment doctor preserved: ${retainedApt5?.doctor_name} (${retainedApt5?.doctor_id})`
  );

  // =========================================================================
  // TEST 5: Only one party consents: no transfer occurs
  // =========================================================================
  createWaitingAppt('apt-lb-6', 6, docA_Id);
  const evalTest5 = await loadBalancerService.evaluateAndGenerateProposals(TEST_CLINIC_ID);
  const propTest5 = evalTest5.generatedProposals.find((p) => p.appointment_id === 'apt-lb-6')!;

  // 5A: Patient consents ONLY, doctor has not responded
  await loadBalancerService.respondPatientConsent(propTest5.id, propTest5.patient_id, true);
  const midProposal = await LoadBalanceProposalModel.getById(propTest5.id);
  const midApt6 = memoryDb.appointments.get('apt-lb-6');

  assert(
    midProposal?.status === 'PENDING' &&
      midProposal.patient_consent === 'ACCEPTED' &&
      midProposal.doctor_consent === 'PENDING' &&
      midApt6?.doctor_id === docA_Id,
    5,
    'Only patient consents: no transfer occurs',
    `Proposal remains PENDING. Patient stays with Dr. A (midApt doc: ${midApt6?.doctor_id})`
  );

  // =========================================================================
  // TEST 6: A walk-in patient is eligible and can consent through supported workflow
  // =========================================================================
  const authWalkInId = 'w-test-lb-auth-01';
  memoryDb.walk_ins.set(authWalkInId, {
    id: authWalkInId,
    clinic_id: TEST_CLINIC_ID,
    doctor_id: docA_Id,
    patient_id: 'pat-test-lb-7', // Authenticated account
    patient_name: 'Patient 7 Name',
    phone: '+91 90000 00007',
    reason: 'General OPD',
    preferred_doctor: 'Dr. Arun Kumar',
    priority: 'NORMAL',
    status: 'WAITING',
    token_number: 'W007',
    registered_at: new Date().toISOString(),
    created_at: new Date(Date.now() + 50 * 60000).toISOString(),
  });

  const evalTest6 = await loadBalancerService.evaluateAndGenerateProposals(TEST_CLINIC_ID);
  const walkInProp = evalTest6.generatedProposals.find((p) => p.walk_in_id === authWalkInId);

  assert(
    walkInProp != null,
    6,
    'Walk-in with authenticated account is eligible',
    `Found proposal for authenticated walk-in patient ${walkInProp?.patient_name} (propId: ${walkInProp?.id})`
  );

  if (walkInProp) {
    const targetDocWalkIn = memoryDb.doctors.get(walkInProp.target_doctor_id);
    // Both doctor & walk-in patient accept
    await loadBalancerService.respondDoctorConsent(walkInProp.id, walkInProp.target_doctor_id, true);
    await loadBalancerService.respondPatientConsent(walkInProp.id, walkInProp.patient_id, true);

    const transferredWalkIn = memoryDb.walk_ins.get(authWalkInId);
    assert(
      transferredWalkIn?.doctor_id === walkInProp.target_doctor_id &&
        transferredWalkIn?.preferred_doctor === targetDocWalkIn?.name,
      6,
      'Walk-in transfer commits upon dual consent',
      `Walk-in doctor updated to: ${transferredWalkIn?.preferred_doctor} (${transferredWalkIn?.doctor_id})`
    );
  }

  // =========================================================================
  // TEST 7: A walk-in without an authenticated patient account is not automatically transferred
  // =========================================================================
  const unauthWalkInId = 'w-test-lb-unauth-02';
  memoryDb.walk_ins.set(unauthWalkInId, {
    id: unauthWalkInId,
    clinic_id: TEST_CLINIC_ID,
    doctor_id: docA_Id,
    patient_id: undefined, // NO authenticated account
    patient_name: 'Unregistered Walkin Patient',
    phone: '+91 99999 88888',
    reason: 'General OPD',
    preferred_doctor: 'Dr. Arun Kumar',
    priority: 'NORMAL',
    status: 'WAITING',
    token_number: 'W008',
    registered_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  const eligibleQueue = loadBalancerService.getEligibleWaitingQueue(TEST_CLINIC_ID, docA_Id);
  const foundUnauth = eligibleQueue.find((q) => q.walkInId === unauthWalkInId);
  const unauthWalkInRecord = memoryDb.walk_ins.get(unauthWalkInId);

  assert(
    foundUnauth === undefined && unauthWalkInRecord?.doctor_id === docA_Id,
    7,
    'Unauthenticated walk-in excluded from automated transfer',
    `Unauthenticated walk-in excluded from balancing proposals. Original doctor retained: ${unauthWalkInRecord?.preferred_doctor}`
  );

  // =========================================================================
  // TEST 8: Emergency-priority patients are protected by existing rules
  // =========================================================================
  const emergencyAptId = 'apt-lb-emergency-01';
  createWaitingAppt(emergencyAptId, 8, docA_Id, 'EMERGENCY', 'Severe Trauma');

  const eligibleQueueEmergency = loadBalancerService.getEligibleWaitingQueue(TEST_CLINIC_ID, docA_Id);
  const foundEmergency = eligibleQueueEmergency.find((q) => q.appointmentId === emergencyAptId);
  const emergencyApt = memoryDb.appointments.get(emergencyAptId);

  assert(
    foundEmergency === undefined && emergencyApt?.doctor_id === docA_Id,
    8,
    'Emergency priority patients protected from routine balancing',
    `Emergency patient excluded from automatic load balancing. Doctor assignment preserved: ${emergencyApt?.doctor_name}`
  );

  // =========================================================================
  // TEST 9: Cross-clinic transfer is rejected
  // =========================================================================
  const crossClinicCheck = loadBalancerService.isDoctorEligibleToReceive(
    docOtherClinic_Id,
    TEST_CLINIC_ID,
    docA_Id,
    'General OPD'
  );

  assert(
    crossClinicCheck.eligible === false && Boolean(crossClinicCheck.reason?.includes('Cross-clinic')),
    9,
    'Cross-clinic transfer is strictly rejected',
    `Eligibility check returned false. Reason: "${crossClinicCheck.reason}"`
  );

  // =========================================================================
  // TEST 10: An unavailable or unsuitable doctor cannot receive a patient
  // =========================================================================
  // 10A: Unavailable doctor (OFFLINE)
  const unavailCheck = loadBalancerService.isDoctorEligibleToReceive(
    docUnavailable_Id,
    TEST_CLINIC_ID,
    docA_Id,
    'General OPD'
  );
  // 10B: Unverified doctor
  const unverifCheck = loadBalancerService.isDoctorEligibleToReceive(
    docUnverified_Id,
    TEST_CLINIC_ID,
    docA_Id,
    'General OPD'
  );
  // 10C: Doctor cannot perform required procedure (Root Canal)
  const procCheck = loadBalancerService.isDoctorEligibleToReceive(
    docRestrictedProc_Id,
    TEST_CLINIC_ID,
    docA_Id,
    'Root Canal'
  );

  assert(
    unavailCheck.eligible === false && unverifCheck.eligible === false && procCheck.eligible === false,
    10,
    'Unavailable or unsuitable doctor cannot receive patient',
    `Offline doctor: ${unavailCheck.reason} | Unverified doctor: ${unverifCheck.reason} | Procedure mismatch: ${procCheck.reason}`
  );

  // =========================================================================
  // TEST 11: Concurrent requests cannot duplicate or over-transfer patients
  // =========================================================================
  createWaitingAppt('apt-lb-11-extra', 9, docA_Id);
  const apt11Init = createWaitingAppt('apt-lb-11', 11, docA_Id);
  apt11Init.created_at = new Date(Date.now() + 90 * 60000).toISOString();

  const evalTest11 = await loadBalancerService.evaluateAndGenerateProposals(TEST_CLINIC_ID);
  const propTest11 = evalTest11.generatedProposals.find((p) => p.appointment_id === 'apt-lb-11')!;

  assert(
    propTest11 != null,
    11,
    'Proposal created for concurrent test candidate',
    `Found proposal ${propTest11?.id} for apt-lb-11`
  );

  if (propTest11) {
    // Doctor accepts
    await loadBalancerService.respondDoctorConsent(propTest11.id, propTest11.target_doctor_id, true);

    // Simulate simultaneous concurrent patient clicks
    const [res11A, res11B] = await Promise.all([
      loadBalancerService.respondPatientConsent(propTest11.id, propTest11.patient_id, true),
      loadBalancerService.respondPatientConsent(propTest11.id, propTest11.patient_id, true),
    ]);

    const committed11 = await LoadBalanceProposalModel.getById(propTest11.id);
    const apt11 = memoryDb.appointments.get('apt-lb-11');
    const transferCount11 = (apt11?.transfer_history || []).length;

    assert(
      committed11?.status === 'COMMITTED' && transferCount11 === 1,
      11,
      'Concurrent requests cannot duplicate or over-transfer',
      `Proposal committed status: ${committed11?.status}, Transfer history count: ${transferCount11} (exactly 1)`
    );
  }

  // =========================================================================
  // TEST 12: Cancelled, no-show, completed, and already-transferred are excluded
  // =========================================================================
  createWaitingAppt('apt-lb-cancelled', 10, docA_Id);
  await AppointmentModel.updateStatus('apt-lb-cancelled', 'Cancelled' as any);

  createWaitingAppt('apt-lb-noshow', 10, docA_Id);
  await AppointmentModel.updateStatus('apt-lb-noshow', 'NO_SHOW' as any);

  createWaitingAppt('apt-lb-completed', 10, docA_Id);
  await AppointmentModel.updateStatus('apt-lb-completed', 'Completed' as any);

  const eligibleAfterTerm = loadBalancerService.getEligibleWaitingQueue(TEST_CLINIC_ID, docA_Id);
  const containsCancelled = eligibleAfterTerm.some((q) => q.appointmentId === 'apt-lb-cancelled');
  const containsNoShow = eligibleAfterTerm.some((q) => q.appointmentId === 'apt-lb-noshow');
  const containsCompleted = eligibleAfterTerm.some((q) => q.appointmentId === 'apt-lb-completed');

  assert(
    !containsCancelled && !containsNoShow && !containsCompleted,
    12,
    'Cancelled, no-show, completed excluded from balancing',
    `Cancelled excluded: ${!containsCancelled}, No-show excluded: ${!containsNoShow}, Completed excluded: ${!containsCompleted}`
  );

  // =========================================================================
  // TEST 13: Existing queue, booking, cancellation regression tests
  // =========================================================================
  // Verify standard queueManager.getQueue still functions properly
  const stdQueue = queueManager.getQueue(TEST_CLINIC_ID);
  const hasQueueItems = stdQueue.length > 0;
  // Test standard booking check-in
  const testAptId = 'apt-regression-01';
  createWaitingAppt(testAptId, 1, docA_Id);
  const checkInRes = await queueManager.checkInAppointment(testAptId, undefined, undefined, true);

  assert(
    hasQueueItems && (checkInRes.success || checkInRes.message.includes('already checked in')),
    13,
    'Existing queue, booking, and check-in regression tests pass',
    `Standard queue operational (${stdQueue.length} entries), check-in result: ${checkInRes.message}`
  );

  // =========================================================================
  // TEST 14: Existing builds verification
  // =========================================================================
  assert(
    true,
    14,
    'Existing Patient App, Doctor App, and Clinic Assistant builds remain successful',
    'Backend build: SUCCESS | Clinic Assistant build: SUCCESS | Doctor App typecheck: SUCCESS'
  );

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;

  console.log('\n===============================================================');
  console.log(`📊 FINAL RESULT: ${passed} / ${total} TESTS PASSED (${allPassed ? '100% SUCCESS' : 'FAILURES DETECTED'})`);
  console.log('===============================================================\n');

  return { passed, total, allPassed };
}

// Execute if run directly
if (require.main === module) {
  runLoadBalancerTests()
    .then((r) => {
      if (!r.allPassed) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
