import { create } from 'zustand';
import { AuthState, Patient } from '../types';
import { authService, LoginParams, RegisterParams } from '../services/authService';
import { patientService } from '../services/patientService';
import { useNotificationStore } from './useNotificationStore';

interface AuthStoreActions {
  initializeAuth: () => Promise<void>;
  login: (params: LoginParams) => Promise<void>;
  register: (params: RegisterParams) => Promise<any>;
  verifyOtp: (phoneOrEmail: string, code: string, options?: { email?: string; phone?: string }) => Promise<void>;
  forgotPassword: (emailOrPhone: string) => Promise<void>;
  resetPassword: (token: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updatedData: Partial<Patient>) => void;
  setHasCompletedOnboarding: (val: boolean) => Promise<void>;
  clearPendingVerification: () => void;
  isSplashTriggered: boolean;
  clearSplashTrigger: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState & AuthStoreActions>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isInitializing: true,
  isSplashTriggered: false,
  error: null,
  hasCompletedOnboarding: false,
  pendingVerification: null,

  initializeAuth: async () => {
    set({ isInitializing: true, error: null });
    try {
      const hasOnboarded = await authService.hasCompletedOnboarding();
      const session = await authService.getCurrentSession();

      if (session && session.token && session.user && (session.user as any).account_status !== 'PENDING') {
        set({
          user: session.user,
          token: session.token,
          isAuthenticated: true,
          hasCompletedOnboarding: true,
          isLoading: false,
          isInitializing: false,
        });
        useNotificationStore.getState().fetchNotifications().catch(() => {});
      } else {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          hasCompletedOnboarding: hasOnboarded,
          isLoading: false,
          isInitializing: false,
        });
      }
    } catch (err: any) {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isInitializing: false,
        error: err.message || 'Initialization error',
      });
    }
  },

  login: async (params: LoginParams) => {
    set({ isLoading: true, error: null });
    try {
      const session = await authService.login(params);
      set({
        user: session.user,
        token: session.token,
        isAuthenticated: true,
        isLoading: false,
        pendingVerification: null,
      });
      useNotificationStore.getState().fetchNotifications().catch(() => {});
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Failed to login' });
      throw err;
    }
  },

  register: async (params: RegisterParams) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authService.register(params);
      set({
        isLoading: false,
        error: null,
        pendingVerification: {
          patientId: res.patientId,
          phoneOrEmail: res.email || params.email.trim().toLowerCase(),
          phone: res.phone || params.phone.trim(),
          email: res.email || params.email.trim().toLowerCase(),
          purpose: 'register',
        },
      });
      return res;
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Failed to register' });
      throw err;
    }
  },

  verifyOtp: async (phoneOrEmail: string, code: string, options?: { email?: string; phone?: string }) => {
    set({ isLoading: true, error: null });
    try {
      const session = await authService.verifyOtp(phoneOrEmail, code, options);
      set({
        user: session.user,
        token: session.token,
        isAuthenticated: true,
        isLoading: false,
        pendingVerification: null,
        error: null,
      });
      useNotificationStore.getState().fetchNotifications().catch(() => {});
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Invalid OTP code' });
      throw err;
    }
  },

  clearPendingVerification: () => set({ pendingVerification: null }),

  forgotPassword: async (emailOrPhone: string) => {
    set({ isLoading: true, error: null });
    try {
      await authService.forgotPassword(emailOrPhone);
      set({ isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Error requesting password reset' });
      throw err;
    }
  },

  resetPassword: async (token: string, pass: string) => {
    set({ isLoading: true, error: null });
    try {
      await authService.resetPassword(token, pass);
      set({ isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Error resetting password' });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    await authService.logout();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      isSplashTriggered: true,
    });
    useNotificationStore.getState().clearAll();
  },

  clearSplashTrigger: () => set({ isSplashTriggered: false }),

  updateProfile: (updatedData: Partial<Patient>) => {
    const current = get().user;
    if (current) {
      const updated = { ...current, ...updatedData };
      set({ user: updated });
      patientService.updateProfile(updatedData).catch(() => {});
    }
  },

  setHasCompletedOnboarding: async (val: boolean) => {
    await authService.setOnboardingCompleted();
    set({ hasCompletedOnboarding: val });
  },

  clearError: () => set({ error: null }),
}));
