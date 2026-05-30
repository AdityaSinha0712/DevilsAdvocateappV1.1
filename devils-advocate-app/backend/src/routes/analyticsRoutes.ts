import express from 'express';
import { 
  aggregateLeaderboard, 
  getTrendingTopics, 
  getGlobalStats 
} from '../services/firebaseService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/leaderboard', async (_req, res) => {
  try {
    const leaderboard = await aggregateLeaderboard();
    res.json({ success: true, data: leaderboard });
  } catch (error) {
    logger.error('Failed to fetch leaderboard', { error });
    res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
  }
});

router.get('/trending-topics', async (_req, res) => {
  try {
    const topics = await getTrendingTopics();
    res.json({ success: true, data: topics });
  } catch (error) {
    logger.error('Failed to fetch trending topics', { error });
    res.status(500).json({ success: false, message: 'Failed to fetch trending topics' });
  }
});

router.get('/global-stats', async (_req, res) => {
  try {
    const stats = await getGlobalStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Failed to fetch global stats', { error });
    res.status(500).json({ success: false, message: 'Failed to fetch global stats' });
  }
});

export default router;
