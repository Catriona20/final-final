import { Router, Request, Response } from 'express';
import { WalkInModel, DoctorModel, resolveCanonicalClinicId } from '../database/models';
import { queueManager } from '../services/queueManager';
import { emitBroadcast, emitToClinic, emitToDoctor } from '../services/socketService';
import { memoryDb } from '../database/db';

export const walkInRouter = Router();

// GET /api/walk-ins
walkInRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const clinicId = req.query.clinicId as string;
    const walkIns = await WalkInModel.getAll(clinicId);
    res.status(200).json({
      success: true,
      count: walkIns.length,
      walkIns,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch walk-in registrations.' });
  }
});

// POST /api/walk-ins
walkInRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let {
      patientName,
      phone,
      reason,
      preferredDoctor,
      priority = 'NORMAL',
      clinicId,
      doctorId,
    } = req.body;

    if (!patientName || !phone || !reason || (!preferredDoctor && !doctorId)) {
      res.status(400).json({
        success: false,
        error: 'Patient name, mobile number, chief complaint, and attending doctor are required.',
      });
      return;
    }

    // 1. Authoritative resolution of Doctor and Clinic
    let resolvedDoctor: any = null;

    if (doctorId) {
      resolvedDoctor = memoryDb.doctors.get(doctorId);
    }

    if (!resolvedDoctor && preferredDoctor) {
      const cleanPref = preferredDoctor.toLowerCase().trim();
      if (memoryDb.doctors.has(preferredDoctor)) {
        resolvedDoctor = memoryDb.doctors.get(preferredDoctor);
      } else {
        for (const doc of memoryDb.doctors.values()) {
          const docNameClean = doc.name.toLowerCase().trim();
          if (
            docNameClean === cleanPref ||
            cleanPref.includes(docNameClean) ||
            docNameClean.includes(cleanPref) ||
            (doc.id && cleanPref.includes(doc.id.toLowerCase()))
          ) {
            resolvedDoctor = doc;
            break;
          }
        }
      }
    }

    // If still not resolved, look for matching doctor by clinic
    if (!resolvedDoctor) {
      const targetClinic = clinicId ? resolveCanonicalClinicId(clinicId) : 'c-demo-moon-01';
      for (const doc of memoryDb.doctors.values()) {
        if (resolveCanonicalClinicId(doc.clinic_id) === targetClinic) {
          resolvedDoctor = doc;
          break;
        }
      }
    }

    const resolvedDoctorId = resolvedDoctor ? resolvedDoctor.id : (doctorId || 'doc-demo-arun-01');
    const resolvedDoctorName = resolvedDoctor ? resolvedDoctor.name : (preferredDoctor || 'Dr. Arun Kumar');
    const canonicalClinicId = resolveCanonicalClinicId(clinicId || resolvedDoctor?.clinic_id || 'c-demo-moon-01');

    const registeredAt = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const normPriority = (priority || 'NORMAL').toUpperCase();
    const queueNumber = normPriority === 'EMERGENCY'
      ? `E-W${Math.floor(100 + Math.random() * 900)}`
      : normPriority === 'URGENT'
      ? `U-W${Math.floor(100 + Math.random() * 900)}`
      : `W${String(Math.floor(10 + Math.random() * 90)).padStart(3, '0')}`;

    let resolvedPatientId = req.body.patientId || req.body.patient_id;
    if (!resolvedPatientId && phone) {
      const cleanPhone = phone.trim().replace(/\D/g, '');
      for (const p of memoryDb.patients.values()) {
        if (p.phone && p.phone.replace(/\D/g, '').includes(cleanPhone)) {
          resolvedPatientId = p.id;
          break;
        }
      }
    }

    const newWalkIn = await WalkInModel.create({
      patient_id: resolvedPatientId,
      patient_name: patientName.trim(),
      phone: phone.trim(),
      reason: reason.trim(),
      preferred_doctor: resolvedDoctorName,
      priority: normPriority as any,
      status: 'WAITING',
      registered_at: registeredAt,
      clinic_id: canonicalClinicId,
      doctor_id: resolvedDoctorId,
      token_number: queueNumber,
    });

    // Send targeted in-app notifications
    const { notificationService } = await import('../services/notificationService');
    if (newWalkIn.priority === 'EMERGENCY') {
      await notificationService.notifyEmergencyIntake(newWalkIn, queueNumber, canonicalClinicId, resolvedDoctorId);
    } else {
      await notificationService.notifyWalkIn(newWalkIn, queueNumber, canonicalClinicId, resolvedDoctorId);
    }

    // Broadcast live queue update across targeted rooms and globally
    const socketPayload = {
      walkInId: newWalkIn.id,
      patientName: newWalkIn.patient_name,
      queueNumber,
      priority: newWalkIn.priority,
      status: 'WAITING',
      clinicId: canonicalClinicId,
      doctorId: resolvedDoctorId,
      doctorName: resolvedDoctorName,
    };

    if (canonicalClinicId) {
      emitToClinic(canonicalClinicId, 'queue:updated', socketPayload);
    }
    if (resolvedDoctorId) {
      emitToDoctor(resolvedDoctorId, 'queue:updated', socketPayload);
    }
    emitBroadcast('queue:updated', socketPayload);

    res.status(201).json({
      success: true,
      walkIn: newWalkIn,
      queueNumber,
      message: `${newWalkIn.patient_name} added to OPD queue with ${newWalkIn.priority} priority.`,
    });
  } catch (err: any) {
    console.error('Walk-in intake error:', err);
    res.status(500).json({ success: false, error: 'Failed to register walk-in patient.' });
  }
});

// PATCH & PUT /api/walk-ins/:id/status
const handleWalkInStatusUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    const updated = await WalkInModel.updateStatus(req.params.id, status);

    if (!updated) {
      res.status(404).json({ success: false, error: 'Walk-in record not found.' });
      return;
    }

    emitBroadcast('queue:updated', { walkInId: updated.id, status });
    res.status(200).json({ success: true, walkIn: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update walk-in status.' });
  }
};
walkInRouter.patch('/:id/status', handleWalkInStatusUpdate);
walkInRouter.put('/:id/status', handleWalkInStatusUpdate);
