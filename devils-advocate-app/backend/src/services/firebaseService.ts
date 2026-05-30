import admin from 'firebase-admin';
import { logger } from '../utils/logger.js';

// ─── Initialize Firebase Admin (optional — server works without it) ─
let firebaseInitialized = false;

try {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_PROJECT_ID !== 'your_project_id' &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_CLIENT_EMAIL !== 'your_service_account_email'
  ) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
    firebaseInitialized = true;
    logger.info('✅ Firebase Admin SDK initialized');
  } else {
    logger.warn('⚠️  Firebase credentials not configured — Firestore operations will be skipped');
  }
} catch (error) {
  logger.warn('⚠️  Firebase initialization failed — running without Firestore', { error });
}

const db: any = firebaseInitialized ? admin.firestore() : null;
const authAdmin: any = firebaseInitialized ? admin.auth() : null;

export { db, authAdmin, firebaseInitialized };

// ─── Collection References ───────────────────────────────────────
export const COLLECTIONS = {
  USERS: 'users',
  DEBATES: 'debates',
  GLOBAL_ANALYTICS: 'global_analytics',
  TOXICITY_LOGS: 'toxicity_logs',
  AI_TRAINING_LOGS: 'ai_training_logs',
} as const;

// ═══════════════════════════════════════════════════════════════════
// Debate CRUD Operations (no-ops when Firebase is offline)
// ═══════════════════════════════════════════════════════════════════

export async function createDebate(data: {
  userId: string;
  topic: string;
  aiPersona: string;
  intensityLevel: string;
  isPublicDebate: boolean;
  hostDisplayName?: string;
}): Promise<string> {
  if (!db) return `local_${Date.now()}`;

  // Look up host display name if not provided
  let hostName = data.hostDisplayName || 'Anonymous';
  if (!data.hostDisplayName && data.userId && data.userId !== 'anonymous') {
    try {
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(data.userId).get();
      if (userDoc.exists) hostName = userDoc.data()?.displayName || 'Anonymous';
    } catch (_) { /* use default */ }
  }

  const docRef = await db.collection(COLLECTIONS.DEBATES).add({
    ...data,
    status: data.isPublicDebate ? 'waiting' : 'active',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    endedAt: null,
    messages: [],
    finalScores: null,
    sentimentVolatility: 0,
    winner: null,
    difficultyRating: 0,
    summary: null,
    winProbabilityFinal: 0.5,
    opponentUserId: null,
    // ─── Multiplayer turn tracking ───
    currentTurnUid: data.isPublicDebate ? data.userId : null,
    players: data.isPublicDebate ? {
      [data.userId]: { displayName: hostName, role: 'host' },
    } : null,
  });
  return docRef.id;
}

export async function findWaitingPublicDebate(topic?: string, persona?: string): Promise<any | null> {
  if (!db) return null;

  // Try to find an exact match first
  if (topic && persona) {
    const exactMatch = await db.collection(COLLECTIONS.DEBATES)
      .where('status', '==', 'waiting')
      .where('isPublicDebate', '==', true)
      .where('topic', '==', topic)
      .where('aiPersona', '==', persona)
      .limit(1)
      .get();
    
    if (!exactMatch.empty) {
      const doc = exactMatch.docs[0];
      return { id: doc.id, ...doc.data() };
    }
  }

  // Fallback to any waiting lobby
  const anyMatch = await db.collection(COLLECTIONS.DEBATES)
    .where('status', '==', 'waiting')
    .where('isPublicDebate', '==', true)
    .limit(1)
    .get();

  if (!anyMatch.empty) {
    const doc = anyMatch.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  return null;
}

export async function getAllWaitingPublicDebates(): Promise<any[]> {
  if (!db) return [];

  // Avoid .orderBy() — it requires a composite Firestore index.
  // Filter first, then sort in JS.
  const snapshot = await db.collection(COLLECTIONS.DEBATES)
    .where('status', '==', 'waiting')
    .where('isPublicDebate', '==', true)
    .limit(50)
    .get();

  const debates = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    let hostName = 'Anonymous';
    let hostRating = 0;

    if (data.userId && data.userId !== 'anonymous') {
      try {
        const userDoc = await db!.collection(COLLECTIONS.USERS).doc(data.userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          hostName = userData?.displayName || 'Anonymous';
          hostRating = userData?.stats?.totalPoints || 0;
        }
      } catch (e) {
        // User doc lookup failed, use defaults
      }
    }

    const startedAt = data.startedAt?.toDate ? data.startedAt.toDate().toISOString() : (data.startedAt || new Date().toISOString());

    debates.push({
      id: doc.id,
      topic: data.topic,
      aiPersona: data.aiPersona || 'devils_advocate',
      intensityLevel: data.intensityLevel || 'challenging',
      startedAt,
      hostName,
      hostRating,
    });
  }

  // Sort newest first in JS
  debates.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return debates;
}

export async function joinPublicDebate(debateId: string, opponentId: string): Promise<void> {
  if (!db) return;

  // Look up the joiner's display name
  let joinerName = 'Anonymous';
  if (opponentId && opponentId !== 'anonymous') {
    try {
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(opponentId).get();
      if (userDoc.exists) joinerName = userDoc.data()?.displayName || 'Anonymous';
    } catch (_) { /* use default */ }
  }

  // Get the debate to find the host UID for setting the initial turn
  const debateDoc = await db.collection(COLLECTIONS.DEBATES).doc(debateId).get();
  const hostUid = debateDoc.exists ? debateDoc.data()?.userId : null;

  await db.collection(COLLECTIONS.DEBATES).doc(debateId).update({
    status: 'active',
    opponentUserId: opponentId,
    // Host goes first — set initial turn to host
    currentTurnUid: hostUid || opponentId,
    [`players.${opponentId}`]: { displayName: joinerName, role: 'challenger' },
  });
}

export async function appendMessage(debateId: string, message: {
  sender: 'user' | 'ai' | 'moderator';
  content: string;
  sentiment: { label: string; score: number };
  fallaciesDetected: Array<{
    type: string;
    startIndex: number;
    endIndex: number;
    explanation: string;
  }>;
  winProbability: number;
  uid?: string;
  displayName?: string;
}): Promise<void> {
  if (!db) return;

  const messageWithTimestamp = {
    ...message,
    timestamp: new Date().toISOString(),
  };

  await db.collection(COLLECTIONS.DEBATES).doc(debateId).update({
    messages: admin.firestore.FieldValue.arrayUnion(messageWithTimestamp),
  });
}

/**
 * Toggle the currentTurnUid to the other player after a message is sent.
 */
export async function toggleTurn(debateId: string, senderUid: string): Promise<void> {
  if (!db) return;

  const debateDoc = await db.collection(COLLECTIONS.DEBATES).doc(debateId).get();
  if (!debateDoc.exists) return;

  const data = debateDoc.data();
  if (!data?.players || !data?.isPublicDebate) return;

  // Find the other player's UID
  const playerUids = Object.keys(data.players);
  const nextUid = playerUids.find(uid => uid !== senderUid) || senderUid;

  await db.collection(COLLECTIONS.DEBATES).doc(debateId).update({
    currentTurnUid: nextUid,
  });
}

export async function endDebate(debateId: string, data: {
  finalScores: {
    logic: number;
    evidence: number;
    persuasiveness: number;
    clarity: number;
    emotionalTone: number;
  };
  winner: string;
  sentimentVolatility: number;
  difficultyRating: number;
  summary: {
    bestUserArgument: string;
    bestAiArgument: string;
    conclusion: string;
  };
  winProbabilityFinal: number;
}): Promise<void> {
  if (!db) return;

  await db.collection(COLLECTIONS.DEBATES).doc(debateId).update({
    ...data,
    status: 'completed',
    endedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function getDebate(debateId: string) {
  if (!db) return { id: debateId, topic: '', status: 'active' };

  const doc = await db.collection(COLLECTIONS.DEBATES).doc(debateId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function getUserDebates(userId: string, limit = 20) {
  if (!db) return [];

  const snapshot = await db.collection(COLLECTIONS.DEBATES)
    .where('userId', '==', userId)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
}

// ═══════════════════════════════════════════════════════════════════
// User Operations
// ═══════════════════════════════════════════════════════════════════

export async function upsertUser(uid: string, data: {
  displayName: string;
  email: string;
  photoURL: string | null;
}): Promise<void> {
  if (!db) return;

  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    await userRef.set({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      stats: {
        totalDebates: 0, wins: 0, losses: 0, draws: 0,
        avgScoreLogic: 0, avgScoreEvidence: 0, avgScorePersuasiveness: 0, totalPoints: 0,
      },
      fallacyFrequency: {},
      mlCluster: { vector: [], clusterId: '' },
    });
  } else {
    await userRef.update({
      displayName: data.displayName, email: data.email, photoURL: data.photoURL,
    });
  }
}

export async function updateUserStats(uid: string, debateResult: {
  winner: string;
  scores: { logic: number; evidence: number; persuasiveness: number; clarity?: number; emotionalTone?: number };
  fallacies: string[];
}): Promise<void> {
  if (!db) return;

  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  
  // Read current stats to compute running averages
  const userDoc = await userRef.get();
  const currentStats = userDoc.exists ? (userDoc.data()?.stats || {}) : {};
  const prevTotal = currentStats.totalDebates || 0;
  const newTotal = prevTotal + 1;

  // Compute running averages for scores
  const runningAvg = (prev: number, newVal: number) =>
    prevTotal > 0 ? (prev * prevTotal + newVal) / newTotal : newVal;

  const updates: Record<string, FirebaseFirestore.FieldValue | number> = {
    'stats.totalDebates': admin.firestore.FieldValue.increment(1),
    'stats.avgScoreLogic': runningAvg(currentStats.avgScoreLogic || 0, debateResult.scores.logic),
    'stats.avgScoreEvidence': runningAvg(currentStats.avgScoreEvidence || 0, debateResult.scores.evidence),
    'stats.avgScorePersuasiveness': runningAvg(currentStats.avgScorePersuasiveness || 0, debateResult.scores.persuasiveness),
    'stats.avgScoreClarity': runningAvg(currentStats.avgScoreClarity || 0, debateResult.scores.clarity || 0),
    'stats.avgScoreEmotionalTone': runningAvg(currentStats.avgScoreEmotionalTone || 0, debateResult.scores.emotionalTone || 0),
  };

  if (debateResult.winner === 'user') {
    updates['stats.wins'] = admin.firestore.FieldValue.increment(1);
    updates['stats.totalPoints'] = admin.firestore.FieldValue.increment(10);
  } else if (debateResult.winner === 'ai') {
    updates['stats.losses'] = admin.firestore.FieldValue.increment(1);
    updates['stats.totalPoints'] = admin.firestore.FieldValue.increment(3);
  } else {
    updates['stats.draws'] = admin.firestore.FieldValue.increment(1);
    updates['stats.totalPoints'] = admin.firestore.FieldValue.increment(5);
  }

  for (const fallacy of debateResult.fallacies) {
    updates[`fallacyFrequency.${fallacy}`] = admin.firestore.FieldValue.increment(1);
  }

  await userRef.update(updates);
}

// ═══════════════════════════════════════════════════════════════════
// Toxicity Logging
// ═══════════════════════════════════════════════════════════════════

export async function logToxicity(data: {
  userId: string;
  debateId: string;
  flaggedInput: string;
  reason: string;
  ip: string;
  userAgent: string;
}): Promise<void> {
  if (!db) { logger.warn('Toxicity log skipped (no Firestore)', data); return; }

  await db.collection(COLLECTIONS.TOXICITY_LOGS).add({
    ...data,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    reviewed: false,
    actionTaken: null,
  });
}

// ═══════════════════════════════════════════════════════════════════
// Analytics Helpers
// ═══════════════════════════════════════════════════════════════════

const NUM_SHARDS = 10;

export async function incrementLeaderboardShard(uid: string, points: number): Promise<void> {
  if (!db) return;

  const shardId = Math.floor(Math.random() * NUM_SHARDS);
  const shardRef = db.collection(COLLECTIONS.GLOBAL_ANALYTICS)
    .doc('leaderboard_shards')
    .collection('shards')
    .doc(`shard_${shardId}`);

  await shardRef.set(
    { [`players.${uid}`]: admin.firestore.FieldValue.increment(points) },
    { merge: true }
  );
}

export async function aggregateLeaderboard(): Promise<Array<{ uid: string; displayName: string; photoURL: string | null; totalPoints: number }>> {
  if (!db) return [];

  // Try shard-based aggregation first
  try {
    const shardsSnapshot = await db.collection(COLLECTIONS.GLOBAL_ANALYTICS)
      .doc('leaderboard_shards')
      .collection('shards')
      .get();

    if (!shardsSnapshot.empty) {
      const totals: Record<string, number> = {};

      for (const shard of shardsSnapshot.docs) {
        const players = shard.data().players || {};
        for (const [uid, points] of Object.entries(players)) {
          totals[uid] = (totals[uid] || 0) + (points as number);
        }
      }

      if (Object.keys(totals).length > 0) {
        const sortedUids = Object.entries(totals)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 100);

        const finalLeaderboard = [];
        for (const [uid, totalPoints] of sortedUids) {
          const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
          if (userDoc.exists) {
            const data = userDoc.data();
            finalLeaderboard.push({
              uid,
              displayName: data.displayName || 'Anonymous',
              photoURL: data.photoURL || null,
              totalPoints: totalPoints as number
            });
          } else {
            finalLeaderboard.push({ uid, displayName: 'Anonymous', photoURL: null, totalPoints: totalPoints as number });
          }
        }
        return finalLeaderboard;
      }
    }
  } catch (err) {
    logger.warn('Shard-based leaderboard failed, falling back to users collection', { err });
  }

  // Fallback: read directly from users collection (always works)
  logger.info('Building leaderboard from users collection (shard fallback)');
  const usersSnap = await db.collection(COLLECTIONS.USERS)
    .limit(200)
    .get();

  const leaderboard: Array<{ uid: string; displayName: string; photoURL: string | null; totalPoints: number }> = [];

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const totalPoints = data.stats?.totalPoints || 0;
    if (totalPoints > 0) {
      leaderboard.push({
        uid: userDoc.id,
        displayName: data.displayName || 'Anonymous',
        photoURL: data.photoURL || null,
        totalPoints,
      });
    }
  }

  leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
  return leaderboard.slice(0, 100);
}

export async function getTrendingTopics(): Promise<Array<{ text: string, value: number }>> {
  if (!db) return [];

  // Query last 75 debates for topics
  const snapshot = await db.collection(COLLECTIONS.DEBATES)
    .orderBy('startedAt', 'desc')
    .limit(75)
    .get();

  const counts: Record<string, number> = {};
  const stopWords = new Set(['the', 'a', 'in', 'on', 'of', 'and', 'is', 'to', 'for', 'with', 'about', 'that', 'should', 'be', 'are', 'it', 'if', 'we', 'how', 'why', 'what']);
  
  snapshot.docs.forEach((doc: any) => {
    const topic = doc.data().topic as string;
    if (!topic) return;
    
    // Simple tokenization
    const words = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    words.forEach(word => {
      if (word.length > 3 && !stopWords.has(word)) {
        counts[word] = (counts[word] || 0) + 1;
      }
    });
  });

  return Object.entries(counts)
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 30);
}

export async function getGlobalStats() {
  if (!db) return { totalDebates: 0, totalUsers: 0, avgLogic: 0, avgPersuasiveness: 0 };

  try {
    // Get user count and per-user stats
    const usersSnap = await db.collection(COLLECTIONS.USERS).limit(200).get();
    
    let totalDebates = 0;
    let totalLogic = 0;
    let totalPersuasiveness = 0;
    let scoredUserCount = 0;

    usersSnap.docs.forEach((doc: any) => {
      const stats = doc.data().stats;
      if (stats) {
        totalDebates += (stats.totalDebates || 0);
        // Read the running averages we now store
        if (stats.avgScoreLogic > 0 || stats.avgScorePersuasiveness > 0) {
          totalLogic += (stats.avgScoreLogic || 0);
          totalPersuasiveness += (stats.avgScorePersuasiveness || 0);
          scoredUserCount++;
        }
      }
    });

    // If no user-level averages yet, compute from recent completed debates
    if (scoredUserCount === 0) {
      try {
        const debatesSnap = await db.collection(COLLECTIONS.DEBATES)
          .where('status', '==', 'completed')
          .limit(50)
          .get();

        let debateLogicSum = 0;
        let debatePersuasivenessSum = 0;
        let debateScoredCount = 0;

        debatesSnap.docs.forEach((doc: any) => {
          const data = doc.data();
          if (data.finalScores) {
            debateLogicSum += (data.finalScores.logic || 0);
            debatePersuasivenessSum += (data.finalScores.persuasiveness || 0);
            debateScoredCount++;
          }
        });

        if (debateScoredCount > 0) {
          totalLogic = debateLogicSum / debateScoredCount;
          totalPersuasiveness = debatePersuasivenessSum / debateScoredCount;
          scoredUserCount = 1; // flag to avoid division by zero
        }

        // Also get a more accurate total debate count
        if (totalDebates === 0) {
          totalDebates = debatesSnap.docs.length;
        }
      } catch (debateErr) {
        logger.warn('Failed to compute stats from debates collection', { debateErr });
      }
    }

    return {
      totalDebates,
      totalUsers: usersSnap.docs.length,
      avgLogic: scoredUserCount ? totalLogic / scoredUserCount : 0,
      avgPersuasiveness: scoredUserCount ? totalPersuasiveness / scoredUserCount : 0
    };
  } catch (error) {
    logger.error('Failed to get global stats', { error });
    return { totalDebates: 0, totalUsers: 0, avgLogic: 0, avgPersuasiveness: 0 };
  }
}
