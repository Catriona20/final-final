import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export interface OtpRecord {
  hashedCode: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  purpose: string;
  target: string;
}

export class AuthOtpService {
  private store: Map<string, OtpRecord> = new Map();
  private readonly OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  private readonly RESEND_COOLDOWN_MS = 60 * 1000;  // 60 seconds
  private readonly MAX_ATTEMPTS = 5;

  private makeKey(purpose: string, target: string): string {
    return `${purpose.toLowerCase()}:${target.toLowerCase().trim()}`;
  }

  /**
   * Generates a secure 6-digit OTP, enforces resend cooldown, hashes and stores it.
   * Returns the plaintext raw OTP to caller service ONLY for dispatch.
   */
  async generateOtp(purpose: string, target: string): Promise<{ success: boolean; otp?: string; error?: string; remainingCooldown?: number }> {
    const key = this.makeKey(purpose, target);
    const existing = this.store.get(key);
    const now = Date.now();

    // Check resend cooldown
    if (existing && now - existing.lastSentAt < this.RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((this.RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      return {
        success: false,
        error: `Please wait ${remainingSeconds} seconds before requesting a new verification code.`,
        remainingCooldown: remainingSeconds,
      };
    }

    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const hashedCode = await bcrypt.hash(rawOtp, 8);

    this.store.set(key, {
      hashedCode,
      expiresAt: now + this.OTP_EXPIRY_MS,
      attempts: 0,
      lastSentAt: now,
      purpose,
      target: target.toLowerCase().trim(),
    });

    return {
      success: true,
      otp: rawOtp,
    };
  }

  /**
   * Verifies the OTP.
   * Enforces attempt limits and expiry.
   * Deletes on successful verification (single-use).
   */
  async verifyOtp(purpose: string, target: string, code: string): Promise<{ success: boolean; error?: string; code?: string }> {
    const key = this.makeKey(purpose, target);
    const record = this.store.get(key);

    if (!record) {
      return {
        success: false,
        error: 'No active verification code found for this destination. Please request a new code.',
        code: 'OTP_NOT_FOUND',
      };
    }

    const now = Date.now();

    // Check expiry
    if (now > record.expiresAt) {
      this.store.delete(key);
      return {
        success: false,
        error: 'Verification code has expired. Please request a new code.',
        code: 'OTP_EXPIRED',
      };
    }

    // Check max attempts
    if (record.attempts >= this.MAX_ATTEMPTS) {
      this.store.delete(key);
      return {
        success: false,
        error: 'Too many failed verification attempts. Please request a new code.',
        code: 'OTP_MAX_ATTEMPTS_EXCEEDED',
      };
    }

    const trimmedCode = code.toString().trim();
    const isMatch = await bcrypt.compare(trimmedCode, record.hashedCode);

    if (!isMatch) {
      record.attempts += 1;
      const remaining = this.MAX_ATTEMPTS - record.attempts;
      if (remaining <= 0) {
        this.store.delete(key);
        return {
          success: false,
          error: 'Too many failed verification attempts. Please request a new code.',
          code: 'OTP_MAX_ATTEMPTS_EXCEEDED',
        };
      }
      return {
        success: false,
        error: `Invalid verification code. ${remaining} attempt(s) remaining.`,
        code: 'OTP_INVALID',
      };
    }

    // Success: one-time use consumption
    this.store.delete(key);
    return { success: true };
  }

  /**
   * Clears any active OTP for given purpose/target
   */
  clearOtp(purpose: string, target: string): void {
    this.store.delete(this.makeKey(purpose, target));
  }
}

export const authOtpService = new AuthOtpService();
