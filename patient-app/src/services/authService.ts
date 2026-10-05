import AsyncStorage from '@react-native-async-storage/async-storage';
import { Patient } from '../types';
import { apiClient } from './apiClient';
import { socketService } from './socketService';

const AUTH_STORAGE_KEY = '@patient_app_user_session';
const ONBOARDING_STORAGE_KEY = '@patient_app_onboarding';

export interface LoginParams {
  email: string;
  password: string;
}

export interface RegisterParams {
  name: string;
  email: string;
  phone: string;
  password: string;
  bloodGroup?: string;
  gender?: string;
  age?: number;
}

export interface AuthResponse {
  user: Patient;
  token: string;
}

export interface RegisterResult {
  message: string;
  requiresOtp: boolean;
  patientId?: string;
  email?: string;
  phone?: string;
  accountStatus?: string;
}

export interface VerifyOtpParams {
  phoneOrEmail: string;
  code: string;
  email?: string;
  phone?: string;
}

export const authService = {
  async login({ email, password }: LoginParams): Promise<AuthResponse> {
    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }

    try {
      const response = await apiClient.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });

      const { user, token } = response.data;
      const session: AuthResponse = { user, token };

      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      socketService.connect(user.id);

      return session;
    } catch (err: any) {
      console.error('Auth login error:', err.message);
      throw err;
    }
  },

  async register(params: RegisterParams): Promise<RegisterResult> {
    if (!params.name || !params.email || !params.phone || !params.password) {
      throw new Error('Please fill in all required registration fields.');
    }

    try {
      const response = await apiClient.post('/auth/register', {
        name: params.name.trim(),
        email: params.email.trim().toLowerCase(),
        phone: params.phone.trim(),
        password: params.password,
        bloodGroup: params.bloodGroup || 'O+',
        gender: params.gender || 'Female',
        age: params.age || 28,
      });

      return {
        message: response.data.message || 'Verification code sent to your phone/email',
        requiresOtp: true,
        patientId: response.data.patientId,
        email: response.data.email || params.email.trim().toLowerCase(),
        phone: response.data.phone || params.phone.trim(),
        accountStatus: response.data.accountStatus || 'PENDING',
      };
    } catch (err: any) {
      console.error('Auth register error:', err.message);
      throw err;
    }
  },

  async verifyOtp(phoneOrEmail: string, code: string, options?: { email?: string; phone?: string }): Promise<AuthResponse> {
    if (!code || code.length < 4) {
      throw new Error('Please enter a valid verification code.');
    }

    try {
      const response = await apiClient.post('/auth/verify-otp', {
        phoneOrEmail: phoneOrEmail.trim(),
        code: code.trim(),
        email: options?.email || (phoneOrEmail.includes('@') ? phoneOrEmail.trim() : undefined),
        phone: options?.phone || (!phoneOrEmail.includes('@') ? phoneOrEmail.trim() : undefined),
      });

      const { user, token } = response.data;
      const session: AuthResponse = { user, token };

      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      socketService.connect(user.id);

      return session;
    } catch (err: any) {
      console.error('Auth OTP verification error:', err.message);
      throw err;
    }
  },

  async forgotPassword(emailOrPhone: string): Promise<{ message: string }> {
    if (!emailOrPhone) {
      throw new Error('Please enter your registered email address or phone number.');
    }

    try {
      const response = await apiClient.post('/auth/forgot-password', {
        emailOrPhone: emailOrPhone.trim(),
      });

      return {
        message: response.data.message || 'Password reset link sent successfully.',
      };
    } catch (err: any) {
      throw err;
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    try {
      await apiClient.post('/auth/reset-password', {
        token,
        newPassword,
      });

      return { success: true };
    } catch (err: any) {
      throw err;
    }
  },

  async getCurrentSession(): Promise<AuthResponse | null> {
    try {
      const data = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (!data) return null;
      const session = JSON.parse(data) as AuthResponse;
      if (session?.user?.id) {
        socketService.connect(session.user.id);
      }
      return session;
    } catch (e) {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout').catch(() => {});
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      socketService.disconnect();
    } catch (e) {
      console.warn('Failed to clear auth session from AsyncStorage:', e);
    }
  },

  async setOnboardingCompleted(): Promise<void> {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch (e) {
      console.warn('Failed to set onboarding state:', e);
    }
  },

  async hasCompletedOnboarding(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      return val === 'true';
    } catch (e) {
      return false;
    }
  },
};
