import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Dimensions,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  ChevronRight,
  ShieldCheck,
  Building2,
  Stethoscope,
  FileText,
  Check,
  Plus,
  X,
  Sparkles,
  AlertCircle,
  User,
} from 'lucide-react-native';
import {
  AppStackParamList,
  Doctor,
  Clinic,
  ConsultationReason,
  UploadedMedicalFile,
} from '../../types';
import { MOCK_DEPARTMENTS } from '../../data/mockData';
import { SPACING, RADIUS, SHADOWS, TYPOGRAPHY, getThemeColors } from '../../constants/theme';
import { useAppointmentStore } from '../../store/useAppointmentStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useAuthStore } from '../../store/useAuthStore';
import { doctorService, GroupedTimeSlots } from '../../services/doctorService';
import { DateSelector, DayOption } from '../../components/DateSelector';
import { TimeSlotSelector } from '../../components/TimeSlotSelector';
import { FileUploadCard } from '../../components/FileUploadCard';
import { PreviousDoctorCard } from '../../components/PreviousDoctorCard';
import { PreviousVisitCard } from '../../components/PreviousVisitCard';
import { ThemeToggle } from '../../components/ThemeToggle';
import { timeUtils } from '../../utils/timeUtils';
import { socketService } from '../../services/socketService';

type BookingNavProp = StackNavigationProp<AppStackParamList, 'Booking'>;
type BookingRouteProp = RouteProp<AppStackParamList, 'Booking'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CONSULTATION_REASONS: Array<{ reason: ConsultationReason; defaultDuration: string; icon: string }> = [
  { reason: 'General consultation', defaultDuration: '20 min', icon: '🩺' },
  { reason: 'New symptoms', defaultDuration: '25 min', icon: '🔍' },
  { reason: 'Follow-up', defaultDuration: '15 min', icon: '🔄' },
  { reason: 'Routine check-up', defaultDuration: '20 min', icon: '📋' },
  { reason: 'Prescription review', defaultDuration: '15 min', icon: '💊' },
  { reason: 'Report/test review', defaultDuration: '15 min', icon: '📊' },
  { reason: 'Other', defaultDuration: '30 min', icon: '✏️' },
];

const getUpcomingDays = (): DayOption[] => {
  const days: DayOption[] = [];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateString = timeUtils.formatDateToYMD(date);
    days.push({
      dateString,
      dayName: weekdays[date.getDay()],
      dayNum: date.getDate(),
      month: months[date.getMonth()],
      display:
        i === 0
          ? 'Today'
          : i === 1
          ? 'Tomorrow'
          : `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`,
    });
  }
  return days;
};

export const BookingScreen: React.FC = () => {
  const navigation = useNavigation<BookingNavProp>();
  const route = useRoute<BookingRouteProp>();
  const params = route.params || {};

  const {
    doctors: allDoctors,
    clinics: allClinics,
    bookAppointment,
    getPreviousVisitForClinic,
    getPreviousDoctorForDepartment,
  } = useAppointmentStore();
  const { isDark } = useThemeStore();
  const theme = getThemeColors(isDark);

  // Flow Stages: 1. Doctor & Clinic -> 2. Reason & Symptoms & Files -> 3. Date & Time -> 4. Summary
  const [stage, setStage] = useState<'doctor' | 'reason' | 'schedule' | 'summary'>('doctor');

  // Selected State
  const initialDepartment = params.department || 'General Medicine';
  const [department, setDepartment] = useState(initialDepartment);

  const initialClinic =
    allClinics.find((c) => c.id === params.clinicId) ||
    allClinics.find((c) => c.departments?.includes(department)) ||
    allClinics[0];
  const [selectedClinic, setSelectedClinic] = useState<Clinic>(initialClinic);

  const isDoctorForClinic = (d: Doctor) => {
    // If the clinic is explicitly Moon Dental Clinic Villivakkam (2773), match only its assigned doctors
    if (selectedClinic.id === 'c-moon-dental-villivakkam-2773') {
      const cId = d.clinicId || (d as any).clinic_id;
      return cId === 'c-moon-dental-villivakkam-2773' || d.id === 'doc-alagu-vimalesh-2773' || d.id === 'doc-merlin-rajan-2773';
    }
    const cId = d.clinicId || (d as any).clinic_id;
    const cName = d.clinicName || (d as any).clinic_name || '';
    const affiliations = d.clinicAffiliations || (d as any).clinic_affiliations || [];
    return (
      cId === selectedClinic.id ||
      (cName && selectedClinic.name && cName.toLowerCase() === selectedClinic.name.toLowerCase()) ||
      affiliations.some(
        (a: string) =>
          a.toLowerCase() === selectedClinic.name.toLowerCase() ||
          a.toLowerCase() === selectedClinic.id.toLowerCase()
      )
    );
  };

  let rawAvailableDoctors = allDoctors.filter(isDoctorForClinic);

  // If Moon Dental Clinic Mylapore demo, ensure Dr. Arun Kumar is present
  if (
    selectedClinic.id === 'c-demo-moon-01' &&
    !rawAvailableDoctors.some((d) => d.name.toLowerCase().includes('arun') || d.id === 'doc-demo-arun-01')
  ) {
    const arun = allDoctors.find(
      (d) => d.name.toLowerCase().includes('arun') || d.id === 'doc-demo-arun-01'
    );
    if (arun) rawAvailableDoctors = [arun, ...rawAvailableDoctors];
  }

  // Filter doctors by requested specialty/department if specified
  const targetSpecialty = (department || (params as any).category || (params as any).department || '').trim().toLowerCase();
  if (targetSpecialty && targetSpecialty !== 'all' && targetSpecialty !== 'general') {
    const specFiltered = rawAvailableDoctors.filter((d) => {
      const spec = (d.specialization || '').toLowerCase();
      const subSpec = ((d as any).primary_specialization || (d as any).subSpecialization || '').toLowerCase();
      return (
        spec === targetSpecialty ||
        spec.includes(targetSpecialty) ||
        targetSpecialty.includes(spec) ||
        subSpec.includes(targetSpecialty) ||
        targetSpecialty.includes(subSpec)
      );
    });
    if (specFiltered.length > 0) {
      rawAvailableDoctors = specFiltered;
    }
  }

  // Deduplicate strictly by ID
  const doctorMap = new Map<string, Doctor>();
  rawAvailableDoctors.forEach((d) => {
    if (d && d.id && !doctorMap.has(d.id)) {
      doctorMap.set(d.id, d);
    }
  });

  const [clinicLiveDoctors, setClinicLiveDoctors] = useState<Doctor[]>([]);

  useEffect(() => {
    if (selectedClinic?.id) {
      doctorService.getDoctors(selectedClinic.id).then((docs) => {
        if (docs && docs.length > 0) {
          if (targetSpecialty && targetSpecialty !== 'all' && targetSpecialty !== 'general') {
            const specDocs = docs.filter((d) => {
              const spec = (d.specialization || '').toLowerCase();
              const subSpec = ((d as any).primary_specialization || (d as any).subSpecialization || '').toLowerCase();
              return (
                spec === targetSpecialty ||
                spec.includes(targetSpecialty) ||
                targetSpecialty.includes(spec) ||
                subSpec.includes(targetSpecialty) ||
                targetSpecialty.includes(subSpec)
              );
            });
            setClinicLiveDoctors(specDocs.length > 0 ? specDocs : docs);
          } else {
            setClinicLiveDoctors(docs);
          }
        }
      });
    }

    const handleStatusUpdate = (data: any) => {
      const cId = data?.clinic_id || data?.clinicId;
      const dId = data?.doctor_id || data?.doctorId;
      const newStatus = (data?.status || '').toUpperCase();
      if (!cId || cId === selectedClinic?.id || cId === 'all') {
        if (dId && newStatus) {
          setClinicLiveDoctors((prev) =>
            prev.map((doc) => {
              if (doc.id === dId || (doc as any).doctor_id === dId) {
                return {
                  ...doc,
                  status: newStatus,
                  liveStatus: newStatus,
                  isAvailableToday: newStatus === 'AVAILABLE',
                };
              }
              return doc;
            })
          );
          setSelectedDoctor((prev) => {
            if (prev?.id === dId || (prev as any)?.doctor_id === dId) {
              return {
                ...prev,
                status: newStatus,
                liveStatus: newStatus,
                isAvailableToday: newStatus === 'AVAILABLE',
              };
            }
            return prev;
          });
        }
      }
    };

    socketService.subscribe('doctor:status_updated', handleStatusUpdate);
    return () => {
      socketService.unsubscribe('doctor:status_updated', handleStatusUpdate);
    };
  }, [selectedClinic?.id]);

  const availableDoctorsForClinic = Array.from(doctorMap.values()).map((doc) => {
    const live = clinicLiveDoctors.find((ld) => ld.id === doc.id);
    return live ? { ...doc, ...live } : doc;
  });

  const rawPreviousDoctor = getPreviousDoctorForDepartment(department, selectedClinic.id);
  const isPreviousValid = rawPreviousDoctor && isDoctorForClinic(rawPreviousDoctor);
  const previousDoctor = isPreviousValid
    ? rawPreviousDoctor
    : selectedClinic.id === 'c-demo-moon-01'
    ? allDoctors.find((d) => d.name.toLowerCase().includes('arun') || d.id === 'doc-demo-arun-01') || null
    : null;

  const isRctProcedure = Boolean(
    params.procedure &&
      (params.procedure.toLowerCase().includes('root canal') || params.procedure.toLowerCase().includes('rct'))
  );

  const procedureMatchDoctor = params.procedure
    ? (isRctProcedure
        ? availableDoctorsForClinic.find((d) => d.id === 'doc-alagu-vimalesh-2773' || d.name.toLowerCase().includes('alagu')) ||
          availableDoctorsForClinic.find((d) => d.specialization?.toLowerCase().includes('endodontics') || d.specialization?.toLowerCase().includes('conservative')) ||
          availableDoctorsForClinic.find((d) => d.name.toLowerCase().includes('arun') && selectedClinic.id === 'c-demo-moon-01')
        : null) ||
      availableDoctorsForClinic.find(
        (d) =>
          d.specialization?.toLowerCase().includes(params.procedure!.toLowerCase()) ||
          ((d as any).procedures && Array.isArray((d as any).procedures) && (d as any).procedures.some((p: string) => p.toLowerCase().includes(params.procedure!.toLowerCase()))) ||
          d.specialization?.toLowerCase().includes('dent')
      )
    : null;

  const initialDoctor =
    (params.doctorId ? allDoctors.find((d) => d.id === params.doctorId) : null) ||
    procedureMatchDoctor ||
    (previousDoctor && availableDoctorsForClinic.some((d) => d.id === previousDoctor.id)
      ? previousDoctor
      : availableDoctorsForClinic.find((d) => d.status === 'AVAILABLE' && d.isAvailableToday) ||
        availableDoctorsForClinic[0] ||
        allDoctors[0]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor>(initialDoctor);

  useEffect(() => {
    if (!doctorExplicitlySelected.current && !params.doctorId && clinicLiveDoctors.length > 0) {
      const availableDoc = clinicLiveDoctors.find((d) => d.status === 'AVAILABLE' && d.isAvailableToday);
      if (availableDoc) {
        setSelectedDoctor(availableDoc);
      }
    }
  }, [clinicLiveDoctors, params.doctorId]);

  const [reason, setReason] = useState<ConsultationReason>(
    params.procedure ? 'New symptoms' : 'General consultation'
  );
  const [customReasonText, setCustomReasonText] = useState(
    params.procedure ? `${params.procedure}` : ''
  );
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [customSymptomInput, setCustomSymptomInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedMedicalFile[]>([]);
  const [notes, setNotes] = useState('');

  const { user: authUser } = useAuthStore();
  const patientDisplayName = authUser?.name || 'Aarav Sharma';

  const doctorExplicitlySelected = useRef(false);

  useEffect(() => {
    if (params.clinicId) {
      const foundClinic = allClinics.find((c) => c.id === params.clinicId);
      if (foundClinic) setSelectedClinic(foundClinic);
    }
    if (params.department) {
      setDepartment(params.department);
    }
    if (params.procedure) {
      setCustomReasonText((prev) => prev || params.procedure || '');
    }
    if (!doctorExplicitlySelected.current) {
      if (params.doctorId) {
        const foundDoc = allDoctors.find((d) => d.id === params.doctorId);
        if (foundDoc) setSelectedDoctor(foundDoc);
      } else if (params.procedure) {
        const clinicId = params.clinicId || initialClinic?.id;
        const docs = allDoctors.filter(
          (d) =>
            d.clinicId === clinicId ||
            (d as any).clinic_id === clinicId ||
            (initialClinic && d.clinicAffiliations?.includes(initialClinic.name))
        );
        const match = docs.find(
          (d) =>
            d.specialization?.toLowerCase().includes('dent') ||
            d.specialization?.toLowerCase().includes(params.procedure!.toLowerCase()) ||
            (d.name.toLowerCase().includes('arun') && params.procedure!.toLowerCase().includes('root canal'))
        );
        if (match) {
          setSelectedDoctor(match);
        } else if (clinicId === 'c-demo-moon-01' || initialClinic?.name.toLowerCase().includes('moon dental')) {
          const arun = allDoctors.find((d) => d.name.toLowerCase().includes('arun') || d.id === 'doc-demo-arun-01');
          if (arun) setSelectedDoctor(arun);
        }
      }
    }
  }, [params.clinicId, params.department, params.doctorId, params.procedure, allDoctors, initialClinic]);

  // Date & Time
  const daysList = getUpcomingDays();
  const [selectedDate, setSelectedDate] = useState<string>(daysList[0].dateString);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);

  const [groupedSlots, setGroupedSlots] = useState<GroupedTimeSlots>({
    morning: [],
    afternoon: [],
    evening: [],
  });

  const fetchAvailableSlots = useCallback(() => {
    if (selectedDoctor?.id && selectedDate) {
      doctorService.getAvailableSlots(selectedDoctor.id, selectedDate, selectedClinic?.id).then((slots) => {
        if (slots) {
          setGroupedSlots(slots);
          const all = [...(slots.morning || []), ...(slots.afternoon || []), ...(slots.evening || [])];
          const available = all.filter((s) => s.status === 'Available' || s.status === 'Recommended' || s.status === 'Limited');
          if (available.length > 0) {
            setSelectedTime((prev) => {
              const stillValid = available.some((s) => s.time === prev);
              return stillValid ? prev : available[0].time;
            });
          } else {
            setSelectedTime('');
          }
        }
      });
    }
  }, [selectedDoctor?.id, selectedDate, selectedClinic?.id]);

  useEffect(() => {
    fetchAvailableSlots();
  }, [fetchAvailableSlots]);

  // Real-time synchronization: update slots immediately without refresh when doctor approves/rejects, new booking occurs, or demo resets
  useEffect(() => {
    const unsub1 = socketService.subscribe('appointment:slot_activated', fetchAvailableSlots);
    const unsub2 = socketService.subscribe('availability_request:approved', fetchAvailableSlots);
    const unsub3 = socketService.subscribe('availability_request:rejected', fetchAvailableSlots);
    const unsub4 = socketService.subscribe('doctor:availability_updated', fetchAvailableSlots);
    const unsub5 = socketService.subscribe('doctor:availability_changed', fetchAvailableSlots);
    const unsub6 = socketService.subscribe('clinic:schedule_updated', fetchAvailableSlots);
    const unsub7 = socketService.subscribe('appointment:created', fetchAvailableSlots);
    const unsub8 = socketService.subscribe('appointment:status', fetchAvailableSlots);
    const unsub9 = socketService.subscribe('demo:reset', fetchAvailableSlots);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
      unsub7();
      unsub8();
      unsub9();
    };
  }, [fetchAvailableSlots]);

  const clinicPreviousVisit = getPreviousVisitForClinic(selectedClinic.id);

  // Department symptoms list
  const currentDeptObj = MOCK_DEPARTMENTS.find(
    (d) => d.name.toLowerCase() === department.toLowerCase()
  );
  const departmentSymptoms = currentDeptObj?.popularSymptoms || [
    'Fever',
    'Headache',
    'Body Ache',
    'Throat Irritation',
    'Fatigue',
  ];

  const toggleSymptom = (sym: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const handleAddCustomSymptom = () => {
    if (customSymptomInput.trim()) {
      if (!selectedSymptoms.includes(customSymptomInput.trim())) {
        setSelectedSymptoms((prev) => [...prev, customSymptomInput.trim()]);
      }
      setCustomSymptomInput('');
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedTime) {
      Alert.alert('No Time Slot Selected', 'Please select an available consultation slot.');
      return;
    }
    setIsBookingSubmitting(true);
    try {
      const apt = await bookAppointment({
        doctor: selectedDoctor,
        clinicId: selectedClinic.id,
        department,
        date: selectedDate,
        time: selectedTime,
        reason,
        customReasonText: customReasonText.trim() || undefined,
        symptoms: selectedSymptoms,
        uploadedFiles,
        notes: notes.trim() || undefined,
        expectedDuration: selectedDoctor.consultationDuration || '25 min',
        consultationFee: selectedDoctor.consultationFee || '₹400',
      });

      setIsBookingSubmitting(false);

      // Navigate directly into Appointment Details with live queue
      navigation.navigate('AppointmentDetail', {
        appointmentId: apt.id,
        showSuccess: true,
      });
      } catch (error: any) {
      setIsBookingSubmitting(false);
      const isConflict =
        error?.response?.status === 409 ||
        error?.message?.toLowerCase().includes('already booked') ||
        error?.message?.toLowerCase().includes('conflict') ||
        error?.message?.toLowerCase().includes('unavailable');
      const msg = isConflict
        ? 'This slot was just booked. Please choose another available time.'
        : error?.response?.data?.error ||
          error?.message ||
          'Selected time slot is unavailable. Please choose another slot.';
      Alert.alert('Booking Notice', msg);

      // Refresh available dynamic slots for the doctor & date
      if (selectedDoctor?.id && selectedDate) {
        doctorService.getAvailableSlots(selectedDoctor.id, selectedDate, selectedClinic?.id).then((slots) => {
          if (slots) setGroupedSlots(slots);
        });
      }
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header Bar */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? '#06152F' : '#FFFFFF',
            borderBottomColor: theme.cardBorder,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.backgroundSoft }]}
          onPress={() => {
            if (stage === 'summary') setStage('schedule');
            else if (stage === 'schedule') setStage('reason');
            else if (stage === 'reason') setStage('doctor');
            else navigation.goBack();
          }}
          activeOpacity={0.85}
        >
          <ArrowLeft size={18} color={theme.textPrimary} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
            {stage === 'doctor'
              ? 'Select Clinic & Doctor'
              : stage === 'reason'
              ? 'Symptoms & Medical Files'
              : stage === 'schedule'
              ? 'Choose Date & Time'
              : 'Review Appointment'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
            {department} · Physical OPD Visit
          </Text>
        </View>

        <ThemeToggle compact />
      </View>

      {/* Guided Progress Stepper */}
      <View style={[styles.stepperContainer, { borderBottomColor: theme.cardBorder }]}>
        {[
          { key: 'doctor', label: '1. Doctor' },
          { key: 'reason', label: '2. Details' },
          { key: 'schedule', label: '3. Time' },
          { key: 'summary', label: '4. Summary' },
        ].map((step, idx) => {
          const isCurrent = stage === step.key;
          return (
            <View key={step.key} style={styles.stepIndicator}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: isCurrent ? theme.primary : theme.backgroundSoft,
                    borderColor: isCurrent ? theme.cta : theme.cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepDotNum,
                    { color: isCurrent ? '#FFFFFF' : theme.textMuted },
                  ]}
                >
                  {idx + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabelText,
                  { color: isCurrent ? theme.primary : theme.textMuted, fontWeight: isCurrent ? '700' : '500' },
                ]}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ======================================================= */}
        {/* STAGE 1: CLINIC & DOCTOR SELECTION                      */}
        {/* ======================================================= */}
        {stage === 'doctor' && (
          <View style={styles.stageSection}>
            {/* Selected Clinic Card */}
            <View
              style={[
                styles.clinicSummaryCard,
                {
                  backgroundColor: isDark ? '#0C2347' : '#FFFFFF',
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <Image source={{ uri: selectedClinic.image }} style={styles.clinicThumb} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.clinicCategory, { color: theme.primary }]}>
                  {selectedClinic.category}
                </Text>
                <Text style={[styles.clinicTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {selectedClinic.name}
                </Text>
                <Text style={[styles.clinicMetaText, { color: theme.textSecondary }]}>
                  📍 {selectedClinic.distance} · 🚗 {selectedClinic.travelTime || '10 min'}
                </Text>
              </View>
            </View>

            {/* Previous Visit Continuity for this Clinic */}
            {clinicPreviousVisit && (
              <PreviousVisitCard
                visitInfo={clinicPreviousVisit}
                onContinueDoctor={() => {
                  const doc = allDoctors.find((d) => d.name === clinicPreviousVisit.doctorName);
                  if (doc) {
                    doctorExplicitlySelected.current = true;
                    setSelectedDoctor(doc);
                  }
                }}
              />
            )}

            {/* Previous Doctor Recommendation Banner */}
            {previousDoctor && (
              <PreviousDoctorCard
                doctor={previousDoctor}
                isSelected={selectedDoctor.id === previousDoctor.id}
                onSelect={() => {
                  doctorExplicitlySelected.current = true;
                  setSelectedDoctor(previousDoctor);
                }}
              />
            )}

            {/* Available Doctors List */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Available Practitioners
              </Text>
              <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
                Verified specialists with consultation fees
              </Text>
            </View>

            {availableDoctorsForClinic.map((doctor) => {
              const isSelected = selectedDoctor.id === doctor.id;
              return (
                <TouchableOpacity
                  key={doctor.id}
                  style={[
                    styles.doctorSelectCard,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? '#0F2557'
                          : '#EBF0FF'
                        : isDark
                        ? '#0C2347'
                        : '#FFFFFF',
                      borderColor: isSelected ? theme.primary : theme.cardBorder,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    doctorExplicitlySelected.current = true;
                    setSelectedDoctor(doctor);
                  }}
                  activeOpacity={0.88}
                >
                  <Image source={{ uri: doctor.avatar }} style={styles.doctorAvatar} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.docNameRow}>
                      <Text style={[styles.docName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {doctor.name}
                      </Text>
                      {doctor.isVerified && <ShieldCheck size={14} color={theme.primary} />}
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              doctor.status === 'AVAILABLE' && doctor.isAvailableToday
                                ? isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7'
                                : doctor.status === 'BUSY'
                                ? isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7'
                                : isDark ? 'rgba(148, 163, 184, 0.2)' : '#F1F5F9',
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor:
                                doctor.status === 'AVAILABLE' && doctor.isAvailableToday
                                  ? '#10B981'
                                  : doctor.status === 'BUSY'
                                  ? '#FBBF24'
                                  : '#94A3B8',
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color:
                                doctor.status === 'AVAILABLE' && doctor.isAvailableToday
                                  ? isDark ? '#6EE7B7' : '#15803D'
                                  : doctor.status === 'BUSY'
                                  ? isDark ? '#FBBF24' : '#B45309'
                                  : isDark ? '#94A3B8' : '#64748B',
                            },
                          ]}
                        >
                          {doctor.status === 'AVAILABLE' && doctor.isAvailableToday
                            ? 'AVAILABLE'
                            : doctor.status === 'BUSY'
                            ? 'BUSY'
                            : 'NOT AVAILABLE / OFFLINE'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.docSpec, { color: theme.primary }]}>{doctor.specialization}</Text>
                    <Text style={[styles.docExp, { color: theme.textMuted }]}>
                      {doctor.qualification} · {doctor.experienceYears}y exp
                    </Text>

                    <View style={styles.docFeeRow}>
                      <Text style={[styles.docFee, { color: theme.textPrimary }]}>
                        {doctor.consultationFee}
                      </Text>
                      <Text style={[styles.docDuration, { color: theme.textMuted }]}>
                        / {doctor.consultationDuration || '25 min'}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.radioCircle,
                      {
                        borderColor: isSelected ? theme.primary : theme.cardBorder,
                        backgroundColor: isSelected ? theme.primary : 'transparent',
                      },
                    ]}
                  >
                    {isSelected && <Check size={12} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ======================================================= */}
        {/* STAGE 2: REASON FOR VISIT, SYMPTOMS & FILE UPLOAD       */}
        {/* ======================================================= */}
        {stage === 'reason' && (
          <View style={styles.stageSection}>
            {/* Reason Selection */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Why are you visiting?
              </Text>
              <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
                Select the primary reason for your consultation
              </Text>
            </View>

            <View style={styles.reasonsGrid}>
              {CONSULTATION_REASONS.map((item) => {
                const isSelected = reason === item.reason;
                return (
                  <TouchableOpacity
                    key={item.reason}
                    style={[
                      styles.reasonChip,
                      {
                        backgroundColor: isSelected
                          ? theme.primary
                          : isDark
                          ? '#0C2347'
                          : '#FFFFFF',
                        borderColor: isSelected ? theme.primary : theme.cardBorder,
                      },
                    ]}
                    onPress={() => setReason(item.reason)}
                  >
                    <Text style={styles.reasonEmoji}>{item.icon}</Text>
                    <Text
                      style={[
                        styles.reasonText,
                        { color: isSelected ? '#FFFFFF' : theme.textPrimary },
                      ]}
                    >
                      {item.reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Notes / Description */}
            <View style={styles.formGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                Tell your doctor what you'd like to discuss (Optional)
              </Text>
              <TextInput
                style={[
                  styles.textAreaInput,
                  {
                    color: theme.textPrimary,
                    backgroundColor: isDark ? '#0C2347' : '#FFFFFF',
                    borderColor: theme.cardBorder,
                  },
                ]}
                placeholder="Describe your symptoms, how long you've felt this way, or previous treatments..."
                placeholderTextColor={theme.textMuted}
                multiline
                numberOfLines={3}
                value={customReasonText}
                onChangeText={setCustomReasonText}
              />
            </View>

            {/* Symptoms Selection */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Select Symptoms
              </Text>
              <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
                Tap common symptoms to inform your practitioner
              </Text>
            </View>

            <View style={styles.symptomsWrap}>
              {departmentSymptoms.map((sym) => {
                const isSelected = selectedSymptoms.includes(sym);
                return (
                  <TouchableOpacity
                    key={sym}
                    style={[
                      styles.symptomPill,
                      {
                        backgroundColor: isSelected
                          ? theme.primary
                          : isDark
                          ? '#0C2347'
                          : '#FFFFFF',
                        borderColor: isSelected ? theme.primary : theme.cardBorder,
                      },
                    ]}
                    onPress={() => toggleSymptom(sym)}
                  >
                    <Text
                      style={[
                        styles.symptomPillText,
                        { color: isSelected ? '#FFFFFF' : theme.textPrimary },
                      ]}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      {sym}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Add Custom Symptom */}
            <View style={styles.addSymptomRow}>
              <TextInput
                style={[
                  styles.addSymptomInput,
                  {
                    color: theme.textPrimary,
                    backgroundColor: isDark ? '#0C2347' : '#FFFFFF',
                    borderColor: theme.cardBorder,
                  },
                ]}
                placeholder="Add other symptom..."
                placeholderTextColor={theme.textMuted}
                value={customSymptomInput}
                onChangeText={setCustomSymptomInput}
              />
              <TouchableOpacity
                style={[styles.addSymptomBtn, { backgroundColor: theme.primary }]}
                onPress={handleAddCustomSymptom}
              >
                <Plus size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Previous Test Reports Upload */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Previous Reports & Tests
              </Text>
              <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
                Attach past lab results, scans, or prescriptions for the doctor to review
              </Text>
            </View>

            <FileUploadCard
              files={uploadedFiles}
              onAddFile={(newFile) => setUploadedFiles((prev) => [...prev, newFile])}
              onRemoveFile={(fileId) => setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId))}
            />
          </View>
        )}

        {/* ======================================================= */}
        {/* STAGE 3: DATE & TIME SELECTION                          */}
        {/* ======================================================= */}
        {stage === 'schedule' && (
          <View style={styles.stageSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Select Consultation Date
              </Text>
              <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
                Available appointment days for {selectedDoctor.name}
              </Text>
            </View>

            <DateSelector
              days={daysList}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            <View style={[styles.sectionHeader, { marginTop: 12 }]}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Choose Time Slot
              </Text>
              <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
                Average consultation length: {selectedDoctor.consultationDuration || '25 min'}
              </Text>
            </View>

            <TimeSlotSelector
              slots={groupedSlots}
              selectedTime={selectedTime}
              onSelectTime={setSelectedTime}
            />
          </View>
        )}

        {/* ======================================================= */}
        {/* STAGE 4: APPOINTMENT SUMMARY TIMELINE                   */}
        {/* ======================================================= */}
        {stage === 'summary' && (
          <View style={styles.stageSection}>
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: isDark ? '#0C2347' : '#FFFFFF',
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              {/* Doctor Header */}
              <View style={styles.summaryDocRow}>
                <Image source={{ uri: selectedDoctor.avatar }} style={styles.summaryDocAvatar} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.summaryDocName, { color: theme.textPrimary }]}>
                    {selectedDoctor.name}
                  </Text>
                  <Text style={[styles.summaryDocSpec, { color: theme.primary }]}>
                    {selectedDoctor.specialization} · {department}
                  </Text>
                  <Text style={[styles.summaryClinicName, { color: theme.textSecondary }]}>
                    🏥 {selectedClinic.name}
                  </Text>
                </View>
              </View>

              <View style={[styles.summaryDivider, { backgroundColor: theme.cardBorder }]} />

              {/* Appointment Timeline Details */}
              <View style={styles.summaryTimelineList}>
                <View style={styles.summaryItem}>
                  <User size={15} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryItemLabel, { color: theme.textMuted }]}>
                      PATIENT
                    </Text>
                    <Text style={[styles.summaryItemValue, { color: theme.textPrimary }]}>
                      {patientDisplayName}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryItem}>
                  <Building2 size={15} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryItemLabel, { color: theme.textMuted }]}>
                      CLINIC
                    </Text>
                    <Text style={[styles.summaryItemValue, { color: theme.textPrimary }]}>
                      {selectedClinic.name}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryItem}>
                  <Stethoscope size={15} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryItemLabel, { color: theme.textMuted }]}>
                      DOCTOR & SPECIALIZATION
                    </Text>
                    <Text style={[styles.summaryItemValue, { color: theme.textPrimary }]}>
                      {selectedDoctor.name} · {selectedDoctor.specialization}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryItem}>
                  <Calendar size={15} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryItemLabel, { color: theme.textMuted }]}>
                      DATE & TIME
                    </Text>
                    <Text style={[styles.summaryItemValue, { color: theme.textPrimary }]}>
                      {selectedDate} at {selectedTime}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryItem}>
                  <Clock size={15} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryItemLabel, { color: theme.textMuted }]}>
                      ESTIMATED DURATION & FEE
                    </Text>
                    <Text style={[styles.summaryItemValue, { color: theme.textPrimary }]}>
                      {selectedDoctor.consultationDuration || '20 min'} · {selectedDoctor.consultationFee || '₹400'}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryItem}>
                  <Stethoscope size={15} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryItemLabel, { color: theme.textMuted }]}>
                      REASON FOR VISIT
                    </Text>
                    <Text style={[styles.summaryItemValue, { color: theme.textPrimary }]}>
                      {reason} {customReasonText ? `· "${customReasonText}"` : ''}
                    </Text>
                  </View>
                </View>

                {selectedSymptoms.length > 0 && (
                  <View style={styles.summaryItem}>
                    <AlertCircle size={15} color={theme.cta} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.summaryItemLabel, { color: theme.textMuted }]}>
                        REPORTED SYMPTOMS
                      </Text>
                      <Text style={[styles.summaryItemValue, { color: theme.textPrimary }]}>
                        {selectedSymptoms.join(', ')}
                      </Text>
                    </View>
                  </View>
                )}

                {uploadedFiles.length > 0 && (
                  <View style={styles.summaryItem}>
                    <FileText size={15} color={theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.summaryItemLabel, { color: theme.textMuted }]}>
                        ATTACHED TEST REPORTS
                      </Text>
                      <Text style={[styles.summaryItemValue, { color: theme.textPrimary }]}>
                        {uploadedFiles.map((f) => f.testName).join(', ')}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Hospital Visit Notice */}
            <View style={[styles.noticeCard, { backgroundColor: isDark ? '#06152F' : '#F1F5F9', borderColor: theme.cardBorder }]}>
              <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>
                🏥 Physical OPD Visit Guidelines
              </Text>
              <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
                Please arrive at {selectedClinic.name} 10 minutes prior to your slot ({selectedTime}). Bring your digital token displayed in this app upon check-in.
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 130 }} />
      </ScrollView>

      {/* Sticky Bottom Actions Bar */}
      <View
        style={[
          styles.footerBar,
          {
            backgroundColor: isDark ? '#0C2347' : '#FFFFFF',
            borderTopColor: theme.cardBorder,
          },
        ]}
      >
        <View style={styles.footerSummaryCol}>
          <Text style={[styles.footerSubLabel, { color: theme.textMuted }]}>CONSULTATION FEE</Text>
          <Text style={[styles.footerFee, { color: theme.textPrimary }]}>
            {selectedDoctor.consultationFee || '₹400'}
          </Text>
        </View>

        {stage === 'doctor' && (
          <TouchableOpacity
            style={[
              styles.nextBtn,
              {
                backgroundColor:
                  selectedDoctor?.status === 'AVAILABLE' && selectedDoctor?.isAvailableToday
                    ? theme.cta
                    : isDark ? '#1E293B' : '#CBD5E1',
                opacity:
                  selectedDoctor?.status === 'AVAILABLE' && selectedDoctor?.isAvailableToday ? 1 : 0.6,
              },
            ]}
            onPress={() => {
              if (selectedDoctor?.status !== 'AVAILABLE' || !selectedDoctor?.isAvailableToday) {
                Alert.alert(
                  'Doctor Unavailable',
                  `Doctor ${selectedDoctor?.name || ''} is currently ${
                    selectedDoctor?.status === 'BUSY' ? 'busy' : 'offline / not available'
                  }. Please select an available doctor.`
                );
                return;
              }
              setStage('reason');
            }}
            activeOpacity={0.88}
          >
            <Text style={styles.nextBtnText}>Continue to Details</Text>
            <ChevronRight size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {stage === 'reason' && (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: theme.cta }]}
            onPress={() => setStage('schedule')}
            activeOpacity={0.88}
          >
            <Text style={styles.nextBtnText}>Select Time Slot</Text>
            <ChevronRight size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {stage === 'schedule' && (
          <TouchableOpacity
            style={[
              styles.nextBtn,
              {
                backgroundColor: !selectedTime ? (isDark ? '#1E293B' : '#CBD5E1') : theme.cta,
                opacity: !selectedTime ? 0.6 : 1,
              },
            ]}
            onPress={() => {
              if (!selectedTime) {
                Alert.alert('No Time Slot', 'Please select an available consultation slot before continuing.');
                return;
              }
              setStage('summary');
            }}
            disabled={!selectedTime}
            activeOpacity={0.88}
          >
            <Text style={styles.nextBtnText}>Review Summary</Text>
            <ChevronRight size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {stage === 'summary' && (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: theme.cta }]}
            onPress={handleConfirmBooking}
            disabled={isBookingSubmitting}
            activeOpacity={0.88}
          >
            {isBookingSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>Confirm Booking</Text>
                <CheckCircle size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 11,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotNum: {
    fontSize: 9,
    fontWeight: '800',
  },
  stepLabelText: {
    fontSize: 10.5,
  },
  scrollContent: {
    padding: SPACING.md,
    gap: 14,
  },
  stageSection: {
    gap: 14,
  },
  clinicSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: 10,
    ...SHADOWS.card,
  },
  clinicThumb: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
  },
  clinicCategory: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  clinicTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  clinicMetaText: {
    fontSize: 11,
  },
  sectionHeader: {
    gap: 2,
    marginTop: 4,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
  },
  sectionSub: {
    fontSize: 11,
  },
  doctorSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    gap: 10,
    ...SHADOWS.card,
  },
  doctorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  docNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  docName: {
    fontSize: 13,
    fontWeight: '700',
  },
  docSpec: {
    fontSize: 11,
    fontWeight: '600',
  },
  docExp: {
    fontSize: 10,
  },
  docFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  docFee: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  docDuration: {
    fontSize: 10.5,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: 5,
  },
  reasonEmoji: {
    fontSize: 13,
  },
  reasonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  formGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  textAreaInput: {
    borderRadius: RADIUS.md,
    padding: 10,
    borderWidth: 1,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  symptomsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  symptomPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  symptomPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  addSymptomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addSymptomInput: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    fontSize: 12,
  },
  addSymptomBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    gap: 12,
    ...SHADOWS.card,
  },
  summaryDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryDocAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  summaryDocName: {
    fontSize: 15,
    fontWeight: '700',
  },
  summaryDocSpec: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryClinicName: {
    fontSize: 11,
  },
  summaryDivider: {
    height: 1,
  },
  summaryTimelineList: {
    gap: 10,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  summaryItemLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryItemValue: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  noticeCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  noticeText: {
    fontSize: 11,
    lineHeight: 16,
  },
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderTopWidth: 1,
    ...SHADOWS.float,
  },
  footerSummaryCol: {
    gap: 1,
  },
  footerSubLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerFee: {
    fontSize: 16,
    fontWeight: '800',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginLeft: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
