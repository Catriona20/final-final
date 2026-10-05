import { NotificationModel, NotificationEntity, AppointmentEntity, DoctorEntity, WalkInEntity, LoadBalanceProposalEntity } from '../database/models';
import { emitToPatient, emitToDoctor, emitToClinic, emitBroadcast } from './socketService';
import { twilioService } from './twilioService';
import { resendService } from './resendService';

export interface CreateNotificationParams {
  recipientId?: string;
  recipientType?: 'PATIENT' | 'DOCTOR' | 'CLINIC';
  patientId?: string;
  doctorId?: string;
  clinicId?: string;
  appointmentId?: string;
  queueId?: string;
  title: string;
  message: string;
  category?: 'Appointments' | 'Queue Updates' | 'Clinic Updates' | 'Reminders' | 'System' | 'Announcements' | 'Emergency' | 'Doctor Delays';
  type?: 'appointment' | 'system' | 'reminder' | 'announcement' | 'emergency' | 'delay' | 'verification' | 'prescription' | 'queue' | 'load_balance_proposal' | 'load_balance_offer' | 'load_balance_status';
  actionData?: any;
  phone?: string;
  email?: string;
}

export const notificationService = {
  /**
   * Core centralized provider-independent notification dispatcher.
   * Persists in DB store, broadcasts via Socket.IO, and optionally dispatches SMS/Email.
   */
  async sendNotification(params: CreateNotificationParams): Promise<NotificationEntity> {
    const recipientType = params.recipientType || (params.patientId ? 'PATIENT' : params.doctorId ? 'DOCTOR' : 'CLINIC');
    const recipientId = params.recipientId || params.patientId || params.doctorId || params.clinicId || 'system';

    // 1. Core: In-App Persistent Database Storage
    const notification = await NotificationModel.create({
      recipient_id: recipientId,
      recipient_type: recipientType,
      patient_id: params.patientId,
      doctor_id: params.doctorId,
      clinic_id: params.clinicId,
      appointment_id: params.appointmentId,
      queue_id: params.queueId,
      title: params.title,
      message: params.message,
      timestamp: 'Just now',
      read: false,
      is_read: false,
      category: params.category || 'Appointments',
      type: params.type || 'appointment',
      action_data: params.actionData || {},
    });

    // 2. Real-Time Socket.IO Targeting
    try {
      if (params.patientId) {
        emitToPatient(params.patientId, 'notification:new', notification);
      }
      if (params.doctorId) {
        emitToDoctor(params.doctorId, 'notification:new', notification);
      }
      if (params.clinicId) {
        emitToClinic(params.clinicId, 'notification:new', notification);
      }
    } catch (sockErr) {
      console.warn('Socket emission warning in notificationService:', sockErr);
    }

    // 3. Optional External Channels: SMS (Twilio) & Email (Resend)
    // Never fail the primary in-app notification if external credentials or networks fail
    if (params.phone) {
      try {
        await twilioService.sendBookingConfirmation(params.phone, {
          doctorName: params.actionData?.doctorName || 'Doctor',
          clinicName: params.actionData?.clinicName || 'Clinic',
          date: params.actionData?.date || 'Today',
          time: params.actionData?.time || 'Scheduled Time',
          bookingId: params.appointmentId || 'APT',
        });
      } catch (smsErr) {
        console.warn('Optional SMS delivery skipped/failed:', smsErr);
      }
    }

    if (params.email) {
      try {
        await resendService.sendBookingConfirmationEmail(params.email, {
          patientName: params.actionData?.patientName || 'Patient',
          doctorName: params.actionData?.doctorName || 'Doctor',
          department: params.actionData?.specialization || params.actionData?.department || 'Consultation',
          clinicName: params.actionData?.clinicName || 'Clinic',
          clinicAddress: params.actionData?.clinicAddress || 'Clinic Address',
          date: params.actionData?.date || 'Today',
          time: params.actionData?.time || 'Scheduled Time',
          reason: params.actionData?.reason || 'Clinical Consultation',
          tokenNumber: params.actionData?.tokenNumber || 'A001',
          bookingId: params.appointmentId || 'APT',
        });
      } catch (emailErr) {
        console.warn('Optional email delivery skipped/failed:', emailErr);
      }
    }

    return notification;
  },

  /**
   * Trigger: Appointment Booked
   */
  async notifyAppointmentBooked(apt: AppointmentEntity, patientEmail?: string, patientPhone?: string): Promise<void> {
    // Patient Notification
    await this.sendNotification({
      patientId: apt.patient_id,
      recipientType: 'PATIENT',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      doctorId: apt.doctor_id,
      title: 'Appointment Confirmed 📅',
      message: `Your appointment with ${apt.doctor_name} at ${apt.clinic_name} is confirmed for ${apt.date} at ${apt.time}. Token: ${apt.token_number || 'A001'}.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: {
        appointmentId: apt.id,
        doctorName: apt.doctor_name,
        clinicName: apt.clinic_name,
        date: apt.date,
        time: apt.time,
        tokenNumber: apt.token_number,
      },
      phone: patientPhone,
      email: patientEmail,
    });

    // Doctor Notification
    await this.sendNotification({
      doctorId: apt.doctor_id,
      recipientType: 'DOCTOR',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      title: 'New Appointment Booked 🩺',
      message: `${apt.patient_name || 'Patient'} scheduled a consultation for ${apt.date} at ${apt.time} (${apt.reason || 'General'}).`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id, patientName: apt.patient_name, time: apt.time },
    });

    // Clinic Assistant Notification
    await this.sendNotification({
      clinicId: apt.clinic_id,
      recipientType: 'CLINIC',
      appointmentId: apt.id,
      title: 'New Online Booking 🏥',
      message: `${apt.patient_name || 'Patient'} booked with ${apt.doctor_name} at ${apt.time}.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id, doctorName: apt.doctor_name, time: apt.time },
    });
  },

  /**
   * Trigger: Patient Check-In
   */
  async notifyPatientCheckIn(apt: AppointmentEntity): Promise<void> {
    // Patient
    await this.sendNotification({
      patientId: apt.patient_id,
      recipientType: 'PATIENT',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      title: 'Checked In Successfully 🎫',
      message: `You are checked in! Token: ${apt.token_number}. Position: #${apt.queue_position}. Estimated wait: ${apt.estimated_wait}.`,
      category: 'Queue Updates',
      type: 'queue',
      actionData: { appointmentId: apt.id, tokenNumber: apt.token_number, queuePosition: apt.queue_position },
    });

    // Doctor
    await this.sendNotification({
      doctorId: apt.doctor_id,
      recipientType: 'DOCTOR',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      title: 'Patient Checked In 👥',
      message: `${apt.patient_name} (Token ${apt.token_number}) checked in and is waiting in reception.`,
      category: 'Queue Updates',
      type: 'queue',
      actionData: { appointmentId: apt.id, tokenNumber: apt.token_number },
    });

    // Clinic Assistant
    await this.sendNotification({
      clinicId: apt.clinic_id,
      recipientType: 'CLINIC',
      appointmentId: apt.id,
      title: 'Patient Checked In 🏢',
      message: `Token ${apt.token_number} (${apt.patient_name}) entered waiting queue for ${apt.doctor_name}.`,
      category: 'Queue Updates',
      type: 'queue',
      actionData: { appointmentId: apt.id, tokenNumber: apt.token_number },
    });
  },

  /**
   * Trigger: Dynamic Queue Position Updates
   */
  async notifyQueuePositionUpdate(
    patientId: string,
    appointmentId: string,
    queuePosition: number,
    patientsAhead: number,
    estimatedWait: string,
    tokenNumber: string
  ): Promise<void> {
    let title = 'Queue Position Update 📊';
    let message = `You are currently #${queuePosition} in queue (${patientsAhead} ahead). Estimated wait: ${estimatedWait}.`;

    if (queuePosition === 1 || patientsAhead === 0) {
      title = "You're Next! 🔔";
      message = `Token ${tokenNumber} is now next! Please proceed to the consultation room.`;
    } else if (queuePosition === 2 || patientsAhead === 1) {
      title = 'Almost Your Turn ⏱️';
      message = `1 patient ahead. Please stay near the OPD waiting area.`;
    }

    await this.sendNotification({
      patientId,
      recipientType: 'PATIENT',
      appointmentId,
      title,
      message,
      category: 'Queue Updates',
      type: 'queue',
      actionData: { appointmentId, queuePosition, patientsAhead, estimatedWait, tokenNumber },
    });
  },

  /**
   * Trigger: Doctor Delay Advisory
   */
  async notifyDoctorDelay(
    doctorId: string,
    doctorName: string,
    clinicId: string,
    delayMinutes: number,
    affectedAppointments: AppointmentEntity[]
  ): Promise<void> {
    // Notify Clinic Assistant
    await this.sendNotification({
      clinicId,
      recipientType: 'CLINIC',
      doctorId,
      title: 'Doctor Delay Advisory ⏱️',
      message: `${doctorName} reported a delay of approximately ${delayMinutes} minutes. Downstream queue updated.`,
      category: 'Doctor Delays',
      type: 'delay',
      actionData: { doctorId, delayMinutes },
    });

    // Notify Doctor
    await this.sendNotification({
      doctorId,
      recipientType: 'DOCTOR',
      clinicId,
      title: 'Delay Advisory Broadcasted ⏱️',
      message: `Reported ${delayMinutes} mins delay. ${affectedAppointments.length} waiting patient(s) notified.`,
      category: 'Doctor Delays',
      type: 'delay',
      actionData: { delayMinutes },
    });

    // Notify each affected patient
    for (const apt of affectedAppointments) {
      await this.sendNotification({
        patientId: apt.patient_id,
        recipientType: 'PATIENT',
        appointmentId: apt.id,
        clinicId: apt.clinic_id,
        doctorId: apt.doctor_id,
        title: 'Doctor Delay Advisory ⏱️',
        message: `${doctorName} is running approximately ${delayMinutes} minutes behind schedule. Your estimated wait has been updated.`,
        category: 'Doctor Delays',
        type: 'delay',
        actionData: { appointmentId: apt.id, delayMinutes, estimatedWait: apt.estimated_wait },
      });
    }
  },

  /**
   * Trigger: Emergency Walk-In Intake
   */
  async notifyEmergencyIntake(walkIn: WalkInEntity, queueNumber: string, clinicId?: string, doctorId?: string): Promise<void> {
    // Clinic Assistant
    await this.sendNotification({
      clinicId: clinicId || 'c1',
      recipientType: 'CLINIC',
      title: 'Emergency Patient Intake 🚨',
      message: `Emergency patient ${walkIn.patient_name} admitted (Token ${queueNumber}). Preempted to Position #1 in queue.`,
      category: 'Emergency',
      type: 'emergency',
      actionData: { walkInId: walkIn.id, queueNumber, priority: 'EMERGENCY' },
    });

    // Doctor
    if (doctorId) {
      await this.sendNotification({
        doctorId,
        recipientType: 'DOCTOR',
        clinicId,
        title: 'Urgent: Emergency Patient Added 🚨',
        message: `High-priority emergency patient ${walkIn.patient_name} (Token ${queueNumber}) placed at front of your queue.`,
        category: 'Emergency',
        type: 'emergency',
        actionData: { walkInId: walkIn.id, queueNumber, priority: 'EMERGENCY' },
      });
    }
  },

  /**
   * Trigger: Normal Walk-In Intake
   */
  async notifyWalkIn(walkIn: WalkInEntity, queueNumber: string, clinicId?: string, doctorId?: string): Promise<void> {
    await this.sendNotification({
      clinicId: clinicId || 'c1',
      recipientType: 'CLINIC',
      title: 'Walk-In Registered 🚶',
      message: `${walkIn.patient_name} registered as walk-in (Token ${queueNumber}) for ${walkIn.preferred_doctor}.`,
      category: 'Queue Updates',
      type: 'queue',
      actionData: { walkInId: walkIn.id, queueNumber },
    });

    if (doctorId) {
      await this.sendNotification({
        doctorId,
        recipientType: 'DOCTOR',
        clinicId,
        title: 'Walk-in Patient Added 📋',
        message: `${walkIn.patient_name} added to OPD queue (${queueNumber}).`,
        category: 'Queue Updates',
        type: 'queue',
        actionData: { walkInId: walkIn.id, queueNumber },
      });
    }
  },

  /**
   * Trigger: Patient No-Show
   */
  async notifyNoShow(apt: AppointmentEntity): Promise<void> {
    await this.sendNotification({
      patientId: apt.patient_id,
      recipientType: 'PATIENT',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      title: 'Appointment Marked No-Show ⚠️',
      message: `Your appointment with ${apt.doctor_name} has been marked as No-Show. Please contact reception to reschedule.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id },
    });

    await this.sendNotification({
      clinicId: apt.clinic_id,
      recipientType: 'CLINIC',
      appointmentId: apt.id,
      title: 'Patient Marked No-Show 📋',
      message: `${apt.patient_name} (Token ${apt.token_number}) marked as No-Show. Queue re-calculated.`,
      category: 'Queue Updates',
      type: 'queue',
      actionData: { appointmentId: apt.id },
    });
  },

  /**
   * Trigger: Earlier Slot Available Offer
   */
  async notifyEarlierSlotAvailable(
    appointmentId: string,
    patientId: string,
    doctorName: string,
    newDate: string,
    newTime: string,
    timeDifference: string,
    clinicName?: string,
    currentTime?: string,
    clinicId?: string,
    doctorId?: string
  ): Promise<void> {
    await this.sendNotification({
      patientId,
      recipientType: 'PATIENT',
      appointmentId,
      clinicId,
      doctorId,
      title: 'Earlier Appointment Slot Available! ⚡',
      message: `An earlier slot opened with ${doctorName} at ${newTime} (${timeDifference}). Tap to accept or keep current time.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: {
        appointmentId,
        clinicName: clinicName || 'Clinic',
        doctorName,
        currentDate: newDate,
        currentTime: currentTime || 'Scheduled time',
        offeredDate: newDate,
        offeredTime: newTime,
        timeDifference,
        status: 'OFFERED',
      },
    });
  },

  /**
   * Trigger: Earlier Slot Accepted
   */
  async notifyEarlierSlotAccepted(apt: AppointmentEntity): Promise<void> {
    await this.sendNotification({
      patientId: apt.patient_id,
      recipientType: 'PATIENT',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      title: 'Appointment Rescheduled 📅',
      message: `Your appointment with ${apt.doctor_name} is moved to earlier time: ${apt.time} (${apt.date}).`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id, date: apt.date, time: apt.time, status: 'ACCEPTED' },
    });

    await this.sendNotification({
      clinicId: apt.clinic_id,
      recipientType: 'CLINIC',
      appointmentId: apt.id,
      title: 'Slot Reassignment Accepted ⚡',
      message: `${apt.patient_name} accepted earlier slot for ${apt.time} with ${apt.doctor_name}.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id, patientName: apt.patient_name, time: apt.time, status: 'ACCEPTED' },
    });
  },

  /**
   * Trigger: Earlier Slot Declined
   */
  async notifyEarlierSlotDeclined(apt: AppointmentEntity): Promise<void> {
    await this.sendNotification({
      patientId: apt.patient_id,
      recipientType: 'PATIENT',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      title: 'Earlier Slot Offer Declined',
      message: `You declined the earlier slot offer. Your original appointment at ${apt.time} (${apt.date}) remains confirmed.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id, date: apt.date, time: apt.time, status: 'DECLINED' },
    });
  },

  /**
   * Trigger: Consultation Completed & Prescription Issued
   */
  async notifyConsultationCompleted(apt: AppointmentEntity, prescriptionMedicinesCount: number): Promise<void> {
    // Patient
    await this.sendNotification({
      patientId: apt.patient_id,
      recipientType: 'PATIENT',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      doctorId: apt.doctor_id,
      title: 'Prescription Available in Health Records 💊',
      message: `Your consultation with ${apt.doctor_name} is complete. ${prescriptionMedicinesCount} medicine(s) prescribed. View details in Health Records.`,
      category: 'Appointments',
      type: 'prescription',
      actionData: { appointmentId: apt.id, doctorName: apt.doctor_name },
    });

    // Doctor
    await this.sendNotification({
      doctorId: apt.doctor_id,
      recipientType: 'DOCTOR',
      appointmentId: apt.id,
      clinicId: apt.clinic_id,
      title: 'Consultation Completed ✅',
      message: `Clinical notes and prescription recorded for ${apt.patient_name}.`,
      category: 'Appointments',
      type: 'appointment',
      actionData: { appointmentId: apt.id, patientName: apt.patient_name },
    });
  },

  /**
   * Trigger: Doctor Registration (Under Review)
   */
  async notifyDoctorVerificationRequested(doctor: DoctorEntity): Promise<void> {
    await this.sendNotification({
      clinicId: doctor.clinic_id || 'c1',
      recipientType: 'CLINIC',
      doctorId: doctor.id,
      title: 'Doctor Verification Required 🛡️',
      message: `${doctor.name} (${doctor.specialization}, Reg: ${doctor.registration_number || 'Pending'}) registered and requires credential review.`,
      category: 'Clinic Updates',
      type: 'verification',
      actionData: { doctorId: doctor.id, doctorName: doctor.name, registrationNumber: doctor.registration_number },
    });
  },

  /**
   * Trigger: Doctor Verification Completed (Approved / Rejected)
   */
  async notifyDoctorVerificationCompleted(doctor: DoctorEntity, isApproved: boolean): Promise<void> {
    await this.sendNotification({
      doctorId: doctor.id,
      recipientType: 'DOCTOR',
      clinicId: doctor.clinic_id,
      title: isApproved ? 'Doctor Verification Approved 🎉' : 'Doctor Verification Update 📋',
      message: isApproved
        ? 'Your practitioner credentials have been verified. You are now active and bookable on MedLink.'
        : `Verification status updated: ${doctor.verification_status}.`,
      category: 'System',
      type: 'verification',
      actionData: { doctorId: doctor.id, isVerified: doctor.is_verified, status: doctor.verification_status },
    });

    await this.sendNotification({
      clinicId: doctor.clinic_id,
      recipientType: 'CLINIC',
      doctorId: doctor.id,
      title: 'Doctor Verification Completed 📋',
      message: `${doctor.name} status updated to ${doctor.verification_status}.`,
      category: 'Clinic Updates',
      type: 'verification',
      actionData: { doctorId: doctor.id, status: doctor.verification_status },
    });
  },

  /**
   * Trigger: Doctor Queue Load Balance Proposal (Step A)
   */
  async notifyDoctorLoadBalanceProposal(proposal: LoadBalanceProposalEntity): Promise<void> {
    await this.sendNotification({
      doctorId: proposal.target_doctor_id,
      recipientType: 'DOCTOR',
      clinicId: proposal.clinic_id,
      appointmentId: proposal.appointment_id,
      title: 'Patient Transfer Request (Load Balancing) ⚖️',
      message: `Dr. ${proposal.source_doctor_name}'s queue has ${proposal.source_queue_count} patients. Would you accept transferring ${proposal.patient_name} (${proposal.procedure_name || 'General OPD'}) to your queue? Current: ${proposal.target_queue_count} waiting.`,
      category: 'Queue Updates',
      type: 'load_balance_proposal',
      actionData: {
        proposalId: proposal.id,
        clinicId: proposal.clinic_id,
        clinicName: proposal.clinic_name,
        sourceDoctorId: proposal.source_doctor_id,
        sourceDoctorName: proposal.source_doctor_name,
        targetDoctorId: proposal.target_doctor_id,
        targetDoctorName: proposal.target_doctor_name,
        patientId: proposal.patient_id,
        patientName: proposal.patient_name,
        procedureName: proposal.procedure_name,
        sourceQueueCount: proposal.source_queue_count,
        targetQueueCount: proposal.target_queue_count,
        proposedQueueCount: proposal.target_queue_count + 1,
        status: proposal.status,
        doctorConsent: proposal.doctor_consent,
        patientConsent: proposal.patient_consent,
      },
    });

    // Also notify Clinic Assistant of proposed balance
    await this.sendNotification({
      clinicId: proposal.clinic_id,
      recipientType: 'CLINIC',
      title: 'Queue Load Balancing Initiated ⚖️',
      message: `Proposed transfer of ${proposal.patient_name} from ${proposal.source_doctor_name} to ${proposal.target_doctor_name}. Awaiting doctor & patient consent.`,
      category: 'Queue Updates',
      type: 'load_balance_status',
      actionData: {
        proposalId: proposal.id,
        patientName: proposal.patient_name,
        sourceDoctorName: proposal.source_doctor_name,
        targetDoctorName: proposal.target_doctor_name,
        status: proposal.status,
      },
    });
  },

  /**
   * Trigger: Patient Load Balance Offer (Step B)
   */
  async notifyPatientLoadBalanceOffer(proposal: LoadBalanceProposalEntity): Promise<NotificationEntity> {
    const estWait = proposal.estimated_wait_minutes ?? 40;
    const newEstWait = proposal.new_estimated_wait_minutes ?? 0;
    return await this.sendNotification({
      patientId: proposal.patient_id,
      recipientType: 'PATIENT',
      appointmentId: proposal.appointment_id,
      clinicId: proposal.clinic_id,
      title: 'Doctor Queue Transfer Request ⚖️',
      message: `You can be seen sooner by ${proposal.target_doctor_name}! Current wait with ${proposal.source_doctor_name}: ~${estWait} min. With ${proposal.target_doctor_name}: ~${newEstWait} min. Would you like to transfer?`,
      category: 'Queue Updates',
      type: 'load_balance_offer',
      actionData: {
        proposalId: proposal.id,
        clinicId: proposal.clinic_id,
        clinicName: proposal.clinic_name,
        sourceDoctorId: proposal.source_doctor_id,
        sourceDoctorName: proposal.source_doctor_name,
        currentDoctorName: proposal.source_doctor_name,
        targetDoctorId: proposal.target_doctor_id,
        targetDoctorName: proposal.target_doctor_name,
        proposedDoctorName: proposal.target_doctor_name,
        patientId: proposal.patient_id,
        patientName: proposal.patient_name,
        procedureName: proposal.procedure_name,
        reason: 'doctor queue load balancing',
        estimatedWait: estWait,
        newEstimatedWait: newEstWait,
        status: proposal.status,
        doctorConsent: proposal.doctor_consent,
        patientConsent: proposal.patient_consent,
      },
    });
  },

  /**
   * Trigger: Load Balance Transfer Committed (Step C dual consent achieved)
   */
  async notifyLoadBalanceTransferCompleted(proposal: LoadBalanceProposalEntity): Promise<void> {
    // 1. Patient Notification
    await this.sendNotification({
      patientId: proposal.patient_id,
      recipientType: 'PATIENT',
      appointmentId: proposal.appointment_id,
      clinicId: proposal.clinic_id,
      title: 'Doctor Transfer Confirmed ✅',
      message: `Your consultation is now transferred to ${proposal.target_doctor_name} at ${proposal.clinic_name}. Please proceed to their consultation queue.`,
      category: 'Queue Updates',
      type: 'queue',
      actionData: {
        proposalId: proposal.id,
        doctorName: proposal.target_doctor_name,
        clinicName: proposal.clinic_name,
        status: 'COMMITTED',
      },
    });

    // 2. Receiving Doctor Notification
    await this.sendNotification({
      doctorId: proposal.target_doctor_id,
      recipientType: 'DOCTOR',
      clinicId: proposal.clinic_id,
      title: 'Patient Added to Queue (Transfer) 👥',
      message: `${proposal.patient_name} accepted the transfer from Dr. ${proposal.source_doctor_name} and is now in your active waiting queue.`,
      category: 'Queue Updates',
      type: 'queue',
      actionData: {
        proposalId: proposal.id,
        patientName: proposal.patient_name,
        appointmentId: proposal.appointment_id,
        walkInId: proposal.walk_in_id,
      },
    });

    // 3. Source Doctor Notification
    await this.sendNotification({
      doctorId: proposal.source_doctor_id,
      recipientType: 'DOCTOR',
      clinicId: proposal.clinic_id,
      title: 'Queue Load Balanced ⚖️',
      message: `${proposal.patient_name} has transferred to ${proposal.target_doctor_name} to balance the clinic queue.`,
      category: 'Queue Updates',
      type: 'queue',
      actionData: {
        proposalId: proposal.id,
        patientName: proposal.patient_name,
      },
    });

    // 4. Clinic Assistant Notification
    await this.sendNotification({
      clinicId: proposal.clinic_id,
      recipientType: 'CLINIC',
      title: 'Load Balancing Transfer Completed 🏥',
      message: `${proposal.patient_name} transferred from ${proposal.source_doctor_name} to ${proposal.target_doctor_name} with dual consent.`,
      category: 'Queue Updates',
      type: 'load_balance_status',
      actionData: {
        proposalId: proposal.id,
        patientName: proposal.patient_name,
        sourceDoctorName: proposal.source_doctor_name,
        targetDoctorName: proposal.target_doctor_name,
        status: 'COMMITTED',
      },
    });
  },

  /**
   * Trigger: Load Balance Proposal Declined or Cancelled
   */
  async notifyLoadBalanceProposalCancelled(proposal: LoadBalanceProposalEntity, reason: string): Promise<void> {
    // Notify Clinic Assistant
    await this.sendNotification({
      clinicId: proposal.clinic_id,
      recipientType: 'CLINIC',
      title: 'Load Balancing Proposal Declined / Cancelled ℹ️',
      message: `Transfer of ${proposal.patient_name} from ${proposal.source_doctor_name} to ${proposal.target_doctor_name} was not completed: ${reason}. Original assignment retained.`,
      category: 'Queue Updates',
      type: 'load_balance_status',
      actionData: {
        proposalId: proposal.id,
        status: proposal.status,
        reason,
      },
    });
  },
};
