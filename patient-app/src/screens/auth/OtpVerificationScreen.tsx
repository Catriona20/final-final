import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../types';
import { COLORS, SPACING, SHADOWS_COMPAT as SHADOWS } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { apiClient } from '../../services/apiClient';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { Platform } from 'react-native';

type OtpNavProp = StackNavigationProp<AuthStackParamList, 'OtpVerification'>;
type OtpRouteProp = RouteProp<AuthStackParamList, 'OtpVerification'>;

export const OtpVerificationScreen: React.FC = () => {
  const navigation = useNavigation<OtpNavProp>();
  const route = useRoute<OtpRouteProp>();
  const routeParams = route.params || ({} as any);
  const pending = useAuthStore((s) => s.pendingVerification);

  const phoneOrEmail = routeParams.phoneOrEmail || pending?.phoneOrEmail || '';
  const purpose = routeParams.purpose || pending?.purpose || 'register';
  const email = routeParams.email || pending?.email;
  const phone = routeParams.phone || pending?.phone;

  const [otp, setOtp] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const { verifyOtp, isLoading, error } = useAuthStore();

  const handleVerify = async () => {
    setValidationError(null);

    if (!otp.trim() || otp.trim().length < 4) {
      setValidationError('Please enter the 6-digit verification code.');
      return;
    }

    try {
      if (purpose === 'register') {
        await verifyOtp(phoneOrEmail, otp.trim(), { email, phone });
      } else {
        navigation.navigate('PasswordReset', { token: otp.trim() });
      }
    } catch (err) {
      // Error handled in store
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setValidationError(null);

    try {
      if (phoneOrEmail.includes('@')) {
        await apiClient.post('/auth/email/send-otp', { email: phoneOrEmail });
      } else {
        await apiClient.post('/auth/phone/send-otp', { phone: phoneOrEmail });
      }
      Alert.alert('Code Sent', 'A fresh verification code has been dispatched to your contact.');
    } catch (err: any) {
      Alert.alert('Resend Notice', err.message || 'Unable to resend verification code right now.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <ShieldCheck size={36} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Enter Verification Code</Text>
          <Text style={styles.subtitle}>
            We've sent a secure verification code to <Text style={styles.boldText}>{phoneOrEmail}</Text>
          </Text>
        </View>

        {(validationError || error) && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{validationError || error}</Text>
          </View>
        )}

        <View style={styles.otpCard}>
          <Text style={styles.label}>Verification Security Code</Text>
          <TextInput
            style={[styles.otpInput, isInputFocused && styles.otpInputFocused]}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="······"
            placeholderTextColor={COLORS.textMuted}
            autoFocus
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
          onPress={handleVerify}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.submitBtnText}>Verify & Proceed</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendBtn}
          onPress={handleResend}
          disabled={isResending}
        >
          {isResending ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={styles.resendText}>Didn't receive code? <Text style={styles.resendLink}>Resend Code</Text></Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    lineHeight: 20,
  },
  boldText: {
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '600',
  },
  otpCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.small,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  otpInput: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 10,
    color: COLORS.primaryDark,
    textAlign: 'center',
    width: '85%',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.xs,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  otpInputFocused: {
    borderBottomColor: COLORS.primary,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  resendLink: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
