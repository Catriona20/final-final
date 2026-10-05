import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { NotificationModel, NotificationEntity } from '../database/models';

export const notificationRouter = Router();

// GET /api/notifications
notificationRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let patientId = req.query.patientId as string;
    let doctorId = req.query.doctorId as string;
    const clinicId = req.query.clinicId as string;
    const category = req.query.category as string;

    // Resolve authenticated identity from Bearer token if not explicitly provided
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], config.jwtSecret) as any;
        if (decoded?.id) {
          if (decoded.role === 'DOCTOR' && !doctorId) {
            doctorId = decoded.id;
          } else if (decoded.role !== 'DOCTOR' && !patientId) {
            patientId = decoded.id;
          }
        }
      } catch (e) {
        // Ignore invalid token and use query params
      }
    }

    let notifications: NotificationEntity[] = [];

    if (doctorId) {
      notifications = await NotificationModel.getByDoctorId(doctorId);
    } else if (clinicId) {
      notifications = await NotificationModel.getByClinicId(clinicId);
    } else {
      const targetPatId = patientId || 'pat-101';
      notifications = await NotificationModel.getByPatientId(targetPatId);

      // Idempotently ensure active pending load-balance proposal has a delivered notification
      const { LoadBalanceProposalModel } = await import('../database/models');
      const { notificationService } = await import('../services/notificationService');
      const pendingProps = (await LoadBalanceProposalModel.getByPatientId(targetPatId)).filter(
        (p) => p.status === 'PENDING' && p.patient_consent === 'PENDING'
      );
      for (const p of pendingProps) {
        const hasExistingNotif = notifications.some(
          (n) => (n.action_data?.proposalId === p.id || (n as any).actionData?.proposalId === p.id)
        );
        if (!hasExistingNotif) {
          const newNotif = await notificationService.notifyPatientLoadBalanceOffer(p as any);
          if (newNotif) {
            notifications.unshift(newNotif);
          }
        }
      }
    }

    if (category && category !== 'All') {
      notifications = notifications.filter((n) => n.category === category);
    }

    const unreadCount = notifications.filter((n) => !n.read && !n.is_read).length;

    // Enrich proposal-related notifications with live proposal metadata
    const { LoadBalanceProposalModel } = await import('../database/models');
    const enrichedNotifications = await Promise.all(
      notifications.map(async (n) => {
        const act = { ...(n.action_data || (n as any).actionData || {}) };
        if (act.proposalId) {
          const prop = await LoadBalanceProposalModel.getById(act.proposalId);
          if (prop) {
            act.patientName = act.patientName || prop.patient_name;
            act.patientId = act.patientId || prop.patient_id;
            act.sourceDoctorName = act.sourceDoctorName || prop.source_doctor_name;
            act.currentDoctorName = act.currentDoctorName || prop.source_doctor_name;
            act.targetDoctorName = act.targetDoctorName || prop.target_doctor_name;
            act.proposedDoctorName = act.proposedDoctorName || prop.target_doctor_name;
            act.patientConsent = prop.patient_consent;
            act.doctorConsent = prop.doctor_consent;
            act.status = prop.status;
            act.reason = act.reason || 'doctor queue load balancing';
            return {
              ...n,
              action_data: act,
              actionData: act,
            };
          }
        }
        return n;
      })
    );

    res.status(200).json({
      success: true,
      notifications: enrichedNotifications,
      unreadCount,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
  }
});

// PUT /api/notifications/:id/read
notificationRouter.put('/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const success = await NotificationModel.markAsRead(req.params.id);
    res.status(200).json({ success, message: success ? 'Marked notification as read.' : 'Notification not found.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update notification.' });
  }
});

// PUT /api/notifications/read-all
notificationRouter.put('/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = (req.body.recipientId || req.body.patientId || req.body.doctorId || req.body.clinicId || req.query.patientId || 'pat-101') as string;
    const count = await NotificationModel.markAllAsRead(recipientId);
    res.status(200).json({ success: true, markedCount: count });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to mark all as read.' });
  }
});

// DELETE /api/notifications/clear
notificationRouter.delete('/clear', async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = (req.body.recipientId || req.body.patientId || req.body.doctorId || req.body.clinicId || req.query.patientId || 'pat-101') as string;
    const count = await NotificationModel.clearAll(recipientId);
    res.status(200).json({ success: true, clearedCount: count });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to clear notifications.' });
  }
});
