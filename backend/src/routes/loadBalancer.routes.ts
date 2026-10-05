import { Router, Request, Response } from 'express';
import { loadBalancerService } from '../services/loadBalancerService';
import { LoadBalanceProposalModel } from '../database/models';

export const loadBalancerRouter = Router();

/**
 * GET /api/queue/load-balance/proposals
 * Retrieves load balance proposals, optionally filtered by clinicId, doctorId, or patientId.
 */
loadBalancerRouter.get('/proposals', async (req: Request, res: Response): Promise<void> => {
  try {
    const { clinicId, doctorId, patientId } = req.query as {
      clinicId?: string;
      doctorId?: string;
      patientId?: string;
    };

    let proposals = [];
    if (patientId) {
      proposals = await LoadBalanceProposalModel.getByPatientId(patientId);
    } else if (doctorId) {
      proposals = await LoadBalanceProposalModel.getByDoctorId(doctorId);
    } else {
      proposals = await LoadBalanceProposalModel.getAll(clinicId);
    }

    res.status(200).json({
      success: true,
      count: proposals.length,
      proposals,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch load balance proposals.' });
  }
});

/**
 * GET /api/queue/load-balance/status/:clinicId
 * Retrieves queue imbalance evaluation and live proposals for a clinic.
 */
loadBalancerRouter.get('/status/:clinicId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { clinicId } = req.params;
    const result = await loadBalancerService.evaluateAndGenerateProposals(clinicId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to evaluate queue load balance status.' });
  }
});

/**
 * POST /api/queue/load-balance/evaluate
 * Triggers evaluation and creates transfer proposals for a clinic.
 */
loadBalancerRouter.post('/evaluate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { clinicId } = req.body;
    if (!clinicId) {
      res.status(400).json({ success: false, error: 'clinicId is required to evaluate load balance.' });
      return;
    }

    const result = await loadBalancerService.evaluateAndGenerateProposals(clinicId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to evaluate clinic queue imbalance.' });
  }
});

/**
 * POST /api/queue/load-balance/doctor-consent
 * Receiving doctor explicitly accepts or declines a transfer proposal.
 */
loadBalancerRouter.post('/doctor-consent', async (req: Request, res: Response): Promise<void> => {
  try {
    const { proposalId, doctorId, consent, declineReason } = req.body;

    if (!proposalId || !doctorId || consent === undefined || consent === null) {
      res.status(400).json({
        success: false,
        error: 'proposalId, doctorId, and consent ("ACCEPT" / "DECLINE" or boolean) are required.',
      });
      return;
    }

    const isAccept = String(consent).toUpperCase() === 'ACCEPT' || consent === true || String(consent).toLowerCase() === 'true';
    const result = await loadBalancerService.respondDoctorConsent(proposalId, doctorId, isAccept, declineReason);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to process doctor consent.' });
  }
});

/**
 * POST /api/queue/load-balance/patient-consent
 * Affected patient explicitly accepts or declines a doctor transfer offer.
 */
loadBalancerRouter.post('/patient-consent', async (req: Request, res: Response): Promise<void> => {
  try {
    const { proposalId, patientId, consent, declineReason } = req.body;

    if (!proposalId || !patientId || consent === undefined || consent === null) {
      res.status(400).json({
        success: false,
        error: 'proposalId, patientId, and consent ("ACCEPT" / "DECLINE" or boolean) are required.',
      });
      return;
    }

    const isAccept = String(consent).toUpperCase() === 'ACCEPT' || consent === true || String(consent).toLowerCase() === 'true';
    const result = await loadBalancerService.respondPatientConsent(proposalId, patientId, isAccept, declineReason);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to process patient consent.' });
  }
});
