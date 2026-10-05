import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
  Dimensions,
  RefreshControl,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import {
  Bell,
  MapPin,
  ChevronRight,
  Search,
  X,
  Sparkles,
  Star,
  Clock,
  Calendar,
  ShieldCheck,
  Navigation,
  Bot,
  Megaphone,
  FileText,
  PlusCircle,
  Building2,
} from 'lucide-react-native';
import { AppStackParamList, Clinic, Doctor } from '../../types';
import { SPACING, RADIUS, SHADOWS, TYPOGRAPHY, getThemeColors } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore } from '../../store/useAppStore';
import { useAppointmentStore } from '../../store/useAppointmentStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useThemeStore } from '../../store/useThemeStore';
import { clinicSearchService } from '../../services/clinicSearchService';
import { LocationSelectorModal } from '../../components/LocationSelectorModal';
import { MedLinkAssistantModal } from '../../components/MedLinkAssistantModal';
import { AppointmentCard } from '../../components/AppointmentCard';
import { ThemeToggle } from '../../components/ThemeToggle';
import { MOCK_DEPARTMENTS } from '../../data/mockData';
import { timeUtils } from '../../utils/timeUtils';

type HomeNavProp = StackNavigationProp<AppStackParamList>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeNavProp>();
  const { user } = useAuthStore();
  const { activeLocation, startGpsWatching } = useAppStore();
  const { unreadCount, announcements } = useNotificationStore();
  const {
    appointments,
    doctors,
    earlierSlotSuggestion,
    acceptEarlierSlot,
    declineEarlierSlot,
  } = useAppointmentStore();
  const { isDark } = useThemeStore();
  const theme = getThemeColors(isDark);

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [totalClinics, setTotalClinics] = useState<number>(0);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingClinics, setIsLoadingClinics] = useState(true);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [isChatbotVisible, setIsChatbotVisible] = useState(false);
  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [liveTime, setLiveTime] = useState(timeUtils.formatCurrentTime());

  // Real-time clock interval (updates live every second without page refresh)
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(timeUtils.formatCurrentTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const fetchDiscoveryData = async () => {
    setIsLoadingClinics(true);
    const deptObj = selectedDeptId ? MOCK_DEPARTMENTS.find((d) => d.id === selectedDeptId) : null;
    const searchQuery = deptObj ? deptObj.name : '';
    const result = await clinicSearchService.discoverNearby(
      searchQuery,
      20,
      { latitude: activeLocation.latitude, longitude: activeLocation.longitude },
      deptObj ? deptObj.name : null
    );
    setClinics(result.clinics);
    setTotalClinics(result.total ?? result.clinics.length);
    setIsLoadingClinics(false);
  };

  useEffect(() => {
    const unwatch = startGpsWatching();
    return () => {
      if (unwatch) unwatch();
    };
  }, []);

  useEffect(() => {
    fetchDiscoveryData();
  }, [selectedDeptId, activeLocation]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchDiscoveryData();
    setIsRefreshing(false);
  }, [selectedDeptId, activeLocation]);

  const handleSelectSuggestion = (item: { label: string; category?: string }) => {
    setIsSearchFocused(false);
    setHomeSearchQuery('');
    navigation.navigate('MainTabs', {
      screen: 'SearchTab',
      params: { category: item.category, query: item.label } as any,
    });
  };

  const todayStr = timeUtils.getTodayDateString();
  const activeAppointments = appointments.filter((a) =>
    ['Waiting', 'Almost Your Turn', 'Next', 'Confirmed', 'Checked In', 'In Consultation', 'Delayed', 'Booked'].includes(a.status) &&
    !['Cancelled', 'CANCELLED', 'Completed', 'COMPLETED'].includes(a.status)
  );
  const nextAppt = activeAppointments.find((a) => {
    const rawDate = a.date || (a as any).appointmentDate || '';
    const aptDate = rawDate.slice(0, 10);
    return aptDate === todayStr || (rawDate.toLowerCase().includes('today') && !rawDate.toLowerCase().includes('yesterday')) || (a as any).isToday;
  }) || activeAppointments[0];

  const popularSuggestions = [
    { label: 'General Physician', category: 'General Medicine' },
    { label: 'Cardiologist', category: 'Cardiology' },
    { label: 'Dermatologist', category: 'Dermatology' },
    { label: 'Ophthalmologist', category: 'Ophthalmology' },
    { label: 'Dentist', category: 'Dentistry' },
    { label: 'ENT Specialist', category: 'ENT' },
    { label: 'Pediatrician', category: 'Pediatrics' },
    { label: 'Orthopedic', category: 'Orthopedics' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ─── 1. COMPACT HEADER: Location + Theme + Notification + Avatar ─── */}
      <View style={[styles.header, { backgroundColor: isDark ? '#06152F' : '#081B4B' }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.locationPill}
            onPress={() => setIsLocationModalVisible(true)}
            activeOpacity={0.8}
          >
            <MapPin size={14} color="#38BDF8" />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationLabel}>
                {activeLocation.type === 'gps' ? 'CURRENT LOCATION' : 'EXPLORING'}
              </Text>
              <Text style={styles.locationValue} numberOfLines={1}>
                {activeLocation.locality || activeLocation.name}
              </Text>
            </View>
            <ChevronRight size={12} color="#64748B" />
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <ThemeToggle compact />

            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.navigate('Notifications')}
              activeOpacity={0.8}
            >
              <Bell size={16} color="#FFFFFF" />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}
              activeOpacity={0.8}
            >
              <Image
                source={{
                  uri:
                    user?.avatar ||
                    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150',
                }}
                style={styles.avatar}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── 2. GREETING & BOOK ACTION ─── */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {getGreeting()},{' '}
              <Text style={{ color: '#38BDF8' }}>{user?.name?.split(' ')[0] || 'Sarah'}</Text> 👋
            </Text>
            <Text style={styles.greetingSub}>
              {timeUtils.getTodayFormatted()} · ⏰ {liveTime}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.quickBookBtn, { backgroundColor: theme.cta }]}
            onPress={() => navigation.navigate('SelectDepartment')}
            activeOpacity={0.88}
          >
            <PlusCircle size={15} color="#FFFFFF" />
            <Text style={styles.quickBookBtnText}>Book Visit</Text>
          </TouchableOpacity>
        </View>

        {/* ─── 3. SEARCH BAR ─── */}
        <View style={[styles.searchBox, { backgroundColor: isDark ? '#0C2347' : '#FFFFFF' }]}>
          <Search size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#F1F5F9' : '#0B1736' }]}
            placeholder="Search departments, clinics, doctors..."
            placeholderTextColor={theme.textMuted}
            value={homeSearchQuery}
            onChangeText={setHomeSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onSubmitEditing={() => {
              if (homeSearchQuery.trim()) {
                setIsSearchFocused(false);
                navigation.navigate('MainTabs', {
                  screen: 'SearchTab',
                  params: { query: homeSearchQuery.trim() } as any,
                });
              }
            }}
          />
          {isSearchFocused && (
            <TouchableOpacity
              onPress={() => {
                setIsSearchFocused(false);
                setHomeSearchQuery('');
              }}
              style={{ padding: 4 }}
            >
              <X size={14} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
        }
      >
        {/* ─── SEARCH SUGGESTIONS OVERLAY ─── */}
        {isSearchFocused && (
          <View style={[styles.suggestionsPanel, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.panelLabel, { color: theme.textMuted }]}>POPULAR DEPARTMENTS</Text>
            <View style={styles.pillGrid}>
              {popularSuggestions.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.suggPill, { backgroundColor: theme.backgroundSoft, borderColor: theme.cardBorder }]}
                  onPress={() => handleSelectSuggestion(item)}
                >
                  <Text style={[styles.suggPillText, { color: theme.textPrimary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.panelLabel, { color: theme.textMuted, marginTop: 12 }]}>QUICK SEARCHES</Text>
            {['Ophthalmologist near me', 'General Physician consultation', 'Apex Cardiology Center'].map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.recentRow, { borderColor: theme.cardBorder }]}
                onPress={() => handleSelectSuggestion({ label: item })}
              >
                <Clock size={12} color={theme.textMuted} />
                <Text style={[styles.recentText, { color: theme.textSecondary }]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ─── 4. UPCOMING APPOINTMENT & LIVE QUEUE ─── */}
        {!isSearchFocused && nextAppt && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Calendar size={15} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                  {['Checked In', 'In Consultation', 'Waiting', 'Next', 'Almost Your Turn'].includes(nextAppt.status)
                    ? 'Live Appointment'
                    : 'Upcoming Appointment'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'AppointmentsTab' })}>
                <Text style={[styles.seeAll, { color: theme.primary }]}>All ({appointments.length})</Text>
              </TouchableOpacity>
            </View>

            <AppointmentCard
              appointment={nextAppt}
              onPress={(apt) => navigation.navigate('AppointmentDetail', { appointmentId: apt.id })}
            />

            {/* Earlier Slot Suggestion */}
            {earlierSlotSuggestion && earlierSlotSuggestion.appointmentId === nextAppt.id && (
              <View style={[styles.earlierSlot, { backgroundColor: theme.card, borderColor: theme.primary }]}>
                <View style={styles.earlierSlotHead}>
                  <Sparkles size={14} color={theme.primary} />
                  <Text style={[styles.earlierSlotTitle, { color: theme.primary }]}>Earlier Slot Available!</Text>
                </View>
                <Text style={[styles.earlierSlotDesc, { color: theme.textSecondary }]}>
                  Move up with <Text style={{ fontWeight: '700' }}>{nextAppt.doctorName}</Text> at{' '}
                  <Text style={{ fontWeight: '700' }}>{nextAppt.clinicName}</Text>.
                </Text>
                <View style={[styles.slotComparison, { backgroundColor: theme.backgroundSoft, borderColor: theme.cardBorder }]}>
                  <View style={styles.slotCol}>
                    <Text style={[styles.slotLabel, { color: theme.textMuted }]}>Current</Text>
                    <Text style={[styles.slotValue, { color: theme.textPrimary }]}>{nextAppt.date}</Text>
                    <Text style={[styles.slotSub, { color: theme.textPrimary }]}>{nextAppt.time}</Text>
                  </View>
                  <View style={styles.slotArrow}>
                    <Text style={{ fontSize: 14 }}>➡️</Text>
                    <View style={[styles.savingBadge, { backgroundColor: theme.primaryLight }]}>
                      <Text style={[styles.savingText, { color: theme.primary }]}>{earlierSlotSuggestion.timeDifference}</Text>
                    </View>
                  </View>
                  <View style={styles.slotCol}>
                    <Text style={[styles.slotLabel, { color: theme.success }]}>Earlier</Text>
                    <Text style={[styles.slotValue, { color: theme.textPrimary }]}>{earlierSlotSuggestion.newDate}</Text>
                    <Text style={[styles.slotSub, { color: theme.success, fontWeight: '700' }]}>{earlierSlotSuggestion.newTime}</Text>
                  </View>
                </View>
                <View style={styles.slotActions}>
                  <TouchableOpacity
                    style={[styles.acceptBtn, { backgroundColor: theme.cta }]}
                    onPress={() => {
                      acceptEarlierSlot(earlierSlotSuggestion.appointmentId);
                      Alert.alert('Rescheduled', 'Your appointment has been updated to the earlier slot!');
                    }}
                  >
                    <Text style={styles.acceptBtnText}>Accept Earlier Slot</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keepBtn, { borderColor: theme.cardBorder, backgroundColor: theme.backgroundSoft }]}
                    onPress={() => declineEarlierSlot(earlierSlotSuggestion.appointmentId)}
                  >
                    <Text style={[styles.keepBtnText, { color: theme.textSecondary }]}>Keep Current</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ─── 5. DEPARTMENTS RAIL (Step 1 Gateway) ─── */}
        {!isSearchFocused && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Medical Departments</Text>
                <Text style={[styles.sectionSub, { color: theme.textMuted }]}>Choose a department to find clinics on map</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('SelectDepartment')}>
                <Text style={[styles.seeAll, { color: theme.primary }]}>All ({MOCK_DEPARTMENTS.length})</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.specScroll}>
              {MOCK_DEPARTMENTS.map((dept) => {
                const isSelected = selectedDeptId === dept.id;
                return (
                  <TouchableOpacity
                    key={dept.id}
                    style={[
                      styles.specChip,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.card,
                        borderColor: isSelected ? theme.primary : theme.cardBorder,
                      },
                    ]}
                    onPress={() => {
                      setSelectedDeptId((prev) => (prev === dept.id ? null : dept.id));
                      navigation.navigate('MapView', { department: dept.name });
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.specIcon}>{dept.icon}</Text>
                    <Text
                      style={[
                        styles.specText,
                        {
                          color: isSelected ? '#FFFFFF' : theme.textPrimary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {dept.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ─── 6. NEARBY CLINICS / HOSPITALS ─── */}
        {!isSearchFocused && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Healthcare Near You</Text>
                <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
                  {totalClinics > 0 ? `${totalClinics} centers around` : 'Around'} {activeLocation.name} · Physical OPD Centers
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('MapView', { department: selectedDeptId || undefined })}
              >
                <Text style={[styles.seeAll, { color: theme.primary }]}>Map View</Text>
              </TouchableOpacity>
            </View>

            {isLoadingClinics ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ paddingVertical: 32 }} />
            ) : clinics.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  No healthcare centers found within 15 km.
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hScroll}
                snapToInterval={210}
                decelerationRate="fast"
              >
                {clinics.map((clinic) => (
                  <TouchableOpacity
                    key={clinic.id}
                    style={[styles.clinicCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                    onPress={() => navigation.navigate('ClinicDetail', { clinicId: clinic.id })}
                    activeOpacity={0.92}
                  >
                    <Image source={{ uri: clinic.image }} style={styles.clinicImg} />
                    <View style={styles.ratingOverlay}>
                      <Star size={9} color="#FFF" fill="#FFF" />
                      <Text style={styles.ratingOverlayText}>{clinic.rating}</Text>
                    </View>
                    <View style={styles.clinicContent}>
                      <Text style={[styles.clinicName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {clinic.name}
                      </Text>
                      <Text style={[styles.clinicCat, { color: theme.primary }]}>{clinic.category}</Text>
                      <View style={styles.clinicMeta}>
                        <MapPin size={10} color={theme.textMuted} />
                        <Text style={[styles.clinicMetaText, { color: theme.textSecondary }]}>
                          {clinic.distance}
                          {clinic.travelTime ? ` · ${clinic.travelTime}` : ''}
                        </Text>
                      </View>
                      <View style={styles.clinicBottom}>
                        <View
                          style={[
                            styles.openBadge,
                            {
                              backgroundColor: clinic.isOpen !== false ? theme.successLight : theme.errorLight,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.openDot,
                              {
                                backgroundColor: clinic.isOpen !== false ? theme.success : theme.error,
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.openText,
                              {
                                color: clinic.isOpen !== false ? theme.success : theme.error,
                              },
                            ]}
                          >
                            {clinic.isOpen !== false ? 'Open' : 'Closed'}
                          </Text>
                        </View>
                        <Text style={[styles.docCount, { color: theme.textMuted }]}>
                          {clinic.doctorsCount} doc{clinic.doctorsCount !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* ─── 7. AVAILABLE DOCTORS ─── */}
        {!isSearchFocused && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Available Practitioners</Text>
                <Text style={[styles.sectionSub, { color: theme.textMuted }]}>Verified licensed doctors</Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('MainTabs', { screen: 'SearchTab', params: { query: 'doctor' } as any })}
              >
                <Text style={[styles.seeAll, { color: theme.primary }]}>See all ({doctors.length})</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
              snapToInterval={175}
              decelerationRate="fast"
            >
              {doctors.map((doctor) => (
                <TouchableOpacity
                  key={doctor.id}
                  style={[styles.docCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  onPress={() => navigation.navigate('DoctorProfile', { doctorId: doctor.id })}
                  activeOpacity={0.92}
                >
                  <Image source={{ uri: doctor.avatar }} style={styles.docAvatar} />
                  {doctor.isVerified && (
                    <View style={[styles.verifiedMark, { backgroundColor: theme.primaryLight }]}>
                      <ShieldCheck size={9} color={theme.primary} />
                    </View>
                  )}
                  <Text style={[styles.docName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {doctor.name}
                  </Text>
                  <Text style={[styles.docSpec, { color: theme.primary }]} numberOfLines={1}>
                    {doctor.specialization}
                  </Text>
                  <View style={styles.docMeta}>
                    <Star size={10} fill="#F59E0B" color="#F59E0B" />
                    <Text style={[styles.docMetaText, { color: theme.textPrimary }]}>{doctor.rating}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>·</Text>
                    <Text style={[styles.docMetaText, { color: theme.textSecondary }]}>{doctor.experienceYears}yr</Text>
                  </View>
                  <Text style={[styles.docFee, { color: theme.textSecondary }]}>{doctor.consultationFee}</Text>
                  <TouchableOpacity
                    style={[styles.bookBtn, { backgroundColor: theme.cta }]}
                    onPress={() =>
                      navigation.navigate('Booking', {
                        doctorId: doctor.id,
                        clinicId: doctor.clinicId,
                        department: doctor.specialization,
                      })
                    }
                  >
                    <Text style={styles.bookBtnText}>Book Visit</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ─── 8. SERVICES & ANNOUNCEMENTS ─── */}
        {!isSearchFocused && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary, paddingHorizontal: SPACING.md }]}>
              Health Services & Maps
            </Text>

            {announcements.length > 0 && (
              <View style={[styles.announceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.announceHead}>
                  <Megaphone size={14} color="#EC4899" />
                  <Text style={[styles.announceTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                    {announcements[0].title}
                  </Text>
                </View>
                <Text style={[styles.announceBody, { color: theme.textSecondary }]} numberOfLines={2}>
                  {announcements[0].summary}
                </Text>
              </View>
            )}

            <View style={styles.servicesRow}>
              <TouchableOpacity
                style={[styles.serviceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                onPress={() => navigation.navigate('MapView')}
              >
                <View style={[styles.serviceIcon, { backgroundColor: theme.primaryLight }]}>
                  <MapPin size={16} color={theme.primary} />
                </View>
                <Text style={[styles.serviceLabel, { color: theme.textPrimary }]}>Clinic Map</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.serviceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                onPress={() => navigation.navigate('MainTabs', { screen: 'HealthRecordsTab' })}
              >
                <View style={[styles.serviceIcon, { backgroundColor: '#EDE9FE' }]}>
                  <FileText size={16} color="#8B5CF6" />
                </View>
                <Text style={[styles.serviceLabel, { color: theme.textPrimary }]}>Records</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.serviceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                onPress={() => setIsChatbotVisible(true)}
              >
                <View style={[styles.serviceIcon, { backgroundColor: theme.ctaLight }]}>
                  <Bot size={16} color={theme.cta} />
                </View>
                <Text style={[styles.serviceLabel, { color: theme.textPrimary }]}>MedLink AI</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 130 }} />
      </ScrollView>

      {/* FLOATING MEDLINK AI BUTTON */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.cta }]}
        onPress={() => setIsChatbotVisible(true)}
        activeOpacity={0.88}
      >
        <Bot size={20} color="#FFFFFF" />
        <View style={styles.fabBadge}>
          <Text style={styles.fabBadgeText}>AI</Text>
        </View>
      </TouchableOpacity>

      <LocationSelectorModal
        visible={isLocationModalVisible}
        onClose={() => setIsLocationModalVisible(false)}
      />
      <MedLinkAssistantModal
        visible={isChatbotVisible}
        onClose={() => setIsChatbotVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  // ─── HEADER ───
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    gap: 8,
    ...SHADOWS.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  locationPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  locationLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  locationValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#FF8A00',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#38BDF8',
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  greeting: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  greetingSub: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  quickBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    gap: 5,
  },
  quickBookBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    gap: 8,
    ...SHADOWS.subtle,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },

  // ─── SCROLL CONTENT ───
  scrollContent: {
    paddingTop: 12,
    gap: 16,
  },

  // ─── SUGGESTIONS ───
  suggestionsPanel: {
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    ...SHADOWS.card,
  },
  panelLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  suggPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  suggPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    borderBottomWidth: 0.5,
  },
  recentText: {
    fontSize: 12,
  },

  // ─── SECTIONS ───
  section: {
    paddingHorizontal: SPACING.md,
    gap: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
  },
  sectionSub: {
    fontSize: 11,
    marginTop: 1,
  },
  seeAll: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── EARLIER SLOT ───
  earlierSlot: {
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1.5,
    gap: 6,
    ...SHADOWS.subtle,
  },
  earlierSlotHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  earlierSlotTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  earlierSlotDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  slotComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  slotCol: { gap: 1 },
  slotLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  slotValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  slotSub: {
    fontSize: 11,
  },
  slotArrow: {
    alignItems: 'center',
    gap: 2,
  },
  savingBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  savingText: {
    fontSize: 9,
    fontWeight: '700',
  },
  slotActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    flex: 1.5,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  keepBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
  },
  keepBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ─── EMPTY ───
  emptyBox: {
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
  },

  // ─── HORIZONTAL SCROLL ───
  hScroll: {
    gap: 10,
    paddingRight: SPACING.md,
  },

  // ─── CLINIC CARD (HORIZONTAL RAIL) ───
  clinicCard: {
    width: 200,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  clinicImg: {
    width: '100%',
    height: 84,
    resizeMode: 'cover',
  },
  ratingOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  ratingOverlayText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  clinicContent: {
    padding: 8,
    gap: 2,
  },
  clinicName: {
    fontSize: 13,
    fontWeight: '700',
  },
  clinicCat: {
    fontSize: 10,
    fontWeight: '600',
  },
  clinicMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  clinicMetaText: {
    fontSize: 10,
  },
  clinicBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  openDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  openText: {
    fontSize: 9,
    fontWeight: '700',
  },
  docCount: {
    fontSize: 9,
  },

  // ─── SPECIALIZATION / DEPARTMENT CHIPS ───
  specScroll: {
    gap: 6,
  },
  specChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: 5,
  },
  specIcon: {
    fontSize: 13,
  },
  specText: {
    fontSize: 12,
  },

  // ─── DOCTOR CARD ───
  docCard: {
    width: 160,
    borderRadius: RADIUS.md,
    padding: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 3,
    ...SHADOWS.card,
  },
  docAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  verifiedMark: {
    position: 'absolute',
    top: 8,
    right: 48,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  docSpec: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  docMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  docMetaText: {
    fontSize: 10,
    fontWeight: '600',
  },
  docFee: {
    fontSize: 10,
  },
  bookBtn: {
    marginTop: 3,
    paddingHorizontal: 22,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  bookBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // ─── ANNOUNCEMENT ───
  announceCard: {
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 4,
  },
  announceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  announceTitle: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  announceBody: {
    fontSize: 11,
    lineHeight: 15,
  },

  // ─── SERVICES GRID ───
  servicesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  serviceCard: {
    flex: 1,
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 5,
  },
  serviceIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ─── FAB ───
  fab: {
    position: 'absolute',
    bottom: 78,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.float,
    zIndex: 999,
  },
  fabBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#38BDF8',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
  },
  fabBadgeText: {
    color: '#081B4B',
    fontSize: 7,
    fontWeight: '900',
  },
});
