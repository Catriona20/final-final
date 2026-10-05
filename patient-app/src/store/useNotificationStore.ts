import { create } from 'zustand';
import { NotificationItem, NotificationCategory, Announcement } from '../types';
import { notificationService } from '../services/notificationService';
import { announcementService } from '../services/announcementService';

interface NotificationStoreState {
  notifications: NotificationItem[];
  announcements: Announcement[];
  unreadCount: number;
  selectedCategory: NotificationCategory | 'All';

  fetchNotifications: () => Promise<NotificationItem[]>;
  refreshNotifications: () => void;
  setSelectedCategory: (cat: NotificationCategory | 'All') => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  addNotification: (item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
}

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
  notifications: notificationService.getNotifications(),
  announcements: announcementService.getAnnouncements(),
  unreadCount: notificationService.getUnreadCount(),
  selectedCategory: 'All',

  fetchNotifications: async () => {
    const items = await notificationService.fetchNotifications();
    const { selectedCategory } = get();
    set({
      notifications: notificationService.getNotifications(selectedCategory),
      unreadCount: notificationService.getUnreadCount(),
      announcements: announcementService.getAnnouncements(),
    });
    return items;
  },

  refreshNotifications: () => {
    const { selectedCategory } = get();
    set({
      notifications: notificationService.getNotifications(selectedCategory),
      unreadCount: notificationService.getUnreadCount(),
      announcements: announcementService.getAnnouncements(),
    });
  },

  setSelectedCategory: (selectedCategory) => {
    set({
      selectedCategory,
      notifications: notificationService.getNotifications(selectedCategory),
    });
  },

  markAsRead: (id: string) => {
    notificationService.markAsRead(id);
    get().refreshNotifications();
  },

  markAllAsRead: () => {
    notificationService.markAllAsRead();
    get().refreshNotifications();
  },

  clearNotification: (id: string) => {
    notificationService.clearNotification(id);
    get().refreshNotifications();
  },

  clearAll: () => {
    notificationService.clearAll();
    get().refreshNotifications();
  },

  addNotification: (item) => {
    notificationService.addNotification(item);
    get().refreshNotifications();
  },
}));

// Initialize store with subscription and API fetch
notificationService.subscribe(() => {
  useNotificationStore.getState().refreshNotifications();
});
notificationService.fetchNotifications().then(() => {
  useNotificationStore.getState().refreshNotifications();
});
