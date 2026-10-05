import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { PatientModel, PatientEntity, DoctorModel, DoctorEntity } from '../database/models';

export interface AuthenticatedRequest extends Request {
  patient?: PatientEntity;
}

export interface AuthenticatedDoctorRequest extends Request {
  doctor?: DoctorEntity;
}

export const authenticateJwt = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication token missing or invalid format.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; email: string; role?: string };
    const patient = await PatientModel.findById(decoded.id);

    if (!patient) {
      res.status(401).json({ success: false, error: 'Patient account associated with token not found.' });
      return;
    }

    if (patient.account_status && patient.account_status !== 'ACTIVE') {
      res.status(403).json({
        success: false,
        error: `Access forbidden: Patient account is ${patient.account_status}. Please complete verification to activate account.`,
        code: 'ACCOUNT_NOT_ACTIVE',
        status: patient.account_status,
      });
      return;
    }

    req.patient = patient;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: 'Token expired. Please login again.' });
      return;
    }
    res.status(403).json({ success: false, error: 'Invalid or malformed authentication token.' });
  }
};

/**
 * Strict Doctor Role Authentication Middleware
 * Validates JWT has role: 'DOCTOR' and attaches doctor entity to req.doctor
 * Blocks operational access for doctors that are PENDING_REVIEW, UNDER_REVIEW, or REJECTED
 */
export const authenticateDoctorJwt = async (
  req: AuthenticatedDoctorRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Doctor authentication token required.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; email: string; role?: string };

    if (decoded.role !== 'DOCTOR') {
      res.status(403).json({
        success: false,
        error: 'Access forbidden: Doctor authorization required. Patient accounts cannot access Doctor endpoints.',
      });
      return;
    }

    const doctor = await DoctorModel.getById(decoded.id);
    if (!doctor) {
      res.status(401).json({ success: false, error: 'Doctor account not found.' });
      return;
    }

    // Backend Access Control: Unapproved doctors must NOT receive operational doctor access
    const isPending =
      doctor.account_status === 'PENDING_REVIEW' ||
      doctor.verification_status === 'PENDING_REVIEW' ||
      doctor.verification_status === 'UNDER_REVIEW' ||
      doctor.verification_status === 'DOCUMENTS_PENDING';
    const isRejected = doctor.account_status === 'REJECTED' || doctor.verification_status === 'REJECTED';
    const isNotActive =
      !doctor.is_verified &&
      doctor.verification_status !== 'VERIFIED' &&
      doctor.verification_status !== 'ACTIVE' &&
      doctor.account_status !== 'ACTIVE';

    if (isPending || isRejected || isNotActive) {
      res.status(403).json({
        success: false,
        error: `Access forbidden: Doctor account is ${doctor.account_status || doctor.verification_status || 'unapproved'}. Operational doctor access is denied until approved by administrator.`,
        code: 'DOCTOR_NOT_ACTIVE',
        status: doctor.account_status || doctor.verification_status,
      });
      return;
    }

    req.doctor = doctor;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: 'Session expired. Please login again.' });
      return;
    }
    res.status(403).json({ success: false, error: 'Invalid or expired doctor credentials.' });
  }
};

