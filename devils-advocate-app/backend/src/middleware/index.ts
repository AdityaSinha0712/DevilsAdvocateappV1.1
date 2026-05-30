/**
 * ═══════════════════════════════════════════════════════════════════
 * Devil's Advocate Backend — Middleware Stack
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Express middleware for authentication, rate limiting, toxicity
 * detection, and request logging.
 */

import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authAdmin, firebaseInitialized, logToxicity } from '../services/firebaseService.js';
import { checkToxicity } from '../services/geminiService.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════
// Auth Middleware — Firebase JWT Verification
// ═══════════════════════════════════════════════════════════════════

export interface AuthenticatedRequest extends Request {
  uid?: string;
  userEmail?: string;
}

export const verifyFirebaseToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Skip auth when Firebase is not configured (dev mode)
  if (!firebaseInitialized || !authAdmin) {
    req.uid = 'dev-user';
    req.userEmail = 'dev@localhost';
    logger.debug('Auth skipped — Firebase not configured (dev mode)');
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    req.uid = 'anonymous';
    next();
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await authAdmin.verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    req.userEmail = decodedToken.email;
    next();
  } catch (error) {
    logger.warn('Firebase auth verification failed', { error });
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token.',
      code: 'AUTH_INVALID',
    });
  }
};

// ═══════════════════════════════════════════════════════════════════
// Rate Limiting — Per-user message limit & debate creation limit
// ═══════════════════════════════════════════════════════════════════

/**
 * 10 messages per minute per IP (configurable via env).
 */
export const messageRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MESSAGES_PER_MIN || '10', 10),
  keyGenerator: (req: AuthenticatedRequest) => req.uid || req.ip || 'anonymous',
  message: {
    error: 'Rate limit exceeded',
    message: 'You are sending messages too quickly. Please slow down.',
    code: 'RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 50 debates per day per IP.
 */
export const debateCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: parseInt(process.env.RATE_LIMIT_DEBATES_PER_DAY || '50', 10),
  keyGenerator: (req: AuthenticatedRequest) => req.uid || req.ip || 'anonymous',
  message: {
    error: 'Daily limit reached',
    message: 'You have reached the maximum number of debates for today.',
    code: 'DAILY_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ═══════════════════════════════════════════════════════════════════
// Toxicity Detection Middleware
// ═══════════════════════════════════════════════════════════════════

export const toxicityFilter = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const message = req.body?.message;
  if (!message || typeof message !== 'string') {
    next();
    return;
  }

  try {
    const toxicityResult = await checkToxicity(message);

    if (toxicityResult.isToxic) {
      logger.warn('Toxic content detected', {
        uid: req.uid,
        reason: toxicityResult.reason,
        snippet: message.substring(0, 100),
      });

      // Log to Firestore for admin review
      await logToxicity({
        userId: req.uid || 'anonymous',
        debateId: req.body?.debateId || '',
        flaggedInput: message,
        reason: toxicityResult.reason || 'unknown',
        ip: req.ip || '',
        userAgent: req.get('User-Agent') || '',
      });

      res.status(403).json({
        error: 'Content filtered',
        message: "Your message was flagged for potentially harmful content. Let's keep the debate respectful and productive.",
        code: 'TOXICITY_DETECTED',
        reason: toxicityResult.reason,
      });
      return;
    }

    next();
  } catch (error) {
    // If toxicity check fails, allow through (fail open for UX)
    logger.error('Toxicity check failed', { error });
    next();
  }
};

// ═══════════════════════════════════════════════════════════════════
// Request Logger
// ═══════════════════════════════════════════════════════════════════

export const requestLogger = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
  });
  next();
};
