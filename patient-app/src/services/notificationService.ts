import { NotificationItem, NotificationCategory } from '../types';
import { apiClient } from './apiClient';
import { socketService } from './socketService';
import { MOCK_NOTIFICATIONS } from '../data/mockData';
import { useAuthStore } from '../store/useAuthStore';

class NotificationService {
  private notifications: NotificationItem[] = [...(MOCK_NOTIFICATIONS || [])];
  private listeners: Array<() => void> = [];

  constructor() {
    // Listen for real-time notifications via WebSocket
    socketService.subscribe('notification:new', (notif: NotificationItem) => {
      // Deduplicate by ID
      this.notifications = [notif, ...this.notifications.filter((n) => n.id !== notif.id)];
      this.notify();
    });

    socketService.subscribe('queue:load_balance_proposal_updated', () => {
      this.fetchNotifications();
    });
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  async fetchNotifications(explicitPatientId?: string): Promise<NotificationItem[]> {
    try {
      const user = useAuthStore.getState().user;
      const patientId = explicitPatientId || user?.id;
      const res = await apiClient.get('/notifications', {
        params: patientId ? { patientId } : undefined,
      });
      if (res.data?.notifications) {
        this.notifications = res.data.notifications;
        this.notify();
        return this.notifications;
      }
    } catch (err) {
      console.warn('Notifications API fetch error:', err);
    }
    return this.notifications;
  }

  getNotifications(category?: NotificationCategory | 'All'): NotificationItem[] {
    if (!category || category === 'All') {
      return [...this.notifications];
    }
    return this.notifications.filter((n) => n.category === category);
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  async markAsRead(id: string): Promise<void> {
    this.notifications = this.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    this.notify();

    try {
      await apiClient.put(`/notifications/${id}/read`);
    } catch (err) {
      // Ignore
    }
  }

  async markAllAsRead(): Promise<void> {
    this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
    this.notify();

    try {
      await apiClient.put('/notifications/read-all');
    } catch (err) {
      // Ignore
    }
  }

  clearNotification(id: string): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notify();
  }

  clearAll(): void {
    this.notifications = [];
    this.notify();
  }

  addNotification(item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): void {
    const newNotif: NotificationItem = {
      ...item,
      id: `notif-${Date.now()}`,
      timestamp: 'Just now',
      read: false,
    };
    this.notifications = [newNotif, ...this.notifications];
    this.notify();
  }
}

export const notificationService = new NotificationService();
