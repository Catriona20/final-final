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
import {
  User,
  Mail,
  Phone,
  Lock,
  Award,
  FileText,
  UploadCloud,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Building2,
  KeyRound,
  AlertCircle,
} from 'lucide-react-native';
import { PALETTE, TYPOGRAPHY, SHADOWS } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';
import { useDoctorAuthStore } from '../../store/useDoctorAuthStore';
import { apiClient } from '../../api/apiClient';

interface DoctorRegisterScreenProps {
  navigation: any;
}

export const DoctorRegisterScreen: React.FC<DoctorRegisterScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useThemeStore();
  const { register, isLoading, error, clearError } = useDoctorAuthStore();

  // Multi-step Registration Wizard
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Basic Info & Credentials
  const [name, setName] = useState('Dr. Arun Kumar');
  const [email, setEmail] = useState('dr.arun.demo@medlink.test');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [password, setPassword] = useState('Doctor@123');
  const [confirmPassword, setConfirmPassword] = useState('Doctor@123');

  // Step 2: Professional Details
  const [regNumber, setRegNumber] = useState('TN-DENT-88219');
  const [regAuthority, setRegAuthority] = useState('Tamil Nadu Medical Council');
  const [qualification, setQualification] = useState('BDS, MDS (Endodontics)');
  const [specialization, setSpecialization] = useState('Dentistry');
  const [experienceYears, setExperienceYears] = useState('8');
  const [clinicName, setClinicName] = useState('MedLink Dental Care');
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [proceduresText, setProceduresText] = useState('Root Canal Treatment, Dental Filling, Tooth Extraction');
  const [availableClinics, setAvailableClinics] = useState<any[]>([]);

  // Step 3: Document Uploads
  const [uploadedDocs, setUploadedDocs] = useState<{ type: string; name: string; uploaded: boolean }[]>([
    { type: 'Medical Registration License', name: 'STATE_COUNCIL_CERT.pdf', uploaded: true },
    { type: 'Degree / Qualification Certificate', name: 'DEGREE_DIPLOMA.pdf', uploaded: true },
    { type: 'Government Professional ID', name: 'GOV_DOCTOR_ID.pdf', uploaded: true },
  ]);

  const [localMsg, setLocalMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchClinics = async () => {
      try {
        const res = await apiClient.get('/clinics');
        if (res.data && res.data.clinics && res.data.clinics.length > 0) {
          setAvailableClinics(res.data.clinics);
          const dental = res.data.clinics.find((c: any) => c.name.toLowerCase().includes('dental'));
          if (dental) {
            setClinicName(dental.name);
            setSelectedClinicId(dental.id);
          } else {
            setClinicName(res.data.clinics[0].name);
            setSelectedClinicId(res.data.clinics[0].id);
          }
        }
      } catch (e) {
        console.warn('Failed to load registered clinics:', e);
      }
    };
    fetchClinics();
  }, []);

  const handleStep1Next = () => {
    clearError();
    setLocalMsg(null);

    if (!name.trim() || !email.trim() || !phone.trim() || !password) {
      setLocalMsg('Please complete all account fields.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalMsg('Passwords do not match.');
      return;
    }

    setCurrentStep(2);
  };

  const handleStep2Next = () => {
    setLocalMsg(null);
    if (!regNumber.trim() || !qualification.trim() || !specialization.trim()) {
      setLocalMsg('Please enter your registration number, qualification, and specialization.');
      return;
    }
    setCurrentStep(3);
  };

  const handleFinalSubmit = async () => {
    clearError();
    setLocalMsg(null);

    const procList = proceduresText
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const matchedClinic = availableClinics.find(
      (c: any) => c.name.toLowerCase() === clinicName.trim().toLowerCase() || c.id === selectedClinicId
    );
    const resolvedClinicId = selectedClinicId || (matchedClinic ? matchedClinic.id : undefined);

    const success = await register({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      registrationNumber: regNumber.trim(),
      registrationAuthority: regAuthority.trim(),
      qualification: qualification.trim(),
      specialization: specialization.trim(),
      experienceYears: parseInt(experienceYears, 10) || 5,
      clinicName: clinicName.trim(),
      clinicId: resolvedClinicId,
      procedures: procList,
      consultationDuration: '20 min',
    });

    if (success) {
      navigation.replace('VerificationPending');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoid}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* TOP BACK BUTTON */}
          <TouchableOpacity
            onPress={() => (currentStep > 1 ? setCurrentStep((s) => (s - 1) as any) : navigation.goBack())}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.text} />
            <Text style={[styles.backBtnText, { color: colors.text }]}>
              {currentStep > 1 ? 'Previous Step' : 'Back to Selection'}
            </Text>
          </TouchableOpacity>

          {/* STEPPER PROGRESS */}
          <View style={styles.stepProgressRow}>
            <View style={[styles.stepDot, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepDotText}>1</Text>
            </View>
            <View style={[styles.stepLine, { backgroundColor: currentStep >= 2 ? colors.primary : colors.border }]} />
            <View style={[styles.stepDot, { backgroundColor: currentStep >= 2 ? colors.primary : colors.cardSubtle }]}>
              <Text style={[styles.stepDotText, { color: currentStep >= 2 ? '#FFFFFF' : colors.secondaryText }]}>2</Text>
            </View>
            <View style={[styles.stepLine, { backgroundColor: currentStep >= 3 ? colors.primary : colors.border }]} />
            <View style={[styles.stepDot, { backgroundColor: currentStep >= 3 ? colors.primary : colors.cardSubtle }]}>
              <Text style={[styles.stepDotText, { color: currentStep >= 3 ? '#FFFFFF' : colors.secondaryText }]}>3</Text>
            </View>
          </View>

          {/* STEP TITLES */}
          <View style={styles.headerBlock}>
            <Text style={[styles.stepSubTitle, { color: colors.primary }]}>STEP {currentStep} OF 3</Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {currentStep === 1
                ? 'Account Credentials'
                : currentStep === 2
                ? 'Professional Credentials'
                : 'Upload Medical Evidence'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              {currentStep === 1
                ? 'Create your doctor login credentials to start practitioner credentialing.'
                : currentStep === 2
                ? 'Enter your State Medical Council registration and qualification details.'
                : 'Upload your official license and degree certificates for risk review.'}
            </Text>
          </View>

          {/* ERROR OR STATUS MESSAGES */}
          {(error || localMsg) && (
            <View style={[styles.feedbackBox, { backgroundColor: error ? PALETTE.errorLight : PALETTE.infoLight }]}>
              <Text style={[styles.feedbackText, { color: error ? PALETTE.error : PALETTE.info }]}>
                {error || localMsg}
              </Text>
            </View>
          )}

          {/* STEP 1: ACCOUNT & OTP */}
          {currentStep === 1 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, SHADOWS.medium]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Full Name (as per Medical License)</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <User size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. Dr. Rajesh Sundaram"
                    placeholderTextColor={colors.secondaryText}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Official Email Address</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Mail size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. dr.rajesh@hospital.org"
                    placeholderTextColor={colors.secondaryText}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Mobile Number</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Phone size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. +91 9876543210"
                    placeholderTextColor={colors.secondaryText}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Create Password</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Lock size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="At least 6 characters"
                    placeholderTextColor={colors.secondaryText}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Confirm Password</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Lock size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Re-enter password"
                    placeholderTextColor={colors.secondaryText}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleStep1Next}
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={styles.nextBtnText}>Continue to Professional Credentials</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: PROFESSIONAL CREDENTIALS */}
          {currentStep === 2 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, SHADOWS.medium]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Medical Registration Number</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Award size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. TN-MED-49102-2016"
                    placeholderTextColor={colors.secondaryText}
                    value={regNumber}
                    onChangeText={setRegNumber}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Registration Authority / Council</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Building2 size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. Tamil Nadu Medical Council"
                    placeholderTextColor={colors.secondaryText}
                    value={regAuthority}
                    onChangeText={setRegAuthority}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Primary Qualification</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Award size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. MBBS, MD (General Medicine)"
                    placeholderTextColor={colors.secondaryText}
                    value={qualification}
                    onChangeText={setQualification}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Clinical Specialization</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Award size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. General Medicine / Cardiology"
                    placeholderTextColor={colors.secondaryText}
                    value={specialization}
                    onChangeText={setSpecialization}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Years of Experience</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Award size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. 8"
                    placeholderTextColor={colors.secondaryText}
                    value={experienceYears}
                    onChangeText={setExperienceYears}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Primary Practice Clinic</Text>
                {availableClinics.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {availableClinics.map((c: any) => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => {
                          setClinicName(c.name);
                          setSelectedClinicId(c.id);
                        }}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 16,
                          backgroundColor: clinicName === c.name ? colors.primary : colors.cardSubtle,
                          borderWidth: 1,
                          borderColor: clinicName === c.name ? colors.primary : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: clinicName === c.name ? '#FFFFFF' : colors.text,
                          }}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Building2 size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. MedLink Dental Care — Demo Clinic"
                    placeholderTextColor={colors.secondaryText}
                    value={clinicName}
                    onChangeText={setClinicName}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Procedures Offered (Comma separated)</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <FileText size={18} color={colors.secondaryText} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. Root Canal Treatment, Dental Cleaning, Tooth Extraction"
                    placeholderTextColor={colors.secondaryText}
                    value={proceduresText}
                    onChangeText={setProceduresText}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleStep2Next}
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={styles.nextBtnText}>Next: Upload Credentials</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 3: DOCUMENT UPLOADS */}
          {currentStep === 3 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, SHADOWS.medium]}>
              <Text style={[styles.docSectionTitle, { color: colors.text }]}>Required Verification Evidence</Text>
              <Text style={[styles.docSectionSub, { color: colors.secondaryText }]}>
                Submit official proof for council verification and risk engine evaluation.
              </Text>

              {uploadedDocs.map((doc, idx) => (
                <View key={idx} style={[styles.docUploadCard, { backgroundColor: colors.cardSubtle }]}>
                  <FileText size={22} color={colors.primary} />
                  <View style={styles.docUploadInfo}>
                    <Text style={[styles.docUploadType, { color: colors.text }]}>{doc.type}</Text>
                    <Text style={[styles.docUploadFileName, { color: colors.secondaryText }]}>{doc.name}</Text>
                  </View>
                  <View style={[styles.docStatusBadge, { backgroundColor: PALETTE.successLight }]}>
                    <CheckCircle2 size={12} color={PALETTE.success} />
                    <Text style={[styles.docStatusText, { color: PALETTE.success }]}>Ready</Text>
                  </View>
                </View>
              ))}

              <View style={[styles.riskNoticeBox, { backgroundColor: PALETTE.warningLight }]}>
                <ShieldCheck size={18} color="#B45309" />
                <Text style={[styles.riskNoticeText, { color: '#B45309' }]}>
                  Submissions are screened via Rule-Based Credential Risk Analysis & State Medical Council checks.
                </Text>
              </View>

              {/* SUBMIT BUTTON IN WARM ORANGE ACCENT */}
              <TouchableOpacity
                onPress={handleFinalSubmit}
                disabled={isLoading}
                style={[styles.nextBtn, { backgroundColor: PALETTE.accent }, SHADOWS.accentGlow]}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.nextBtnText}>Submit for Verification</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

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
  stepProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.sizes.secondary,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  stepLine: {
    width: 40,
    height: 3,
  },
  headerBlock: {
    marginBottom: 16,
  },
  stepSubTitle: {
    fontSize: TYPOGRAPHY.sizes.micro + 1,
    fontWeight: TYPOGRAPHY.weights.extraBold,
    letterSpacing: 1,
  },
  title: {
    fontSize: TYPOGRAPHY.sizes.sectionHeading + 2,
    fontWeight: TYPOGRAPHY.weights.extraBold,
    marginTop: 2,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    fontWeight: TYPOGRAPHY.weights.bold,
    marginBottom: 6,
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
  otpBox: {
    marginTop: 6,
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#00000008',
  },
  otpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sendOtpBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  sendOtpBtnText: {
    fontSize: TYPOGRAPHY.sizes.micro + 1,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  nextBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.sizes.body,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  docSectionTitle: {
    fontSize: TYPOGRAPHY.sizes.cardTitle,
    fontWeight: TYPOGRAPHY.weights.bold,
    marginBottom: 4,
  },
  docSectionSub: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    marginBottom: 14,
  },
  docUploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    gap: 10,
  },
  docUploadInfo: {
    flex: 1,
  },
  docUploadType: {
    fontSize: TYPOGRAPHY.sizes.secondary,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  docUploadFileName: {
    fontSize: TYPOGRAPHY.sizes.micro,
    marginTop: 2,
  },
  docStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  docStatusText: {
    fontSize: TYPOGRAPHY.sizes.micro,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  riskNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  riskNoticeText: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.micro + 1,
    lineHeight: 16,
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
});
