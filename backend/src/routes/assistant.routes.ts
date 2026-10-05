import { Router, Request, Response } from 'express';
import { ClinicModel, DoctorModel, AppointmentModel, AnnouncementModel, MedicalFileModel, PrescriptionModel } from '../database/models';
import { googleMapsBackendService, HEALTHCARE_TERM_MAP } from '../services/googleMapsBackendService';
import { recommendationEngine } from '../services/recommendationEngine';
import { aiService } from '../services/aiService';

export const assistantRouter = Router();

// Safety emergency keywords
const EMERGENCY_KEYWORDS = [
  'chest pain',
  'heart attack',
  'stroke',
  'shortness of breath',
  'cannot breathe',
  'severe bleeding',
  'unconscious',
  'unresponsive',
  'emergency',
  'choking',
  'poison',
  'seizure',
  'severe allergic reaction',
  'anaphylaxis',
  'sudden loss of vision',
  'facial drooping',
  'slurred speech',
  'severe trauma',
  'head trauma',
  'suicidal',
  'self harm',
  '108',
  '112',
  'ambulance',
];

// Department taxonomy rules
const DEPARTMENT_EXPLANATIONS: Record<string, { department: string; why: string; urgency: string }> = {
  Ophthalmology: {
    department: 'Ophthalmology',
    why: 'An Ophthalmology consultation evaluates visual acuity, intraocular pressure, and retinal health under specialized diagnostic instruments.',
    urgency: 'Specialist Consultation',
  },
  Cardiology: {
    department: 'Cardiology',
    why: 'A Cardiology specialist assesses cardiac rhythm, arterial pressure, and circulatory health with resting ECG and clinical diagnostics.',
    urgency: 'Specialist Consultation',
  },
  Dermatology: {
    department: 'Dermatology',
    why: 'A Dermatologist specializes in dermatological diagnostics and targeted therapeutic management for epidermal, acne, and scalp conditions.',
    urgency: 'Specialist Consultation',
  },
  Dentistry: {
    department: 'Dentistry',
    why: 'A Dental surgeon provides intra-oral examination, digital radiographs, cavity restoration, periodontal care, and pain relief.',
    urgency: 'Specialist Consultation',
  },
  ENT: {
    department: 'ENT',
    why: 'An ENT specialist evaluates upper respiratory passages, tympanic membrane otoscopy, and sinus inflammation.',
    urgency: 'Specialist Consultation',
  },
  Pediatrics: {
    department: 'Pediatrics',
    why: 'A Pediatrician assesses pediatric developmental parameters, immunization scheduling, and age-adjusted pharmacology.',
    urgency: 'Specialist Consultation',
  },
  Orthopedics: {
    department: 'Orthopedics',
    why: 'An Orthopedic specialist provides musculoskeletal evaluations, joint mobility tests, and radiologic reviews.',
    urgency: 'Specialist Consultation',
  },
  Gynecology: {
    department: 'Gynecology',
    why: 'A Gynecologist / Obstetrician provides comprehensive reproductive healthcare, hormonal assessments, and pelvic monitoring.',
    urgency: 'Specialist Consultation',
  },
  Neurology: {
    department: 'Neurology',
    why: 'A Neurologist conducts cranial nerve reflex evaluations, neuro-vascular checks, and targeted migraine therapy.',
    urgency: 'Specialist Consultation',
  },
  Gastroenterology: {
    department: 'Gastroenterology',
    why: 'A Gastroenterologist investigates gastrointestinal conditions, abdominal symptoms, acid reflux, and digestive health.',
    urgency: 'Specialist Consultation',
  },
  Pulmonology: {
    department: 'Pulmonology',
    why: 'A Pulmonologist evaluates lung capacity, bronchial airflow, asthma, and chronic respiratory disorders.',
    urgency: 'Specialist Consultation',
  },
  Nephrology: {
    department: 'Nephrology',
    why: 'A Nephrologist evaluates kidney function, fluid balance, electrolyte profiles, and chronic renal care.',
    urgency: 'Specialist Consultation',
  },
  Endocrinology: {
    department: 'Endocrinology',
    why: 'An Endocrinologist specializes in metabolic health, glycemic control, thyroid diagnostics, and hormonal disorders.',
    urgency: 'Specialist Consultation',
  },
  Urology: {
    department: 'Urology',
    why: 'A Urologist provides surgical and medical evaluation of urinary tract health, lithotripsy, and renal tract conditions.',
    urgency: 'Specialist Consultation',
  },
  Physiotherapy: {
    department: 'Physiotherapy',
    why: 'A Physiotherapist provides targeted physical rehabilitation, musculoskeletal conditioning, posture correction, and pain relief.',
    urgency: 'Specialist Consultation',
  },
  Psychiatry: {
    department: 'Psychiatry',
    why: 'A Psychiatrist provides comprehensive psychiatric evaluation, mental wellness support, psychotherapy, and clinical pharmacology.',
    urgency: 'Specialist Consultation',
  },
  'General Medicine': {
    department: 'General Medicine',
    why: 'A General Physician offers comprehensive primary care, initial diagnostic assessment, prescription management, and specialist triage.',
    urgency: 'Primary Care Consultation',
  },
};

// POST /api/assistant/query
assistantRouter.post('/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, patientId = 'pat-101', latitude = 13.0338, longitude = 80.2677 } = req.body;
    const text = (query || '').trim().toLowerCase();

    // 1. Safety Emergency Check
    if (EMERGENCY_KEYWORDS.some((k) => text.includes(k))) {
      res.status(200).json({
        success: true,
        intent: 'EMERGENCY_REDIRECT',
        isEmergency: true,
        department: null,
        message:
          '🚨 EMERGENCY MEDICAL ADVISORY: If you or someone nearby is experiencing acute emergency symptoms, please do not wait for an outpatient appointment. Dial 108 or 112 immediately.',
        recommendedAction: 'Emergency Medical Care (Dial 108 / 112)',
        actionLink: { type: 'emergency', label: 'Open Emergency Hospitals Map' },
      });
      return;
    }

    // 2. Announcements Inquiry
    if (
      text.includes('announcement') ||
      text.includes('update') ||
      text.includes('notice') ||
      text.includes('holiday') ||
      text.includes('clinic change')
    ) {
      const announcements = await AnnouncementModel.getAll();
      res.status(200).json({
        success: true,
        intent: 'ANNOUNCEMENT_QUERY',
        isEmergency: false,
        department: null,
        announcements,
        message: `Active Healthcare Announcements: ${announcements.map((a) => `• ${a.title}: ${a.summary}`).join('\n')}`,
      });
      return;
    }

    // 3. Health Records & Prescriptions
    if (
      text.includes('prescription') ||
      text.includes('rx') ||
      text.includes('record') ||
      text.includes('report') ||
      text.includes('past visit') ||
      text.includes('previous visit')
    ) {
      const files = await MedicalFileModel.getByPatientId(patientId);
      const prescriptions = await PrescriptionModel.getByPatientId(patientId);
      res.status(200).json({
        success: true,
        intent: 'HEALTH_RECORDS',
        isEmergency: false,
        department: null,
        recordsCount: files.length + prescriptions.length,
        message: `You have ${files.length} uploaded test reports and ${prescriptions.length} digital prescriptions in your account.`,
        actionLink: { type: 'records', label: 'View Health Records & Prescriptions' },
      });
      return;
    }

    // 4. Appointment Status
    if (
      (text.includes('appointment') || text.includes('booking') || text.includes('queue') || text.includes('token')) &&
      (text.includes('when') || text.includes('where') || text.includes('who') || text.includes('status') || text.includes('upcoming'))
    ) {
      const appts = await AppointmentModel.getByPatientId(patientId);
      const upcoming = appts.find((a) => ['Waiting', 'Confirmed', 'Checked In', 'In Consultation'].includes(a.status));
      if (upcoming) {
        res.status(200).json({
          success: true,
          intent: 'APPOINTMENT_STATUS',
          isEmergency: false,
          appointment: upcoming,
          message: `Your upcoming appointment is with ${upcoming.doctor_name} at ${upcoming.clinic_name} on ${upcoming.date} at ${upcoming.time} (Token: ${upcoming.token_number}, Status: ${upcoming.status}).`,
          actionLink: { type: 'appointment', targetId: upcoming.id, label: 'View Appointment Details' },
        });
        return;
      }
      res.status(200).json({
        success: true,
        intent: 'APPOINTMENT_STATUS',
        isEmergency: false,
        appointment: null,
        message: 'You have no active upcoming appointments scheduled right now.',
        actionLink: { type: 'booking', label: 'Schedule Consultation' },
      });
      return;
    }

    // 5. Clinic Recommendation
    if (
      text.includes('which clinic') ||
      text.includes('recommend a clinic') ||
      text.includes('best clinic') ||
      text.includes('top clinic')
    ) {
      const discovered = await googleMapsBackendService.discoverClinics('all', latitude, longitude, 15);
      const ranked = recommendationEngine.rankClinics(discovered, null);
      const top = ranked[0];

      res.status(200).json({
        success: true,
        intent: 'CLINIC_RECOMMENDATION',
        isEmergency: false,
        recommendedClinic: top,
        message: `Top recommended clinic near your location is ${top?.name} (Score: ${Math.round((top?.recommendationScore || 0.9) * 100)}%, ETA: ${top?.travelTime}, Distance: ${top?.distance}).`,
        actionLink: { type: 'clinic', targetId: top?.id, label: `View ${top?.name}` },
      });
      return;
    }

    // 6. Department / Symptom Matching
    const normalized = googleMapsBackendService.normalizeQuery(text);
    const matchedDept = DEPARTMENT_EXPLANATIONS[normalized.category] || DEPARTMENT_EXPLANATIONS['General Medicine'];

    if (normalized.normalizedTerm !== 'all clinics') {
      res.status(200).json({
        success: true,
        intent: normalized.category.toUpperCase(),
        isEmergency: false,
        department: matchedDept.department,
        why: matchedDept.why,
        recommendedAction: matchedDept.urgency,
        message: `Based on your inquiry, consulting an ${matchedDept.department} specialist is recommended. ${matchedDept.why}`,
        actionLink: {
          type: 'search',
          department: matchedDept.department,
          label: `Find ${matchedDept.department} Specialists Near Me`,
        },
      });
      return;
    }

    // 7. Unknown / Fallback
    res.status(200).json({
      success: true,
      intent: 'UNKNOWN',
      isEmergency: false,
      department: null,
      message:
        'I can help you find a clinic, choose a department, check an appointment, view health records, or understand common healthcare guidance. What would you like help with?',
    });
  } catch (err: any) {
    console.error('Assistant query error:', err);
    res.status(500).json({ success: false, error: 'Failed to process healthcare assistant query.' });
  }
});

// POST /api/assistant/chat
assistantRouter.post('/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, query, conversationHistory, context } = req.body;
    const userMessage = (message || query || '').toString().trim();

    if (!userMessage) {
      res.status(400).json({ success: false, error: 'Message payload is required for chat.' });
      return;
    }

    const result = await aiService.chat({
      message: userMessage,
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      context: context || {},
    });

    res.status(200).json({
      success: !result.error,
      reply: result.reply,
      provider: result.providerUsed,
      intent: result.intent,
      actionLink: result.actionLink,
      quickReplies: result.quickReplies,
      error: result.error,
    });
  } catch (err: any) {
    console.error('Assistant chat endpoint error:', err);
    res.status(500).json({
      success: false,
      reply: "I'm having trouble connecting right now. Please try again.",
      error: 'Failed to process assistant chat.',
    });
  }
});

