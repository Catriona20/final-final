import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  MapPin,
  Navigation,
  Search,
  X,
  Home,
  GraduationCap,
  Briefcase,
  Bookmark,
  Check,
  Plus,
  AlertTriangle,
} from 'lucide-react-native';
import { ActiveLocation, SavedLocation } from '../types';
import { SPACING, RADIUS, SHADOWS, TYPOGRAPHY, getThemeColors } from '../constants/theme';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';
import { locationService, PRESET_LOCATIONS } from '../services/locationService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LocationSelectorModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LocationSelectorModal: React.FC<LocationSelectorModalProps> = ({ visible, onClose }) => {
  const { isDark } = useThemeStore();
  const theme = getThemeColors(isDark);
  const {
    activeLocation,
    setActiveLocation,
    savedLocations,
    addSavedLocation,
    requestCurrentGpsLocation,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ActiveLocation[]>(PRESET_LOCATIONS);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);

  // Manual entry mode
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualLocality, setManualLocality] = useState('');
  const [manualLabel, setManualLabel] = useState<'Home' | 'College' | 'Work' | 'Other'>('Home');

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setGpsErrorMessage(null);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 75,
          friction: 10,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(PRESET_LOCATIONS);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await locationService.searchLocations(searchQuery);
      setSearchResults(res);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleUseCurrentGPS = async () => {
    setIsLocating(true);
    setGpsErrorMessage(null);
    try {
      await requestCurrentGpsLocation();
      onClose();
    } catch (e: any) {
      const msg = e.message || 'Unable to retrieve live device GPS location. Please check browser permissions or select a location below.';
      console.warn('GPS Location acquisition notice:', msg);
      setGpsErrorMessage(msg);
    } finally {
      setIsLocating(false);
    }
  };

  const handleSelectLocation = (loc: ActiveLocation) => {
    setActiveLocation({
      ...loc,
      displayName: loc.locality || `${loc.name}, Chennai`,
    });
    onClose();
  };

  const handleSelectSaved = (saved: SavedLocation) => {
    const active: ActiveLocation = {
      id: saved.id,
      name: saved.name,
      locality: saved.locality,
      displayName: saved.locality || `${saved.name}, Chennai`,
      latitude: saved.latitude,
      longitude: saved.longitude,
      type: 'saved',
      label: saved.label,
    };
    setActiveLocation(active);
    onClose();
  };

  const handleSaveManual = () => {
    if (!manualName.trim()) {
      Alert.alert('Enter Details', 'Please provide a location name.');
      return;
    }
    const newSaved: SavedLocation = {
      id: `saved-${Date.now()}`,
      label: manualLabel,
      name: manualName.trim(),
      locality: manualLocality.trim() || `${manualName.trim()}, Tamil Nadu`,
      latitude: 13.0827,
      longitude: 80.2707,
      address: manualLocality.trim() || manualName.trim(),
    };
    addSavedLocation(newSaved);
    handleSelectSaved(newSaved);
    setIsManualMode(false);
  };

  const getLabelIcon = (label?: string) => {
    switch (label) {
      case 'Home':
        return <Home size={15} color={theme.primary} />;
      case 'College':
        return <GraduationCap size={15} color="#8B5CF6" />;
      case 'Work':
        return <Briefcase size={15} color="#F59E0B" />;
      default:
        return <Bookmark size={15} color={theme.textMuted} />;
    }
  };

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, pointerEvents: 'box-none' }]}>
      {/* BACKDROP */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* SHEET */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.card,
            transform: [{ translateY }],
            borderColor: theme.cardBorder,
          },
        ]}
      >
        <View style={[styles.dragHandle, { backgroundColor: theme.cardBorder }]} />

        {/* HEADER */}
        <View style={[styles.headerRow, { borderBottomColor: theme.cardBorder }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Where are you currently located?</Text>
            <Text style={[styles.subTitle, { color: theme.textMuted }]}>
              Set your active location for accurate distance, clinics, and travel ETA
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.backgroundSoft }]}
            onPress={onClose}
          >
            <X size={18} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* OPTION 1: USE CURRENT GPS */}
          <TouchableOpacity
            style={[
              styles.gpsActionBtn,
              {
                backgroundColor: theme.primaryLight,
                borderColor: theme.primary,
              },
            ]}
            onPress={handleUseCurrentGPS}
            disabled={isLocating}
            activeOpacity={0.85}
          >
            {isLocating ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Navigation size={18} color={theme.primary} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.gpsActionTitle, { color: theme.primary }]}>Use Current Location</Text>
              <Text style={[styles.gpsActionSub, { color: theme.textSecondary }]}>
                {isLocating ? 'Obtaining live device coordinates...' : 'Enable device GPS for precise nearby healthcare'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* GPS ERROR / PERMISSION BANNER */}
          {gpsErrorMessage ? (
            <View style={[styles.gpsErrorCard, { backgroundColor: isDark ? '#261111' : '#FEF2F2', borderColor: theme.error }]}>
              <View style={styles.gpsErrorTitleRow}>
                <AlertTriangle size={15} color={theme.error} />
                <Text style={[styles.gpsErrorTitle, { color: theme.error }]}>Location Permission / GPS Notice</Text>
              </View>
              <Text style={[styles.gpsErrorDesc, { color: theme.textSecondary }]}>{gpsErrorMessage}</Text>
              <View style={styles.gpsErrorFooter}>
                <TouchableOpacity
                  style={[styles.retryGpsBtn, { backgroundColor: theme.error }]}
                  onPress={handleUseCurrentGPS}
                  activeOpacity={0.8}
                >
                  <Text style={styles.retryGpsBtnText}>Retry Live GPS</Text>
                </TouchableOpacity>
                <Text style={[styles.gpsFallbackHint, { color: theme.textMuted }]}>
                  Or select a saved/search location below
                </Text>
              </View>
            </View>
          ) : null}

          {/* SEARCH INPUT */}
          <View style={[styles.searchBox, { backgroundColor: theme.backgroundSoft, borderColor: theme.cardBorder }]}>
            <Search size={16} color={theme.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Search area (e.g. Mylapore, Kancheepuram, T. Nagar)"
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={15} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* OPTION 2: SAVED LOCATIONS (Home, College, Work, Other) */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>CHOOSE FROM SAVED LOCATIONS</Text>
            <View style={styles.savedGrid}>
              {savedLocations.map((saved) => {
                const isSelected =
                  activeLocation.name === saved.name ||
                  (activeLocation.label === saved.label && activeLocation.locality === saved.locality);
                return (
                  <TouchableOpacity
                    key={saved.id}
                    style={[
                      styles.savedCard,
                      {
                        backgroundColor: isSelected ? theme.primaryLight : theme.backgroundSoft,
                        borderColor: isSelected ? theme.primary : theme.cardBorder,
                      },
                    ]}
                    onPress={() => handleSelectSaved(saved)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.savedTopRow}>
                      <View style={styles.savedLabelRow}>
                        {getLabelIcon(saved.label)}
                        <Text style={[styles.savedLabel, { color: theme.textPrimary }]}>{saved.label}</Text>
                      </View>
                      {isSelected && <Check size={14} color={theme.primary} />}
                    </View>
                    <Text style={[styles.savedName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {saved.name}
                    </Text>
                    <Text style={[styles.savedLocality, { color: theme.textMuted }]} numberOfLines={1}>
                      {saved.locality}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* OPTION 3: POPULAR & SEARCH LOCALITIES */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>
              {searchQuery ? 'SEARCH RESULTS' : 'POPULAR SERVICE REGIONS'}
            </Text>

            {isSearching ? (
              <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 12 }} />
            ) : (
              <View style={styles.locationsList}>
                {searchResults.map((loc) => {
                  const isSelected = activeLocation.name === loc.name;
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      style={[
                        styles.locationItem,
                        {
                          backgroundColor: isSelected ? theme.primaryLight : theme.backgroundSoft,
                          borderColor: isSelected ? theme.primary : theme.cardBorder,
                        },
                      ]}
                      onPress={() => handleSelectLocation(loc)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.locPinBox, { backgroundColor: isSelected ? theme.primary : theme.card }]}>
                        <MapPin size={15} color={isSelected ? '#FFFFFF' : theme.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.locItemName, { color: theme.textPrimary }]}>{loc.name}</Text>
                        <Text style={[styles.locItemLocality, { color: theme.textMuted }]} numberOfLines={1}>
                          {loc.locality}
                        </Text>
                      </View>
                      {isSelected ? (
                        <View style={[styles.activeDot, { backgroundColor: theme.primary }]}>
                          <Check size={12} color="#FFFFFF" />
                        </View>
                      ) : (
                        loc.label && (
                          <View style={[styles.tagBadge, { backgroundColor: theme.cardBorder }]}>
                            <Text style={[styles.tagBadgeText, { color: theme.textSecondary }]}>{loc.label}</Text>
                          </View>
                        )
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* OPTION 4: ENTER ADDRESS MANUALLY */}
          <View style={styles.section}>
            {!isManualMode ? (
              <TouchableOpacity
                style={[styles.manualBtn, { borderColor: theme.cardBorder, backgroundColor: theme.backgroundSoft }]}
                onPress={() => setIsManualMode(true)}
              >
                <Plus size={16} color={theme.primary} />
                <Text style={[styles.manualBtnText, { color: theme.primary }]}>Enter Custom Address Manually</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.manualForm, { backgroundColor: theme.backgroundSoft, borderColor: theme.cardBorder }]}>
                <Text style={[styles.manualFormTitle, { color: theme.textPrimary }]}>Enter Address Manually</Text>

                <View style={styles.labelPickerRow}>
                  {(['Home', 'College', 'Work', 'Other'] as const).map((lbl) => (
                    <TouchableOpacity
                      key={lbl}
                      style={[
                        styles.labelChip,
                        manualLabel === lbl && [styles.labelChipActive, { backgroundColor: theme.primary, borderColor: theme.primary }],
                      ]}
                      onPress={() => setManualLabel(lbl)}
                    >
                      <Text style={[styles.labelChipText, manualLabel === lbl && { color: '#FFFFFF', fontWeight: '700' }]}>
                        {lbl}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.cardBorder, backgroundColor: theme.card }]}
                  placeholder="Location Name (e.g. SRM Campus, Adyar Home)"
                  placeholderTextColor={theme.textMuted}
                  value={manualName}
                  onChangeText={setManualName}
                />
                <TextInput
                  style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.cardBorder, backgroundColor: theme.card }]}
                  placeholder="Detailed Address / Locality (e.g. Kancheepuram, Tamil Nadu)"
                  placeholderTextColor={theme.textMuted}
                  value={manualLocality}
                  onChangeText={setManualLocality}
                />

                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={[styles.formCancelBtn, { borderColor: theme.cardBorder }]}
                    onPress={() => setIsManualMode(false)}
                  >
                    <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.formSaveBtn, { backgroundColor: theme.cta }]}
                    onPress={handleSaveManual}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Save & Select</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    maxHeight: SCREEN_HEIGHT * 0.85,
    borderTopWidth: 1,
    ...SHADOWS.float,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  title: {
    ...TYPOGRAPHY.h3,
  },
  subTitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.lg,
    paddingBottom: 40,
  },
  gpsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
  },
  gpsActionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  gpsActionSub: {
    fontSize: 11,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    height: 44,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  savedCard: {
    width: '48%',
    padding: SPACING.sm + 4,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    gap: 2,
  },
  savedTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  savedLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  savedLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  savedName: {
    fontSize: 12,
    fontWeight: '700',
  },
  savedLocality: {
    fontSize: 10,
  },
  locationsList: {
    gap: SPACING.sm,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.sm + 4,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  locPinBox: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  locItemLocality: {
    fontSize: 11,
  },
  activeDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  manualBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  manualForm: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  manualFormTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  labelPickerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  labelChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  labelChipActive: {},
  labelChipText: {
    fontSize: 11,
  },
  formInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 4,
    fontSize: 12,
  },
  formActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 4,
  },
  formCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  formSaveBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  gpsErrorCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.sm,
    gap: 6,
  },
  gpsErrorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gpsErrorTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  gpsErrorDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  gpsErrorFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    flexWrap: 'wrap',
    gap: 8,
  },
  retryGpsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  retryGpsBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  gpsFallbackHint: {
    fontSize: 11,
    flex: 1,
  },
});
