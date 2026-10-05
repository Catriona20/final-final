import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import {
  AvailabilityRequestModel,
  DoctorClinicAssignmentModel,
  DoctorModel,
  ClinicModel,
  resolveCanonicalDoctorId,
  resolveCanonicalClinicId,
} from '../database/models';
import { doctorAvailabilityService } from '../services/doctorAvailabilityService';
import { timeService } from '../services/timeService';
import {
  emitBroadcast,
  emitToDoctor,
  emitToClinic,
} from '../services/socketService';

export const availabilityRouter = Router();

/**
 * Extracts and verifies the authenticated doctor ID from the Bearer JWT token if present.
 */
function getAuthenticatedDoctorId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    if (decoded && (decoded.role === 'DOCTOR' || decoded.id?.startsWith('doc-')) && decoded.id) {
      return resolveCanonicalDoctorId(decoded.id);
    }
  } catch {
    return null;
  }
  return null;
}

// POST /api/availability/requests (Clinic Assistant creates availability request)
availabilityRouter.post('/requests', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      clinic_id,
      clinicId,
      doctor_id,
      doctorId,
      specialty,
      requested_date,
      requestedDate,
      date,
      start_time,
      startTime,
      end_time,
      endTime,
      notes,
      reason,
      requested_by = 'Clinic Assistant',
    } = req.body;

    const rawClinicId = clinic_id || clinicId;
    const rawDoctorId = doctor_id || doctorId;
    const rawDate = requested_date || date || requestedDate;
    const reqStartTime = start_time || startTime;
    const reqEndTime = end_time || endTime;

    if (!rawClinicId || !rawDoctorId || !rawDate || !reqStartTime || !reqEndTime) {
      res.status(400).json({
        success: false,
        error: 'clinic_id, doctor_id, date/requested_date, start_time, and end_time are required.',
      });
      return;
    }

    const reqDate = timeService.normalizeDateString(rawDate);
    const cId = resolveCanonicalClinicId(rawClinicId);
    const dId = resolveCanonicalDoctorId(rawDoctorId);

    const clinic = await ClinicModel.getById(cId);
    if (!clinic) {
      res.status(404).json({ success: false, error: `Clinic '${rawClinicId}' not found.` });
      return;
    }

    const doctor = await DoctorModel.getById(dId);
    if (!doctor) {
      res.status(404).json({ success: false, error: `Doctor '${rawDoctorId}' not found.` });
      return;
    }

    // Ensure doctor is assigned to clinic (or auto-assign if not yet assigned)
    const isAssigned = await DoctorClinicAssignmentModel.isAssigned(dId, cId);
    if (!isAssigned) {
      await DoctorClinicAssignmentModel.assign(dId, cId, specialty || doctor.specialization || 'General Medicine');
    }

    // Interval conflict checking: only reject if same doctor, same clinic, same date, and overlapping intervals
    const conflictCheck = await AvailabilityRequestModel.hasScheduleConflict(
      dId,
      cId,
      reqDate,
      reqStartTime,
      reqEndTime
    );

    if (conflictCheck.conflict) {
      res.status(409).json({
        success: false,
        error: conflictCheck.reason || 'Schedule conflict: Doctor already has an active schedule overlapping with this window.',
        conflictingRequest: conflictCheck.conflictingRequest,
      });
      return;
    }

    const request = await AvailabilityRequestModel.create({
      clinic_id: cId,
      clinic_name: clinic.name,
      doctor_id: dId,
      doctor_name: doctor.name,
      specialty: specialty || doctor.specialization || 'General Medicine',
      date: reqDate,
      requested_date: reqDate,
      start_time: reqStartTime,
      end_time: reqEndTime,
      notes: notes || reason || '',
      requested_by,
    });

    const fullPayload = {
      ...request,
      id: request.id,
      clinic_id: cId,
      clinicId: cId,
      clinic_name: clinic.name,
      clinicName: clinic.name,
      doctor_id: dId,
      doctorId: dId,
      doctor_name: doctor.name,
      doctorName: doctor.name,
      specialty: request.specialty,
      date: reqDate,
      requested_date: reqDate,
      start_time: reqStartTime,
      startTime: reqStartTime,
      end_time: reqEndTime,
      endTime: reqEndTime,
      status: request.status,
      notes: request.notes,
      created_at: request.created_at,
      updated_at: request.updated_at,
    };

    // Real-time notification emission: strictly target the requested doctor and the creating clinic
    emitToDoctor(dId, 'availability_request:new', fullPayload);
    emitToClinic(cId, 'availability_request:new', fullPayload);

    res.status(201).json({
      success: true,
      message: 'Availability request submitted successfully.',
      request: fullPayload,
    });
  } catch (err: any) {
    console.error('Error creating availability request:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create availability request.' });
  }
});

// GET /api/availability/requests (Filter by doctorId, clinicId, status)
availabilityRouter.get('/requests', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawDoctorId = (req.query.doctorId as string) || (req.query.doctor_id as string);
    const rawClinicId = (req.query.clinicId as string) || (req.query.clinic_id as string);
    const rawDate = (req.query.date as string) || (req.query.requested_date as string);
    const status = req.query.status as any;

    const authDoctorId = getAuthenticatedDoctorId(req);

    // If caller is an authenticated doctor, STRICTLY enforce scoping to their doctor identity.
    // An authenticated doctor must NEVER see another doctor's availability requests.
    let effectiveDoctorId: string | undefined;
    if (authDoctorId) {
      effectiveDoctorId = authDoctorId;
    } else if (rawDoctorId) {
      effectiveDoctorId = resolveCanonicalDoctorId(rawDoctorId);
    }

    const effectiveClinicId = rawClinicId ? resolveCanonicalClinicId(rawClinicId) : undefined;
    const filterDate = rawDate ? timeService.normalizeDateString(rawDate) : undefined;

    const requests = await AvailabilityRequestModel.getRequests({
      doctorId: effectiveDoctorId,
      clinicId: effectiveClinicId,
      status,
      date: filterDate,
    });

    const formattedRequests = requests.map((r) => {
      const canonicalDate = timeService.normalizeDateString(r.date || r.requested_date);
      return {
        ...r,
        date: canonicalDate,
        requested_date: canonicalDate,
        clinicId: r.clinic_id,
        doctorId: r.doctor_id,
        clinicName: r.clinic_name,
        doctorName: r.doctor_name,
        startTime: r.start_time,
        endTime: r.end_time,
      };
    });

    res.status(200).json({
      success: true,
      count: formattedRequests.length,
      requests: formattedRequests,
    });
  } catch (err: any) {
    console.error('Error fetching availability requests:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch availability requests.' });
  }
});

// GET /api/availability/requests/:id
availabilityRouter.get('/requests/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await AvailabilityRequestModel.getById(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, error: 'Availability request not found.' });
      return;
    }

    const authDoctorId = getAuthenticatedDoctorId(req);
    if (authDoctorId) {
      const canonicalReqDoc = resolveCanonicalDoctorId(request.doctor_id);
      if (authDoctorId !== canonicalReqDoc) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: You cannot access availability requests belonging to another doctor.',
        });
        return;
      }
    }

    const canonicalDate = timeService.normalizeDateString(request.date || request.requested_date);
    const formattedRequest = {
      ...request,
      date: canonicalDate,
      requested_date: canonicalDate,
      clinicId: request.clinic_id,
      doctorId: request.doctor_id,
      clinicName: request.clinic_name,
      doctorName: request.doctor_name,
      startTime: request.start_time,
      endTime: request.end_time,
    };

    res.status(200).json({ success: true, request: formattedRequest });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch availability request.' });
  }
});

// POST /api/availability/requests/:id/approve (Doctor approves availability)
availabilityRouter.post('/requests/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await AvailabilityRequestModel.getById(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, error: 'Availability request not found.' });
      return;
    }

    // Authenticated doctor verification & ownership enforcement
    const authDoctorId = getAuthenticatedDoctorId(req);
    if (!authDoctorId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Doctor authentication required to approve availability requests.',
      });
      return;
    }

    const canonicalReqDoc = resolveCanonicalDoctorId(request.doctor_id);
    if (authDoctorId !== canonicalReqDoc) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You cannot approve availability requests belonging to another doctor.',
      });
      return;
    }

    const canonicalReqDate = timeService.normalizeDateString(request.date || request.requested_date);
    const { notes } = req.body || {};
    const updated = await AvailabilityRequestModel.updateStatus(request.id, 'APPROVED', notes);
    if (!updated) {
      res.status(500).json({ success: false, error: 'Failed to update request status.' });
      return;
    }

    updated.date = canonicalReqDate;
    updated.requested_date = canonicalReqDate;

    // Ensure doctor-clinic assignment is active
    await DoctorClinicAssignmentModel.assign(updated.doctor_id, updated.clinic_id, updated.specialty);

    // Generate active slots for the approved window
    const slotsResult = await doctorAvailabilityService.generateDoctorSlots(
      updated.doctor_id,
      canonicalReqDate,
      updated.clinic_id
    );

    const fullPayload = {
      ...updated,
      id: updated.id,
      clinic_id: updated.clinic_id,
      clinicId: updated.clinic_id,
      clinic_name: updated.clinic_name,
      clinicName: updated.clinic_name,
      doctor_id: updated.doctor_id,
      doctorId: updated.doctor_id,
      doctor_name: updated.doctor_name,
      doctorName: updated.doctor_name,
      specialty: updated.specialty,
      date: canonicalReqDate,
      requested_date: canonicalReqDate,
      start_time: updated.start_time,
      startTime: updated.start_time,
      end_time: updated.end_time,
      endTime: updated.end_time,
      status: 'APPROVED',
      notes: updated.notes,
      response_notes: updated.response_notes,
      updated_at: updated.updated_at,
    };

    // Socket.IO notifications: strictly target this doctor and clinic
    emitToDoctor(updated.doctor_id, 'availability_request:approved', fullPayload);
    emitToClinic(updated.clinic_id, 'availability_request:approved', fullPayload);

    // General calendar / slot availability broadcasts for patient app
    emitBroadcast('doctor:availability_updated', {
      requestId: updated.id,
      request_id: updated.id,
      doctor_id: updated.doctor_id,
      doctorId: updated.doctor_id,
      clinic_id: updated.clinic_id,
      clinicId: updated.clinic_id,
      status: 'AVAILABLE',
      date: canonicalReqDate,
      startTime: updated.start_time,
      endTime: updated.end_time,
    });
    emitBroadcast('clinic:schedule_updated', {
      requestId: updated.id,
      request_id: updated.id,
      clinic_id: updated.clinic_id,
      clinicId: updated.clinic_id,
      doctor_id: updated.doctor_id,
      doctorId: updated.doctor_id,
      date: canonicalReqDate,
      startTime: updated.start_time,
      endTime: updated.end_time,
      status: 'AVAILABLE',
    });
    emitBroadcast('appointment:slot_activated', {
      requestId: updated.id,
      request_id: updated.id,
      clinic_id: updated.clinic_id,
      clinicId: updated.clinic_id,
      doctor_id: updated.doctor_id,
      doctorId: updated.doctor_id,
      date: canonicalReqDate,
      startTime: updated.start_time,
      endTime: updated.end_time,
      status: 'AVAILABLE',
      slots: slotsResult.slots,
    });

    res.status(200).json({
      success: true,
      message: 'Doctor availability approved and schedule activated.',
      request: fullPayload,
      slots: slotsResult.slots,
    });
  } catch (err: any) {
    console.error('Error approving availability request:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to approve request.' });
  }
});

// POST /api/availability/requests/:id/reject (Doctor rejects availability)
availabilityRouter.post('/requests/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await AvailabilityRequestModel.getById(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, error: 'Availability request not found.' });
      return;
    }

    // Authenticated doctor verification & ownership enforcement
    const authDoctorId = getAuthenticatedDoctorId(req);
    if (!authDoctorId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Doctor authentication required to reject availability requests.',
      });
      return;
    }

    const canonicalReqDoc = resolveCanonicalDoctorId(request.doctor_id);
    if (authDoctorId !== canonicalReqDoc) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You cannot reject availability requests belonging to another doctor.',
      });
      return;
    }

    const canonicalReqDate = timeService.normalizeDateString(request.date || request.requested_date);
    const { reason, notes } = req.body || {};
    const updated = await AvailabilityRequestModel.updateStatus(request.id, 'REJECTED', reason || notes);
    if (!updated) {
      res.status(500).json({ success: false, error: 'Failed to update request status.' });
      return;
    }

    updated.date = canonicalReqDate;
    updated.requested_date = canonicalReqDate;

    const fullPayload = {
      ...updated,
      id: updated.id,
      clinic_id: updated.clinic_id,
      clinicId: updated.clinic_id,
      clinic_name: updated.clinic_name,
      clinicName: updated.clinic_name,
      doctor_id: updated.doctor_id,
      doctorId: updated.doctor_id,
      doctor_name: updated.doctor_name,
      doctorName: updated.doctor_name,
      specialty: updated.specialty,
      date: canonicalReqDate,
      requested_date: canonicalReqDate,
      start_time: updated.start_time,
      startTime: updated.start_time,
      end_time: updated.end_time,
      endTime: updated.end_time,
      status: 'REJECTED',
      notes: updated.notes,
      response_notes: updated.response_notes,
      updated_at: updated.updated_at,
    };

    // Socket.IO notifications: strictly target this doctor and clinic
    emitToDoctor(updated.doctor_id, 'availability_request:rejected', fullPayload);
    emitToClinic(updated.clinic_id, 'availability_request:rejected', fullPayload);

    emitBroadcast('doctor:availability_updated', {
      requestId: updated.id,
      request_id: updated.id,
      doctor_id: updated.doctor_id,
      doctorId: updated.doctor_id,
      clinic_id: updated.clinic_id,
      clinicId: updated.clinic_id,
      status: 'UNAVAILABLE',
      date: canonicalReqDate,
      startTime: updated.start_time,
      endTime: updated.end_time,
    });
    emitBroadcast('appointment:slot_activated', {
      requestId: updated.id,
      request_id: updated.id,
      clinic_id: updated.clinic_id,
      clinicId: updated.clinic_id,
      doctor_id: updated.doctor_id,
      doctorId: updated.doctor_id,
      date: canonicalReqDate,
      startTime: updated.start_time,
      endTime: updated.end_time,
      status: 'UNAVAILABLE',
      slots: { morning: [], afternoon: [], evening: [] },
    });

    res.status(200).json({
      success: true,
      message: 'Doctor availability request rejected.',
      request: fullPayload,
    });
  } catch (err: any) {
    console.error('Error rejecting availability request:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to reject request.' });
  }
});

// GET /api/availability/doctors/:doctorId (or /api/doctors/:doctorId/availability)
availabilityRouter.get('/doctors/:doctorId', async (req: Request, res: Response): Promise<void> => {
  try {
    const doctorId = resolveCanonicalDoctorId(req.params.doctorId);
    const doctor = await DoctorModel.getById(doctorId);
    if (!doctor) {
      res.status(404).json({ success: false, error: 'Doctor not found.' });
      return;
    }

    const assignments = await DoctorClinicAssignmentModel.getByDoctorId(doctorId);
    const requests = await AvailabilityRequestModel.getRequests({ doctorId });

    res.status(200).json({
      success: true,
      doctorId,
      doctorName: doctor.name,
      assignments,
      availabilityRequests: requests,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor availability.' });
  }
});

// GET /api/availability/clinics/:clinicId/schedule
availabilityRouter.get('/clinics/:clinicId/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicId = resolveCanonicalClinicId(req.params.clinicId);
    const clinic = await ClinicModel.getById(clinicId);
    if (!clinic) {
      res.status(404).json({ success: false, error: 'Clinic not found.' });
      return;
    }

    const doctors = await DoctorModel.getByClinic(clinicId);
    const requests = await AvailabilityRequestModel.getRequests({ clinicId });
    const approvedRequests = requests.filter((r) => r.status === 'APPROVED');

    const date = (req.query.date as string) || timeService.getTodayDateString();
    const schedules = [];

    for (const doc of doctors) {
      const slots = await doctorAvailabilityService.generateDoctorSlots(doc.id, date, clinicId);
      schedules.push({
        doctorId: doc.id,
        doctorName: doc.name,
        specialization: doc.specialization,
        availableSlotsCount: slots.availableSlotsCount,
        slots: slots.slots,
      });
    }

    res.status(200).json({
      success: true,
      clinicId,
      clinicName: clinic.name,
      date,
      doctorsCount: doctors.length,
      approvedRequests,
      schedules,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch clinic schedule.' });
  }
});

// GET /api/availability/clinics/:clinicId/slots
availabilityRouter.get('/clinics/:clinicId/slots', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicId = resolveCanonicalClinicId(req.params.clinicId);
    const date = (req.query.date as string) || timeService.getTodayDateString();
    const doctorId = req.query.doctorId ? resolveCanonicalDoctorId(req.query.doctorId as string) : undefined;

    const doctors = doctorId
      ? [(await DoctorModel.getById(doctorId))].filter(Boolean)
      : await DoctorModel.getByClinic(clinicId);

    const allSlots = [];
    for (const doc of doctors) {
      if (!doc) continue;
      const result = await doctorAvailabilityService.generateDoctorSlots(doc.id, date, clinicId);
      const flatSlots = [
        ...(result.slots?.morning || []),
        ...(result.slots?.afternoon || []),
        ...(result.slots?.evening || []),
      ];
      for (const slot of flatSlots) {
        allSlots.push({
          ...slot,
          clinicId,
          doctorId: doc.id,
          doctorName: doc.name,
        });
      }
    }

    res.status(200).json({
      success: true,
      clinicId,
      date,
      count: allSlots.length,
      slots: allSlots,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch clinic slots.' });
  }
});

// DELETE /api/availability/requests/:id
availabilityRouter.delete('/requests/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const { memoryDb, saveStateToFile } = await import('../database/db');
    if (memoryDb.availability_requests.has(id)) {
      memoryDb.availability_requests.delete(id);
      saveStateToFile();
      res.status(200).json({ success: true, message: 'Request deleted successfully.' });
      return;
    }
    res.status(404).json({ success: false, error: 'Request not found.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

