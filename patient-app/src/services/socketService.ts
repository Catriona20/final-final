import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'http://localhost:5000';

class ClientSocketService {
  private socket: Socket | null = null;
  private currentPatientId: string | null = null;
  private joinedAppointmentIds: Set<string> = new Set();
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  connect(patientId?: string): void {
    if (this.socket && this.socket.connected) {
      if (patientId && patientId !== this.currentPatientId) {
        this.currentPatientId = patientId;
        this.socket.emit('join:patient', patientId);
      }
      return;
    }

    try {
      this.socket = io(WS_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('📡 Connected to Patient App Real-time WebSocket Gateway');
        if (patientId || this.currentPatientId) {
          const pid = patientId || this.currentPatientId;
          this.currentPatientId = pid;
          this.socket?.emit('join:patient', pid);
        }
        for (const aptId of this.joinedAppointmentIds) {
          this.socket?.emit('join:appointment', aptId);
        }
      });

      this.socket.on('queue:updated', (data: any) => {
        this.notify('queue:updated', data);
      });

      this.socket.on('queue:completed', (data: any) => {
        this.notify('queue:completed', data);
      });

      this.socket.on('consultation:completed', (data: any) => {
        this.notify('consultation:completed', data);
      });

      this.socket.on('clinic:created', (data: any) => {
        this.notify('clinic:created', data);
      });

      this.socket.on('doctor:verified', (data: any) => {
        this.notify('doctor:verified', data);
      });

      this.socket.on('doctor:registered', (data: any) => {
        this.notify('doctor:registered', data);
      });

      this.socket.on('appointment:status', (data: any) => {
        this.notify('appointment:status', data);
      });

      this.socket.on('appointment:updated', (data: any) => {
        this.notify('appointment:updated', data);
      });

      this.socket.on('doctor:delayed', (data: any) => {
        this.notify('doctor:delayed', data);
      });

      this.socket.on('slot:earlier_available', (data: any) => {
        this.notify('slot:earlier_available', data);
      });

      this.socket.on('notification:new', (data: any) => {
        this.notify('notification:new', data);
      });

      this.socket.on('doctor:status_updated', (data: any) => {
        this.notify('doctor:status_updated', data);
      });

      this.socket.on('doctor:availability_updated', (data: any) => {
        this.notify('doctor:availability_updated', data);
      });

      this.socket.on('doctor:availability_changed', (data: any) => {
        this.notify('doctor:availability_changed', data);
      });

      this.socket.on('availability_request:approved', (data: any) => {
        this.notify('availability_request:approved', data);
      });

      this.socket.on('availability_request:rejected', (data: any) => {
        this.notify('availability_request:rejected', data);
      });

      this.socket.on('appointment:slot_activated', (data: any) => {
        this.notify('appointment:slot_activated', data);
      });

      this.socket.on('clinic:schedule_updated', (data: any) => {
        this.notify('clinic:schedule_updated', data);
      });

      this.socket.on('appointment:created', (data: any) => {
        this.notify('appointment:created', data);
      });

      this.socket.on('appointment:cancelled', (data: any) => {
        this.notify('appointment:cancelled', data);
      });

      this.socket.on('appointment:rescheduled', (data: any) => {
        this.notify('appointment:rescheduled', data);
      });

      this.socket.on('demo:reset', (data: any) => {
        this.notify('demo:reset', data);
      });

      this.socket.on('availability_request:cleared', (data: any) => {
        this.notify('availability_request:cleared', data);
      });

      this.socket.on('queue:load_balance_proposal_updated', (data: any) => {
        this.notify('queue:load_balance_proposal_updated', data);
      });

      this.socket.on('disconnect', () => {
        console.log('📡 Disconnected from WebSocket Gateway');
      });
    } catch (err) {
      console.warn('WebSocket connection error:', err);
    }
  }

  identifyPatient(patientId: string): void {
    if (patientId) {
      this.connect(patientId);
    }
  }

  joinAppointment(appointmentId: string): void {
    if (!appointmentId) return;
    this.joinedAppointmentIds.add(appointmentId);
    if (this.socket && this.socket.connected) {
      this.socket.emit('join:appointment', appointmentId);
    }
  }

  subscribe(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  unsubscribe(event: string, callback: (data: any) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private notify(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in socket listener for ${event}:`, e);
        }
      });
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new ClientSocketService();
