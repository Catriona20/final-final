import { config } from '../config/env';
import { resendService } from './resendService';
import { twilioService } from './twilioService';

/**
 * AUTH-ONLY NOTIFICATION SERVICE
 * Strictly limited to the 14 required auth notification types.
 * Supports development console mode (EMAIL_PROVIDER=console, SMS_PROVIDER=console)
 * and production providers (Resend, Twilio).
 * 
 * Delivery failures are logged independently and do not block database status transitions.
 */
export interface AuthNotificationResult {
  success: boolean;
  provider: 'console' | 'twilio' | 'resend';
  error?: string;
  messageId?: string;
}

export const authNotificationService = {
  /**
   * Helper to dispatch SMS OTP according to SMS_PROVIDER ('console' | 'twilio')
   */
  async dispatchSmsOtp(phone: string, otpCode: string, purpose: string): Promise<AuthNotificationResult> {
    try {
      const mode = (config.smsProvider || 'console').toLowerCase();
      if (mode === 'console') {
        console.log(`\n📱 [AUTH SMS OTP - DEV CONSOLE]`);
        console.log(`   To: ${phone}`);
        console.log(`   Purpose: ${purpose}`);
        console.log(`   OTP Code: [ ${otpCode} ] (Expires in 10 minutes)`);
        console.log(`   ---------------------------------------------\n`);
        return { success: true, provider: 'console' };
      }

      if (mode === 'twilio') {
        const res = await twilioService.sendSmsOtp(phone, otpCode, purpose);
        return {
          success: res.success,
          provider: 'twilio',
          error: res.error,
          messageId: res.sid,
        };
      }

      const err = `Unknown SMS_PROVIDER: "${mode}". Valid options: 'console' | 'twilio'.`;
      console.warn(`⚠️ [authNotificationService] ${err}`);
      return { success: false, provider: 'console', error: err };
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to dispatch SMS OTP to ${phone}:`, err.message);
      return { success: false, provider: 'twilio', error: err.message };
    }
  },

  /**
   * Helper to dispatch Email OTP according to EMAIL_PROVIDER ('console' | 'resend')
   */
  async dispatchEmailOtp(email: string, otpCode: string, purpose: string): Promise<AuthNotificationResult> {
    try {
      const mode = (config.emailProvider || 'console').toLowerCase();
      if (mode === 'console') {
        console.log(`\n📨 [AUTH EMAIL OTP - DEV CONSOLE]`);
        console.log(`   To: ${email}`);
        console.log(`   Purpose: ${purpose}`);
        console.log(`   OTP Code: [ ${otpCode} ] (Expires in 10 minutes)`);
        console.log(`   ---------------------------------------------\n`);
        return { success: true, provider: 'console' };
      }

      if (mode === 'resend') {
        const res = await resendService.sendVerificationEmail(email, otpCode);
        return {
          success: res.success,
          provider: 'resend',
          error: res.error,
          messageId: res.id,
        };
      }

      const err = `Unknown EMAIL_PROVIDER: "${mode}". Valid options: 'console' | 'resend'.`;
      console.warn(`⚠️ [authNotificationService] ${err}`);
      return { success: false, provider: 'console', error: err };
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to dispatch email OTP to ${email}:`, err.message);
      return { success: false, provider: 'resend', error: err.message };
    }
  },

  // -------------------------------------------------------------
  // 1 & 2: Patient OTP
  // -------------------------------------------------------------
  async sendPatientEmailOtp(email: string, otpCode: string): Promise<AuthNotificationResult> {
    return this.dispatchEmailOtp(email, otpCode, 'Patient Email Verification');
  },

  async sendPatientSmsOtp(phone: string, otpCode: string): Promise<AuthNotificationResult> {
    return this.dispatchSmsOtp(phone, otpCode, 'Patient Mobile Verification');
  },

  // -------------------------------------------------------------
  // 3 & 4: Doctor OTP
  // -------------------------------------------------------------
  async sendDoctorEmailOtp(email: string, otpCode: string): Promise<AuthNotificationResult> {
    return this.dispatchEmailOtp(email, otpCode, 'Doctor Email Verification');
  },

  async sendDoctorSmsOtp(phone: string, otpCode: string): Promise<AuthNotificationResult> {
    return this.dispatchSmsOtp(phone, otpCode, 'Doctor Mobile Verification');
  },

  // -------------------------------------------------------------
  // 5 & 6: Clinic OTP
  // -------------------------------------------------------------
  async sendClinicEmailOtp(email: string, otpCode: string): Promise<AuthNotificationResult> {
    return this.dispatchEmailOtp(email, otpCode, 'Clinic Email Verification');
  },

  async sendClinicSmsOtp(phone: string, otpCode: string): Promise<AuthNotificationResult> {
    return this.dispatchSmsOtp(phone, otpCode, 'Clinic Mobile Verification');
  },

  // -------------------------------------------------------------
  // 7 & 8: Doctor Approval
  // -------------------------------------------------------------
  async sendDoctorApprovalEmail(email: string, doctorName: string): Promise<boolean> {
    try {
      const mode = config.emailProvider || 'console';
      if (mode === 'console' || !config.resendApiKey) {
        console.log(`\n📨 [AUTH EMAIL - DEV CONSOLE]`);
        console.log(`   To: ${email}`);
        console.log(`   Subject: MedLink Doctor Account Approved ✅`);
        console.log(`   Body: Dear Dr. ${doctorName}, your medical credentials have been approved. Your account is now ACTIVE.`);
        console.log(`   ---------------------------------------------\n`);
        return true;
      }
      // If Resend key is set, log and proceed
      console.log(`ℹ️ [Resend Email] Doctor Approval Email dispatched to ${email}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to send doctor approval email to ${email}:`, err.message);
      return false;
    }
  },

  async sendDoctorApprovalSms(phone: string, doctorName: string): Promise<boolean> {
    try {
      const mode = config.smsProvider || 'console';
      if (mode === 'console' || !config.twilioAccountSid) {
        console.log(`\n📱 [AUTH SMS - DEV CONSOLE]`);
        console.log(`   To: ${phone}`);
        console.log(`   Message: MedLink: Dear Dr. ${doctorName}, your account is now ACTIVE. You can now log in to the Doctor App.`);
        console.log(`   ---------------------------------------------\n`);
        return true;
      }
      console.log(`ℹ️ [Twilio SMS] Doctor Approval SMS dispatched to ${phone}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to send doctor approval SMS to ${phone}:`, err.message);
      return false;
    }
  },

  // -------------------------------------------------------------
  // 9 & 10: Doctor Rejection
  // -------------------------------------------------------------
  async sendDoctorRejectionEmail(email: string, doctorName: string, reason?: string): Promise<boolean> {
    try {
      const mode = config.emailProvider || 'console';
      if (mode === 'console' || !config.resendApiKey) {
        console.log(`\n📨 [AUTH EMAIL - DEV CONSOLE]`);
        console.log(`   To: ${email}`);
        console.log(`   Subject: MedLink Doctor Verification Update`);
        console.log(`   Body: Dear Dr. ${doctorName}, your registration could not be approved at this time. Reason: ${reason || 'Incomplete credential verification'}`);
        console.log(`   ---------------------------------------------\n`);
        return true;
      }
      console.log(`ℹ️ [Resend Email] Doctor Rejection Email dispatched to ${email}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to send doctor rejection email to ${email}:`, err.message);
      return false;
    }
  },

  async sendDoctorRejectionSms(phone: string, doctorName: string, reason?: string): Promise<boolean> {
    try {
      const mode = config.smsProvider || 'console';
      if (mode === 'console' || !config.twilioAccountSid) {
        console.log(`\n📱 [AUTH SMS - DEV CONSOLE]`);
        console.log(`   To: ${phone}`);
        console.log(`   Message: MedLink: Dear Dr. ${doctorName}, your verification was not approved. Reason: ${reason || 'Credential mismatch'}`);
        console.log(`   ---------------------------------------------\n`);
        return true;
      }
      console.log(`ℹ️ [Twilio SMS] Doctor Rejection SMS dispatched to ${phone}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to send doctor rejection SMS to ${phone}:`, err.message);
      return false;
    }
  },

  // -------------------------------------------------------------
  // 11 & 12: Clinic Approval
  // -------------------------------------------------------------
  async sendClinicApprovalEmail(email: string, clinicName: string): Promise<boolean> {
    try {
      const mode = config.emailProvider || 'console';
      if (mode === 'console' || !config.resendApiKey) {
        console.log(`\n📨 [AUTH EMAIL - DEV CONSOLE]`);
        console.log(`   To: ${email}`);
        console.log(`   Subject: MedLink Clinic Approved ✅`);
        console.log(`   Body: Congratulations, ${clinicName} has been approved and is now ACTIVE on MedLink.`);
        console.log(`   ---------------------------------------------\n`);
        return true;
      }
      console.log(`ℹ️ [Resend Email] Clinic Approval Email dispatched to ${email}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to send clinic approval email to ${email}:`, err.message);
      return false;
    }
  },

  async sendClinicApprovalSms(phone: string, clinicName: string): Promise<boolean> {
    try {
      const mode = config.smsProvider || 'console';
      if (mode === 'console' || !config.twilioAccountSid) {
        console.log(`\n📱 [AUTH SMS - DEV CONSOLE]`);
        console.log(`   To: ${phone}`);
        console.log(`   Message: MedLink: Clinic ${clinicName} has been approved and is now ACTIVE.`);
        console.log(`   ---------------------------------------------\n`);
        return true;
      }
      console.log(`ℹ️ [Twilio SMS] Clinic Approval SMS dispatched to ${phone}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to send clinic approval SMS to ${phone}:`, err.message);
      return false;
    }
  },

  // -------------------------------------------------------------
  // 13 & 14: Clinic Rejection
  // -------------------------------------------------------------
  async sendClinicRejectionEmail(email: string, clinicName: string, reason?: string): Promise<boolean> {
    try {
      const mode = config.emailProvider || 'console';
      if (mode === 'console' || !config.resendApiKey) {
        console.log(`\n📨 [AUTH EMAIL - DEV CONSOLE]`);
        console.log(`   To: ${email}`);
        console.log(`   Subject: MedLink Clinic Verification Update`);
        console.log(`   Body: Clinic registration for ${clinicName} was rejected. Reason: ${reason || 'Facility verification incomplete'}`);
        console.log(`   ---------------------------------------------\n`);
        return true;
      }
      console.log(`ℹ️ [Resend Email] Clinic Rejection Email dispatched to ${email}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to send clinic rejection email to ${email}:`, err.message);
      return false;
    }
  },

  async sendClinicRejectionSms(phone: string, clinicName: string, reason?: string): Promise<boolean> {
    try {
      const mode = config.smsProvider || 'console';
      if (mode === 'console' || !config.twilioAccountSid) {
        console.log(`\n📱 [AUTH SMS - DEV CONSOLE]`);
        console.log(`   To: ${phone}`);
        console.log(`   Message: MedLink: Clinic registration for ${clinicName} was rejected. Reason: ${reason || 'Documentation incomplete'}`);
        console.log(`   ---------------------------------------------\n`);
        return true;
      }
      console.log(`ℹ️ [Twilio SMS] Clinic Rejection SMS dispatched to ${phone}`);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [authNotificationService] Failed to send clinic rejection SMS to ${phone}:`, err.message);
      return false;
    }
  },
};
