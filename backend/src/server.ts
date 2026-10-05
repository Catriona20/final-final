import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { initDatabase, getDbStatus } from './database/db';
import { seedDatabase } from './database/seed';
import { initSocketService } from './services/socketService';

import { authRouter } from './routes/auth.routes';
import { patientRouter } from './routes/patient.routes';
import { clinicRouter } from './routes/clinic.routes';
import { doctorRouter } from './routes/doctor.routes';
import { appointmentRouter } from './routes/appointment.routes';
import { recordsRouter } from './routes/records.routes';
import { notificationRouter } from './routes/notification.routes';
import { announcementRouter } from './routes/announcement.routes';
import { simulationRouter } from './routes/simulation.routes';
import { assistantRouter } from './routes/assistant.routes';
import { aiRouter } from './routes/ai.routes';
import { locationRouter } from './routes/location.routes';
import { queueRouter } from './routes/queue.routes';
import { walkInRouter } from './routes/walkin.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { pharmacyRouter } from './routes/pharmacy.routes';
import { availabilityRouter } from './routes/availability.routes';
import { loadBalancerRouter } from './routes/loadBalancer.routes';

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.IO Real-Time Gateway
initSocketService(server);

import { nlpService } from './services/nlpService';
import { pharmacySecurityClient } from './services/pharmacySecurityClient';

// Standard API Root Health Endpoints
app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'MedLink Healthcare API',
    status: 'running',
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

app.get('/api/health', async (_req, res) => {
  const [nlpHealth, pharmacyHealth] = await Promise.all([
    nlpService.checkHealth(),
    pharmacySecurityClient.checkHealth(),
  ]);

  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: getDbStatus(),
    version: '1.0.0',
    services: {
      backend: { status: 'online', port: config.port },
      nlp_forecasting_service: {
        status: nlpHealth.online ? 'healthy' : 'offline',
        endpoint: config.nlpServiceUrl,
        ready: nlpHealth.ready,
      },
      nlpService: {
        status: nlpHealth.online ? 'healthy' : 'offline',
        endpoint: config.nlpServiceUrl,
        ready: nlpHealth.ready,
      },
      pharmacy_security_service: {
        status: pharmacyHealth.online ? 'healthy' : 'offline',
        endpoint: config.pharmacySecurityServiceUrl,
      },
      pharmacyService: {
        status: pharmacyHealth.online ? 'healthy' : 'offline',
        endpoint: config.pharmacySecurityServiceUrl,
      },
    },
  });
});


// Mounted API Routes
app.use('/api/auth', authRouter);
app.use('/api/patient', patientRouter);
app.use('/api/clinics', clinicRouter);
app.use('/api/location', locationRouter);
app.use('/api/doctors', doctorRouter);
app.use('/api/appointments', appointmentRouter);
app.use('/api/queue', queueRouter);
app.use('/api/walk-ins', walkInRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/records', recordsRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/announcements', announcementRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/ai', aiRouter);
app.use('/api/pharmacy', pharmacyRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/load-balancer', loadBalancerRouter);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// Server Lifecycle & Startup
export const startServer = async () => {
  await initDatabase();
  await seedDatabase();

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n⚠️  Port ${config.port} is already in use.`);
      console.error(`   Another backend instance or process is currently active on http://localhost:${config.port}.`);
      console.error(`   If another backend daemon is running, it will continue serving requests.`);
      console.error(`   To restart, please terminate the existing process or set a custom PORT in .env.\n`);
      process.exit(1);
    } else {
      console.error('Server startup error:', err);
      process.exit(1);
    }
  });

  server.listen(config.port, () => {
    console.log(`🚀 Healthcare API Backend running on http://localhost:${config.port}`);
    console.log(`📡 WebSocket / Socket.IO live on ws://localhost:${config.port}`);
  });
};

if (require.main === module) {
  startServer();
}

export { app, server };
