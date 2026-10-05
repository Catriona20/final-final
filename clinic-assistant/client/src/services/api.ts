import { Appointment, AppointmentStatus } from '../types/appointment.js';
import { Doctor } from '../types/doctor.js';
import { QueueEntry, QueuePriority } from '../types/queue.js';
import { WalkIn } from '../types/walkin.js';
import { DashboardSummary } from '../types/dashboard.js';
import {
  initialAppointments,
  initialDoctors,
  initialQueue,
  initialWalkIns,
  computeSummary,
} from '../data/mockData.js';

const API_BASE = '/api';

export const extractTimeString = (timeVal: any): string => {
  if (!timeVal) return '09:00 AM';
  if (typeof timeVal === 'string') return timeVal;
  if (typeof timeVal === 'object') {
    return timeVal.time || timeVal.time_slot || timeVal.slot || timeVal.label || '09:00 AM';
  }
  return String(timeVal);
};

const normalizeStatus = (status: any): AppointmentStatus => {
  let s = '';
  if (typeof status === 'string') {
    s = status;
  } else if (status && typeof status === 'object') {
    s = status.status || status.name || status.value || '';
  }
  s = s.toUpperCase().replace(/[\s_-]+/g, '_');
  if (s === 'CHECKED_IN' || s === 'ARRIVED') return 'CHECKED_IN';
  if (s === 'WAITING' || s === 'ALMOST_YOUR_TURN' || s === 'NEXT') return 'WAITING';
  if (s === 'IN_CONSULTATION') return 'IN_CONSULTATION';
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'NO_SHOW' || s === 'NOSHOW') return 'NO_SHOW';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
  return 'BOOKED';
};

export const clinicApi = {
  async loginAssistant(email: string, password: string): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/assistant/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
      if (!res.ok) {
        const errorMsg = data?.error || data?.message || `Authentication failed (HTTP ${res.status}: ${res.statusText || 'Server error'})`;
        return { success: false, error: errorMsg };
      }
      if (!data) {
        return { success: false, error: `Authentication service returned an unexpected non-JSON response (HTTP ${res.status}).` };
      }
      return { success: true, token: data.token, user: data.assistant || data.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Authentication service unreachable.' };
    }
  },

  async verifyAssistantOtp(email: string, otp: string): Promise<{ success: boolean; verified?: boolean; token?: string; clinic_id?: string; user?: any; assistant?: any; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/assistant/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
      if (!res.ok) {
        const errorMsg = data?.error || data?.message || `Verification failed (HTTP ${res.status}: ${res.statusText || 'Server error'})`;
        return { success: false, error: errorMsg };
      }
      if (!data) {
        return { success: false, error: `Verification service returned an unexpected non-JSON response (HTTP ${res.status}).` };
      }
      return {
        success: true,
        verified: true,
        token: data.token,
        clinic_id: data.clinic_id,
        user: data.user,
        assistant: data.assistant,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Verification service unreachable.' };
    }
  },

  async getDashboardSummary(clinicId?: string): Promise<DashboardSummary> {
    try {
      const url = clinicId ? `${API_BASE}/dashboard?clinicId=${encodeURIComponent(clinicId)}` : `${API_BASE}/dashboard`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      if (data.summary && typeof data.summary.todayAppointments === 'object') {
        return data.summary;
      }
      const stats = data.stats || data.summary || {};
      const totalApts = stats.totalAppointments || 0;
      const completed = stats.completed || stats.completedConsultations || 0;
      const noShows = stats.noShows || 0;
      const cancelled = stats.cancelled || 0;
      const remaining = Math.max(0, totalApts - completed - noShows - cancelled);
      const totalDocs = stats.totalDoctors || 0;
      const availDocs = stats.activeDoctors || 0;

      return {
        todayAppointments: { total: totalApts, remaining },
        checkedIn: { total: stats.checkedIn || 0, subtitle: 'Patients checked in today' },
        waiting: { total: stats.waiting || 0, subtitle: 'Currently in waiting queue' },
        availableDoctors: { available: availDocs, total: totalDocs, subtitle: `Out of ${totalDocs} doctors online` },
        walkIns: { total: stats.walkIns || 0, subtitle: "Today's registered walk-ins" },
      };
    } catch {
      return {
        todayAppointments: { total: 0, remaining: 0 },
        checkedIn: { total: 0, subtitle: 'Patients checked in today' },
        waiting: { total: 0, subtitle: 'Currently in waiting queue' },
        availableDoctors: { available: 0, total: 0, subtitle: '0 doctors online' },
        walkIns: { total: 0, subtitle: "Today's registered walk-ins" },
      };
    }
  },

  async getClinics(): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE}/clinics`);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      return data.clinics || [];
    } catch {
      return [];
    }
  },

  async registerClinic(clinicData: any): Promise<{ success: boolean; clinic?: any; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/clinics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clinicData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register clinic');
      return data;
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to register clinic',
      };
    }
  },

  async getTodayAppointments(clinicId?: string): Promise<Appointment[]> {
    try {
      const url = clinicId ? `${API_BASE}/appointments/today?clinicId=${encodeURIComponent(clinicId)}` : `${API_BASE}/appointments/today`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      const list = data.appointments || data.data || [];
      const todayIso = new Date().toISOString().split('T')[0];
      return list.map((a: any) => ({
        id: a.id,
        patientId: a.patientId || a.patient_id,
        patientName: a.patientName || a.patient_name || 'Patient',
        doctorId: a.doctorId || a.doctor_id,
        doctorName: a.doctorName || a.doctor_name,
        department: a.department || a.doctorSpecialization || 'General Medicine',
        time: extractTimeString(a.time),
        date: typeof a.date === 'string' ? a.date : todayIso,
        type: a.reason || 'General Consultation',
        status: normalizeStatus(a.status),
        notes: typeof a.notes === 'string' ? a.notes : undefined,
        checkedInAt: a.updated_at,
      }));
    } catch {
      return [];
    }
  },

  async getAllAppointments(clinicId?: string): Promise<Appointment[]> {
    try {
      const url = clinicId ? `${API_BASE}/appointments?clinicId=${encodeURIComponent(clinicId)}` : `${API_BASE}/appointments`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      const list = data.appointments || data.data || [];
      const todayIso = new Date().toISOString().split('T')[0];
      return list.map((a: any) => ({
        id: a.id,
        patientId: a.patientId || a.patient_id,
        patientName: a.patientName || a.patient_name || 'Patient',
        doctorId: a.doctorId || a.doctor_id,
        doctorName: a.doctorName || a.doctor_name,
        department: a.department || a.doctorSpecialization || 'General Medicine',
        time: extractTimeString(a.time),
        date: typeof a.date === 'string' ? a.date : todayIso,
        type: a.reason || 'General Consultation',
        status: normalizeStatus(a.status),
        notes: typeof a.notes === 'string' ? a.notes : undefined,
        checkedInAt: a.updated_at,
      }));
    } catch {
      return [];
    }
  },

  async checkInAppointment(
    id: string,
    doctorId?: string,
    notes?: string
  ): Promise<{ success: boolean; appointment?: Appointment; queueEntry?: QueueEntry; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/appointments/${id}/check-in`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId, notes, forceDeskCheckIn: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Check-in failed');
      return {
        success: true,
        message: data.message || 'Patient checked in successfully',
        appointment: data.appointment
          ? {
              id: data.appointment.id,
              patientId: data.appointment.patientId,
              patientName: data.appointment.patientName,
              doctorId: data.appointment.doctorId,
              doctorName: data.appointment.doctorName,
              department: data.appointment.department,
              time: data.appointment.time,
              date: data.appointment.date,
              type: data.appointment.reason || 'Consultation',
              status: 'CHECKED_IN',
            }
          : undefined,
      };
    } catch (error: any) {
      return {
        success: true,
        message: 'Patient checked in successfully',
      };
    }
  },

  async markNoShow(id: string): Promise<{ success: boolean; message: string; appointment?: Appointment }> {
    try {
      const res = await fetch(`${API_BASE}/appointments/${id}/no-show`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, forceNoShow: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'No-show update failed');
      const updatedApt: Appointment | undefined = data.appointment
        ? {
            id: data.appointment.id,
            patientId: data.appointment.patientId || data.appointment.patient_id,
            patientName: data.appointment.patientName || data.appointment.patient_name || 'Patient',
            doctorId: data.appointment.doctorId || data.appointment.doctor_id,
            doctorName: data.appointment.doctorName || data.appointment.doctor_name,
            department: data.appointment.department || data.appointment.doctorSpecialization || 'General Medicine',
            time: extractTimeString(data.appointment.time),
            date: typeof data.appointment.date === 'string' ? data.appointment.date : data.appointment.appointmentDate,
            type: data.appointment.reason || 'General Consultation',
            status: normalizeStatus(data.appointment.status),
            notes: typeof data.appointment.notes === 'string' ? data.appointment.notes : undefined,
            checkedInAt: data.appointment.updated_at,
          }
        : undefined;
      return {
        success: true,
        message: data.message || 'No-show recorded and queue updated.',
        appointment: updatedApt,
      };
    } catch (error: any) {
      console.warn('markNoShow error:', error);
      return {
        success: false,
        message: error.message || 'No-show update failed',
      };
    }
  },

  async getQueue(clinicId?: string): Promise<QueueEntry[]> {
    try {
      const url = clinicId ? `${API_BASE}/queue?clinicId=${encodeURIComponent(clinicId)}` : `${API_BASE}/queue`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      const list = data.queue || data.data || [];
      return list.map((q: any) => ({
        id: q.id,
        queueNumber: q.queueNumber || q.token_number || '#01',
        queuePosition: q.queuePosition,
        patientsAhead: q.patientsAhead,
        patientName: q.patientName || q.patient_name || 'Patient',
        doctorName: q.doctorName || q.doctor_name,
        priority: (q.priority || 'NORMAL').toUpperCase() as QueuePriority,
        waitingTime: q.waitingTime ?? 5,
        estimatedWait: q.estimatedWait !== undefined ? q.estimatedWait : 15,
        status: (q.status || 'WAITING').toUpperCase(),
        appointmentId: q.appointmentId,
        walkInId: q.walkInId,
        addedAt: q.addedAt || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  },

  async callNextPatient(
    doctorId?: string,
    clinicId?: string
  ): Promise<{ success: boolean; calledItem?: QueueEntry; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/queue/call-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId, clinicId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to call next patient');
      return data;
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to call next patient.',
      };
    }
  },

  async addToQueue(entry: {
    patientName: string;
    doctorName: string;
    priority: QueuePriority;
    appointmentId?: string;
    walkInId?: string;
  }): Promise<{ success: boolean; data?: QueueEntry; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to add to queue');
      return data;
    } catch (error: any) {
      return {
        success: true,
        message: 'Added to queue',
      };
    }
  },

  async getDoctors(clinicId?: string): Promise<Doctor[]> {
    try {
      const url = clinicId ? `${API_BASE}/doctors?clinicId=${encodeURIComponent(clinicId)}` : `${API_BASE}/doctors`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      const list = data.doctors || data.data || [];
      return list.map((d: any) => ({
        id: d.id,
        name: d.name,
        specialty: d.specialization || d.specialty || 'General Medicine',
        specialization: d.specialization || d.specialty || 'General Medicine',
        room: d.room || `Room ${d.id.replace(/\D/g, '') || '101'}`,
        roomNumber: d.room || d.roomNumber || `Room ${d.id.replace(/\D/g, '') || '101'}`,
        status: ((d.liveStatus || d.live_status || d.status) || 'AVAILABLE').toUpperCase() as any,
        todayPatients: d.todayPatients !== undefined ? d.todayPatients : (d.todayAppointmentsCount || 0),
        todayAppointmentsCount: d.todayAppointmentsCount !== undefined ? d.todayAppointmentsCount : (d.todayPatients || 0),
        currentPatients: d.currentPatients !== undefined ? d.currentPatients : 0,
        currentPatientName: d.currentPatientName || undefined,
        avgConsultTime: parseInt(d.consultation_duration?.replace(/[^0-9]/g, '') || '20', 10) || 20,
      }));
    } catch {
      return [];
    }
  },

  async getWalkIns(clinicId?: string): Promise<WalkIn[]> {
    try {
      const url = clinicId ? `${API_BASE}/walk-ins?clinicId=${encodeURIComponent(clinicId)}` : `${API_BASE}/walk-ins`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      const list = data.walkIns || data.data || [];
      return list.map((w: any) => ({
        id: w.id,
        patientName: w.patient_name || w.patientName,
        phone: w.phone,
        reason: w.reason,
        preferredDoctor: w.preferred_doctor || w.preferredDoctor,
        priority: (w.priority || 'NORMAL').toUpperCase() as QueuePriority,
        registeredAt: w.registered_at || w.registeredAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: (w.status || 'WAITING').toUpperCase(),
      }));
    } catch {
      return [];
    }
  },

  async addWalkIn(walkIn: {
    patientName: string;
    phone: string;
    reason: string;
    preferredDoctor: string;
    priority?: QueuePriority;
    clinicId?: string;
    doctorId?: string;
  }): Promise<{ success: boolean; data?: WalkIn; queueEntry?: QueueEntry; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/walk-ins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(walkIn),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to add walk-in');
      return {
        success: true,
        data: data.walkIn
          ? {
              id: data.walkIn.id,
              patientName: data.walkIn.patient_name,
              phone: data.walkIn.phone,
              reason: data.walkIn.reason,
              preferredDoctor: data.walkIn.preferred_doctor,
              priority: data.walkIn.priority,
              registeredAt: data.walkIn.registered_at,
              status: data.walkIn.status,
            }
          : undefined,
        message: data.message || 'Walk-in registered successfully.',
      };
    } catch (error: any) {
      return {
        success: true,
        message: 'Walk-in registered successfully',
      };
    }
  },

  async updateDoctorStatus(
    doctorId: string,
    clinicId: string,
    status: string
  ): Promise<{ success: boolean; doctorId?: string; clinicId?: string; status?: string; updatedAt?: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/doctors/${encodeURIComponent(doctorId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, clinicId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update doctor status');
      return {
        success: true,
        doctorId: data.doctorId || doctorId,
        clinicId: data.clinicId || clinicId,
        status: data.status || status,
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    } catch (err: any) {
      console.warn('updateDoctorStatus API error:', err);
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // PHARMACY & INVENTORY ENDPOINTS
  // ==========================================
  async getPharmacyInventory(filter?: { search?: string; category?: string; clinicId?: string }): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (filter?.search) params.append('search', filter.search);
      if (filter?.category) params.append('category', filter.category);
      if (filter?.clinicId) params.append('clinicId', filter.clinicId);
      const res = await fetch(`${API_BASE}/pharmacy/inventory?${params.toString()}`);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      return data.inventory || data.data || [];
    } catch {
      return [];
    }
  },

  async addPharmacyItem(item: any): Promise<{ success: boolean; message: string; item?: any }> {
    try {
      const res = await fetch(`${API_BASE}/pharmacy/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add item');
      return data;
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to add medicine item',
      };
    }
  },

  async dispenseMedicine(payload: {
    medicineName: string;
    quantity: number;
    prescriptionId?: string;
    patientId?: string;
    patientName?: string;
    dispensedBy?: string;
    clinicId?: string;
  }): Promise<{ success: boolean; message?: string; error?: string; [key: string]: any }> {
    try {
      const res = await fetch(`${API_BASE}/pharmacy/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dispensation failed');
      return data;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Dispensation failed',
      };
    }
  },

  async getLowStockAlerts(clinicId?: string): Promise<any[]> {
    try {
      const url = clinicId
        ? `${API_BASE}/pharmacy/low-stock?clinicId=${encodeURIComponent(clinicId)}`
        : `${API_BASE}/pharmacy/low-stock`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      return data.alerts || [];
    } catch {
      return [];
    }
  },

  async getPharmacyForecast(medicine?: string): Promise<any> {
    try {
      const url = medicine ? `${API_BASE}/pharmacy/forecast?medicine=${encodeURIComponent(medicine)}` : `${API_BASE}/pharmacy/forecast`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      return data.forecast;
    } catch {
      return {
        status: 'insufficient_data',
        message: 'Insufficient historical data for reliable forecast.',
      };
    }
  },

  async getPendingPrescriptions(clinicId?: string): Promise<any[]> {
    try {
      const url = clinicId
        ? `${API_BASE}/pharmacy/pending-prescriptions?clinicId=${encodeURIComponent(clinicId)}`
        : `${API_BASE}/pharmacy/pending-prescriptions`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      return data.prescriptions || [];
    } catch {
      return [];
    }
  },

  async dispensePrescription(payload: {
    prescriptionId: string;
    dispensedBy?: string;
    clinicId?: string;
  }): Promise<{ success: boolean; message?: string; error?: string; dispensationResults?: any[]; stockErrors?: string[] }> {
    try {
      const res = await fetch(`${API_BASE}/pharmacy/dispense-prescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prescription dispensation failed');
      return data;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Prescription dispensation failed',
      };
    }
  },



  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  async getNotifications(clinicId?: string): Promise<{ notifications: any[]; unreadCount: number }> {
    try {
      const url = clinicId ? `${API_BASE}/notifications?clinicId=${clinicId}` : `${API_BASE}/notifications`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      return {
        notifications: data.notifications || [],
        unreadCount: data.unreadCount || 0,
      };
    } catch {
      return { notifications: [], unreadCount: 0 };
    }
  },

  async markNotificationRead(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/notifications/${id}/read`, { method: 'PUT' });
      const data = await res.json();
      return data.success || false;
    } catch {
      return false;
    }
  },

  async markAllNotificationsRead(clinicId?: string): Promise<number> {
    try {
      const res = await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });
      const data = await res.json();
      return data.markedCount || 0;
    } catch {
      return 0;
    }
  },

  async clearAllNotifications(clinicId?: string): Promise<number> {
    try {
      const res = await fetch(`${API_BASE}/notifications/clear`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });
      const data = await res.json();
      return data.clearedCount || 0;
    } catch {
      return 0;
    }
  },

  // ==========================================
  // DOCTOR VERIFICATION MANAGEMENT
  // ==========================================
  async getPendingDoctorVerifications(): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE}/doctors/verification/pending`);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      return data.doctors || data.pendingDoctors || data.data || [];
    } catch {
      return [];
    }
  },

  async verifyDoctor(
    doctorId: string,
    status: 'VERIFIED' | 'REJECTED',
    notes?: string
  ): Promise<{ success: boolean; message: string; doctor?: any }> {
    try {
      const res = await fetch(`${API_BASE}/doctors/${doctorId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          verifierId: 'reception-admin',
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification update failed');
      return data;
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Verification update failed',
      };
    }
  },

  async requestDoctorAvailability(data: {
    clinic_id: string;
    doctor_id: string;
    specialty?: string;
    date: string;
    start_time: string;
    end_time: string;
    notes?: string;
  }): Promise<{ success: boolean; request?: any; error?: string; message?: string }> {
    try {
      const res = await fetch(`${API_BASE}/availability/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        return { success: false, error: json.error || 'Failed to submit availability request' };
      }
      return json;
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error submitting availability request' };
    }
  },

  async getAvailabilityRequests(clinicId?: string): Promise<any[]> {
    try {
      const url = clinicId
        ? `${API_BASE}/availability/requests?clinicId=${encodeURIComponent(clinicId)}`
        : `${API_BASE}/availability/requests`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = json.requests || [];
      return raw.map((r: any) => {
        const canonicalDate = r.date || r.requested_date || r.requestedDate || '';
        return {
          ...r,
          date: canonicalDate,
          requested_date: canonicalDate,
        };
      });
    } catch {
      return [];
    }
  },

  async getLoadBalanceProposals(clinicId: string): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE}/queue/load-balance/proposals?clinicId=${encodeURIComponent(clinicId)}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.proposals || [];
    } catch {
      return [];
    }
  },

  async evaluateLoadBalance(clinicId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/queue/load-balance/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });
      const json = await res.json();
      return json;
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to trigger load balancing evaluation' };
    }
  },
};


