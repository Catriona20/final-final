import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '../../types';
import { COLORS, SPACING, SHADOWS_COMPAT as SHADOWS } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { isValidEmail, isValidPassword } from '../../utils/validation';
import { Mail, Lock, Eye, EyeOff, LogIn, ArrowLeft } from 'lucide-react-native';

type LoginNavProp = StackNavigationProp<AuthStackParamList, 'Login'>;
type LoginRouteProp = RouteProp<AuthStackParamList, 'Login'>;

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginNavProp>();
  const route = useRoute<LoginRouteProp>();
  const initialEmail = route.params?.email || '';

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { login, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    setValidationError(null);
    clearError();

    if (!isValidEmail(email)) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    const passCheck = isValidPassword(password);
    if (!passCheck.valid) {
      setValidationError(passCheck.error || 'Invalid password.');
      return;
    }

    try {
      await login({ email, password });
    } catch (err: any) {
      // Error handled in store
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexOne}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Welcome')}>
            <ArrowLeft size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Welcome Back 👋</Text>
            <Text style={styles.subtitle}>Sign in to manage your appointments and health history</Text>
          </View>

          {(validationError || error) && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{validationError || error}</Text>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Mail size={20} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.passwordHeader}>
                <Text style={styles.label}>Password</Text>
                <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputWrapper}>
                <Lock size={20} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  {showPassword ? <EyeOff size={20} color={COLORS.textMuted} /> : <Eye size={20} color={COLORS.textMuted} />}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>Sign In</Text>
                  <LogIn size={20} color={COLORS.white} />
                </>
              )}
            </TouchableOpacity>

            {/* DEMO ACCOUNTS QUICK-FILL DRAWER */}
            <DemoAccountsDrawer
              onSelect={(demoEmail, demoPassword) => {
                setEmail(demoEmail);
                setPassword(demoPassword);
                setValidationError(null);
              }}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Register Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

interface DemoUserItem {
  name: string;
  email: string;
  pass: string;
  otp: string;
  role: 'PATIENT' | 'DOCTOR' | 'ASSISTANT';
  detail: string;
}

const DEMO_USERS_LIST: DemoUserItem[] = [
  // Patients (patient01-20)
  { name: 'Aarav Sharma', email: 'patient01@demo.medlink.test', pass: 'Demo@1001', otp: '100001', role: 'PATIENT', detail: 'Dentistry • Moon Dental' },
  { name: 'Sneha Patel', email: 'patient02@demo.medlink.test', pass: 'Demo@1002', otp: '100002', role: 'PATIENT', detail: 'Gen Med • Apollo Family' },
  { name: 'Rajesh Kumar', email: 'patient03@demo.medlink.test', pass: 'Demo@1003', otp: '100003', role: 'PATIENT', detail: 'Cardiology • Heart Centre' },
  { name: 'Priya Raman', email: 'patient04@demo.medlink.test', pass: 'Demo@1004', otp: '100004', role: 'PATIENT', detail: 'Pediatrics • Child Care' },
  { name: 'Vikram Malhotra', email: 'patient05@demo.medlink.test', pass: 'Demo@1005', otp: '100005', role: 'PATIENT', detail: 'Dermatology • SkinSphere' },
  { name: 'Ananya Iyer', email: 'patient06@demo.medlink.test', pass: 'Demo@1006', otp: '100006', role: 'PATIENT', detail: 'ENT • Nova ENT Care' },
  { name: 'Rahul Verma', email: 'patient07@demo.medlink.test', pass: 'Demo@1007', otp: '100007', role: 'PATIENT', detail: 'Orthopedics • OrthoCare' },
  { name: 'Pooja Nair', email: 'patient08@demo.medlink.test', pass: 'Demo@1008', otp: '100008', role: 'PATIENT', detail: 'Gynecology • GreenLife' },
  { name: 'Rahul Menon', email: 'patient09@demo.medlink.test', pass: 'Demo@1009', otp: '100009', role: 'PATIENT', detail: 'Dentistry • Mylapore' },
  { name: 'Priya Balaji', email: 'patient10@demo.medlink.test', pass: 'Demo@1010', otp: '100010', role: 'PATIENT', detail: 'Cardiology • Perungudi' },
  { name: 'Nithya Raj', email: 'patient11@demo.medlink.test', pass: 'Demo@1011', otp: '100011', role: 'PATIENT', detail: 'Gen Med • Thoraipakkam' },
  { name: 'Sanjay Prakash', email: 'patient12@demo.medlink.test', pass: 'Demo@1012', otp: '100012', role: 'PATIENT', detail: 'Orthopedics • Sholinganallur' },
  { name: 'Deepa Sundaram', email: 'patient13@demo.medlink.test', pass: 'Demo@1013', otp: '100013', role: 'PATIENT', detail: 'Dermatology • Tambaram' },
  { name: 'Vikram Seth', email: 'patient14@demo.medlink.test', pass: 'Demo@1014', otp: '100014', role: 'PATIENT', detail: 'ENT • Chromepet' },
  { name: 'Sunita Reddy', email: 'patient15@demo.medlink.test', pass: 'Demo@1015', otp: '100015', role: 'PATIENT', detail: 'Cardiology • Guindy' },
  { name: 'Suresh Menon', email: 'patient16@demo.medlink.test', pass: 'Demo@1016', otp: '100016', role: 'PATIENT', detail: 'Gen Med • Kilpauk' },
  { name: 'Neha Agarwal', email: 'patient17@demo.medlink.test', pass: 'Demo@1017', otp: '100017', role: 'PATIENT', detail: 'Gynecology • Royapettah' },
  { name: 'Arjun Rao', email: 'patient18@demo.medlink.test', pass: 'Demo@1018', otp: '100018', role: 'PATIENT', detail: 'Ophthalmology • Besant Nagar' },
  { name: 'Kavita Deshmukh', email: 'patient19@demo.medlink.test', pass: 'Demo@1019', otp: '100019', role: 'PATIENT', detail: 'Neurology • Thiruvanmiyur' },
  { name: 'Manoj Pillai', email: 'patient20@demo.medlink.test', pass: 'Demo@1020', otp: '100020', role: 'PATIENT', detail: 'Pediatrics • Ambattur' },

  // Doctors (doctor01-20)
  { name: 'Dr. Arun Kumar', email: 'doctor01@demo.medlink.test', pass: 'Doctor@2001', otp: '200001', role: 'DOCTOR', detail: 'Dentistry • Moon Dental Clinic' },
  { name: 'Dr. Priya Sharma', email: 'doctor02@demo.medlink.test', pass: 'Doctor@2002', otp: '200002', role: 'DOCTOR', detail: 'Gen Med • Apollo Family Care' },
  { name: 'Dr. Karthik Raman', email: 'doctor03@demo.medlink.test', pass: 'Doctor@2003', otp: '200003', role: 'DOCTOR', detail: 'Cardiology • Chennai Heart & Vascular' },
  { name: 'Dr. Kavitha Reddy', email: 'doctor04@demo.medlink.test', pass: 'Doctor@2004', otp: '200004', role: 'DOCTOR', detail: 'Pediatrics • Smile & Child Centre' },
  { name: 'Dr. Priya Nair', email: 'doctor05@demo.medlink.test', pass: 'Doctor@2005', otp: '200005', role: 'DOCTOR', detail: 'Dermatology • SkinSphere Clinic' },
  { name: 'Dr. Venkat Raman', email: 'doctor06@demo.medlink.test', pass: 'Doctor@2006', otp: '200006', role: 'DOCTOR', detail: 'ENT • Nova ENT Care' },
  { name: 'Dr. Ramesh Chandran', email: 'doctor07@demo.medlink.test', pass: 'Doctor@2007', otp: '200007', role: 'DOCTOR', detail: 'Ophthalmology • VisionPlus Eye' },
  { name: 'Dr. Aditya Rao', email: 'doctor08@demo.medlink.test', pass: 'Doctor@2008', otp: '200008', role: 'DOCTOR', detail: 'Orthopedics • OrthoCare Chennai' },
  { name: 'Dr. Radha Sundaram', email: 'doctor09@demo.medlink.test', pass: 'Doctor@2009', otp: '200009', role: 'DOCTOR', detail: "Gynecology • GreenLife Women's" },
  { name: 'Dr. Arvind Swaminathan', email: 'doctor10@demo.medlink.test', pass: 'Doctor@2010', otp: '200010', role: 'DOCTOR', detail: 'Neurology • NeuroBridge Care' },
  { name: 'Dr. Sanjay Varma', email: 'doctor11@demo.medlink.test', pass: 'Doctor@2011', otp: '200011', role: 'DOCTOR', detail: 'Pulmonology • CarePoint' },
  { name: 'Dr. Balaji Narayanan', email: 'doctor12@demo.medlink.test', pass: 'Doctor@2012', otp: '200012', role: 'DOCTOR', detail: 'Nephrology • RenalCare' },
  { name: 'Dr. Manoj Prabhakar', email: 'doctor13@demo.medlink.test', pass: 'Doctor@2013', otp: '200013', role: 'DOCTOR', detail: 'Gastroenterology • Digestive Health' },
  { name: 'Dr. Kiran Mayi', email: 'doctor14@demo.medlink.test', pass: 'Doctor@2014', otp: '200014', role: 'DOCTOR', detail: 'Endocrinology • EndoWell' },
  { name: 'Dr. Dinesh Karthik', email: 'doctor15@demo.medlink.test', pass: 'Doctor@2015', otp: '200015', role: 'DOCTOR', detail: 'Urology • UroCare Chennai' },
  { name: 'Dr. Antony Joseph', email: 'doctor16@demo.medlink.test', pass: 'Doctor@2016', otp: '200016', role: 'DOCTOR', detail: 'Physiotherapy • PhysioMotion' },
  { name: 'Dr. Siddharth Roy', email: 'doctor17@demo.medlink.test', pass: 'Doctor@2017', otp: '200017', role: 'DOCTOR', detail: 'Psychiatry • MindCare' },
  { name: 'Dr. Shalini Mukerjee', email: 'doctor18@demo.medlink.test', pass: 'Doctor@2018', otp: '200018', role: 'DOCTOR', detail: "Gynecology • GreenLife Women's" },
  { name: 'Dr. Rajesh Sundaram', email: 'doctor19@demo.medlink.test', pass: 'Doctor@2019', otp: '200019', role: 'DOCTOR', detail: 'Gen Med • Apollo Family Care' },
  { name: 'Dr. Ananya Deshmukh', email: 'doctor20@demo.medlink.test', pass: 'Doctor@2020', otp: '200020', role: 'DOCTOR', detail: 'Dentistry • Moon Dental Clinic' },

  // Clinic Assistants (assistant01-20)
  { name: 'Sheryl Thomas', email: 'assistant01@demo.medlink.test', pass: 'Clinic@3001', otp: '300001', role: 'ASSISTANT', detail: 'Admin • Moon Dental Clinic' },
  { name: 'Rahul Joseph', email: 'assistant02@demo.medlink.test', pass: 'Clinic@3002', otp: '300002', role: 'ASSISTANT', detail: 'Admin • Apollo Family Care' },
  { name: 'Nisha Kumar', email: 'assistant03@demo.medlink.test', pass: 'Clinic@3003', otp: '300003', role: 'ASSISTANT', detail: "Admin • GreenLife Women's" },
  { name: 'Ravi Shankar', email: 'assistant04@demo.medlink.test', pass: 'Clinic@3004', otp: '300004', role: 'ASSISTANT', detail: 'Admin • Chennai Heart & Vascular' },
  { name: 'Deepak Raj', email: 'assistant05@demo.medlink.test', pass: 'Clinic@3005', otp: '300005', role: 'ASSISTANT', detail: 'Admin • VisionPlus Eye' },
  { name: 'Lavanya S', email: 'assistant06@demo.medlink.test', pass: 'Clinic@3006', otp: '300006', role: 'ASSISTANT', detail: 'Admin • OrthoCare Chennai' },
  { name: 'Joseph Mathew', email: 'assistant07@demo.medlink.test', pass: 'Clinic@3007', otp: '300007', role: 'ASSISTANT', detail: 'Admin • SkinSphere Dermatology' },
  { name: 'Priyanka Das', email: 'assistant08@demo.medlink.test', pass: 'Clinic@3008', otp: '300008', role: 'ASSISTANT', detail: 'Admin • NeuroBridge Care' },
  { name: 'Karthik V', email: 'assistant09@demo.medlink.test', pass: 'Clinic@3009', otp: '300009', role: 'ASSISTANT', detail: 'Admin • Nova ENT Care' },
  { name: 'Divya Raj', email: 'assistant10@demo.medlink.test', pass: 'Clinic@3010', otp: '300010', role: 'ASSISTANT', detail: 'Admin • Smile & Child Centre' },
  { name: 'Suresh Nair', email: 'assistant11@demo.medlink.test', pass: 'Clinic@3011', otp: '300011', role: 'ASSISTANT', detail: 'Admin • CarePoint Pulmonology' },
  { name: 'Meenakshi R', email: 'assistant12@demo.medlink.test', pass: 'Clinic@3012', otp: '300012', role: 'ASSISTANT', detail: 'Admin • RenalCare Clinic' },
  { name: 'Anand K', email: 'assistant13@demo.medlink.test', pass: 'Clinic@3013', otp: '300013', role: 'ASSISTANT', detail: 'Admin • Digestive Health Centre' },
  { name: 'Shalini G', email: 'assistant14@demo.medlink.test', pass: 'Clinic@3014', otp: '300014', role: 'ASSISTANT', detail: 'Admin • EndoWell Clinic' },
  { name: 'Vignesh B', email: 'assistant15@demo.medlink.test', pass: 'Clinic@3015', otp: '300015', role: 'ASSISTANT', detail: 'Admin • UroCare Chennai' },
  { name: 'Reshma T', email: 'assistant16@demo.medlink.test', pass: 'Clinic@3016', otp: '300016', role: 'ASSISTANT', detail: 'Admin • PhysioMotion' },
  { name: 'Arjun P', email: 'assistant17@demo.medlink.test', pass: 'Clinic@3017', otp: '300017', role: 'ASSISTANT', detail: 'Admin • MindCare Centre' },
  { name: 'Pooja M', email: 'assistant18@demo.medlink.test', pass: 'Clinic@3018', otp: '300018', role: 'ASSISTANT', detail: 'Admin • Besant Coastal Health' },
  { name: 'Manoj S', email: 'assistant19@demo.medlink.test', pass: 'Clinic@3019', otp: '300019', role: 'ASSISTANT', detail: 'Admin • Avadi Central Hospital' },
  { name: 'Kavitha R', email: 'assistant20@demo.medlink.test', pass: 'Clinic@3020', otp: '300020', role: 'ASSISTANT', detail: 'Admin • Royapuram Community' },
];

const DemoAccountsDrawer: React.FC<{ onSelect: (email: string, pass: string) => void }> = ({ onSelect }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'PATIENT' | 'DOCTOR' | 'ASSISTANT'>('PATIENT');

  const filtered = DEMO_USERS_LIST.filter((u) => u.role === selectedRole);

  return (
    <View style={demoStyles.container}>
      <TouchableOpacity
        style={demoStyles.toggleHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={demoStyles.toggleHeaderText}>⚡ Demo Accounts Quick-Fill</Text>
        <Text style={demoStyles.toggleHeaderHint}>{expanded ? 'Hide ▲' : 'Show (60 Demo Accounts) ▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={demoStyles.content}>
          {/* Role Filter Tabs */}
          <View style={demoStyles.roleTabs}>
            {(['PATIENT', 'DOCTOR', 'ASSISTANT'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[demoStyles.roleTab, selectedRole === r && demoStyles.roleTabActive]}
                onPress={() => setSelectedRole(r)}
              >
                <Text style={[demoStyles.roleTabText, selectedRole === r && demoStyles.roleTabTextActive]}>
                  {r === 'PATIENT' ? 'Patients (20)' : r === 'DOCTOR' ? 'Doctors (20)' : 'Assistants (20)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* List of Accounts */}
          <ScrollView style={demoStyles.userList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
            {filtered.map((user) => (
              <TouchableOpacity
                key={user.email}
                style={demoStyles.userCard}
                onPress={() => onSelect(user.email, user.pass)}
                activeOpacity={0.7}
              >
                <View style={demoStyles.userCardLeft}>
                  <Text style={demoStyles.userName}>{user.name}</Text>
                  <Text style={demoStyles.userDetail}>{user.detail}</Text>
                  <Text style={demoStyles.userEmail}>{user.email}</Text>
                </View>
                <View style={demoStyles.userCardRight}>
                  <Text style={demoStyles.otpBadge}>OTP: {user.otp}</Text>
                  <Text style={demoStyles.fillBtn}>Auto-Fill</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const demoStyles = StyleSheet.create({
  container: {
    marginTop: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  toggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E2E8F0',
  },
  toggleHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  toggleHeaderHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0D9488',
  },
  content: {
    padding: 10,
  },
  roleTabs: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roleTabActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  roleTabText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  roleTabTextActive: {
    color: '#FFFFFF',
  },
  userList: {
    gap: 6,
    maxHeight: 280,
  },
  userCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userCardLeft: {
    flex: 1,
  },
  userName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  userDetail: {
    fontSize: 10,
    color: '#64748B',
  },
  userEmail: {
    fontSize: 9,
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  userCardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  otpBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  fillBtn: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D9488',
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flexOne: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    justifyContent: 'space-between',
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
  },
  header: {
    marginTop: SPACING.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
    padding: SPACING.md,
    borderRadius: 8,
    marginVertical: SPACING.sm,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '600',
  },
  form: {
    gap: SPACING.md,
    marginVertical: SPACING.md,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    height: '100%',
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  eyeIcon: {
    padding: 4,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  registerLink: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
