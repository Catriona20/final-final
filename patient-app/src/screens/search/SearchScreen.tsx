import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import {
  SlidersHorizontal,
  List,
  Map,
  ChevronRight,
  Star,
  Zap,
  Award,
  MapPin,
  Clock,
  Bot,
  Navigation,
  Sparkles,
  AlertTriangle,
  ArrowUp,
} from 'lucide-react-native';
import { AppStackParamList, MainTabParamList, Clinic, FilterOptions } from '../../types';
import { SPACING, RADIUS, SHADOWS, TYPOGRAPHY, getThemeColors } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore } from '../../store/useAppStore';
import { SearchBar } from '../../components/SearchBar';
import { FilterSheet } from '../../components/FilterSheet';
import { EmptyState } from '../../components/EmptyState';
import { InteractiveMap } from '../../components/InteractiveMap';
import { clinicSearchService } from '../../services/clinicSearchService';
import { apiClient } from '../../services/apiClient';
import { LocationSelectorModal } from '../../components/LocationSelectorModal';
import { MedLinkAssistantModal } from '../../components/MedLinkAssistantModal';
import { ExternalClinicBookingModal } from '../../components/ExternalClinicBookingModal';

type SearchNavProp = StackNavigationProp<AppStackParamList>;
type SearchRouteProp = RouteProp<MainTabParamList, 'SearchTab'>;

type ViewMode = 'list' | 'map';
type SortMode = 'best' | 'fastest' | 'nearest';

const DEFAULT_FILTERS: FilterOptions = {
  specialization: null,
  distance: 20,
  availability: 'all',
  maxWait: 60,
  minRating: 0,
  openNow: false,
};

export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<SearchNavProp>();
  const route = useRoute<SearchRouteProp>();
  const initialCategory = (route.params as any)?.category ?? null;
  const initialQuery = (route.params as any)?.query ?? '';

  const { isDark } = useThemeStore();
  const theme = getThemeColors(isDark);
  const { activeLocation, requestCurrentGpsLocation } = useAppStore();

  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<FilterOptions>({
    ...DEFAULT_FILTERS,
    specialization: initialCategory,
  });
  const [sortMode, setSortMode] = useState<SortMode>('best');
  const [showFilter, setShowFilter] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [results, setResults] = useState<Clinic[]>([]);
  const [totalClinics, setTotalClinics] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [isChatbotVisible, setIsChatbotVisible] = useState(false);
  const [selectedMapClinic, setSelectedMapClinic] = useState<Clinic | null>(null);
  const [modalClinic, setModalClinic] = useState<Clinic | null>(null);
  const [externalModalVisible, setExternalModalVisible] = useState(false);

  // AI-Assisted Symptom Guidance State
  const [symptomInput, setSymptomInput] = useState('');
  const [isAnalyzingSymptoms, setIsAnalyzingSymptoms] = useState(false);
  const [isSymptomFocused, setIsSymptomFocused] = useState(false);
  const [symptomResult, setSymptomResult] = useState<{
    recommended_department: string;
    confidence: number;
    reasoning?: string;
    is_emergency?: boolean;
    urgency_level?: string;
    matched_procedures?: string[];
    extracted_keywords?: string[];
  } | null>(null);
  const [symptomError, setSymptomError] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleAnalyzeSymptoms = async () => {
    if (!symptomInput.trim()) {
      setSymptomError('Please describe your symptoms first.');
      return;
    }
    setIsAnalyzingSymptoms(true);
    setSymptomError(null);
    setSymptomResult(null);

    try {
      const response = await apiClient.post('/ai/symptom-analysis', {
        query: symptomInput.trim(),
      });
      if (response.data?.success && response.data?.analysis) {
        const analysis = response.data.analysis;
        setSymptomResult(analysis);

        // Connect NLP guidance directly to recommendation engine & discovery
        const targetDept = analysis.recommended_department || 'General Medicine';
        const targetProc = analysis.matched_procedures?.[0];

        setFilters((prev) => ({
          ...prev,
          specialization: targetDept,
          department: targetDept,
        }));

        if (targetProc) {
          setQuery(targetProc);
        } else {
          setQuery(targetDept);
        }
      } else {
        setSymptomError('NLP guidance is temporarily unavailable. You can still search clinics manually.');
      }
    } catch (err: any) {
      setSymptomError('NLP guidance is temporarily unavailable. You can still search clinics manually.');
    } finally {
      setIsAnalyzingSymptoms(false);
    }
  };

  const handleApplyRecommendation = (dept: string, procedure?: string) => {
    setFilters((prev) => ({ ...prev, specialization: dept, department: dept }));
    const searchTerm = procedure || dept;
    setQuery(searchTerm);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 340, animated: true });
    }, 150);
  };

  const handleBookClinic = (clinic: Clinic) => {
    const activeProcedure = symptomResult?.matched_procedures?.[0] || (query.toLowerCase().includes('root canal') ? 'Root Canal Treatment' : undefined);
    if (clinic.isConnected !== false && (clinic.source === 'platform' || clinic.doctorsCount > 0)) {
      navigation.navigate('Booking', {
        clinicId: clinic.id,
        department: filters.specialization || clinic.category,
        procedure: activeProcedure,
      });
    } else {
      setModalClinic(clinic);
      setExternalModalVisible(true);
    }
  };

  const doSearch = async () => {
    setIsLoading(true);
    setSelectedMapClinic(null);

    const searchTarget = query.trim() || filters.specialization || '';

    const result = await clinicSearchService.discoverNearby(
      searchTarget,
      filters.distance,
      { latitude: activeLocation.latitude, longitude: activeLocation.longitude },
      filters.specialization,
      filters
    );

    let filtered = result.clinics;

    // Apply 2-Tier Sorting (Tier 1 Demo Clinics first, Tier 2 External Clinics second)
    const isDemo = (c: any) => Boolean(
      c.source === 'platform' ||
      c.source === 'MEDLINK_DEMO' ||
      c.isConnected ||
      (typeof c.id === 'string' && c.id.startsWith('c-demo')) ||
      c.id === 'c5' ||
      c.id === 'c1' ||
      c.is_demo === true ||
      c.doctorsCount > 0
    );

    const demoClinics = filtered.filter(isDemo);
    const externalClinics = filtered.filter((c) => !isDemo(c));

    const sortFn = (a: any, b: any) => {
      if (sortMode === 'nearest') {
        return (a.distanceMeters ?? 99999) - (b.distanceMeters ?? 99999);
      } else if (sortMode === 'fastest') {
        return (a.travelDurationSeconds ?? 99999) - (b.travelDurationSeconds ?? 99999);
      } else {
        return (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0);
      }
    };

    demoClinics.sort(sortFn);
    externalClinics.sort(sortFn);

    filtered = [...demoClinics, ...externalClinics];

    setResults(filtered);
    setTotalClinics(result.total ?? filtered.length);
    setIsLoading(false);
  };

  useEffect(() => {
    // If activeLocation was acquired via GPS and is older than 45s, refresh seamlessly
    if (activeLocation.type === 'gps' && Date.now() - (activeLocation.timestamp || 0) > 45000) {
      requestCurrentGpsLocation().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      doSearch();
    }, 350);

    return () => clearTimeout(delayDebounce);
  }, [query, filters, sortMode, activeLocation]);

  useEffect(() => {
    const params = route.params as any;
    if (params) {
      if (params.query !== undefined) setQuery(params.query);
      if (params.category !== undefined) {
        setFilters((f) => ({ ...f, specialization: params.category }));
      }
    }
  }, [route.params]);

  const activeFilterCount =
    (filters.specialization ? 1 : 0) +
    (filters.openNow ? 1 : 0) +
    (filters.minRating > 0 ? 1 : 0) +
    (filters.distance !== 10 ? 1 : 0);

  const isDemoClinic = (c: Clinic) =>
    c.source === 'platform' ||
    c.id?.startsWith('c-demo') ||
    c.id === 'c5' ||
    c.id === 'c1' ||
    c.doctorsCount > 0;

  const activeMapClinic =
    selectedMapClinic && results.some((c) => c.id === selectedMapClinic.id)
      ? selectedMapClinic
      : results[0] || null;

  const renderCard = (clinic: Clinic, isDemo: boolean, isMapMode: boolean = false) => (
    <TouchableOpacity
      key={clinic.id}
      style={[
        styles.resultCard,
        { backgroundColor: theme.card, borderColor: isDemo ? theme.primary : theme.cardBorder },
        isMapMode && styles.resultCardMapMode,
      ]}
      onPress={() => navigation.navigate('ClinicDetail', { clinicId: clinic.id })}
      activeOpacity={0.9}
    >
      <Image source={{ uri: clinic.image }} style={[styles.resultImage, isMapMode && styles.resultImageMapMode]} />

      <View style={[styles.resultContent, isMapMode && styles.resultContentMapMode]}>
        <View style={styles.resultHeaderRow}>
          <View style={[styles.catBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.catBadgeText, { color: theme.primary }]}>{clinic.category}</Text>
          </View>
          <View style={styles.ratingBox}>
            <Star size={11} color="#F59E0B" fill="#F59E0B" />
            <Text style={[styles.ratingText, { color: theme.textPrimary }]}> {clinic.rating}</Text>
          </View>
        </View>

        <Text style={[styles.clinicName, { color: theme.textPrimary }]} numberOfLines={1}>
          {clinic.name}
        </Text>
        <Text style={[styles.clinicAddress, { color: theme.textMuted }]} numberOfLines={1}>
          📍 {clinic.address}
        </Text>

        <View style={[styles.metricsRow, { backgroundColor: theme.backgroundSoft, borderColor: theme.cardBorder }]}>
          <Text style={[styles.metricText, { color: theme.textPrimary }]}>
            🚗 {clinic.travelTime ? `${clinic.distance} • ${clinic.travelTime}` : clinic.distance}
          </Text>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: clinic.isOpen ? theme.success : theme.error },
            ]}
          />
          <Text style={[styles.statusText, { color: clinic.isOpen ? theme.success : theme.error }]}>
            {clinic.isOpen ? 'Open Now' : 'Closed'}
          </Text>
        </View>

        {clinic.recommendationReason ? (
          <View style={[styles.reasonBadge, { backgroundColor: isDark ? '#0C2347' : '#EEF4FF', borderColor: isDark ? '#1E3A8A' : '#BFDBFE' }]}>
            <Sparkles size={11} color={theme.primary} />
            <Text style={[styles.reasonText, { color: isDark ? '#93C5FD' : '#1E40AF' }]} numberOfLines={1}>
              {clinic.recommendationReason}
            </Text>
          </View>
        ) : null}

        {clinic.doctorsCount > 0 ? (
          <Text style={[styles.docCountLabel, { color: theme.primary }]}>
            ✓ {clinic.doctorsCount} verified doctor{clinic.doctorsCount === 1 ? '' : 's'} registered
          </Text>
        ) : (
          <Text style={[styles.docCountLabel, { color: theme.textMuted }]}>
            External clinic partner (Google Places)
          </Text>
        )}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.viewBtn, { borderColor: theme.cardBorder, backgroundColor: theme.backgroundSoft }]}
            onPress={() => navigation.navigate('ClinicDetail', { clinicId: clinic.id })}
          >
            <Text style={[styles.viewBtnText, { color: theme.textPrimary }]}>View Clinic</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: theme.cta }]}
            onPress={() => handleBookClinic(clinic)}
          >
            <Text style={styles.bookBtnText}>
              {clinic.isConnected !== false ? 'Book Visit' : 'Book Appointment'}
            </Text>
            <ChevronRight size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* HEADER SECTION */}
      <View style={[styles.searchHeader, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Discover Healthcare</Text>
            <TouchableOpacity
              style={styles.locationSubRow}
              onPress={() => setIsLocationModalVisible(true)}
              activeOpacity={0.8}
            >
              <MapPin size={12} color={theme.primary} />
              <Text style={[styles.headerSub, { color: theme.primary }]} numberOfLines={1}>
                {activeLocation.name} (Change)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Map / List Toggle */}
          <View style={[styles.viewToggleGroup, { backgroundColor: theme.backgroundSoft, borderColor: theme.cardBorder }]}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                viewMode === 'list' && [styles.toggleBtnActive, { backgroundColor: theme.card }],
              ]}
              onPress={() => setViewMode('list')}
            >
              <List size={15} color={viewMode === 'list' ? theme.primary : theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                viewMode === 'map' && [styles.toggleBtnActive, { backgroundColor: theme.card }],
              ]}
              onPress={() => setViewMode('map')}
            >
              <Map size={15} color={viewMode === 'map' ? theme.primary : theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Input Bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchBarWrap}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search specialists, clinics or hospital..."
            />
          </View>

          <TouchableOpacity
            style={[
              styles.filterBtn,
              {
                backgroundColor: activeFilterCount > 0 ? theme.primary : theme.backgroundSoft,
                borderColor: activeFilterCount > 0 ? theme.primary : theme.cardBorder,
              },
            ]}
            onPress={() => setShowFilter(true)}
            activeOpacity={0.85}
          >
            <SlidersHorizontal size={17} color={activeFilterCount > 0 ? '#FFFFFF' : theme.textPrimary} />
            {activeFilterCount > 0 && (
              <View style={[styles.filterCountBadge, { backgroundColor: theme.cta }]}>
                <Text style={styles.filterCountText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Sorting Tabs: Best Match, Fastest, Nearest */}
        <View style={[styles.sortRow, { borderTopColor: theme.cardBorder }]}>
          <TouchableOpacity
            style={[
              styles.sortTab,
              sortMode === 'best' && [styles.sortTabActive, { backgroundColor: theme.primaryLight, borderColor: theme.primary }],
            ]}
            onPress={() => setSortMode('best')}
          >
            <Award size={13} color={sortMode === 'best' ? theme.primary : theme.textMuted} />
            <Text
              style={[
                styles.sortTabText,
                { color: sortMode === 'best' ? theme.primary : theme.textSecondary, fontWeight: sortMode === 'best' ? '800' : '600' },
              ]}
            >
              Best Match
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortTab,
              sortMode === 'fastest' && [styles.sortTabActive, { backgroundColor: theme.primaryLight, borderColor: theme.primary }],
            ]}
            onPress={() => setSortMode('fastest')}
          >
            <Zap size={13} color={sortMode === 'fastest' ? theme.primary : theme.textMuted} />
            <Text
              style={[
                styles.sortTabText,
                { color: sortMode === 'fastest' ? theme.primary : theme.textSecondary, fontWeight: sortMode === 'fastest' ? '800' : '600' },
              ]}
            >
              Fastest ETA
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortTab,
              sortMode === 'nearest' && [styles.sortTabActive, { backgroundColor: theme.primaryLight, borderColor: theme.primary }],
            ]}
            onPress={() => setSortMode('nearest')}
          >
            <MapPin size={13} color={sortMode === 'nearest' ? theme.primary : theme.textMuted} />
            <Text
              style={[
                styles.sortTabText,
                { color: sortMode === 'nearest' ? theme.primary : theme.textSecondary, fontWeight: sortMode === 'nearest' ? '800' : '600' },
              ]}
            >
              Nearest Distance
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* VIEW BODY: LIST OR MAP */}
      {viewMode === 'map' ? (
        <View style={styles.mapContainer}>
          <View style={[styles.mapCountBadge, { backgroundColor: isDark ? 'rgba(6,21,47,0.92)' : 'rgba(255,255,255,0.95)', borderColor: theme.cardBorder }]}>
            <MapPin size={12} color={theme.primary} />
            <Text style={[styles.mapCountBadgeText, { color: theme.textPrimary }]}>
              <Text style={{ fontWeight: '800', color: theme.primary }}>{totalClinics}</Text>{' '}
              {filters.specialization ? `${filters.specialization} ` : ''}clinics near {activeLocation.name}
            </Text>
          </View>

          <InteractiveMap
            clinics={results}
            selectedClinicId={activeMapClinic?.id ?? null}
            onSelectClinic={(c) => setSelectedMapClinic(c)}
            centerCoords={{ latitude: activeLocation.latitude, longitude: activeLocation.longitude }}
            searchedLocation={activeLocation.type === 'manual' ? { name: activeLocation.name, latitude: activeLocation.latitude, longitude: activeLocation.longitude } : null}
          />

          {/* Selected Clinic Map Card Floating Above Map */}
          {activeMapClinic && (
            <View style={styles.mapCardFloatingContainer} pointerEvents="box-none">
              {renderCard(activeMapClinic, isDemoClinic(activeMapClinic), true)}
            </View>
          )}
        </View>
      ) : (
        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultsScroll}>
          {/* AI-ASSISTED SYMPTOM GUIDANCE CARD */}
          <View style={[styles.symptomGuidanceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.symptomHeaderRow}>
              <View style={[styles.symptomIconBadge, { backgroundColor: theme.primaryLight }]}>
                <Sparkles size={16} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.symptomCardTitle, { color: theme.textPrimary }]}>
                  AI-Assisted Symptom Guidance
                </Text>
                <Text style={[styles.symptomCardSubtitle, { color: theme.textMuted }]}>
                  AI-assisted symptom-to-department recommendation
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.symptomInputBar,
                {
                  backgroundColor: theme.backgroundSoft,
                  borderColor: isSymptomFocused ? theme.primary : theme.cardBorder,
                },
              ]}
            >
              <Sparkles size={16} color={theme.primary} style={styles.symptomSparkleIcon} />

              {isAnalyzingSymptoms ? (
                <View style={styles.symptomLoadingContainer}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[styles.symptomLoadingText, { color: theme.textMuted }]}>
                    Analyzing symptoms...
                  </Text>
                </View>
              ) : (
                <TextInput
                  style={[
                    styles.symptomCompactInput,
                    { color: theme.textPrimary },
                    Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
                  ]}
                  placeholder="Tell us what you're experiencing..."
                  placeholderTextColor={theme.textMuted}
                  value={symptomInput}
                  onChangeText={(text) => {
                    setSymptomInput(text);
                    if (symptomError) setSymptomError(null);
                  }}
                  onFocus={() => setIsSymptomFocused(true)}
                  onBlur={() => setIsSymptomFocused(false)}
                  multiline={true}
                  numberOfLines={1}
                  editable={!isAnalyzingSymptoms}
                  autoCapitalize="sentences"
                  autoCorrect={true}
                  returnKeyType="send"
                  onSubmitEditing={handleAnalyzeSymptoms}
                  onKeyPress={(e: any) => {
                    if (Platform.OS === 'web' && e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
                      e.preventDefault?.();
                      handleAnalyzeSymptoms();
                    }
                  }}
                  accessibilityLabel="Symptom Description Input"
                />
              )}

              <TouchableOpacity
                style={[
                  styles.symptomSendBtn,
                  {
                    backgroundColor:
                      symptomInput.trim().length > 0 && !isAnalyzingSymptoms
                        ? theme.primary
                        : isDark
                        ? '#334155'
                        : '#E2E8F0',
                  },
                ]}
                onPress={handleAnalyzeSymptoms}
                disabled={isAnalyzingSymptoms || !symptomInput.trim()}
                activeOpacity={0.8}
                accessibilityLabel="Analyze Symptoms"
              >
                {isAnalyzingSymptoms ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <ArrowUp
                    size={16}
                    color={
                      symptomInput.trim().length > 0
                        ? '#FFFFFF'
                        : isDark
                        ? '#64748B'
                        : '#94A3B8'
                    }
                  />
                )}
              </TouchableOpacity>
            </View>

            {symptomError && (
              <View style={[styles.symptomAlertBox, { backgroundColor: isDark ? '#2D1B1B' : '#FEF2F2', borderColor: '#F87171' }]}>
                <AlertTriangle size={14} color="#EF4444" />
                <Text style={[styles.symptomAlertText, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
                  {symptomError}
                </Text>
              </View>
            )}

            {symptomResult && (
              <View style={[styles.symptomResultBox, { backgroundColor: theme.backgroundSoft, borderColor: theme.cardBorder }]}>
                {symptomResult.is_emergency && (
                  <View style={[styles.emergencyNoticeBanner, { backgroundColor: '#EF4444' }]}>
                    <AlertTriangle size={15} color="#FFFFFF" />
                    <Text style={styles.emergencyNoticeText}>
                      🚨 Possible emergency symptoms detected: Your symptoms may require urgent medical attention. Dial 108 / 112 immediately.
                    </Text>
                  </View>
                )}

                <View style={styles.resultMetaRow}>
                  <View>
                    <Text style={[styles.resultMetaLabel, { color: theme.textMuted }]}>Recommended Department</Text>
                    <Text style={[styles.resultMetaDept, { color: theme.primary }]}>
                      {symptomResult.recommended_department}
                    </Text>
                  </View>
                  <View style={[styles.confidenceBadge, { backgroundColor: theme.primaryLight }]}>
                    <Text style={[styles.confidenceText, { color: theme.primary }]}>
                      {Math.round((symptomResult.confidence || 0) * 100)}% Confidence
                    </Text>
                  </View>
                </View>

                {symptomResult.matched_procedures && symptomResult.matched_procedures.length > 0 && (
                  <View style={styles.matchedProcedureRow}>
                    <Text style={[styles.matchedProcLabel, { color: theme.textMuted }]}>Relevant Procedure:</Text>
                    <View style={[styles.matchedProcBadge, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: theme.primary }]}>
                      <Award size={12} color={theme.primary} />
                      <Text style={[styles.matchedProcText, { color: theme.primary }]}>
                        {symptomResult.matched_procedures[0]}
                      </Text>
                    </View>
                  </View>
                )}

                {symptomResult.reasoning && (
                  <Text style={[styles.resultReasoningText, { color: theme.textSecondary }]}>
                    {symptomResult.reasoning}
                  </Text>
                )}

                <Text style={[styles.disclaimerText, { color: theme.textMuted }]}>
                  * AI-assisted symptom-to-department recommendation only — not a clinical diagnosis.
                </Text>

                <TouchableOpacity
                  style={[styles.applyRecommendationBtn, { backgroundColor: theme.cta }]}
                  onPress={() => handleApplyRecommendation(symptomResult.recommended_department, symptomResult.matched_procedures?.[0])}
                >
                  <Text style={styles.applyRecommendationBtnText}>
                    {symptomResult.matched_procedures && symptomResult.matched_procedures.length > 0
                      ? `Find ${symptomResult.matched_procedures[0]} Providers`
                      : `Find ${symptomResult.recommended_department} Specialists`}
                  </Text>
                  <ChevronRight size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loaderText, { color: theme.textMuted }]}>
                Searching verified clinics around {activeLocation.name}...
              </Text>
            </View>
          ) : results.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No matching clinics found nearby</Text>
              <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
                No {filters.specialization ? `${filters.specialization} ` : 'medical '}clinics matched your query within {filters.distance} km of {activeLocation.name}.
              </Text>
              <TouchableOpacity
                style={[styles.expandRadiusBtn, { backgroundColor: theme.primary }]}
                onPress={() => setFilters((f) => ({ ...f, distance: 20 }))}
              >
                <Text style={styles.expandRadiusBtnText}>Expand Search to 20 km</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.resultsList}>
              <Text style={[styles.resultsCountText, { color: theme.textSecondary }]}>
                <Text style={{ fontWeight: '800', color: theme.textPrimary }}>{totalClinics}</Text>{' '}
                {filters.specialization ? `${filters.specialization} ` : ''}clinic{totalClinics === 1 ? '' : 's'} found near {activeLocation.name}
                {results.length < totalClinics ? ` (showing ${results.length})` : ''}
              </Text>

              {(() => {
                const demoClinics = results.filter(isDemoClinic);
                const externalClinics = results.filter((c) => !isDemoClinic(c));

                return (
                  <View style={{ gap: 18 }}>
                    {demoClinics.length > 0 && (
                      <View style={{ gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: theme.primary }}>
                              MEDLINK DEMO CLINICS
                            </Text>
                            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                              Verified healthcare centers with live OPD queue
                            </Text>
                          </View>
                          <View style={{ backgroundColor: theme.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primary }}>
                              {demoClinics.length} Verified
                            </Text>
                          </View>
                        </View>
                        {demoClinics.map((c) => renderCard(c, true, false))}
                      </View>
                    )}

                    {externalClinics.length > 0 && (
                      <View style={{ gap: 10, marginTop: demoClinics.length > 0 ? 12 : 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: theme.textSecondary }}>
                              NEARBY EXTERNAL CLINICS
                            </Text>
                            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                              External Google / OpenStreetMap discovery
                            </Text>
                          </View>
                          <View style={{ backgroundColor: theme.backgroundSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textMuted }}>
                              {externalClinics.length} Nearby
                            </Text>
                          </View>
                        </View>
                        {externalClinics.map((c) => renderCard(c, false, false))}
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* FLOATING MEDLINK AI ASSISTANT BUTTON */}
      <TouchableOpacity
        style={[styles.floatingAssistantBtn, { backgroundColor: theme.cta }]}
        onPress={() => setIsChatbotVisible(true)}
        activeOpacity={0.88}
      >
        <Bot size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* FILTER SHEET */}
      <FilterSheet
        visible={showFilter}
        filters={filters}
        onApply={(newFilters) => setFilters(newFilters)}
        onClose={() => setShowFilter(false)}
      />

      {/* LOCATION SELECTOR MODAL */}
      <LocationSelectorModal
        visible={isLocationModalVisible}
        onClose={() => setIsLocationModalVisible(false)}
      />

      {/* MEDLINK ASSISTANT MODAL */}
      <MedLinkAssistantModal
        visible={isChatbotVisible}
        onClose={() => setIsChatbotVisible(false)}
      />

      {/* EXTERNAL CLINIC APPOINTMENT AVAILABILITY MODAL */}
      <ExternalClinicBookingModal
        visible={externalModalVisible}
        onClose={() => setExternalModalVisible(false)}
        clinic={modalClinic}
        department={filters.specialization || undefined}
        onViewClinic={() =>
          modalClinic &&
          navigation.navigate('ClinicDetail', {
            clinicId: modalClinic.id,
            department: filters.specialization || modalClinic.category,
          })
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  searchHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    gap: SPACING.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
  },
  locationSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewToggleGroup: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    padding: 3,
    borderWidth: 1,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  toggleBtnActive: {
    ...SHADOWS.subtle,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  searchBarWrap: {
    flex: 1,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  filterCountBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: SPACING.xs + 2,
    borderTopWidth: 1,
  },
  sortTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sortTabActive: {},
  sortTabText: {
    fontSize: 11,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  mapCountBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  mapCountBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mapCardFloatingContainer: {
    position: 'absolute',
    bottom: 76,
    left: SPACING.md,
    right: SPACING.md,
    maxWidth: 440,
    marginHorizontal: 'auto' as any,
    zIndex: 1050,
    elevation: 20,
  },
  resultCardMapMode: {
    ...SHADOWS.float,
  },
  resultImageMapMode: {
    height: 85,
  },
  resultContentMapMode: {
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 2,
  },
  resultsScroll: {
    padding: SPACING.lg,
  },
  loaderContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  loaderText: {
    fontSize: 12,
  },
  emptyBox: {
    padding: SPACING.xl,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  emptyTitle: {
    ...TYPOGRAPHY.labelLg,
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  expandRadiusBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    marginTop: SPACING.xs,
  },
  expandRadiusBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  resultsList: {
    gap: SPACING.md,
  },
  resultsCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  resultCard: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  resultImage: {
    width: '100%',
    height: 130,
  },
  resultContent: {
    padding: SPACING.md,
    gap: 4,
  },
  resultHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  catBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
  },
  clinicName: {
    ...TYPOGRAPHY.labelLg,
  },
  clinicAddress: {
    fontSize: 11,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    gap: SPACING.sm,
    marginTop: 2,
  },
  metricText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  docCountLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 6,
  },
  viewBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
  },
  viewBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bookBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  reasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginVertical: 4,
  },
  reasonText: {
    fontSize: 10,
    fontWeight: '700',
    flex: 1,
  },
  floatingAssistantBtn: {
    position: 'absolute',
    bottom: 85,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.float,
    zIndex: 1150,
    elevation: 22,
  },
  symptomGuidanceCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    ...SHADOWS.subtle,
  },
  symptomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.sm,
  },
  symptomIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symptomCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  symptomCardSubtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  symptomInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 4,
    minHeight: 46,
    gap: 8,
  },
  symptomSparkleIcon: {
    marginRight: 2,
  },
  symptomCompactInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    paddingVertical: Platform.OS === 'web' ? 8 : 4,
    paddingHorizontal: 0,
    maxHeight: 64,
  },
  symptomLoadingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  symptomLoadingText: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  symptomSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symptomAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 10,
    marginTop: 10,
  },
  symptomAlertText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  symptomResultBox: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 12,
  },
  emergencyNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: RADIUS.sm,
    marginBottom: 10,
  },
  emergencyNoticeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  resultMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  resultMetaLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  resultMetaDept: {
    fontSize: 16,
    fontWeight: '800',
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  matchedProcedureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  matchedProcLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  matchedProcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  matchedProcText: {
    fontSize: 11,
    fontWeight: '700',
  },
  resultReasoningText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  disclaimerText: {
    fontSize: 10,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  applyRecommendationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
  },
  applyRecommendationBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
