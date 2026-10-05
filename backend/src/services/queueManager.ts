import { memoryDb, saveStateToFile } from '../database/db';
import { AppointmentModel, AppointmentEntity, DoctorModel, WalkInModel, WalkInEntity, resolveCanonicalClinicId, resolveCanonicalDoctorId } from '../database/models';
import { emitToPatient, emitToAppointment, emitToDoctor, emitToClinic, emitBroadcast } from './socketService';
import { notificationService } from './notificationService';
import { timeService } from './timeService';

/**
 * Converts a time string (e.g., '07:00 PM', '19:00', '09:30 AM') to total minutes since midnight.
 */
export function timeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim();
  const isPM = clean.toUpperCase().includes('PM');
  const isAM = clean.toUpperCase().includes('AM');
  const parts = clean.replace(/[^\d:]/g, '').split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export interface UnifiedQueueItem {
  id: string;
  queueId: string;
  queueNumber: string;
  token: string;
  token_number: string;
  tokenNumber: string;
  queue_number: number;
  queuePosition?: number;
  patientsAhead?: number;
  patientName: string;
  patientId: string;
  doctorName: string;
  doctorId: string;
  clinicId: string;
  priority: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  waitingTime: number; // in minutes elapsed
  estimatedWait: number; // in minutes remaining
  estimatedWaitText: string;
  status: 'WAITING' | 'IN_CONSULTATION' | 'COMPLETED';
  appointmentId?: string;
  walkInId?: string;
  createdAt: string;
  addedAt: string;
  reason?: string;
}

export const queueManager = {
  /**
   * Generates a new unique token and assigns initial queue position for doctor & date.
   */
  async assignTokenAndQueue(
    doctorId: string,
    date: string,
    priority: 'NORMAL' | 'URGENT' | 'EMERGENCY' = 'NORMAL'
  ): Promise<{ tokenNumber: string; queuePosition: number; patientsAhead: number; estimatedWait: string }> {
    let existingCount = 0;
    const doc = memoryDb.doctors.get(doctorId);
    const avgDuration = parseInt(doc?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;

    const normDate = timeService.normalizeDateString(date);

    for (const apt of memoryDb.appointments.values()) {
      const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);
      if (apt.doctor_id === doctorId && aptDate === normDate && !['Cancelled', 'CANCELLED', 'Completed', 'COMPLETED', 'NO_SHOW', 'No Show'].includes(apt.status)) {
        existingCount++;
      }
    }

    const tokenNum = existingCount + 1;
    const prefix = priority === 'EMERGENCY' ? 'E' : priority === 'URGENT' ? 'U' : 'A';
    const tokenNumber = `${prefix}${String(tokenNum).padStart(3, '0')}`;
    const patientsAhead = Math.max(0, tokenNum - 1);
    const estimatedMinutes = priority === 'EMERGENCY' ? 0 : patientsAhead * avgDuration;
    const estimatedWait = estimatedMinutes === 0 ? 'Under 2 min' : `${estimatedMinutes} min`;

    return {
      tokenNumber,
      queuePosition: tokenNum,
      patientsAhead,
      estimatedWait,
    };
  },

  /**
   * Retrieves the unified live queue for a clinic and/or doctor.
   * CRITICAL: Strictly scopes queue items to TODAY's date (Asia/Kolkata demo clock).
   * Tomorrow and future appointments NEVER enter the live OPD queue.
   * Strictly enforces ONE active queue entry per appointmentId and walkInId.
   */
  getQueue(clinicId?: string, doctorId?: string, date?: string): UnifiedQueueItem[] {
    const queueList: UnifiedQueueItem[] = [];
    const priorityWeight = { EMERGENCY: 3, URGENT: 2, NORMAL: 1 };
    const todayDate = date ? timeService.normalizeDateString(date) : timeService.getTodayDateString();
    const canonicalClinicId = clinicId ? resolveCanonicalClinicId(clinicId) : undefined;
    const canonicalDoctorId = doctorId ? resolveCanonicalDoctorId(doctorId) : undefined;
    const seenAppointmentIds = new Set<string>();
    const seenWalkInIds = new Set<string>();

    // 1. Collect checked-in / waiting appointments for target date
    for (const apt of memoryDb.appointments.values()) {
      const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);
      // Strictly filter by scheduled date
      if (aptDate !== todayDate) {
        continue;
      }

      // Completed, Cancelled, and No-Show appointments must NEVER have an active queue entry
      const termStatuses = ['Completed', 'COMPLETED', 'Cancelled', 'CANCELLED', 'No Show', 'NO_SHOW', 'No-Show'];
      if (termStatuses.includes(apt.status) || termStatuses.includes(apt.appointmentStatus)) {
        continue;
      }

      const activeStatuses = [
        'Checked In', 'CHECKED_IN',
        'Waiting', 'WAITING',
        'Almost Your Turn', 'Next',
        'In Consultation', 'IN_CONSULTATION'
      ];

      if (activeStatuses.includes(apt.status)) {
        if (canonicalClinicId) {
          const aptCanonical = resolveCanonicalClinicId(apt.clinic_id);
          if (aptCanonical !== canonicalClinicId) {
            continue;
          }
        }
        if (canonicalDoctorId) {
          const aptDocCanonical = resolveCanonicalDoctorId(apt.doctor_id);
          if (aptDocCanonical !== canonicalDoctorId && apt.doctor_id !== doctorId) {
            continue;
          }
        }

        // Deduplicate: Enforce ONE active queue entry per appointmentId
        if (seenAppointmentIds.has(apt.id)) {
          continue;
        }
        seenAppointmentIds.add(apt.id);

        const isInConsult = ['In Consultation', 'IN_CONSULTATION'].includes(apt.status);
        const waitMins = parseInt(apt.estimated_wait?.replace(/[^0-9]/g, '') || '15', 10) || 15;
        
        // Canonical token determination - NEVER undefined or empty
        const tokenCandidate = (apt.token_number && apt.token_number.trim()) ||
          (apt.tokenNumber && apt.tokenNumber.trim()) ||
          (apt.queueToken && apt.queueToken.trim()) ||
          (apt.queue_number ? `A${String(apt.queue_number).padStart(3, '0')}` : 'A001');

        const priority: 'NORMAL' | 'URGENT' | 'EMERGENCY' = tokenCandidate.startsWith('E')
          ? 'EMERGENCY'
          : tokenCandidate.startsWith('U')
          ? 'URGENT'
          : 'NORMAL';

        const queueId = `q-${apt.id}`;
        const queuePos = apt.queue_position || apt.queue_number || 1;

        queueList.push({
          id: queueId,
          queueId,
          queueNumber: tokenCandidate,
          token: tokenCandidate,
          token_number: tokenCandidate,
          tokenNumber: tokenCandidate,
          queue_number: queuePos,
          queuePosition: queuePos,
          patientName: apt.patient_name || 'Patient',
          patientId: apt.patient_id || 'pat-demo-01',
          doctorName: apt.doctor_name || 'Dr. Practitioner',
          doctorId: apt.doctor_id || doctorId || 'doc-demo-arun-01',
          clinicId: apt.clinic_id || clinicId || 'c-demo-moon-01',
          priority,
          waitingTime: 5,
          estimatedWait: isInConsult ? 0 : waitMins,
          estimatedWaitText: isInConsult ? 'In Consultation' : `${waitMins} min`,
          status: isInConsult ? 'IN_CONSULTATION' : 'WAITING',
          appointmentId: apt.id,
          createdAt: apt.created_at || new Date().toISOString(),
          addedAt: apt.created_at || new Date().toISOString(),
          reason: apt.reason,
        });
      }
    }

    // 2. Collect active walk-ins
    for (const w of memoryDb.walk_ins.values()) {
      if (['WAITING', 'IN_CONSULTATION'].includes(w.status)) {
        if (canonicalClinicId) {
          const wCanonical = resolveCanonicalClinicId(w.clinic_id);
          if (wCanonical !== canonicalClinicId) {
            continue;
          }
        }
        if (canonicalDoctorId) {
          const wDocCanonical = resolveCanonicalDoctorId(w.doctor_id);
          if (wDocCanonical !== canonicalDoctorId && w.doctor_id !== doctorId) {
            continue;
          }
        }

        // Deduplicate: Enforce ONE active queue entry per walkInId
        if (seenWalkInIds.has(w.id)) {
          continue;
        }
        seenWalkInIds.add(w.id);

        const isInConsult = w.status === 'IN_CONSULTATION';
        const doc = w.doctor_id ? memoryDb.doctors.get(w.doctor_id) : null;
        const avgDuration = parseInt(doc?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;

        const rawToken = (w.token_number && w.token_number.trim()) ||
          (w.priority === 'EMERGENCY' ? `E-W${(w.id.replace(/[^a-zA-Z0-9]/g, '').slice(-3) || '001')}` : `W-${(w.id.replace(/[^a-zA-Z0-9]/g, '').slice(-3) || '001')}`);
        const tokenCandidate = rawToken.toUpperCase();

        const queueId = `q-w-${w.id}`;

        queueList.push({
          id: queueId,
          queueId,
          queueNumber: tokenCandidate,
          token: tokenCandidate,
          token_number: tokenCandidate,
          tokenNumber: tokenCandidate,
          queue_number: 1,
          patientName: w.patient_name || 'Walk-in Patient',
          patientId: w.patient_id || `pat-${w.id}`,
          doctorName: w.preferred_doctor || doc?.name || 'Doctor',
          doctorId: w.doctor_id || doctorId || 'doc-demo-arun-01',
          clinicId: w.clinic_id || clinicId || 'c-demo-moon-01',
          priority: w.priority || 'NORMAL',
          waitingTime: 0,
          estimatedWait: isInConsult ? 0 : avgDuration,
          estimatedWaitText: isInConsult ? 'In Consultation' : `${avgDuration} min`,
          status: isInConsult ? 'IN_CONSULTATION' : 'WAITING',
          walkInId: w.id,
          createdAt: w.created_at || new Date().toISOString(),
          addedAt: w.created_at || new Date().toISOString(),
          reason: w.reason,
        });
      }
    }

    // Sort: In Consultation at the top, then Emergency > Urgent > Normal, then arrival time
    queueList.sort((a, b) => {
      if (a.status === 'IN_CONSULTATION' && b.status !== 'IN_CONSULTATION') return -1;
      if (b.status === 'IN_CONSULTATION' && a.status !== 'IN_CONSULTATION') return 1;

      const pDiff = (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1);
      if (pDiff !== 0) return pDiff;

      return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
    });

    // Authoritative queuePosition, patientsAhead, and wait time calculation
    const hasInConsult = queueList.some((q) => q.status === 'IN_CONSULTATION');
    let waitingPos = 1;
    for (const item of queueList) {
      const doc = item.doctorId ? memoryDb.doctors.get(item.doctorId) : null;
      const avgDuration = parseInt(doc?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;

      if (item.status === 'IN_CONSULTATION') {
        item.queuePosition = 0;
        item.queue_number = 0;
        item.patientsAhead = 0;
        item.estimatedWait = 0;
        item.estimatedWaitText = 'In Consultation';
      } else {
        const patientsAhead = (hasInConsult ? 1 : 0) + (waitingPos - 1);
        item.queuePosition = waitingPos;
        item.queue_number = waitingPos;
        item.patientsAhead = patientsAhead;
        if (item.priority === 'EMERGENCY') {
          item.estimatedWait = 0;
          item.estimatedWaitText = 'Immediate';
        } else {
          item.estimatedWait = patientsAhead * avgDuration;
          item.estimatedWaitText = item.estimatedWait === 0 ? 'Under 2 min' : `~${item.estimatedWait} min`;
        }
        waitingPos++;
      }

      // Sync memoryDb appointment entity if linked
      if (item.appointmentId && memoryDb.appointments.has(item.appointmentId)) {
        const linkedApt = memoryDb.appointments.get(item.appointmentId);
        if (linkedApt) {
          linkedApt.queue_position = item.queuePosition;
          linkedApt.patients_ahead = item.patientsAhead;
          linkedApt.estimated_wait = item.estimatedWaitText;
        }
      }
    }

    return queueList;
  },

  /**
   * Checks in a patient appointment at the clinic reception desk.
   */
  async checkInAppointment(
    appointmentId: string,
    overrideDoctorId?: string,
    notes?: string,
    forceDeskCheckIn: boolean = false
  ): Promise<{ success: boolean; appointment?: AppointmentEntity; tokenNumber?: string; message: string }> {
    const apt = await AppointmentModel.getById(appointmentId);
    if (!apt) {
      return { success: false, message: 'Appointment not found in clinical database.' };
    }

    if (['Checked In', 'CHECKED_IN', 'In Consultation', 'IN_CONSULTATION'].includes(apt.status)) {
      return { success: false, appointment: apt, message: 'Patient is already checked in.' };
    }

    // Strict Date/Time Window Verification (Enforce 30-min window; future appointments rejected)
    const aptDate = apt.date || apt.appointmentDate || timeService.getTodayDateString();
    const aptTime = apt.time || apt.slotStartTime || '09:00 AM';
    const windowMinutes = forceDeskCheckIn ? 720 : 30;
    const checkInWindow = timeService.isCheckInOpen(aptDate, aptTime, windowMinutes);
    if (!checkInWindow.open) {
      return {
        success: false,
        appointment: apt,
        message: checkInWindow.message || 'Check-in is not open yet for this appointment.',
      };
    }

    if (overrideDoctorId) {
      const doc = memoryDb.doctors.get(overrideDoctorId);
      if (doc) {
        apt.doctor_id = doc.id;
        apt.doctor_name = doc.name;
        apt.doctor_specialization = doc.specialization;
      }
    }

    // Preserve canonical token if already assigned during booking (single source of truth)
    const existingToken = apt.token_number || apt.queueToken || (apt as any).tokenNumber;
    let tokenNumber = existingToken;
    if (!tokenNumber) {
      const todayStr = timeService.getTodayDateString();
      const queueData = await this.assignTokenAndQueue(apt.doctor_id, todayStr);
      tokenNumber = queueData.tokenNumber;
    }

    // Calculate real queue position based on current active queue
    const activeQueue = this.getQueue(apt.clinic_id, apt.doctor_id);
    const waitingOrInConsult = activeQueue.filter(
      (item) => item.appointmentId !== apt.id && item.status !== 'COMPLETED'
    );
    const queuePosition = waitingOrInConsult.length + 1;
    const patientsAhead = waitingOrInConsult.length;
    const doc = memoryDb.doctors.get(apt.doctor_id);
    const avgDuration = parseInt(doc?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;
    const estimatedMinutes = patientsAhead * avgDuration;
    const estimatedWait = estimatedMinutes === 0 ? 'Under 2 min' : `${estimatedMinutes} min`;

    apt.status = 'Checked In';
    apt.appointmentStatus = 'CHECKED_IN';
    apt.checkedInAt = timeService.getCurrentClinicDate().toISOString();
    apt.token_number = tokenNumber;
    apt.queueToken = tokenNumber;
    apt.queue_number = queuePosition;
    apt.queue_position = queuePosition;
    apt.patients_ahead = patientsAhead;
    apt.estimated_wait = estimatedWait;
    if (notes) apt.notes = notes;
    apt.updated_at = timeService.getCurrentClinicDate().toISOString();

    await AppointmentModel.update(apt.id, apt);

    // Emit Real-Time Socket Events to All Connected Apps
    const socketPayload = {
      appointmentId: apt.id,
      id: apt.id,
      clinicId: apt.clinic_id,
      patientId: apt.patient_id,
      doctorId: apt.doctor_id,
      appointmentDate: apt.date,
      slotStartTime: apt.time,
      status: 'Checked In',
      appointmentStatus: 'CHECKED_IN',
      tokenNumber: apt.token_number,
      token: apt.token_number,
      queueToken: apt.token_number,
      queuePosition: apt.queue_position,
      queueNumber: apt.token_number,
      patientsAhead: apt.patients_ahead,
      estimatedWait: apt.estimated_wait,
    };

    emitToPatient(apt.patient_id, 'appointment:checked_in', socketPayload);
    emitToPatient(apt.patient_id, 'appointment:status', socketPayload);
    emitToPatient(apt.patient_id, 'queue:updated', socketPayload);
    emitToDoctor(apt.doctor_id, 'queue:updated', socketPayload);
    emitToDoctor(apt.doctor_id, 'appointment:status', socketPayload);
    if (apt.clinic_id) {
      emitToClinic(apt.clinic_id, 'queue:updated', socketPayload);
      emitToClinic(apt.clinic_id, 'appointment:status', socketPayload);
    }
    emitBroadcast('queue:updated', socketPayload);
    emitBroadcast('appointment:updated', socketPayload);
    emitBroadcast('appointment:status', socketPayload);

    // Send Notification
    await notificationService.sendNotification({
      patientId: apt.patient_id,
      title: 'Checked In Successfully 🏥',
      message: `You are checked in with ${apt.doctor_name}. Your live token is ${apt.token_number} (${apt.patients_ahead} ahead).`,
      category: 'Queue Updates',
      type: 'appointment',
      actionData: { appointmentId: apt.id },
    });

    return {
      success: true,
      appointment: apt,
      tokenNumber: apt.token_number,
      message: `${apt.patient_name || 'Patient'} checked in successfully as Token ${apt.token_number}.`,
    };
  },

  /**
   * Identifies the next eligible patient in chronological order to receive an earlier-slot offer.
   * Strict eligibility rules:
   * 1. Active appointment (Booked, Waiting, Checked In)
   * 2. Same clinic (strict clinic isolation, no cross-clinic offers)
   * 3. Same doctor (canonical doctor ID match)
   * 4. Scheduled on the same date as the freed slot
   * 5. Scheduled strictly AFTER the freed slot (candidate time > freed slot time)
   * 6. Next eligible patient in chronological order (earliest scheduled time among candidates)
   * 7. Not the cancelled/no-show appointment itself
   * 8. Not the same patient who cancelled/no-showed
   * 9. Not already cancelled, no-show, in consultation, or completed
   * 10. Not already having a pending earlier-slot offer
   * 11. Procedure / Department compatibility where required
   * 12. Preferred-doctor constraints respected
   */
  findNextEligiblePatientForEarlierSlot(
    freedApt: AppointmentEntity,
    freedSlotTime: string,
    freedDate: string
  ): AppointmentEntity | null {
    const freedMinutes = timeToMinutes(freedSlotTime);
    const normFreedDate = timeService.normalizeDateString(freedDate);
    const canonicalClinicId = resolveCanonicalClinicId(freedApt.clinic_id);
    const canonicalDoctorId = resolveCanonicalDoctorId(freedApt.doctor_id);

    const candidates: { apt: AppointmentEntity; minutes: number }[] = [];

    for (const candidate of memoryDb.appointments.values()) {
      // 1. Not the freed appointment itself
      if (candidate.id === freedApt.id) continue;

      // 2. Not the patient who cancelled/no-showed
      if (candidate.patient_id === freedApt.patient_id) continue;

      // 3. Must be active status
      const candStatus = (candidate.status || candidate.appointmentStatus || '').toUpperCase().replace(/[\s_-]+/g, '_');
      const activeStatuses = ['BOOKED', 'WAITING', 'CHECKED_IN', 'CHECKEDIN'];
      if (!activeStatuses.includes(candStatus)) continue;

      // 4. Must be on the same date
      const candDate = candidate.date || candidate.appointmentDate || '';
      if (timeService.normalizeDateString(candDate) !== normFreedDate) continue;

      // 5. Must match clinic (strict clinic isolation)
      if (resolveCanonicalClinicId(candidate.clinic_id) !== canonicalClinicId) continue;

      // 6. Must match doctor
      if (resolveCanonicalDoctorId(candidate.doctor_id) !== canonicalDoctorId) continue;

      // 7. Must be scheduled AFTER the freed slot
      const candTime = candidate.time || candidate.slotStartTime || '';
      const candMinutes = timeToMinutes(candTime);
      if (candMinutes <= freedMinutes) continue;

      // 8. Must not already have an active pending earlier-slot offer
      if (
        candidate.earlier_slot_offered &&
        ['PENDING', 'OFFERED'].includes(candidate.earlier_slot_offered.status)
      ) {
        continue;
      }

      // 9. Procedure / Department compatibility where required
      const freedDept = (freedApt.department || freedApt.doctor_specialization || '').toLowerCase().trim();
      const candDept = (candidate.department || candidate.doctor_specialization || '').toLowerCase().trim();
      if (freedDept && candDept && freedDept !== candDept) {
        continue;
      }
      if (freedApt.procedure_id && candidate.procedure_id && freedApt.procedure_id !== candidate.procedure_id) {
        continue;
      }

      // 10. Respect preferred doctor constraints:
      // If crossing doctors, candidate must match preferred doctor.
      // If staying with same doctor as scheduled appointment, doctor continuity is inherently satisfied.
      if (resolveCanonicalDoctorId(candidate.doctor_id) !== canonicalDoctorId) {
        const patient = memoryDb.patients.get(candidate.patient_id);
        if (patient?.preferred_doctor) {
          const pref = patient.preferred_doctor.toLowerCase().trim();
          const freedDocName = (freedApt.doctor_name || '').toLowerCase().trim();
          if (!freedDocName.includes(pref) && !pref.includes(freedDocName)) {
            continue;
          }
        }
      }

      candidates.push({ apt: candidate, minutes: candMinutes });
    }

    if (candidates.length === 0) return null;

    // Sort chronologically ascending by scheduled appointment time (earliest scheduled after the freed slot)
    candidates.sort((a, b) => a.minutes - b.minutes);

    return candidates[0].apt;
  },

  /**
   * Generates and dispatches an earlier-slot offer to the next eligible patient without moving them automatically.
   */
  async offerReleasedSlotToNextEligiblePatient(
    freedApt: AppointmentEntity,
    freedSlotTime: string,
    freedDate: string
  ): Promise<AppointmentEntity | null> {
    const eligibleCandidate = this.findNextEligiblePatientForEarlierSlot(freedApt, freedSlotTime, freedDate);
    if (!eligibleCandidate) {
      return null;
    }

    const freedMinutes = timeToMinutes(freedSlotTime);
    const candTime = eligibleCandidate.time || eligibleCandidate.slotStartTime || '';
    const candMinutes = timeToMinutes(candTime);
    const diffMinutes = Math.max(0, candMinutes - freedMinutes);
    const timeDiffStr =
      diffMinutes >= 60
        ? `${(diffMinutes / 60).toFixed(1).replace('.0', '')} hours earlier`
        : `${diffMinutes} mins earlier`;
    const estWait = `Save ~${diffMinutes} mins`;

    const offer = {
      appointmentId: eligibleCandidate.id,
      clinicId: eligibleCandidate.clinic_id,
      clinicName: eligibleCandidate.clinic_name || freedApt.clinic_name,
      doctorId: eligibleCandidate.doctor_id,
      doctorName: eligibleCandidate.doctor_name || freedApt.doctor_name,
      originalDate: eligibleCandidate.date || eligibleCandidate.appointmentDate,
      originalTime: candTime,
      newDate: freedDate,
      newTime: freedSlotTime,
      timeDifference: timeDiffStr,
      estimatedWait: estWait,
      offeredAt: timeService.getCurrentClinicDate().toISOString(),
      status: 'PENDING' as const,
    };

    // 1. Persist offer to candidate appointment atomically (without moving patient!)
    eligibleCandidate.earlier_slot_offered = offer;
    await AppointmentModel.update(eligibleCandidate.id, {
      earlier_slot_offered: offer,
    });
    memoryDb.appointments.set(eligibleCandidate.id, eligibleCandidate);
    saveStateToFile();

    // 2. Emit Socket.IO events to Patient
    const socketPayload = {
      appointmentId: eligibleCandidate.id,
      clinicId: offer.clinicId,
      clinicName: offer.clinicName,
      doctorId: offer.doctorId,
      doctorName: offer.doctorName,
      originalDate: offer.originalDate,
      originalTime: offer.originalTime,
      newDate: freedDate,
      newTime: freedSlotTime,
      timeDifference: timeDiffStr,
      estimatedWait: estWait,
      status: 'OFFERED',
    };

    emitToPatient(eligibleCandidate.patient_id, 'slot:earlier_available', socketPayload);
    emitToPatient(eligibleCandidate.patient_id, 'earlier_slot:offered', socketPayload);

    // 3. Send in-app notification using centralized notificationService
    await notificationService.sendNotification({
      patientId: eligibleCandidate.patient_id,
      recipientType: 'PATIENT',
      appointmentId: eligibleCandidate.id,
      clinicId: eligibleCandidate.clinic_id,
      doctorId: eligibleCandidate.doctor_id,
      title: 'Earlier Appointment Slot Available! ⚡',
      message: `An earlier slot at ${freedSlotTime} is open at ${offer.clinicName} with ${offer.doctorName}. Current appointment: ${offer.originalTime}. Tap to accept or keep current slot.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: {
        appointmentId: eligibleCandidate.id,
        clinicName: offer.clinicName,
        doctorName: offer.doctorName,
        currentDate: offer.originalDate,
        currentTime: offer.originalTime,
        offeredDate: freedDate,
        offeredTime: freedSlotTime,
        timeDifference: timeDiffStr,
        status: 'OFFERED',
      },
    });

    return eligibleCandidate;
  },

  /**
   * Handles a Patient No-Show: updates appointment, frees slot, reorders queue, and triggers earlier slot logic.
   * STRICT: No-show is ONLY allowed if appointment date is today (or past) AND slot + grace period (10 min) has passed.
   */
  async handleNoShow(appointmentId: string, options?: { force?: boolean }): Promise<{
    success: boolean;
    appointment?: AppointmentEntity;
    affectedPatient?: AppointmentEntity;
    offeredSlot?: string;
    message: string;
  }> {
    const apt = await AppointmentModel.getById(appointmentId);
    if (!apt) {
      return { success: false, message: 'Appointment not found.' };
    }

    if (apt.status === 'Cancelled' || apt.status === 'CANCELLED') {
      return { success: false, message: 'Cannot mark a cancelled appointment as no-show.' };
    }

    const aptDate = apt.date || apt.appointmentDate || timeService.getTodayDateString();
    const aptTime = apt.time || apt.slotStartTime || '09:00 AM';

    // Must have passed slot + 10 minute grace period (unless reception staff forces no-show)
    const isPassed = options?.force || timeService.hasSlotPassed(aptDate, aptTime, 10);
    if (!isPassed) {
      return {
        success: false,
        message: `Appointment is not eligible for no-show yet. Grace period opens 10 minutes after scheduled slot time (${aptTime}).`,
      };
    }

    const freedSlotTime = apt.time;
    const freedDate = apt.date;
    const nowIso = timeService.getCurrentClinicDate().toISOString();
    apt.status = 'NO_SHOW';
    apt.appointmentStatus = 'NO_SHOW';
    apt.noShowAt = nowIso;
    apt.notes = apt.notes ? `${apt.notes} • Marked No-Show` : 'Marked No-Show by reception';
    apt.updated_at = nowIso;
    await AppointmentModel.update(apt.id, apt);
    memoryDb.appointment_queue.delete(apt.id);

    // Recalculate wait times for all waiting patients under same doctor
    for (const remaining of memoryDb.appointments.values()) {
      if (
        remaining.doctor_id === apt.doctor_id &&
        ['Checked In', 'CHECKED_IN', 'Waiting', 'WAITING', 'Almost Your Turn', 'Next'].includes(remaining.status)
      ) {
        if (remaining.patients_ahead > 0) {
          remaining.patients_ahead = Math.max(0, remaining.patients_ahead - 1);
          remaining.queue_position = Math.max(1, remaining.queue_position - 1);
          const doc = memoryDb.doctors.get(remaining.doctor_id);
          const avgDuration = parseInt(doc?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;
          remaining.estimated_wait = remaining.patients_ahead === 0 ? 'Under 2 min' : `${remaining.patients_ahead * avgDuration} min`;
          memoryDb.appointments.set(remaining.id, remaining);

          emitToPatient(remaining.patient_id, 'queue:updated', {
            appointmentId: remaining.id,
            status: remaining.status,
            patientsAhead: remaining.patients_ahead,
            queuePosition: remaining.queue_position,
            estimatedWait: remaining.estimated_wait,
          });
        }
      }
    }

    // Find eligible candidate for earlier slot offer and dispatch offer & notification
    const eligibleCandidate = await this.offerReleasedSlotToNextEligiblePatient(apt, freedSlotTime, freedDate);

    const noShowPayload = {
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      patientId: apt.patient_id,
      doctorId: apt.doctor_id,
      appointmentDate: apt.date,
      slotStartTime: apt.time,
      appointmentStatus: 'NO_SHOW',
      status: 'NO_SHOW',
    };

    emitToPatient(apt.patient_id, 'appointment:no_show', noShowPayload);
    emitToPatient(apt.patient_id, 'appointment:status', noShowPayload);
    emitToDoctor(apt.doctor_id, 'appointment:no_show', noShowPayload);
    emitToDoctor(apt.doctor_id, 'appointment:status', noShowPayload);
    if (apt.clinic_id) {
      emitToClinic(apt.clinic_id, 'appointment:no_show', noShowPayload);
      emitToClinic(apt.clinic_id, 'appointment:status', noShowPayload);
    }
    emitBroadcast('appointment:no_show', noShowPayload);
    emitBroadcast('appointment:status', noShowPayload);
    emitBroadcast('queue:updated', {
      freedAppointmentId: appointmentId,
      message: 'Queue advanced following no-show record.',
    });

    return {
      success: true,
      appointment: apt,
      affectedPatient: eligibleCandidate || undefined,
      offeredSlot: freedSlotTime,
      message: `Appointment marked as No-Show. Waiting queue updated.`,
    };
  },

  /**
   * Cancels an appointment, cleans up queue state, recalculates wait times,
   * checks for earlier slot eligibility, and emits real-time cancellation events.
   */
  async cancelAppointment(
    appointmentId: string,
    reason: string = 'Patient requested cancellation'
  ): Promise<{ success: boolean; appointment?: AppointmentEntity; error?: string; message?: string }> {
    const apt = await AppointmentModel.getById(appointmentId);
    if (!apt) {
      return { success: false, error: 'Appointment not found.' };
    }

    // Policy check: Cannot cancel if already in consultation or completed
    const normStatus = (apt.status || '').toUpperCase().replace(/[\s_-]+/g, '');
    if (['INCONSULTATION', 'INSESSION'].includes(normStatus)) {
      return { success: false, error: 'Cannot cancel an appointment currently in consultation.' };
    }
    if (['COMPLETED'].includes(normStatus)) {
      return { success: false, error: 'Cannot cancel a completed consultation.' };
    }
    if (['CANCELLED'].includes(normStatus)) {
      return { success: false, error: 'Appointment is already cancelled.' };
    }

    const nowIso = timeService.getCurrentClinicDate().toISOString();
    const freedSlotTime = apt.time || apt.slotStartTime || '09:00 AM';
    const freedDate = apt.date || apt.appointmentDate || timeService.getTodayDateString();

    // 1. Mark appointment as CANCELLED atomically
    apt.status = 'Cancelled';
    apt.appointmentStatus = 'CANCELLED';
    apt.cancelledAt = nowIso;
    apt.cancellationReason = reason;
    apt.updated_at = nowIso;
    apt.queue_position = 0;
    apt.patients_ahead = 0;
    await AppointmentModel.update(apt.id, apt);
    memoryDb.appointments.set(apt.id, apt);
    memoryDb.appointment_queue.delete(apt.id);

    // 2. Recalculate wait times & queue positions for remaining waiting patients under the same doctor
    const canonicalClinicId = resolveCanonicalClinicId(apt.clinic_id);
    const canonicalDoctorId = resolveCanonicalDoctorId(apt.doctor_id);
    const doc = memoryDb.doctors.get(apt.doctor_id);
    const avgDuration = parseInt(doc?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;

    for (const remaining of memoryDb.appointments.values()) {
      const remDate = remaining.date || remaining.appointmentDate || '';
      if (
        resolveCanonicalDoctorId(remaining.doctor_id) === canonicalDoctorId &&
        resolveCanonicalClinicId(remaining.clinic_id) === canonicalClinicId &&
        timeService.normalizeDateString(remDate) === timeService.normalizeDateString(freedDate) &&
        ['Checked In', 'CHECKED_IN', 'Waiting', 'WAITING', 'Almost Your Turn', 'Next'].includes(remaining.status)
      ) {
        if (remaining.patients_ahead > 0) {
          remaining.patients_ahead = Math.max(0, remaining.patients_ahead - 1);
          remaining.queue_position = Math.max(1, remaining.queue_position - 1);
          remaining.estimated_wait = remaining.patients_ahead === 0 ? 'Under 2 min' : `${remaining.patients_ahead * avgDuration} min`;
          memoryDb.appointments.set(remaining.id, remaining);

          emitToPatient(remaining.patient_id, 'queue:updated', {
            appointmentId: remaining.id,
            status: remaining.status,
            patientsAhead: remaining.patients_ahead,
            queuePosition: remaining.queue_position,
            estimatedWait: remaining.estimated_wait,
          });
        }
      }
    }

    // 3. Find eligible candidate for earlier slot offer and dispatch offer & notification
    const eligibleCandidate = await this.offerReleasedSlotToNextEligiblePatient(apt, freedSlotTime, freedDate);

    // 4. Construct comprehensive cancellation event payload
    const tokenNumber =
      (apt.token_number && apt.token_number.trim()) ||
      ((apt as any).tokenNumber && (apt as any).tokenNumber.trim()) ||
      ((apt as any).queueToken && (apt as any).queueToken.trim()) ||
      (apt.queue_number ? `A${String(apt.queue_number).padStart(3, '0')}` : 'A001');

    const cancelPayload = {
      appointmentId: apt.id,
      tokenNumber,
      patientId: apt.patient_id,
      doctorId: apt.doctor_id,
      clinicId: apt.clinic_id,
      status: 'CANCELLED',
      appointmentStatus: 'CANCELLED',
      cancellationReason: reason,
      cancelledAt: nowIso,
      appointmentDate: apt.date,
      slotStartTime: apt.time,
    };

    // 5. Emit to patient, doctor, clinic, and broadcast
    emitToPatient(apt.patient_id, 'appointment:cancelled', cancelPayload);
    emitToPatient(apt.patient_id, 'appointment:status', cancelPayload);
    emitToAppointment(apt.id, 'appointment:cancelled', cancelPayload);

    emitToDoctor(apt.doctor_id, 'appointment:cancelled', cancelPayload);
    emitToDoctor(apt.doctor_id, 'appointment:status', cancelPayload);
    emitToDoctor(canonicalDoctorId, 'appointment:cancelled', cancelPayload);

    if (apt.clinic_id) {
      emitToClinic(apt.clinic_id, 'appointment:cancelled', cancelPayload);
      emitToClinic(apt.clinic_id, 'appointment:status', cancelPayload);
      emitToClinic(canonicalClinicId, 'appointment:cancelled', cancelPayload);
    }

    emitBroadcast('appointment:cancelled', cancelPayload);
    emitBroadcast('appointment:status', cancelPayload);
    emitBroadcast('doctor:availability_updated', {
      doctorId: apt.doctor_id,
      clinicId: apt.clinic_id,
      date: freedDate,
      releasedSlot: freedSlotTime,
      action: 'CANCELLATION',
      appointmentId: apt.id,
    });
    emitBroadcast('queue:updated', {
      freedAppointmentId: apt.id,
      message: 'Queue updated after appointment cancellation.',
    });

    await notificationService.sendNotification({
      patientId: apt.patient_id,
      title: 'Appointment Cancelled ❌',
      message: `Your appointment with ${apt.doctor_name} on ${apt.date} at ${apt.time} has been cancelled. Slot is now released.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id },
    });

    return {
      success: true,
      appointment: apt,
      message: 'Appointment cancelled successfully.',
    };
  },

  /**
   * Reassigns an appointment to another doctor in the same clinic and department,
   * verifying slot availability and propagating socket events.
   */
  async switchDoctor(
    appointmentId: string,
    newDoctorId: string,
    reason?: string
  ): Promise<{ success: boolean; appointment?: AppointmentEntity; message: string }> {
    const apt = await AppointmentModel.getById(appointmentId);
    if (!apt) {
      return { success: false, message: 'Appointment not found.' };
    }

    if (['COMPLETED', 'Completed', 'CANCELLED', 'Cancelled', 'NO_SHOW', 'No Show'].includes(apt.status)) {
      return { success: false, message: `Cannot switch doctor for appointment with status ${apt.status}.` };
    }

    const newDoc = await DoctorModel.getById(newDoctorId);
    if (!newDoc) {
      return { success: false, message: 'Target doctor not found in registry.' };
    }

    // 1. Validate same clinic
    const isSameClinic =
      newDoc.clinic_id === apt.clinic_id ||
      newDoc.clinic_name.toLowerCase() === apt.clinic_name.toLowerCase() ||
      (apt.clinic_id === 'c-demo-moon-01' && (newDoc.clinic_id === 'c-demo' || newDoc.clinic_id === 'c5')) ||
      (apt.clinic_id === 'c-demo-apollo-02' && newDoc.clinic_id === 'c1');
    if (!isSameClinic) {
      return {
        success: false,
        message: `Doctor reassignment is only permitted within the same facility (${apt.clinic_name}).`,
      };
    }

    // 2. Validate same department / specialization compatibility
    const aptDept = (apt.department || apt.doctor_specialization || '').toLowerCase();
    const docSpec = (newDoc.specialization || '').toLowerCase();
    if (!docSpec.includes(aptDept) && !aptDept.includes(docSpec)) {
      return {
        success: false,
        message: `Doctor reassignment must match the clinical department (${apt.department}).`,
      };
    }

    // 3. Validate doctor availability
    if (newDoc.status === 'OFFLINE' || newDoc.is_available_today === false) {
      return {
        success: false,
        message: `${newDoc.name} is currently offline or unavailable.`,
      };
    }

    // 4. Verify slot collision for target doctor
    const aptDate = apt.date || apt.appointmentDate || timeService.getTodayDateString();
    const aptTime = apt.time || apt.slotStartTime || '09:00 AM';
    const normDate = timeService.normalizeDateString(aptDate);
    const normTime = timeService.normalizeTimeString(aptTime);

    for (const existing of memoryDb.appointments.values()) {
      if (
        existing.id !== appointmentId &&
        existing.doctor_id === newDoc.id &&
        timeService.normalizeDateString(existing.date || existing.appointmentDate) === normDate &&
        timeService.normalizeTimeString(existing.time || existing.slotStartTime) === normTime &&
        !['Cancelled', 'CANCELLED', 'Completed', 'COMPLETED', 'NO_SHOW', 'No Show'].includes(existing.status)
      ) {
        return {
          success: false,
          message: `${newDoc.name} already has an appointment booked at ${aptTime} on ${aptDate}.`,
        };
      }
    }

    const oldDoctorId = apt.doctor_id;
    const oldDoctorName = apt.doctor_name;

    apt.doctor_id = newDoc.id;
    apt.doctor_name = newDoc.name;
    apt.doctor_specialization = newDoc.specialization;
    apt.doctor_avatar = newDoc.avatar;
    apt.doctorId = newDoc.id;
    apt.doctorName = newDoc.name;
    apt.notes = apt.notes
      ? `${apt.notes} • Doctor switched from ${oldDoctorName} to ${newDoc.name} (${reason || 'Clinic schedule adjustment'})`
      : `Doctor switched from ${oldDoctorName} to ${newDoc.name}`;
    apt.updated_at = timeService.getCurrentClinicDate().toISOString();

    await AppointmentModel.update(apt.id, apt);

    const switchPayload = {
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      patientId: apt.patient_id,
      oldDoctorId,
      oldDoctorName,
      newDoctorId: newDoc.id,
      newDoctorName: newDoc.name,
      doctorId: newDoc.id,
      doctorName: newDoc.name,
      appointmentDate: apt.date,
      slotStartTime: apt.time,
      appointmentStatus: apt.status,
    };

    emitToPatient(apt.patient_id, 'appointment:updated', switchPayload);
    emitToDoctor(oldDoctorId, 'appointment:updated', switchPayload);
    emitToDoctor(newDoc.id, 'appointment:updated', switchPayload);
    if (apt.clinic_id) {
      emitToClinic(apt.clinic_id, 'appointment:updated', switchPayload);
    }
    emitBroadcast('appointment:updated', switchPayload);
    emitBroadcast('queue:updated', switchPayload);

    await notificationService.sendNotification({
      patientId: apt.patient_id,
      title: 'Doctor Reassigned 🩺',
      message: `Your appointment on ${apt.date} at ${apt.time} has been reassigned to ${newDoc.name} (${newDoc.specialization}).`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id },
    });

    return {
      success: true,
      appointment: apt,
      message: `Appointment successfully reassigned to ${newDoc.name}.`,
    };
  },

  /**
   * Advances the queue when a patient is called into consultation.
   */
  async callNextPatient(
    doctorId?: string,
    clinicId?: string
  ): Promise<{ success: boolean; calledItem?: UnifiedQueueItem; message: string }> {
    const queue = this.getQueue(clinicId, doctorId);
    const nextWaiting = queue.find((q) => q.status === 'WAITING');

    if (!nextWaiting) {
      return { success: false, message: 'There are no waiting patients in the queue.' };
    }

    if (nextWaiting.appointmentId) {
      const apt = await AppointmentModel.getById(nextWaiting.appointmentId);
      if (apt) {
        apt.status = 'In Consultation';
        apt.patients_ahead = 0;
        apt.estimated_wait = 'In Consultation';
        apt.updated_at = new Date().toISOString();
        await AppointmentModel.update(apt.id, apt);

        // Update Doctor status to BUSY
        await DoctorModel.update(apt.doctor_id, { status: 'BUSY' });

        emitToPatient(apt.patient_id, 'appointment:status', {
          appointmentId: apt.id,
          status: 'In Consultation',
        });

        emitToDoctor(apt.doctor_id, 'consultation:started', {
          appointmentId: apt.id,
          patientName: apt.patient_name,
        });
      }
    } else if (nextWaiting.walkInId) {
      await WalkInModel.updateStatus(nextWaiting.walkInId, 'IN_CONSULTATION');
      if (nextWaiting.doctorId) {
        await DoctorModel.update(nextWaiting.doctorId, { status: 'BUSY' });
        emitToDoctor(nextWaiting.doctorId, 'consultation:started', {
          appointmentId: nextWaiting.walkInId,
          patientName: nextWaiting.patientName,
        });
      }
    }

    nextWaiting.status = 'IN_CONSULTATION';

    const callPayload = {
      calledPatient: nextWaiting.patientName,
      tokenNumber: nextWaiting.queueNumber,
      status: 'IN_CONSULTATION',
      clinicId: nextWaiting.clinicId,
      doctorId: nextWaiting.doctorId,
    };

    if (nextWaiting.clinicId) {
      emitToClinic(resolveCanonicalClinicId(nextWaiting.clinicId), 'queue:updated', callPayload);
    }
    if (nextWaiting.doctorId) {
      emitToDoctor(nextWaiting.doctorId, 'queue:updated', callPayload);
      emitBroadcast('doctor:availability_updated', { doctorId: nextWaiting.doctorId, status: 'BUSY' });
      emitBroadcast('doctor:availability_changed', { doctorId: nextWaiting.doctorId, status: 'BUSY' });
    }
    emitBroadcast('queue:updated', callPayload);

    return {
      success: true,
      calledItem: nextWaiting,
      message: `Called ${nextWaiting.patientName} (${nextWaiting.queueNumber}) into consultation.`,
    };
  },

  /**
   * Advances the queue for a doctor when a patient is called or completed.
   */
  async advanceQueue(appointmentId: string): Promise<AppointmentEntity | null> {
    const targetApt = await AppointmentModel.getById(appointmentId);
    if (!targetApt) return null;

    let newStatus = targetApt.status;
    let newAhead = targetApt.patients_ahead;

    if (targetApt.patients_ahead > 1) {
      newAhead = targetApt.patients_ahead - 1;
      newStatus = 'Almost Your Turn';
    } else if (targetApt.patients_ahead === 1) {
      newAhead = 0;
      newStatus = 'Next';
    } else if (targetApt.status === 'Next') {
      newAhead = 0;
      newStatus = 'In Consultation';
    }

    const estimatedWait = newAhead === 0 ? 'Under 2 min' : `${newAhead * 20} min`;

    const updated = await AppointmentModel.update(appointmentId, {
      status: newStatus,
      patients_ahead: newAhead,
      estimated_wait: estimatedWait,
    });

    if (updated) {
      emitToPatient(updated.patient_id, 'queue:updated', {
        appointmentId: updated.id,
        status: updated.status,
        patientsAhead: updated.patients_ahead,
        queuePosition: updated.queue_position,
        estimatedWait: updated.estimated_wait,
      });

      emitToAppointment(updated.id, 'queue:updated', {
        appointmentId: updated.id,
        status: updated.status,
        patientsAhead: updated.patients_ahead,
        queuePosition: updated.queue_position,
        estimatedWait: updated.estimated_wait,
      });

      if (newStatus === 'Next') {
        await notificationService.sendNotification({
          patientId: updated.patient_id,
          title: "You're Next in Line! 🔔",
          message: `Please proceed to consultation room. ${updated.doctor_name} is ready for Token ${updated.token_number}.`,
          category: 'Queue Updates',
          type: 'reminder',
          actionData: { appointmentId: updated.id },
        });
      }
    }

    return updated;
  },

  /**
   * Reports a doctor delay, updates estimated times and notifies all waiting patients.
   * CRITICAL: Only updates TODAY'S appointments for this doctor; future appointments are unaffected.
   */
  async reportDoctorDelay(doctorId: string, delayMinutes: number): Promise<void> {
    const todayStr = timeService.getTodayDateString();

    for (const apt of memoryDb.appointments.values()) {
      const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);
      if (aptDate !== todayStr) {
        continue;
      }

      if (apt.doctor_id === doctorId && ['Checked In', 'CHECKED_IN', 'Waiting', 'WAITING', 'Almost Your Turn', 'Next', 'Confirmed', 'Booked', 'BOOKED'].includes(apt.status)) {
        const currentWait = parseInt(apt.estimated_wait?.replace(/[^0-9]/g, '') || '10', 10) || 10;
        const newWait = currentWait + delayMinutes;

        apt.status = 'Delayed';
        apt.estimated_wait = `${newWait} min (Delayed by ~${delayMinutes}m)`;
        apt.updated_at = timeService.getCurrentClinicDate().toISOString();

        emitToPatient(apt.patient_id, 'doctor:delayed', {
          appointmentId: apt.id,
          status: 'Delayed',
          delayMinutes,
          newEstimatedWait: apt.estimated_wait,
        });

        emitToAppointment(apt.id, 'doctor:delayed', {
          appointmentId: apt.id,
          status: 'Delayed',
          delayMinutes,
          newEstimatedWait: apt.estimated_wait,
        });

        await notificationService.sendNotification({
          patientId: apt.patient_id,
          title: 'Appointment Delay Advisory ⏱️',
          message: `${apt.doctor_name} has been delayed by approximately ${delayMinutes} minutes due to an emergency procedure. Your new estimated wait is ${newWait} minutes.`,
          category: 'Queue Updates',
          type: 'reminder',
          actionData: { appointmentId: apt.id },
        });
      }
    }

    emitBroadcast('doctor:delay_updated', {
      doctorId,
      delayMinutes,
      effectiveDate: todayStr,
    });
  },
};
