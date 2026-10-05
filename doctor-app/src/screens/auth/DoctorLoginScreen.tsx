import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Stethoscope, Lock, Mail, Phone, KeyRound, ArrowLeft, ShieldCheck, RefreshCw } from 'lucide-react-native';
import { PALETTE, TYPOGRAPHY, SHADOWS } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';
import { useDoctorAuthStore } from '../../store/useDoctorAuthStore';

interface DoctorLoginScreenProps {
  navigation: any;
}

export const DoctorLoginScreen: React.FC<DoctorLoginScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useThemeStore();
  const { login, isLoading, error, clearError } = useDoctorAuthStore();

  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const handleLoginSubmit = async () => {
    clearError();
    setLocalMsg(null);

    if (!emailOrPhone.trim()) {
      setLocalMsg('Please enter your email or phone number.');
      return;
    }

    if (!password) {
      setLocalMsg('Please enter your account password.');
      return;
    }

    await login({ emailOrPhone: emailOrPhone.trim(), password });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoid}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity
            onPress={() => (navigation.canGoBack ? (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('WelcomeAuth')) : navigation.navigate('WelcomeAuth'))}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.text} />
            <Text style={[styles.backBtnText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>

          {/* HEADER */}
          <View style={styles.headerBlock}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
              <Stethoscope size={30} color="#FFFFFF" />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Existing Doctor Sign In</Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              Sign in to access your authorized clinic schedule and live OPD queue.
            </Text>
          </View>

          {/* FORM CONTAINER */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, SHADOWS.medium]}>
            {/* IDENTIFIER INPUT */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Email Address or Mobile Number</Text>
              <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Mail size={18} color={colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="e.g. dr.rajesh@medlink.health or +91 9876543210"
                  placeholderTextColor={colors.secondaryText}
                  value={emailOrPhone}
                  onChangeText={setEmailOrPhone}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            {/* PASSWORD INPUT */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Doctor Account Password</Text>
              <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Lock size={18} color={colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Enter your confidential password"
                  placeholderTextColor={colors.secondaryText}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </View>

            {/* ERROR OR STATUS MESSAGES */}
            {(error || localMsg) && (
              <View style={[styles.feedbackBox, { backgroundColor: error ? PALETTE.errorLight : PALETTE.infoLight }]}>
                <Text style={[styles.feedbackText, { color: error ? PALETTE.error : PALETTE.info }]}>
                  {error || localMsg}
                </Text>
              </View>
            )}

            {/* SUBMIT BUTTON (WARM ORANGE ACCENT) */}
            <TouchableOpacity
              onPress={handleLoginSubmit}
              disabled={isLoading}
              style={[styles.submitBtn, { backgroundColor: PALETTE.accent }, SHADOWS.accentGlow]}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Sign In to Workspace</Text>
              )}
            </TouchableOpacity>

            {/* DEMO DOCTOR ACCOUNTS QUICK-FILL */}
            <DemoDoctorDrawer
              onSelect={(demoEmail, demoPass) => {
                setEmailOrPhone(demoEmail);
                setPassword(demoPass);
                setLocalMsg(null);
              }}
            />
          </View>

          {/* NEW DOCTOR LINK */}
          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: colors.secondaryText }]}>New practitioner?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('DoctorRegister')}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>Register & Verify License</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

interface DemoDoctorItem {
  name: string;
  email: string;
  pass: string;
  otp: string;
  role: 'DOCTOR' | 'PATIENT' | 'ASSISTANT';
  detail: string;
}

const DEMO_DOCTOR_LIST: DemoDoctorItem[] = [
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
  { name: 'Dr. Alagu Vimalesh', email: 'dr.alagu@moondental.test', pass: 'Doctor@2773', otp: '202773', role: 'DOCTOR', detail: 'Conservative Dentistry & Endodontics (RCT) • Moon Dental (Villivakkam - 2773)' },
  { name: 'Dr. Merlin Rajan', email: 'dr.merlin@moondental.test', pass: 'Doctor@2773', otp: '202773', role: 'DOCTOR', detail: 'Conservative Dentistry & Endodontics • Moon Dental (Villivakkam - 2773)' },

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

const DemoDoctorDrawer: React.FC<{
  onSelect: (email: string, pass: string) => void;
}> = ({ onSelect }) => {
  const [expanded, setExpanded] = useState(false);
  const [filterRole, setFilterRole] = useState<'DOCTOR' | 'PATIENT' | 'ASSISTANT'>('DOCTOR');

  const filtered = DEMO_DOCTOR_LIST.filter((d) => d.role === filterRole);

  return (
    <View style={demoDocStyles.container}>
      <TouchableOpacity
        style={demoDocStyles.toggleHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={demoDocStyles.toggleTitle}>⚡ Demo Accounts Quick-Fill</Text>
        <Text style={demoDocStyles.toggleHint}>{expanded ? 'Hide ▲' : 'Show (60 Demo Accounts) ▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={demoDocStyles.body}>
          <View style={demoDocStyles.roleTabs}>
            {(['DOCTOR', 'PATIENT', 'ASSISTANT'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[demoDocStyles.roleTab, filterRole === r && demoDocStyles.roleTabActive]}
                onPress={() => setFilterRole(r)}
              >
                <Text style={[demoDocStyles.roleTabText, filterRole === r && demoDocStyles.roleTabTextActive]}>
                  {r === 'DOCTOR' ? 'Doctors (20)' : r === 'PATIENT' ? 'Patients (20)' : 'Assistants (20)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={demoDocStyles.list} nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
            {filtered.map((item) => (
              <TouchableOpacity
                key={item.email}
                style={demoDocStyles.card}
                onPress={() => onSelect(item.email, item.pass)}
                activeOpacity={0.7}
              >
                <View style={demoDocStyles.cardLeft}>
                  <Text style={demoDocStyles.name}>{item.name}</Text>
                  <Text style={demoDocStyles.detail}>{item.detail}</Text>
                  <Text style={demoDocStyles.email}>{item.email}</Text>
                </View>
                <View style={demoDocStyles.cardRight}>
                  <Text style={demoDocStyles.fill}>Auto-Fill</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const demoDocStyles = StyleSheet.create({
  container: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  toggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
  },
  toggleTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  toggleHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0D9488',
  },
  body: {
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
  list: {
    gap: 6,
    maxHeight: 280,
  },
  card: {
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
  cardLeft: {
    flex: 1,
  },
  name: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  detail: {
    fontSize: 10,
    color: '#64748B',
  },
  email: {
    fontSize: 9,
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  otp: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  fill: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D9488',
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  backBtnText: {
    fontSize: TYPOGRAPHY.sizes.body,
    fontWeight: TYPOGRAPHY.weights.semiBold,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: TYPOGRAPHY.sizes.sectionHeading + 2,
    fontWeight: TYPOGRAPHY.weights.extraBold,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 300,
  },
  modeToggleBox: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    marginBottom: 18,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    fontWeight: TYPOGRAPHY.weights.bold,
    marginBottom: 6,
  },
  otpHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sendOtpBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  sendOtpBtnText: {
    fontSize: TYPOGRAPHY.sizes.micro + 1,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.body,
  },
  feedbackBox: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  feedbackText: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    fontWeight: TYPOGRAPHY.weights.medium,
    textAlign: 'center',
  },
  submitBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.sizes.body,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: TYPOGRAPHY.sizes.secondary,
  },
  footerLink: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
});
