/**
 * ═══════════════════════════════════════════════════════════════════
 * Devil's Advocate — Exhaustive Firestore Database Schema
 * ═══════════════════════════════════════════════════════════════════
 * 
 * This file defines the complete NoSQL schema for the Devil's Advocate
 * platform. It uses TypeScript interfaces mirroring Firestore document
 * structures, and exports collection path constants.
 * 
 * Architecture:
 *  - 5 top-level collections: users, debates, global_analytics, toxicity_logs, ai_training_logs
 *  - Distributed counters (10 shards) for the leaderboard to bypass the 1 write/sec limit
 *  - ML metadata fields for K-means clustering and win prediction
 *  - Immutable debate records with nested message arrays containing per-turn sentiment and fallacies
 */

export interface Timestamp {
  seconds: number;
  nanoseconds: number;
}

// ═══════════════════════════════════════════════════════════════════
// COLLECTION 1: users
// ═══════════════════════════════════════════════════════════════════
// Purpose: Long-term profile data + ML clustering results
// Write: On auth, post-debate score aggregation, periodic clustering
// Read:  Profile page, community page, leaderboard
// ═══════════════════════════════════════════════════════════════════

export interface FirestoreUserDocument {
  // ── Identity ──
  uid: string;                          // Firebase Auth UID (document ID)
  displayName: string;                  // Public display name
  email: string;                        // Account email (private)
  photoURL: string;                     // Google avatar or custom
  createdAt: Timestamp;                 // Account creation timestamp
  lastLoginAt: Timestamp;               // Most recent session start

  // ── Aggregate Performance Stats ──
  overallStats: {
    totalDebates: number;               // Lifetime debate count
    averageLogicScore: number;          // Rolling average (0–10)
    averageEvidenceScore: number;       // Rolling average (0–10)
    averagePersuasivenessScore: number; // Rolling average (0–10)
    averageClarityScore: number;        // Rolling average (0–10)
    averageEmotionalToneScore: number;  // Rolling average (0–10)
    winRate: number;                    // Wins / totalDebates (0–1)
    totalPoints: number;               // Cumulative leaderboard points
  };

  // ── ML Clustering Data ──
  behavioralCluster: string;            // K-means label: "Logical Debater", "Emotional Debater", etc.
  clusterVector: number[];              // N-dimensional feature vector for re-clustering
  // Vector components: [avgLogic, avgEmotion, sentimentVolStdDev, avgResponseLatency, fallacyFreq...]

  // ── Fallacy Frequency Profile ──
  fallacyProfile: {                     // Historical count of each fallacy type committed
    strawman: number;
    ad_hominem: number;
    false_dilemma: number;
    slippery_slope: number;
    texas_sharpshooter: number;
    red_herring: number;
    no_true_scotsman: number;
    appeal_to_emotion: number;
    bandwagon: number;
    argument_from_ignorance: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// COLLECTION 2: debates
// ═══════════════════════════════════════════════════════════════════
// Purpose: Immutable ledger of every debate session
// Write: During active debate (messages), post-debate (scores, summary)
// Read:  User history, analytics, admin dashboard
// Security: Read-only after status="completed". Owner-only access.
// ═══════════════════════════════════════════════════════════════════

export interface FirestoreDebateDocument {
  // ── Identity ──
  debateId: string;                     // Auto-generated doc ID
  userId: string;                       // Owner UID (FK → users)
  opponentUserId: string | null;        // Second human in public debate mode

  // ── Configuration ──
  topic: string;                        // Debate subject text
  aiPersona: string;                    // Persona ID: "devils_advocate", "philosopher", etc.
  intensityLevel: string;               // "friendly" | "challenging" | "devil"
  isPublicDebate: boolean;              // Two-human mode flag
  difficultyRating: number;             // Algorithmic topic difficulty score

  // ── Status ──
  status: string;                       // "active" | "completed" | "abandoned"
  startedAt: Timestamp;                 // Debate start timestamp
  endedAt: Timestamp | null;            // Debate end timestamp

  // ── Transcript ──
  messages: FirestoreMessageObject[];   // Ordered message array

  // ── NLP Post-Debate Scoring ──
  finalScores: {
    logic: number;                      // 0–10: Syllogistic integrity
    evidence: number;                   // 0–10: Fact density via NER
    persuasiveness: number;             // 0–10: Ethos/Pathos/Logos command
    clarity: number;                    // 0–10: Flesch-Kincaid normalized
    emotionalTone: number;             // 0–10: Passion without incoherence
  } | null;

  // ── Analytics ──
  sentimentVolatility: number;          // σ² variance of sentiment scores
  winner: string | null;               // "user" | "ai" | "draw"
  winProbabilityFinal: number;         // Terminal prediction (0–1)

  // ── Debate Summary (LLM-generated) ──
  summary: {
    bestUserArgument: string;           // NLP-extracted strongest user point
    bestAiArgument: string;             // NLP-extracted strongest AI point
    conclusion: string;                 // Synthesized overall verdict
  } | null;
}

export interface FirestoreMessageObject {
  sender: string;                       // "user" | "ai" | "moderator"
  content: string;                      // Message text
  timestamp: Timestamp;                 // Send time
  sentiment: string;                    // "anger" | "neutral" | "positive" | "fear" | "optimism"
  sentimentScore: number;               // Continuous score: -1.0 to 1.0
  fallaciesDetected: FirestoreFallacyObject[];  // Detected fallacies in this message
  winProbability: number;               // User win probability snapshot at this turn (0–1)
}

export interface FirestoreFallacyObject {
  type: string;                         // Fallacy taxonomy type ID
  startIndex: number;                   // Character offset start in message content
  endIndex: number;                     // Character offset end in message content
  explanation: string;                  // Human-readable explanation of the detected fallacy
}

// ═══════════════════════════════════════════════════════════════════
// COLLECTION 3: global_analytics
// ═══════════════════════════════════════════════════════════════════
// Purpose: Platform-wide aggregated data for admin/community pages
// 
// Structure:
//   global_analytics/
//     ├── platform_averages          (single doc: aggregated mean scores)
//     ├── top_players                (single doc: cached leaderboard top 100)
//     ├── leaderboard/shards/        (subcollection: distributed counters)
//     │   ├── shard_0
//     │   ├── shard_1
//     │   ├── ...
//     │   └── shard_9
//     └── topics/{topicId}           (subcollection: per-topic analytics)
// ═══════════════════════════════════════════════════════════════════

export interface FirestorePlatformAverages {
  totalDebatesGlobal: number;           // Total platform-wide debates
  averageLogicScore: number;            // Global mean logic score
  averageEvidenceScore: number;         // Global mean evidence score
  averagePersuasivenessScore: number;   // Global mean persuasiveness
  averageClarityScore: number;          // Global mean clarity
  averageSentimentVolatility: number;   // Global mean σ²
  mostPopularPersona: string;           // Most selected persona ID
  lastUpdatedAt: Timestamp;             // Aggregation timestamp
}

export interface FirestoreLeaderboardShard {
  // ── Distributed Counter Shard ──
  // 10 shards (shard_0 through shard_9) to bypass 1 write/sec limit
  // Write: Backend randomly selects a shard → atomic increment
  // Read:  Client sums all shards for total score
  // Aggregation: Cloud Function runs every 15 min → writes to top_players
  count: number;                        // Partial point accumulator
}

export interface FirestoreTopPlayers {
  rankings: Array<{
    uid: string;                        // User ID
    displayName: string;                // Display name
    totalPoints: number;                // Aggregated score
    rank: number;                       // Sorted position (1-indexed)
    winRate: number;                    // Win percentage
    behavioralCluster: string;          // User's cluster label
  }>;
  lastUpdatedAt: Timestamp;             // Cloud Function execution timestamp
}

export interface FirestoreTopicAnalytics {
  topicName: string;                    // Canonical topic string
  totalDebates: number;                 // Volume counter
  avgSentimentVolatility: number;       // Historical σ² for this topic
  avgDebateLength: number;              // Mean message count
  avgDisagreementLevel: number;         // Contention metric (0–10)
  difficultyScore: number;             // Computed D(t) = f(L, V, C)
  lastDebatedAt: Timestamp;            // Most recent debate timestamp (trending)
}

// ═══════════════════════════════════════════════════════════════════
// COLLECTION 4: toxicity_logs
// ═══════════════════════════════════════════════════════════════════
// Purpose: Admin-only abuse monitoring and content moderation records
// Write: Toxicity middleware on blocked messages
// Read:  Admin dashboard only (Firestore rules enforce admin-only)
// ═══════════════════════════════════════════════════════════════════

export interface FirestoreToxicityLog {
  logId: string;                        // Auto-generated document ID
  userId: string;                       // Offending user UID (FK → users)
  attemptedInput: string;               // Blocked message content (full payload)
  flaggedReason: string;                // "hate_speech" | "jailbreak" | "harassment" | "explicit"
  severity: string;                     // "low" | "medium" | "high" | "critical"
  ipAddress: string;                    // Request origin IP
  userAgent: string;                    // Browser/client identification
  debateId: string | null;              // Context: which debate this occurred in
  timestamp: Timestamp;                 // Event timestamp
}

// ═══════════════════════════════════════════════════════════════════
// COLLECTION 5: ai_training_logs
// ═══════════════════════════════════════════════════════════════════
// Purpose: AI Improvement Feedback Loop telemetry
// Write: Post-debate analysis pipeline
// Read:  Engineering team for reinforcement-style prompt optimization
// ═══════════════════════════════════════════════════════════════════

export interface FirestoreAiTrainingLog {
  logId: string;                        // Auto-generated document ID
  debateId: string;                     // Source debate (FK → debates)
  aiPersona: string;                    // Persona ID used
  aiArgument: string;                   // Specific AI argument text
  userResponse: string;                 // User's response to this argument
  outcome: string;                      // "won" | "lost" | "neutral"
  userEngagementDuration: number;       // Seconds the user spent responding
  userAbandonedAfter: boolean;          // Did this argument cause abandonment?
  systemPromptVersion: string;          // Prompt iteration identifier
  intensityLevel: string;              // Intensity setting during this exchange
  timestamp: Timestamp;                 // Log timestamp
}

// ═══════════════════════════════════════════════════════════════════
// COLLECTION PATH CONSTANTS
// ═══════════════════════════════════════════════════════════════════

export const COLLECTIONS = {
  USERS: 'users',
  DEBATES: 'debates',
  GLOBAL_ANALYTICS: 'global_analytics',
  TOXICITY_LOGS: 'toxicity_logs',
  AI_TRAINING_LOGS: 'ai_training_logs',
} as const;

export const SUBCOLLECTIONS = {
  LEADERBOARD_SHARDS: 'leaderboard_shards',
  TOPICS: 'topics',
} as const;

export const DOCUMENTS = {
  PLATFORM_AVERAGES: 'platform_averages',
  TOP_PLAYERS: 'top_players',
} as const;

// Number of distributed counter shards for leaderboard writes
export const LEADERBOARD_SHARD_COUNT = 10;

// Generate shard document IDs
export const getShardIds = (): string[] =>
  Array.from({ length: LEADERBOARD_SHARD_COUNT }, (_, i) => `shard_${i}`);

// Select a random shard for atomic increment (write distribution)
export const getRandomShardId = (): string =>
  `shard_${Math.floor(Math.random() * LEADERBOARD_SHARD_COUNT)}`;
