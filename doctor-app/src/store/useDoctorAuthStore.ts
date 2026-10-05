import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Doctor, DoctorAvailabilityStatus, DoctorVerificationDocument } from '../types';
import { authApi, DoctorLoginPayload, DoctorRegisterPayload } from '../api/authApi';
import { doctorApi } from '../api/doctorApi';
import { DOCTOR_AUTH_STORAGE_KEY } from '../api/apiClient';

interface DoctorAuthState {
  doctor: Doctor | null;
  token: string | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  isLoading: boolean;
  isSplashTriggered: boolean;
  error: string | null;
  riskEvaluation: { riskScore: number; riskLevel: string; triggeredRules: string[] } | null;

  // Actions
  initializeAuth: () => Promise<void>;
  login: (payload: DoctorLoginPayload) => Promise<boolean>;
  register: (payload: DoctorRegisterPayload) => Promise<boolean>;
  sendOtp: (identifier: string, isPhone?: boolean) => Promise<{ success: boolean; message: string; devOtp?: string }>;
  verifyOtp: (identifier: string, otp: string, isPhone?: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateAvailability: (status: DoctorAvailabilityStatus) => Promise<void>;
  uploadVerificationDocument: (type: string, name: string, uri?: string) => Promise<boolean>;
  clearSplashTrigger: () => void;
  clearError: () => void;
}

export const useDoctorAuthStore = create<DoctorAuthState>((set, get) => ({
  doctor: null,
  token: null,
  isAuthenticated: false,
  isBootstrapping: true,
  isLoading: true,
  isSplashTriggered: false,
  error: null,
  riskEvaluation: null,

  initializeAuth: async () => {
    try {
      set({ isBootstrapping: true, isLoading: true, error: null });

      // Clean up stale legacy keys from earlier test runs
      try {
        await AsyncStorage.multiRemove([
          '@medlink_doctor_session',
          '@medlink_doctor_session_v1',
          '@medlink_doctor_session_v2',
          '@doctor_session',
          'doctor_auth',
        ]);
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem('@medlink_doctor_session');
          window.localStorage.removeItem('@medlink_doctor_session_v1');
          window.localStorage.removeItem('@medlink_doctor_session_v2');
          window.localStorage.removeItem('@doctor_session');
          window.localStorage.removeItem('doctor_auth');
        }
      } catch (e) {}

      const sessionRaw = await AsyncStorage.getItem(DOCTOR_AUTH_STORAGE_KEY);
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        if (session && session.token && session.doctor && session.doctor.id) {
          try {
            // Validate token against backend GET /api/doctors/auth/me
            const { doctor: freshDoc } = await doctorApi.getProfile();
            if (freshDoc && freshDoc.id) {
              set({
                doctor: freshDoc,
                token: session.token,
                isAuthenticated: true,
                isBootstrapping: false,
                isLoading: false,
              });
              await AsyncStorage.setItem(
                DOCTOR_AUTH_STORAGE_KEY,
                JSON.stringify({ token: session.token, doctor: freshDoc })
              );
              return;
            }
          } catch (e) {
            // Stale or invalid session - clear storage!
            await AsyncStorage.removeItem(DOCTOR_AUTH_STORAGE_KEY);
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.removeItem(DOCTOR_AUTH_STORAGE_KEY);
            }
          }
        }
      }

      // No active session -> Clean unauthenticated state
      set({
        doctor: null,
        token: null,
        isAuthenticated: false,
        isBootstrapping: false,
        isLoading: false,
      });
    } catch (e: any) {
      console.warn('Doctor auth initialization notice:', e.message);
      set({
        doctor: null,
        token: null,
        isAuthenticated: false,
        isBootstrapping: false,
        isLoading: false,
      });
    }
  },

  sendOtp: async (identifier: string, isPhone?: boolean) => {
    try {
      set({ error: null });
      const res = await authApi.sendOtp(identifier, isPhone);
      return res;
    } catch (e: any) {
      set({ error: e.message || 'Failed to send OTP.' });
      throw e;
    }
  },

  verifyOtp: async (identifier: string, otp: string, isPhone?: boolean) => {
    try {
      set({ error: null });
      const res = await authApi.verifyOtp(identifier, otp, isPhone);
      return res.verified;
    } catch (e: any) {
      set({ error: e.message || 'Invalid OTP code.' });
      return false;
    }
  },

  login: async (payload: DoctorLoginPayload) => {
    try {
      set({ isLoading: true, error: null });
      const res = await authApi.login(payload);
      set({
        doctor: res.doctor,
        token: res.token,
        isAuthenticated: true,
        isBootstrapping: false,
        isLoading: false,
      });

      await AsyncStorage.setItem(
        DOCTOR_AUTH_STORAGE_KEY,
        JSON.stringify({ token: res.token, doctor: res.doctor })
      );
      return true;
    } catch (e: any) {
      set({
        error: e.message || 'Invalid doctor login credentials.',
        isLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  },

  register: async (payload: DoctorRegisterPayload) => {
    try {
      set({ isLoading: true, error: null });
      const res = await authApi.register(payload);
      set({
        doctor: res.doctor,
        token: res.token,
        isAuthenticated: true,
        isBootstrapping: false,
        isLoading: false,
        riskEvaluation: res.riskEvaluation || null,
      });

      await AsyncStorage.setItem(
        DOCTOR_AUTH_STORAGE_KEY,
        JSON.stringify({ token: res.token, doctor: res.doctor })
      );
      return true;
    } catch (e: any) {
      set({
        error: e.message || 'Doctor registration failed.',
        isLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await AsyncStorage.removeItem(DOCTOR_AUTH_STORAGE_KEY);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(DOCTOR_AUTH_STORAGE_KEY);
      }
      set({
        doctor: null,
        token: null,
        isAuthenticated: false,
        isBootstrapping: false,
        isSplashTriggered: true,
        error: null,
        riskEvaluation: null,
      });
      try {
        const { useDoctorAppStore } = await import('./useDoctorAppStore');
        useDoctorAppStore.getState().clearActiveClinic();
      } catch {
        // dynamic import cleanup fallback
      }
    } catch (e: any) {
      console.warn('Logout notice:', e.message);
    }
  },

  clearSplashTrigger: () => set({ isSplashTriggered: false }),

  fetchProfile: async () => {
    try {
      const { doctor } = await doctorApi.getProfile();
      set({ doctor });
      const currentToken = get().token;
      if (currentToken) {
        await AsyncStorage.setItem(
          DOCTOR_AUTH_STORAGE_KEY,
          JSON.stringify({ token: currentToken, doctor })
        );
      }
    } catch (e: any) {
      console.warn('Profile fetch notice:', e.message);
    }
  },

  updateAvailability: async (status: DoctorAvailabilityStatus) => {
    try {
      const res = await doctorApi.updateAvailability(status);
      const currentDoctor = get().doctor;
      if (currentDoctor) {
        set({ doctor: { ...currentDoctor, status: res.status, is_available_today: res.isAvailableToday } });
      }
    } catch (e: any) {
      console.warn('Availability update notice:', e.message);
    }
  },

  uploadVerificationDocument: async (type: string, name: string, uri?: string) => {
    try {
      const res = await doctorApi.uploadVerificationDocument({ documentType: type, documentName: name, uri });
      return !!res.document;
    } catch (e: any) {
      console.warn('Document upload notice:', e.message);
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
