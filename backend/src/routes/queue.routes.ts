import { Router, Request, Response } from 'express';
import { queueManager } from '../services/queueManager';
import { AppointmentModel, WalkInModel, DoctorModel } from '../database/models';
import { emitBroadcast } from '../services/socketService';
import { loadBalancerRouter } from './loadBalancer.routes';

export const queueRouter = Router();

// Mount Load Balancer Subroutes
queueRouter.use('/load-balance', loadBalancerRouter);

// GET /api/queue
queueRouter.get('/', (req: Request, res: Response): void => {
  try {
    const clinicId = req.query.clinicId as string;
    const doctorId = req.query.doctorId as string;
    const date = (req.query.date as string) || (req.query.appointmentDate as string);
    const queue = queueManager.getQueue(clinicId, doctorId, date);

    res.status(200).json({
      success: true,
      count: queue.length,
      queue,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch queue list.' });
  }
});

// GET /api/queue/clinic/:clinicId
queueRouter.get('/clinic/:clinicId', (req: Request, res: Response): void => {
  try {
    const clinicId = req.params.clinicId;
    const date = (req.query.date as string) || (req.query.appointmentDate as string);
    const queue = queueManager.getQueue(clinicId, undefined, date);

    res.status(200).json({
      success: true,
      count: queue.length,
      queue,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch clinic queue.' });
  }
});

// GET /api/queue/doctor/:doctorId
queueRouter.get('/doctor/:doctorId', (req: Request, res: Response): void => {
  try {
    const doctorId = req.params.doctorId;
    const date = (req.query.date as string) || (req.query.appointmentDate as string);
    const queue = queueManager.getQueue(undefined, doctorId, date);

    res.status(200).json({
      success: true,
      count: queue.length,
      queue,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch doctor queue.' });
  }
});

// POST /api/queue/call-next
queueRouter.post('/call-next', async (req: Request, res: Response): Promise<void> => {
  try {
    const { doctorId, clinicId } = req.body || {};
    const result = await queueManager.callNextPatient(doctorId, clinicId);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to call next patient.' });
  }
});

// PATCH & PUT /api/queue/:id/status
const handleQueueStatusUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    const queueId = req.params.id;

    let doctorId: string | undefined;
    let clinicId: string | undefined;

    const cleanId = queueId.startsWith('q-w-')
      ? queueId.replace('q-w-', '')
      : queueId.startsWith('q-')
      ? queueId.replace('q-', '')
      : queueId;

    // Check WalkIn first
    const walkIn = (await WalkInModel.getById(cleanId)) || (await WalkInModel.getById(queueId));
    if (walkIn) {
      doctorId = walkIn.doctor_id;
      clinicId = walkIn.clinic_id;
      await WalkInModel.updateStatus(walkIn.id, status);
    } else {
      const apt = (await AppointmentModel.getById(cleanId)) || (await AppointmentModel.getById(queueId));
      if (apt) {
        doctorId = apt.doctor_id;
        clinicId = apt.clinic_id;
        const aptStatus =
          status === 'IN_CONSULTATION'
            ? 'In Consultation'
            : status === 'COMPLETED'
            ? 'Completed'
            : 'Waiting';
        await AppointmentModel.updateStatus(apt.id, aptStatus as any);
      }
    }

    if (doctorId) {
      if (status === 'IN_CONSULTATION') {
        await DoctorModel.update(doctorId, { status: 'BUSY' });
      } else if (status === 'COMPLETED') {
        const remainingQueue = queueManager.getQueue(clinicId, doctorId);
        const hasOtherConsult = remainingQueue.some(
          (q) => ['IN_CONSULTATION', 'In Consultation'].includes(q.status) && q.id !== queueId
        );
        if (!hasOtherConsult) {
          await DoctorModel.update(doctorId, { status: 'AVAILABLE' });
        }
      }
      emitBroadcast('doctor:availability_updated', { doctorId, status: status === 'IN_CONSULTATION' ? 'BUSY' : 'AVAILABLE' });
    }

    emitBroadcast('queue:updated', { queueId, status, doctorId, clinicId });
    res.status(200).json({ success: true, queueId, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update queue item status.' });
  }
};
queueRouter.patch('/:id/status', handleQueueStatusUpdate);
queueRouter.put('/:id/status', handleQueueStatusUpdate);

// POST /api/queue/delay
queueRouter.post('/delay', async (req: Request, res: Response): Promise<void> => {
  try {
    const { doctorId, delayMinutes = 15 } = req.body;
    if (!doctorId) {
      res.status(400).json({ success: false, error: 'Doctor ID is required to report delay.' });
      return;
    }

    await queueManager.reportDoctorDelay(doctorId, parseInt(delayMinutes, 10));
    res.status(200).json({ success: true, message: `Doctor delay of ${delayMinutes} mins recorded.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to record doctor delay.' });
  }
});
