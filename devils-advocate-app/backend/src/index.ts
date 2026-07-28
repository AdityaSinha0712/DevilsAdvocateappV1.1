/**
 * ═══════════════════════════════════════════════════════════════════
 * Devil's Advocate Backend — Express Server Entry Point
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import debateRoutes from './routes/debateRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import { verifyFirebaseToken, requestLogger } from './middleware/index.js';
import { logger } from './utils/logger.js';

declare global {
  namespace Express {
    interface Request {
      uid?: string;
      userEmail?: string;
    }
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// ─── Global Middleware ───────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'https://devilsadvocateapp.vercel.app'],
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(morgan('short'));
app.use(requestLogger);

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: "Devil's Advocate Backend",
  });
});

// ─── Protected Routes ────────────────────────────────────────────
app.post('/api/users/sync', verifyFirebaseToken, async (req, res) => {
  try {
    const { displayName, email, photoURL } = req.body;
    if (req.uid && req.uid !== 'anonymous') {
      const { upsertUser } = await import('./services/firebaseService.js');
      await upsertUser(req.uid, {
        displayName: displayName || 'Anonymous Debater',
        email: email || req.userEmail || '',
        photoURL: photoURL || null
      });
      res.json({ success: true, message: 'User synced successfully.' });
    } else {
      res.status(401).json({ success: false, message: 'Unauthorized sync attempt.' });
    }
  } catch (error) {
    logger.error('Failed to sync user', { error });
    res.status(500).json({ success: false, message: 'Failed to sync user data.' });
  }
});

// All /api/debate/* routes require Firebase auth
app.use('/api/debate', verifyFirebaseToken, debateRoutes);

// Analytics routes (public reading, no token required to view leaderboard)
app.use('/api/analytics', analyticsRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' });
});

// ─── Global Error Handler ────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error.'
      : err.message,
  });
});

// ─── Start Server (skip in Vercel serverless) ───────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(`🔥 Devil's Advocate Backend listening on port ${PORT}`);
    logger.info(`📡 CORS origin: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
