import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
} from 'react-native';
import { Stethoscope, UserCheck, UserPlus, ShieldCheck, ChevronRight, HeartPulse } from 'lucide-react-native';
import { PALETTE, TYPOGRAPHY, SHADOWS } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';

interface WelcomeAuthScreenProps {
  navigation: any;
}

export const WelcomeAuthScreen: React.FC<WelcomeAuthScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useThemeStore();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.container}>
        {/* HEADER BRANDING */}
        <View style={styles.brandBlock}>
          <View style={[styles.iconBox, { backgroundColor: PALETTE.primary }]}>
            <Stethoscope size={36} color="#FFFFFF" />
          </View>
          <Text style={[styles.brandTitle, { color: colors.text }]}>MEDLINK</Text>
          <View style={[styles.badge, { backgroundColor: PALETTE.accent + '20' }]}>
            <HeartPulse size={13} color={PALETTE.accent} />
            <Text style={[styles.badgeText, { color: PALETTE.accent }]}>DOCTOR WORKSPACE</Text>
          </View>
          <Text style={[styles.brandTagline, { color: colors.secondaryText }]}>
            Intelligent clinical healthcare operations for verified practitioners.
          </Text>
        </View>

        {/* SELECTION CHOICES: EXISTING vs NEW DOCTOR */}
        <View style={styles.optionsBlock}>
          <Text style={[styles.optionsTitle, { color: colors.text }]}>Welcome to MedLink Doctor</Text>
          <Text style={[styles.optionsSub, { color: colors.secondaryText }]}>
            Select your clinical account type to continue:
          </Text>

          {/* EXISTING DOCTOR BUTTON */}
          <TouchableOpacity
            onPress={() => navigation.navigate('DoctorLogin')}
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }, SHADOWS.medium]}
            activeOpacity={0.85}
          >
            <View style={[styles.optionIconCircle, { backgroundColor: colors.primary + '18' }]}>
              <UserCheck size={26} color={colors.primary} />
            </View>

            <View style={styles.optionTextCol}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>Existing Doctor</Text>
              <Text style={[styles.optionDesc, { color: colors.secondaryText }]}>
                Sign in to your verified doctor account with your password.
              </Text>
            </View>

            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          {/* NEW DOCTOR BUTTON */}
          <TouchableOpacity
            onPress={() => navigation.navigate('DoctorRegister')}
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }, SHADOWS.medium]}
            activeOpacity={0.85}
          >
            <View style={[styles.optionIconCircle, { backgroundColor: PALETTE.accent + '18' }]}>
              <UserPlus size={26} color={PALETTE.accent} />
            </View>

            <View style={styles.optionTextCol}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>New Doctor</Text>
              <Text style={[styles.optionDesc, { color: colors.secondaryText }]}>
                Create your professional profile, verify council license & upload credentials.
              </Text>
            </View>

            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* SECURITY FOOTER */}
        <View style={[styles.securityFooter, { backgroundColor: colors.cardSubtle }]}>
          <ShieldCheck size={16} color={PALETTE.success} />
          <Text style={[styles.securityFooterText, { color: colors.secondaryText }]}>
            Protected by MedLink Credential Risk & Council Verification Engine
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: 20,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: TYPOGRAPHY.weights.extraBold,
    letterSpacing: 1.5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: TYPOGRAPHY.sizes.micro + 1,
    fontWeight: TYPOGRAPHY.weights.bold,
    letterSpacing: 1,
  },
  brandTagline: {
    fontSize: TYPOGRAPHY.sizes.body,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  optionsBlock: {
    gap: 16,
  },
  optionsTitle: {
    fontSize: TYPOGRAPHY.sizes.sectionHeading,
    fontWeight: TYPOGRAPHY.weights.bold,
    textAlign: 'center',
  },
  optionsSub: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 14,
  },
  optionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextCol: {
    flex: 1,
  },
  optionTitle: {
    fontSize: TYPOGRAPHY.sizes.cardTitle + 1,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  optionDesc: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    marginTop: 3,
    lineHeight: 16,
  },
  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
  },
  securityFooterText: {
    fontSize: TYPOGRAPHY.sizes.micro,
    fontWeight: TYPOGRAPHY.weights.medium,
    textAlign: 'center',
    flex: 1,
  },
});
