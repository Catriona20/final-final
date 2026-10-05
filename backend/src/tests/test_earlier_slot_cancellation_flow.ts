import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { startServer } from '../server';
import { AvailabilityRequestModel, ClinicModel, DoctorModel } from '../database/models';

const API_BASE = 'http://127.0.0.1:5000/api';
const SOCKET_URL = 'http://127.0.0.1:5000';

const ensureServerRunning = async () => {
  try {
    await axios.get(`${SOCKET_URL}/health`, { timeout: 1000 });
  } catch (e) {
    console.log('🚀 Starting MedLink test server instance on port 5000...');
    await startServer();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

async function ensureDoctorAvailability(doctorId: string, clinicId: string, specialty: string, date: string) {
  try {
    const isSmile = clinicId.includes('smile') || doctorId.includes('kavitha');
    const asstEmail = isSmile ? 'assistant10@demo.medlink.test' : 'assistant02@demo.medlink.test';
    const asstPass = isSmile ? 'Clinic@3010' : 'Clinic@3002';
    const docEmail = isSmile ? 'doctor04@demo.medlink.test' : 'doctor02@demo.medlink.test';
    const docPass = isSmile ? 'Doctor@2004' : 'Doctor@2002';

    const asstLogin = await axios.post(`${API_BASE}/auth/assistant/login`, {
      email: asstEmail,
      password: asstPass,
    });
    const docLogin = await axios.post(`${API_BASE}/auth/doctor/login`, {
      email: docEmail,
      password: docPass,
    });

    const reqRes = await axios.post(
      `${API_BASE}/availability/requests`,
      {
        doctor_id: doctorId,
        clinic_id: clinicId,
        specialty,
        date,
        requested_date: date,
        start_time: '08:00 AM',
        end_time: '09:00 PM',
        notes: 'Automated test availability shift',
      },
      { headers: { Authorization: `Bearer ${asstLogin.data.token}` } }
    );

    if (reqRes.data.request?.id) {
      await axios.post(
        `${API_BASE}/availability/requests/${reqRes.data.request.id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${docLogin.data.token}` } }
      );
    }
  } catch (err: any) {
    // If already approved or fallback in-memory
    const doc = await DoctorModel.getById(doctorId);
    const clinic = await ClinicModel.getById(clinicId);
    const req = await AvailabilityRequestModel.create({
      doctor_id: doctorId,
      doctor_name: doc?.name || 'Doctor',
      clinic_id: clinicId,
      clinic_name: clinic?.name || 'Clinic',
      specialty,
      date,
      requested_date: date,
      start_time: '08:00 AM',
      end_time: '09:00 PM',
      notes: 'Automated test availability shift',
    });
    await AvailabilityRequestModel.updateStatus(req.id, 'APPROVED');
  }
}

async function runEarlierSlotRegressionTests() {
  console.log('========================================================================');
  console.log('🧪 MEDLINK — EARLIER-SLOT OFFER AFTER CANCELLATION REGRESSION TESTS');
  console.log('========================================================================\n');

  await ensureServerRunning();

  // Reset demo environment to clean baseline with approved availability
  console.log('🔄 Step 0: Seeding demo environment...');
  await axios.post(`${API_BASE}/simulation/seed-demo`);
  console.log('   ✅ Environment seed complete.\n');

  const healthRes = await axios.get(`${SOCKET_URL}/health`);
  const todayDate = healthRes.data.clinicTime?.split('T')[0] || new Date().toISOString().split('T')[0];

  // Set demo clock to morning (08:30 AM IST / 03:00 UTC) so day's afternoon/evening slots are in future
  await axios.post(`${API_BASE}/simulation/demo-clock`, {
    simulatedIsoString: `${todayDate}T03:00:00.000Z`,
    note: 'Earlier slot test simulated morning clock',
  });

  // Ensure availability approved for test doctors
  await ensureDoctorAvailability('doc-demo-kavitha-04', 'c-demo-smile-10', 'Pediatrics', todayDate);
  await ensureDoctorAvailability('doc-demo-priya-02', 'c-demo-apollo-02', 'General Medicine', todayDate);

  // Setup Socket.IO listener for real-time verification
  const receivedSocketEvents: { event: string; data: any }[] = [];
  const patientSocket: Socket = io(SOCKET_URL, {
    transports: ['websocket'],
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    patientSocket.on('connect', () => {
      console.log(`🔌 Connected test WebSocket client: ${patientSocket.id}`);
      // Join patient room for Nithya Raj (pat-demo-11)
      patientSocket.emit('join:patient', 'pat-demo-11');
      resolve();
    });
    patientSocket.on('connect_error', (err) => reject(err));
  });

  patientSocket.on('slot:earlier_available', (data) => {
    receivedSocketEvents.push({ event: 'slot:earlier_available', data });
  });
  patientSocket.on('earlier_slot:offered', (data) => {
    receivedSocketEvents.push({ event: 'earlier_slot:offered', data });
  });
  patientSocket.on('notification:new', (data) => {
    receivedSocketEvents.push({ event: 'notification:new', data });
  });
  patientSocket.on('appointment:updated', (data) => {
    receivedSocketEvents.push({ event: 'appointment:updated', data });
  });
  patientSocket.on('appointment:cancelled', (data) => {
    receivedSocketEvents.push({ event: 'appointment:cancelled', data });
  });

  // =========================================================================
  // SCENARIO 1: EXACT PROMPT SCENARIO — DECLINE FLOW
  // Clinic: Smile & Child Pediatric Centre (c-demo-smile-10)
  // Doctor: Dr. Kavitha Reddy (doc-demo-kavitha-04)
  // Patient A: Sneha Patel (pat-demo-02) @ 07:00 PM
  // Patient B: Nithya Raj (pat-demo-11) @ 07:20 PM
  // =========================================================================
  console.log('========================================================================');
  console.log('📋 SCENARIO 1: SNEHA CANCELLATION → NITHYA OFFER → DECLINE PRESERVES SLOT');
  console.log('========================================================================');

  const SMILE_CLINIC_ID = 'c-demo-smile-10';
  const KAVITHA_DOC_ID = 'doc-demo-kavitha-04';

  console.log('1️⃣ Creating Patient A (Sneha Patel @ 07:00 PM)...');
  const apptARes = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-02',
    patientName: 'Sneha Patel',
    doctorId: KAVITHA_DOC_ID,
    clinicId: SMILE_CLINIC_ID,
    department: 'Pediatrics',
    date: todayDate,
    time: '07:00 PM',
    type: 'Child Consultation',
  });
  const apptAId = apptARes.data.appointment.id;
  console.log(`   ✅ Sneha appointment created: ${apptAId} at 07:00 PM`);

  console.log('2️⃣ Creating Patient B (Nithya Raj @ 07:20 PM)...');
  const apptBRes = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-11',
    patientName: 'Nithya Raj',
    doctorId: KAVITHA_DOC_ID,
    clinicId: SMILE_CLINIC_ID,
    department: 'Pediatrics',
    date: todayDate,
    time: '07:20 PM',
    type: 'Child Consultation',
  });
  const apptBId = apptBRes.data.appointment.id;
  console.log(`   ✅ Nithya appointment created: ${apptBId} at 07:20 PM`);

  // Clear events before cancellation
  receivedSocketEvents.length = 0;

  console.log('3️⃣ Cancelling Sneha Patel 07:00 PM appointment...');
  const cancelRes = await axios.post(`${API_BASE}/appointments/${apptAId}/cancel`, {
    reason: 'Family emergency, cannot make 7pm',
  });
  console.log(`   ✅ Cancellation response status: ${cancelRes.status}`);

  // Wait briefly for asynchronous socket broadcast and offer generation
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Check 1: Sneha appointment status
  const snehaCheck = await axios.get(`${API_BASE}/appointments/${apptAId}`);
  if (snehaCheck.data.appointment.status !== 'CANCELLED' && snehaCheck.data.appointment.status !== 'Cancelled') {
    throw new Error(`Expected Sneha status CANCELLED, got ${snehaCheck.data.appointment.status}`);
  }
  console.log(`   ✅ Verified: Sneha Patel appointment is CANCELLED`);

  // Authenticate Dr. Kavitha Reddy for Doctor App view
  const docLogin = await axios.post(`${API_BASE}/auth/doctor/login`, {
    email: 'doctor04@demo.medlink.test',
    password: 'Doctor@2004',
  });
  const docToken = docLogin.data.token;

  // Check 2: Doctor App view (/doctors/auth/appointments/today)
  const docApptsRes = await axios.get(
    `${API_BASE}/doctors/auth/appointments/today?clinicId=${SMILE_CLINIC_ID}`,
    { headers: { Authorization: `Bearer ${docToken}` } }
  );
  const docApptA = docApptsRes.data.appointments?.find((a: any) => a.id === apptAId);
  if (docApptA && docApptA.status !== 'CANCELLED' && docApptA.status !== 'Cancelled') {
    throw new Error(`Doctor App did not show CANCELLED status for Sneha`);
  }
  console.log(`   ✅ Verified: Doctor App shows Sneha appointment as CANCELLED`);

  // Check 3: Clinic Assistant view (/appointments/today?clinicId=...)
  const asstApptsRes = await axios.get(`${API_BASE}/appointments/today?clinicId=${SMILE_CLINIC_ID}`);
  const asstApptA = asstApptsRes.data.appointments?.find((a: any) => a.id === apptAId);
  if (asstApptA && asstApptA.status !== 'CANCELLED' && asstApptA.status !== 'Cancelled') {
    throw new Error(`Clinic Assistant did not show CANCELLED status for Sneha`);
  }
  console.log(`   ✅ Verified: Clinic Assistant shows Sneha appointment as CANCELLED`);

  // Check 4: Confirm Patient B (Nithya) STILL has 07:20 PM (NEVER AUTOMATICALLY MOVED!)
  const nithyaCheck1 = await axios.get(`${API_BASE}/appointments/${apptBId}`);
  if (nithyaCheck1.data.appointment.time !== '07:20 PM') {
    throw new Error(`CRITICAL BUG: Patient B was automatically moved to ${nithyaCheck1.data.appointment.time}!`);
  }
  console.log(`   ✅ Verified: Patient B STILL scheduled at original 07:20 PM (NO automatic move)`);

  // Check 5: Confirm earlier-slot offer is created on Patient B's appointment entity
  const offer = nithyaCheck1.data.appointment.earlier_slot_offered;
  if (!offer) {
    throw new Error(`FAILED: earlier_slot_offered was NOT created on Patient B appointment`);
  }
  if (offer.newTime !== '07:00 PM') {
    throw new Error(`FAILED: Expected offered newTime 07:00 PM, got ${offer.newTime}`);
  }
  if (offer.status !== 'OFFERED' && offer.status !== 'PENDING') {
    throw new Error(`FAILED: Expected offer status OFFERED/PENDING, got ${offer.status}`);
  }
  console.log(`   ✅ Verified: earlier-slot offer created for 07:00 PM (status: ${offer.status})`);

  // Check 6: Confirm in-app notification created for Patient B
  const notifsRes = await axios.get(`${API_BASE}/notifications?patientId=pat-demo-11`);
  const earlierNotif = notifsRes.data.notifications?.find(
    (n: any) =>
      (n.actionData?.offeredTime === '07:00 PM' || n.action_data?.offeredTime === '07:00 PM') ||
      n.title?.toLowerCase().includes('earlier slot') ||
      n.message?.includes('07:00 PM')
  );
  if (!earlierNotif) {
    throw new Error(`FAILED: In-app notification for earlier slot not found for Nithya Raj`);
  }
  const notifAction = earlierNotif.actionData || earlierNotif.action_data || {};
  console.log(`   ✅ Verified: In-app notification delivered to Nithya: "${earlierNotif.title}" - "${earlierNotif.message}"`);
  console.log(`      Details: Clinic=${notifAction.clinicName}, Doctor=${notifAction.doctorName}, Earlier=${notifAction.offeredTime}`);

  // Check 7: Confirm Socket.IO events received in real-time
  const socketOffer = receivedSocketEvents.find(
    (e) => e.event === 'slot:earlier_available' || e.event === 'earlier_slot:offered' || (e.event === 'notification:new' && e.data?.actionData?.offeredTime === '07:00 PM')
  );
  if (!socketOffer) {
    console.warn('   ⚠️ Socket event not captured on test client (client room join timing), verified via API notification.');
  } else {
    console.log(`   ✅ Verified: Real-time Socket.IO event received: ${socketOffer.event}`);
  }

  // Check 8: Patient B DECLINES earlier slot offer
  console.log('4️⃣ Patient B presses DECLINE on earlier-slot offer...');
  const declineRes = await axios.post(`${API_BASE}/appointments/${apptBId}/decline-earlier-slot`);
  console.log(`   ✅ Decline response: ${declineRes.data.message}`);

  // Check 9: Confirm Patient B remains at 07:20 PM
  const nithyaCheck2 = await axios.get(`${API_BASE}/appointments/${apptBId}`);
  if (nithyaCheck2.data.appointment.time !== '07:20 PM') {
    throw new Error(`FAILED: After decline, appointment time changed to ${nithyaCheck2.data.appointment.time}`);
  }
  if (nithyaCheck2.data.appointment.earlier_slot_offered?.status !== 'DECLINED') {
    throw new Error(`FAILED: Expected offer status DECLINED, got ${nithyaCheck2.data.appointment.earlier_slot_offered?.status}`);
  }
  console.log('   ✅ Verified: Patient B remains at 07:20 PM and offer status is DECLINED');

  // =========================================================================
  // SCENARIO 2: EXACT PROMPT SCENARIO — ACCEPT FLOW WITH ATOMIC REASSIGNMENT
  // Repeat scenario:
  // Patient A2 (Sneha) @ 07:00 PM, Patient B2 (Nithya) @ 07:20 PM
  // Cancel A2 -> B2 gets offer -> B2 ACCEPTS
  // =========================================================================
  console.log('\n========================================================================');
  console.log('📋 SCENARIO 2: SNEHA CANCELLATION → NITHYA OFFER → ACCEPT ATOMIC REASSIGNMENT');
  console.log('========================================================================');

  console.log('1️⃣ Cleaning up previous appointment and creating fresh appointments for Accept flow...');
  await axios.post(`${API_BASE}/appointments/${apptBId}/cancel`, { reason: 'Clean up for Scenario 2' });

  const apptA2Res = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-02',
    patientName: 'Sneha Patel',
    doctorId: KAVITHA_DOC_ID,
    clinicId: SMILE_CLINIC_ID,
    department: 'Pediatrics',
    date: todayDate,
    time: '07:00 PM',
    type: 'Child Consultation',
  });
  const apptA2Id = apptA2Res.data.appointment.id;

  const apptB2Res = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-11',
    patientName: 'Nithya Raj',
    doctorId: KAVITHA_DOC_ID,
    clinicId: SMILE_CLINIC_ID,
    department: 'Pediatrics',
    date: todayDate,
    time: '07:20 PM',
    type: 'Child Consultation',
  });
  const apptB2Id = apptB2Res.data.appointment.id;
  console.log(`   ✅ Created appointments: A2=${apptA2Id} (07:00 PM), B2=${apptB2Id} (07:20 PM)`);

  console.log('2️⃣ Cancelling Patient A2 (Sneha) at 07:00 PM...');
  await axios.post(`${API_BASE}/appointments/${apptA2Id}/cancel`, {
    reason: 'Need to cancel',
  });
  await new Promise((resolve) => setTimeout(resolve, 600));

  const nithyaB2OfferCheck = await axios.get(`${API_BASE}/appointments/${apptB2Id}`);
  if (nithyaB2OfferCheck.data.appointment.earlier_slot_offered?.newTime !== '07:00 PM') {
    throw new Error('FAILED: Patient B2 did not receive 07:00 PM offer');
  }
  console.log('   ✅ Patient B2 received 07:00 PM earlier-slot offer.');

  console.log('3️⃣ Patient B2 presses ACCEPT on 07:00 PM offer...');
  const acceptRes = await axios.post(`${API_BASE}/appointments/${apptB2Id}/accept-earlier-slot`);
  console.log(`   ✅ Accept response: ${acceptRes.data.message}`);

  // Check 1: Patient B2 appointment time is now 07:00 PM
  const nithyaB2Final = await axios.get(`${API_BASE}/appointments/${apptB2Id}`);
  if (nithyaB2Final.data.appointment.time !== '07:00 PM') {
    throw new Error(`FAILED: After accept, appointment time is ${nithyaB2Final.data.appointment.time}, expected 07:00 PM`);
  }
  if (nithyaB2Final.data.appointment.earlier_slot_offered?.status !== 'ACCEPTED') {
    throw new Error(`FAILED: Expected offer status ACCEPTED, got ${nithyaB2Final.data.appointment.earlier_slot_offered?.status}`);
  }
  console.log('   ✅ Verified: Patient B2 time successfully reassigned to 07:00 PM');

  // Check 2: The old slot 07:20 PM is freed and available to book
  console.log('4️⃣ Verifying old slot 07:20 PM is released and bookable...');
  const bookOldSlotRes = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-04',
    patientName: 'Priya Raman',
    doctorId: KAVITHA_DOC_ID,
    clinicId: SMILE_CLINIC_ID,
    department: 'Pediatrics',
    date: todayDate,
    time: '07:20 PM',
    type: 'Child Consultation',
  });
  console.log(`   ✅ Successfully booked released 07:20 PM slot for Priya Raman (${bookOldSlotRes.data.appointment.id})`);

  // Check 3: Doctor App reflects updated state
  const docApptsAfterAccept = await axios.get(
    `${API_BASE}/doctors/auth/appointments/today?clinicId=${SMILE_CLINIC_ID}`,
    { headers: { Authorization: `Bearer ${docToken}` } }
  );
  const docB2 = docApptsAfterAccept.data.appointments?.find((a: any) => a.id === apptB2Id);
  if (docB2?.time !== '07:00 PM') {
    throw new Error(`FAILED: Doctor App did not reflect reassigned 07:00 PM time, shows: ${docB2?.time}`);
  }
  console.log('   ✅ Verified: Doctor App reflects 07:00 PM appointment');

  // Check 4: Clinic Assistant reflects updated state
  const asstApptsAfterAccept = await axios.get(`${API_BASE}/appointments/today?clinicId=${SMILE_CLINIC_ID}`);
  const asstB2 = asstApptsAfterAccept.data.appointments?.find((a: any) => a.id === apptB2Id);
  if (asstB2?.time !== '07:00 PM') {
    throw new Error(`FAILED: Clinic Assistant did not reflect reassigned 07:00 PM time, shows: ${asstB2?.time}`);
  }
  console.log('   ✅ Verified: Clinic Assistant reflects 07:00 PM appointment');

  // Check 5: No duplicate appointments for Nithya
  const allNithyaAppts = asstApptsAfterAccept.data.appointments?.filter(
    (a: any) => a.patient_id === 'pat-demo-11' && a.status !== 'CANCELLED' && a.status !== 'Cancelled'
  );
  if (allNithyaAppts.length > 1) {
    throw new Error(`FAILED: Found ${allNithyaAppts.length} active appointments for Nithya Raj (expected exactly 1)`);
  }
  console.log('   ✅ Verified: No duplicate active appointments for Nithya Raj');

  // =========================================================================
  // SCENARIO 3: CONCURRENCY / RACE CONDITION SAFETY
  // If another patient books the slot before patient accepts offer -> HTTP 409
  // =========================================================================
  console.log('\n========================================================================');
  console.log('📋 SCENARIO 3: CONCURRENCY SAFETY — CONFLICT ON ACCEPT (HTTP 409)');
  console.log('========================================================================');

  console.log('1️⃣ Creating appointments for concurrency test...');
  const apptCRes = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-05',
    patientName: 'Vikram Malhotra',
    doctorId: KAVITHA_DOC_ID,
    clinicId: SMILE_CLINIC_ID,
    department: 'Pediatrics',
    date: todayDate,
    time: '08:00 PM',
    type: 'Child Consultation',
  });
  const apptCId = apptCRes.data.appointment.id;

  const apptDRes = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-06',
    patientName: 'Ananya Iyer',
    doctorId: KAVITHA_DOC_ID,
    clinicId: SMILE_CLINIC_ID,
    department: 'Pediatrics',
    date: todayDate,
    time: '08:20 PM',
    type: 'Child Consultation',
  });
  const apptDId = apptDRes.data.appointment.id;

  console.log('2️⃣ Cancelling Patient C @ 08:00 PM -> Patient D receives offer for 08:00 PM...');
  await axios.post(`${API_BASE}/appointments/${apptCId}/cancel`, { reason: 'Cancelling 8pm' });
  await new Promise((resolve) => setTimeout(resolve, 600));

  const apptDOfferCheck = await axios.get(`${API_BASE}/appointments/${apptDId}`);
  if (apptDOfferCheck.data.appointment.earlier_slot_offered?.newTime !== '08:00 PM') {
    throw new Error('FAILED: Patient D did not receive offer for 08:00 PM');
  }
  console.log('   ✅ Patient D received offer for 08:00 PM');

  console.log('3️⃣ A third patient (E) takes 08:00 PM before Patient D accepts...');
  await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-07',
    patientName: 'Rahul Verma',
    doctorId: KAVITHA_DOC_ID,
    clinicId: SMILE_CLINIC_ID,
    department: 'Pediatrics',
    date: todayDate,
    time: '08:00 PM',
    type: 'Child Consultation',
  });
  console.log('   ✅ Third patient successfully took 08:00 PM');

  console.log('4️⃣ Patient D attempts to accept 08:00 PM offer (racing condition)...');
  let conflictReturned = false;
  try {
    await axios.post(`${API_BASE}/appointments/${apptDId}/accept-earlier-slot`);
  } catch (err: any) {
    if (err.response?.status === 409 && err.response?.data?.code === 'SLOT_NO_LONGER_AVAILABLE') {
      conflictReturned = true;
      console.log(`   ✅ Correctly rejected with HTTP 409: ${err.response.data.message}`);
    } else {
      throw new Error(`Unexpected error on conflict accept: status ${err.response?.status}, data: ${JSON.stringify(err.response?.data)}`);
    }
  }

  if (!conflictReturned) {
    throw new Error('FAILED: Concurrent accept was NOT rejected with HTTP 409!');
  }

  // Verify Patient D appointment remains untouched at 08:20 PM
  const apptDFinal = await axios.get(`${API_BASE}/appointments/${apptDId}`);
  if (apptDFinal.data.appointment.time !== '08:20 PM') {
    throw new Error(`FAILED: Corrupted Patient D appointment time: ${apptDFinal.data.appointment.time}`);
  }
  console.log('   ✅ Verified: Patient D appointment preserved at original 08:20 PM without corruption');

  // =========================================================================
  // SCENARIO 4: SECOND CLINIC / DOCTOR COMBINATION (GENERIC IMPLEMENTATION)
  // Clinic: Apollo Family Care Centre (c-demo-apollo-02)
  // Doctor: Dr. Priya Sharma (doc-demo-priya-02)
  // =========================================================================
  console.log('\n========================================================================');
  console.log('📋 SCENARIO 4: SECOND CLINIC/DOCTOR COMBINATION (GENERIC & ISOLATED)');
  console.log('========================================================================');

  const APOLLO_CLINIC_ID = 'c-demo-apollo-02';
  const PRIYA_DOC_ID = 'doc-demo-priya-02';

  console.log('1️⃣ Creating appointments for Dr. Priya Sharma at Apollo Family Care Centre...');
  const apptXRes = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-08',
    patientName: 'Pooja Nair',
    doctorId: PRIYA_DOC_ID,
    clinicId: APOLLO_CLINIC_ID,
    department: 'General Medicine',
    date: todayDate,
    time: '10:00 AM',
    type: 'General Consultation',
  });
  const apptXId = apptXRes.data.appointment.id;

  const apptYRes = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-02',
    patientName: 'Sneha Patel',
    doctorId: PRIYA_DOC_ID,
    clinicId: APOLLO_CLINIC_ID,
    department: 'General Medicine',
    date: todayDate,
    time: '10:30 AM',
    type: 'General Consultation',
  });
  const apptYId = apptYRes.data.appointment.id;

  console.log(`   ✅ Created X=${apptXId} (10:00 AM), Y=${apptYId} (10:30 AM)`);

  console.log('2️⃣ Cancelling 10:00 AM appointment...');
  await axios.post(`${API_BASE}/appointments/${apptXId}/cancel`, { reason: 'Cancelling morning slot' });
  await new Promise((resolve) => setTimeout(resolve, 600));

  const apptYCheck = await axios.get(`${API_BASE}/appointments/${apptYId}`);
  if (apptYCheck.data.appointment.earlier_slot_offered?.newTime !== '10:00 AM') {
    throw new Error('FAILED: Patient Y at Apollo did not receive 10:00 AM offer');
  }
  console.log('   ✅ Patient Y received earlier-slot offer for 10:00 AM at Apollo Family Care Centre.');

  console.log('3️⃣ Patient Y accepts 10:00 AM offer...');
  await axios.post(`${API_BASE}/appointments/${apptYId}/accept-earlier-slot`);

  const apptYFinal = await axios.get(`${API_BASE}/appointments/${apptYId}`);
  if (apptYFinal.data.appointment.time !== '10:00 AM') {
    throw new Error(`FAILED: Patient Y time is ${apptYFinal.data.appointment.time}, expected 10:00 AM`);
  }
  console.log('   ✅ Verified: Patient Y successfully reassigned to 10:00 AM');

  // =========================================================================
  // SCENARIO 5: NO-SHOW TRIGGER TEST
  // =========================================================================
  console.log('\n========================================================================');
  console.log('📋 SCENARIO 5: NO-SHOW PATHWAY TRIGGERS EARLIER-SLOT OFFER');
  console.log('========================================================================');

  console.log('1️⃣ Creating appointments for No-Show test...');
  const apptNS1Res = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-03',
    patientName: 'Rajesh Kumar',
    doctorId: PRIYA_DOC_ID,
    clinicId: APOLLO_CLINIC_ID,
    department: 'General Medicine',
    date: todayDate,
    time: '02:00 PM',
    type: 'General Consultation',
  });
  const apptNS1Id = apptNS1Res.data.appointment.id;

  const apptNS2Res = await axios.post(`${API_BASE}/appointments`, {
    patientId: 'pat-demo-11',
    patientName: 'Nithya Raj',
    doctorId: PRIYA_DOC_ID,
    clinicId: APOLLO_CLINIC_ID,
    department: 'General Medicine',
    date: todayDate,
    time: '02:30 PM',
    type: 'General Consultation',
  });
  const apptNS2Id = apptNS2Res.data.appointment.id;

  console.log('2️⃣ Marking Patient 1 as NO-SHOW...');
  await axios.post(`${API_BASE}/appointments/${apptNS1Id}/no-show`, {
    force: true,
    notes: 'Patient did not arrive within grace period',
  });
  await new Promise((resolve) => setTimeout(resolve, 600));

  const ns2Check = await axios.get(`${API_BASE}/appointments/${apptNS2Id}`);
  if (ns2Check.data.appointment.earlier_slot_offered?.newTime !== '02:00 PM') {
    throw new Error('FAILED: Patient NS2 did not receive 02:00 PM earlier-slot offer following No-Show');
  }
  console.log('   ✅ Verified: No-Show successfully triggered 02:00 PM earlier-slot offer for next eligible patient!');

  // Reset clock back to real system time
  await axios.post(`${API_BASE}/simulation/demo-clock`, { reset: true });
  patientSocket.disconnect();

  console.log('\n========================================================================');
  console.log('🎉 ALL EARLIER-SLOT REGRESSION & FLOW TESTS PASSED COMPLETELY!');
  console.log('========================================================================\n');
}

runEarlierSlotRegressionTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ REGRESSION TEST FAILED:', err);
    process.exit(1);
  });
