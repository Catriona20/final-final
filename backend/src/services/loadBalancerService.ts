import { memoryDb, saveStateToFile } from '../database/db';
import {
  AppointmentEntity,
  AppointmentModel,
  DoctorEntity,
  DoctorModel,
  LoadBalanceProposalEntity,
  LoadBalanceProposalModel,
  WalkInEntity,
  WalkInModel,
  resolveCanonicalClinicId,
  resolveCanonicalDoctorId,
} from '../database/models';
import { queueManager, UnifiedQueueItem } from './queueManager';
import { notificationService } from './notificationService';
import { emitBroadcast, emitToClinic, emitToDoctor, emitToPatient } from './socketService';
import { timeService } from './timeService';

export interface DoctorQueueSummary {
  doctorId: string;
  doctorName: string;
  clinicId: string;
  clinicName: string;
  specialization: string;
  isAvailable: boolean;
  isVerified: boolean;
  totalActiveQueue: number;
  eligibleWaitingQueue: number;
  eligibleItems: UnifiedQueueItem[];
}

export interface ImbalanceEvaluationResult {
  clinicId: string;
  clinicName: string;
  hasImbalance: boolean;
  imbalanceDetails: string;
  doctorSummaries: DoctorQueueSummary[];
  generatedProposals: LoadBalanceProposalEntity[];
}

const inFlightCommits = new Set<string>();

export const loadBalancerService = {
  /**
   * Checks if a doctor is eligible to receive load-balanced patients at a specific clinic.
   * Doctor must:
   * 1. Belong to / be affiliated with the same clinic (cross-clinic strictly rejected).
   * 2. Be verified / approved under existing rules.
   * 3. Be currently available to receive patients (AVAILABLE status).
   * 4. Be able to handle the patient's department and procedure (if specified).
   */
  isDoctorEligibleToReceive(
    targetDoctorId: string,
    clinicId: string,
    sourceDoctorId?: string,
    procedureName?: string,
    departmentName?: string
  ): { eligible: boolean; reason?: string } {
    const canonicalTarget = resolveCanonicalDoctorId(targetDoctorId);
    const canonicalClinic = resolveCanonicalClinicId(clinicId);

    // Target doctor must not be source doctor
    if (sourceDoctorId && resolveCanonicalDoctorId(sourceDoctorId) === canonicalTarget) {
      return { eligible: false, reason: 'Target doctor cannot be the same as the source doctor.' };
    }

    const doc = memoryDb.doctors.get(targetDoctorId) || memoryDb.doctors.get(canonicalTarget);
    if (!doc) {
      return { eligible: false, reason: 'Target doctor not found in clinical database.' };
    }

    // 1. Same Clinic Verification (Cross-clinic strictly rejected)
    const docCanonicalClinic = resolveCanonicalClinicId(doc.clinic_id);
    const hasClinicAffiliation =
      docCanonicalClinic === canonicalClinic ||
      (doc.clinic_affiliations &&
        doc.clinic_affiliations.some((aff: string) => resolveCanonicalClinicId(aff) === canonicalClinic));

    if (!hasClinicAffiliation) {
      return { eligible: false, reason: 'Cross-clinic transfers are strictly rejected. Doctor is at another clinic.' };
    }

    // 2. Verification Status Check
    const isApproved =
      doc.is_verified === true ||
      ['VERIFIED', 'ACTIVE', 'APPROVED'].includes(String(doc.verification_status || '').toUpperCase());

    if (!isApproved) {
      return { eligible: false, reason: 'Doctor credentials are not verified/approved.' };
    }

    // 3. Availability Check
    const isAvailable = doc.status === 'AVAILABLE' && doc.is_available_today !== false;
    if (!isAvailable) {
      return { eligible: false, reason: `Doctor is currently ${doc.status || 'UNAVAILABLE'} to receive patients.` };
    }

    // 4. Department / Specialization Check
    if (departmentName && doc.specialization) {
      const docSpec = doc.specialization.toLowerCase();
      const reqDept = departmentName.toLowerCase();
      const matchesDept =
        docSpec.includes(reqDept) ||
        reqDept.includes(docSpec) ||
        (doc.departments && doc.departments.some((d: string) => d.toLowerCase().includes(reqDept)));

      if (!matchesDept && !docSpec.includes('general') && !docSpec.includes('family medicine')) {
        return { eligible: false, reason: `Doctor specialization (${doc.specialization}) does not match department (${departmentName}).` };
      }
    }

    // 5. Procedure Check
    if (procedureName) {
      const cleanProc = procedureName.toLowerCase().trim();

      // General consultation / routine checkup / triage reasons are departmental consultations
      // that any verified doctor in the matching department is authorized to perform.
      const isGeneralConsult =
        cleanProc === 'general consultation' ||
        cleanProc === 'new symptoms' ||
        cleanProc === 'consultation' ||
        cleanProc.includes('consultation') ||
        cleanProc.includes('checkup') ||
        cleanProc.includes('check-up') ||
        cleanProc.includes('symptom') ||
        cleanProc === 'routine checkup' ||
        cleanProc === 'follow-up' ||
        cleanProc === 'follow up' ||
        cleanProc === 'opd' ||
        cleanProc === 'general opd';

      if (!isGeneralConsult) {
        const docProcs: string[] = Array.isArray(doc.procedures) ? doc.procedures : [];
        const hasProcedureInDoc = docProcs.some((p: string) => p.toLowerCase().includes(cleanProc));

        // Also check doctor_procedures store
        let hasProcedureInStore = false;
        for (const dp of memoryDb.doctor_procedures.values()) {
          if (
            (dp.doctor_id === doc.id || dp.doctor_id === canonicalTarget) &&
            dp.procedure_name.toLowerCase().includes(cleanProc)
          ) {
            hasProcedureInStore = true;
            break;
          }
        }

        // If doctor has explicit procedure list and doesn't match
        if (docProcs.length > 0 && !hasProcedureInDoc && !hasProcedureInStore) {
          return { eligible: false, reason: `Doctor is not authorized for procedure "${procedureName}".` };
        }
      }
    }

    return { eligible: true };
  },

  /**
   * Retrieves strictly eligible waiting queue items for a doctor at a clinic.
   * Excludes:
   * - In-consultation patients
   * - Completed consultations
   * - Cancelled appointments
   * - No-show appointments
   * - Emergency-priority patients (protected from routine load balancing)
   * - Walk-in patients without an authenticated app account
   * - Patients already in an active pending proposal
   */
  getEligibleWaitingQueue(clinicId: string, doctorId: string): UnifiedQueueItem[] {
    const queue = queueManager.getQueue(clinicId, doctorId);

    // Active pending proposal patient IDs
    const pendingPatientIds = new Set<string>();
    const pendingAppointmentIds = new Set<string>();
    const pendingWalkInIds = new Set<string>();

    for (const p of memoryDb.load_balance_proposals.values()) {
      if (p.status === 'PENDING') {
        if (p.patient_id) pendingPatientIds.add(p.patient_id);
        if (p.appointment_id) pendingAppointmentIds.add(p.appointment_id);
        if (p.walk_in_id) pendingWalkInIds.add(p.walk_in_id);
      }
    }

    const eligibleItems: UnifiedQueueItem[] = [];

    for (const item of queue) {
      // 1. Must be in WAITING status (NOT in consultation, NOT completed)
      if (item.status !== 'WAITING') {
        continue;
      }

      // 2. Exclude emergency-priority patients from routine automatic balancing
      if (item.priority === 'EMERGENCY') {
        continue;
      }

      // 3. Exclude if already in an active pending transfer proposal
      if (
        (item.appointmentId && pendingAppointmentIds.has(item.appointmentId)) ||
        (item.walkInId && pendingWalkInIds.has(item.walkInId)) ||
        (item.patientId && pendingPatientIds.has(item.patientId))
      ) {
        continue;
      }

      // 4. For booked appointments: Verify appointment entity is not cancelled / completed / no-show
      if (item.appointmentId) {
        const apt = memoryDb.appointments.get(item.appointmentId);
        if (!apt) continue;
        const termStatuses = ['Completed', 'COMPLETED', 'Cancelled', 'CANCELLED', 'No Show', 'NO_SHOW', 'No-Show'];
        if (termStatuses.includes(apt.status) || termStatuses.includes(apt.appointmentStatus)) {
          continue;
        }
      }

      // 5. For walk-in patients: MUST have an authenticated patient account on MedLink
      if (item.walkInId) {
        const walkin = memoryDb.walk_ins.get(item.walkInId);
        if (!walkin) continue;
        if (walkin.status !== 'WAITING') continue;

        // Check if patient account exists and is authenticated
        const patientAcc = walkin.patient_id ? memoryDb.patients.get(walkin.patient_id) : null;
        if (!patientAcc) {
          // Walk-in without authenticated app account cannot consent via in-app notification.
          // Retain original queue entry, do not automatically include in proposals.
          continue;
        }
      }

      eligibleItems.push(item);
    }

    return eligibleItems;
  },

  /**
   * Evaluates clinic queue imbalance between doctors and generates transfer proposals.
   * Deterministic, conservative balancing algorithm:
   * E.g. Dr. A has 4 patients, Dr. B has 0.
   * Proposals = floor((4 - 0) / 2) = 2 patients proposed for transfer.
   */
  async evaluateAndGenerateProposals(clinicId: string): Promise<ImbalanceEvaluationResult> {
    const canonicalClinic = resolveCanonicalClinicId(clinicId);
    const clinic = memoryDb.clinics.get(clinicId) || memoryDb.clinics.get(canonicalClinic);
    const clinicName = clinic?.name || 'Clinic';

    // 1. Gather all doctors at this clinic
    const clinicDoctors: DoctorEntity[] = [];
    for (const doc of memoryDb.doctors.values()) {
      const docClinic = resolveCanonicalClinicId(doc.clinic_id);
      const isAffiliated =
        docClinic === canonicalClinic ||
        (doc.clinic_affiliations &&
          doc.clinic_affiliations.some((aff: string) => resolveCanonicalClinicId(aff) === canonicalClinic));

      if (isAffiliated) {
        clinicDoctors.push(doc);
      }
    }

    // 2. Build summaries for each doctor
    const doctorSummaries: DoctorQueueSummary[] = [];
    for (const doc of clinicDoctors) {
      const fullQueue = queueManager.getQueue(clinicId, doc.id);
      const eligibleItems = this.getEligibleWaitingQueue(clinicId, doc.id);

      const isVerified =
        doc.is_verified === true ||
        ['VERIFIED', 'ACTIVE', 'APPROVED'].includes(String(doc.verification_status || '').toUpperCase());

      doctorSummaries.push({
        doctorId: doc.id,
        doctorName: doc.name,
        clinicId,
        clinicName,
        specialization: doc.specialization,
        isAvailable: doc.status === 'AVAILABLE' && doc.is_available_today !== false,
        isVerified,
        totalActiveQueue: fullQueue.length,
        eligibleWaitingQueue: eligibleItems.length,
        eligibleItems,
      });
    }

    // Sort doctors by eligible waiting count descending (most loaded first)
    doctorSummaries.sort((a, b) => b.eligibleWaitingQueue - a.eligibleWaitingQueue);

    const generatedProposals: LoadBalanceProposalEntity[] = [];

    // 3. Detect pairs with meaningful imbalance (difference >= 2)
    for (let i = 0; i < doctorSummaries.length; i++) {
      const heavilyLoaded = doctorSummaries[i];
      if (heavilyLoaded.eligibleWaitingQueue <= 1) continue;

      const maxTransfersAllowed = Math.floor(heavilyLoaded.eligibleWaitingQueue / 2);
      let totalTransferredFromSource = 0;

      for (let j = doctorSummaries.length - 1; j > i; j--) {
        if (totalTransferredFromSource >= maxTransfersAllowed) break;

        const lightlyLoaded = doctorSummaries[j];

        // Check if destination doctor is eligible to receive patients
        if (!lightlyLoaded.isAvailable || !lightlyLoaded.isVerified) {
          continue;
        }

        const queueDiff = heavilyLoaded.eligibleWaitingQueue - lightlyLoaded.eligibleWaitingQueue;
        if (queueDiff < 2) {
          continue; // No meaningful imbalance between this pair
        }

        // Smallest necessary transfers to achieve balance: floor(diff / 2)
        const transfersCount = Math.min(
          Math.floor(queueDiff / 2),
          maxTransfersAllowed - totalTransferredFromSource
        );
        if (transfersCount <= 0) continue;

        // Select candidates from heavily loaded doctor's queue
        // Pick from the back of the queue (patients with highest wait who benefit most from transfer)
        let transferredForPair = 0;
        const candidateItems = [...heavilyLoaded.eligibleItems].reverse();

        for (const candidate of candidateItems) {
          if (transferredForPair >= transfersCount) break;
          if (totalTransferredFromSource >= maxTransfersAllowed) break;

          // Re-verify specific patient procedure/suitability for receiving doctor
          const apt = candidate.appointmentId ? memoryDb.appointments.get(candidate.appointmentId) : null;
          const procName = apt?.procedure_name || apt?.procedure || candidate.reason;
          const dept = apt?.department || heavilyLoaded.specialization;

          const suitability = this.isDoctorEligibleToReceive(
            lightlyLoaded.doctorId,
            clinicId,
            heavilyLoaded.doctorId,
            procName,
            dept
          );

          if (!suitability.eligible) {
            continue;
          }

          // Check if candidate already has an active pending proposal
          const existingActive = await LoadBalanceProposalModel.findActiveByPatient(
            candidate.patientId,
            candidate.appointmentId,
            candidate.walkInId
          );
          if (existingActive) {
            continue;
          }

          // Calculate estimated wait comparison
          const docA = memoryDb.doctors.get(heavilyLoaded.doctorId);
          const docB = memoryDb.doctors.get(lightlyLoaded.doctorId);
          const durationA = parseInt(docA?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;
          const durationB = parseInt(docB?.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20;

          const currentEstWait = candidate.patientsAhead != null
            ? candidate.patientsAhead * durationA
            : heavilyLoaded.eligibleWaitingQueue * durationA;

          const newEstWait = lightlyLoaded.eligibleWaitingQueue * durationB;

          // Create the proposal with PENDING consent on both sides
          const proposal = await LoadBalanceProposalModel.create({
            clinic_id: clinicId,
            clinic_name: clinicName,
            source_doctor_id: heavilyLoaded.doctorId,
            source_doctor_name: heavilyLoaded.doctorName,
            target_doctor_id: lightlyLoaded.doctorId,
            target_doctor_name: lightlyLoaded.doctorName,
            appointment_id: candidate.appointmentId,
            walk_in_id: candidate.walkInId,
            patient_id: candidate.patientId,
            patient_name: candidate.patientName,
            procedure_name: procName,
            department_name: dept,
            source_queue_count: heavilyLoaded.eligibleWaitingQueue,
            target_queue_count: lightlyLoaded.eligibleWaitingQueue,
            estimated_wait_minutes: currentEstWait,
            new_estimated_wait_minutes: newEstWait,
            doctor_consent: 'PENDING',
            patient_consent: 'PENDING',
            status: 'PENDING',
          });

          generatedProposals.push(proposal);
          transferredForPair++;
          totalTransferredFromSource++;

          // Deduct from temporary candidate list so we don't double-propose
          heavilyLoaded.eligibleWaitingQueue--;
          lightlyLoaded.eligibleWaitingQueue++;
          heavilyLoaded.eligibleItems = heavilyLoaded.eligibleItems.filter((it) => it.id !== candidate.id);

          // Send in-app notification to receiving doctor (Step A)
          await notificationService.notifyDoctorLoadBalanceProposal(proposal);

          // Send in-app notification to affected patient (Step B)
          await notificationService.notifyPatientLoadBalanceOffer(proposal);
        }
      }
    }

    // Check if an actual queue count difference existed between any active doctor pair
    let queueCountImbalance = false;
    for (let i = 0; i < doctorSummaries.length; i++) {
      for (let j = i + 1; j < doctorSummaries.length; j++) {
        if (Math.abs(doctorSummaries[i].totalActiveQueue - doctorSummaries[j].totalActiveQueue) >= 2) {
          queueCountImbalance = true;
          break;
        }
      }
      if (queueCountImbalance) break;
    }

    const hasImbalance = generatedProposals.length > 0;
    let imbalanceDetails: string;
    if (generatedProposals.length > 0) {
      imbalanceDetails = `Generated ${generatedProposals.length} proposal(s) to balance OPD queues.`;
    } else if (queueCountImbalance) {
      imbalanceDetails = 'No eligible transfer candidates available for current queue difference.';
    } else {
      imbalanceDetails = 'Active doctor queues at this clinic are balanced. No transfers pending dual consent.';
    }

    return {
      clinicId,
      clinicName,
      hasImbalance,
      imbalanceDetails,
      doctorSummaries,
      generatedProposals,
    };
  },

  /**
   * Records the receiving doctor's consent response.
   */
  async respondDoctorConsent(
    proposalId: string,
    doctorId: string,
    accept: boolean,
    declineReason?: string
  ): Promise<{ success: boolean; proposal?: LoadBalanceProposalEntity; message: string }> {
    const proposal = await LoadBalanceProposalModel.getById(proposalId);
    if (!proposal) {
      return { success: false, message: 'Transfer proposal not found.' };
    }

    // Verify authorized doctor
    const canonicalDoc = resolveCanonicalDoctorId(doctorId);
    const canonicalTarget = resolveCanonicalDoctorId(proposal.target_doctor_id);
    if (canonicalDoc !== canonicalTarget && doctorId !== proposal.target_doctor_id) {
      return { success: false, message: 'Unauthorized. You are not the receiving doctor for this proposal.' };
    }

    // Idempotency: if already committed or declined, return current state safely
    if (proposal.status === 'COMMITTED') {
      return { success: true, proposal, message: 'Proposal has already been committed.' };
    }
    if (proposal.status === 'DECLINED' || proposal.doctor_consent === 'DECLINED') {
      return { success: true, proposal, message: 'Proposal was previously declined.' };
    }

    if (!accept) {
      // Doctor declined -> cancel proposal immediately and retain original assignment
      const updated = await LoadBalanceProposalModel.update(proposal.id, {
        doctor_consent: 'DECLINED',
        doctor_consented_at: new Date().toISOString(),
        doctor_decline_reason: declineReason || 'Doctor declined the transfer proposal.',
        status: 'DECLINED',
      });

      if (updated) {
        for (const notif of memoryDb.notifications.values()) {
          const act = notif.action_data || (notif as any).actionData;
          if (act && act.proposalId === proposal.id) {
            act.doctorConsent = 'DECLINED';
            act.status = 'DECLINED';
            notif.action_data = act;
            (notif as any).actionData = act;
          }
        }
        saveStateToFile();

        await notificationService.notifyLoadBalanceProposalCancelled(
          updated,
          'Receiving doctor declined the transfer proposal.'
        );
        emitBroadcast('queue:load_balance_proposal_updated', { proposal: updated });
      }

      return {
        success: true,
        proposal: updated || proposal,
        message: 'You have declined the transfer proposal. Patient remains with their original doctor.',
      };
    }

    // Doctor accepted
    const updated = await LoadBalanceProposalModel.update(proposal.id, {
      doctor_consent: 'ACCEPTED',
      doctor_consented_at: new Date().toISOString(),
    });

    if (!updated) {
      return { success: false, message: 'Failed to update proposal consent.' };
    }

    for (const notif of memoryDb.notifications.values()) {
      const act = notif.action_data || (notif as any).actionData;
      if (act && act.proposalId === proposal.id) {
        act.doctorConsent = 'ACCEPTED';
        act.status = updated.status;
        notif.action_data = act;
        (notif as any).actionData = act;
      }
    }
    saveStateToFile();

    emitBroadcast('queue:load_balance_proposal_updated', { proposal: updated });

    // Check if dual consent is achieved (both doctor AND patient have accepted)
    if (updated.patient_consent === 'ACCEPTED') {
      const commitRes = await this.commitTransferIfDualConsented(updated.id);
      return {
        success: commitRes.success,
        proposal: await LoadBalanceProposalModel.getById(proposal.id) || updated,
        message: commitRes.message,
      };
    }

    return {
      success: true,
      proposal: updated,
      message: 'Transfer accepted. Awaiting patient consent before patient is moved to your queue.',
    };
  },

  /**
   * Records the patient's consent response.
   */
  async respondPatientConsent(
    proposalId: string,
    patientId: string,
    accept: boolean,
    declineReason?: string
  ): Promise<{ success: boolean; proposal?: LoadBalanceProposalEntity; message: string }> {
    const proposal = await LoadBalanceProposalModel.getById(proposalId);
    if (!proposal) {
      return { success: false, message: 'Transfer offer not found.' };
    }

    // Verify authorized patient (alias-aware)
    let isAuthorized = proposal.patient_id === patientId;
    if (!isAuthorized && memoryDb.patients?.getAliases) {
      const aliasMap = memoryDb.patients.getAliases();
      const canonicalProp = aliasMap.get(proposal.patient_id.toLowerCase()) || proposal.patient_id;
      const canonicalReq = aliasMap.get(patientId.toLowerCase()) || patientId;
      isAuthorized = canonicalProp === canonicalReq;
    }
    if (!isAuthorized) {
      return { success: false, message: 'Unauthorized. This transfer offer was not issued to your account.' };
    }

    // Idempotency: if already committed or declined, return current state safely
    if (proposal.status === 'COMMITTED') {
      return { success: true, proposal, message: 'Transfer has already been committed.' };
    }
    if (proposal.status === 'DECLINED' || proposal.patient_consent === 'DECLINED') {
      return { success: true, proposal, message: 'Transfer offer was previously declined.' };
    }

    if (!accept) {
      // Patient declined -> cancel proposal immediately and retain original assignment
      const updated = await LoadBalanceProposalModel.update(proposal.id, {
        patient_consent: 'DECLINED',
        patient_consented_at: new Date().toISOString(),
        patient_decline_reason: declineReason || 'Patient preferred to stay with their original doctor.',
        status: 'DECLINED',
      });

      if (updated) {
        for (const notif of memoryDb.notifications.values()) {
          const act = notif.action_data || (notif as any).actionData;
          if (act && act.proposalId === proposal.id) {
            act.patientConsent = 'DECLINED';
            act.status = 'DECLINED';
            notif.action_data = act;
            (notif as any).actionData = act;
          }
        }
        saveStateToFile();

        await notificationService.notifyLoadBalanceProposalCancelled(
          updated,
          'Patient declined the transfer offer. Original doctor assignment retained.'
        );
        emitBroadcast('queue:load_balance_proposal_updated', { proposal: updated });
      }

      return {
        success: true,
        proposal: updated || proposal,
        message: 'You declined the transfer. Your original doctor assignment is preserved.',
      };
    }

    // Patient accepted
    const updated = await LoadBalanceProposalModel.update(proposal.id, {
      patient_consent: 'ACCEPTED',
      patient_consented_at: new Date().toISOString(),
    });

    if (!updated) {
      return { success: false, message: 'Failed to update transfer offer consent.' };
    }

    for (const notif of memoryDb.notifications.values()) {
      const act = notif.action_data || (notif as any).actionData;
      if (act && act.proposalId === proposal.id) {
        act.patientConsent = 'ACCEPTED';
        act.status = updated.status;
        notif.action_data = act;
        (notif as any).actionData = act;
      }
    }
    saveStateToFile();

    emitBroadcast('queue:load_balance_proposal_updated', { proposal: updated });

    // Check if dual consent is achieved (both doctor AND patient have accepted)
    if (updated.doctor_consent === 'ACCEPTED') {
      const commitRes = await this.commitTransferIfDualConsented(updated.id);
      return {
        success: commitRes.success,
        proposal: await LoadBalanceProposalModel.getById(proposal.id) || updated,
        message: commitRes.message,
      };
    }

    return {
      success: true,
      proposal: updated,
      message: 'Transfer accepted. Awaiting receiving doctor approval before your queue position is updated.',
    };
  },

  /**
   * Commits the transfer ONLY when BOTH consents are explicitly ACCEPTED.
   * Concurrency-safe, idempotent, re-verifies live queue conditions at commit time.
   */
  async commitTransferIfDualConsented(
    proposalId: string
  ): Promise<{ success: boolean; committed: boolean; message: string; proposal?: LoadBalanceProposalEntity }> {
    if (inFlightCommits.has(proposalId)) {
      const existing = await LoadBalanceProposalModel.getById(proposalId);
      return {
        success: true,
        committed: true,
        message: 'Transfer is already being committed.',
        proposal: existing || undefined,
      };
    }
    inFlightCommits.add(proposalId);

    try {
      const proposal = await LoadBalanceProposalModel.getById(proposalId);
      if (!proposal) {
        return { success: false, committed: false, message: 'Proposal not found.' };
      }

      // Strictly enforce dual consent: both parties MUST have accepted
      if (proposal.doctor_consent !== 'ACCEPTED' || proposal.patient_consent !== 'ACCEPTED') {
        return {
          success: false,
          committed: false,
          message: 'Cannot commit transfer. Both the receiving doctor and the patient must explicitly consent.',
          proposal,
        };
      }

      // Idempotency: prevent double commit
      if (proposal.status === 'COMMITTED') {
        return {
          success: true,
          committed: true,
          message: 'Transfer has already been committed.',
          proposal,
        };
      }

      // Recheck live eligibility at commit time:
      // 1. Destination doctor must still be eligible and available
      const docA = memoryDb.doctors.get(proposal.source_doctor_id);
      const proposalDept = (proposal as any).department_name || (proposal as any).department || docA?.specialization;
      const suitability = this.isDoctorEligibleToReceive(
        proposal.target_doctor_id,
        proposal.clinic_id,
        proposal.source_doctor_id,
        proposal.procedure_name,
        proposalDept
      );

      if (!suitability.eligible) {
        await LoadBalanceProposalModel.update(proposal.id, {
          status: 'CANCELLED',
        });
        await notificationService.notifyLoadBalanceProposalCancelled(
          proposal,
          suitability.reason || 'Receiving doctor is no longer available.'
        );
        return {
          success: false,
          committed: false,
          message: `Transfer could not be committed: ${suitability.reason}. Original assignment retained.`,
        };
      }

      // 2. Patient must still be active and waiting (not cancelled, no-show, in consultation, or completed)
      let apt: AppointmentEntity | null = null;
      let walkin: WalkInEntity | null = null;

      if (proposal.appointment_id) {
        apt = memoryDb.appointments.get(proposal.appointment_id);
        if (!apt) {
          await LoadBalanceProposalModel.update(proposal.id, { status: 'CANCELLED' });
          return { success: false, committed: false, message: 'Original appointment record no longer found.' };
        }

        const invalidStatuses = ['Completed', 'COMPLETED', 'Cancelled', 'CANCELLED', 'No Show', 'NO_SHOW', 'In Consultation', 'IN_CONSULTATION'];
        if (invalidStatuses.includes(apt.status)) {
          await LoadBalanceProposalModel.update(proposal.id, { status: 'CANCELLED' });
          return {
            success: false,
            committed: false,
            message: `Appointment status is now "${apt.status}". Transfer cannot be performed.`,
          };
        }
      } else if (proposal.walk_in_id) {
        walkin = memoryDb.walk_ins.get(proposal.walk_in_id);
        if (!walkin) {
          await LoadBalanceProposalModel.update(proposal.id, { status: 'CANCELLED' });
          return { success: false, committed: false, message: 'Original walk-in record no longer found.' };
        }

        if (walkin.status !== 'WAITING') {
          await LoadBalanceProposalModel.update(proposal.id, { status: 'CANCELLED' });
          return {
            success: false,
            committed: false,
            message: `Walk-in status is now "${walkin.status}". Transfer cannot be performed.`,
          };
        }
      }

      const targetDoc = memoryDb.doctors.get(proposal.target_doctor_id);
      if (!targetDoc) {
        return { success: false, committed: false, message: 'Target doctor record missing.' };
      }

      // Idempotency: If patient is already assigned to the target doctor, don't duplicate transfer
      if (apt && apt.doctor_id === targetDoc.id) {
        return {
          success: true,
          committed: true,
          message: `Appointment is already assigned to ${targetDoc.name}.`,
          proposal,
        };
      }
      if (walkin && walkin.doctor_id === targetDoc.id) {
        return {
          success: true,
          committed: true,
          message: `Walk-in is already assigned to ${targetDoc.name}.`,
          proposal,
        };
      }

      // 3. Atomic Update: Reassign doctor exactly once, preserving booking reference & history
      const nowIso = new Date().toISOString();

      if (apt) {
        const originalDocId = apt.doctor_id;
        const originalDocName = apt.doctor_name;

        apt.doctor_id = targetDoc.id;
        apt.doctor_name = targetDoc.name;
        apt.doctor_specialization = targetDoc.specialization;

        // Record transfer in appointment history
        if (!apt.transfer_history) {
          apt.transfer_history = [];
        }
        apt.transfer_history.push({
          from_doctor_id: originalDocId,
          from_doctor_name: originalDocName,
          to_doctor_id: targetDoc.id,
          to_doctor_name: targetDoc.name,
          transferred_at: nowIso,
          reason: 'Load balancing transfer with dual consent',
          doctor_consented_at: proposal.doctor_consented_at,
          patient_consented_at: proposal.patient_consented_at,
        });

        apt.updated_at = nowIso;
        memoryDb.appointments.set(apt.id, apt);
      } else if (walkin) {
        walkin.doctor_id = targetDoc.id;
        walkin.preferred_doctor = targetDoc.name;
        walkin.updated_at = nowIso;
        memoryDb.walk_ins.set(walkin.id, walkin);
      }

      // Mark proposal COMMITTED
      const committedProposal = await LoadBalanceProposalModel.update(proposal.id, {
        status: 'COMMITTED',
        transferred_at: nowIso,
      });

      saveStateToFile();

      // Recompute queues and sync queue positions
      const refreshedQueue = queueManager.getQueue(proposal.clinic_id);

      // Emit Socket.IO events to patient, both doctors, and clinic assistant
      emitBroadcast('queue:updated', {
        clinicId: proposal.clinic_id,
        sourceDoctorId: proposal.source_doctor_id,
        targetDoctorId: proposal.target_doctor_id,
        proposalId: proposal.id,
      });

      emitBroadcast('queue:load_balance_transferred', {
        proposalId: proposal.id,
        patientId: proposal.patient_id,
        appointmentId: proposal.appointment_id,
        walkInId: proposal.walk_in_id,
        sourceDoctorId: proposal.source_doctor_id,
        targetDoctorId: proposal.target_doctor_id,
        targetDoctorName: targetDoc.name,
        clinicId: proposal.clinic_id,
      });

      if (proposal.patient_id) {
        emitToPatient(proposal.patient_id, 'queue:load_balance_transferred', committedProposal);
      }
      emitToDoctor(proposal.source_doctor_id, 'queue:load_balance_transferred', committedProposal);
      emitToDoctor(proposal.target_doctor_id, 'queue:load_balance_transferred', committedProposal);
      emitToClinic(proposal.clinic_id, 'queue:load_balance_transferred', committedProposal);

      // Send in-app notifications
      if (committedProposal) {
        await notificationService.notifyLoadBalanceTransferCompleted(committedProposal);
      }

      return {
        success: true,
        committed: true,
        message: `Transfer successfully committed. Patient is now assigned to ${targetDoc.name}.`,
        proposal: committedProposal || undefined,
      };
    } finally {
      inFlightCommits.delete(proposalId);
    }
  },
};
