import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Trash2,
  Calendar,
  Clock,
  AlertTriangle,
  Users,
  ShieldCheck,
  CheckCircle2,
  Inbox,
  Check,
  X,
  Sparkles,
} from 'lucide-react-native';
import { PALETTE, TYPOGRAPHY, SHADOWS } from '../../constants/theme';
import { useThemeStore } from '../../store/useThemeStore';
import { useDoctorAuthStore } from '../../store/useDoctorAuthStore';
import { notificationApi, DoctorNotificationItem } from '../../api/notificationApi';
import { apiClient } from '../../api/apiClient';
import { getDoctorSocket } from '../../api/socketApi';

export const DoctorNotificationsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, isDark } = useThemeStore();
  const { doctor } = useDoctorAuthStore();

  const [notifications, setNotifications] = useState<DoctorNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Appointments' | 'Queue Updates' | 'Emergency' | 'System'>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [proposalActions, setProposalActions] = useState<Record<string, 'ACCEPTED' | 'DECLINED'>>({});
  const [processingProposalId, setProcessingProposalId] = useState<string | null>(null);

  const handleDoctorConsent = async (proposalId: string, notifId: string, consent: 'ACCEPT' | 'DECLINE') => {
    if (!doctor?.id || !proposalId) return;
    setProcessingProposalId(proposalId);
    try {
      await apiClient.post('/queue/load-balance/doctor-consent', {
        proposalId,
        doctorId: doctor.id,
        consent,
      });
      setProposalActions((prev) => ({ ...prev, [proposalId]: consent === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED' }));
      handleMarkAsRead(notifId);
    } catch (err: any) {
      console.warn('Doctor consent error:', err);
    } finally {
      setProcessingProposalId(null);
    }
  };

  const fetchNotifications = async () => {
    if (!doctor?.id) return;
    const res = await notificationApi.getNotifications(doctor.id);
    setNotifications(res.notifications);
    setUnreadCount(res.unreadCount);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchNotifications();

    if (!doctor?.id) return;

    // Subscribe to live notifications via Socket.IO
    const socket = getDoctorSocket();
    const handleNotif = (newNotif: DoctorNotificationItem) => {
      setNotifications((prev) => [newNotif, ...prev]);
      setUnreadCount((c) => c + 1);
    };

    if (socket) {
      socket.on('notification:new', handleNotif);
    }

    return () => {
      if (socket) {
        socket.off('notification:new', handleNotif);
      }
    };
  }, [doctor?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handleMarkAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    await notificationApi.markAsRead(id);
  };

  const handleMarkAllRead = async () => {
    if (!doctor?.id) return;
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, is_read: true }))
    );
    setUnreadCount(0);
    await notificationApi.markAllAsRead(doctor.id);
  };

  const handleClearAll = async () => {
    if (!doctor?.id) return;
    setNotifications([]);
    setUnreadCount(0);
    await notificationApi.clearAll(doctor.id);
  };

  const filteredNotifications = notifications.filter((n) => {
    if (selectedFilter === 'All') return true;
    if (selectedFilter === 'Appointments') return n.category === 'Appointments' || n.type === 'appointment';
    if (selectedFilter === 'Queue Updates') return n.category === 'Queue Updates' || n.type === 'queue';
    if (selectedFilter === 'Emergency') return n.category === 'Emergency' || n.type === 'emergency';
    if (selectedFilter === 'System') return n.category === 'System' || n.category === 'Clinic Updates' || n.type === 'verification';
    return true;
  });

  const getCategoryIcon = (category?: string, type?: string) => {
    if (type === 'emergency' || category === 'Emergency') {
      return <AlertTriangle size={18} color={PALETTE.emergency} />;
    }
    if (type === 'verification') {
      return <ShieldCheck size={18} color={PALETTE.success} />;
    }
    if (category === 'Appointments' || type === 'appointment') {
      return <Calendar size={18} color={PALETTE.primary} />;
    }
    if (category === 'Queue Updates' || type === 'queue') {
      return <Users size={18} color={PALETTE.warning} />;
    }
    return <Bell size={18} color={PALETTE.primary} />;
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <ArrowLeft size={18} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Doctor Alerts</Text>
            <Text style={[styles.headerSub, { color: colors.secondaryText }]}>
              {unreadCount > 0 ? `${unreadCount} unread notification(s)` : 'All caught up'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: colors.cardSubtle }]}
              onPress={handleMarkAllRead}
            >
              <CheckCheck size={16} color={PALETTE.primary} />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: colors.cardSubtle }]}
              onPress={handleClearAll}
            >
              <Trash2 size={16} color={PALETTE.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* FILTER PILLS */}
      <View style={[styles.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {(['All', 'Appointments', 'Queue Updates', 'Emergency', 'System'] as const).map((filter) => {
            const isActive = selectedFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isActive ? PALETTE.primary : colors.cardSubtle,
                    borderColor: isActive ? PALETTE.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedFilter(filter)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isActive ? '#FFFFFF' : colors.secondaryText },
                    isActive && styles.filterPillTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* NOTIFICATIONS LIST */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={PALETTE.primary} />
        </View>
      ) : filteredNotifications.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PALETTE.primary} />}
        >
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.cardSubtle }]}>
            <Inbox size={32} color={colors.secondaryText} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Notifications</Text>
          <Text style={[styles.emptySub, { color: colors.secondaryText }]}>
            You have no notifications in this category. New appointment bookings, check-ins, and emergency alerts will appear here in real time.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PALETTE.primary} />}
        >
          {filteredNotifications.map((notif) => {
            const isRead = notif.read || notif.is_read;
            const isLoadBalanceProposal =
              notif.type === 'load_balance_proposal' ||
              (notif.action_data?.proposalId &&
                (notif.title.toLowerCase().includes('load balancing') ||
                  notif.title.toLowerCase().includes('transfer request')));

            if (isLoadBalanceProposal) {
              const proposalId = notif.action_data?.proposalId;
              const patientName = notif.action_data?.patientName || 'Patient';
              const procedureName = notif.action_data?.procedureName || 'General OPD';
              const sourceDoc = notif.action_data?.sourceDoctorName || 'Colleague Doctor';
              const currentWaitCount = notif.action_data?.targetQueueCount ?? 0;
              const proposedWaitCount = notif.action_data?.proposedQueueCount ?? (currentWaitCount + 1);
              const status = proposalActions[proposalId] || notif.action_data?.doctorConsent || notif.action_data?.status || 'PENDING';
              const isProcessing = processingProposalId === proposalId;

              return (
                <View
                  key={notif.id}
                  style={[
                    styles.notifCard,
                    {
                      backgroundColor: isDark ? '#0A2540' : '#F0FDF4',
                      borderColor: '#10B981',
                    },
                    SHADOWS.light,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.categoryBadgeRow}>
                      <View style={[styles.iconCircle, { backgroundColor: '#DCFCE7' }]}>
                        <Sparkles size={18} color="#10B981" />
                      </View>
                      <View>
                        <Text style={[styles.notifCategory, { color: '#059669', fontWeight: '700' }]}>
                          QUEUE LOAD BALANCING OFFER
                        </Text>
                        <Text style={[styles.notifTime, { color: colors.secondaryText }]}>
                          {notif.timestamp || 'Just now'}
                        </Text>
                      </View>
                    </View>
                    {!isRead && <View style={styles.unreadDot} />}
                  </View>

                  <Text style={[styles.notifTitle, { color: colors.text, marginTop: 8 }]}>
                    Transfer Request: {patientName} ({procedureName})
                  </Text>
                  <Text style={[styles.notifMessage, { color: colors.secondaryText, marginTop: 4 }]}>
                    Dr. {sourceDoc}'s queue is heavily loaded. Would you accept transferring {patientName} to your queue?
                  </Text>

                  {/* QUEUE COMPARISON BOX */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      padding: 10,
                      borderRadius: 10,
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 11, color: colors.secondaryText }}>Your Current Queue</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{currentWaitCount} waiting</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: '#10B981', fontWeight: 'bold' }}>→</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, color: '#059669', fontWeight: '600' }}>If Accepted</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#10B981' }}>{proposedWaitCount} waiting</Text>
                    </View>
                  </View>

                  {/* ACTION CONTROLS */}
                  {status === 'ACCEPTED' ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#DCFCE7',
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        marginTop: 12,
                      }}
                    >
                      <Check size={14} color="#16A34A" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>
                        Accepted — Awaiting Patient Consent / In Queue
                      </Text>
                    </View>
                  ) : status === 'DECLINED' ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: colors.cardSubtle,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        marginTop: 12,
                      }}
                    >
                      <X size={14} color={colors.secondaryText} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.secondaryText }}>
                        Proposal Declined — Patient Stays With Original Doctor
                      </Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          backgroundColor: '#10B981',
                          paddingVertical: 10,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                        onPress={() => handleDoctorConsent(proposalId, notif.id, 'ACCEPT')}
                        disabled={isProcessing}
                        activeOpacity={0.85}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Check size={16} color="#FFFFFF" />
                            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Accept Patient</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          backgroundColor: colors.card,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingVertical: 10,
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={() => handleDoctorConsent(proposalId, notif.id, 'DECLINE')}
                        disabled={isProcessing}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color: colors.secondaryText, fontWeight: '600', fontSize: 13 }}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }

            return (
              <TouchableOpacity
                key={notif.id}
                style={[
                  styles.notifCard,
                  {
                    backgroundColor: isRead ? colors.card : isDark ? '#0F2648' : '#EFF6FF',
                    borderColor: isRead ? colors.border : PALETTE.primary + '50',
                  },
                  SHADOWS.light,
                ]}
                onPress={() => handleMarkAsRead(notif.id)}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.categoryBadgeRow}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.cardSubtle }]}>
                      {getCategoryIcon(notif.category, notif.type)}
                    </View>
                    <View>
                      <Text style={[styles.notifCategory, { color: PALETTE.primary }]}>
                        {notif.category || 'Notification'}
                      </Text>
                      <Text style={[styles.notifTime, { color: colors.secondaryText }]}>
                        {notif.timestamp || (notif.created_at ? new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now')}
                      </Text>
                    </View>
                  </View>

                  {!isRead && <View style={styles.unreadDot} />}
                </View>

                <Text style={[styles.notifTitle, { color: colors.text }]}>{notif.title}</Text>
                <Text style={[styles.notifMessage, { color: colors.secondaryText }]}>{notif.message}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.bold,
    fontSize: 18,
  },
  headerSub: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.regular,
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.medium,
    fontSize: 13,
  },
  filterPillTextActive: {
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  notifCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCategory: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.semiBold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  notifTime: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.regular,
    fontSize: 11,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PALETTE.primary,
  },
  notifTitle: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.bold,
    fontSize: 15,
    marginBottom: 4,
  },
  notifMessage: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.bold,
    fontSize: 18,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontWeight: TYPOGRAPHY.weights.regular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
