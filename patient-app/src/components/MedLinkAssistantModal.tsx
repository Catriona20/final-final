import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import {
  Bot,
  Send,
  X,
  Sparkles,
  AlertTriangle,
  MapPin,
  Calendar,
  ChevronRight,
  RefreshCw,
  PhoneCall,
} from 'lucide-react-native';
import { AppStackParamList, ChatMessage } from '../types';
import { SPACING, RADIUS, SHADOWS, TYPOGRAPHY, getThemeColors } from '../constants/theme';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';
import { useAppointmentStore } from '../store/useAppointmentStore';
import { chatbotRuleService } from '../services/chatbotRuleService';
import { apiClient } from '../services/apiClient';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type NavProp = StackNavigationProp<AppStackParamList>;

interface MedLinkAssistantModalProps {
  visible: boolean;
  onClose: () => void;
}

export const MedLinkAssistantModal: React.FC<MedLinkAssistantModalProps> = ({ visible, onClose }) => {
  const navigation = useNavigation<NavProp>();
  const { isDark } = useThemeStore();
  const theme = getThemeColors(isDark);

  const { activeLocation, setSelectedCategory, setSearchQuery } = useAppStore();
  const { appointments, clinics, doctors, healthRecords } = useAppointmentStore();

  const nextAppt = appointments.find((a) =>
    ['Confirmed', 'Checked In', 'Waiting', 'In Consultation', 'Delayed'].includes(a.status)
  );

  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: `👋 Hello! I am **MedLink Assistant**, your healthcare navigation guide.\n\nI can help you discover nearby clinics around **${activeLocation.name}**, review your appointment status, check clinic timings, or explain how to book consultations.\n\nHow can I help you today?`,
      timestamp: 'Just now',
      quickReplies: [
        'Find nearest clinic',
        'Is my appointment tomorrow?',
        'Clinic hours',
      ],
    },
  ]);

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
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

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    setInputQuery('');
    setIsTyping(true);

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      // Build conversation history for context (last 6 prior messages)
      const conversationHistory = messages.slice(-6).map((m) => ({
        role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));

      const res = await apiClient.post('/ai/chat', {
        message: query,
        conversationHistory,
        context: {
          activeLocation,
          upcomingAppointment: nextAppt || null,
        },
      });

      const data = res.data;
      if (data && data.reply) {
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: 'assistant',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionLink: data.actionLink,
          quickReplies: data.quickReplies,
          intent: data.intent,
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        throw new Error('Empty response from AI endpoint');
      }
    } catch (err: any) {
      console.warn('[MedLinkAssistant] API query note:', err?.message || err);

      // Friendly fallback if backend error occurs
      try {
        const localResponse = chatbotRuleService.processMessage(query, {
          activeLocation,
          upcomingAppointment: nextAppt,
          clinics,
          doctors,
          healthRecords,
        });
        setMessages((prev) => [...prev, localResponse]);
      } catch {
        const friendlyErrorMsg: ChatMessage = {
          id: `bot-err-${Date.now()}`,
          sender: 'assistant',
          text: "I'm having trouble connecting right now. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          quickReplies: ['Find nearest clinic', 'Is my appointment tomorrow?', 'Clinic hours'],
        };
        setMessages((prev) => [...prev, friendlyErrorMsg]);
      }
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleActionLink = (link?: ChatMessage['actionLink']) => {
    if (!link) return;
    onClose();
    switch (link.type) {
      case 'map':
      case 'emergency':
        navigation.navigate('MapView', { department: link.department });
        break;
      case 'booking':
        if (link.department) {
          navigation.navigate('Booking', { department: link.department });
        } else {
          navigation.navigate('SelectDepartment');
        }
        break;
      case 'appointment':
        if (link.targetId) {
          navigation.navigate('AppointmentDetail', { appointmentId: link.targetId });
        } else {
          navigation.navigate('MainTabs', { screen: 'AppointmentsTab' });
        }
        break;
      case 'search':
        if (link.department) {
          setSelectedCategory(link.department);
          setSearchQuery(link.department);
        }
        navigation.navigate('MainTabs', {
          screen: 'SearchTab',
          params: link.department ? { category: link.department, query: link.department } : undefined,
        });
        break;
      case 'records':
        navigation.navigate('MainTabs', { screen: 'HealthRecordsTab' });
        break;
      case 'clinic':
        if (link.targetId) {
          navigation.navigate('ClinicDetail', { clinicId: link.targetId });
        }
        break;
    }
  };

  if (!visible) return null;

  return (
    <View style={[styles.modalRoot, { zIndex: 99999, pointerEvents: 'box-none' }]}>
      {/* BACKDROP */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* CHAT SHEET */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardBorder,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* HEADER */}
        <View style={[styles.header, { borderBottomColor: theme.cardBorder, backgroundColor: isDark ? '#0F172A' : '#0B1530' }]}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.botIconCircle, { backgroundColor: theme.primary }]}>
              <Bot size={18} color="#FFFFFF" />
            </View>
            <View>
              <View style={styles.titleRow}>
                <Text style={styles.headerTitle}>MedLink Assistant</Text>
                <View style={styles.ruleBadge}>
                  <Text style={styles.ruleBadgeText}>AI ASSISTANT</Text>
                </View>
              </View>
              <Text style={styles.headerSub}>Active Location: {activeLocation.name}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() =>
                setMessages([
                  {
                    id: `welcome-${Date.now()}`,
                    sender: 'assistant',
                    text: `Conversation cleared. How can I assist you with clinics or appointments today?`,
                    timestamp: 'Just now',
                    quickReplies: ['Find nearest clinic', 'Is my appointment tomorrow?', 'Clinic hours'],
                  },
                ])
              }
            >
              <RefreshCw size={15} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionBtn} onPress={onClose}>
              <X size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* CONVERSATION AREA */}
        <View style={styles.conversationArea}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesScrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.messagesScroll}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((msg) => {
              const isAssistant = msg.sender === 'assistant';
              const isEmergency = msg.intent === 'EMERGENCY_REDIRECT';
              return (
                <View key={msg.id} style={[styles.messageWrapper, isAssistant ? styles.wrapperLeft : styles.wrapperRight]}>
                  {isAssistant && (
                    <View style={[styles.avatarMini, { backgroundColor: theme.primary }]}>
                      <Bot size={13} color="#FFFFFF" />
                    </View>
                  )}

                  <View style={{ maxWidth: '82%', gap: 6 }}>
                    <View
                      style={[
                        styles.messageBubble,
                        isAssistant
                          ? [
                              styles.bubbleAssistant,
                              {
                                backgroundColor: isEmergency
                                  ? isDark
                                    ? '#7F1D1D'
                                    : '#FEF2F2'
                                  : isDark
                                  ? '#1E293B'
                                  : '#F8FAFC',
                                borderColor: isEmergency ? '#EF4444' : theme.cardBorder,
                              },
                            ]
                          : [styles.bubbleUser, { backgroundColor: theme.primary }],
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          { color: isAssistant ? theme.textPrimary : '#FFFFFF' },
                        ]}
                      >
                        {msg.text}
                      </Text>
                      <Text
                        style={[
                          styles.messageTime,
                          { color: isAssistant ? theme.textMuted : 'rgba(255,255,255,0.75)' },
                        ]}
                      >
                        {msg.timestamp}
                      </Text>
                    </View>

                    {/* ACTION LINK BUTTON */}
                    {msg.actionLink && (
                      <TouchableOpacity
                        style={[
                          styles.actionLinkBtn,
                          {
                            backgroundColor: isEmergency ? '#EF4444' : theme.cta,
                          },
                        ]}
                        onPress={() => handleActionLink(msg.actionLink)}
                        activeOpacity={0.85}
                      >
                        {isEmergency ? <AlertTriangle size={14} color="#FFFFFF" /> : <ChevronRight size={14} color="#FFFFFF" />}
                        <Text style={styles.actionLinkText}>{msg.actionLink.label}</Text>
                      </TouchableOpacity>
                    )}

                    {/* QUICK REPLIES PILLS */}
                    {msg.quickReplies && (
                      <View style={styles.quickRepliesGrid}>
                        {msg.quickReplies.map((qr, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={[
                              styles.qrPill,
                              {
                                backgroundColor: theme.backgroundSoft,
                                borderColor: theme.cardBorder,
                              },
                            ]}
                            onPress={() => handleSendMessage(qr)}
                          >
                            <Text style={[styles.qrPillText, { color: theme.primary }]}>{qr}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {/* TYPING INDICATOR */}
            {isTyping && (
              <View style={[styles.messageWrapper, styles.wrapperLeft]}>
                <View style={[styles.avatarMini, { backgroundColor: theme.primary }]}>
                  <Bot size={13} color="#FFFFFF" />
                </View>
                <View
                  style={[
                    styles.messageBubble,
                    styles.bubbleAssistant,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      borderColor: theme.cardBorder,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                    },
                  ]}
                >
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[styles.messageText, { color: theme.textMuted, fontStyle: 'italic' }]}>
                    MedLink Assistant is typing...
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>

        {/* MESSAGE COMPOSER */}
        <View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.cardBorder }]}>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.backgroundSoft,
                borderColor: isInputFocused ? theme.primary : theme.cardBorder,
              },
            ]}
          >
            <TextInput
              style={[
                styles.inputField,
                {
                  color: theme.textPrimary,
                },
                Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
              ]}
              placeholder="Type a message..."
              placeholderTextColor={theme.textMuted}
              value={inputQuery}
              onChangeText={setInputQuery}
              multiline={false}
              maxLength={500}
              editable={!isTyping}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              selectionColor={theme.primary}
              cursorColor={theme.primary}
              returnKeyType="send"
              onKeyPress={(e: any) => {
                if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              onSubmitEditing={() => handleSendMessage()}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.sendBtn,
              {
                backgroundColor: inputQuery.trim() && !isTyping ? theme.cta : theme.backgroundMuted,
                opacity: inputQuery.trim() && !isTyping ? 1 : 0.6,
              },
            ]}
            onPress={() => handleSendMessage()}
            disabled={!inputQuery.trim() || isTyping}
            activeOpacity={0.85}
          >
            {isTyping ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Send size={16} color={inputQuery.trim() ? '#FFFFFF' : theme.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 70 : 80,
    bottom: Platform.OS === 'web' ? 76 : 76,
    left: 0,
    right: 0,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : undefined,
    marginHorizontal: Platform.OS === 'web' ? 'auto' : undefined,
    display: 'flex',
    flexDirection: 'column',
    borderRadius: RADIUS.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    ...SHADOWS.float,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexShrink: 0,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  botIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ruleBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  ruleBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 10,
    color: '#94A3B8',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationArea: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  messagesScrollContainer: {
    flex: 1,
  },
  messagesScroll: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.md,
    flexGrow: 1,
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  wrapperLeft: {
    justifyContent: 'flex-start',
  },
  wrapperRight: {
    justifyContent: 'flex-end',
  },
  avatarMini: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageBubble: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 2,
  },
  bubbleUser: {
    borderBottomRightRadius: 2,
  },
  messageText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  messageTime: {
    fontSize: 9,
    alignSelf: 'flex-end',
  },
  actionLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    ...SHADOWS.subtle,
  },
  actionLinkText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  quickRepliesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  qrPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  qrPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'web' ? 10 : SPACING.sm + 2,
    borderTopWidth: 1,
    gap: SPACING.sm,
    flexShrink: 0,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  inputField: {
    fontSize: 13,
    lineHeight: 18,
    padding: 0,
    margin: 0,
    width: '100%',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});
