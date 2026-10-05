import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import {
  ArrowLeft,
  Bell,
  Calendar,
  Clock,
  Megaphone,
  CheckCheck,
  Trash2,
  ChevronRight,
  Info,
  CheckCircle,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Check,
  X,
} from 'lucide-react-native';
import { AppStackParamList, NotificationCategory, NotificationItem } from '../../types';
import { SPACING, RADIUS, SHADOWS, TYPOGRAPHY, getThemeColors } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useAppointmentStore } from '../../store/useAppointmentStore';
import { useAuthStore } from '../../store/useAuthStore';
import { apiClient } from '../../services/apiClient';

type NotifNavProp = StackNavigationProp<AppStackParamList>;

const CATEGORIES: Array<NotificationCategory | 'All'> = [
  'All',
  'Appointments',
  'Queue Updates',
  'Clinic Updates',
  'Reminders',
  'System',
  'Announcements',
];

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation<NotifNavProp>();
  const { isDark } = useThemeStore();
  const theme = getThemeColors(isDark);

  const {
    notifications,
    unreadCount,
    selectedCategory,
    setSelectedCategory,
    markAsRead,
    markAllAsRead,
    clearAll,
    clearNotification,
    fetchNotifications,
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const { appointments, earlierSlotSuggestion, acceptEarlierSlot, declineEarlierSlot } = useAppointmentStore();
  const [processingActionId, setProcessingActionId] = useState<string | null>(null);

  const handleAcceptOffer = async (notifItem: NotificationItem) => {
    const apptId = notifItem.actionData?.appointmentId || earlierSlotSuggestion?.appointmentId;
    if (!apptId) return;
    const offeredTime = notifItem.actionData?.offeredTime || earlierSlotSuggestion?.newTime || 'earlier slot';
    setProcessingActionId(notifItem.id);
    try {
      await acceptEarlierSlot(apptId);
      Alert.alert('Earlier Slot Accepted', `Your appointment has been successfully rescheduled to ${offeredTime}.`);
      if (!notifItem.read) {
        markAsRead(notifItem.id);
      }
    } catch (err: any) {
      Alert.alert(
        'Slot No Longer Available',
        'Another patient may have claimed this slot or it is no longer available. Your current appointment time is preserved.'
      );
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleDeclineOffer = async (notifItem: NotificationItem) => {
    const apptId = notifItem.actionData?.appointmentId || earlierSlotSuggestion?.appointmentId;
    setProcessingActionId(notifItem.id);
    try {
      await declineEarlierSlot(apptId);
      Alert.alert('Offer Declined', 'You have chosen to keep your current appointment time.');
      if (!notifItem.read) {
        markAsRead(notifItem.id);
      }
    } catch (err) {
      console.warn('Decline offer error:', err);
    } finally {
      setProcessingActionId(null);
    }
  };

  const { user } = useAuthStore();
  const [loadBalanceActions, setLoadBalanceActions] = useState<Record<string, 'ACCEPTED' | 'DECLINED'>>({});

  const handleAcceptLoadBalance = async (notifItem: NotificationItem) => {
    const proposalId = notifItem.actionData?.proposalId || (notifItem as any).action_data?.proposalId;
    const patientId = user?.id || (notifItem as any).patient_id || (notifItem as any).recipient_id;
    if (!proposalId) return;

    setProcessingActionId(notifItem.id);
    try {
      const res = await apiClient.post('/queue/load-balance/patient-consent', {
        proposalId,
        patientId,
        consent: 'ACCEPT',
      });
      setLoadBalanceActions((prev) => ({ ...prev, [proposalId]: 'ACCEPTED' }));
      Alert.alert(
        'Transfer Accepted',
        res.data?.message || 'You accepted the transfer offer. Your doctor will be updated once approvals finalize.'
      );
      if (!notifItem.read) {
        markAsRead(notifItem.id);
      }
      await fetchNotifications();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Unable to accept transfer at this time.';
      Alert.alert('Transfer Notice', errorMsg);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleDeclineLoadBalance = async (notifItem: NotificationItem) => {
    const proposalId = notifItem.actionData?.proposalId || (notifItem as any).action_data?.proposalId;
    const patientId = user?.id || (notifItem as any).patient_id || (notifItem as any).recipient_id;
    if (!proposalId) return;

    setProcessingActionId(notifItem.id);
    try {
      await apiClient.post('/queue/load-balance/patient-consent', {
        proposalId,
        patientId,
        consent: 'DECLINE',
      });
      setLoadBalanceActions((prev) => ({ ...prev, [proposalId]: 'DECLINED' }));
      Alert.alert('Transfer Declined', 'You have declined the transfer. Your original doctor assignment is preserved.');
      if (!notifItem.read) {
        markAsRead(notifItem.id);
      }
      await fetchNotifications();
    } catch (err) {
      console.warn('Decline transfer error:', err);
    } finally {
      setProcessingActionId(null);
    }
  };

  const getCategoryIcon = (category: NotificationCategory) => {
    switch (category) {
      case 'Appointments':
        return <Calendar size={16} color={theme.primary} />;
      case 'Queue Updates':
        return <Clock size={16} color="#F59E0B" />;
      case 'Clinic Updates':
        return <Info size={16} color="#3B82F6" />;
      case 'Announcements':
        return <Megaphone size={16} color="#EC4899" />;
      case 'Reminders':
        return <Bell size={16} color="#8B5CF6" />;
      case 'System':
      default:
        return <CheckCircle size={16} color={theme.success} />;
    }
  };

  const handleNotificationPress = (item: NotificationItem) => {
    if (!item.read) {
      markAsRead(item.id);
    }
    if (item.actionData?.appointmentId) {
      navigation.navigate('AppointmentDetail', { appointmentId: item.actionData.appointmentId });
    } else if (item.actionData?.clinicId) {
      navigation.navigate('ClinicDetail', { clinicId: item.actionData.clinicId });
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: theme.backgroundSoft, borderColor: theme.cardBorder }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <ArrowLeft size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Notification Center</Text>
            <Text style={[styles.headerSub, { color: theme.textMuted }]}>
              {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'All caught up'}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.primaryLight }]}
              onPress={markAllAsRead}
            >
              <CheckCheck size={14} color={theme.primary} />
              <Text style={[styles.actionBtnText, { color: theme.primary }]}>Read All</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.errorLight }]}
              onPress={clearAll}
            >
              <Trash2 size={14} color={theme.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* CATEGORY TABS HORIZONTAL SCROLL */}
      <View style={[styles.categoriesBar, { borderBottomColor: theme.cardBorder }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryPill,
                  {
                    backgroundColor: isSelected ? theme.primary : theme.card,
                    borderColor: isSelected ? theme.primary : theme.cardBorder,
                  },
                ]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.categoryPillText,
                    {
                      color: isSelected ? '#FFFFFF' : theme.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* NOTIFICATION LIST */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {notifications.length === 0 ? (
          <View style={[styles.emptyStateCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Bell size={36} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No notifications</Text>
            <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
              {selectedCategory === 'All'
                ? 'You have no alerts at this time.'
                : `No notifications under "${selectedCategory}".`}
            </Text>
          </View>
        ) : (
          <View style={styles.notifList}>
            {notifications.map((item) => {
              const isEarlierSlotOffer =
                item.actionData?.offeredTime != null ||
                item.title.toLowerCase().includes('earlier slot') ||
                (item.category === 'Appointments' && item.message.toLowerCase().includes('earlier'));

              if (isEarlierSlotOffer) {
                const relatedAppt = appointments.find((a) => a.id === item.actionData?.appointmentId);
                const clinicName =
                  item.actionData?.clinicName || relatedAppt?.clinicName || 'Smile & Child Pediatric Centre';
                const doctorName =
                  item.actionData?.doctorName || relatedAppt?.doctorName || 'Dr. Kavitha Reddy';
                const currentTime = item.actionData?.currentTime || relatedAppt?.time || '07:20 PM';
                const offeredTime =
                  item.actionData?.offeredTime ||
                  (earlierSlotSuggestion?.appointmentId === relatedAppt?.id
                    ? earlierSlotSuggestion?.newTime
                    : '07:00 PM');
                const offerStatus =
                  item.actionData?.offerStatus ||
                  (relatedAppt as any)?.earlier_slot_offered?.status ||
                  'OFFERED';
                const isProcessing = processingActionId === item.id;

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.earlierOfferCard,
                      {
                        backgroundColor: isDark ? '#111E3D' : '#F0FDF4',
                        borderColor: '#10B981',
                      },
                    ]}
                  >
                    {/* CARD HEADER */}
                    <View style={styles.earlierOfferHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Sparkles size={16} color="#10B981" />
                        <Text style={[styles.earlierOfferBadge, { color: '#059669' }]}>
                          EARLIER SLOT AVAILABLE
                        </Text>
                      </View>
                      <Text style={[styles.timestampText, { color: theme.textMuted }]}>{item.timestamp}</Text>
                    </View>

                    {/* CLINIC & DOCTOR */}
                    <View style={styles.earlierOfferBody}>
                      <View style={styles.earlierFieldRow}>
                        <Text style={[styles.earlierFieldLabel, { color: theme.textMuted }]}>Clinic:</Text>
                        <Text style={[styles.earlierFieldValue, { color: theme.textPrimary }]}>{clinicName}</Text>
                      </View>
                      <View style={styles.earlierFieldRow}>
                        <Text style={[styles.earlierFieldLabel, { color: theme.textMuted }]}>Doctor:</Text>
                        <Text style={[styles.earlierFieldValue, { color: theme.textPrimary }]}>{doctorName}</Text>
                      </View>

                      {/* TIME COMPARISON */}
                      <View
                        style={[
                          styles.earlierTimeBox,
                          { backgroundColor: theme.card, borderColor: theme.cardBorder },
                        ]}
                      >
                        <View style={styles.earlierTimeCol}>
                          <Text style={[styles.earlierTimeLabel, { color: theme.textMuted }]}>Current:</Text>
                          <Text style={[styles.earlierTimeVal, { color: theme.textSecondary }]}>{currentTime}</Text>
                        </View>
                        <ArrowRight size={18} color="#10B981" />
                        <View style={styles.earlierTimeCol}>
                          <Text style={[styles.earlierTimeLabel, { color: '#059669', fontWeight: '700' }]}>Earlier:</Text>
                          <Text style={[styles.earlierTimeVal, { color: '#10B981', fontWeight: '800' }]}>{offeredTime}</Text>
                        </View>
                      </View>
                    </View>

                    {/* ACTIONS OR STATUS */}
                    {offerStatus === 'ACCEPTED' ? (
                      <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
                        <Check size={14} color="#16A34A" />
                        <Text style={[styles.statusBadgeText, { color: '#16A34A' }]}>Earlier Slot Accepted</Text>
                      </View>
                    ) : offerStatus === 'DECLINED' ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.backgroundSoft }]}>
                        <X size={14} color={theme.textMuted} />
                        <Text style={[styles.statusBadgeText, { color: theme.textMuted }]}>
                          Offer Declined — Original Slot Kept
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.earlierActionsRow}>
                        <TouchableOpacity
                          style={[styles.earlierAcceptBtn, { backgroundColor: '#10B981' }]}
                          onPress={() => handleAcceptOffer(item)}
                          disabled={isProcessing}
                          activeOpacity={0.85}
                        >
                          {isProcessing ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Check size={16} color="#FFFFFF" />
                              <Text style={styles.earlierAcceptBtnText}>Accept</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.earlierDeclineBtn,
                            { backgroundColor: theme.card, borderColor: theme.cardBorder },
                          ]}
                          onPress={() => handleDeclineOffer(item)}
                          disabled={isProcessing}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.earlierDeclineBtnText, { color: theme.textSecondary }]}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }

              const isLoadBalanceOffer =
                item.type === 'load_balance_offer' ||
                item.type === 'load_balance_proposal' ||
                Boolean(
                  (item.actionData?.proposalId || (item as any).action_data?.proposalId) &&
                    (item.title.toLowerCase().includes('consultation') ||
                      item.title.toLowerCase().includes('load balancing') ||
                      item.title.toLowerCase().includes('transfer') ||
                      item.message.toLowerCase().includes('faster consultation') ||
                      item.message.toLowerCase().includes('transfer'))
                );

              if (isLoadBalanceOffer) {
                const proposalId = item.actionData?.proposalId || (item as any).action_data?.proposalId;
                const clinicName = item.actionData?.clinicName || (item as any).action_data?.clinicName || 'Moon Dental Clinic';
                const currentDoctorName = item.actionData?.currentDoctorName || item.actionData?.sourceDoctorName || (item as any).action_data?.sourceDoctorName || 'Dr. Arun Kumar';
                const proposedDoctorName = item.actionData?.proposedDoctorName || item.actionData?.targetDoctorName || (item as any).action_data?.targetDoctorName || 'Dr. Ananya Deshmukh';
                const patientName = item.actionData?.patientName || (item as any).action_data?.patientName || user?.name || 'Rajesh Kumar';
                const transferReason = item.actionData?.reason || (item as any).action_data?.reason || item.actionData?.procedureName || (item as any).action_data?.procedureName || 'doctor queue load balancing';
                const estWait = item.actionData?.estimatedWait ?? (item as any).action_data?.estimatedWait ?? 40;
                const newEstWait = item.actionData?.newEstimatedWait ?? (item as any).action_data?.newEstimatedWait ?? 0;
                const status: string = (proposalId ? loadBalanceActions[proposalId] : undefined) || item.actionData?.patientConsent || (item as any).action_data?.patientConsent || item.actionData?.status || (item as any).action_data?.status || 'PENDING';
                const isProcessing = processingActionId === item.id;

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.earlierOfferCard,
                      {
                        backgroundColor: isDark ? '#111E3D' : '#F0F9FF',
                        borderColor: '#0284C7',
                      },
                    ]}
                  >
                    {/* CARD HEADER */}
                    <View style={styles.earlierOfferHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Sparkles size={16} color="#0284C7" />
                        <Text style={[styles.earlierOfferBadge, { color: '#0284C7' }]}>
                          DOCTOR QUEUE TRANSFER REQUEST
                        </Text>
                      </View>
                      <Text style={[styles.timestampText, { color: theme.textMuted }]}>{item.timestamp}</Text>
                    </View>

                    {/* CLINIC & DOCTORS */}
                    <View style={styles.earlierOfferBody}>
                      <View style={styles.earlierFieldRow}>
                        <Text style={[styles.earlierFieldLabel, { color: theme.textMuted }]}>Clinic:</Text>
                        <Text style={[styles.earlierFieldValue, { color: theme.textPrimary }]}>{clinicName}</Text>
                      </View>
                      <View style={styles.earlierFieldRow}>
                        <Text style={[styles.earlierFieldLabel, { color: theme.textMuted }]}>Patient:</Text>
                        <Text style={[styles.earlierFieldValue, { color: theme.textPrimary, fontWeight: '700' }]}>{patientName}</Text>
                      </View>
                      <View style={styles.earlierFieldRow}>
                        <Text style={[styles.earlierFieldLabel, { color: theme.textMuted }]}>Current Doctor:</Text>
                        <Text style={[styles.earlierFieldValue, { color: theme.textPrimary }]}>{currentDoctorName}</Text>
                      </View>
                      <View style={styles.earlierFieldRow}>
                        <Text style={[styles.earlierFieldLabel, { color: theme.textMuted }]}>Proposed Receiving Doctor:</Text>
                        <Text style={[styles.earlierFieldValue, { color: '#0284C7', fontWeight: '700' }]}>{proposedDoctorName}</Text>
                      </View>
                      <View style={styles.earlierFieldRow}>
                        <Text style={[styles.earlierFieldLabel, { color: theme.textMuted }]}>Reason / Context:</Text>
                        <Text style={[styles.earlierFieldValue, { color: theme.textPrimary }]}>
                          doctor queue load balancing{transferReason && transferReason.toLowerCase() !== 'doctor queue load balancing' ? ` (${transferReason})` : ''}
                        </Text>
                      </View>

                      {/* ESTIMATED WAIT COMPARISON */}
                      <View
                        style={[
                          styles.earlierTimeBox,
                          { backgroundColor: theme.card, borderColor: theme.cardBorder },
                        ]}
                      >
                        <View style={styles.earlierTimeCol}>
                          <Text style={[styles.earlierTimeLabel, { color: theme.textMuted }]}>Current Wait:</Text>
                          <Text style={[styles.earlierTimeVal, { color: theme.textSecondary }]}>~{estWait} min</Text>
                        </View>
                        <ArrowRight size={18} color="#0284C7" />
                        <View style={styles.earlierTimeCol}>
                          <Text style={[styles.earlierTimeLabel, { color: '#0284C7', fontWeight: '700' }]}>New Wait:</Text>
                          <Text style={[styles.earlierTimeVal, { color: '#0284C7', fontWeight: '800' }]}>~{newEstWait} min</Text>
                        </View>
                      </View>
                    </View>

                    {/* ACTIONS OR STATUS */}
                    {status === 'ACCEPTED' ? (
                      <View style={[styles.statusBadge, { backgroundColor: '#E0F2FE' }]}>
                        <Check size={14} color="#0284C7" />
                        <Text style={[styles.statusBadgeText, { color: '#0284C7' }]}>
                          Transfer Accepted — Awaiting Doctor Approval
                        </Text>
                      </View>
                    ) : status === 'DECLINED' ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.backgroundSoft }]}>
                        <X size={14} color={theme.textMuted} />
                        <Text style={[styles.statusBadgeText, { color: theme.textMuted }]}>
                          Offer Declined — Original Doctor Kept
                        </Text>
                      </View>
                    ) : status === 'COMMITTED' ? (
                      <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
                        <Check size={14} color="#16A34A" />
                        <Text style={[styles.statusBadgeText, { color: '#16A34A' }]}>
                          Transfer Confirmed ✅ — Assigned to {proposedDoctorName}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.earlierActionsRow}>
                        <TouchableOpacity
                          style={[styles.earlierAcceptBtn, { backgroundColor: '#0284C7' }]}
                          onPress={() => handleAcceptLoadBalance(item)}
                          disabled={isProcessing}
                          activeOpacity={0.85}
                        >
                          {isProcessing ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Check size={16} color="#FFFFFF" />
                              <Text style={styles.earlierAcceptBtnText}>Accept</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.earlierDeclineBtn,
                            { backgroundColor: theme.card, borderColor: theme.cardBorder },
                          ]}
                          onPress={() => handleDeclineLoadBalance(item)}
                          disabled={isProcessing}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.earlierDeclineBtnText, { color: theme.textSecondary }]}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.notifCard,
                    {
                      backgroundColor: item.read ? theme.card : isDark ? '#111E3D' : '#F0F7FF',
                      borderColor: item.read ? theme.cardBorder : theme.primary,
                    },
                  ]}
                  onPress={() => handleNotificationPress(item)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.iconBox, { backgroundColor: theme.backgroundSoft }]}>
                    {getCategoryIcon(item.category)}
                  </View>

                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.notifTopRow}>
                      <View style={styles.categoryBadge}>
                        <Text style={[styles.categoryBadgeText, { color: theme.primary }]}>{item.category}</Text>
                      </View>
                      <Text style={[styles.timestampText, { color: theme.textMuted }]}>{item.timestamp}</Text>
                    </View>

                    <Text
                      style={[
                        styles.notifTitle,
                        { color: theme.textPrimary, fontWeight: item.read ? '600' : '800' },
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.notifMessage, { color: theme.textSecondary }]}>{item.message}</Text>
                  </View>

                  {!item.read && <View style={[styles.unreadDot, { backgroundColor: theme.cta }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
  },
  headerSub: {
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  categoriesBar: {
    borderBottomWidth: 1,
    paddingVertical: SPACING.sm,
  },
  categoryScroll: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs + 2,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 12,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  notifList: {
    gap: SPACING.sm + 2,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    ...SHADOWS.subtle,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  notifTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  timestampText: {
    fontSize: 10,
  },
  notifTitle: {
    fontSize: 13,
  },
  notifMessage: {
    fontSize: 11,
    lineHeight: 16,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: 'center',
  },
  emptyStateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    gap: SPACING.sm,
    marginTop: SPACING.xl,
  },
  emptyTitle: {
    ...TYPOGRAPHY.labelLg,
    marginTop: SPACING.xs,
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: 'center',
  },
  earlierOfferCard: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    gap: SPACING.sm,
    ...SHADOWS.subtle,
  },
  earlierOfferHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earlierOfferBadge: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  earlierOfferBody: {
    gap: 6,
  },
  earlierFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  earlierFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    width: 55,
  },
  earlierFieldValue: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  earlierTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: 4,
  },
  earlierTimeCol: {
    alignItems: 'center',
  },
  earlierTimeLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  earlierTimeVal: {
    fontSize: 14,
  },
  earlierActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  earlierAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  earlierAcceptBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  earlierDeclineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  earlierDeclineBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
