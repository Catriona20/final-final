import { Router, Request, Response } from 'express';
import {
  DoctorModel,
  AppointmentModel,
  PatientModel,
  MedicalFileModel,
  PrescriptionModel,
  ProcedureModel,
  DoctorProcedureModel,
  DoctorVerificationModel,
  ConsultationModel,
  AuditLogModel,
  DoctorScheduleModel,
  DoctorAvailabilityModel,
  WalkInModel,
  ClinicModel,
  DoctorClinicAssignmentModel,
  resolveCanonicalClinicId,
  resolveCanonicalDoctorId,
  AvailabilityRequestModel,
} from '../database/models';
import { authNotificationService } from '../services/authNotificationService';
import { memoryDb } from '../database/db';
import { authenticateDoctorJwt, AuthenticatedDoctorRequest } from '../middleware/authMiddleware';
import { queueManager } from '../services/queueManager';
import { notificationService } from '../services/notificationService';
import { emitToPatient, emitToDoctor, emitToAppointment, emitToClinic, emitBroadcast } from '../services/socketService';
import { timeService } from '../services/timeService';
import { doctorAvailabilityService } from '../services/doctorAvailabilityService';

export const doctorRouter = Router();

export function formatDoctorResponse(doc: any) {
  if (!doc) return null;
  const { password_hash, ...safeDoc } = doc;
  const isVerified = doc.is_verified || doc.verification_status === 'VERIFIED';
  return {
    ...safeDoc,
    // camelCase aliases
    clinicId: doc.clinic_id || doc.clinicId,
    clinicName: doc.clinic_name || doc.clinicName,
    isVerified,
    verificationStatus: doc.verification_status || (isVerified ? 'VERIFIED' : 'PENDING'),
    consultationFee: doc.consultation_fee || doc.consultationFee || '₹400',
    consultationDuration: doc.consultation_duration || doc.consultationDuration || '20 minutes',
    experienceYears: doc.experience_years ?? doc.experienceYears ?? 5,
    reviewsCount: doc.reviews_count ?? doc.reviewsCount ?? 0,
    availableDays: doc.available_days || doc.availableDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    isAvailableToday: doc.is_available_today ?? doc.isAvailableToday ?? true,
    registrationNumber: doc.registration_number || doc.registrationNumber,
    registrationAuthority: doc.registration_authority || doc.registrationAuthority,
    clinicAffiliations: doc.clinic_affiliations || doc.clinicAffiliations || [],
    procedures: doc.procedures || [],
    // snake_case aliases guaranteed
    clinic_id: doc.clinic_id || doc.clinicId,
    clinic_name: doc.clinic_name || doc.clinicName,
    is_verified: isVerified,
    verification_status: doc.verification_status || (isVerified ? 'VERIFIED' : 'PENDING'),
    consultation_fee: doc.consultation_fee || doc.consultationFee || '₹400',
    consultation_duration: doc.consultation_duration || doc.consultationDuration || '20 minutes',
  };
}

// ============================================================
// 1. PUBLIC & DISCOVERY ENDPOINTS
// ============================================================

// GET /api/doctors/continuity
doctorRouter.get('/continuity', async (req: Request, res: Response): Promise<void> => {
  try {
    const department = (req.query.department as string) || '';
    const clinicId = (req.query.clinicId as string) || '';
    const patientId = (req.query.patientId as string) || 'pat-demo-01';

    const pastAppointments = await AppointmentModel.getByPatientId(patientId);
    const pastCompleted = pastAppointments.find(
      (a) =>
        a.status === 'Completed' &&
        (!clinicId || a.clinic_id === clinicId || a.clinic_name.toLowerCase() === clinicId.toLowerCase()) &&
        (!department ||
          a.department.toLowerCase().includes(department.toLowerCase()) ||
          a.doctor_specialization.toLowerCase().includes(department.toLowerCase()))
    );

    if (pastCompleted) {
      const doc = await DoctorModel.getById(pastCompleted.doctor_id);
      if (
        doc &&
        (!clinicId ||
          doc.clinic_id === clinicId ||
          doc.clinic_name.toLowerCase() === clinicId.toLowerCase() ||
          doc.clinic_affiliations?.some((aff: string) => aff.toLowerCase() === clinicId.toLowerCase() || aff === clinicId))
      ) {
        res.status(200).json({
          success: true,
          previousDoctor: {
            ...formatDoctorResponse(doc),
            previousVisitsCount: 1,
            lastVisitedDate: pastCompleted.date,
          },
        });
        return;
      }
    }

    const allDocs = await DoctorModel.getAll();
    const match = allDocs.find(
      (d) =>
        (!clinicId ||
          d.clinic_id === clinicId ||
          d.clinic_name.toLowerCase() === clinicId.toLowerCase() ||
          d.clinic_affiliations?.some((aff: string) => aff.toLowerCase() === clinicId.toLowerCase() || aff === clinicId)) &&
        department &&
        (d.specialization.toLowerCase().includes(department.toLowerCase()) ||
          department.toLowerCase().includes(d.specialization.toLowerCase()))
    );

    res.status(200).json({
      success: true,
      previousDoctor: match
        ? { ...formatDoctorResponse(match), previousVisitsCount: 1, lastVisitedDate: 'Aug 10, 2026' }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor continuity.' });
  }
});

// GET /api/doctors/procedures/catalog (Predefined structured procedures catalog)
doctorRouter.get('/procedures/catalog', async (req: Request, res: Response): Promise<void> => {
  try {
    const department = req.query.department as string;
    let catalog = await ProcedureModel.getAll();
    if (department) {
      catalog = catalog.filter((p) => p.department.toLowerCase().includes(department.toLowerCase()));
    }
    res.status(200).json({ success: true, procedures: catalog });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch procedures catalog.' });
  }
});

// GET /api/doctors
doctorRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicId = req.query.clinicId as string;
    const department = (req.query.department || req.query.specialty || req.query.specialization) as string;
    const procedure = (req.query.procedure as string || '').toLowerCase();
    const query = (req.query.query as string || '').toLowerCase();

    let doctors = await DoctorModel.getAll();

    if (clinicId) {
      const clean = clinicId.toLowerCase().trim();
      const canonicalClinic = resolveCanonicalClinicId(clinicId);
      const assigned = await DoctorClinicAssignmentModel.getByClinicId(canonicalClinic);
      const assignedDocIds = new Set(assigned.map((a) => a.doctor_id));
      doctors = doctors.filter(
        (d) =>
          d.clinic_id === clinicId ||
          d.clinic_id === canonicalClinic ||
          d.clinic_name.toLowerCase() === clean ||
          d.clinic_affiliations?.some((a) => a.toLowerCase() === clean || a === clinicId || a === canonicalClinic) ||
          assignedDocIds.has(d.id)
      );
    }

    if (department) {
      doctors = doctors.filter(
        (d) =>
          d.specialization.toLowerCase().includes(department.toLowerCase()) ||
          department.toLowerCase().includes(d.specialization.toLowerCase())
      );
    }

    if (procedure) {
      doctors = doctors.filter((d) =>
        d.procedures?.some((p) => p.toLowerCase().includes(procedure) || procedure.includes(p.toLowerCase()))
      );
    }

    if (query) {
      doctors = doctors.filter(
        (d) =>
          d.name.toLowerCase().includes(query) ||
          d.specialization.toLowerCase().includes(query) ||
          d.qualification.toLowerCase().includes(query) ||
          d.procedures?.some((p) => p.toLowerCase().includes(query))
      );
    }

    // Prioritize verified doctors
    doctors.sort((a, b) => {
      const aVerified = a.is_verified || a.verification_status === 'VERIFIED' ? 1 : 0;
      const bVerified = b.is_verified || b.verification_status === 'VERIFIED' ? 1 : 0;
      if (aVerified !== bVerified) return bVerified - aVerified;
      return (b.rating || 0) - (a.rating || 0);
    });

    const todayStr = timeService.getTodayDateString();
    const canonicalClinic = clinicId ? resolveCanonicalClinicId(clinicId) : null;
    const targetDate = req.query.date ? timeService.normalizeDateString(req.query.date as string) : null;

    const formattedDocs = await Promise.all(
      doctors.map(async (doc) => {
        const formatted = formatDoctorResponse(doc);
        const canonicalDoc = resolveCanonicalDoctorId(doc.id);
        const effectiveClinic = canonicalClinic || (doc.clinic_id ? resolveCanonicalClinicId(doc.clinic_id) : undefined);

        // Fetch live queue for this doctor & clinic
        const queueForDoc = queueManager.getQueue(effectiveClinic, doc.id, todayStr);
        const activeQueueEntry = queueForDoc.find(
          (q) => ['IN_CONSULTATION', 'In Consultation'].includes(q.status)
        );
        const waitingQueueEntries = queueForDoc.filter(
          (q) => !['IN_CONSULTATION', 'In Consultation', 'Completed', 'COMPLETED', 'Cancelled', 'CANCELLED', 'NO_SHOW', 'No Show'].includes(q.status)
        );

        const isConsultingNow = !!activeQueueEntry;
        const currentPatientName = activeQueueEntry ? activeQueueEntry.patientName : undefined;
        const waitingCount = waitingQueueEntries.length;

        // Count today's booked/scheduled appointments for this doctor at this clinic
        let todayAppointmentsCount = 0;
        for (const apt of memoryDb.appointments.values()) {
          const aptDocId = apt.doctor_id || apt.doctorId;
          const aptCanonicalDoc = aptDocId ? resolveCanonicalDoctorId(aptDocId) : '';
          const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);
          if ((aptDocId === doc.id || aptCanonicalDoc === canonicalDoc) && aptDate === todayStr) {
            if (effectiveClinic) {
              const aptCId = resolveCanonicalClinicId(apt.clinic_id);
              if (aptCId !== effectiveClinic) continue;
            }
            if (!['Cancelled', 'CANCELLED', 'No Show', 'NO_SHOW', 'No-Show'].includes(apt.status)) {
              todayAppointmentsCount++;
            }
          }
        }

        // Add today's walk-ins for this doctor
        for (const w of memoryDb.walk_ins.values()) {
          const wDocId = w.doctor_id || w.preferred_doctor;
          const wCanonicalDoc = wDocId ? resolveCanonicalDoctorId(wDocId) : '';
          if (wDocId === doc.id || wCanonicalDoc === canonicalDoc) {
            if (effectiveClinic) {
              const wCId = resolveCanonicalClinicId(w.clinic_id);
              if (wCId !== effectiveClinic) continue;
            }
            if (w.status !== 'CANCELLED') {
              todayAppointmentsCount++;
            }
          }
        }

        const clinicSpecificStatus = canonicalClinic
          ? await DoctorClinicAssignmentModel.getStatus(doc.id, canonicalClinic)
          : null;
        const liveStatus = clinicSpecificStatus || doc.status || 'AVAILABLE';

        const requests = await AvailabilityRequestModel.getRequests({
          doctorId: doc.id,
          clinicId: canonicalClinic || resolveCanonicalClinicId(doc.clinic_id),
        });

        const checkDate = targetDate
          ? timeService.normalizeDateString(targetDate)
          : todayStr;
        const isToday = checkDate === todayStr;

        const approvedRequestsForDate = requests.filter(
          (r) =>
            r.status === 'APPROVED' &&
            timeService.normalizeDateString(r.date || r.requested_date) === checkDate
        );
        const hasApprovedSchedule = approvedRequestsForDate.length > 0;

        let isInsideSchedule = false;
        if (isToday) {
          const currentClinicDate = timeService.getCurrentClinicDate();
          const currentTotalMins = currentClinicDate.getHours() * 60 + currentClinicDate.getMinutes();

          if (hasApprovedSchedule) {
            isInsideSchedule = approvedRequestsForDate.some((r) => {
              const startMins = parseTimeToMinutes(r.start_time);
              const endMins = parseTimeToMinutes(r.end_time);
              return currentTotalMins >= startMins && currentTotalMins <= endMins;
            });
          }
        }

        let finalStatus: 'AVAILABLE' | 'BUSY' | 'OFFLINE' = 'OFFLINE';
        let isAvailableToday = false;

        // Determine final status from approved schedule + live status.
        // NOTE: isInsideSchedule (current time within schedule window) is kept
        // as informational metadata ONLY. It must NOT gate finalStatus because
        // a doctor with an approved schedule later today (e.g. 10 PM–11 PM) and
        // live status AVAILABLE should appear AVAILABLE so patients can book now.
        if (!hasApprovedSchedule) {
          // No approved schedule for this date → not bookable
          finalStatus = 'OFFLINE';
          isAvailableToday = false;
        } else if (liveStatus === 'OFFLINE') {
          // Clinic-specific or global live status says OFFLINE
          finalStatus = 'OFFLINE';
          isAvailableToday = false;
        } else if (liveStatus === 'BUSY' || isConsultingNow) {
          // Doctor is busy / currently in consultation
          finalStatus = 'BUSY';
          isAvailableToday = false;
        } else if (liveStatus === 'AVAILABLE') {
          // Approved schedule exists and doctor is live-available
          finalStatus = 'AVAILABLE';
          isAvailableToday = true;
        } else {
          finalStatus = 'OFFLINE';
          isAvailableToday = false;
        }

        return {
          ...formatted,
          status: finalStatus,
          liveStatus,
          live_status: liveStatus,
          availabilityStatus: hasApprovedSchedule ? 'APPROVED' : 'NONE',
          availability_status: hasApprovedSchedule ? 'APPROVED' : 'NONE',
          hasApprovedSchedule,
          isInsideSchedule,
          isAvailableToday,
          is_available_today: isAvailableToday,
          todayPatients: todayAppointmentsCount,
          todayAppointmentsCount,
          currentPatients: isConsultingNow ? 1 : 0,
          currentPatientName,
          waitingCount,
        };
      })
    );

    res.status(200).json({ success: true, doctors: formattedDocs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctors.' });
  }
});

// GET /api/doctors/search
doctorRouter.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const procedure = (req.query.procedure as string || '').toLowerCase();
    const query = (req.query.query as string || '').toLowerCase();
    const specialization = (req.query.specialization as string || '').toLowerCase();

    let doctors = await DoctorModel.getVerifiedDoctors();
    if (procedure) {
      doctors = doctors.filter((d) =>
        d.procedures?.some((p) => p.toLowerCase().includes(procedure) || procedure.includes(p.toLowerCase()))
      );
    }
    if (specialization) {
      doctors = doctors.filter((d) =>
        d.specialization.toLowerCase().includes(specialization) || specialization.includes(d.specialization.toLowerCase())
      );
    }
    if (query) {
      doctors = doctors.filter(
        (d) =>
          d.name.toLowerCase().includes(query) ||
          d.specialization.toLowerCase().includes(query) ||
          d.procedures?.some((p) => p.toLowerCase().includes(query))
      );
    }

    // Prioritize verified doctors offering the procedure
    doctors.sort((a, b) => {
      const aVerified = a.is_verified || a.verification_status === 'VERIFIED' ? 1 : 0;
      const bVerified = b.is_verified || b.verification_status === 'VERIFIED' ? 1 : 0;
      if (aVerified !== bVerified) return bVerified - aVerified;
      return (b.rating || 0) - (a.rating || 0);
    });

    res.status(200).json({ success: true, count: doctors.length, doctors: doctors.map(formatDoctorResponse) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to search verified doctors.' });
  }
});

function parseTimeToMinutes(timeStr: string): number {
  const clean = (timeStr || '').trim();
  const isPM = clean.toUpperCase().includes('PM');
  const isAM = clean.toUpperCase().includes('AM');
  const parts = clean.replace(/[^\d:]/g, '').split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function formatMinutesToTime(minutes: number): string {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const displayHour = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  return `${String(displayHour).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
}

// GET /api/doctors/:id/slots
doctorRouter.get('/:id/slots', async (req: Request, res: Response): Promise<void> => {
  try {
    const doctor = await DoctorModel.getById(req.params.id);
    if (!doctor) {
      res.status(404).json({ success: false, error: 'Doctor not found.' });
      return;
    }

    const date = (req.query.date as string) || timeService.getTodayDateString();
    const clinicId = (req.query.clinicId as string) || (req.query.clinic_id as string);
    const result = await doctorAvailabilityService.generateDoctorSlots(doctor.id, date, clinicId);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor time slots.' });
  }
});

// GET /api/doctors/:id/availability
doctorRouter.get('/:id/availability', async (req: Request, res: Response): Promise<void> => {
  try {
    const doctor = await DoctorModel.getById(req.params.id);
    if (!doctor) {
      res.status(404).json({ success: false, error: 'Doctor not found.' });
      return;
    }

    const { DoctorClinicAssignmentModel, AvailabilityRequestModel } = await import('../database/models');
    const assignments = await DoctorClinicAssignmentModel.getByDoctorId(doctor.id);
    const requests = await AvailabilityRequestModel.getRequests({ doctorId: doctor.id });

    res.status(200).json({
      success: true,
      doctorId: doctor.id,
      doctorName: doctor.name,
      assignments,
      availabilityRequests: requests,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor availability.' });
  }
});

// GET /api/doctors/:id/schedule
doctorRouter.get('/:id/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const doctor = await DoctorModel.getById(req.params.id);
    if (!doctor) {
      res.status(404).json({ success: false, error: 'Doctor not found.' });
      return;
    }

    const date = (req.query.date as string) || timeService.getTodayDateString();
    const clinicId = (req.query.clinicId as string) || (req.query.clinic_id as string);
    const result = await doctorAvailabilityService.generateDoctorSlots(doctor.id, date, clinicId);

    res.status(200).json({
      success: true,
      doctorId: doctor.id,
      doctorName: doctor.name,
      clinicId: clinicId || doctor.clinic_id,
      date,
      schedule: result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor schedule.' });
  }
});

// GET /api/doctors/verification/pending (Admin/Reviewer pending verifications)
doctorRouter.get('/verification/pending', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pendingDoctors = await DoctorVerificationModel.getPendingVerifications();
    const safeDoctors = pendingDoctors.map(({ password_hash, ...d }) => d);
    res.status(200).json({
      success: true,
      count: safeDoctors.length,
      doctors: safeDoctors,
      pendingDoctors: safeDoctors,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch pending doctor verifications.' });
  }
});

// POST & PUT /api/doctors/:id/verify (Admin/Reviewer verify or reject doctor)
const handleDoctorVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status = 'VERIFIED', verifierId = 'admin-reviewer', rejectionReason } = req.body || {};
    const updated = await DoctorVerificationModel.updateVerificationStatus(
      req.params.id,
      status,
      verifierId,
      rejectionReason
    );

    if (!updated) {
      res.status(404).json({ success: false, error: 'Doctor not found.' });
      return;
    }

    await AuditLogModel.log(
      status === 'VERIFIED' ? 'DOCTOR_VERIFIED' : 'DOCTOR_REJECTED',
      'DOCTOR',
      updated.id,
      `Doctor ${updated.name} verification updated to ${status} by ${verifierId}${rejectionReason ? ': ' + rejectionReason : ''}`,
      { id: updated.id, name: updated.name }
    );

    const { password_hash, ...safeDoctor } = updated;

    // Trigger auth-only email and SMS notifications (independent, non-blocking)
    if (status === 'VERIFIED' || status === 'ACTIVE') {
      if (updated.email) {
        authNotificationService.sendDoctorApprovalEmail(updated.email, updated.name).catch((err) =>
          console.warn('Doctor approval email error:', err.message)
        );
      }
      if (updated.phone) {
        authNotificationService.sendDoctorApprovalSms(updated.phone, updated.name).catch((err) =>
          console.warn('Doctor approval SMS error:', err.message)
        );
      }
    } else if (status === 'REJECTED') {
      if (updated.email) {
        authNotificationService.sendDoctorRejectionEmail(updated.email, updated.name, rejectionReason).catch((err) =>
          console.warn('Doctor rejection email error:', err.message)
        );
      }
      if (updated.phone) {
        authNotificationService.sendDoctorRejectionSms(updated.phone, updated.name, rejectionReason).catch((err) =>
          console.warn('Doctor rejection SMS error:', err.message)
        );
      }
    }

    // Real-time broadcast
    emitBroadcast('doctor:verified', safeDoctor);
    emitBroadcast('doctor:availability_changed', safeDoctor);

    res.status(200).json({
      success: true,
      doctor: safeDoctor,
      message: `Doctor ${updated.name} verification status set to ${status}.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update doctor verification.' });
  }
};
doctorRouter.post('/:id/verify', handleDoctorVerification);
doctorRouter.put('/:id/verification', handleDoctorVerification);

// PATCH & PUT /api/doctors/:id/status (Update doctor availability)
const handleDoctorStatusUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status: inputStatus, clinicId: inputClinicId, clinic_id, wait_time } = req.body || {};
    const rawStatus = (inputStatus || '').toString().toUpperCase().trim().replace(/[\s-]+/g, '_');

    let normalizedStatus: 'AVAILABLE' | 'BUSY' | 'OFFLINE' = 'AVAILABLE';
    if (['OFFLINE', 'UNAVAILABLE', 'OFF_DUTY'].includes(rawStatus)) {
      normalizedStatus = 'OFFLINE';
    } else if (rawStatus === 'BUSY') {
      normalizedStatus = 'BUSY';
    } else {
      normalizedStatus = 'AVAILABLE';
    }

    const doctorId = req.params.id;
    const canonicalDocId = resolveCanonicalDoctorId(doctorId);
    const doctor = (await DoctorModel.getById(doctorId)) || (await DoctorModel.getById(canonicalDocId));

    if (!doctor) {
      res.status(404).json({ success: false, error: 'Doctor not found.' });
      return;
    }

    const targetClinicRaw =
      inputClinicId ||
      clinic_id ||
      (req.query.clinicId as string) ||
      (req.query.clinic_id as string) ||
      doctor.clinic_id;
    const canonicalClinicId = targetClinicRaw
      ? resolveCanonicalClinicId(targetClinicRaw)
      : resolveCanonicalClinicId(doctor.clinic_id);

    // Persist clinic-specific live status
    await DoctorClinicAssignmentModel.setStatus(doctor.id, canonicalClinicId, normalizedStatus);

    // If primary clinic, also update DoctorModel baseline
    const isPrimaryClinic = canonicalClinicId === resolveCanonicalClinicId(doctor.clinic_id);
    if (isPrimaryClinic) {
      await DoctorModel.update(doctor.id, {
        status: normalizedStatus,
        is_available_today: normalizedStatus !== 'OFFLINE',
        wait_time: wait_time || undefined,
      });
    }

    const updatedAt = new Date().toISOString();
    const payload = {
      doctorId: doctor.id,
      clinicId: canonicalClinicId,
      status: normalizedStatus,
      updatedAt,
    };

    // Emit scoped socket events
    emitToClinic(canonicalClinicId, 'doctor:status_updated', payload);
    if (targetClinicRaw && targetClinicRaw !== canonicalClinicId) {
      emitToClinic(targetClinicRaw, 'doctor:status_updated', payload);
    }
    emitToDoctor(doctor.id, 'doctor:status_updated', payload);
    if (canonicalDocId !== doctor.id) {
      emitToDoctor(canonicalDocId, 'doctor:status_updated', payload);
    }

    // Broadcast across all clients (Patient App, Clinic Assistant, Doctor App)
    emitBroadcast('doctor:status_updated', payload);
    emitBroadcast('doctor:availability_updated', {
      ...payload,
      isAvailableToday: normalizedStatus !== 'OFFLINE',
    });
    emitBroadcast('doctor:availability_changed', {
      ...payload,
      isAvailableToday: normalizedStatus !== 'OFFLINE',
    });

    const { password_hash, ...safeDoctor } = doctor;
    res.status(200).json({
      success: true,
      doctorId: doctor.id,
      clinicId: canonicalClinicId,
      status: normalizedStatus,
      updatedAt,
      doctor: {
        ...safeDoctor,
        status: normalizedStatus,
        is_available_today: normalizedStatus !== 'OFFLINE',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update doctor status.' });
  }
};
doctorRouter.patch('/:id/status', handleDoctorStatusUpdate);
doctorRouter.put('/:id/status', handleDoctorStatusUpdate);

// POST /api/doctors/:id/procedures (Add procedure)
doctorRouter.post('/:id/procedures', async (req: Request, res: Response): Promise<void> => {
  try {
    const { procedureName, procedureId } = req.body || {};
    if (!procedureName) {
      res.status(400).json({ success: false, error: 'Procedure name is required.' });
      return;
    }

    const newProc = await DoctorProcedureModel.addProcedure(req.params.id, procedureName, procedureId);
    res.status(201).json({ success: true, procedure: newProc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to add doctor procedure.' });
  }
});

// DELETE /api/doctors/:id/procedures/:procedureName (Remove procedure)
doctorRouter.delete('/:id/procedures/:procedureName', async (req: Request, res: Response): Promise<void> => {
  try {
    await DoctorProcedureModel.removeProcedure(req.params.id, decodeURIComponent(req.params.procedureName));
    res.status(200).json({ success: true, message: 'Procedure removed successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to remove doctor procedure.' });
  }
});

// (GET /api/doctors/:id is registered at the bottom of the router to avoid shadowing /auth/* routes)

// ============================================================
// 2. AUTHENTICATED DOCTOR MOBILE APP ENDPOINTS
// ============================================================

// GET /api/doctors/auth/me (Authenticated Doctor Full Profile)
doctorRouter.get('/auth/me', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const verificationDocs = await DoctorVerificationModel.getDocumentsByDoctorId(doctor.id);
    const doctorProcedures = await DoctorProcedureModel.getByDoctorId(doctor.id);
    const scheduleExceptions = await DoctorScheduleModel.getExceptionsByDoctorId(doctor.id);

    const { password_hash, ...safeDoctor } = doctor;

    res.status(200).json({
      success: true,
      doctor: {
        ...safeDoctor,
        verificationDocuments: verificationDocs,
        proceduresList: doctorProcedures,
        scheduleExceptions,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to retrieve doctor profile.' });
  }
});

// GET /api/doctors/auth/clinics (Doctor's Authorized Clinics & All Demo Clinics)
doctorRouter.get('/auth/clinics', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const dbClinics = await ClinicModel.getAll();

    // 1. Resolve Doctor's active assignments
    const assignments = await DoctorClinicAssignmentModel.getByDoctorId(doctor.id);
    const assignedCanonicalIds = new Set<string>();

    // Primary clinic
    if (doctor.clinic_id) {
      assignedCanonicalIds.add(resolveCanonicalClinicId(doctor.clinic_id));
    }

    // Assigned clinics via DoctorClinicAssignmentModel
    for (const a of assignments) {
      if (a.active) {
        assignedCanonicalIds.add(resolveCanonicalClinicId(a.clinic_id));
      }
    }

    // Clinic affiliations array
    if (doctor.clinic_affiliations && Array.isArray(doctor.clinic_affiliations)) {
      for (const aff of doctor.clinic_affiliations) {
        assignedCanonicalIds.add(resolveCanonicalClinicId(aff));
      }
    }

    // 2. Deduplicate all demo clinics by canonical ID
    const uniqueClinicsMap = new Map<string, any>();
    for (const c of dbClinics) {
      const canonicalId = resolveCanonicalClinicId(c.id);
      if (!uniqueClinicsMap.has(canonicalId)) {
        uniqueClinicsMap.set(canonicalId, c);
      }
    }
    const dedupedDemoClinics = Array.from(uniqueClinicsMap.values());

    const now = new Date();
    const currentHour = now.getHours();
    const normDate = timeService.getTodayDateString();

    // 3. Format all demo clinics with real operational status for this doctor
    const formattedDemoClinics = dedupedDemoClinics.map((c) => {
      const canonicalClinicId = resolveCanonicalClinicId(c.id);
      const isPrimary =
        canonicalClinicId === resolveCanonicalClinicId(doctor.clinic_id) ||
        (!doctor.clinic_id && c.name.toLowerCase() === (doctor.clinic_name || '').toLowerCase());

      const isAssigned =
        isPrimary ||
        assignedCanonicalIds.has(canonicalClinicId) ||
        (doctor.clinic_affiliations &&
          doctor.clinic_affiliations.some(
            (aff: string) =>
              resolveCanonicalClinicId(aff) === canonicalClinicId
          ));

      let waitingCount = 0;
      let inConsultation = false;
      let totalToday = 0;

      if (isAssigned) {
        for (const apt of memoryDb.appointments.values()) {
          const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);
          const aptDocMatch = apt.doctor_id === doctor.id;
          const aptClinicMatch = resolveCanonicalClinicId(apt.clinic_id) === canonicalClinicId;
          if (aptDocMatch && aptClinicMatch && aptDate === normDate) {
            totalToday++;
            if (['Waiting', 'Almost Your Turn', 'Next', 'Checked In', 'CHECKED_IN'].includes(apt.status)) {
              waitingCount++;
            }
            if (['In Consultation', 'IN_CONSULTATION'].includes(apt.status)) {
              inConsultation = true;
            }
          }
        }
      }

      let status = 'Running on time';
      let todayHours = c.open_hours || '09:00 AM – 05:00 PM';
      let openTimeHour = 9;
      let closeTimeHour = 17;

      if (currentHour < openTimeHour) {
        const minsUntil = Math.round((openTimeHour - currentHour) * 60);
        status = `Starts in ${minsUntil} min`;
      } else if (currentHour >= closeTimeHour) {
        status = 'Completed';
      } else if (doctor.status === 'ON_BREAK') {
        status = 'On Break';
      } else if (inConsultation) {
        status = 'In Session';
      } else if (doctor.status === 'AVAILABLE') {
        status = 'Running on time';
      } else if (doctor.status === 'OFFLINE') {
        status = 'Offline';
      }

      return {
        id: c.id,
        name: c.name,
        address: c.address,
        area: c.area || c.address.split(',')[1]?.trim() || 'Chennai',
        city: c.city || 'Chennai',
        latitude: c.latitude || 13.0338,
        longitude: c.longitude || 80.2677,
        todayHours,
        status,
        waitingCount,
        totalToday,
        isPrimary,
        isAssigned,
        category: c.category || 'General Medicine',
        specialization: c.category || 'General Medicine',
        departments: c.departments || [c.category || 'General Medicine'],
        phone: c.phone || '',
        rating: c.rating || 4.8,
        reviews_count: c.reviews_count || 120,
        source: 'MEDLINK_DEMO',
        isConnected: true,
      };
    });

    // Assigned clinics list (primary first, then other assigned)
    const assignedClinics = formattedDemoClinics
      .filter((c) => c.isAssigned)
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

    res.status(200).json({
      success: true,
      clinics: assignedClinics,
      allDemoClinics: formattedDemoClinics,
      totalDemoClinics: formattedDemoClinics.length,
      assignedClinicsCount: assignedClinics.length,
    });
  } catch (err: any) {
    console.error('Error fetching doctor clinics:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch doctor clinics.' });
  }
});

// GET /api/doctors/auth/load (Adaptive Doctor Load for Selected Clinic)
doctorRouter.get('/auth/load', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const clinicId = (req.query.clinicId as string) || doctor.clinic_id;

    const allDocs = Array.from(memoryDb.doctors.values());
    const clinicDocs = allDocs.filter(
      (d) => d.clinic_id === clinicId || d.clinic_affiliations?.includes(clinicId) || d.clinic_name === doctor.clinic_name
    );

    const result = clinicDocs.map((d) => {
      let waiting = 0;
      for (const apt of memoryDb.appointments.values()) {
        if (apt.doctor_id === d.id && ['Waiting', 'Almost Your Turn', 'Next', 'Confirmed'].includes(apt.status)) {
          waiting++;
        }
      }

      let loadLevel: 'Low' | 'Moderate' | 'High' = 'Low';
      if (waiting >= 6) loadLevel = 'High';
      else if (waiting >= 3) loadLevel = 'Moderate';

      return {
        doctorId: d.id,
        doctorName: d.name,
        specialization: d.specialization,
        avatar: d.avatar,
        status: d.status,
        patientsWaiting: waiting,
        currentLoad: loadLevel,
        isAvailableToday: d.is_available_today,
      };
    });

    res.status(200).json({ success: true, clinicId, doctorLoad: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor load.' });
  }
});

// GET /api/doctors/auth/verification/audit-trail (Verification Audit Trail)
doctorRouter.get('/auth/verification/audit-trail', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const logs = await AuditLogModel.getByDoctorId(doctor.id);
    const verifLogs = logs.filter((l) => l.action.includes('VERIFICATION') || l.entity_type === 'VERIFICATION' || l.action === 'REGISTER' || l.action === 'UPDATE_PROFILE');

    const formattedTrail = verifLogs.map((l) => ({
      id: l.id,
      date: new Date(l.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      reviewer: 'State Medical Council Board / Admin',
      action: l.action,
      details: l.details,
      statusTransition: doctor.is_verified ? 'UNDER_REVIEW → VERIFIED' : 'SUBMITTED → UNDER_REVIEW',
    }));

    // Default audit entries if empty
    if (formattedTrail.length === 0) {
      formattedTrail.push(
        {
          id: 'v-audit-1',
          date: 'Aug 10, 2026',
          reviewer: 'Tamil Nadu Medical Council Verification Board',
          action: 'COUNCIL_VERIFICATION',
          details: `Medical registration number ${doctor.registration_number || 'TN-MED-49102-2016'} verified against state portal.`,
          statusTransition: 'UNDER_REVIEW → VERIFIED',
        },
        {
          id: 'v-audit-2',
          date: 'Aug 05, 2026',
          reviewer: 'Credentialing Officer',
          action: 'DOCUMENT_SUBMISSION',
          details: 'Degree certificates and State Council Registration License received.',
          statusTransition: 'PENDING → UNDER_REVIEW',
        }
      );
    }

    res.status(200).json({ success: true, auditTrail: formattedTrail });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch verification audit trail.' });
  }
});


// PUT /api/doctors/auth/me (Update Doctor Profile with Re-verification guard)
doctorRouter.put('/auth/me', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const {
      name,
      about,
      consultationFee,
      languages,
      availableDays,
      consultationDuration,
      registrationNumber,
      qualification,
      specialization,
      primarySpecialization,
      secondarySpecialization,
      clinicAffiliations,
    } = req.body;

    const updates: any = {};
    if (name) updates.name = name.trim();
    if (about) updates.about = about.trim();
    if (consultationFee) updates.consultation_fee = consultationFee;
    if (languages) updates.languages = languages;
    if (availableDays) updates.available_days = availableDays;
    if (consultationDuration) updates.consultation_duration = consultationDuration;
    if (clinicAffiliations) updates.clinic_affiliations = clinicAffiliations;

    // Critical security check: changing credentials triggers re-verification state
    let triggeredReverification = false;
    if (
      (registrationNumber && registrationNumber !== doctor.registration_number) ||
      (qualification && qualification !== doctor.qualification) ||
      (specialization && specialization !== doctor.specialization) ||
      (primarySpecialization && primarySpecialization !== doctor.primary_specialization)
    ) {
      updates.registration_number = registrationNumber || doctor.registration_number;
      updates.qualification = qualification || doctor.qualification;
      updates.specialization = specialization || doctor.specialization;
      updates.primary_specialization = primarySpecialization || doctor.primary_specialization;
      updates.secondary_specialization = secondarySpecialization || doctor.secondary_specialization;
      updates.verification_status = 'UNDER_REVIEW';
      updates.is_verified = false;
      triggeredReverification = true;
    }

    const updated = await DoctorModel.update(doctor.id, updates);

    await AuditLogModel.log(
      'UPDATE_PROFILE',
      'DOCTOR',
      doctor.id,
      triggeredReverification
        ? `Doctor updated critical credentials. Verification state moved to UNDER_REVIEW.`
        : `Doctor updated practice information.`,
      { id: doctor.id, name: doctor.name },
      req.ip
    );

    const { password_hash, ...safeDoctor } = updated!;

    res.status(200).json({
      success: true,
      doctor: safeDoctor,
      triggeredReverification,
      message: triggeredReverification
        ? 'Credential updates saved. Your account is placed under review for verification.'
        : 'Profile updated successfully.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update doctor profile.' });
  }
});

// POST /api/doctors/auth/verification/documents (Upload Verification Documents)
doctorRouter.post('/auth/verification/documents', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const { documentType, documentName, uri } = req.body;

    if (!documentType || !documentName) {
      res.status(400).json({ success: false, error: 'Document type and name are required.' });
      return;
    }

    const newDoc = await DoctorVerificationModel.addDocument({
      doctor_id: doctor.id,
      document_type: documentType,
      document_name: documentName,
      uri: uri || `https://medlink.health/secure-docs/${doctor.id}/${documentType}_${Date.now()}.pdf`,
    });

    await AuditLogModel.log(
      'SUBMIT_VERIFICATION_DOCUMENT',
      'VERIFICATION',
      newDoc.id,
      `Doctor submitted ${documentType} for verification`,
      { id: doctor.id, name: doctor.name },
      req.ip
    );

    const allDocs = await DoctorVerificationModel.getDocumentsByDoctorId(doctor.id);

    res.status(201).json({
      success: true,
      document: newDoc,
      documents: allDocs,
      verificationStatus: 'UNDER_REVIEW',
      message: 'Verification document uploaded successfully. Review in progress.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to upload verification document.' });
  }
});

// POST /api/doctors/auth/availability (Toggle Doctor Availability Status)
doctorRouter.post('/auth/availability', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const rawStatus = (req.body.status || 'AVAILABLE').toString().toUpperCase().trim().replace(/ /g, '_');
    const statusMap: Record<string, string> = {
      'AVAILABLE': 'AVAILABLE',
      'BUSY': 'BUSY',
      'ON_BREAK': 'ON_BREAK',
      'ONBREAK': 'ON_BREAK',
      'UNAVAILABLE': 'OFFLINE',
      'ON_LEAVE': 'OFFLINE',
      'ONLEAVE': 'OFFLINE',
      'OFF_DUTY': 'OFFLINE',
      'OFFDUTY': 'OFFLINE',
      'OFFLINE': 'OFFLINE',
    };

    const status = statusMap[rawStatus] || 'AVAILABLE';
    const isAvailable = status === 'AVAILABLE' || status === 'BUSY';

    const targetClinicRaw = req.body.clinicId || req.body.clinic_id || doctor.clinic_id;
    const canonicalClinicId = targetClinicRaw ? resolveCanonicalClinicId(targetClinicRaw) : resolveCanonicalClinicId(doctor.clinic_id);

    // Persist clinic assignment status
    await DoctorClinicAssignmentModel.setStatus(doctor.id, canonicalClinicId, status as any);

    const updated = await DoctorModel.update(doctor.id, {
      status: status as any,
      is_available_today: isAvailable,
    });

    const updatedAt = new Date().toISOString();
    const statusPayload = {
      doctorId: doctor.id,
      clinicId: canonicalClinicId,
      status,
      updatedAt,
    };

    // Emit doctor:status_updated
    emitToClinic(canonicalClinicId, 'doctor:status_updated', statusPayload);
    if (targetClinicRaw && targetClinicRaw !== canonicalClinicId) {
      emitToClinic(targetClinicRaw, 'doctor:status_updated', statusPayload);
    }
    emitToDoctor(doctor.id, 'doctor:status_updated', statusPayload);
    emitBroadcast('doctor:status_updated', statusPayload);

    // Broadcast Real-time Event via Socket.IO
    emitBroadcast('doctor:availability_changed', {
      doctorId: doctor.id,
      doctorName: doctor.name,
      clinicId: canonicalClinicId,
      status,
      isAvailableToday: status !== 'OFFLINE',
    });

    emitBroadcast('doctor:availability_updated', {
      doctorId: doctor.id,
      doctorName: doctor.name,
      clinicId: canonicalClinicId,
      status,
      isAvailableToday: status !== 'OFFLINE',
      date: timeService.getTodayDateString(),
    });

    emitToDoctor(doctor.id, 'doctor:availability_changed', { status });
    emitToDoctor(doctor.id, 'doctor:availability_updated', { status });
    emitToClinic(canonicalClinicId, 'doctor:availability_updated', {
      doctorId: doctor.id,
      status,
    });

    await AuditLogModel.log(
      'UPDATE_AVAILABILITY',
      'DOCTOR',
      doctor.id,
      `Availability status toggled to ${status}`,
      { id: doctor.id, name: doctor.name },
      req.ip
    );

    res.status(200).json({
      success: true,
      status: updated!.status,
      isAvailableToday: updated!.is_available_today,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update availability.' });
  }
});

// PUT /api/doctors/auth/availability-schedule (Full schedule, breaks, duration, and status control)
doctorRouter.put('/auth/availability-schedule', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const {
      date = timeService.getTodayDateString(),
      startTime,
      endTime,
      breaks,
      consultationDuration,
      availabilityStatus,
      leaveStatus,
      emergencyClosure,
      notes,
    } = req.body;

    const durMinutes = consultationDuration ? parseInt(String(consultationDuration).replace(/[^0-9]/g, ''), 10) : undefined;

    const { availability, affectedAppointments } = await DoctorAvailabilityModel.setAvailability(doctor.id, date, {
      start_time: startTime,
      end_time: endTime,
      breaks,
      consultation_duration_minutes: durMinutes,
      availability_status: availabilityStatus,
      leave_status: leaveStatus,
      emergency_closure: emergencyClosure,
      notes,
    });

    if (availabilityStatus) {
      await DoctorModel.update(doctor.id, {
        status: availabilityStatus === 'AVAILABLE' ? 'AVAILABLE' : 'OFFLINE',
        is_available_today: availabilityStatus === 'AVAILABLE',
      });
    }

    const eventPayload = {
      doctorId: doctor.id,
      doctorName: doctor.name,
      clinicId: doctor.clinic_id,
      clinicName: doctor.clinic_name,
      department: doctor.specialization,
      date,
      availability,
      affectedSlots: [],
      affectedAppointments: affectedAppointments.map((a) => a.id),
    };

    emitBroadcast('doctor:availability_updated', eventPayload);
    emitBroadcast('doctor:availability_changed', {
      doctorId: doctor.id,
      doctorName: doctor.name,
      clinicId: doctor.clinic_id,
      status: availability.availability_status === 'AVAILABLE' ? 'AVAILABLE' : 'OFFLINE',
      isAvailableToday: availability.availability_status === 'AVAILABLE',
    });
    emitToDoctor(doctor.id, 'doctor:availability_updated', eventPayload);
    emitToClinic(doctor.clinic_id, 'doctor:availability_updated', eventPayload);

    for (const apt of affectedAppointments) {
      emitToPatient(apt.patient_id, 'doctor:availability_updated', eventPayload);
    }

    await AuditLogModel.log(
      'UPDATE_AVAILABILITY_SCHEDULE',
      'DOCTOR',
      doctor.id,
      `Availability schedule updated: ${availability.start_time}–${availability.end_time}, status: ${availability.availability_status}`,
      { id: doctor.id, name: doctor.name },
      req.ip
    );

    res.status(200).json({
      success: true,
      availability,
      affectedAppointmentsCount: affectedAppointments.length,
      message: 'Doctor availability schedule updated successfully.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update doctor availability schedule.' });
  }
});

// POST /api/doctors/auth/delay (Doctor Reports Delay & Broadcasts to Patients)
doctorRouter.post('/auth/delay', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const { delayMinutes = 15, reason = 'Emergency clinical procedure' } = req.body;

    await queueManager.reportDoctorDelay(doctor.id, delayMinutes);

    emitBroadcast('doctor:delay_updated', {
      doctorId: doctor.id,
      doctorName: doctor.name,
      clinicId: doctor.clinic_id,
      delayMinutes,
      reason,
    });

    await AuditLogModel.log(
      'REPORT_DELAY',
      'SCHEDULE',
      doctor.id,
      `Reported delay of ${delayMinutes} minutes (${reason})`,
      { id: doctor.id, name: doctor.name },
      req.ip
    );

    res.status(200).json({
      success: true,
      message: `Delay advisory of ${delayMinutes} minutes broadcasted to waiting patients.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to report delay.' });
  }
});

// GET /api/doctors/auth/procedures (Doctor's Mapped Procedures)
doctorRouter.get('/auth/procedures', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const doctorProcedures = await DoctorProcedureModel.getByDoctorId(doctor.id);
    res.status(200).json({ success: true, procedures: doctorProcedures });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor procedures.' });
  }
});

// POST /api/doctors/auth/procedures (Add / Remove / Request Procedure)
doctorRouter.post('/auth/procedures', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const { action, procedureName, procedureId } = req.body;

    if (!procedureName) {
      res.status(400).json({ success: false, error: 'Procedure name is required.' });
      return;
    }

    if (action === 'remove') {
      await DoctorProcedureModel.removeProcedure(doctor.id, procedureName);
      await AuditLogModel.log(
        'REMOVE_PROCEDURE',
        'PROCEDURE',
        doctor.id,
        `Removed procedure: ${procedureName}`,
        { id: doctor.id, name: doctor.name },
        req.ip
      );
    } else {
      await DoctorProcedureModel.addProcedure(doctor.id, procedureName, procedureId);
      await AuditLogModel.log(
        'ADD_PROCEDURE',
        'PROCEDURE',
        doctor.id,
        `Added procedure: ${procedureName}`,
        { id: doctor.id, name: doctor.name },
        req.ip
      );
    }

    const updatedList = await DoctorProcedureModel.getByDoctorId(doctor.id);
    res.status(200).json({ success: true, procedures: updatedList });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update procedures.' });
  }
});

// GET /api/doctors/auth/appointments/today (Today's Doctor Appointments)
doctorRouter.get('/auth/appointments/today', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const clinicId = (req.query.clinicId as string) || doctor.clinic_id;
    const canonicalTargetClinic = clinicId ? resolveCanonicalClinicId(clinicId) : resolveCanonicalClinicId(doctor.clinic_id);

    const list: any[] = [];
    const seenIds = new Set<string>();
    for (const apt of memoryDb.appointments.values()) {
      if (apt.doctor_id === doctor.id) {
        // STRICT: Only include appointments where appointmentDate === today
        const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);
        if (!timeService.isToday(aptDate)) {
          continue;
        }

        const aptClinic = resolveCanonicalClinicId(apt.clinic_id);
        if (canonicalTargetClinic && aptClinic !== canonicalTargetClinic) {
          continue;
        }

        if (!seenIds.has(apt.id)) {
          seenIds.add(apt.id);
          const canonicalToken = (apt.token_number && apt.token_number.trim()) ||
            (apt.tokenNumber && apt.tokenNumber.trim()) ||
            (apt.queueToken && apt.queueToken.trim()) ||
            (apt.queue_number ? `A${String(apt.queue_number).padStart(3, '0')}` : 'A001');

          list.push({
            ...apt,
            token: canonicalToken,
            token_number: canonicalToken,
            tokenNumber: canonicalToken,
            queue_number: apt.queue_position || apt.queue_number || 1,
            queuePosition: apt.queue_position || apt.queue_number || 1,
          });
        }
      }
    }

    // Sort: In Consultation first, then Waiting by queue_position, then Completed
    const statusOrder: Record<string, number> = {
      'In Consultation': 1,
      'IN_CONSULTATION': 1,
      'Next': 2,
      'Almost Your Turn': 3,
      'Checked In': 3.5,
      'CHECKED_IN': 3.5,
      'Waiting': 4,
      'WAITING': 4,
      'Confirmed': 5,
      'Booked': 6,
      'BOOKED': 6,
      'Completed': 7,
      'COMPLETED': 7,
      'Delayed': 8,
      'Cancelled': 9,
      'CANCELLED': 9,
    };

    list.sort((a, b) => (statusOrder[a.status] || 10) - (statusOrder[b.status] || 10));

    res.status(200).json({ success: true, appointments: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Failed to fetch today's appointments." });
  }
});

// GET /api/doctors/auth/appointments/upcoming (Future Doctor Appointments)
doctorRouter.get('/auth/appointments/upcoming', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const clinicId = (req.query.clinicId as string) || doctor.clinic_id;
    const canonicalTargetClinic = clinicId ? resolveCanonicalClinicId(clinicId) : resolveCanonicalClinicId(doctor.clinic_id);

    const list: any[] = [];
    const seenIds = new Set<string>();
    for (const apt of memoryDb.appointments.values()) {
      if (apt.doctor_id === doctor.id) {
        const aptDate = timeService.normalizeDateString(apt.date || apt.appointmentDate);
        if (!timeService.isFutureDate(aptDate)) {
          continue;
        }
        if (['Cancelled', 'CANCELLED', 'NO_SHOW', 'No Show'].includes(apt.status)) {
          continue;
        }

        const aptClinic = resolveCanonicalClinicId(apt.clinic_id);
        if (canonicalTargetClinic && aptClinic !== canonicalTargetClinic) {
          continue;
        }

        if (!seenIds.has(apt.id)) {
          seenIds.add(apt.id);
          const canonicalToken = (apt.token_number && apt.token_number.trim()) ||
            (apt.tokenNumber && apt.tokenNumber.trim()) ||
            (apt.queueToken && apt.queueToken.trim()) ||
            (apt.queue_number ? `A${String(apt.queue_number).padStart(3, '0')}` : 'A001');

          list.push({
            ...apt,
            token: canonicalToken,
            token_number: canonicalToken,
            tokenNumber: canonicalToken,
          });
        }
      }
    }

    list.sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.time || '').localeCompare(b.time || '');
    });

    res.status(200).json({ success: true, appointments: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch upcoming appointments.' });
  }
});

// GET /api/doctors/auth/queue (Real-Time Live Queue for Doctor & Selected Clinic)
doctorRouter.get('/auth/queue', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const clinicId = (req.query.clinicId as string) || doctor.clinic_id;

    const rawQueue = queueManager.getQueue(clinicId, doctor.id);
    const queueItems: any[] = [];
    const seenQueueIds = new Set<string>();

    for (const qItem of rawQueue) {
      const canonicalToken = qItem.token || qItem.queueNumber || 'A001';
      if (qItem.appointmentId) {
        if (seenQueueIds.has(qItem.appointmentId)) continue;
        seenQueueIds.add(qItem.appointmentId);

        const apt = memoryDb.appointments.get(qItem.appointmentId);
        if (apt) {
          queueItems.push({
            ...apt,
            queueId: qItem.queueId || `q-${apt.id}`,
            patientId: apt.patient_id || apt.patientId,
            doctorId: apt.doctor_id || doctor.id,
            clinicId: apt.clinic_id,
            appointmentId: apt.id,
            createdAt: apt.created_at || (apt as any).appointmentDate,
            patient_name: apt.patient_name || qItem.patientName,
            token: canonicalToken,
            token_number: canonicalToken,
            tokenNumber: canonicalToken,
            queueNumber: canonicalToken,
            queue_number: qItem.queuePosition || apt.queue_number || 1,
            queue_position: qItem.queuePosition ?? apt.queue_position,
            patients_ahead: qItem.patientsAhead ?? apt.patients_ahead,
            estimated_wait: qItem.estimatedWaitText || apt.estimated_wait,
            priority: qItem.priority || 'NORMAL',
            status: qItem.status === 'IN_CONSULTATION' ? 'In Consultation' : apt.status,
          });
        }
      } else if (qItem.walkInId) {
        if (seenQueueIds.has(qItem.walkInId)) continue;
        seenQueueIds.add(qItem.walkInId);

        const walkin = memoryDb.walk_ins.get(qItem.walkInId);
        if (walkin) {
          queueItems.push({
            id: walkin.id,
            queueId: qItem.queueId || `q-w-${walkin.id}`,
            walkInId: walkin.id,
            patientId: walkin.patient_id || `pat-${walkin.id}`,
            doctorId: doctor.id,
            clinicId: walkin.clinic_id,
            createdAt: walkin.created_at,
            patient_id: walkin.patient_id || `pat-${walkin.id}`,
            patient_name: walkin.patient_name,
            clinic_id: walkin.clinic_id,
            doctor_id: doctor.id,
            doctor_name: doctor.name,
            doctor_specialization: doctor.specialization,
            clinic_name: doctor.clinic_name,
            clinic_address: (doctor as any).clinic_address || 'Clinic Facility',
            department: (doctor as any).department || doctor.specialization,
            date: timeService.getTodayDateString(),
            time: 'Walk-in',
            duration: doctor.consultation_duration || '20 min',
            status: qItem.status === 'IN_CONSULTATION' ? 'In Consultation' : 'Waiting',
            token: canonicalToken,
            token_number: canonicalToken,
            tokenNumber: canonicalToken,
            queueNumber: canonicalToken,
            queue_number: qItem.queuePosition || 1,
            queue_position: qItem.queuePosition || 1,
            patients_ahead: qItem.patientsAhead || 0,
            estimated_wait: qItem.estimatedWaitText,
            reason: walkin.reason || (walkin.priority === 'EMERGENCY' ? 'Emergency Walk-in' : 'Walk-in Consultation'),
            symptoms: walkin.symptoms || [],
            consultation_fee: doctor.consultation_fee || '₹400',
            prescription_available: false,
            priority: qItem.priority || 'NORMAL',
          });
        }
      }
    }

    // Identify active and next patients
    const currentInConsultation = queueItems.find((a) => ['In Consultation', 'IN_CONSULTATION'].includes(a.status)) || null;
    const nextPatient = queueItems.find((a) => !['In Consultation', 'IN_CONSULTATION', 'Completed', 'COMPLETED', 'Cancelled', 'CANCELLED', 'NO_SHOW', 'No Show'].includes(a.status)) || null;
    const waitingPatients = queueItems.filter((a) => !['In Consultation', 'IN_CONSULTATION', 'Completed', 'COMPLETED', 'Cancelled', 'CANCELLED', 'NO_SHOW', 'No Show'].includes(a.status));
    
    let completedCount = 0;
    let scheduledTodayCount = 0;
    const canonicalClinicId = resolveCanonicalClinicId(clinicId);
    for (const apt of memoryDb.appointments.values()) {
      if (apt.doctor_id === doctor.id && resolveCanonicalClinicId(apt.clinic_id) === canonicalClinicId) {
        if (timeService.isToday(apt.date || apt.appointmentDate)) {
          if (['Completed', 'COMPLETED'].includes(apt.status)) {
            completedCount++;
          }
          if (!['Cancelled', 'CANCELLED', 'No Show', 'NO_SHOW', 'No-Show'].includes(apt.status)) {
            scheduledTodayCount++;
          }
        }
      }
    }

    const totalWalkInsToday = queueItems.filter((q) => q.walkInId).length;
    const totalToday = Math.max(scheduledTodayCount + totalWalkInsToday, queueItems.length + completedCount);

    res.status(200).json({
      success: true,
      currentPatient: currentInConsultation,
      nextPatient,
      waitingCount: waitingPatients.length,
      completedCount,
      totalToday,
      queue: queueItems,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch live queue.' });
  }
});

// GET /api/doctors/auth/patients (Doctor's Authorized Treated Patient Directory)
doctorRouter.get('/auth/patients', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const query = (req.query.query as string || '').toLowerCase();

    const patientMap = new Map<string, any>();

    for (const apt of memoryDb.appointments.values()) {
      if (apt.doctor_id === doctor.id) {
        const patient = memoryDb.patients.get(apt.patient_id);
        if (patient) {
          const existing = patientMap.get(patient.id);
          const isLatest = !existing || new Date(apt.created_at || 0) > new Date(existing.lastVisitDate || 0);

          if (isLatest) {
            patientMap.set(patient.id, {
              id: patient.id,
              name: patient.name,
              age: patient.age,
              gender: patient.gender,
              bloodGroup: patient.blood_group,
              phone: patient.phone,
              avatar: patient.avatar,
              lastVisitDate: apt.date,
              lastReason: apt.reason,
              lastAppointmentId: apt.id,
              lastStatus: apt.status,
            });
          }
        }
      }
    }

    let patients = Array.from(patientMap.values());
    if (query) {
      patients = patients.filter((p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query));
    }

    res.status(200).json({ success: true, patients });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch patients.' });
  }
});

// GET /api/doctors/auth/patients/:patientId (Complete Authorized Patient Medical Record & History)
doctorRouter.get('/auth/patients/:patientId', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const patient = await PatientModel.findById(req.params.patientId);

    if (!patient) {
      res.status(404).json({ success: false, error: 'Patient not found.' });
      return;
    }

    // Fetch patient appointments, prescriptions, files, and consultations
    const patientAppointments = await AppointmentModel.getByPatientId(patient.id);
    const patientPrescriptions = await PrescriptionModel.getByPatientId(patient.id);
    const patientFiles = await MedicalFileModel.getByPatientId(patient.id);
    const consultations = await ConsultationModel.getByPatientId(patient.id);

    // Audit Log Patient Record Access
    await AuditLogModel.log(
      'VIEW_PATIENT_RECORD',
      'PATIENT',
      patient.id,
      `Doctor ${doctor.name} viewed clinical record for patient ${patient.name}`,
      { id: doctor.id, name: doctor.name },
      req.ip
    );

    const { password_hash, ...safePatient } = patient;

    res.status(200).json({
      success: true,
      patient: safePatient,
      history: {
        appointments: patientAppointments,
        prescriptions: patientPrescriptions,
        reports: patientFiles,
        consultations,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch patient records.' });
  }
});

// POST /api/doctors/auth/consultations (Conduct Consultation, Save Clinical Notes, Create Prescription & Complete Queue)
doctorRouter.post('/auth/consultations', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const {
      appointmentId,
      patientId,
      clinicId = doctor.clinic_id,
      clinicalNotes,
      symptoms = [],
      assessment,
      diagnosis,
      medicines = [],
      followUpDate,
      followUpReason,
      vitals,
    } = req.body;

    if (!appointmentId || !diagnosis) {
      res.status(400).json({ success: false, error: 'Appointment ID and Clinical Diagnosis are required.' });
      return;
    }

    // 1. Authoritative resolution of either Appointment or Walk-in Record
    let appointment = await AppointmentModel.getById(appointmentId);
    let walkin = null;
    if (!appointment) {
      walkin = (await WalkInModel.getById(appointmentId)) || memoryDb.walk_ins.get(appointmentId) || null;
    }

    if (!appointment && !walkin) {
      res.status(404).json({ success: false, error: 'Appointment or walk-in record not found.' });
      return;
    }

    const targetClinicId = appointment ? appointment.clinic_id : walkin!.clinic_id;
    const targetDoctorId = appointment ? appointment.doctor_id : (walkin!.doctor_id || doctor.id);

    // Validate doctor ownership / clinic scoping
    if (resolveCanonicalClinicId(targetClinicId) !== resolveCanonicalClinicId(doctor.clinic_id)) {
      res.status(403).json({ success: false, error: 'Forbidden: You cannot complete consultations for another clinic.' });
      return;
    }
    if (targetDoctorId && targetDoctorId !== doctor.id && targetDoctorId !== 'd1') {
      res.status(403).json({ success: false, error: 'Forbidden: You cannot complete consultations for another doctor.' });
      return;
    }

    const effectivePatientId =
      patientId ||
      (appointment ? appointment.patient_id : (walkin?.patient_id || 'pat-demo-ramesh-emergency'));
    const patient = await PatientModel.findById(effectivePatientId);
    const patientName = patient?.name || (appointment ? appointment.patient_name : walkin?.patient_name) || 'Patient';
    const clinicName = appointment?.clinic_name || doctor.clinic_name || 'Moon Dental Clinic';
    const clinicAddress = appointment?.clinic_address || (doctor as any).clinic_address || 'Villivakkam, Chennai';

    // 2. Idempotency Protection: Duplicate submission returns existing completed record
    const isAlreadyCompleted = appointment
      ? ['Completed', 'COMPLETED'].includes(appointment.status)
      : walkin!.status === 'COMPLETED';

    if (isAlreadyCompleted) {
      const existingConsultation = await ConsultationModel.getByAppointmentId(appointmentId);
      const existingPrescription = await PrescriptionModel.getByAppointmentId(appointmentId);
      res.status(200).json({
        success: true,
        consultation: existingConsultation,
        prescription: existingPrescription,
        appointment: appointment || {
          id: walkin!.id,
          patient_id: effectivePatientId,
          patient_name: patientName,
          status: 'Completed',
          appointmentStatus: 'COMPLETED',
          doctor_id: doctor.id,
          doctor_name: doctor.name,
        },
        message: 'Consultation is already completed.',
      });
      return;
    }

    // 3. Save Consultation Record
    const newConsultation = await ConsultationModel.create({
      appointment_id: appointmentId,
      patient_id: effectivePatientId,
      doctor_id: doctor.id,
      clinic_id: targetClinicId,
      clinical_notes: clinicalNotes,
      symptoms,
      assessment,
      diagnosis,
      follow_up_date: followUpDate,
      follow_up_reason: followUpReason,
      vitals,
    });

    // 4. Create Digital Prescription in Patient Health Records (if medicines prescribed)
    let createdPrescription = null;
    if (medicines.length > 0) {
      createdPrescription = await PrescriptionModel.create({
        id: `rx-${appointmentId}`,
        appointment_id: appointmentId,
        patient_id: effectivePatientId,
        patient_name: patientName,
        doctor_id: doctor.id,
        doctor_name: doctor.name,
        doctor_specialization: doctor.specialization,
        doctor_registration_number: doctor.registration_number,
        clinic_id: targetClinicId,
        clinic_name: clinicName,
        clinic_address: clinicAddress,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        diagnosis,
        clinical_notes: clinicalNotes,
        follow_up_date: followUpDate,
        medicines: medicines.map((m: any) => ({
          name: m.name,
          dosage: m.dosage || '500 mg',
          frequency: m.frequency || '1-0-1',
          duration: m.duration || '5 days',
          instructions: m.instructions || 'After food',
        })),
      });

      if (appointment) {
        await AppointmentModel.update(appointmentId, { prescription_available: true });
      }
    }

    // 5. Complete Appointment / Walk-in & Remove from Active Queue
    let updatedRecord: any = null;
    if (appointment) {
      updatedRecord = await AppointmentModel.update(appointmentId, {
        status: 'Completed',
        appointmentStatus: 'COMPLETED',
        patients_ahead: 0,
        queue_position: 0,
        estimated_wait: 'Completed',
        consultationCompletedAt: new Date().toISOString(),
        prescription_available: !!createdPrescription,
        updated_at: new Date().toISOString(),
      });
      // Explicitly remove from active queue index
      memoryDb.appointment_queue.delete(appointmentId);
      memoryDb.appointment_queue.delete(`queue-${appointmentId}`);
      memoryDb.appointment_queue.delete(`q-${appointmentId}`);
    } else if (walkin) {
      walkin.status = 'COMPLETED';
      walkin.queue_position = 0;
      walkin.patients_ahead = 0;
      walkin.estimated_wait_minutes = 0;
      walkin.completed_at = new Date().toISOString();
      memoryDb.walk_ins.set(walkin.id, walkin);
      await WalkInModel.updateStatus(walkin.id, 'COMPLETED');
      updatedRecord = {
        id: walkin.id,
        patient_id: effectivePatientId,
        patient_name: patientName,
        status: 'Completed',
        appointmentStatus: 'COMPLETED',
        doctor_id: doctor.id,
        doctor_name: doctor.name,
      };
    }

    // 6. Reset Doctor Status to AVAILABLE
    await DoctorModel.update(doctor.id, { status: 'AVAILABLE' });

    // 7. Recalculate remaining waiting patients in Queue
    const updatedQueue = queueManager.getQueue(targetClinicId, doctor.id);
    for (const qItem of updatedQueue) {
      if (qItem.appointmentId) {
        const apt = memoryDb.appointments.get(qItem.appointmentId);
        if (apt && ['Waiting', 'WAITING', 'Checked In', 'CHECKED_IN', 'Almost Your Turn', 'Next'].includes(apt.status)) {
          const newStatus = qItem.patientsAhead === 0 ? 'Next' : (qItem.patientsAhead === 1 ? 'Almost Your Turn' : 'Waiting');
          apt.status = newStatus;
          apt.queue_position = qItem.queuePosition;
          apt.patients_ahead = qItem.patientsAhead;
          apt.estimated_wait = qItem.estimatedWaitText;
          memoryDb.appointments.set(apt.id, apt);

          const qPayload = {
            appointmentId: apt.id,
            status: apt.status,
            patientsAhead: apt.patients_ahead,
            queuePosition: apt.queue_position,
            estimatedWait: apt.estimated_wait,
            clinicId: targetClinicId,
            doctorId: doctor.id,
          };

          emitToPatient(apt.patient_id, 'queue:updated', qPayload);
          emitToAppointment(apt.id, 'queue:updated', qPayload);
          emitBroadcast('queue:updated', qPayload);
          emitToClinic(targetClinicId, 'queue:updated', qPayload);
          emitToDoctor(doctor.id, 'queue:updated', qPayload);
        }
      }
    }

    // 8. Real-time Multi-Room Socket.IO Event Broadcasts
    const completionPayload = {
      appointmentId,
      queueId: appointmentId.startsWith('walk-') ? `q-w-${appointmentId}` : `q-${appointmentId}`,
      patientId: effectivePatientId,
      patientName,
      status: 'Completed',
      appointmentStatus: 'COMPLETED',
      clinicId: targetClinicId,
      doctorId: doctor.id,
      patientsAhead: 0,
      queuePosition: 0,
      estimatedWait: 'Completed',
      prescriptionAvailable: !!createdPrescription,
      prescription: createdPrescription,
    };

    emitToClinic(targetClinicId, 'queue:updated', completionPayload);
    emitToClinic(targetClinicId, 'appointment:status', completionPayload);
    emitToClinic(targetClinicId, 'appointment:updated', completionPayload);
    emitToClinic(targetClinicId, 'consultation:completed', completionPayload);

    emitToDoctor(doctor.id, 'queue:updated', completionPayload);
    emitToDoctor(doctor.id, 'appointment:status', completionPayload);
    emitToDoctor(doctor.id, 'appointment:updated', completionPayload);
    emitToDoctor(doctor.id, 'queue:completed', {
      appointmentId,
      patientId: effectivePatientId,
      consultation: newConsultation,
      prescription: createdPrescription,
    });
    emitToDoctor(doctor.id, 'consultation:completed', completionPayload);

    emitToPatient(effectivePatientId, 'appointment:status', completionPayload);
    emitToPatient(effectivePatientId, 'appointment:updated', completionPayload);
    emitToPatient(effectivePatientId, 'queue:updated', completionPayload);
    emitToPatient(effectivePatientId, 'consultation:completed', completionPayload);

    emitToAppointment(appointmentId, 'appointment:status', completionPayload);
    emitToAppointment(appointmentId, 'appointment:updated', completionPayload);
    emitToAppointment(appointmentId, 'queue:updated', completionPayload);
    emitToAppointment(appointmentId, 'consultation:completed', completionPayload);

    emitBroadcast('appointment:status', completionPayload);
    emitBroadcast('appointment:updated', completionPayload);
    emitBroadcast('queue:updated', completionPayload);
    emitBroadcast('queue:completed', completionPayload);
    emitBroadcast('consultation:completed', completionPayload);

    // 9. Send Patient Notification
    await notificationService.sendNotification({
      patientId: effectivePatientId,
      title: 'Consultation Completed & Prescription Issued 📋',
      message: `${doctor.name} has completed your consultation. Your digital prescription and clinical notes are now available in your Health Vault.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId },
    });

    if (followUpDate) {
      await notificationService.sendNotification({
        patientId: effectivePatientId,
        title: 'Follow-Up Recommended 🗓️',
        message: `${doctor.name} scheduled a follow-up consultation on ${followUpDate}: ${followUpReason || 'Review healing progress'}.`,
        category: 'Reminders',
        type: 'reminder',
        actionData: { appointmentId, followUpDate },
      });
    }

    // 10. Audit Log Consultation Creation
    await AuditLogModel.log(
      'CREATE_CONSULTATION',
      appointment ? 'APPOINTMENT' : 'WALKIN',
      appointmentId,
      `Consultation completed for ${patientName}. Diagnosis: ${diagnosis}. Medicines count: ${medicines.length}.`,
      { id: doctor.id, name: doctor.name },
      req.ip
    );

    res.status(201).json({
      success: true,
      consultation: newConsultation,
      prescription: createdPrescription,
      appointment: updatedRecord,
      message: 'Consultation recorded and prescription generated successfully.',
    });
  } catch (err: any) {
    console.error('Consultation creation error:', err);
    res.status(500).json({ success: false, error: 'Failed to record consultation.' });
  }
});

// GET /api/doctors/auth/schedule (Doctor's Schedule Configuration)
doctorRouter.get('/auth/schedule', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const exceptions = await DoctorScheduleModel.getExceptionsByDoctorId(doctor.id);
    res.status(200).json({
      success: true,
      schedule: doctor.schedule || {},
      workingDays: doctor.available_days,
      consultationDuration: doctor.consultation_duration,
      exceptions,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch schedule.' });
  }
});

// PUT /api/doctors/auth/schedule (Update Doctor's Working Hours & Exceptions)
doctorRouter.put('/auth/schedule', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const { schedule, availableDays, consultationDuration, newException } = req.body;

    const updates: any = {};
    if (schedule) updates.schedule = schedule;
    if (availableDays) updates.available_days = availableDays;
    if (consultationDuration) updates.consultation_duration = consultationDuration;

    if (newException && newException.date && newException.reason) {
      await DoctorScheduleModel.addException(doctor.id, newException.date, newException.reason, newException.isFullDay ?? true);
    }

    const updated = await DoctorModel.update(doctor.id, updates);
    const exceptions = await DoctorScheduleModel.getExceptionsByDoctorId(doctor.id);

    await AuditLogModel.log(
      'UPDATE_SCHEDULE',
      'SCHEDULE',
      doctor.id,
      `Doctor updated weekly working hours & slot duration`,
      { id: doctor.id, name: doctor.name },
      req.ip
    );

    const schedulePayload = {
      doctorId: doctor.id,
      doctorName: doctor.name,
      clinicId: doctor.clinic_id,
      action: 'SCHEDULE_UPDATED',
      availableDays: updated!.available_days,
      consultationDuration: updated!.consultation_duration,
      exceptions,
    };
    emitBroadcast('doctor:availability_updated', schedulePayload);
    emitToDoctor(doctor.id, 'doctor:availability_updated', schedulePayload);
    if (doctor.clinic_id) {
      emitToClinic(doctor.clinic_id, 'doctor:availability_updated', schedulePayload);
    }

    res.status(200).json({
      success: true,
      schedule: updated!.schedule,
      workingDays: updated!.available_days,
      consultationDuration: updated!.consultation_duration,
      exceptions,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update schedule.' });
  }
});

// GET /api/doctors/auth/audit-logs (Doctor Clinical Action Audit Trail)
doctorRouter.get('/auth/audit-logs', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const logs = await AuditLogModel.getByDoctorId(doctor.id);
    res.status(200).json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs.' });
  }
});

// GET /api/doctors/auth/earlier-slots (Eligible Patients for Earlier Slot)
doctorRouter.get('/auth/earlier-slots', authenticateDoctorJwt, async (req: AuthenticatedDoctorRequest, res: Response): Promise<void> => {
  try {
    const doctor = req.doctor!;
    const eligible: any[] = [];

    for (const apt of memoryDb.appointments.values()) {
      if (apt.doctor_id === doctor.id && ['Waiting', 'Confirmed', 'Booked'].includes(apt.status)) {
        eligible.push({
          appointmentId: apt.id,
          patientId: apt.patient_id,
          currentSlot: `${apt.date} at ${apt.time}`,
          tokenNumber: apt.token_number,
          reason: apt.reason,
        });
      }
    }

    res.status(200).json({ success: true, eligiblePatients: eligible });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch eligible earlier slots.' });
  }
});

// GET /api/doctors/:id (Public Doctor Profile Lookup)
doctorRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const doctor = await DoctorModel.getById(req.params.id);
    if (!doctor) {
      res.status(404).json({ success: false, error: 'Doctor not found.' });
      return;
    }
    res.status(200).json({ success: true, doctor: formatDoctorResponse(doctor) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor profile.' });
  }
});

