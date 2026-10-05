import axios from 'axios';

export interface AISymptomAnalysisResult {
  department: string;
  urgency: 'Primary Care' | 'Specialist Consultation' | 'Emergency Medical Care';
  summary: string;
  recommendedAction: string;
  redFlags: string[];
  providerUsed: string;
}

export interface AIPrescriptionExplanationResult {
  summary: string;
  medicationGuidance: Array<{
    name: string;
    purpose: string;
    instructions: string;
    precautions: string;
  }>;
  generalAdvice: string;
  providerUsed: string;
}

export interface AIMedicalReportSummaryResult {
  testName: string;
  keyFindingsSummary: string;
  category: string;
  patientNextSteps: string;
  providerUsed: string;
}

export interface AIConsultationSummaryResult {
  chiefComplaint: string;
  clinicalImpression: string;
  keyRecommendations: string;
  suggestedFollowUp: string;
  providerUsed: string;
}

export interface AIPatientHistorySummaryResult {
  totalVisits: number;
  recentDiagnoses: string[];
  activeMedications: string[];
  keyMedicalEvents: string;
  providerUsed: string;
}

export interface AIChatResult {
  reply: string;
  providerUsed: string;
  intent?: string;
  actionLink?: {
    type: 'map' | 'booking' | 'appointment' | 'search' | 'records' | 'clinic' | 'emergency';
    targetId?: string;
    department?: string;
    label: string;
  };
  quickReplies?: string[];
  error?: boolean;
}

class AIService {
  private getProvider(): string {
    return (process.env.AI_PROVIDER || 'local').toLowerCase();
  }

  // --------------------------------------------------------------------------
  // 1. Symptom Triage & Department Recommendation
  // --------------------------------------------------------------------------
  public async analyzeSymptoms(symptomsQuery: string): Promise<AISymptomAnalysisResult> {
    const provider = this.getProvider();
    const query = (symptomsQuery || '').toLowerCase().trim();

    // Check for critical emergency symptoms first
    const isEmergency = [
      'chest pain', 'heart attack', 'shortness of breath', 'cannot breathe',
      'unconscious', 'severe bleeding', 'stroke', 'facial drooping', 'slurred speech'
    ].some((k) => query.includes(k));

    if (isEmergency) {
      return {
        department: 'Emergency Medicine',
        urgency: 'Emergency Medical Care',
        summary: '🚨 CRITICAL ADVISORY: Potential acute emergency symptoms detected.',
        recommendedAction: 'Dial 108 / 112 immediately or proceed to the nearest Emergency Room.',
        redFlags: ['Severe distress', 'Immediate evaluation required'],
        providerUsed: 'safety-rule-engine',
      };
    }

    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are MedLink AI Clinical Assistant. Analyze symptoms and provide structured medical triage guidance. Return JSON only with keys: department, urgency, summary, recommendedAction, redFlags (array).',
              },
              { role: 'user', content: `Symptoms: "${symptomsQuery}"` },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 8000,
          }
        );

        const parsed = JSON.parse(response.data.choices[0].message.content);
        return {
          department: parsed.department || 'General Medicine',
          urgency: parsed.urgency || 'Primary Care',
          summary: parsed.summary || 'Clinical symptom analysis completed.',
          recommendedAction: parsed.recommendedAction || 'Schedule a consultation with a physician.',
          redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
          providerUsed: 'openai',
        };
      } catch (err) {
        console.warn('OpenAI API call failed, falling back to local rule engine:', (err as any).message);
      }
    } else if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await axios.post(
          url,
          {
            contents: [
              {
                parts: [
                  {
                    text: `Analyze symptoms and output JSON with keys: department, urgency, summary, recommendedAction, redFlags (array). Symptoms: "${symptomsQuery}"`,
                  },
                ],
              },
            ],
          },
          { timeout: 8000 }
        );

        const text = response.data.candidates[0].content.parts[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            department: parsed.department || 'General Medicine',
            urgency: parsed.urgency || 'Primary Care',
            summary: parsed.summary || 'Symptom triage completed.',
            recommendedAction: parsed.recommendedAction || 'Consult a medical specialist.',
            redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
            providerUsed: 'gemini',
          };
        }
      } catch (err) {
        console.warn('Gemini API call failed, falling back to local rule engine:', (err as any).message);
      }
    }

    // Local Rule Engine with Comprehensive 11-Department Mapping
    let dept = 'General Medicine';
    let urgency: 'Primary Care' | 'Specialist Consultation' | 'Emergency Medical Care' = 'Primary Care';
    let summary = 'Primary healthcare evaluation recommended for presented symptoms.';
    let action = 'Schedule an appointment with a General Physician.';

    if (
      query.includes('tooth') ||
      query.includes('teeth') ||
      query.includes('gum') ||
      query.includes('dental') ||
      query.includes('cavity') ||
      query.includes('root canal') ||
      query.includes('filling') ||
      query.includes('crown') ||
      query.includes('extraction') ||
      query.includes('scaling') ||
      query.includes('plaque') ||
      query.includes('bad breath') ||
      query.includes('oral pain') ||
      query.includes('wisdom tooth') ||
      query.includes('orthodont') ||
      query.includes('braces') ||
      query.includes('dentist')
    ) {
      dept = 'Dentistry';
      urgency = 'Specialist Consultation';
      summary = 'Intra-oral examination and specialized dental treatment (e.g. Root Canal / Dental Care) recommended.';
      action = 'Book a visit with a Dentist / Endodontist.';
    } else if (
      query.includes('heart') ||
      query.includes('pulse') ||
      query.includes('bp') ||
      query.includes('palpitations') ||
      query.includes('hypertension') ||
      query.includes('irregular heartbeat') ||
      query.includes('cardio') ||
      query.includes('ecg') ||
      query.includes('echo') ||
      query.includes('angio')
    ) {
      dept = 'Cardiology';
      urgency = 'Specialist Consultation';
      summary = 'Cardiovascular assessment and ECG monitoring advised by a Cardiologist.';
      action = 'Schedule a consultation with a Cardiology specialist.';
    } else if (
      query.includes('skin') ||
      query.includes('rash') ||
      query.includes('acne') ||
      query.includes('itching') ||
      query.includes('eczema') ||
      query.includes('psoriasis') ||
      query.includes('dandruff') ||
      query.includes('hair loss') ||
      query.includes('pigmentation') ||
      query.includes('mole') ||
      query.includes('biopsy') ||
      query.includes('derma')
    ) {
      dept = 'Dermatology';
      urgency = 'Specialist Consultation';
      summary = 'Dermatological inspection and targeted topical evaluation recommended.';
      action = 'Schedule a consultation with a Dermatologist.';
    } else if (
      query.includes('ear') ||
      query.includes('hearing') ||
      query.includes('nose') ||
      query.includes('throat') ||
      query.includes('sinus') ||
      query.includes('tonsil') ||
      query.includes('vertigo') ||
      query.includes('tinnitus') ||
      query.includes('nasal') ||
      query.includes('ent')
    ) {
      dept = 'ENT';
      urgency = 'Specialist Consultation';
      summary = 'Upper respiratory and otoscopic examination by an ENT specialist advised.';
      action = 'Schedule an appointment with an ENT specialist.';
    } else if (
      query.includes('eye') ||
      query.includes('vision') ||
      query.includes('blurred vision') ||
      query.includes('dry eyes') ||
      query.includes('itchy eyes') ||
      query.includes('red eye') ||
      query.includes('watery eyes') ||
      query.includes('cataract') ||
      query.includes('glaucoma') ||
      query.includes('lasik') ||
      query.includes('ophthalmolog')
    ) {
      dept = 'Ophthalmology';
      urgency = 'Specialist Consultation';
      summary = 'Visual acuity and ocular evaluation recommended by an Ophthalmologist.';
      action = 'Schedule an appointment with an Ophthalmology specialist.';
    } else if (
      query.includes('bone') ||
      query.includes('joint') ||
      query.includes('fracture') ||
      query.includes('knee') ||
      query.includes('back pain') ||
      query.includes('shoulder') ||
      query.includes('neck pain') ||
      query.includes('ankle') ||
      query.includes('arthritis') ||
      query.includes('sports injury') ||
      query.includes('orthopedic') ||
      query.includes('arthroscop')
    ) {
      dept = 'Orthopedics';
      urgency = 'Specialist Consultation';
      summary = 'Musculoskeletal evaluation and radiologic review advised.';
      action = 'Consult an Orthopedic surgeon.';
    } else if (
      query.includes('child') ||
      query.includes('baby') ||
      query.includes('infant') ||
      query.includes('pediatric') ||
      query.includes('vaccination')
    ) {
      dept = 'Pediatrics';
      urgency = 'Specialist Consultation';
      summary = 'Pediatric developmental check and age-tailored care recommended.';
      action = 'Consult with a Pediatric specialist.';
    } else if (
      query.includes('period') ||
      query.includes('menstrua') ||
      query.includes('pelvic') ||
      query.includes('pregnancy') ||
      query.includes('pcos') ||
      query.includes('gynecol')
    ) {
      dept = 'Gynecology';
      urgency = 'Specialist Consultation';
      summary = 'Gynecological assessment and reproductive health consultation recommended.';
      action = 'Schedule an appointment with a Gynecologist.';
    } else if (
      query.includes('migraine') ||
      query.includes('seizure') ||
      query.includes('numbness') ||
      query.includes('tingling') ||
      query.includes('tremor') ||
      query.includes('nerve') ||
      query.includes('headache') ||
      query.includes('dizziness') ||
      query.includes('neurolog')
    ) {
      dept = 'Neurology';
      urgency = 'Specialist Consultation';
      summary = 'Neurological evaluation and specialized assessment recommended.';
      action = 'Schedule an appointment with a Neurologist.';
    } else if (
      query.includes('breath') ||
      query.includes('breathing') ||
      query.includes('asthma') ||
      query.includes('wheez') ||
      query.includes('lung') ||
      query.includes('pulmon')
    ) {
      dept = 'Pulmonology';
      urgency = 'Specialist Consultation';
      summary = 'Pulmonary function and respiratory consultation recommended.';
      action = 'Schedule an appointment with a Pulmonologist.';
    } else if (
      query.includes('kidney stone') ||
      query.includes('urine') ||
      query.includes('urinary') ||
      query.includes('burning urination') ||
      query.includes('prostate') ||
      query.includes('bladder') ||
      query.includes('urolog')
    ) {
      dept = 'Urology';
      urgency = 'Specialist Consultation';
      summary = 'Urological and renal tract evaluation recommended.';
      action = 'Schedule an appointment with a Urologist.';
    } else if (
      query.includes('kidney') ||
      query.includes('renal') ||
      query.includes('dialysis') ||
      query.includes('creatinine') ||
      query.includes('nephro')
    ) {
      dept = 'Nephrology';
      urgency = 'Specialist Consultation';
      summary = 'Nephrological review and kidney care assessment recommended.';
      action = 'Schedule an appointment with a Nephrologist.';
    } else if (
      query.includes('diabetes') ||
      query.includes('thyroid') ||
      query.includes('blood sugar') ||
      query.includes('hormone') ||
      query.includes('insulin') ||
      query.includes('endocrine')
    ) {
      dept = 'Endocrinology';
      urgency = 'Specialist Consultation';
      summary = 'Endocrine and glycemic control assessment recommended.';
      action = 'Consult an Endocrinologist.';
    } else if (
      query.includes('physiotherapy') ||
      query.includes('rehab') ||
      query.includes('rehabilitation') ||
      query.includes('physio')
    ) {
      dept = 'Physiotherapy';
      urgency = 'Specialist Consultation';
      summary = 'Physiotherapy rehabilitation and mobility conditioning recommended.';
      action = 'Consult a Physiotherapist.';
    } else if (
      query.includes('anxiety') ||
      query.includes('depression') ||
      query.includes('stress') ||
      query.includes('panic') ||
      query.includes('insomnia') ||
      query.includes('mental health') ||
      query.includes('psychiat')
    ) {
      dept = 'Psychiatry';
      urgency = 'Specialist Consultation';
      summary = 'Psychiatric evaluation and mental wellness consultation recommended.';
      action = 'Consult a Psychiatrist.';
    } else if (
      query.includes('stomach') ||
      query.includes('acidity') ||
      query.includes('gastritis') ||
      query.includes('indigestion') ||
      query.includes('vomit') ||
      query.includes('diarrhea') ||
      query.includes('constipation') ||
      query.includes('abdominal') ||
      query.includes('gastro')
    ) {
      dept = 'Gastroenterology';
      urgency = 'Specialist Consultation';
      summary = 'Gastroenterological evaluation and digestive health management advised.';
      action = 'Consult a Gastroenterologist.';
    } else if (
      query.includes('fever') ||
      query.includes('cold') ||
      query.includes('flu') ||
      query.includes('fatigue') ||
      query.includes('weakness') ||
      query.includes('viral')
    ) {
      dept = 'General Medicine';
      urgency = 'Primary Care';
      summary = 'General medical evaluation and clinical diagnosis recommended.';
      action = 'Consult a General Physician.';
    }

    return {
      department: dept,
      urgency,
      summary,
      recommendedAction: action,
      redFlags: ['If symptoms worsen rapidly or acute pain develops, seek emergency care immediately.'],
      providerUsed: 'local-rule-engine',
    };
  }

  // --------------------------------------------------------------------------
  // 2. Patient Prescription Explanation
  // --------------------------------------------------------------------------
  public async explainPrescription(prescription: any): Promise<AIPrescriptionExplanationResult> {
    const provider = this.getProvider();
    const medicines = prescription.medicines || [];
    const diagnosis = prescription.diagnosis || 'Clinical Consultation';

    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are MedLink AI Clinical Communicator. Provide patient-friendly, easy-to-understand explanations of digital prescriptions. Return JSON with keys: summary, medicationGuidance (array of {name, purpose, instructions, precautions}), generalAdvice.',
              },
              { role: 'user', content: JSON.stringify({ diagnosis, medicines }) },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 8000,
          }
        );
        const parsed = JSON.parse(response.data.choices[0].message.content);
        return { ...parsed, providerUsed: 'openai' };
      } catch (err) {
        console.warn('OpenAI call failed for prescription explanation:', (err as any).message);
      }
    }

    // Local fallback
    const guidance = medicines.map((m: any) => ({
      name: m.name || 'Prescribed Medication',
      purpose: `Prescribed by Dr. ${prescription.doctor_name || 'Practitioner'} for treatment of ${diagnosis}.`,
      instructions: `Take ${m.dosage || 'as directed'} (${m.frequency || 'daily'}) for ${m.duration || 'duration of course'}. ${m.instructions || ''}`.trim(),
      precautions: 'Complete full duration as instructed. Take with adequate water after meals unless specified otherwise.',
    }));

    return {
      summary: `Prescription issued for ${diagnosis}. Contains ${medicines.length} medication(s) prescribed by Dr. ${prescription.doctor_name || 'Practitioner'}.`,
      medicationGuidance: guidance,
      generalAdvice: 'Maintain hydration, adhere strictly to prescribed dosages, and contact your doctor if any unexpected side effects occur.',
      providerUsed: 'local-rule-engine',
    };
  }

  // --------------------------------------------------------------------------
  // 3. Medical Report Summarization
  // --------------------------------------------------------------------------
  public async summarizeMedicalReport(file: any): Promise<AIMedicalReportSummaryResult> {
    const testName = file.test_name || file.file_name || 'Medical Document';
    const category = file.category || 'Diagnostic Report';

    return {
      testName,
      keyFindingsSummary: `Diagnostic file "${testName}" (${category}) uploaded for clinical records. Facility: ${file.clinic_performed || 'Diagnostic Center'}.`,
      category,
      patientNextSteps: 'Share this report with your attending doctor during your upcoming consultation for clinical interpretation.',
      providerUsed: 'local-rule-engine',
    };
  }

  // --------------------------------------------------------------------------
  // 4. Doctor Consultation Notes Summarizer
  // --------------------------------------------------------------------------
  public async summarizeConsultationNotes(notes: any): Promise<AIConsultationSummaryResult> {
    return {
      chiefComplaint: notes.reason || notes.symptoms?.join(', ') || 'General consultation',
      clinicalImpression: notes.diagnosis || 'Clinical evaluation completed',
      keyRecommendations: notes.clinicalNotes || 'Adhere to prescribed medication schedule and recommended rest.',
      suggestedFollowUp: notes.followUpDate ? `Follow up on ${notes.followUpDate}` : 'Follow up as needed if symptoms persist.',
      providerUsed: 'local-rule-engine',
    };
  }

  // --------------------------------------------------------------------------
  // 5. Doctor Patient History Summary
  // --------------------------------------------------------------------------
  public async summarizePatientHistory(history: { appointments: any[]; prescriptions: any[]; files: any[] }): Promise<AIPatientHistorySummaryResult> {
    const totalVisits = history.appointments?.length || 0;
    const recentDiagnoses = Array.from(new Set(history.prescriptions?.map((p) => p.diagnosis).filter(Boolean))) as string[];
    const activeMedications = Array.from(
      new Set(history.prescriptions?.flatMap((p) => (p.medicines || []).map((m: any) => m.name)).filter(Boolean))
    ) as string[];

    return {
      totalVisits,
      recentDiagnoses,
      activeMedications: activeMedications.slice(0, 8),
      keyMedicalEvents: `${totalVisits} previous appointment(s), ${history.prescriptions?.length || 0} digital prescription(s), and ${history.files?.length || 0} diagnostic file(s) on record.`,
      providerUsed: 'local-rule-engine',
    };
  }

  // --------------------------------------------------------------------------
  // 6. Conversational Healthcare Assistant Chat
  // --------------------------------------------------------------------------
  public async chat(params: {
    message: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    context?: {
      activeLocation?: { name?: string; locality?: string; latitude?: number; longitude?: number };
      upcomingAppointment?: any;
      patientId?: string;
    };
  }): Promise<AIChatResult> {
    const provider = this.getProvider();
    const query = (params.message || '').trim();
    const lowerQuery = query.toLowerCase();

    // 1. Critical Emergency Check (Always Top Priority)
    const isEmergency = [
      'chest pain', 'heart attack', 'shortness of breath', 'cannot breathe',
      'unconscious', 'severe bleeding', 'stroke', 'facial drooping', 'slurred speech'
    ].some((k) => lowerQuery.includes(k));

    if (isEmergency) {
      return {
        reply: '🚨 EMERGENCY MEDICAL ADVISORY: If you or someone nearby is experiencing acute symptoms such as severe chest pain, breathing difficulty, signs of stroke, severe bleeding, or loss of consciousness, please do not wait for an outpatient appointment.\n\n📞 Emergency Ambulance Helpline: Dial 108 or 112 immediately.',
        intent: 'EMERGENCY_REDIRECT',
        providerUsed: 'safety-rule-engine',
        actionLink: { type: 'emergency', label: 'Dial 108 / 112 Emergency Services' },
      };
    }

    const locality = params.context?.activeLocation?.name || params.context?.activeLocation?.locality || 'Chennai';
    const upcomingAppt = params.context?.upcomingAppointment;
    const appointmentContext = upcomingAppt
      ? `Upcoming Appointment with Dr. ${upcomingAppt.doctor_name || 'Assigned Doctor'} at ${upcomingAppt.clinic_name || 'Clinic'} on ${upcomingAppt.date} at ${upcomingAppt.time} (Status: ${upcomingAppt.status}, Token: ${upcomingAppt.token_number || 'N/A'}).`
      : 'No upcoming appointments currently scheduled.';

    // 2. OpenAI Provider Routing
    if (provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('[AIService] AI_PROVIDER=openai, but OPENAI_API_KEY is not configured in environment.');
        return {
          reply: "I'm having trouble connecting right now. Please try again.",
          providerUsed: 'openai-unconfigured',
          error: true,
        };
      }

      console.log(`[AIService] Routing chat query to OpenAI. (OPENAI_API_KEY configured=true, message="${query.slice(0, 40)}...")`);

      try {
        const systemPrompt = `You are MedLink Assistant, the clinical appointment and navigation assistant for the MedLink Healthcare Platform.

Active Patient Context:
- Active Location: ${locality}
- Appointment Information: ${appointmentContext}

Your Capabilities:
- Assist patients in discovering clinics, doctors, and departments (e.g., Ophthalmology, Dermatology, Cardiology, Pediatrics, Dentistry, Orthopedics, ENT, General Medicine).
- Provide guidance on clinic timings (standard OPD 08:00 AM - 08:00 PM), appointment booking, and checking appointment status using the Patient Context.
- Guide patients on using the MedLink app (Search, Discover Healthcare, Map View, Appointments, Health Records).
- Provide general healthcare service guidance.

Safety & Medical Directives:
- You are a non-diagnostic assistant. NEVER claim to diagnose diseases or replace a licensed doctor.
- If symptoms are described, suggest the appropriate medical specialty/department and recommend scheduling a consultation.
- If acute emergency symptoms are described (chest pain, stroke symptoms, respiratory distress, heavy bleeding, loss of consciousness), advise the patient to immediately dial 108 or 112 or visit an emergency room.
- Never invent or fabricate appointments or doctor details not present in the context. If information is unavailable, clearly state so.
- Keep responses concise, warm, helpful, and formatted with clear bullet points where helpful.`;

        const history = (params.conversationHistory || []).slice(-8).map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        }));

        const messages = [
          { role: 'system' as const, content: systemPrompt },
          ...history,
          { role: 'user' as const, content: query },
        ];

        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.5,
            max_tokens: 500,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        const reply = response.data?.choices?.[0]?.message?.content?.trim();
        if (!reply) {
          throw new Error('Received empty response content from OpenAI');
        }

        // Contextual action link detection
        let actionLink: AIChatResult['actionLink'] = undefined;
        const lowerReply = reply.toLowerCase();
        if (lowerQuery.includes('dermatolog') || lowerReply.includes('dermatolog')) {
          actionLink = { type: 'search', department: 'Dermatology', label: 'Find Dermatology Clinics' };
        } else if (lowerQuery.includes('ophthalmolog') || lowerQuery.includes('eye') || lowerReply.includes('ophthalmolog')) {
          actionLink = { type: 'search', department: 'Ophthalmology', label: 'Find Eye Clinics' };
        } else if (lowerQuery.includes('cardiolog') || lowerReply.includes('cardiolog')) {
          actionLink = { type: 'search', department: 'Cardiology', label: 'Find Cardiology Clinics' };
        } else if (lowerQuery.includes('appointment')) {
          actionLink = upcomingAppt
            ? { type: 'appointment', targetId: upcomingAppt.id, label: 'View Appointment Details' }
            : { type: 'booking', label: 'Book Consultation' };
        } else if (lowerQuery.includes('clinic') || lowerQuery.includes('nearest') || lowerReply.includes('clinic')) {
          actionLink = { type: 'map', label: 'Explore Clinics on Map' };
        }

        return {
          reply,
          providerUsed: 'openai',
          actionLink,
        };
      } catch (err: any) {
        const status = err.response?.status;
        const errorMsg = err.response?.data?.error?.message || err.message;
        console.warn(`[AIService] OpenAI chat completion failed: status=${status}, error=${errorMsg}`);

        return {
          reply: "I'm having trouble connecting right now. Please try again.",
          providerUsed: 'openai-error',
          error: true,
        };
      }
    }

    // 3. Gemini Provider Routing
    if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        console.warn('[AIService] AI_PROVIDER=gemini, but GEMINI_API_KEY is not configured in environment.');
        return {
          reply: "I'm having trouble connecting right now. Please try again.",
          providerUsed: 'gemini-unconfigured',
          error: true,
        };
      }

      console.log(`[AIService] Routing chat query to Gemini. (GEMINI_API_KEY configured=true, message="${query.slice(0, 40)}...")`);

      try {
        const geminiModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const systemInstruction = `You are MedLink Assistant, the clinical appointment and navigation assistant for the MedLink Healthcare Platform.
Active Patient Context:
- Active Location: ${locality}
- Appointment Information: ${appointmentContext}

Your Capabilities:
- Assist patients in discovering clinics, doctors, and departments (e.g., Ophthalmology, Dermatology, Cardiology, Pediatrics, Dentistry, Orthopedics, ENT, General Medicine).
- Provide guidance on clinic timings (standard OPD 08:00 AM - 08:00 PM), appointment booking, and checking appointment status using the Patient Context.
- Guide patients on using the MedLink app (Search, Discover Healthcare, Map View, Appointments, Health Records).
- Provide general healthcare service guidance.

Safety & Medical Directives:
- You are a non-diagnostic assistant. NEVER claim to diagnose diseases or replace a licensed doctor.
- If symptoms are described, suggest the appropriate medical specialty/department and recommend scheduling a consultation.
- If acute emergency symptoms are described (chest pain, stroke symptoms, respiratory distress, heavy bleeding, loss of consciousness), advise the patient to immediately dial 108 or 112 or visit an emergency room.
- Never invent or fabricate appointments or doctor details not present in the context. If information is unavailable, clearly state so.
- Keep responses concise, warm, helpful, and formatted with clear bullet points where helpful.`;

        // Format contents including history and system context
        const contents: any[] = [];

        // Prepend system guidance as initial turn
        contents.push({
          role: 'user',
          parts: [{ text: `[System Directives]\n${systemInstruction}\n\n[User Query]\n${query}` }],
        });

        let response: any;
        try {
          response = await axios.post(
            url,
            { contents },
            { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
          );
        } catch (postErr: any) {
          // If gemini-flash-latest temporarily returns 503 or 404, fallback to gemini-3.5-flash
          if (geminiModel !== 'gemini-3.5-flash') {
            const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
            response = await axios.post(
              fallbackUrl,
              { contents },
              { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
            );
          } else {
            throw postErr;
          }
        }

        const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!reply) {
          throw new Error('Received empty response content from Gemini');
        }

        // Contextual action link detection
        let actionLink: AIChatResult['actionLink'] = undefined;
        const lowerReply = reply.toLowerCase();
        if (lowerQuery.includes('dermatolog') || lowerReply.includes('dermatolog')) {
          actionLink = { type: 'search', department: 'Dermatology', label: 'Find Dermatology Clinics' };
        } else if (lowerQuery.includes('ophthalmolog') || lowerQuery.includes('eye') || lowerReply.includes('ophthalmolog')) {
          actionLink = { type: 'search', department: 'Ophthalmology', label: 'Find Eye Clinics' };
        } else if (lowerQuery.includes('cardiolog') || lowerReply.includes('cardiolog')) {
          actionLink = { type: 'search', department: 'Cardiology', label: 'Find Cardiology Clinics' };
        } else if (lowerQuery.includes('appointment')) {
          actionLink = upcomingAppt
            ? { type: 'appointment', targetId: upcomingAppt.id, label: 'View Appointment Details' }
            : { type: 'booking', label: 'Book Consultation' };
        } else if (lowerQuery.includes('clinic') || lowerQuery.includes('nearest') || lowerReply.includes('clinic')) {
          actionLink = { type: 'map', label: 'Explore Clinics on Map' };
        }

        return {
          reply,
          providerUsed: 'gemini',
          actionLink,
        };
      } catch (err: any) {
        const status = err.response?.status;
        const errorMsg = err.response?.data?.error?.message || err.message;
        console.warn(`[AIService] Gemini API call failed: status=${status}, error=${errorMsg}`);
        return {
          reply: "I'm having trouble connecting right now. Please try again.",
          providerUsed: 'gemini-error',
          error: true,
        };
      }
    }

    // 4. Local Rule Engine Fallback (when AI_PROVIDER=local)
    return this.generateLocalChatResponse(query, { locality, upcomingAppt });
  }

  // --------------------------------------------------------------------------
  // Helper: Local Rule Engine for AI_PROVIDER=local
  // --------------------------------------------------------------------------
  private generateLocalChatResponse(
    query: string,
    context: { locality: string; upcomingAppt?: any }
  ): AIChatResult {
    const text = (query || '').toLowerCase().trim();
    const { locality, upcomingAppt } = context;

    // Appointment Status
    if (
      (text.includes('appointment') || text.includes('booking') || text.includes('token') || text.includes('queue')) &&
      (text.includes('tomorrow') || text.includes('when') || text.includes('status') || text.includes('upcoming') || text.includes('next') || text.includes('my'))
    ) {
      if (upcomingAppt) {
        return {
          reply: `Your upcoming appointment is with Dr. ${upcomingAppt.doctor_name || 'your assigned doctor'} at ${upcomingAppt.clinic_name || 'the clinic'} on ${upcomingAppt.date} at ${upcomingAppt.time} (Token: ${upcomingAppt.token_number || 'N/A'}, Status: ${upcomingAppt.status}).`,
          intent: 'APPOINTMENT_STATUS',
          providerUsed: 'local-rule-engine',
          actionLink: { type: 'appointment', targetId: upcomingAppt.id, label: 'View Appointment Details' },
        };
      }
      return {
        reply: 'You have no active upcoming appointments scheduled right now. You can book an appointment through Discover Healthcare or Search.',
        intent: 'APPOINTMENT_STATUS',
        providerUsed: 'local-rule-engine',
        actionLink: { type: 'booking', label: 'Schedule Consultation' },
      };
    }

    // Clinic Hours
    if (text.includes('hours') || text.includes('timing') || text.includes('working hour') || text.includes('open') || text.includes('close')) {
      return {
        reply: `Clinics registered on MedLink typically operate standard OPD hours from 08:00 AM to 08:00 PM, Monday through Saturday. Specific clinic timings and doctor consultation slots can be viewed in each clinic's profile.`,
        intent: 'CLINIC_HOURS',
        providerUsed: 'local-rule-engine',
        actionLink: { type: 'map', label: 'Explore Clinics on Map' },
      };
    }

    // Nearest Clinic / Find Clinic
    if (text.includes('nearest clinic') || text.includes('find clinic') || text.includes('clinics near') || text.includes('which clinic') || text.includes('best clinic')) {
      return {
        reply: `I can help you discover nearby verified healthcare clinics around ${locality}. You can view clinic specialties, doctors on duty, and live road travel times using Discover Healthcare or Map View.`,
        intent: 'CLINIC_RECOMMENDATION',
        providerUsed: 'local-rule-engine',
        actionLink: { type: 'map', label: 'Explore Clinics on Map' },
      };
    }

    // Department / Specialty Taxonomy
    const deptKeywords: Record<string, { dept: string; label: string; desc: string }> = {
      dermatol: { dept: 'Dermatology', label: 'Find Dermatology Clinics', desc: 'Dermatological consultations cover acne, skin lesions, rashes, and allergy management.' },
      skin: { dept: 'Dermatology', label: 'Find Dermatology Clinics', desc: 'Dermatological consultations cover acne, skin lesions, rashes, and allergy management.' },
      eye: { dept: 'Ophthalmology', label: 'Find Eye Clinics', desc: 'Ophthalmology evaluations cover visual acuity, glaucoma, cataract checks, and eye care.' },
      ophthalmol: { dept: 'Ophthalmology', label: 'Find Eye Clinics', desc: 'Ophthalmology evaluations cover visual acuity, glaucoma, cataract checks, and eye care.' },
      heart: { dept: 'Cardiology', label: 'Find Cardiology Clinics', desc: 'Cardiology consultations assess heart health, blood pressure, ECG, and cardiovascular risk factors.' },
      cardiol: { dept: 'Cardiology', label: 'Find Cardiology Clinics', desc: 'Cardiology consultations assess heart health, blood pressure, ECG, and cardiovascular risk factors.' },
      teeth: { dept: 'Dentistry', label: 'Find Dental Clinics', desc: 'Dentistry specialists provide cavity fillings, root canals, dental cleaning, and tooth pain relief.' },
      dent: { dept: 'Dentistry', label: 'Find Dental Clinics', desc: 'Dentistry specialists provide cavity fillings, root canals, dental cleaning, and tooth pain relief.' },
      child: { dept: 'Pediatrics', label: 'Find Pediatric Clinics', desc: 'Pediatric care handles infant immunizations, child health checkups, and pediatric illnesses.' },
      pediatric: { dept: 'Pediatrics', label: 'Find Pediatric Clinics', desc: 'Pediatric care handles infant immunizations, child health checkups, and pediatric illnesses.' },
      bone: { dept: 'Orthopedics', label: 'Find Orthopedic Clinics', desc: 'Orthopedic evaluations assess joint pain, mobility, fractures, and musculoskeletal conditions.' },
      orthoped: { dept: 'Orthopedics', label: 'Find Orthopedic Clinics', desc: 'Orthopedic evaluations assess joint pain, mobility, fractures, and musculoskeletal conditions.' },
      ent: { dept: 'ENT', label: 'Find ENT Clinics', desc: 'ENT specialists evaluate ear infections, throat pain, sinusitis, and nasal blockages.' },
      ear: { dept: 'ENT', label: 'Find ENT Clinics', desc: 'ENT specialists evaluate ear infections, throat pain, sinusitis, and nasal blockages.' },
    };

    for (const [key, val] of Object.entries(deptKeywords)) {
      if (text.includes(key)) {
        return {
          reply: `Based on your request, consulting a **${val.dept}** specialist near ${locality} is recommended. ${val.desc}`,
          intent: val.dept.toUpperCase(),
          providerUsed: 'local-rule-engine',
          actionLink: { type: 'search', department: val.dept, label: val.label },
        };
      }
    }

    // Default Fallback
    return {
      reply: `Hello! I am MedLink Assistant, your healthcare navigation guide for ${locality}.\n\nI can help you with:\n• Finding specialized clinics & doctors near you\n• Checking appointment status & clinic hours\n• Navigating departments and booking consultations\n\nHow can I help you today?`,
      intent: 'GENERAL_GUIDANCE',
      providerUsed: 'local-rule-engine',
      quickReplies: ['Find nearest clinic', 'Is my appointment tomorrow?', 'Clinic hours'],
    };
  }
}

export const aiService = new AIService();
