import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { resolveCanonicalClinicId, resolveCanonicalDoctorId } from '../database/models';
import { memoryDb } from '../database/db';

let io: SocketIOServer | null = null;

export const initSocketService = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected to WebSocket [ID: ${socket.id}]`);

    // Join patient personal room for direct updates
    socket.on('join:patient', (patientId: string) => {
      if (patientId) {
        const targetSet = new Set<string>();
        targetSet.add(patientId);

        if (memoryDb.patients?.getAliases) {
          const aliasMap = memoryDb.patients.getAliases();
          const canonical = aliasMap.get(patientId.toLowerCase()) || patientId;
          targetSet.add(canonical);
          for (const [alias, canId] of aliasMap.entries()) {
            if (canId === canonical || canId === patientId) {
              targetSet.add(alias);
            }
          }
        }

        for (const id of targetSet) {
          socket.join(`patient:${id}`);
        }
        console.log(`👤 Socket ${socket.id} joined rooms: ${Array.from(targetSet).map((id) => `patient:${id}`).join(', ')}`);
      }
    });

    // Join appointment live queue room
    socket.on('join:appointment', (appointmentId: string) => {
      if (appointmentId) {
        socket.join(`appointment:${appointmentId}`);
        console.log(`🏥 Socket ${socket.id} joined appointment room: appointment:${appointmentId}`);
      }
    });

    // Join doctor personal room for clinical queue updates
    socket.on('join:doctor', (doctorId: string) => {
      if (doctorId) {
        socket.join(`doctor:${doctorId}`);
        const canon = resolveCanonicalDoctorId(doctorId);
        if (canon && canon !== doctorId) {
          socket.join(`doctor:${canon}`);
        }
        console.log(`🩺 Socket ${socket.id} joined doctor room: doctor:${doctorId} (canon: ${canon})`);
      }
    });

    // Join clinic room for multi-doctor OPD tracking
    socket.on('join:clinic', (clinicId: string) => {
      if (clinicId) {
        socket.join(`clinic:${clinicId}`);
        const canon = resolveCanonicalClinicId(clinicId);
        if (canon && canon !== clinicId) {
          socket.join(`clinic:${canon}`);
        }
        console.log(`🏥 Socket ${socket.id} joined clinic room: clinic:${clinicId} (canon: ${canon})`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected [ID: ${socket.id}]`);
    });
  });

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.IO is not initialized!');
  }
  return io;
};

export const emitToPatient = (patientId: string, event: string, data: any): void => {
  if (io && patientId) {
    const targetSet = new Set<string>();
    targetSet.add(patientId);

    if (memoryDb.patients?.getAliases) {
      const aliasMap = memoryDb.patients.getAliases();
      const canonical = aliasMap.get(patientId.toLowerCase()) || patientId;
      targetSet.add(canonical);
      for (const [alias, canId] of aliasMap.entries()) {
        if (canId === canonical || canId === patientId) {
          targetSet.add(alias);
        }
      }
    }

    for (const id of targetSet) {
      io.to(`patient:${id}`).emit(event, data);
    }
  }
};

export const emitToDoctor = (doctorId: string, event: string, data: any): void => {
  if (io) {
    io.to(`doctor:${doctorId}`).emit(event, data);
    const canon = resolveCanonicalDoctorId(doctorId);
    if (canon && canon !== doctorId) {
      io.to(`doctor:${canon}`).emit(event, data);
    }
  }
};

export const emitToClinic = (clinicId: string, event: string, data: any): void => {
  if (io) {
    io.to(`clinic:${clinicId}`).emit(event, data);
    const canon = resolveCanonicalClinicId(clinicId);
    if (canon && canon !== clinicId) {
      io.to(`clinic:${canon}`).emit(event, data);
    }
  }
};

export const emitToAppointment = (appointmentId: string, event: string, data: any): void => {
  if (io) {
    io.to(`appointment:${appointmentId}`).emit(event, data);
  }
};

export const emitBroadcast = (event: string, data: any): void => {
  if (io) {
    io.emit(event, data);
  }
};

