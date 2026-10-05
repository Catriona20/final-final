import { Router, Request, Response } from 'express';
import { AppointmentModel, PrescriptionModel, ClinicModel, DoctorModel, PatientModel, NotificationModel, WalkInModel, resolveCanonicalClinicId } from '../database/models';
import { queueManager } from '../services/queueManager';
import { notificationService } from '../services/notificationService';
import { emitToPatient, emitToAppointment, emitBroadcast, emitToClinic, emitToDoctor } from '../services/socketService';
import { timeService } from '../services/timeService';

export const simulationRouter = Router();

// GET /api/simulation/demo-clock
simulationRouter.get('/demo-clock', (req: Request, res: Response): void => {
  const clockState = timeService.getDemoClockState();
  const currentDate = timeService.getCurrentClinicDate();
  res.status(200).json({
    success: true,
    isSimulated: clockState.isSimulated,
    currentTimeIso: currentDate.toISOString(),
    currentDateString: timeService.getTodayDateString(),
    currentTimeString: timeService.getCurrentTimeString(),
    timezone: 'Asia/Kolkata',
    note: clockState.note,
  });
});

// POST /api/simulation/demo-clock
simulationRouter.post('/demo-clock', (req: Request, res: Response): void => {
  try {
    const { simulatedIsoString, note, reset = false } = req.body || {};

    if (reset || !simulatedIsoString) {
      const state = timeService.setDemoClock(null);
      emitBroadcast('clock:updated', { isSimulated: false, time: timeService.getCurrentTimeString() });
      res.status(200).json({
        success: true,
        message: 'Demo clock reset to real system time.',
        clockState: state,
        currentDateString: timeService.getTodayDateString(),
        currentTimeString: timeService.getCurrentTimeString(),
      });
      return;
    }

    const state = timeService.setDemoClock(simulatedIsoString, note || 'Development manual simulation clock');
    emitBroadcast('clock:updated', {
      isSimulated: true,
      simulatedIsoString: state.simulatedIsoString,
      time: timeService.getCurrentTimeString(),
      date: timeService.getTodayDateString(),
    });

    res.status(200).json({
      success: true,
      message: 'Demo clock updated successfully.',
      clockState: state,
      currentDateString: timeService.getTodayDateString(),
      currentTimeString: timeService.getCurrentTimeString(),
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Invalid simulated date.' });
  }
});

// POST /api/simulation/advance-queue
simulationRouter.post('/advance-queue', async (req: Request, res: Response): Promise<void> => {
  try {
    const { appointmentId = 'apt-2026-001' } = req.body;
    const updated = await queueManager.advanceQueue(appointmentId);

    if (!updated) {
      res.status(404).json({ success: false, error: 'Appointment not found.' });
      return;
    }

    res.status(200).json({ success: true, appointment: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to advance queue.' });
  }
});

// POST /api/simulation/delay-doctor
simulationRouter.post('/delay-doctor', async (req: Request, res: Response): Promise<void> => {
  try {
    const { doctorId = 'd1', delayMinutes = 20 } = req.body;
    await queueManager.reportDoctorDelay(doctorId, delayMinutes);
    res.status(200).json({ success: true, message: `Doctor delay of ${delayMinutes} minutes broadcasted.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to report delay.' });
  }
});

// POST /api/simulation/start-consultation
simulationRouter.post('/start-consultation', async (req: Request, res: Response): Promise<void> => {
  try {
    const { appointmentId = 'apt-2026-001' } = req.body;
    const cleanId = appointmentId ? appointmentId.replace(/^q-w-/, '').replace(/^q-/, '') : 'apt-2026-001';

    const { memoryDb } = await import('../database/db');
    const { resolveCanonicalClinicId } = await import('../database/models');
    const walkin = memoryDb.walk_ins.get(cleanId) || memoryDb.walk_ins.get(appointmentId);

    if (walkin) {
      walkin.status = 'IN_CONSULTATION';
      await WalkInModel.updateStatus(walkin.id, 'IN_CONSULTATION');

      if (walkin.doctor_id) {
        await DoctorModel.update(walkin.doctor_id, { status: 'BUSY' });
      }

      const startPayload = {
        queueId: `q-w-${walkin.id}`,
        appointmentId: walkin.id,
        walkInId: walkin.id,
        status: 'IN_CONSULTATION',
        clinicId: walkin.clinic_id,
        doctorId: walkin.doctor_id,
      };

      emitBroadcast('queue:updated', startPayload);
      if (walkin.clinic_id) {
        const canonical = resolveCanonicalClinicId(walkin.clinic_id);
        emitToClinic(canonical, 'queue:updated', startPayload);
        emitToClinic(canonical, 'appointment:status', startPayload);
      }
      if (walkin.doctor_id) {
        emitToDoctor(walkin.doctor_id, 'queue:updated', startPayload);
        emitToDoctor(walkin.doctor_id, 'consultation:started', {
          appointmentId: walkin.id,
          patientName: walkin.patient_name,
        });
      }

      res.status(200).json({
        success: true,
        appointment: {
          id: walkin.id,
          patient_id: walkin.patient_id || `pat-${walkin.id}`,
          patient_name: walkin.patient_name,
          status: 'In Consultation',
          doctor_id: walkin.doctor_id,
          doctor_name: walkin.preferred_doctor,
        },
      });
      return;
    }

    const updated = await AppointmentModel.update(cleanId, {
      status: 'In Consultation',
      patients_ahead: 0,
      estimated_wait: 'In Progress',
    });

    if (!updated) {
      res.status(404).json({ success: false, error: 'Appointment not found.' });
      return;
    }

    if (updated.doctor_id) {
      await DoctorModel.update(updated.doctor_id, { status: 'BUSY' });
      emitToDoctor(updated.doctor_id, 'consultation:started', {
        appointmentId: updated.id,
        patientName: updated.patient_name,
      });
      emitToDoctor(updated.doctor_id, 'queue:updated', {
        appointmentId: updated.id,
        status: 'IN_CONSULTATION',
        patientName: updated.patient_name,
      });
    }

    if (updated.clinic_id) {
      const canonicalClinic = resolveCanonicalClinicId(updated.clinic_id);
      emitToClinic(canonicalClinic, 'queue:updated', {
        appointmentId: updated.id,
        status: 'IN_CONSULTATION',
        patientName: updated.patient_name,
        doctorId: updated.doctor_id,
      });
      emitToClinic(canonicalClinic, 'appointment:status', {
        appointmentId: updated.id,
        status: 'In Consultation',
      });
      emitToClinic(canonicalClinic, 'doctor:availability_updated', {
        doctor_id: updated.doctor_id,
        clinic_id: canonicalClinic,
        status: 'BUSY',
      });
    }

    emitBroadcast('queue:updated', {
      appointmentId: updated.id,
      status: 'IN_CONSULTATION',
      patientName: updated.patient_name,
      doctorId: updated.doctor_id,
    });
    emitBroadcast('doctor:availability_updated', {
      doctor_id: updated.doctor_id,
      clinic_id: updated.clinic_id,
      status: 'BUSY',
    });

    emitToPatient(updated.patient_id, 'appointment:status', {
      appointmentId: updated.id,
      status: 'In Consultation',
      estimatedWait: 'In Progress',
    });
    emitToAppointment(updated.id, 'appointment:status', {
      appointmentId: updated.id,
      status: 'In Consultation',
      estimatedWait: 'In Progress',
    });

    await notificationService.sendNotification({
      patientId: updated.patient_id,
      title: 'Consultation Started 🩺',
      message: `${updated.doctor_name} has started your consultation session.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: updated.id },
    });

    res.status(200).json({ success: true, appointment: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to start consultation.' });
  }
});

// POST /api/simulation/complete-consultation
simulationRouter.post('/complete-consultation', async (req: Request, res: Response): Promise<void> => {
  try {
    const { appointmentId = 'apt-2026-001', medicines, diagnosis, clinicalNotes } = req.body;
    const targetApt = await AppointmentModel.getById(appointmentId);

    if (!targetApt) {
      res.status(404).json({ success: false, error: 'Appointment not found.' });
      return;
    }

    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // 1. Create digital prescription
    const defaultMedicines = medicines || [
      {
        name: 'Amoxicillin 500mg',
        dosage: '1 Capsule',
        frequency: 'Three times daily (After meals)',
        duration: '5 days',
        instructions: 'Complete full 5-day course',
      },
      {
        name: 'Paracetamol 650mg',
        dosage: '1 Tablet',
        frequency: 'As needed for fever / pain',
        duration: '3 days',
        instructions: 'Maximum 3 tablets daily',
      },
      {
        name: 'Cetirizine 10mg',
        dosage: '1 Tablet',
        frequency: 'Once daily at bedtime',
        duration: '7 days',
        instructions: 'Take after dinner',
      },
    ];

    const prescription = await PrescriptionModel.create({
      id: `rx-${Date.now()}`,
      appointment_id: appointmentId,
      patient_id: targetApt.patient_id,
      doctor_id: targetApt.doctor_id,
      doctor_name: targetApt.doctor_name,
      doctor_specialization: targetApt.doctor_specialization,
      doctor_registration_number: 'TN-MED-44281-2012',
      clinic_id: targetApt.clinic_id,
      clinic_name: targetApt.clinic_name,
      clinic_address: targetApt.clinic_address,
      date: todayStr,
      diagnosis: diagnosis || targetApt.reason || 'Clinical Consultation',
      clinical_notes: clinicalNotes || 'Follow prescribed course. Rest well and maintain adequate hydration.',
      follow_up_date: 'In 2 weeks',
      medicines: defaultMedicines,
    });

    // 2. Mark appointment completed
    const updatedApt = await AppointmentModel.update(appointmentId, {
      status: 'Completed',
      appointmentStatus: 'COMPLETED',
      patients_ahead: 0,
      queue_position: 0,
      estimated_wait: 'Completed',
      prescription_available: true,
      consultationCompletedAt: new Date().toISOString(),
    });

    const completionPayload = {
      appointmentId,
      queueId: `q-${appointmentId}`,
      patientId: targetApt.patient_id,
      patientName: targetApt.patient_name,
      status: 'Completed',
      appointmentStatus: 'COMPLETED',
      clinicId: targetApt.clinic_id,
      doctorId: targetApt.doctor_id,
      patientsAhead: 0,
      queuePosition: 0,
      estimatedWait: 'Completed',
      prescriptionAvailable: true,
      prescription,
    };

    // 3. Emit real-time socket events
    emitToPatient(targetApt.patient_id, 'appointment:status', completionPayload);
    emitToPatient(targetApt.patient_id, 'appointment:updated', completionPayload);
    emitToPatient(targetApt.patient_id, 'queue:updated', completionPayload);
    emitToPatient(targetApt.patient_id, 'consultation:completed', completionPayload);

    emitToAppointment(appointmentId, 'appointment:status', completionPayload);
    emitToAppointment(appointmentId, 'appointment:updated', completionPayload);
    emitToAppointment(appointmentId, 'queue:updated', completionPayload);
    emitToAppointment(appointmentId, 'consultation:completed', completionPayload);

    if (targetApt.clinic_id) {
      emitToClinic(targetApt.clinic_id, 'queue:updated', completionPayload);
      emitToClinic(targetApt.clinic_id, 'appointment:status', completionPayload);
      emitToClinic(targetApt.clinic_id, 'appointment:updated', completionPayload);
      emitToClinic(targetApt.clinic_id, 'consultation:completed', completionPayload);
    }

    if (targetApt.doctor_id) {
      emitToDoctor(targetApt.doctor_id, 'queue:updated', completionPayload);
      emitToDoctor(targetApt.doctor_id, 'appointment:status', completionPayload);
      emitToDoctor(targetApt.doctor_id, 'appointment:updated', completionPayload);
      emitToDoctor(targetApt.doctor_id, 'consultation:completed', completionPayload);
      await DoctorModel.update(targetApt.doctor_id, { status: 'AVAILABLE' });
    }

    emitBroadcast('appointment:status', completionPayload);
    emitBroadcast('appointment:updated', completionPayload);
    emitBroadcast('queue:updated', completionPayload);
    emitBroadcast('queue:completed', completionPayload);
    emitBroadcast('consultation:completed', completionPayload);

    // 4. Send notification
    await notificationService.sendNotification({
      patientId: targetApt.patient_id,
      title: 'Prescription Ready 📄',
      message: `${targetApt.doctor_name} has finalized your consultation and issued your digital prescription.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId },
    });

    res.status(200).json({ success: true, appointment: updatedApt, prescription });
  } catch (err: any) {
    console.error('Complete consultation error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete consultation.' });
  }
});

// POST /api/simulation/offer-earlier-slot
simulationRouter.post('/offer-earlier-slot', async (req: Request, res: Response): Promise<void> => {
  try {
    const { appointmentId = 'apt-2026-001', newTime = '08:30 AM', timeDifference = '1.5 hours earlier' } = req.body;
    const targetApt = await AppointmentModel.getById(appointmentId);

    if (!targetApt) {
      res.status(404).json({ success: false, error: 'Appointment not found.' });
      return;
    }

    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const offer = {
      newDate: todayStr,
      newTime,
      timeDifference,
      estimatedWait: '3 min',
    };

    await AppointmentModel.update(appointmentId, { earlier_slot_offered: offer });

    emitToPatient(targetApt.patient_id, 'slot:earlier_available', {
      appointmentId,
      ...offer,
    });

    await notificationService.sendNotification({
      patientId: targetApt.patient_id,
      title: 'Earlier Appointment Slot Available ⚡',
      message: `An earlier slot opened with ${targetApt.doctor_name} today at ${newTime} (${timeDifference}). Tap to accept or keep original time.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId },
    });

    res.status(200).json({ success: true, offer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to offer earlier slot.' });
  }
});

// POST /api/simulation/seed-demo (Create Deterministic Live Demo Dataset)
simulationRouter.post('/seed-demo', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { seedDatabase } = await import('../database/seed');
    const { memoryDb } = await import('../database/db');
    await seedDatabase();

    const clinicsList = Array.from(memoryDb.clinics.values());
    const doctorsList = Array.from(memoryDb.doctors.values());
    const patientsList = Array.from(memoryDb.patients.values());
    const appointmentsList = Array.from(memoryDb.appointments.values());

    res.status(200).json({
      success: true,
      demo: true,
      clinics: memoryDb.clinics.size,
      doctors: memoryDb.doctors.size,
      patients: memoryDb.patients.size,
      appointments: memoryDb.appointments.size,
      verification_pending: doctorsList.filter((d: any) => !d.is_verified || d.verification_status === 'UNDER_REVIEW').length,
      message: 'MedLink deterministic 20-user demo dataset ready',
      demoEntities: {
        clinics: clinicsList,
        doctors: doctorsList,
        patients: patientsList,
        appointments: appointmentsList,
      },
    });
  } catch (err: any) {
    console.error('Error seeding demo data:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to seed demo data.' });
  }
});

// POST /api/simulation/reset-demo & /api/simulation/demo-reset
const handleResetDemo = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { seedDatabase } = await import('../database/seed');
    const { memoryDb } = await import('../database/db');
    const { clearActiveBookingLocks, getActiveBookingLocksCount } = await import('./appointment.routes');
    const { emitBroadcast } = await import('../services/socketService');

    // 1. Release in-flight slot booking locks
    clearActiveBookingLocks();

    // 2. Reset simulated demo clock to real-time
    timeService.setDemoClock(null);

    // 3. Re-seed clean deterministic database (clearing queues, walk-ins, notifications, active consultations)
    await seedDatabase();

    // 4. Broadcast real-time websocket reset events to all connected clients
    emitBroadcast('queue:updated', { clinicId: 'all', message: 'Demo state reset' });
    emitBroadcast('appointment:status', { message: 'Demo state reset' });
    emitBroadcast('appointment:updated', { message: 'Demo state reset' });
    emitBroadcast('clock:updated', { demoClockActive: false, currentTime: new Date().toISOString() });
    emitBroadcast('doctor:availability_changed', { clinicId: 'all' });
    emitBroadcast('doctor:availability_updated', { clinicId: 'all', doctorId: 'all', status: 'UNAVAILABLE' });
    emitBroadcast('clinic:schedule_updated', { clinicId: 'all' });
    emitBroadcast('appointment:slot_activated', {
      clinicId: 'all',
      doctorId: 'all',
      slots: { morning: [], afternoon: [], evening: [] },
    });
    emitBroadcast('availability_request:cleared', { all: true });
    emitBroadcast('notification:cleared', { all: true });
    emitBroadcast('demo:reset', { timestamp: Date.now() });

    // Gather reset verification statistics
    const activeQueuesCount = memoryDb.appointment_queue.size;
    const walkInsCount = memoryDb.walk_ins.size;
    const notificationsCount = memoryDb.notifications.size;
    const availabilityRequestsCount = memoryDb.availability_requests.size;
    const appointmentsCount = memoryDb.appointments.size;
    const slotLocksCount = getActiveBookingLocksCount();
    const activeConsultations = Array.from(memoryDb.appointments.values()).filter(
      (a: any) => ['In Consultation', 'IN_CONSULTATION'].includes(a.status || a.appointmentStatus)
    ).length;

    res.status(200).json({
      success: true,
      message: 'MedLink demo state reset to clean baseline successfully.',
      state: {
        patients: memoryDb.patients.size,
        clinics: memoryDb.clinics.size,
        doctors: memoryDb.doctors.size,
        assistants: memoryDb.assistants?.size || 0,
        appointments: appointmentsCount,
        availability_requests: availabilityRequestsCount,
        active_queues: activeQueuesCount,
        active_consultations: activeConsultations,
        walk_ins: walkInsCount,
        notifications: notificationsCount,
        slot_locks: slotLocksCount,
        demo_clock_active: false,
      },
    });
  } catch (err: any) {
    console.error('Error resetting demo state:', err);
    res.status(500).json({ success: false, error: 'Failed to reset demo data.' });
  }
};

simulationRouter.post('/reset-demo', handleResetDemo);
simulationRouter.post('/demo-reset', handleResetDemo);

// GET /api/simulation/demo-counts
simulationRouter.get('/demo-counts', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { memoryDb } = await import('../database/db');
    const doctorEmails = Array.from(memoryDb.doctors.values()).map((d: any) => d.email).filter(Boolean);
    const patientEmails = Array.from(memoryDb.patients.values())
      .filter((p: any) => p.role !== 'CLINIC_ADMIN')
      .map((p: any) => p.email)
      .filter(Boolean);
    const assistantEmails = Array.from(memoryDb.assistants?.values() || [])
      .map((a: any) => a.email)
      .filter(Boolean);

    res.status(200).json({
      success: true,
      counts: {
        clinics: memoryDb.clinics.size,
        doctors: memoryDb.doctors.size,
        patients: patientEmails.length,
        assistants: assistantEmails.length,
      },
      emails: {
        doctors: doctorEmails,
        patients: patientEmails,
        assistants: assistantEmails,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/simulation/sync-additive-seed
simulationRouter.post('/sync-additive-seed', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { seedMoonDentalVillivakkam } = await import('../database/seedMoonDental');
    const result = await seedMoonDentalVillivakkam();
    res.status(200).json({
      message: 'Additive seed for Moon Dental Clinic Villivakkam synced successfully.',
      ...result,
    });
  } catch (err: any) {
    console.error('Error syncing additive seed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

