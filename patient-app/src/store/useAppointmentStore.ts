import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Appointment,
  Clinic,
  Doctor,
  HealthRecord,
  EarlierSlotSuggestion,
  AppointmentStatus,
  UploadedMedicalFile,
  DigitalPrescription,
  PreviousVisitInfo,
} from '../types';
import {
  MOCK_APPOINTMENTS,
  MOCK_CLINICS,
  MOCK_DOCTORS,
  MOCK_HEALTH_RECORDS,
} from '../data/mockData';
import { appointmentService } from '../services/appointmentService';
import { clinicService } from '../services/clinicService';
import { doctorService } from '../services/doctorService';
import { healthRecordsService } from '../services/healthRecordsService';
import { socketService } from '../services/socketService';
import { apiClient } from '../services/apiClient';
import { timeUtils } from '../utils/timeUtils';
import { useAuthStore } from './useAuthStore';

const APPOINTMENTS_KEY = '@fyp_patient_appointments';
const HEALTH_RECORDS_KEY = '@fyp_patient_health_records';
const EARLIER_SLOT_KEY = '@fyp_earlier_slot_suggestion';

interface BookingParams {
  doctor: Doctor;
  clinicId: string;
  department: string;
  date: string;
  time: string;
  reason?: string;
  customReasonText?: string;
  symptoms?: string[];
  uploadedFiles?: UploadedMedicalFile[];
  notes?: string;
  expectedDuration?: string;
  consultationFee?: string;
  tokenNumber?: string;
}

interface AppointmentStoreState {
  appointments: Appointment[];
  clinics: Clinic[];
  doctors: Doctor[];
  healthRecords: HealthRecord[];
  earlierSlotSuggestion: EarlierSlotSuggestion | null;
  isLoading: boolean;

  initializeStore: () => Promise<void>;
  resetStore: () => void;
  bookAppointment: (params: BookingParams) => Promise<Appointment>;
  cancelAppointment: (id: string, reason?: string) => Promise<void>;
  rescheduleAppointment: (id: string, date: string, time: string) => Promise<void>;
  updateAppointmentInfo: (
    id: string,
    updates: {
      reason?: string;
      customReasonText?: string;
      symptoms?: string[];
      uploadedFiles?: UploadedMedicalFile[];
      notes?: string;
    }
  ) => Promise<void>;
  acceptEarlierSlot: (appointmentId: string) => Promise<void>;
  declineEarlierSlot: (appointmentId?: string) => Promise<void>;
  updateAppointmentStatus: (id: string, status: AppointmentStatus) => Promise<void>;

  // Continuity helpers
  getPreviousVisitForClinic: (clinicId: string) => PreviousVisitInfo | null;
  getPreviousDoctorForDepartment: (departmentName: string, clinicId?: string) => Doctor | null;

  // Live Queue & Doctor simulation
  simulateQueueAdvance: (appointmentId: string) => Promise<void>;
  doctorCompleteAppointment: (appointmentId: string, prescription?: DigitalPrescription) => Promise<void>;

  // Records actions
  addHealthRecord: (record: Omit<HealthRecord, 'id'>) => Promise<void>;
}

const getPatientAppointmentsKey = () => {
  const user = useAuthStore.getState().user;
  return user?.id ? `@fyp_patient_appointments_${user.id}` : APPOINTMENTS_KEY;
};

export const useAppointmentStore = create<AppointmentStoreState>((set, get) => ({
  appointments: [],
  clinics: MOCK_CLINICS,
  doctors: MOCK_DOCTORS,
  healthRecords: [],
  earlierSlotSuggestion: null,
  isLoading: true,

  resetStore: () => {
    set({
      appointments: [],
      healthRecords: [],
      earlierSlotSuggestion: null,
    });
  },

  initializeStore: async () => {
    set({ isLoading: true });

    try {
      // 1. Fetch from backend APIs with patient isolation
      const authUser = useAuthStore.getState().user;
      const [backendAppointments, backendClinics, backendDoctors, backendRecords] = await Promise.allSettled([
        appointmentService.getAppointments(authUser?.id),
        clinicService.getClinics(),
        doctorService.getDoctors(),
        healthRecordsService.fetchRecords(authUser?.id),
      ]);

      let loadedAppointments: Appointment[] = [];
      if (backendAppointments.status === 'fulfilled') {
        const rawList = backendAppointments.value;
        const seen = new Set<string>();
        for (const a of rawList) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            loadedAppointments.push(a);
          }
        }
      } else {
        const saved = await AsyncStorage.getItem(getPatientAppointmentsKey());
        loadedAppointments = saved ? JSON.parse(saved) : [];
      }

      const loadedClinics: Clinic[] =
        backendClinics.status === 'fulfilled' && backendClinics.value.length > 0
          ? backendClinics.value
          : MOCK_CLINICS;

      const loadedDoctors: Doctor[] =
        backendDoctors.status === 'fulfilled' && backendDoctors.value.length > 0
          ? backendDoctors.value
          : MOCK_DOCTORS;

      let loadedRecords: HealthRecord[] =
        backendRecords.status === 'fulfilled' && backendRecords.value.length > 0
          ? backendRecords.value
          : [];

      if (loadedRecords.length === 0) {
        const saved = await AsyncStorage.getItem(HEALTH_RECORDS_KEY);
        loadedRecords = saved ? JSON.parse(saved) : [];
      }

      // Earlier slot suggestions are populated dynamically via backend Socket.IO events or loaded appointments
      let loadedSuggestion: EarlierSlotSuggestion | null = null;
      const aptWithOffer = loadedAppointments.find(
        (a: any) =>
          (a.earlier_slot_offered && a.earlier_slot_offered.status !== 'DECLINED' && a.earlier_slot_offered.status !== 'ACCEPTED') ||
          (a.earlierSlotOffered && a.earlierSlotOffered.status !== 'DECLINED' && a.earlierSlotOffered.status !== 'ACCEPTED')
      );
      if (aptWithOffer) {
        const offer = (aptWithOffer as any).earlier_slot_offered || (aptWithOffer as any).earlierSlotOffered;
        const timeDiff =
          offer.timeDifference ||
          timeUtils.calculateTimeDifference(aptWithOffer.time, offer.newTime);
        loadedSuggestion = {
          appointmentId: aptWithOffer.id,
          newDate: offer.newDate || timeUtils.getTodayFormatted(),
          newTime: offer.newTime,
          timeDifference: timeDiff,
          estimatedWait: offer.estimatedWait || '3 min',
        };
      }

      // Connect WebSocket for real-time synchronization
      if (authUser?.id) {
        socketService.connect(authUser.id);
      } else {
        socketService.connect();
      }

      set({
        appointments: loadedAppointments,
        clinics: loadedClinics,
        doctors: loadedDoctors,
        healthRecords: loadedRecords,
        earlierSlotSuggestion: loadedSuggestion,
        isLoading: false,
      });

      // 2. Setup Real-time WebSocket Listeners
      const handleStatusOrUpdate = async (data: any) => {
        console.log('📡 Real-time appointment update received via WebSocket:', data);
        const targetId = data?.appointmentId || data?.id;
        if (!targetId) return;

        const isCompleted = ['Completed', 'COMPLETED'].includes(data.status) || ['Completed', 'COMPLETED'].includes(data.appointmentStatus);

        set((state) => ({
          appointments: state.appointments.map((apt) => {
            if (apt.id === targetId) {
              return {
                ...apt,
                status: isCompleted ? 'Completed' : (data.status || apt.status),
                patientsAhead: isCompleted ? 0 : (data.patientsAhead !== undefined ? data.patientsAhead : apt.patientsAhead),
                queuePosition: isCompleted ? 0 : (data.queuePosition !== undefined ? data.queuePosition : apt.queuePosition),
                estimatedWait: isCompleted ? 'Completed' : (data.estimatedWait || apt.estimatedWait),
                prescriptionAvailable: data.prescriptionAvailable !== undefined ? data.prescriptionAvailable : (isCompleted ? true : apt.prescriptionAvailable),
                prescription: data.prescription || apt.prescription,
              };
            }
            return apt;
          }),
        }));

        const currentAuth = useAuthStore.getState().user;
        const targetPatientId = currentAuth?.id || data?.patientId;
        if (targetPatientId) {
          try {
            const freshAppts = await appointmentService.getAppointments(targetPatientId);
            if (Array.isArray(freshAppts) && freshAppts.length > 0) {
              set({ appointments: freshAppts });
              await AsyncStorage.setItem(getPatientAppointmentsKey(), JSON.stringify(freshAppts));
            }
          } catch (e) {
            console.warn('Background refresh appointments error:', e);
          }

          if (isCompleted || data.prescriptionAvailable) {
            try {
              const records = await healthRecordsService.fetchRecords(targetPatientId);
              set({ healthRecords: records });
            } catch (e) {
              console.warn('Background refresh records error:', e);
            }
          }
        }
      };

      socketService.subscribe('appointment:status', handleStatusOrUpdate);
      socketService.subscribe('appointment:updated', handleStatusOrUpdate);
      socketService.subscribe('consultation:completed', handleStatusOrUpdate);
      socketService.subscribe('queue:completed', handleStatusOrUpdate);

      socketService.subscribe('queue:updated', async (data: any) => {
        console.log('📡 Live queue update received via WebSocket:', data);
        const targetId = data?.appointmentId || data?.id;
        if (targetId) {
          const isCompleted = ['Completed', 'COMPLETED'].includes(data.status) || ['Completed', 'COMPLETED'].includes(data.appointmentStatus);
          set((state) => ({
            appointments: state.appointments.map((apt) => {
              if (apt.id === targetId) {
                return {
                  ...apt,
                  status: isCompleted ? 'Completed' : (data.status || apt.status),
                  patientsAhead: isCompleted ? 0 : (data.patientsAhead !== undefined ? data.patientsAhead : apt.patientsAhead),
                  queuePosition: isCompleted ? 0 : (data.queuePosition !== undefined ? data.queuePosition : apt.queuePosition),
                  estimatedWait: isCompleted ? 'Completed' : (data.estimatedWait || apt.estimatedWait),
                  prescriptionAvailable: data.prescriptionAvailable !== undefined ? data.prescriptionAvailable : apt.prescriptionAvailable,
                  prescription: data.prescription || apt.prescription,
                };
              }
              return apt;
            }),
          }));
        }

        const currentAuth = useAuthStore.getState().user;
        const targetPatientId = currentAuth?.id || data?.patientId;
        if (targetPatientId) {
          try {
            const freshAppts = await appointmentService.getAppointments(targetPatientId);
            if (Array.isArray(freshAppts) && freshAppts.length > 0) {
              set({ appointments: freshAppts });
              await AsyncStorage.setItem(getPatientAppointmentsKey(), JSON.stringify(freshAppts));
            }
          } catch {}
        }
      });

      socketService.subscribe('consultation:started', async (data: any) => {
        console.log('📡 Consultation started received via WebSocket:', data);
        const targetId = data?.appointmentId || data?.id;
        if (targetId) {
          set((state) => ({
            appointments: state.appointments.map((apt) => {
              if (apt.id === targetId) {
                return {
                  ...apt,
                  status: 'In Consultation',
                  patientsAhead: 0,
                  queuePosition: 0,
                  estimatedWait: 'In Session',
                };
              }
              return apt;
            }),
          }));
        }
        const currentAuth = useAuthStore.getState().user;
        if (currentAuth?.id) {
          const freshAppts = await appointmentService.getAppointments(currentAuth.id);
          if (freshAppts && freshAppts.length > 0) {
            set({ appointments: freshAppts });
            await AsyncStorage.setItem(getPatientAppointmentsKey(), JSON.stringify(freshAppts));
          }
        }
      });

      socketService.subscribe('doctor:delayed', (data: any) => {
        console.log('📡 Doctor delay alert received via WebSocket:', data);
        const current = get().appointments;
        const updated = current.map((apt) => {
          if (apt.id === data.appointmentId) {
            return {
              ...apt,
              status: 'Delayed' as const,
              estimatedWait: data.newEstimatedWait || `${(apt.patientsAhead || 2) * 6 + (data.delayMinutes || 15)} min (Delayed)`,
            };
          }
          return apt;
        });
        set({ appointments: updated });
      });

      const handleEarlierSlot = (data: any) => {
        console.log('📡 Earlier slot alert received via WebSocket:', data);
        const currentApt = get().appointments.find((a) => a.id === data.appointmentId);
        const timeDiff =
          currentApt && data.newTime
            ? timeUtils.calculateTimeDifference(currentApt.time, data.newTime)
            : data.timeDifference || 'Earlier today';

        set({
          earlierSlotSuggestion: {
            appointmentId: data.appointmentId,
            newDate: data.newDate || timeUtils.getTodayFormatted(),
            newTime: data.newTime,
            timeDifference: timeDiff,
            estimatedWait: data.estimatedWait || '3 min',
          },
        });
      };

      socketService.subscribe('slot:earlier_available', handleEarlierSlot);
      socketService.subscribe('earlier_slot:offered', handleEarlierSlot);

      socketService.subscribe('clinic:created', async () => {
        try {
          const freshClinics = await clinicService.getClinics();
          if (freshClinics && freshClinics.length > 0) {
            set({ clinics: freshClinics });
          }
        } catch (e) {
          console.warn('Failed to refresh clinics on clinic:created', e);
        }
      });

      socketService.subscribe('doctor:verified', async () => {
        try {
          const freshDoctors = await doctorService.getDoctors();
          if (freshDoctors && freshDoctors.length > 0) {
            set({ doctors: freshDoctors });
          }
        } catch (e) {
          console.warn('Failed to refresh doctors on doctor:verified', e);
        }
      });

      socketService.subscribe('doctor:registered', async () => {
        try {
          const freshDoctors = await doctorService.getDoctors();
          if (freshDoctors && freshDoctors.length > 0) {
            set({ doctors: freshDoctors });
          }
        } catch (e) {
          console.warn('Failed to refresh doctors on doctor:registered', e);
        }
      });

      socketService.subscribe('doctor:status_updated', (data: any) => {
        const targetDoctor = data?.doctorId || data?.doctor_id;
        const targetClinic = data?.clinicId || data?.clinic_id;
        const newStatus = (data?.status || '').toUpperCase();
        if (targetDoctor && newStatus) {
          const currentDocs = get().doctors;
          const updated = currentDocs.map((doc) => {
            const isMatch = doc.id === targetDoctor || (doc as any).doctor_id === targetDoctor;
            if (isMatch) {
              const matchesClinic = !targetClinic || !doc.clinicId || doc.clinicId === targetClinic;
              if (matchesClinic) {
                return {
                  ...doc,
                  status: newStatus,
                  liveStatus: newStatus,
                  isAvailableToday: newStatus === 'AVAILABLE',
                };
              }
            }
            return doc;
          });
          set({ doctors: updated });
        }
      });

      socketService.subscribe('appointment:created', (newApt: Appointment) => {
        const authUser = useAuthStore.getState().user;
        const aptPatientId = (newApt as any).patientId || (newApt as any).patient_id;
        if (authUser?.id && aptPatientId && aptPatientId !== authUser.id) {
          // Strict isolation: ignore other patients' appointments
          return;
        }
        const current = get().appointments;
        if (!current.some((a) => a.id === newApt.id)) {
          const updated = [newApt, ...current];
          set({ appointments: updated });
          AsyncStorage.setItem(getPatientAppointmentsKey(), JSON.stringify(updated)).catch(() => {});
        }
      });

      socketService.subscribe('appointment:cancelled', (data: any) => {
        console.log('📡 Appointment cancelled received via WebSocket:', data);
        const current = get().appointments;
        const updated = current.map((apt) => {
          if (apt.id === data.appointmentId) {
            return {
              ...apt,
              status: 'Cancelled' as const,
              appointmentStatus: 'CANCELLED',
            };
          }
          return apt;
        });
        set({ appointments: updated });
        if (get().earlierSlotSuggestion?.appointmentId === data.appointmentId) {
          set({ earlierSlotSuggestion: null });
        }
      });

      socketService.subscribe('appointment:rescheduled', (data: any) => {
        console.log('📡 Appointment rescheduled received via WebSocket:', data);
        const current = get().appointments;
        const updated = current.map((apt) => {
          if (apt.id === data.appointmentId) {
            return {
              ...apt,
              date: data.newDate || data.date || apt.date,
              time: data.newTime || data.time || apt.time,
              status: data.status || apt.status,
            };
          }
          return apt;
        });
        set({ appointments: updated });
      });

      socketService.subscribe('demo:reset', async () => {
        console.log('📡 Demo reset received via WebSocket: clearing patient appointments');
        set({ appointments: [], earlierSlotSuggestion: null });
        try {
          await AsyncStorage.removeItem(getPatientAppointmentsKey());
          await AsyncStorage.removeItem(APPOINTMENTS_KEY);
          await AsyncStorage.removeItem(EARLIER_SLOT_KEY);
        } catch (e) {
          // ignore
        }
      });
    } catch (error) {
      console.error('Failed to initialize appointment store', error);
      set({ isLoading: false });
    }
  },

  bookAppointment: async (params: BookingParams): Promise<Appointment> => {
    try {
      const newAppointment = await appointmentService.bookAppointment(params);
      const updated = [newAppointment, ...get().appointments.filter((a) => a.id !== newAppointment.id)];
      set({ appointments: updated });
      await AsyncStorage.setItem(getPatientAppointmentsKey(), JSON.stringify(updated));

      // Refresh records
      const records = await healthRecordsService.fetchRecords();
      set({ healthRecords: records });

      return newAppointment;
    } catch (err: any) {
      console.error('Booking error in appointment store:', err);
      // If backend responded with rejection (e.g. 409 conflict, 400 bad request), rethrow to UI
      if (err?.response?.status || err?.response?.data?.error) {
        throw err;
      }
      // If offline / network error without response, handle resiliently
      throw err;
    }
  },

  cancelAppointment: async (id: string, reason?: string): Promise<void> => {
    try {
      await appointmentService.cancelAppointment(id, reason);
    } catch (err) {
      console.warn('Cancel appointment API error, updating locally:', err);
    }

    const updated = get().appointments.map((apt) => {
      if (apt.id === id) {
        return { ...apt, status: 'Cancelled' as const };
      }
      return apt;
    });

    set({ appointments: updated });
    await AsyncStorage.setItem(getPatientAppointmentsKey(), JSON.stringify(updated));

    if (get().earlierSlotSuggestion?.appointmentId === id) {
      set({ earlierSlotSuggestion: null });
      await AsyncStorage.removeItem(EARLIER_SLOT_KEY);
    }
  },

  rescheduleAppointment: async (id: string, date: string, time: string): Promise<void> => {
    try {
      await appointmentService.rescheduleAppointment(id, date, time);
    } catch (err) {
      console.warn('Reschedule API error, updating locally:', err);
    }

    const updated = get().appointments.map((apt) => {
      if (apt.id === id) {
        return {
          ...apt,
          date,
          time,
          status: 'Waiting' as const,
        };
      }
      return apt;
    });

    set({ appointments: updated });
    await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(updated));
  },

  updateAppointmentInfo: async (id: string, updates: any): Promise<void> => {
    const updated = get().appointments.map((apt) => {
      if (apt.id === id) {
        return { ...apt, ...updates };
      }
      return apt;
    });
    set({ appointments: updated });
    await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(updated));
  },

  acceptEarlierSlot: async (appointmentId: string): Promise<void> => {
    const suggestion = get().earlierSlotSuggestion;
    const targetApt = get().appointments.find((a) => a.id === appointmentId);
    const newTime =
      suggestion?.newTime ||
      (targetApt as any)?.earlier_slot_offered?.newTime ||
      (targetApt as any)?.earlierSlotOffered?.newTime;
    const newDate =
      suggestion?.newDate ||
      (targetApt as any)?.earlier_slot_offered?.newDate ||
      (targetApt as any)?.earlierSlotOffered?.newDate ||
      timeUtils.getTodayFormatted();

    try {
      await appointmentService.acceptEarlierSlot(appointmentId);
    } catch (err: any) {
      if (
        err?.response?.status === 409 ||
        err?.status === 409 ||
        err?.response?.data?.code === 'SLOT_NO_LONGER_AVAILABLE' ||
        err?.message?.includes('409')
      ) {
        set({ earlierSlotSuggestion: null });
        await AsyncStorage.removeItem(EARLIER_SLOT_KEY);
        try {
          const { useNotificationStore } = await import('./useNotificationStore');
          useNotificationStore.getState().refreshNotifications();
        } catch (e) {}
        throw err;
      }
      console.warn('Accept earlier slot API error, updating locally:', err);
    }

    if (newTime) {
      const updated = get().appointments.map((apt) => {
        if (apt.id === appointmentId) {
          return {
            ...apt,
            date: newDate,
            time: newTime,
            estimatedWait: suggestion?.estimatedWait || apt.estimatedWait,
            earlier_slot_offered: undefined,
            earlierSlotOffered: undefined,
          };
        }
        return apt;
      });

      set({
        appointments: updated,
        earlierSlotSuggestion: null,
      });
      await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(updated));
    } else {
      set({ earlierSlotSuggestion: null });
    }
    await AsyncStorage.removeItem(EARLIER_SLOT_KEY);
    try {
      const { useNotificationStore } = await import('./useNotificationStore');
      useNotificationStore.getState().refreshNotifications();
    } catch (e) {}
  },

  declineEarlierSlot: async (appointmentId?: string): Promise<void> => {
    const suggestion = get().earlierSlotSuggestion;
    const targetId = appointmentId || suggestion?.appointmentId;
    if (targetId) {
      await appointmentService.declineEarlierSlot(targetId).catch(() => {});
      const updated = get().appointments.map((apt) => {
        if (apt.id === targetId) {
          return {
            ...apt,
            earlier_slot_offered: undefined,
            earlierSlotOffered: undefined,
          };
        }
        return apt;
      });
      set({
        appointments: updated,
        earlierSlotSuggestion: null,
      });
      await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(updated));
    } else {
      set({ earlierSlotSuggestion: null });
    }
    await AsyncStorage.removeItem(EARLIER_SLOT_KEY);
    try {
      const { useNotificationStore } = await import('./useNotificationStore');
      useNotificationStore.getState().refreshNotifications();
    } catch (e) {}
  },

  updateAppointmentStatus: async (id: string, status: AppointmentStatus): Promise<void> => {
    await appointmentService.updateAppointmentStatus(id, status).catch(() => {});

    const updated = get().appointments.map((apt) => {
      if (apt.id === id) {
        return { ...apt, status };
      }
      return apt;
    });
    set({ appointments: updated });
    await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(updated));
  },

  getPreviousVisitForClinic: (clinicId: string): PreviousVisitInfo | null => {
    const completedApt = get().appointments.find(
      (a) => a.clinicId === clinicId && a.status === 'Completed'
    );
    if (completedApt) {
      return {
        count: 1,
        lastDate: completedApt.date,
        doctorName: completedApt.doctorName,
        department: completedApt.department || completedApt.doctorSpecialization,
        reason: completedApt.reason || 'Consultation',
        prescriptionAvailable: !!completedApt.prescriptionAvailable,
      };
    }

    const clinic = get().clinics.find((c) => c.id === clinicId);
    if (clinic && clinic.previousVisitsCount) {
      return {
        count: clinic.previousVisitsCount,
        lastDate: clinic.lastVisitedDate || 'Recent',
        doctorName: clinic.previousDoctorName || 'Dr. Aris Thorne',
        department: clinic.category,
        reason: 'General Consultation',
        prescriptionAvailable: true,
      };
    }

    return null;
  },

  getPreviousDoctorForDepartment: (departmentName: string, clinicId?: string): Doctor | null => {
    const doctors = get().doctors;
    const isDocForClinic = (d: Doctor) => {
      if (!clinicId) return true;
      const cId = d.clinicId || (d as any).clinic_id;
      const cName = d.clinicName || (d as any).clinic_name || '';
      const affiliations = d.clinicAffiliations || (d as any).clinic_affiliations || [];
      return (
        cId === clinicId ||
        (cName && cName.toLowerCase() === clinicId.toLowerCase()) ||
        affiliations.some((a: string) => a.toLowerCase() === clinicId.toLowerCase() || a === clinicId)
      );
    };

    const matchingDoctor = doctors.find(
      (d) =>
        isDocForClinic(d) &&
        (d.specialization.toLowerCase().includes(departmentName.toLowerCase()) ||
          departmentName.toLowerCase().includes(d.specialization.toLowerCase())) &&
        (d.previousVisitsCount || 0) > 0
    );
    if (matchingDoctor) return matchingDoctor;

    const completedApt = get().appointments.find(
      (a) =>
        a.status === 'Completed' &&
        (!clinicId || a.clinicId === clinicId) &&
        (a.department?.toLowerCase() === departmentName.toLowerCase() ||
          a.doctorSpecialization.toLowerCase().includes(departmentName.toLowerCase()))
    );
    if (completedApt) {
      const doc = doctors.find((d) => d.name === completedApt.doctorName || d.id === completedApt.doctorId);
      if (doc && isDocForClinic(doc)) return doc;
    }

    return null;
  },

  simulateQueueAdvance: async (appointmentId: string): Promise<void> => {
    try {
      await apiClient.post('/simulation/advance-queue', { appointmentId });
    } catch (err) {
      console.warn('Simulation advance queue API error, simulating locally:', err);
      const updated = get().appointments.map((apt) => {
        if (apt.id === appointmentId) {
          const currentAhead = apt.patientsAhead ?? 2;
          if (currentAhead > 1) {
            return {
              ...apt,
              patientsAhead: currentAhead - 1,
              estimatedWait: `${(currentAhead - 1) * 6} min`,
              status: 'Almost Your Turn' as const,
            };
          } else if (currentAhead === 1) {
            return {
              ...apt,
              patientsAhead: 0,
              estimatedWait: 'Under 2 min',
              status: 'Next' as const,
            };
          } else if (apt.status === 'Next') {
            return {
              ...apt,
              status: 'In Consultation' as const,
              estimatedWait: 'In Progress',
            };
          }
        }
        return apt;
      });
      set({ appointments: updated });
      await AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(updated));
    }
  },

  doctorCompleteAppointment: async (appointmentId: string, prescription?: DigitalPrescription): Promise<void> => {
    try {
      await apiClient.post('/simulation/complete-consultation', {
        appointmentId,
        medicines: prescription?.medicines,
        diagnosis: prescription?.diagnosis,
        clinicalNotes: prescription?.clinicalNotes,
      });
    } catch (err) {
      console.warn('Simulation complete appointment API error, simulating locally:', err);
    }
  },

  addHealthRecord: async (record: Omit<HealthRecord, 'id'>): Promise<void> => {
    const newRecord = await healthRecordsService.addRecord(record);
    const updated = [newRecord, ...get().healthRecords];
    set({ healthRecords: updated });
    await AsyncStorage.setItem(HEALTH_RECORDS_KEY, JSON.stringify(updated));
  },
}));
