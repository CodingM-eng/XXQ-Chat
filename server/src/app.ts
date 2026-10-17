import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { initDb, isWhitelistModeEnabled, dataStore } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { usersRouter } from './routes/users.js';
import { conversationsRouter } from './routes/conversations.js';
import { driveRouter } from './routes/drive.js';
import { telegramRouter } from './routes/telegram.js';
import { searchRouter } from './routes/search.js';
import { supportRouter } from './routes/support.js';
import { serversRouter } from './routes/servers.js';
import { invitationsRouter } from './routes/invitations.js';
import { isAllowedOrigin } from './utils/cors.js';

// Asynchronously initialize database
initDb().catch((err) => {
  console.error('Database initialization error on startup:', err);
});

export const app = express();

// Trust proxy for Render / cloud reverse proxies
app.set('trust proxy', 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Managed by reverse proxy or client if needed
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: (requestOrigin, callback) => {
      callback(null, isAllowedOrigin(requestOrigin));
    },
    credentials: true,
  })
);

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // max 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded, please try again shortly.' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // max 30 auth requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_AUTH_REQUESTS', message: 'Too many authentication attempts.' },
});

app.use('/api/', globalLimiter);
app.use('/api/auth/', authLimiter);

// Body parsing with safe size limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Non-sensitive structured request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (config.NODE_ENV !== 'test') {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Health check endpoints for Render and monitoring
app.get(['/health', '/healthz'], async (req: Request, res: Response) => {
  try {
    const isHealthy = await dataStore.checkHealth();
    const whitelistActive = await isWhitelistModeEnabled();

    res.json({
      status: 'ok',
      service: 'xxq-chat-server',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.NODE_ENV,
      database: isHealthy ? 'connected' : 'error',
      storageDriver: dataStore.driverName,
      whitelistActive,
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/servers', serversRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/drive', driveRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/search', searchRouter);
app.use('/api/support', supportRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[SERVER ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: config.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : err.message,
  });
});
