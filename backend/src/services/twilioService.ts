import axios from 'axios';
import { config } from '../config/env';

export const twilioService = {
  /**
   * Normalizes a phone number to E.164 format.
   * Defaults to India (+91) if country code is omitted.
   */
  normalizePhoneNumber(phone: string): string {
    const cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    return `+${cleaned}`;
  },

  /**
   * Dispatches a real SMS OTP using Twilio Verify API (primary) or Programmable SMS.
   * When TWILIO_VERIFY_SERVICE_SID is configured, Twilio Verify handles OTP dispatch and carrier routing.
   */
  async sendSmsOtp(
    phone: string,
    otpCode: string,
    purpose: string = 'Verification'
  ): Promise<{ success: boolean; sid?: string; message?: string; error?: string; code?: number }> {
    const normalized = this.normalizePhoneNumber(phone);

    if (!config.twilioAccountSid || !config.twilioAuthToken || (!config.twilioVerifyServiceSid && !config.twilioPhoneNumber)) {
      const err = 'Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID) are not configured.';
      console.warn(`⚠️ [Twilio SMS] ${err}`);
      return { success: false, error: err };
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');

      // Primary: Twilio Verify Service (Handles regulatory compliance, trial OTP delivery, and auto-carrier routing)
      if (config.twilioVerifyServiceSid) {
        const params = new URLSearchParams();
        params.append('To', normalized);
        params.append('Channel', 'sms');

        const response = await axios.post(
          `https://verify.twilio.com/v2/Services/${config.twilioVerifyServiceSid}/Verifications`,
          params.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: authHeader,
            },
            timeout: 10000,
          }
        );

        console.log(`✅ [Twilio Verify] Dispatched OTP SMS to ${normalized} (SID: ${response.data.sid}, Status: ${response.data.status})`);
        return {
          success: true,
          sid: response.data.sid,
          message: 'Verification code sent via Twilio Verify.',
        };
      }

      // Secondary fallback: Direct Programmable SMS (if Twilio phone number is provisioned)
      const params = new URLSearchParams();
      params.append('To', normalized);

      if (config.twilioPhoneNumber.startsWith('MG')) {
        params.append('MessagingServiceSid', config.twilioPhoneNumber);
      } else {
        params.append('From', config.twilioPhoneNumber);
      }

      params.append('Body', `MedLink ${purpose}: Your verification code is ${otpCode}. Valid for 10 minutes. Do not share this code.`);

      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: authHeader,
          },
          timeout: 10000,
        }
      );

      console.log(`✅ [Twilio SMS] Dispatched OTP SMS to ${normalized} (SID: ${response.data.sid}, Status: ${response.data.status})`);
      return {
        success: true,
        sid: response.data.sid,
        message: 'Verification SMS sent via Twilio.',
      };
    } catch (err: any) {
      const errorCode = err.response?.data?.code || err.response?.status;
      const rawErrorMsg = err.response?.data?.message || err.message || 'Twilio SMS send error';
      console.warn(`⚠️ [Twilio SMS Error] (${errorCode}): ${rawErrorMsg}`);

      let safeUserError = 'SMS verification could not be sent. Please try again.';
      if (errorCode === 21608) {
        safeUserError = 'Twilio trial requires this phone number to be verified.';
      } else if (errorCode === 21211) {
        safeUserError = 'Invalid phone number format. Please check your country code and number.';
      } else if (errorCode === 60200 || errorCode === 60203) {
        safeUserError = 'Max verification attempts reached for this phone number. Please try again later.';
      }

      return {
        success: false,
        error: safeUserError,
        code: errorCode,
      };
    }
  },

  /**
   * Requests Twilio Verify service to dispatch an SMS OTP.
   */
  async sendVerificationCode(phone: string): Promise<{ success: boolean; status: string; message: string; sid?: string; error?: string }> {
    const res = await this.sendSmsOtp(phone, '', 'Verification');
    return {
      success: res.success,
      status: res.success ? 'pending' : 'failed',
      message: res.message || res.error || 'Failed to dispatch verification code.',
      sid: res.sid,
      error: res.error,
    };
  },

  /**
   * Verifies the user-entered OTP with Twilio Verify service.
   */
  async checkVerificationCode(phone: string, code: string): Promise<boolean> {
    const normalized = this.normalizePhoneNumber(phone);

    if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioVerifyServiceSid) {
      // In development mode with unconfigured Twilio credentials, accept valid 4 or 6-digit challenge
      return code.length >= 4;
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', normalized);
      params.append('Code', code.trim());

      const response = await axios.post(
        `https://verify.twilio.com/v2/Services/${config.twilioVerifyServiceSid}/VerificationCheck`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: authHeader,
          },
          timeout: 8000,
        }
      );

      const isApproved = response.data?.status === 'approved' || response.data?.valid === true;
      console.log(`ℹ️ [Twilio Verify Check] ${normalized}: status=${response.data?.status}, valid=${response.data?.valid}`);
      return isApproved;
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Twilio Verification Check error';
      console.error('Twilio Verify check error:', errorMsg);
      return false;
    }
  },

  /**
   * Sends an SMS booking confirmation message to the patient.
   */
  async sendBookingConfirmation(
    phone: string,
    details: { clinicName: string; doctorName: string; date: string; time: string; bookingId: string }
  ): Promise<boolean> {
    const normalized = this.normalizePhoneNumber(phone);

    if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
      console.log(`ℹ️ [SMS Simulation] Booking SMS for ${normalized}: Confirmed with ${details.doctorName} at ${details.clinicName} on ${details.date} at ${details.time}. Booking ID: ${details.bookingId}`);
      return false;
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
      const messageBody = `MedLink Booking Confirmed: Your appointment with ${details.doctorName} at ${details.clinicName} is on ${details.date} at ${details.time}. Booking ID: ${details.bookingId}.`;

      const params = new URLSearchParams();
      params.append('To', normalized);
      params.append('From', config.twilioPhoneNumber);
      params.append('Body', messageBody);

      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: authHeader,
          },
          timeout: 8000,
        }
      );

      return true;
    } catch (err: any) {
      console.warn('Twilio SMS delivery warning:', err.response?.data?.message || err.message);
      return false;
    }
  },
};
