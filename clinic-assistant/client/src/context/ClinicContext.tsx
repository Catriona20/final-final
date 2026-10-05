import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Patient } from '../types/patient.js';
import { Doctor, DoctorStatus } from '../types/doctor.js';
import { Appointment } from '../types/appointment.js';
import { QueueEntry, QueuePriority, QueueStatus } from '../types/queue.js';
import { WalkIn } from '../types/walkin.js';
import { DashboardSummary } from '../types/dashboard.js';
import { ClinicNotification, NotificationType } from '../types/notification.js';
import { ToastMessage } from '../components/common/Toast.js';
import {
  initialPatients,
  initialDoctors,
  initialAppointments,
  initialQueue,
  initialWalkIns,
  initialNotifications,
  computeSummary,
} from '../data/mockData.js';
import { noShowService } from '../services/noShowService.js';
import { clinicApi } from '../services/api.js';

export interface ClinicFacility {
  id: string;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  category?: string;
  departments?: string[];
  open_hours?: string;
  emergencyHotline?: string;
  specialization?: string;
}

export interface OperatorProfile {
  name: string;
  role: string;
  station: string;
  shift: string;
  staffId: string;
  initials: string;
}

const DEMO_CLINIC_MAP: Record<string, { clinicId: string; name: string; clinicName: string; staffId: string; initials: string }> = {
  'assistant01@demo.medlink.test': { clinicId: 'c-demo-moon-01', name: 'Sheryl Thomas', clinicName: 'Moon Dental & Medical Clinic', staffId: 'STAFF-MDC-01', initials: 'ST' },
  'assistant02@demo.medlink.test': { clinicId: 'c-demo-apollo-02', name: 'Rahul Joseph', clinicName: 'Apollo Family Care Centre', staffId: 'STAFF-AFC-02', initials: 'RJ' },
  'assistant03@demo.medlink.test': { clinicId: 'c-demo-greenlife-03', name: 'Nisha Kumar', clinicName: "GreenLife Women's & Maternity Clinic", staffId: 'STAFF-GLW-03', initials: 'NK' },
  'assistant04@demo.medlink.test': { clinicId: 'c-demo-heart-04', name: 'Ravi Shankar', clinicName: 'Chennai Heart & Vascular Centre', staffId: 'STAFF-CHV-04', initials: 'RS' },
  'assistant05@demo.medlink.test': { clinicId: 'c-demo-vision-05', name: 'Deepak Raj', clinicName: 'VisionPlus Eye Centre', staffId: 'STAFF-VPE-05', initials: 'DR' },
  'assistant06@demo.medlink.test': { clinicId: 'c-demo-ortho-06', name: 'Lavanya S', clinicName: 'OrthoCare Chennai', staffId: 'STAFF-OCC-06', initials: 'LS' },
  'assistant07@demo.medlink.test': { clinicId: 'c-demo-skin-07', name: 'Joseph Mathew', clinicName: 'SkinSphere Dermatology', staffId: 'STAFF-SSD-07', initials: 'JM' },
  'assistant08@demo.medlink.test': { clinicId: 'c-demo-neuro-08', name: 'Priyanka Das', clinicName: 'NeuroBridge Care Clinic', staffId: 'STAFF-NBC-08', initials: 'PD' },
  'assistant09@demo.medlink.test': { clinicId: 'c-demo-nova-09', name: 'Karthik V', clinicName: 'Nova ENT Care', staffId: 'STAFF-PMS-09', initials: 'KV' },
  'assistant10@demo.medlink.test': { clinicId: 'c-demo-smile-10', name: 'Divya Raj', clinicName: 'Smile & Child Pediatric Centre', staffId: 'STAFF-SCP-10', initials: 'DR' },
  'assistant11@demo.medlink.test': { clinicId: 'c-demo-ramapuram-11', name: 'Suresh Nair', clinicName: 'Ramapuram Family Medical Centre', staffId: 'STAFF-RFM-11', initials: 'SN' },
  'assistant12@demo.medlink.test': { clinicId: 'c-demo-omr-12', name: 'Meenakshi R', clinicName: 'OMR Health City Clinic', staffId: 'STAFF-OMR-12', initials: 'MR' },
  'assistant13@demo.medlink.test': { clinicId: 'c-demo-sholinganallur-13', name: 'Anand K', clinicName: 'Sholinganallur Family Healthcare', staffId: 'STAFF-SFH-13', initials: 'AK' },
  'assistant14@demo.medlink.test': { clinicId: 'c-demo-tambaram-14', name: 'Shalini G', clinicName: 'Tambaram Prime Healthcare', staffId: 'STAFF-TPH-14', initials: 'SG' },
  'assistant15@demo.medlink.test': { clinicId: 'c-demo-chromepet-15', name: 'Vignesh B', clinicName: 'Chromepet Medical Pavilion', staffId: 'STAFF-CMP-15', initials: 'VB' },
  'assistant16@demo.medlink.test': { clinicId: 'c-demo-pallavaram-16', name: 'Reshma T', clinicName: 'Pallavaram Prime Health Clinic', staffId: 'STAFF-PPH-16', initials: 'RT' },
  'assistant17@demo.medlink.test': { clinicId: 'c-demo-ambattur-17', name: 'Arjun P', clinicName: 'Ambattur Industrial Care Clinic', staffId: 'STAFF-AIC-17', initials: 'AP' },
  'assistant18@demo.medlink.test': { clinicId: 'c-demo-besant-18', name: 'Pooja M', clinicName: 'Besant Nagar Coastal Health Care', staffId: 'STAFF-BNC-18', initials: 'PM' },
  'assistant19@demo.medlink.test': { clinicId: 'c-demo-avadi-18', name: 'Manoj S', clinicName: 'Avadi Central Care Hospital', staffId: 'STAFF-ACC-19', initials: 'MS' },
  'assistant20@demo.medlink.test': { clinicId: 'c-demo-royapuram-20', name: 'Kavitha R', clinicName: 'Royapuram Community Health Clinic', staffId: 'STAFF-RCH-20', initials: 'KR' },
  'assistant2773@demo.medlink.test': { clinicId: 'c-moon-dental-villivakkam-2773', name: 'Moon Dental Assistant', clinicName: 'Moon Dental Clinic', staffId: 'STAFF-MDC-2773', initials: 'MD' },
};

interface ClinicContextType {
  clinics: ClinicFacility[];
  activeClinicId: string;
  activeClinic: ClinicFacility | null;
  setActiveClinicId: (id: string) => void;
  registerNewClinic: (data: any) => Promise<{ success: boolean; clinic?: any; message: string }>;
  operator: OperatorProfile;
  setOperator: (op: OperatorProfile) => void;
  updateOperator: (updates: Partial<OperatorProfile>) => void;
  isAuthenticated: boolean;
  isSplashTriggered: boolean;
  clearSplashTrigger: () => void;
  authToken: string | null;
  assistantUser: any | null;
  loginAssistant: (email: string, password: string) => Promise<{ success: boolean; token?: string; user?: any; error?: string }>;
  verifyAssistantOtp: (email: string, otp: string, demoMeta?: any) => Promise<{ success: boolean; token?: string; error?: string }>;
  logoutAssistant: () => void;
  patients: Patient[];
  doctors: Doctor[];
  appointments: Appointment[];
  todayAppointments: Appointment[];
  queue: QueueEntry[];
  walkIns: WalkIn[];
  summary: DashboardSummary;
  notifications: ClinicNotification[];
  unreadNotificationsCount: number;
  toasts: ToastMessage[];
  addToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  removeToast: (id: string) => void;
  checkInAppointment: (appointmentId: string, doctorId?: string, notes?: string) => void;
  handleNoShow: (appointmentId: string) => void;
  acceptEarlierSlot: (notificationId: string) => void;
  declineEarlierSlot: (notificationId: string) => void;
  markNotificationAsRead: (notificationId: string) => void;
  clearAllNotifications: () => void;
  addPatient: (data: Omit<Patient, 'id'>) => Patient;
  addWalkIn: (data: {
    patientName: string;
    phone: string;
    reason: string;
    preferredDoctor: string;
    priority: QueuePriority;
    age?: number;
    gender?: string;
  }) => void;
  addToQueue: (data: {
    patientName: string;
    doctorName: string;
    priority: QueuePriority;
    estimatedWait?: number;
    reason?: string;
  }) => void;
  callNextPatient: (preferredDoctorName?: string) => void;
  markInConsultation: (queueId: string) => void;
  markCompleted: (queueId: string) => void;
  removeFromQueue: (queueId: string) => void;
  updateDoctorStatus: (doctorId: string, status: DoctorStatus) => Promise<void> | void;
  addAppointment: (data: Omit<Appointment, 'id' | 'status'>) => void;
  refreshData: () => Promise<void>;
  availabilityRequests: any[];
  fetchAvailabilityRequests: () => Promise<void>;
  requestDoctorAvailability: (data: {
    doctor_id: string;
    specialty?: string;
    date: string;
    start_time: string;
    end_time: string;
    notes?: string;
  }) => Promise<{ success: boolean; request?: any; error?: string }>;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export const ClinicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('medlink_assistant_token') || null;
    } catch {
      return null;
    }
  });

  const [assistantUser, setAssistantUser] = useState<any | null>(() => {
    try {
      const saved = localStorage.getItem('medlink_assistant_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('medlink_assistant_token');
    } catch {
      return false;
    }
  });

  const [isSplashTriggered, setIsSplashTriggered] = useState<boolean>(false);
  const clearSplashTrigger = useCallback(() => setIsSplashTriggered(false), []);

  const [clinics, setClinics] = useState<ClinicFacility[]>([
    { id: 'c-demo-moon-01', name: 'Moon Dental & Medical Clinic', address: '24 Luz Church Road, Mylapore, Chennai', phone: '+91 44 2498 0001', category: 'Dentistry', departments: ['Dentistry', 'General Medicine'] },
    { id: 'c-demo-apollo-02', name: 'Apollo Family Care Centre', address: '88 Healthcare Blvd, Anna Nagar, Chennai', phone: '+91 44 2621 0002', category: 'General Medicine', departments: ['General Medicine', 'Cardiology'] },
    { id: 'c-demo-greenlife-03', name: "GreenLife Women's & Maternity Clinic", address: '25 Maternity Way, Kilpauk, Chennai', phone: '+91 44 2641 0003', category: 'Gynecology', departments: ['Gynecology'] },
    { id: 'c-demo-heart-04', name: 'Chennai Heart & Vascular Centre', address: '42 Cardio Boulevard, Nungambakkam, Chennai', phone: '+91 44 2821 0004', category: 'Cardiology', departments: ['Cardiology'] },
    { id: 'c-demo-vision-05', name: 'VisionPlus Eye Centre', address: '19 Optics Road, T. Nagar, Chennai', phone: '+91 44 2834 0005', category: 'Ophthalmology', departments: ['Ophthalmology'] },
    { id: 'c-demo-ortho-06', name: 'OrthoCare Chennai', address: '56 Mount Road, Guindy, Chennai', phone: '+91 44 2661 0006', category: 'Orthopedics', departments: ['Orthopedics'] },
    { id: 'c-demo-skin-07', name: 'SkinSphere Dermatology', address: '14 Derma Plaza, Adyar, Chennai', phone: '+91 44 2441 0007', category: 'Dermatology', departments: ['Dermatology'] },
    { id: 'c-demo-neuro-08', name: 'NeuroBridge Care Clinic', address: '73 Neuro Street, Velachery, Chennai', phone: '+91 44 2235 0008', category: 'Neurology', departments: ['Neurology'] },
    { id: 'c-demo-perambur-19', name: 'Perambur Multi-Specialty Clinic', address: '45 Madhavaram High Road, Perambur, Chennai', phone: '+91 44 2656 0009', category: 'ENT', departments: ['ENT'] },
    { id: 'c-demo-smile-10', name: 'Smile & Child Pediatric Centre', address: '10 Pediatric Square, Porur, Chennai', phone: '+91 44 2476 0010', category: 'Pediatrics', departments: ['Pediatrics'] },
    { id: 'c-demo-ramapuram-11', name: 'Ramapuram Family Medical Centre', address: '12 Mount Poonamallee High Rd, Ramapuram, Chennai', phone: '+91 44 2496 0011', category: 'Cardiology', departments: ['Cardiology', 'General Medicine'] },
    { id: 'c-demo-omr-12', name: 'OMR Health City Clinic', address: '104 Rajiv Gandhi Salai, Thoraipakkam, Chennai', phone: '+91 44 2450 0012', category: 'General Medicine', departments: ['General Medicine'] },
    { id: 'c-demo-sholinganallur-13', name: 'Sholinganallur Family Healthcare', address: '33 Medavakkam High Rd, Sholinganallur, Chennai', phone: '+91 44 2453 0013', category: 'Orthopedics', departments: ['Orthopedics'] },
    { id: 'c-demo-tambaram-14', name: 'Tambaram Prime Healthcare', address: '18 GST Road, West Tambaram, Chennai', phone: '+91 44 2226 0014', category: 'Dermatology', departments: ['Dermatology'] },
    { id: 'c-demo-chromepet-15', name: 'Chromepet Medical Pavilion', address: '47 Radha Nagar Main Rd, Chromepet, Chennai', phone: '+91 44 2238 0015', category: 'ENT', departments: ['ENT'] },
    { id: 'c-demo-pallavaram-16', name: 'Pallavaram Prime Health Clinic', address: '71 GST Road, Pallavaram, Chennai', phone: '+91 44 2852 0017', category: 'General Medicine', departments: ['General Medicine'] },
    { id: 'c-demo-ambattur-17', name: 'Ambattur Industrial Care Clinic', address: '93 MTH Road, Ambattur, Chennai', phone: '+91 44 2658 0016', category: 'Pediatrics', departments: ['Pediatrics'] },
    { id: 'c-demo-besant-18', name: 'Besant Nagar Coastal Health Care', address: '15 5th Avenue, Besant Nagar, Chennai', phone: '+91 44 2491 0018', category: 'Ophthalmology', departments: ['Ophthalmology'] },
    { id: 'c-demo-avadi-18', name: 'Avadi Central Care Hospital', address: '28 CTH Road, Avadi, Chennai', phone: '+91 44 2448 0019', category: 'Neurology', departments: ['Neurology'] },
    { id: 'c-demo-royapuram-20', name: 'Royapuram Community Health Clinic', address: '64 Mannarsamy Koil St, Royapuram, Chennai', phone: '+91 44 2595 0020', category: 'General Medicine', departments: ['General Medicine'] },
    { id: 'c-moon-dental-villivakkam-2773', name: 'Moon Dental Clinic', address: '28/15, Sannathi Street, Villivakkam, Chennai, Tamil Nadu 600082', phone: '+91 44 2617 2773', category: 'Dentistry', departments: ['Dentistry'] },
  ]);

  const [activeClinicId, setActiveClinicIdState] = useState<string>(() => {
    try {
      return localStorage.getItem('medlink_active_clinic_id') || 'c-demo-moon-01';
    } catch {
      return 'c-demo-moon-01';
    }
  });

  const setActiveClinicId = useCallback((id: string) => {
    setActiveClinicIdState(id);
    try {
      localStorage.setItem('medlink_active_clinic_id', id);
    } catch {
      // ignore
    }
  }, []);

  const [operator, setOperatorState] = useState<OperatorProfile>(() => {
    try {
      const saved = localStorage.getItem('medlink_operator_profile');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      name: 'Sheryl Thomas',
      role: 'Clinic Assistant / Receptionist',
      station: 'Station 01 — Main Reception Desk',
      shift: 'Morning Shift (08:00 AM – 04:00 PM)',
      staffId: 'STAFF-MDC-01',
      initials: 'ST',
    };
  });

  const updateOperator = useCallback((updates: Partial<OperatorProfile>) => {
    setOperatorState((prev) => {
      const updated = { ...prev, ...updates };
      if (updates.name && !updates.initials) {
        const parts = updates.name.trim().split(/\s+/);
        updated.initials = parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'OP';
      }
      try {
        localStorage.setItem('medlink_operator_profile', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const setOperator = useCallback((op: OperatorProfile) => {
    setOperatorState(op);
    try {
      localStorage.setItem('medlink_operator_profile', JSON.stringify(op));
    } catch {}
  }, []);

  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [walkIns, setWalkIns] = useState<WalkIn[]>([]);
  const [notifications, setNotifications] = useState<ClinicNotification[]>([]);
  const [availabilityRequests, setAvailabilityRequests] = useState<any[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const activeClinic = useMemo(
    () => clinics.find((c) => c.id === activeClinicId) || clinics[0] || null,
    [clinics, activeClinicId]
  );

  const summary = useMemo(
    () => computeSummary(todayAppointments, doctors, walkIns, queue),
    [todayAppointments, doctors, walkIns, queue]
  );

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const addToast = useCallback((type: 'success' | 'error' | 'info', title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch real data from backend
  const refreshData = useCallback(async () => {
    try {
      const [allClinics, apts, todayApts, q, docs, walks, notifRes, reqs] = await Promise.all([
        clinicApi.getClinics(),
        clinicApi.getAllAppointments(activeClinicId),
        clinicApi.getTodayAppointments(activeClinicId),
        clinicApi.getQueue(activeClinicId),
        clinicApi.getDoctors(activeClinicId),
        clinicApi.getWalkIns(activeClinicId),
        clinicApi.getNotifications(activeClinicId),
        clinicApi.getAvailabilityRequests(activeClinicId),
      ]);

      const dedupeById = <T extends Record<string, any>>(items: T[]): T[] => {
        const seen = new Set<string>();
        return (items || []).filter((item) => {
          const key = item.id || item.queueId || item.appointmentId || item.walkInId;
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      if (allClinics && allClinics.length > 0) {
        setClinics(allClinics);
      }
      setAppointments(dedupeById(apts || []));
      setTodayAppointments(dedupeById(todayApts || []));
      setQueue(dedupeById(q || []));
      setDoctors(dedupeById(docs || []));
      setWalkIns(dedupeById(walks || []));
      if (notifRes && notifRes.notifications) {
        const formattedNotifs: ClinicNotification[] = dedupeById(
          notifRes.notifications.map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            type: (n.type === 'emergency' ? 'NO_SHOW' : n.type === 'appointment' ? 'EARLIER_SLOT' : 'INFO') as NotificationType,
            createdAt: n.timestamp || (n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'),
            read: n.read || n.is_read || false,
            appointmentId: n.appointment_id || n.action_data?.appointmentId,
          }))
        );
        setNotifications(formattedNotifs);
      } else {
        setNotifications([]);
      }
      setAvailabilityRequests(reqs || []);
    } catch (err) {
      console.warn('Backend sync warning:', err);
    }
  }, [activeClinicId]);

  const fetchAvailabilityRequests = useCallback(async () => {
    try {
      const reqs = await clinicApi.getAvailabilityRequests(activeClinicId);
      setAvailabilityRequests(reqs || []);
    } catch (err) {
      console.warn('Could not fetch availability requests:', err);
    }
  }, [activeClinicId]);

  const requestDoctorAvailability = useCallback(async (data: {
    doctor_id: string;
    specialty?: string;
    date: string;
    start_time: string;
    end_time: string;
    notes?: string;
  }) => {
    try {
      const res = await clinicApi.requestDoctorAvailability({
        ...data,
        clinic_id: activeClinicId,
      });
      if (res.success) {
        addToast('success', 'Availability Requested', 'Request sent to doctor for confirmation.');
        await fetchAvailabilityRequests();
      } else {
        addToast('error', 'Request Failed', res.error || 'Could not send availability request');
      }
      return res;
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Request failed');
      return { success: false, error: err.message };
    }
  }, [activeClinicId, addToast, fetchAvailabilityRequests]);

  const loginAssistant = async (email: string, pass: string) => {
    try {
      const res = await clinicApi.loginAssistant(email, pass);
      if (res.success) {
        const token = res.token || `jwt_ast_${Date.now()}`;
        const cleanEmail = email.toLowerCase().trim();
        const demoInfo = DEMO_CLINIC_MAP[cleanEmail];

        const targetClinicId =
          res.user?.clinic_id ||
          res.user?.clinicId ||
          demoInfo?.clinicId ||
          'c-demo-moon-01';
        const assistantName =
          res.user?.name ||
          demoInfo?.name ||
          'Sheryl Thomas';
        const staffId =
          res.user?.staff_id ||
          res.user?.id ||
          demoInfo?.staffId ||
          'STAFF-MDC-01';
        const initials =
          demoInfo?.initials ||
          res.user?.initials ||
          (assistantName
            .split(' ')
            .map((p: string) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'ST');

        const newOperator: OperatorProfile = {
          name: assistantName,
          role: 'Clinic Assistant / Receptionist',
          station: 'Station 01 — Main Reception Desk',
          shift: 'Morning Shift (08:00 AM – 04:00 PM)',
          staffId,
          initials,
        };

        const userData = {
          email: cleanEmail,
          name: assistantName,
          role: 'CLINIC_ADMIN',
          clinicId: targetClinicId,
          staffId,
        };

        setAuthToken(token);
        setAssistantUser(userData);
        setIsAuthenticated(true);
        setActiveClinicId(targetClinicId);
        setOperator(newOperator);

        try {
          localStorage.setItem('medlink_assistant_token', token);
          localStorage.setItem('medlink_assistant_user', JSON.stringify(userData));
          localStorage.setItem('medlink_active_clinic_id', targetClinicId);
          localStorage.setItem('medlink_operator_profile', JSON.stringify(newOperator));
        } catch {}

        addToast('success', 'Authentication Successful', `Welcome back, ${assistantName}.`);
        await refreshData();
        return { success: true, token, user: userData };
      }
      return { success: false, error: res.error || 'Invalid credentials' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const verifyAssistantOtp = async (email: string, _otp: string, _demoMeta?: any) => {
    // Deprecated: OTP is no longer required for clinic assistants. Direct password authentication.
    return { success: true };
  };

  const logoutAssistant = useCallback(() => {
    try {
      localStorage.removeItem('medlink_assistant_token');
      localStorage.removeItem('medlink_assistant_user');
    } catch {}
    setAuthToken(null);
    setAssistantUser(null);
    setIsAuthenticated(false);
    setIsSplashTriggered(true);
    addToast('info', 'Logged Out', 'Clinic Assistant session ended.');
  }, [addToast]);

  const registerNewClinic = async (clinicData: any) => {
    const res = await clinicApi.registerClinic(clinicData);
    if (res.success && res.clinic) {
      const canonicalClinic = {
        ...res.clinic,
        specialization: res.clinic.specialization || res.clinic.category,
        departments: res.clinic.departments || [res.clinic.category || 'Dentistry'],
      };
      setClinics((prev) => {
        const exists = prev.some((c) => c.id === canonicalClinic.id);
        return exists ? prev.map((c) => (c.id === canonicalClinic.id ? canonicalClinic : c)) : [canonicalClinic, ...prev];
      });
      setActiveClinicId(canonicalClinic.id);
      if (clinicData.operatorName) {
        updateOperator({ name: clinicData.operatorName });
      }
      await refreshData();
    }
    return res;
  };

  // Initial Load & Real-Time WebSocket Connection
  useEffect(() => {
    refreshData();

    let socket: Socket | null = null;
    try {
      const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
      socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
      });

      socket.on('connect', () => {
        console.log(`📡 Clinic Assistant connected to shared real-time backend for ${activeClinicId}`);
        socket?.emit('join:clinic', activeClinicId);
      });

      socket.on('queue:updated', (data: any) => {
        const aptId = data?.appointmentId;
        if (aptId) {
          const isCompleted = ['Completed', 'COMPLETED'].includes(data?.status) || ['Completed', 'COMPLETED'].includes(data?.appointmentStatus);
          if (isCompleted) {
            setQueue((prev) => prev.filter((q) => q.appointmentId !== aptId && q.id !== aptId && (q as any).queueId !== `q-${aptId}`));
          }
        }
        refreshData();
      });

      socket.on('queue:completed', (data: any) => {
        const aptId = data?.appointmentId;
        if (aptId) {
          setQueue((prev) => prev.filter((q) => q.appointmentId !== aptId && q.id !== aptId && (q as any).queueId !== `q-${aptId}`));
        }
        refreshData();
      });

      socket.on('consultation:completed', (data: any) => {
        const aptId = data?.appointmentId;
        if (aptId) {
          setQueue((prev) => prev.filter((q) => q.appointmentId !== aptId && q.id !== aptId && (q as any).queueId !== `q-${aptId}`));
          setTodayAppointments((prev) =>
            prev.map((apt) =>
              apt.id === aptId
                ? { ...apt, status: 'COMPLETED' as const, appointmentStatus: 'COMPLETED' as const }
                : apt
            )
          );
        }
        refreshData();
      });

      socket.on('appointment:status', (data: any) => {
        const aptId = data?.appointmentId;
        if (aptId) {
          const isCompleted = ['Completed', 'COMPLETED'].includes(data?.status) || ['Completed', 'COMPLETED'].includes(data?.appointmentStatus);
          if (isCompleted) {
            setQueue((prev) => prev.filter((q) => q.appointmentId !== aptId && q.id !== aptId && (q as any).queueId !== `q-${aptId}`));
            setTodayAppointments((prev) =>
              prev.map((apt) =>
                apt.id === aptId
                  ? { ...apt, status: 'COMPLETED' as const, appointmentStatus: 'COMPLETED' as const }
                  : apt
              )
            );
            setAppointments((prev) =>
              prev.map((apt) =>
                apt.id === aptId
                  ? { ...apt, status: 'COMPLETED' as const, appointmentStatus: 'COMPLETED' as const }
                  : apt
              )
            );
          }
        }
        refreshData();
      });

      socket.on('clinic:created', () => {
        refreshData();
      });

      socket.on('doctor:verified', () => {
        refreshData();
      });

      socket.on('doctor:registered', () => {
        refreshData();
      });

      socket.on('appointment:created', (newApt: any) => {
        refreshData();
        addToast(
          'info',
          'New Online Booking 📅',
          `${newApt.patientName || 'Patient'} booked with ${newApt.doctorName || 'Doctor'} at ${newApt.time}.`
        );
      });

      socket.on('notification:new', (newNotif: any) => {
        if (!newNotif.clinic_id || newNotif.clinic_id === activeClinicId) {
          const newItem: ClinicNotification = {
            id: newNotif.id,
            title: newNotif.title,
            message: newNotif.message,
            type: (newNotif.type === 'emergency' ? 'NO_SHOW' : 'INFO') as NotificationType,
            createdAt: 'Just now',
            read: false,
            appointmentId: newNotif.appointment_id,
          };
          setNotifications((prev) => (prev.some((n) => n.id === newItem.id) ? prev : [newItem, ...prev]));
          addToast(
            newNotif.type === 'emergency' ? 'error' : 'info',
            newNotif.title,
            newNotif.message
          );
        }
      });

      socket.on('appointment:no_show', (data: any) => {
        if (data?.appointmentId) {
          setAppointments((prev) =>
            prev.map((apt) =>
              apt.id === data.appointmentId ? { ...apt, status: 'NO_SHOW' as const, notes: 'Marked No-Show' } : apt
            )
          );
          setTodayAppointments((prev) =>
            prev.map((apt) =>
              apt.id === data.appointmentId ? { ...apt, status: 'NO_SHOW' as const, notes: 'Marked No-Show' } : apt
            )
          );
        }
        refreshData();
      });

      socket.on('appointment:cancelled', (data: any) => {
        const aptId = data?.appointmentId;
        if (aptId) {
          setQueue((prev) => prev.filter((q) => q.appointmentId !== aptId && q.id !== aptId));
          setTodayAppointments((prev) =>
            prev.map((apt) =>
              apt.id === aptId
                ? { ...apt, status: 'CANCELLED' as const, notes: data?.cancellationReason || 'Cancelled by patient' }
                : apt
            )
          );
          setAppointments((prev) =>
            prev.map((apt) =>
              apt.id === aptId
                ? { ...apt, status: 'CANCELLED' as const, notes: data?.cancellationReason || 'Cancelled by patient' }
                : apt
            )
          );
        }
        refreshData();
      });

      socket.on('appointment:rescheduled', () => {
        refreshData();
      });

      socket.on('appointment:updated', () => {
        refreshData();
      });

      socket.on('clock:updated', () => {
        refreshData();
      });

      socket.on('doctor:status_updated', (data: any) => {
        const targetDoctor = data?.doctorId || data?.doctor_id;
        const targetClinic = data?.clinicId || data?.clinic_id;
        const newStatus = (data?.status || '').toUpperCase() as DoctorStatus;
        if (targetDoctor && newStatus) {
          if (targetClinic && targetClinic !== activeClinicId) {
            return;
          }
          setDoctors((prev) =>
            prev.map((d) => {
              if (d.id === targetDoctor) {
                return {
                  ...d,
                  status: newStatus,
                  currentPatients: newStatus === 'OFFLINE' ? 0 : d.currentPatients,
                  currentPatientName: newStatus === 'OFFLINE' ? undefined : d.currentPatientName,
                };
              }
              return d;
            })
          );
        }
      });

      socket.on('doctor:availability_changed', () => {
        refreshData();
      });

      socket.on('doctor:availability_updated', () => {
        refreshData();
      });

      socket.on('availability_request:approved', (data: any) => {
        refreshData();
        const displayDate = data?.date || data?.requested_date || data?.requestedDate || 'requested date';
        const docName = data?.doctor_name || data?.doctorName || 'Doctor';
        addToast('success', 'Doctor Availability Approved! ✅', `${docName} confirmed availability for ${displayDate}.`);
      });

      socket.on('availability_request:rejected', (data: any) => {
        refreshData();
        const displayDate = data?.date || data?.requested_date || data?.requestedDate || 'requested date';
        const docName = data?.doctor_name || data?.doctorName || 'Doctor';
        addToast('info', 'Doctor Availability Declined ❌', `${docName} declined availability for ${displayDate}.`);
      });

      socket.on('availability_request:new', () => {
        refreshData();
      });

      socket.on('clinic:schedule_updated', () => {
        refreshData();
      });

      socket.on('appointment:slot_activated', () => {
        refreshData();
      });

      socket.on('demo:reset', () => {
        refreshData();
      });

      socket.on('availability_request:cleared', () => {
        refreshData();
      });

      socket.on('doctor:delay_updated', (data: any) => {
        refreshData();
        addToast('error', 'Doctor Delay Advisory ⏱️', `Doctor reported a delay of ${data.delayMinutes || 15} minutes.`);
      });
    } catch (err) {
      console.warn('Socket.IO connection failed:', err);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [activeClinicId, refreshData, addToast]);

  // Check In an Appointment
  const checkInAppointment = async (appointmentId: string, doctorId?: string, notes?: string) => {
    const targetApt = appointments.find((a) => a.id === appointmentId);
    if (!targetApt) return;

    const assignedDoc = doctors.find((d) => d.id === doctorId) ||
      doctors.find((d) => d.name === targetApt.doctorName) || {
        id: targetApt.doctorId,
        name: targetApt.doctorName,
        specialization: targetApt.department || 'General Medicine',
      };

    const updatedApts: Appointment[] = appointments.map((apt) => {
      if (apt.id === appointmentId) {
        return {
          ...apt,
          status: 'CHECKED_IN' as const,
          doctorId: assignedDoc.id,
          doctorName: assignedDoc.name,
          notes: notes || apt.notes,
          checkedInAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      }
      return apt;
    });

    // Add to waiting queue if not already in queue
    let updatedQueue = [...queue];
    const inQueue = updatedQueue.some((q) => q.appointmentId === appointmentId);
    if (!inQueue) {
      const queueNumber = `A${String(updatedQueue.length + 1).padStart(3, '0')}`;
      const newQueueEntry: QueueEntry = {
        id: `q-${Date.now()}`,
        queueNumber,
        patientName: targetApt.patientName,
        doctorName: assignedDoc.name,
        priority: 'NORMAL',
        waitingTime: 0,
        estimatedWait: updatedQueue.length * 15,
        status: 'WAITING',
        appointmentId,
        addedAt: new Date().toISOString(),
        reason: `${targetApt.type} (${targetApt.department || 'General'})`,
      };
      updatedQueue.push(newQueueEntry);
    }

    setAppointments(updatedApts);
    setQueue(updatedQueue);

    await clinicApi.checkInAppointment(appointmentId, doctorId, notes);
    refreshData();

    addToast(
      'success',
      'Patient Checked In',
      `${targetApt.patientName} checked in successfully.`
    );
  };

  // ==========================================
  // NO-SHOW + QUEUE PUSH NOTIFICATIONS
  // ==========================================

  const handleNoShow = async (appointmentId: string) => {
    const allApts = appointments.length > 0 ? appointments : todayAppointments;
    const result = noShowService.handleNoShow(appointmentId, allApts, queue, doctors);

    setAppointments(result.updatedAppointments);
    setTodayAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'NO_SHOW' as const, notes: 'Marked No-Show' } : apt
      )
    );
    setQueue(result.updatedQueue);
    setNotifications((prev) => [...result.newNotifications, ...prev]);

    const apiRes = await clinicApi.markNoShow(appointmentId);
    if (apiRes && apiRes.appointment) {
      setAppointments((prev) =>
        prev.map((apt) => (apt.id === appointmentId ? apiRes.appointment! : apt))
      );
      setTodayAppointments((prev) =>
        prev.map((apt) => (apt.id === appointmentId ? apiRes.appointment! : apt))
      );
    }
    await refreshData();

    addToast(
      'success',
      'No-Show Processed',
      'Patient marked as no-show. Queue updated.'
    );
  };

  const acceptEarlierSlot = (notificationId: string) => {
    const result = noShowService.acceptEarlierSlot(
      notificationId,
      notifications,
      appointments,
      queue
    );

    setAppointments(result.updatedAppointments);
    setQueue(result.updatedQueue);
    setNotifications(result.updatedNotifications);

    addToast(
      'success',
      'Earlier Slot Accepted',
      'Earlier slot accepted successfully.'
    );
  };

  const declineEarlierSlot = (notificationId: string) => {
    const result = noShowService.declineEarlierSlot(notificationId, notifications);

    setNotifications(result.updatedNotifications);

    addToast(
      'info',
      'Original Slot Retained',
      'Patient kept the original appointment.'
    );
  };

  const markNotificationAsRead = async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    await clinicApi.markNotificationRead(notificationId);
  };

  const clearAllNotifications = async () => {
    setNotifications([]);
    await clinicApi.clearAllNotifications(activeClinicId);
    addToast('info', 'Notifications Cleared', 'All alerts have been cleared.');
  };

  // Add Patient
  const addPatient = (data: Omit<Patient, 'id'>): Patient => {
    const newId = `PAT${String(patients.length + 1).padStart(3, '0')}`;
    const newPatient: Patient = {
      id: newId,
      ...data,
      lastVisit: data.lastVisit || 'Today',
      status: data.status || 'Active',
    };

    setPatients((prev) => [newPatient, ...prev]);
    addToast('success', 'Patient Added', `${newPatient.name} has been added to patient records.`);
    return newPatient;
  };

  // Add Walk-in
  const addWalkIn = async (data: {
    patientName: string;
    phone: string;
    reason: string;
    preferredDoctor: string;
    priority: QueuePriority;
    age?: number;
    gender?: string;
    doctorId?: string;
    clinicId?: string;
  }) => {
    const targetClinicId = data.clinicId || activeClinicId || activeClinic?.id || 'c-demo-moon-01';
    const matchedDoc = doctors.find((d) => d.id === data.doctorId || d.name === data.preferredDoctor || d.id === data.preferredDoctor);
    const targetDoctorId = data.doctorId || matchedDoc?.id;
    const targetDoctorName = matchedDoc?.name || data.preferredDoctor;

    const payload = {
      ...data,
      clinicId: targetClinicId,
      doctorId: targetDoctorId,
      preferredDoctor: targetDoctorName,
    };

    const res = await clinicApi.addWalkIn(payload);
    await refreshData();

    addToast('success', 'Walk-in Registered', `${data.patientName} registered as ${data.priority} priority.`);
    return res;
  };

  // Add to Queue manually
  const addToQueue = async (data: {
    patientName: string;
    doctorName: string;
    priority: QueuePriority;
    estimatedWait?: number;
    reason?: string;
  }) => {
    const prefix = data.priority === 'EMERGENCY' ? 'E' : data.priority === 'URGENT' ? 'U' : 'A';
    const queueNumber = `${prefix}${String(queue.length + 1).padStart(3, '0')}`;

    const newEntry: QueueEntry = {
      id: `q-${Date.now()}`,
      queueNumber,
      patientName: data.patientName,
      doctorName: data.doctorName,
      priority: data.priority,
      waitingTime: 0,
      estimatedWait:
        data.estimatedWait !== undefined
          ? data.estimatedWait
          : data.priority === 'EMERGENCY'
          ? 0
          : 15,
      status: 'WAITING',
      addedAt: new Date().toISOString(),
      reason: data.reason || 'General Consultation',
    };

    let updatedQueue = [...queue];
    if (data.priority === 'EMERGENCY') {
      updatedQueue = [newEntry, ...updatedQueue];
    } else {
      updatedQueue = [...updatedQueue, newEntry];
    }

    setQueue(updatedQueue);
    await clinicApi.addToQueue(data);
    refreshData();

    addToast('success', 'Patient Queued', `${data.patientName} (${queueNumber}) added to queue.`);
  };

  // Call Next Patient
  const callNextPatient = async (preferredDoctorName?: string) => {
    const priorityWeight: Record<QueuePriority, number> = {
      EMERGENCY: 3,
      URGENT: 2,
      NORMAL: 1,
    };

    const waitingPatients = queue
      .filter((q) => q.status === 'WAITING')
      .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

    if (waitingPatients.length === 0) {
      addToast('info', 'Queue Empty', 'There are no waiting patients in the queue.');
      return;
    }

    const nextPatient = preferredDoctorName
      ? waitingPatients.find((p) => p.doctorName === preferredDoctorName) || waitingPatients[0]
      : waitingPatients[0];

    const updatedQueue = queue.map((q) => {
      if (q.id === nextPatient.id) {
        return { ...q, status: 'IN_CONSULTATION' as QueueStatus };
      }
      return q;
    });

    setQueue(updatedQueue);

    const doc = doctors.find((d) => d.name === nextPatient.doctorName);
    await clinicApi.callNextPatient(doc?.id, activeClinicId);
    refreshData();

    addToast(
      'success',
      'Patient Called',
      `Called ${nextPatient.patientName} (${nextPatient.queueNumber}) into consultation with ${nextPatient.doctorName}.`
    );
  };

  // Mark in consultation manually
  const markInConsultation = async (queueId: string) => {
    const target = queue.find((q) => q.id === queueId);
    if (!target) return;

    setQueue((prev) =>
      prev.map((q) => (q.id === queueId ? { ...q, status: 'IN_CONSULTATION' as QueueStatus } : q))
    );

    const doc = doctors.find((d) => d.name === target.doctorName);
    await clinicApi.callNextPatient(doc?.id, activeClinicId);
    refreshData();

    addToast('info', 'In Consultation', `${target.patientName} is now in consultation.`);
  };

  // Mark Completed
  const markCompleted = (queueId: string) => {
    const target = queue.find((q) => q.id === queueId);
    if (!target) return;

    const updatedQueue = queue.map((q) => {
      if (q.id === queueId) {
        return { ...q, status: 'COMPLETED' as QueueStatus };
      }
      return q;
    });

    const updatedDocs = doctors.map((doc) => {
      if (doc.name === target.doctorName) {
        const nextWaiting = updatedQueue.find(
          (q) => q.doctorName === doc.name && q.status === 'WAITING'
        );
        return {
          ...doc,
          status: (nextWaiting ? 'AVAILABLE' : 'AVAILABLE') as DoctorStatus,
          currentPatients: 0,
          currentPatientName: undefined,
          todayPatients: (doc.todayPatients || 0) + 1,
        };
      }
      return doc;
    });

    if (target.appointmentId) {
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === target.appointmentId ? { ...a, status: 'COMPLETED' as const } : a
        )
      );
    }

    setQueue(updatedQueue);
    setDoctors(updatedDocs);

    addToast(
      'success',
      'Consultation Completed',
      `Consultation completed for ${target.patientName}.`
    );
  };

  // Remove from queue
  const removeFromQueue = (queueId: string) => {
    const target = queue.find((q) => q.id === queueId);
    setQueue((prev) => prev.filter((q) => q.id !== queueId));
    if (target) {
      addToast('info', 'Queue Updated', `${target.patientName} removed from waiting queue.`);
    }
  };

  // Update Doctor Status
  const updateDoctorStatus = async (doctorId: string, status: DoctorStatus) => {
    const targetDoc = doctors.find((d) => d.id === doctorId);
    if (!targetDoc) return;

    setDoctors((prev) =>
      prev.map((d) => {
        if (d.id === doctorId) {
          return {
            ...d,
            status,
            currentPatients: status === 'OFFLINE' ? 0 : d.currentPatients,
            currentPatientName: status === 'OFFLINE' ? undefined : d.currentPatientName,
          };
        }
        return d;
      })
    );

    try {
      const res = await clinicApi.updateDoctorStatus(doctorId, activeClinicId, status);
      if (!res.success) {
        console.warn('Backend doctor status update notice:', res.error);
      }
    } catch (err) {
      console.warn('Backend doctor status update failed:', err);
    }

    addToast(
      'info',
      'Doctor Status Changed',
      `${targetDoc.name} status updated to ${status}.`
    );
  };

  // Add Appointment
  const addAppointment = (data: Omit<Appointment, 'id' | 'status'>) => {
    const newId = `APT${String(appointments.length + 1).padStart(3, '0')}`;
    const newApt: Appointment = {
      id: newId,
      status: 'BOOKED',
      ...data,
      date: data.date || '2026-08-21',
    };

    setAppointments((prev) => [...prev, newApt]);
    addToast('success', 'Appointment Booked', `Appointment ${newId} scheduled for ${newApt.patientName}.`);
  };

  return (
    <ClinicContext.Provider
      value={{
        clinics,
        activeClinicId,
        activeClinic,
        setActiveClinicId,
        registerNewClinic,
        operator,
        setOperator,
        updateOperator,
        isAuthenticated,
        isSplashTriggered,
        clearSplashTrigger,
        authToken,
        assistantUser,
        loginAssistant,
        verifyAssistantOtp,
        logoutAssistant,
        patients,
        doctors,
        appointments,
        todayAppointments,
        queue,
        walkIns,
        summary,
        notifications,
        unreadNotificationsCount,
        toasts,
        addToast,
        removeToast,
        checkInAppointment,
        handleNoShow,
        acceptEarlierSlot,
        declineEarlierSlot,
        markNotificationAsRead,
        clearAllNotifications,
        addPatient,
        addWalkIn,
        addToQueue,
        callNextPatient,
        markInConsultation,
        markCompleted,
        removeFromQueue,
        updateDoctorStatus,
        addAppointment,
        refreshData,
        availabilityRequests,
        fetchAvailabilityRequests,
        requestDoctorAvailability,
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
};

export const useClinic = (): ClinicContextType => {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
};
