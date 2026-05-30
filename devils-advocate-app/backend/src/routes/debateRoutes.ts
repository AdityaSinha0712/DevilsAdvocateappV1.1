/**
 * ═══════════════════════════════════════════════════════════════════
 * Devil's Advocate Backend — Debate Routes
 * ═══════════════════════════════════════════════════════════════════
 * 
 * All /api/debate/* endpoints.
 */

import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/index.js';
import {
  messageRateLimiter,
  debateCreationLimiter,
  toxicityFilter,
} from '../middleware/index.js';
import {
  generateDebateTopic,
  generateOpeningStatement,
  generateCombinedResponse,
  generatePostDebateAnalysis,
} from '../services/geminiService.js';
import {
  createDebate,
  appendMessage,
  getDebate,
  endDebate as endDebateInDb,
  getUserDebates,
  updateUserStats,
  incrementLeaderboardShard,
  findWaitingPublicDebate,
  getAllWaitingPublicDebates,
  joinPublicDebate,
  toggleTurn,
} from '../services/firebaseService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// In-memory conversation history for active debates
// (In production, use Redis or Firestore subcollections)
const activeConversations = new Map<string, Array<{
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}>>();

// Message stats tracker for win prediction
const debateStats = new Map<string, {
  userMessageCount: number;
  aiMessageCount: number;
  userTotalLength: number;
  fallacyCount: number;
}>();

// ═══════════════════════════════════════════════════════════════════
// POST /api/debate/generate-topic
// ═══════════════════════════════════════════════════════════════════
router.post('/generate-topic', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { intensity = 'challenging', persona = 'devils_advocate' } = req.body;
    const result = await generateDebateTopic({ intensity, persona });
    res.json(result);
  } catch (error) {
    logger.error('Topic generation failed', { error });
    res.status(500).json({ message: 'Failed to generate topic.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/debate/public-lobbies
// ═══════════════════════════════════════════════════════════════════
router.get('/public-lobbies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const lobbies = await getAllWaitingPublicDebates();
    res.json(lobbies);
  } catch (error) {
    logger.error('Failed to fetch public lobbies', { error });
    res.status(500).json({ message: 'Failed to fetch public lobbies.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/debate/start
// ═══════════════════════════════════════════════════════════════════
router.post('/start', debateCreationLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { topic, persona, intensity, isPublicDebate, joinDebateId } = req.body;

    // Explicit Join
    if (joinDebateId) {
      await joinPublicDebate(joinDebateId, req.uid || 'anonymous');
      
      const debate = await getDebate(joinDebateId);
      if (!debate) {
        res.status(404).json({ message: 'Debate not found' });
        return;
      }
      
      // Ensure activeConversation is synced if it is dropped from memory
      if (!activeConversations.has(joinDebateId)) {
        const transcript = (debate.messages || []).map((m: any) => ({
           role: m.sender === 'user' ? 'user' : 'model',
           parts: [{ text: m.content }]
        }));
        activeConversations.set(joinDebateId, transcript);
        
        debateStats.set(joinDebateId, {
           userMessageCount: (debate.messages || []).filter((m: any) => m.sender === 'user').length,
           aiMessageCount: (debate.messages || []).filter((m: any) => m.sender === 'ai').length,
           userTotalLength: 0,
           fallacyCount: 0,
        });
      }
      
      logger.info(`Joined public debate: ${joinDebateId}`, { uid: req.uid });
      res.json({
        debateId: joinDebateId,
        joinedExisting: true,
        aiOpeningMessage: null,
        aiSentiment: null,
        aiSentimentScore: null,
      });
      return;
    }

    if (!topic) {
      res.status(400).json({ message: 'Missing required field: topic.' });
      return;
    }

    // For public debates, persona and intensity are irrelevant (AI is silent)
    const effectivePersona = isPublicDebate ? 'devils_advocate' : persona;
    const effectiveIntensity = isPublicDebate ? 'challenging' : intensity;

    if (!isPublicDebate && (!persona || !intensity)) {
      res.status(400).json({ message: 'Missing required fields: persona, intensity.' });
      return;
    }

    // Create debate record in Firestore
    const debateId = await createDebate({
      userId: req.uid || 'anonymous',
      topic,
      aiPersona: effectivePersona,
      intensityLevel: effectiveIntensity,
      isPublicDebate: isPublicDebate || false,
    });

    if (isPublicDebate) {
      // Public debates: no AI opening, just create a waiting room
      activeConversations.set(debateId, []);
      debateStats.set(debateId, {
        userMessageCount: 0,
        aiMessageCount: 0,
        userTotalLength: 0,
        fallacyCount: 0,
      });

      logger.info(`Public lobby created: ${debateId}`, { uid: req.uid, topic });
      res.json({
        debateId,
        aiOpeningMessage: '',
        aiSentiment: 'neutral',
        aiSentimentScore: 0,
      });
      return;
    }

    // Private (AI) debates: generate AI opening statement
    const aiOpeningMessage = await generateOpeningStatement({ topic, persona: effectivePersona, intensity: effectiveIntensity });

    // Default sentiment for AI's own opening (no extra API call needed)
    const defaultSentiment = { label: 'neutral' as const, score: 0.0 };

    // Save AI opening to Firestore
    await appendMessage(debateId, {
      sender: 'ai',
      content: aiOpeningMessage,
      sentiment: defaultSentiment,
      fallaciesDetected: [],
      winProbability: 0.5,
    });

    // Initialize conversation history
    activeConversations.set(debateId, [
      { role: 'model', parts: [{ text: aiOpeningMessage }] },
    ]);

    // Initialize stats tracker
    debateStats.set(debateId, {
      userMessageCount: 0,
      aiMessageCount: 1,
      userTotalLength: 0,
      fallacyCount: 0,
    });

    logger.info(`Debate started: ${debateId}`, { uid: req.uid, topic, persona: effectivePersona, intensity: effectiveIntensity });

    res.json({
      debateId,
      aiOpeningMessage,
      aiSentiment: defaultSentiment.label,
      aiSentimentScore: defaultSentiment.score,
    });
  } catch (error) {
    logger.error('Debate start failed', { error });
    res.status(500).json({ message: 'Failed to start debate.', err: (error as Error).message, stack: (error as Error).stack });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/debate/message
// ═══════════════════════════════════════════════════════════════════
router.post('/message', messageRateLimiter, toxicityFilter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { debateId, message, persona, intensity } = req.body;

    if (!debateId || !message || !persona || !intensity) {
      res.status(400).json({ message: 'Missing required fields.' });
      return;
    }

    // Basic Prompt Abuse Prevention
    if (message.length > 2000) {
      res.status(400).json({ message: 'Message is too long. Please keep arguments under 2000 characters.' });
      return;
    }

    const injectionPatterns = [
      /ignore (all )?previous instructions/i,
      /you are now/i,
      /system prompt/i,
      /act as a/i
    ];

    if (injectionPatterns.some(pattern => pattern.test(message))) {
      logger.warn('Prompt injection attempt detected', { uid: req.uid, message });
      res.status(403).json({ message: 'Message rejected due to suspected prompt injection.' });
      return;
    }

    const debate = await getDebate(debateId);
    if (!debate) {
      res.status(404).json({ message: 'Debate not found.' });
      return;
    }

    // Get conversation history — rebuild from Firestore if in-memory is lost (server restart)
    let history = activeConversations.get(debateId) || [];
    let stats = debateStats.get(debateId) || {
      userMessageCount: 0,
      aiMessageCount: 0,
      userTotalLength: 0,
      fallacyCount: 0,
    };

    if (history.length === 0 && debate.messages && Array.isArray(debate.messages) && debate.messages.length > 0) {
      logger.info(`Rebuilding in-memory history from Firestore for debate: ${debateId}`);
      history = debate.messages.map((m: any) => ({
        role: m.sender === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }],
      }));
      activeConversations.set(debateId, history);

      // Rebuild stats too
      const userMsgs = debate.messages.filter((m: any) => m.sender === 'user');
      const aiMsgs = debate.messages.filter((m: any) => m.sender === 'ai');
      stats = {
        userMessageCount: userMsgs.length,
        aiMessageCount: aiMsgs.length,
        userTotalLength: userMsgs.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0),
        fallacyCount: debate.messages.reduce((sum: number, m: any) => sum + (m.fallaciesDetected?.length || 0), 0),
      };
      debateStats.set(debateId, stats);
    }

    const isPublicDebate = (debate as any).isPublicDebate === true;

    // ─── Turn Validation (public debates only) ─────────────────
    if (isPublicDebate) {
      const currentTurnUid = (debate as any).currentTurnUid;
      if (currentTurnUid && req.uid && currentTurnUid !== req.uid) {
        res.status(403).json({ message: "It's not your turn. Wait for your opponent." });
        return;
      }
    }

    // Look up sender's display name for the message
    let senderDisplayName = 'Anonymous';
    if (req.uid && req.uid !== 'anonymous') {
      try {
        const players = (debate as any).players;
        if (players && players[req.uid]) {
          senderDisplayName = players[req.uid].displayName || 'Anonymous';
        }
      } catch (_) { /* use default */ }
    }

    // ─── SINGLE combined Gemini call ─────────────────────────
    // Instead of 5 separate API calls, we ask Gemini to return
    // the rebuttal + sentiment + fallacies + win prediction
    // all in one structured JSON response. This cuts quota 5x.
    const combined = await generateCombinedResponse({
      topic: (debate as Record<string, unknown>).topic as string,
      persona,
      intensity,
      conversationHistory: history,
      userMessage: message,
      userStats: {
        userMessageCount: stats.userMessageCount + 1,
        aiMessageCount: stats.aiMessageCount,
        userAvgLength: (stats.userTotalLength + message.length) / (stats.userMessageCount + 1),
        fallacyCount: stats.fallacyCount,
      },
      isPublicDebate,
    });

    // Update history
    history.push({ role: 'user', parts: [{ text: message }] });
    history.push({ role: 'model', parts: [{ text: combined.rebuttal || '[Observer acknowledged]' }] });
    activeConversations.set(debateId, history);

    // Update stats
    stats.userMessageCount += 1;
    stats.aiMessageCount += 1;
    stats.userTotalLength += message.length;
    stats.fallacyCount += combined.userFallacies.length;
    debateStats.set(debateId, stats);

    // Standardize winProbability to always represent the Host's win probability in Firestore
    let winProbabilityToStore = combined.winProbability;
    if (isPublicDebate && req.uid && (debate as any).userId) {
      const isHost = req.uid === (debate as any).userId;
      if (!isHost) {
        winProbabilityToStore = 1 - combined.winProbability;
      }
    }

    // ─── Save messages to Firestore SEQUENTIALLY ─────────────────
    // User message must be appended first so arrayUnion ordering is correct.
    // Using Promise.all caused a race where AI could land before user.
    await appendMessage(debateId, {
      sender: 'user',
      content: message,
      sentiment: { label: combined.userSentiment.label, score: combined.userSentiment.score },
      fallaciesDetected: combined.userFallacies,
      winProbability: winProbabilityToStore,
      uid: req.uid, // Track which user sent this
      displayName: senderDisplayName,
    });

    if (!isPublicDebate) {
      // In private debates, the AI actually replies.
      await appendMessage(debateId, {
        sender: 'ai',
        content: combined.rebuttal,
        sentiment: { label: combined.aiSentiment.label, score: combined.aiSentiment.score },
        fallaciesDetected: [],
        winProbability: winProbabilityToStore,
      });
    }

    // ─── Toggle turn for public debates ─────────────────────────
    if (isPublicDebate && req.uid) {
      await toggleTurn(debateId, req.uid);
    }

    res.json({
      aiResponse: combined.rebuttal,
      aiSentiment: combined.aiSentiment.label,
      aiSentimentScore: combined.aiSentiment.score,
      userFallacies: combined.userFallacies,
      winProbability: winProbabilityToStore,
      userSentiment: combined.userSentiment.label,
      userSentimentScore: combined.userSentiment.score,
    });
  } catch (error) {
    logger.error('Message processing failed', { error });
    res.status(500).json({ message: 'Failed to process message.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/debate/end
// ═══════════════════════════════════════════════════════════════════
router.post('/end', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { debateId } = req.body;

    if (!debateId) {
      res.status(400).json({ message: 'Missing debateId.' });
      return;
    }

    const history = activeConversations.get(debateId) || [];
    const stats = debateStats.get(debateId);
    const debate = await getDebate(debateId); // Fetch the debate

    const isPublicDebate = (debate as any).isPublicDebate === true;
    const hostUid = debate?.userId;
    const challengerUid = debate?.opponentUserId;

    // Build transcripts for analysis
    let analysis: any;
    let hostAnalysis: any;
    let challengerAnalysis: any;

    if (isPublicDebate && hostUid && challengerUid) {
      let hostTranscript: Array<{ sender: string; content: string }> = [];
      let challengerTranscript: Array<{ sender: string; content: string }> = [];

      if (debate?.messages && Array.isArray(debate.messages) && debate.messages.length > 0) {
        hostTranscript = debate.messages.map((m: any) => ({
          sender: m.uid === hostUid ? 'user' : 'ai',
          content: m.content,
        }));
        challengerTranscript = debate.messages.map((m: any) => ({
          sender: m.uid === challengerUid ? 'user' : 'ai',
          content: m.content,
        }));
      }

      logger.info(`Generating evaluations for both players in public debate: ${debateId}`);
      [hostAnalysis, challengerAnalysis] = await Promise.all([
        generatePostDebateAnalysis(hostTranscript),
        generatePostDebateAnalysis(challengerTranscript),
      ]);

      // Map to analysis format representing host as "user" and challenger as "ai"
      analysis = {
        scores: hostAnalysis.scores, // Host scores go to root finalScores for fallback
        winner: hostAnalysis.winner === 'user' ? 'host' : hostAnalysis.winner === 'ai' ? 'challenger' : 'draw',
        summary: {
          bestUserArgument: hostAnalysis.summary.bestUserArgument, // Host's best
          bestAiArgument: challengerAnalysis.summary.bestUserArgument, // Challenger's best
          conclusion: hostAnalysis.summary.conclusion,
        }
      };
    } else {
      // Build transcript for singleplayer
      let transcript: Array<{ sender: string; content: string }>;
      if (history.length > 0) {
        transcript = history.map(m => ({
          sender: m.role === 'user' ? 'user' : 'ai',
          content: m.parts[0].text,
        }));
      } else if (debate?.messages && Array.isArray(debate.messages) && debate.messages.length > 0) {
        logger.info(`Rebuilding transcript from Firestore for debate: ${debateId}`);
        transcript = debate.messages.map((m: any) => ({
          sender: m.sender === 'user' ? 'user' : 'ai',
          content: m.content,
        }));
      } else {
        transcript = [];
      }

      analysis = await generatePostDebateAnalysis(transcript);
    }

    // Calculate sentiment volatility from stored messages
    let sentimentVolatility = 0.3;
    if (debate?.messages && Array.isArray(debate.messages) && debate.messages.length > 1) {
      const scores = debate.messages
        .map((m: any) => m.sentiment?.score ?? 0)
        .filter((s: number) => s !== 0);
      if (scores.length > 1) {
        const mean = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum: number, s: number) => sum + (s - mean) ** 2, 0) / scores.length;
        sentimentVolatility = Math.min(1, Math.sqrt(variance));
      }
    }

    // Get final win probability from last message
    let lastWinProb = 0.5;
    if (debate?.messages && Array.isArray(debate.messages) && debate.messages.length > 0) {
      const lastMsg = debate.messages[debate.messages.length - 1];
      if (lastMsg?.winProbability !== undefined) {
        lastWinProb = lastMsg.winProbability;
      }
    }

    // Calculate difficulty rating
    let difficultyRating = 5;
    if (debate && debate.intensityLevel) {
      const base = debate.intensityLevel === 'devil' ? 9 : debate.intensityLevel === 'challenging' ? 6 : 3;
      difficultyRating = Math.min(10, Math.max(1, base + (sentimentVolatility * 2)));
    }

    // Save to Firestore
    const endData: any = {
      finalScores: analysis.scores,
      winner: analysis.winner,
      sentimentVolatility,
      difficultyRating,
      summary: analysis.summary,
      winProbabilityFinal: lastWinProb,
    };

    if (isPublicDebate && hostUid && challengerUid) {
      endData[`players.${hostUid}.scores`] = hostAnalysis.scores;
      endData[`players.${challengerUid}.scores`] = challengerAnalysis.scores;
    }

    await endDebateInDb(debateId, endData);

    // Update user stats
    if (isPublicDebate && hostUid && challengerUid) {
      const hostWinnerStatus = hostAnalysis.winner; // 'user', 'ai', or 'draw'
      const challengerWinnerStatus = challengerAnalysis.winner; // 'user', 'ai', or 'draw'

      await Promise.all([
        // Host Stats
        updateUserStats(hostUid, {
          winner: hostWinnerStatus,
          scores: hostAnalysis.scores,
          fallacies: [],
        }),
        incrementLeaderboardShard(
          hostUid,
          hostWinnerStatus === 'user' ? 10 : hostWinnerStatus === 'draw' ? 5 : 3
        ),
        // Challenger Stats
        updateUserStats(challengerUid, {
          winner: challengerWinnerStatus,
          scores: challengerAnalysis.scores,
          fallacies: [],
        }),
        incrementLeaderboardShard(
          challengerUid,
          challengerWinnerStatus === 'user' ? 10 : challengerWinnerStatus === 'draw' ? 5 : 3
        ),
      ]);
    } else if (req.uid) {
      const userFallacies = stats
        ? Array.from({ length: stats.fallacyCount }, () => 'unknown')
        : [];

      await Promise.all([
        updateUserStats(req.uid, {
          winner: analysis.winner,
          scores: analysis.scores,
          fallacies: userFallacies,
        }),
        incrementLeaderboardShard(
          req.uid,
          analysis.winner === 'user' ? 10 : analysis.winner === 'draw' ? 5 : 3
        ),
      ]);
    }

    // Cleanup in-memory state
    activeConversations.delete(debateId);
    debateStats.delete(debateId);

    logger.info(`Debate ended: ${debateId}`, { winner: analysis.winner });

    res.json({
      finalScores: analysis.scores,
      winner: analysis.winner,
      sentimentVolatility,
      summary: analysis.summary,
    });
  } catch (error) {
    logger.error('End debate failed', { error });
    res.status(500).json({ message: 'Failed to end debate.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/debate/history
// ═══════════════════════════════════════════════════════════════════
router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.uid) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const debates = await getUserDebates(req.uid);
    res.json(debates.map((d: any) => ({
      ...d,
      debateId: d.id,
      startedAt: d.startedAt?.toDate ? d.startedAt.toDate().toISOString() : d.startedAt,
      endedAt: d.endedAt?.toDate ? d.endedAt.toDate().toISOString() : d.endedAt,
    })));
  } catch (error) {
    logger.error('Fetch history failed', { error });
    res.status(500).json({ message: 'Failed to fetch debate history.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/debate/:id
// ═══════════════════════════════════════════════════════════════════
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const debate = await getDebate(req.params.id as string);
    if (!debate) {
      res.status(404).json({ message: 'Debate not found' });
      return;
    }
    
    // Convert Timestamps, if any
    res.json({
      ...debate,
      debateId: debate.id,
      startedAt: debate.startedAt?.toDate ? debate.startedAt.toDate().toISOString() : debate.startedAt,
      endedAt: debate.endedAt?.toDate ? debate.endedAt.toDate().toISOString() : debate.endedAt,
    });
  } catch (error) {
    logger.error('Fetch single debate failed', { error });
    res.status(500).json({ message: 'Failed to fetch debate.' });
  }
});

export default router;
