import { Router, Request, Response } from 'express';
import { AppointmentModel, DoctorModel, ClinicModel, MedicalFileModel, PatientModel, resolveCanonicalClinicId, resolveCanonicalDoctorId } from '../database/models';
import { memoryDb, saveStateToFile } from '../database/db';
import { queueManager } from '../services/queueManager';
import { notificationService } from '../services/notificationService';
import { twilioService } from '../services/twilioService';
import { resendService } from '../services/resendService';
import { emitToPatient, emitToAppointment, emitToDoctor, emitToClinic, emitBroadcast } from '../services/socketService';
import { timeService } from '../services/timeService';
import { doctorAvailabilityService } from '../services/doctorAvailabilityService';

import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export const appointmentRouter = Router();

// In-flight booking locks to prevent double-click / rapid concurrent submissions
const activeBookingLocks = new Set<string>();

export const clearActiveBookingLocks = (): void => {
  activeBookingLocks.clear();
};

export const getActiveBookingLocksCount = (): number => {
  return activeBookingLocks.size;
};

function standardizeTime(t?: string): string {
  if (!t) return '';
  const match = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return t.trim().toUpperCase();
  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  const meridiem = (match[3] || 'AM').toUpperCase();
  return `${hours}:${minutes} ${meridiem}`;
}

// BOOK APPOINTMENT HANDLER
const bookAppointmentHandler = async (req: Request, res: Response): Promise<void> => {
  let bookingLockKey: string | null = null;
  try {
    // 1. Authenticated Identity Resolution
    let authenticatedPatientId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], config.jwtSecret) as any;
        if (decoded && decoded.id) {
          authenticatedPatientId = decoded.id;
        }
      } catch (e) {
        // Invalid or expired token
      }
    }

    const doctorId = req.body.doctorId || req.body.doctor_id;
    const clinicId = req.body.clinicId || req.body.clinic_id;
    const department = req.body.department;
    const date = req.body.date || req.body.appointment_date || req.body.appointmentDate;
    const time = req.body.time || req.body.slot_time || req.body.slotTime || req.body.appointment_time || req.body.appointmentTime;
    const reason = req.body.reason || 'General consultation';
    const customReasonText = req.body.customReasonText;
    const symptoms = req.body.symptoms || [];
    const uploadedFiles = req.body.uploadedFiles || [];
    const notes = req.body.notes;
    const expectedDuration = req.body.expectedDuration || '20 min';
    const consultationFee = req.body.consultationFee;

    const patientId = authenticatedPatientId || req.body.patientId || req.body.patient_id || (req as any).user?.id || 'pat-demo-01';

    if (!doctorId || !clinicId || !date || !time) {
      res.status(400).json({ success: false, error: 'Missing required booking parameters (doctorId, clinicId, date, time).' });
      return;
    }

    const doctor = await DoctorModel.getById(doctorId);
    const clinic = await ClinicModel.getById(clinicId);
    const patient = await PatientModel.findById(patientId);

    if (!doctor || !clinic) {
      res.status(404).json({ success: false, error: 'Selected doctor or clinic not found in healthcare registry.' });
      return;
    }

    if (clinic.status === 'PENDING_REVIEW' || clinic.status === 'REJECTED' || clinic.verification_status === 'PENDING_REVIEW' || clinic.verification_status === 'REJECTED') {
      res.status(403).json({ success: false, error: 'Selected clinic is currently pending approval or inactive.' });
      return;
    }

    const docStatus = (doctor as any).account_status || doctor.verification_status;
    const isDocVerified = doctor.is_verified || docStatus === 'VERIFIED' || docStatus === 'ACTIVE';
    if (!isDocVerified || docStatus === 'PENDING_REVIEW' || docStatus === 'REJECTED' || (doctor as any).account_status === 'PENDING_REVIEW') {
      res.status(403).json({ success: false, error: 'Selected doctor is currently pending verification or inactive.' });
      return;
    }

    const normalizedDate = timeService.normalizeDateString(date);
    const normalizedTime = standardizeTime(time);

    // 2. In-flight concurrency lock (prevent rapid double clicks)
    bookingLockKey = `${doctor.id}:${normalizedDate}:${normalizedTime}`;
    if (activeBookingLocks.has(bookingLockKey)) {
      res.status(409).json({
        success: false,
        code: 'BOOKING_IN_PROGRESS',
        error: 'A booking for this slot is currently being processed. Please wait.',
      });
      return;
    }
    activeBookingLocks.add(bookingLockKey);

    // 3. Duplicate Booking Check: Check if slot is already booked or if patient has active booking
    for (const existingApt of memoryDb.appointments.values()) {
      const existingDocId = existingApt.doctor_id || existingApt.doctorId;
      const existingDate = timeService.normalizeDateString(existingApt.date || existingApt.appointmentDate);
      const existingTime = standardizeTime(existingApt.time || existingApt.slotStartTime);
      const isActive = !['Cancelled', 'CANCELLED', 'No Show', 'NO_SHOW', 'No-Show'].includes(existingApt.status);

      if (isActive && existingDate === normalizedDate && existingTime === normalizedTime) {
        if (existingApt.patient_id === patientId) {
          res.status(409).json({
            success: false,
            code: 'DUPLICATE_BOOKING',
            error: 'You already have an appointment scheduled for this time slot.',
            appointment: formatAppointmentResponse(existingApt),
          });
          return;
        }

        if (existingDocId === doctor.id) {
          res.status(409).json({
            success: false,
            code: 'SLOT_NO_LONGER_AVAILABLE',
            error: 'This slot is no longer available. Please select another time slot.',
          });
          return;
        }
      }
    }

    // Comprehensive Authoritative Backend Slot Validation
    const durMins = parseInt(String(expectedDuration).replace(/[^0-9]/g, ''), 10) || 20;
    const validation = await doctorAvailabilityService.validateSlotAvailability(
      doctor.id,
      clinic.id,
      normalizedDate,
      normalizedTime,
      { consultationDurationMinutes: durMins }
    );

    if (!validation.valid) {
      const isConflict = validation.code === 'SLOT_NO_LONGER_AVAILABLE';
      res.status(isConflict ? 409 : 400).json({
        success: false,
        code: validation.code,
        error: validation.error,
      });
      return;
    }

    // 4. Assign unique token, queue position & estimated wait
    const queueData = await queueManager.assignTokenAndQueue(doctorId, normalizedDate);

    // 5. Persist appointment in relational store
    const newAppointment = await AppointmentModel.create({
      patient_id: patientId,
      patient_name: patient?.name || req.body.patientName || 'Patient',
      patient_phone: patient?.phone || req.body.patientPhone || '+91 99999 99999',
      doctor_id: doctor.id,
      doctor_name: doctor.name,
      doctor_specialization: doctor.specialization,
      doctor_avatar: doctor.avatar,
      clinic_id: clinic.id,
      clinic_name: clinic.name,
      clinic_address: clinic.address,
      department: department || doctor.specialization,
      date: normalizedDate,
      time: normalizedTime,
      duration: expectedDuration || '25 min',
      status: 'Booked',
      appointmentStatus: 'BOOKED',
      queue_number: queueData.queuePosition,
      token_number: queueData.tokenNumber,
      queue_position: queueData.queuePosition,
      patients_ahead: queueData.patientsAhead,
      estimated_wait: queueData.estimatedWait,
      travel_time: '12 min',
      distance: '1.4 km',
      reason,
      custom_reason_text: customReasonText,
      symptoms,
      consultation_fee: consultationFee || doctor.consultation_fee || '₹400',
      notes,
      prescription_available: false,
    });

    // 6. Save any uploaded files attached to appointment
    for (const file of uploadedFiles) {
      await MedicalFileModel.create({
        patient_id: patientId,
        appointment_id: newAppointment.id,
        clinic_id: clinic.id,
        file_name: file.fileName || 'medical_report.pdf',
        file_type: file.fileType || 'application/pdf',
        file_size: file.fileSize || '1.2 MB',
        uri: file.uri,
        upload_date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        test_name: file.testName || 'Patient Uploaded Document',
        category: file.category || 'Medical document',
        clinic_performed: clinic.name,
        test_date: normalizedDate,
        reason_for_test: reason,
        notes: file.notes,
      });
    }

    // 7. Send Multi-Channel Notifications (In-App, Real-Time Socket, SMS, Email)
    await notificationService.notifyAppointmentBooked(newAppointment, patient?.email, patient?.phone);

    // 8. Emit socket event strictly to scoped participants & broadcast availability update
    const formatted = formatAppointmentResponse(newAppointment);
    emitToPatient(patientId, 'appointment:created', formatted);
    emitToClinic(clinic.id, 'appointment:created', formatted);
    emitToDoctor(doctor.id, 'appointment:created', formatted);
    emitBroadcast('appointment:created', formatted);
    emitBroadcast('doctor:availability_updated', {
      doctorId: doctor.id,
      doctorName: doctor.name,
      clinicId: clinic.id,
      date: normalizedDate,
      slot: normalizedTime,
      action: 'BOOKING',
      appointmentId: newAppointment.id,
    });

    res.status(201).json({
      success: true,
      appointment: formatted,
    });
  } catch (err: any) {
    if (err.message && err.message.includes('slot is no longer available')) {
      res.status(409).json({ success: false, error: 'This slot is no longer available.' });
      return;
    }
    console.error('Booking appointment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to complete appointment booking.' });
  } finally {
    if (bookingLockKey) {
      activeBookingLocks.delete(bookingLockKey);
    }
  }
};

appointmentRouter.post('/book', bookAppointmentHandler);
appointmentRouter.post('/', bookAppointmentHandler);

function formatAppointmentResponse(apt: any) {
  if (!apt) return null;
  const todayStr = timeService.getTodayDateString();
  const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);

  let liveQueuePosition = apt.queue_position !== undefined ? apt.queue_position : apt.queuePosition;
  let livePatientsAhead = apt.patients_ahead !== undefined ? apt.patients_ahead : apt.patientsAhead;
  let liveEstimatedWait = apt.estimated_wait || apt.estimatedWait;
  let liveStatus = apt.status;
  let currentServingToken: string | undefined = undefined;
  let currentServingPatient: string | undefined = undefined;

  const isCompleted = ['Completed', 'COMPLETED'].includes(apt.status) || ['Completed', 'COMPLETED'].includes(apt.appointmentStatus);

  if (isCompleted) {
    liveQueuePosition = 0;
    livePatientsAhead = 0;
    liveEstimatedWait = 'Completed';
    liveStatus = 'Completed';
  } else if (
    aptDate === todayStr &&
    !['Cancelled', 'CANCELLED', 'No Show', 'NO_SHOW', 'No-Show'].includes(apt.status)
  ) {
    const queue = queueManager.getQueue(apt.clinic_id, apt.doctor_id, todayStr);
    const activeItem = queue.find((q) => q.status === 'IN_CONSULTATION');
    if (activeItem) {
      currentServingToken = activeItem.tokenNumber || activeItem.token || activeItem.queueNumber;
      currentServingPatient = activeItem.patientName;
    }
    const myQueueEntry = queue.find(
      (q) => q.appointmentId === apt.id || q.id === apt.id || q.id === `q-${apt.id}`
    );
    if (myQueueEntry) {
      liveQueuePosition = myQueueEntry.queuePosition;
      livePatientsAhead = myQueueEntry.patientsAhead;
      liveEstimatedWait = myQueueEntry.estimatedWaitText || `${myQueueEntry.estimatedWait} min`;
      if (myQueueEntry.status === 'IN_CONSULTATION') {
        liveStatus = 'In Consultation';
      } else if (
        ['Checked In', 'CHECKED_IN', 'Waiting', 'WAITING'].includes(apt.status) ||
        myQueueEntry.status === 'WAITING'
      ) {
        liveStatus =
          myQueueEntry.patientsAhead === 0
            ? 'Next'
            : myQueueEntry.patientsAhead === 1
            ? 'Almost Your Turn'
            : 'Waiting';
      }
    }
  }

  // Check if prescription exists for this appointment
  const rx = memoryDb.prescriptions.get(apt.id) ||
    Array.from(memoryDb.prescriptions.values()).find((p) => p.appointment_id === apt.id || p.id === `rx-${apt.id}`);

  let formattedRx: any = null;
  if (rx) {
    formattedRx = {
      id: rx.id,
      appointmentId: rx.appointment_id,
      doctorName: rx.doctor_name,
      doctorSpecialization: rx.doctor_specialization,
      doctorRegistrationNumber: rx.doctor_registration_number,
      clinicName: rx.clinic_name,
      clinicAddress: rx.clinic_address,
      date: rx.date,
      diagnosis: rx.diagnosis,
      clinicalNotes: rx.clinical_notes,
      medicines: rx.medicines || [],
      followUpDate: rx.follow_up_date,
    };
  }

  return {
    ...apt,
    doctorId: apt.doctor_id || apt.doctorId,
    clinicId: apt.clinic_id || apt.clinicId,
    patientId: apt.patient_id || apt.patientId,
    patientName: apt.patient_name || apt.patientName || 'Patient',
    doctorName: apt.doctor_name || apt.doctorName,
    doctorSpecialization: apt.doctor_specialization || apt.doctorSpecialization,
    doctorAvatar: apt.doctor_avatar || apt.doctorAvatar,
    clinicName: apt.clinic_name || apt.clinicName,
    clinicAddress: apt.clinic_address || apt.clinicAddress,
    tokenNumber: apt.token_number || apt.tokenNumber,
    queuePosition: liveQueuePosition,
    patientsAhead: livePatientsAhead,
    estimatedWait: liveEstimatedWait,
    status: liveStatus,
    currentServingToken,
    currentServingPatient,
    travelTime: apt.travel_time || apt.travelTime,
    consultationFee: apt.consultation_fee || apt.consultationFee,
    prescriptionAvailable: formattedRx ? true : (apt.prescription_available !== undefined ? apt.prescription_available : apt.prescriptionAvailable),
    prescription: formattedRx || apt.prescription || null,
    customReasonText: apt.custom_reason_text || apt.customReasonText,
    startDateTime: apt.created_at,
    referenceId: (apt.id || '').toUpperCase(),
  };
}

// GET /api/appointments
appointmentRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let authenticatedPatientId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], config.jwtSecret) as any;
        if (decoded && decoded.id) {
          authenticatedPatientId = decoded.id;
        }
      } catch (e) {
        // Invalid or expired token
      }
    }

    const queryPatientId = req.query.patientId as string;
    const clinicId = req.query.clinicId as string;
    const doctorId = req.query.doctorId as string;
    const statusQuery = req.query.status as string;

    let appointments: any[] = [];
    if (clinicId) {
      appointments = await AppointmentModel.getByClinicId(clinicId);
    } else if (doctorId) {
      appointments = await AppointmentModel.getByDoctorId(doctorId);
    } else {
      const targetPatientId = authenticatedPatientId || queryPatientId;
      if (targetPatientId) {
        appointments = await AppointmentModel.getByPatientId(targetPatientId);
      } else {
        // Strict isolation: Never default to pat-demo-01
        appointments = [];
      }
    }

    if (statusQuery) {
      const normStatus = statusQuery.toUpperCase().replace(/[\s_-]+/g, '');
      if (normStatus === 'ACTIVE') {
        const nonActiveStatuses = ['CANCELLED', 'CANCELED', 'COMPLETED', 'NOSHOW', 'NO_SHOW'];
        appointments = appointments.filter(
          (a) => !nonActiveStatuses.includes((a.status || '').toUpperCase().replace(/[\s_-]+/g, ''))
        );
      } else if (normStatus !== 'ALL') {
        appointments = appointments.filter(
          (a) => (a.status || '').toUpperCase().replace(/[\s_-]+/g, '') === normStatus
        );
      }
    }

    // Deduplicate appointments strictly by appointment id
    const seenIds = new Set<string>();
    const deduplicatedList: any[] = [];
    for (const a of appointments) {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id);
        deduplicatedList.push(formatAppointmentResponse(a));
      }
    }

    res.status(200).json({ success: true, appointments: deduplicatedList });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch appointments.' });
  }
});

// GET /api/appointments/patient/:patientId
appointmentRouter.get('/patient/:patientId', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.patientId;
    const patientObj = memoryDb.patients.get(rawId);
    const targetIds = new Set<string>([rawId]);
    if (patientObj) {
      targetIds.add(patientObj.id);
    }
    const list = Array.from(memoryDb.appointments.values())
      .filter((a: any) => targetIds.has(a.patient_id) || targetIds.has(a.patientId))
      .map(formatAppointmentResponse);
    res.status(200).json({ success: true, appointments: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch patient appointments.' });
  }
});

// GET /api/appointments/active
appointmentRouter.get('/active', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicId = req.query.clinicId as string;
    const doctorId = req.query.doctorId as string;
    const patientId = req.query.patientId as string;

    const list: any[] = [];
    const nonActive = ['CANCELLED', 'CANCELED', 'COMPLETED', 'NOSHOW', 'NO_SHOW'];

    for (const apt of memoryDb.appointments.values()) {
      const norm = (apt.status || '').toUpperCase().replace(/[\s_-]+/g, '');
      if (nonActive.includes(norm)) continue;

      if (clinicId && apt.clinic_id !== clinicId && !apt.clinic_name?.toLowerCase().includes(clinicId.toLowerCase())) {
        continue;
      }
      if (doctorId && apt.doctor_id !== doctorId && !apt.doctor_name?.toLowerCase().includes(doctorId.toLowerCase())) {
        continue;
      }
      if (patientId && apt.patient_id !== patientId) {
        continue;
      }
      list.push(formatAppointmentResponse(apt));
    }

    res.status(200).json({ success: true, count: list.length, appointments: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch active appointments.' });
  }
});

// GET /api/appointments/patient/:patientId
appointmentRouter.get('/patient/:patientId', async (req: Request, res: Response): Promise<void> => {
  try {
    const targetPatientId = req.params.patientId;
    const appointments = await AppointmentModel.getByPatientId(targetPatientId);
    res.status(200).json({
      success: true,
      appointments: appointments.map(formatAppointmentResponse),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch patient appointments.' });
  }
});

// GET /api/appointments/today
appointmentRouter.get('/today', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicId = req.query.clinicId as string;
    const doctorId = req.query.doctorId as string;
    const status = req.query.status as string;

    const appointments = await AppointmentModel.getTodayAppointments({ clinicId, doctorId, status });
    const formatted = appointments.map((a) => formatAppointmentResponse(a));

    res.status(200).json({
      success: true,
      count: formatted.length,
      appointments: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch today appointments.' });
  }
});

// GET /api/appointments/upcoming
appointmentRouter.get('/upcoming', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicId = req.query.clinicId as string;
    const doctorId = req.query.doctorId as string;
    const patientId = req.query.patientId as string;

    const list: any[] = [];
    for (const apt of memoryDb.appointments.values()) {
      const aptDate = apt.date || apt.appointmentDate;
      if (!timeService.isFutureDate(aptDate)) {
        continue;
      }
      if (['Cancelled', 'CANCELLED', 'NO_SHOW', 'No Show'].includes(apt.status)) {
        continue;
      }
      if (clinicId && apt.clinic_id !== clinicId && !apt.clinic_name.toLowerCase().includes(clinicId.toLowerCase())) {
        continue;
      }
      if (doctorId && apt.doctor_id !== doctorId && !apt.doctor_name.toLowerCase().includes(doctorId.toLowerCase())) {
        continue;
      }
      if (patientId && apt.patient_id !== patientId) {
        continue;
      }
      list.push(apt);
    }

    list.sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.time || '').localeCompare(b.time || '');
    });

    const formatted = list.map((a) => formatAppointmentResponse(a));
    res.status(200).json({
      success: true,
      count: formatted.length,
      appointments: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch upcoming appointments.' });
  }
});

// GET /api/appointments/:id
appointmentRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const appointment = await AppointmentModel.getById(req.params.id);
    if (!appointment) {
      res.status(404).json({ success: false, error: 'Appointment not found.' });
      return;
    }
    res.status(200).json({ success: true, appointment: formatAppointmentResponse(appointment) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch appointment.' });
  }
});

// PUT & POST /api/appointments/:id/check-in
const handleCheckIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { doctorId, notes, forceDeskCheckIn } = req.body || {};
    const result = await queueManager.checkInAppointment(req.params.id, doctorId, notes, Boolean(forceDeskCheckIn));

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    if (result.appointment) {
      await notificationService.notifyPatientCheckIn(result.appointment);
    }

    res.status(200).json({
      success: true,
      appointment: formatAppointmentResponse(result.appointment),
      tokenNumber: result.tokenNumber,
      message: result.message,
    });
  } catch (err: any) {
    console.error('Check-in error:', err);
    res.status(500).json({ success: false, error: 'Failed to check in appointment.' });
  }
};
appointmentRouter.put('/:id/check-in', handleCheckIn);
appointmentRouter.post('/:id/check-in', handleCheckIn);

// PUT & POST /api/appointments/:id/no-show
const handleNoShow = async (req: Request, res: Response): Promise<void> => {
  try {
    const force = Boolean(req.body?.force || req.query?.force === 'true' || req.body?.forceNoShow);
    const result = await queueManager.handleNoShow(req.params.id, { force });
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json({
      success: true,
      appointment: formatAppointmentResponse(result.appointment),
      affectedPatient: formatAppointmentResponse(result.affectedPatient),
      offeredSlot: result.offeredSlot,
      message: result.message,
    });
  } catch (err: any) {
    console.error('No-show handler error:', err);
    res.status(500).json({ success: false, error: 'Failed to process no-show.' });
  }
};
appointmentRouter.put('/:id/no-show', handleNoShow);
appointmentRouter.post('/:id/no-show', handleNoShow);

// POST & PUT /api/appointments/:id/cancel
const handleCancelAppointment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason = 'Patient requested cancellation' } = req.body || {};
    const result = await queueManager.cancelAppointment(req.params.id, reason);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      appointment: formatAppointmentResponse(result.appointment!),
      message: result.message || 'Appointment cancelled successfully.',
    });
  } catch (err: any) {
    console.error('Cancel appointment error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel appointment.' });
  }
};
appointmentRouter.post('/:id/cancel', handleCancelAppointment);
appointmentRouter.put('/:id/cancel', handleCancelAppointment);
appointmentRouter.patch('/:id/cancel', handleCancelAppointment);

// POST /api/appointments/:id/switch-doctor
appointmentRouter.post('/:id/switch-doctor', async (req: Request, res: Response): Promise<void> => {
  try {
    const { newDoctorId, reason } = req.body || {};
    if (!newDoctorId) {
      res.status(400).json({ success: false, error: 'Missing newDoctorId parameter.' });
      return;
    }

    const result = await queueManager.switchDoctor(req.params.id, newDoctorId, reason);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json({
      success: true,
      appointment: formatAppointmentResponse(result.appointment),
      message: result.message,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to switch doctor.' });
  }
});

// POST /api/appointments/:id/reschedule
appointmentRouter.post('/:id/reschedule', async (req: Request, res: Response): Promise<void> => {
  let rescheduleLockKey: string | null = null;
  try {
    const { date, time } = req.body;
    if (!date || !time) {
      res.status(400).json({ success: false, error: 'Both date and time are required for rescheduling.' });
      return;
    }

    const apt = await AppointmentModel.getById(req.params.id);
    if (!apt) {
      res.status(404).json({ success: false, error: 'Appointment not found.' });
      return;
    }

    if (['Cancelled', 'CANCELLED', 'Completed', 'COMPLETED', 'NO_SHOW', 'No Show'].includes(apt.status)) {
      res.status(400).json({ success: false, error: `Cannot reschedule an appointment with status ${apt.status}.` });
      return;
    }

    const normNewDate = timeService.normalizeDateString(date);
    const normNewTime = timeService.normalizeTimeString(time);

    // Concurrency Lock for Target Slot
    rescheduleLockKey = `${apt.doctor_id}:${normNewDate}:${normNewTime}`;
    if (activeBookingLocks.has(rescheduleLockKey)) {
      res.status(409).json({
        success: false,
        code: 'SLOT_NO_LONGER_AVAILABLE',
        error: 'This slot is currently being processed or booked. Please select another slot.',
      });
      return;
    }
    activeBookingLocks.add(rescheduleLockKey);

    // Comprehensive Backend Slot Validation (working hours, breaks, leave, past date/slot, active appointments)
    const durMins = parseInt(String(apt.duration || '20 min').replace(/[^0-9]/g, ''), 10) || 20;
    const validation = await doctorAvailabilityService.validateSlotAvailability(
      apt.doctor_id,
      apt.clinic_id,
      normNewDate,
      normNewTime,
      { excludeAppointmentId: apt.id, consultationDurationMinutes: durMins }
    );

    if (!validation.valid) {
      const isConflict = validation.code === 'SLOT_NO_LONGER_AVAILABLE';
      res.status(isConflict ? 409 : 400).json({
        success: false,
        code: validation.code,
        error: validation.error,
      });
      return;
    }

    const oldDate = apt.date || apt.appointmentDate;
    const oldTime = apt.time || apt.slotStartTime;

    const isNowToday = timeService.isToday(normNewDate);
    const newStatus = isNowToday ? 'Waiting' : 'Booked';

    const updated = await AppointmentModel.update(apt.id, {
      date: normNewDate,
      time: normNewTime,
      appointmentDate: normNewDate,
      slotStartTime: normNewTime,
      status: newStatus,
      appointmentStatus: 'BOOKED',
    });

    if (isNowToday) {
      memoryDb.appointment_queue.set(apt.id, {
        id: `queue-${apt.id}`,
        clinic_id: apt.clinic_id,
        doctor_id: apt.doctor_id,
        appointment_id: apt.id,
        token_number: apt.token_number,
        queue_position: apt.queue_position,
        patients_ahead: apt.patients_ahead,
        status: newStatus,
        estimated_wait_minutes: 10,
        updated_at: new Date().toISOString(),
      });
    } else {
      memoryDb.appointment_queue.delete(apt.id);
    }

    const reschedulePayload = {
      appointmentId: updated!.id,
      clinicId: updated!.clinic_id,
      patientId: updated!.patient_id,
      doctorId: updated!.doctor_id,
      oldDate,
      oldTime,
      newDate: normNewDate,
      newTime: normNewTime,
      status: newStatus,
      appointmentStatus: 'BOOKED',
    };

    emitToPatient(updated!.patient_id, 'appointment:rescheduled', reschedulePayload);
    emitToPatient(updated!.patient_id, 'appointment:status', reschedulePayload);
    emitToDoctor(updated!.doctor_id, 'appointment:rescheduled', reschedulePayload);
    if (updated!.clinic_id) {
      emitToClinic(updated!.clinic_id, 'appointment:rescheduled', reschedulePayload);
    }
    emitBroadcast('appointment:rescheduled', reschedulePayload);
    emitBroadcast('doctor:availability_updated', {
      doctorId: updated!.doctor_id,
      clinicId: updated!.clinic_id,
      releasedDate: oldDate,
      releasedSlot: oldTime,
      bookedDate: normNewDate,
      bookedSlot: normNewTime,
      action: 'RESCHEDULE',
      appointmentId: updated!.id,
    });
    emitBroadcast('queue:updated', { freedAppointmentId: apt.id, message: 'Queue updated after reschedule.' });

    await notificationService.sendNotification({
      patientId: updated!.patient_id,
      title: 'Appointment Rescheduled 📅',
      message: `Rescheduled with ${updated!.doctor_name} to ${normNewDate} at ${normNewTime}.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: updated!.id },
    });

    res.status(200).json({ success: true, appointment: formatAppointmentResponse(updated) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to reschedule appointment.' });
  } finally {
    if (rescheduleLockKey) {
      activeBookingLocks.delete(rescheduleLockKey);
    }
  }
});

// POST & PUT /api/appointments/:id/accept-earlier-slot
const handleAcceptEarlierSlot = async (req: Request, res: Response): Promise<void> => {
  let lockKey: string | null = null;
  try {
    const appointmentId = req.params.id;
    const appointment = await AppointmentModel.getById(appointmentId);
    if (!appointment) {
      res.status(404).json({ success: false, error: 'Appointment not found.' });
      return;
    }

    // 1. Offer still exists
    if (!appointment.earlier_slot_offered) {
      res.status(400).json({ success: false, error: 'No earlier slot offer pending for this appointment.' });
      return;
    }

    const offer = appointment.earlier_slot_offered;

    // 2. Offer has not already been accepted/declined
    if (offer.status === 'ACCEPTED') {
      res.status(400).json({ success: false, error: 'This earlier slot offer has already been accepted.' });
      return;
    }
    if (offer.status === 'DECLINED') {
      res.status(400).json({ success: false, error: 'This earlier slot offer was previously declined.' });
      return;
    }

    // 3. Offer belongs to authenticated patient (if JWT provided)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], config.jwtSecret) as any;
        if (decoded && decoded.id) {
          const authPatientId = decoded.id;
          const aptPatientId = appointment.patient_id;
          const aliases = [authPatientId, ...((memoryDb.patients as any).getAliases?.(authPatientId) || [])];
          if (!aliases.includes(aptPatientId) && aptPatientId !== authPatientId) {
            res.status(403).json({ success: false, error: 'You are not authorized to accept this offer.' });
            return;
          }
        }
      } catch (e) {
        // Optional JWT parsing
      }
    }

    // 4. Original appointment is still active
    const normAptStatus = (appointment.status || '').toUpperCase().replace(/[\s_-]+/g, '');
    if (['CANCELLED', 'COMPLETED', 'NOSHOW', 'NO_SHOW'].includes(normAptStatus)) {
      res.status(400).json({ success: false, error: `Cannot accept offer because appointment is ${appointment.status}.` });
      return;
    }

    const normTargetDate = timeService.normalizeDateString(offer.newDate);
    const normTargetTime = timeService.normalizeTimeString(offer.newTime);
    const canonicalDoctorId = resolveCanonicalDoctorId(appointment.doctor_id);
    const canonicalClinicId = resolveCanonicalClinicId(appointment.clinic_id);

    // 5. Concurrency / race safety lock
    lockKey = `${canonicalDoctorId}:${normTargetDate}:${normTargetTime}`;
    if (activeBookingLocks.has(lockKey)) {
      res.status(409).json({
        success: false,
        code: 'SLOT_NO_LONGER_AVAILABLE',
        error: 'This earlier slot is currently being claimed or processed. Please try again.',
      });
      return;
    }
    activeBookingLocks.add(lockKey);

    // 6. Validate that earlier slot is STILL AVAILABLE (concurrency protection)
    for (const existing of memoryDb.appointments.values()) {
      if (
        existing.id !== appointment.id &&
        resolveCanonicalDoctorId(existing.doctor_id) === canonicalDoctorId &&
        resolveCanonicalClinicId(existing.clinic_id) === canonicalClinicId &&
        timeService.normalizeDateString(existing.date || existing.appointmentDate) === normTargetDate &&
        timeService.normalizeTimeString(existing.time || existing.slotStartTime) === normTargetTime &&
        !['Cancelled', 'CANCELLED', 'NO_SHOW', 'No Show', 'Completed', 'COMPLETED'].includes(existing.status)
      ) {
        activeBookingLocks.delete(lockKey);
        res.status(409).json({
          success: false,
          code: 'SLOT_NO_LONGER_AVAILABLE',
          error: 'This earlier slot has already been claimed by another patient.',
        });
        return;
      }
    }

    const durMins = parseInt(String(appointment.duration || '20 min').replace(/[^0-9]/g, ''), 10) || 20;
    const validation = await doctorAvailabilityService.validateSlotAvailability(
      appointment.doctor_id,
      appointment.clinic_id,
      normTargetDate,
      normTargetTime,
      { excludeAppointmentId: appointment.id, consultationDurationMinutes: durMins }
    );

    if (!validation.valid) {
      activeBookingLocks.delete(lockKey);
      res.status(409).json({
        success: false,
        code: validation.code || 'SLOT_NO_LONGER_AVAILABLE',
        error: validation.error || 'The earlier slot is no longer available.',
      });
      return;
    }

    // 7. Perform atomic reassignment
    const oldTime = appointment.time || appointment.slotStartTime;
    const oldDate = appointment.date || appointment.appointmentDate;
    const calculatedEndTime = timeService.calculateSlotEndTime(normTargetTime, appointment.duration || '20 min');

    const updated = await AppointmentModel.update(appointment.id, {
      date: normTargetDate,
      time: normTargetTime,
      appointmentDate: normTargetDate,
      slotStartTime: normTargetTime,
      slotEndTime: calculatedEndTime,
      estimated_wait: offer.estimatedWait || appointment.estimated_wait,
      earlier_slot_offered: {
        ...offer,
        status: 'ACCEPTED',
        acceptedAt: new Date().toISOString(),
      },
    });

    // Update queue tracking if item exists in live queue
    const queueItem = memoryDb.appointment_queue.get(appointment.id);
    if (queueItem) {
      queueItem.updated_at = new Date().toISOString();
      memoryDb.appointment_queue.set(appointment.id, queueItem);
    }

    saveStateToFile();

    // 8. Update in-app notifications in memoryDb.notifications
    for (const notif of memoryDb.notifications.values()) {
      if (
        (notif.appointment_id === appointment.id || notif.action_data?.appointmentId === appointment.id) &&
        (notif.title?.toLowerCase().includes('earlier') || notif.message?.toLowerCase().includes('earlier'))
      ) {
        notif.read = true;
        notif.is_read = true;
        if (notif.action_data) {
          notif.action_data.status = 'ACCEPTED';
          notif.action_data.acceptedAt = new Date().toISOString();
        }
      }
    }

    // 9. Emit real-time events to Patient, Doctor, Clinic, Broadcast
    const updatePayload = formatAppointmentResponse(updated);

    emitToPatient(appointment.patient_id, 'appointment:status', {
      appointmentId: appointment.id,
      date: normTargetDate,
      time: normTargetTime,
      status: appointment.status,
    });
    emitToPatient(appointment.patient_id, 'appointment:updated', updatePayload);
    emitToPatient(appointment.patient_id, 'slot:earlier_accepted', {
      appointmentId: appointment.id,
      newTime: normTargetTime,
      newDate: normTargetDate,
      oldTime,
      oldDate,
    });

    emitToDoctor(appointment.doctor_id, 'appointment:updated', updatePayload);
    emitToDoctor(appointment.doctor_id, 'queue:updated', {
      appointmentId: appointment.id,
      freedSlot: oldTime,
      newSlot: normTargetTime,
      date: normTargetDate,
    });

    if (appointment.clinic_id) {
      emitToClinic(appointment.clinic_id, 'appointment:updated', updatePayload);
      emitToClinic(appointment.clinic_id, 'queue:updated', {
        appointmentId: appointment.id,
        freedSlot: oldTime,
        newSlot: normTargetTime,
        date: normTargetDate,
      });
    }

    emitBroadcast('appointment:updated', updatePayload);
    emitBroadcast('queue:updated', {
      appointmentId: appointment.id,
      freedSlot: oldTime,
      newSlot: normTargetTime,
      date: normTargetDate,
    });
    emitBroadcast('doctor:availability_updated', {
      doctorId: appointment.doctor_id,
      clinicId: appointment.clinic_id,
      date: normTargetDate,
      releasedSlot: oldTime,
      claimedSlot: normTargetTime,
      action: 'SLOT_REASSIGNMENT',
    });

    if (updated) {
      await notificationService.notifyEarlierSlotAccepted(updated);
    }

    // Cascade: Offer the newly released old slot (e.g. 07:20 PM) to the next eligible patient!
    if (oldTime && oldDate) {
      queueManager.offerReleasedSlotToNextEligiblePatient(appointment, oldTime, oldDate).catch((e) => {
        console.warn('Cascading earlier slot offer error:', e);
      });
    }

    res.status(200).json({
      success: true,
      appointment: formatAppointmentResponse(updated),
      message: `Appointment successfully moved from ${oldTime} to earlier slot ${normTargetTime}.`,
    });
  } catch (err: any) {
    console.error('Accept earlier slot error:', err);
    res.status(500).json({ success: false, error: 'Failed to accept earlier slot.' });
  } finally {
    if (lockKey) {
      activeBookingLocks.delete(lockKey);
    }
  }
};
appointmentRouter.post('/:id/accept-earlier-slot', handleAcceptEarlierSlot);
appointmentRouter.put('/:id/accept-earlier-slot', handleAcceptEarlierSlot);

// POST & PUT /api/appointments/:id/decline-earlier-slot
const handleDeclineEarlierSlot = async (req: Request, res: Response): Promise<void> => {
  try {
    const appointmentId = req.params.id;
    const appointment = await AppointmentModel.getById(appointmentId);
    if (!appointment) {
      res.status(404).json({ success: false, error: 'Appointment not found.' });
      return;
    }

    const currentOffer = appointment.earlier_slot_offered;

    const updated = await AppointmentModel.update(appointmentId, {
      earlier_slot_offered: currentOffer
        ? {
            ...currentOffer,
            status: 'DECLINED',
            declinedAt: new Date().toISOString(),
          }
        : undefined,
    });

    // Update in-app notifications in memoryDb.notifications
    for (const notif of memoryDb.notifications.values()) {
      if (
        (notif.appointment_id === appointmentId || notif.action_data?.appointmentId === appointmentId) &&
        (notif.title?.toLowerCase().includes('earlier') || notif.message?.toLowerCase().includes('earlier'))
      ) {
        notif.read = true;
        notif.is_read = true;
        if (notif.action_data) {
          notif.action_data.status = 'DECLINED';
          notif.action_data.declinedAt = new Date().toISOString();
        }
      }
    }
    saveStateToFile();

    const formatted = formatAppointmentResponse(updated);

    emitToPatient(appointment.patient_id, 'slot:earlier_declined', {
      appointmentId,
      time: appointment.time,
      date: appointment.date,
    });
    emitToPatient(appointment.patient_id, 'appointment:updated', formatted);

    if (updated) {
      await notificationService.notifyEarlierSlotDeclined(updated);
    }

    res.status(200).json({
      success: true,
      appointment: formatted,
      message: 'Earlier slot offer declined. Original appointment retained.',
    });
  } catch (err: any) {
    console.error('Decline earlier slot error:', err);
    res.status(500).json({ success: false, error: 'Failed to decline earlier slot.' });
  }
};
appointmentRouter.post('/:id/decline-earlier-slot', handleDeclineEarlierSlot);
appointmentRouter.put('/:id/decline-earlier-slot', handleDeclineEarlierSlot);

// DELETE /api/appointments/:id
appointmentRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const { memoryDb, saveStateToFile } = await import('../database/db');
    if (memoryDb.appointments.has(id)) {
      memoryDb.appointments.delete(id);
      memoryDb.appointment_queue.delete(id);
      saveStateToFile();
      res.status(200).json({ success: true, message: 'Appointment deleted successfully.' });
      return;
    }
    res.status(404).json({ success: false, error: 'Appointment not found.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

