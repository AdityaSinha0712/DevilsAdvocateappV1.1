/**
 * ═══════════════════════════════════════════════════════════════════
 * Devil's Advocate — Frontend API Client
 * ═══════════════════════════════════════════════════════════════════
 * 
 * All HTTP requests to the backend Node.js server. This module
 * replaces mock data with real API calls.
 * 
 * The backend owns all Gemini API keys and Firebase Admin SDK.
 * The frontend NEVER initializes LLM SDKs directly.
 */

import type { PersonaId, IntensityLevel, SentimentLabel, FallacyType } from '../types/debate';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// ─── Auth Token Management ──────────────────────────────────────
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
};

// ─── API Error Handling ─────────────────────────────────────────
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string = 'UNKNOWN') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Unknown error' }));

    if (response.status === 403 && errorBody.code === 'TOXICITY_DETECTED') {
      throw new ApiError(
        errorBody.message || "Let's keep the debate respectful.",
        403,
        'TOXICITY_DETECTED'
      );
    }

    if (response.status === 429) {
      throw new ApiError(
        errorBody.message || 'Rate limit exceeded. Please slow down.',
        429,
        'RATE_LIMITED'
      );
    }

    throw new ApiError(
      errorBody.message || `Request failed: ${response.statusText}`,
      response.status,
      errorBody.code
    );
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════
// API Response Types
// ═══════════════════════════════════════════════════════════════════

export interface GenerateTopicResponse {
  topic: string;
  difficultyRating: number;
}

export interface StartDebateResponse {
  debateId: string;
  aiOpeningMessage: string;
  aiSentiment: SentimentLabel;
  aiSentimentScore: number;
  joinedExisting?: boolean;
}

export interface SendMessageResponse {
  aiResponse: string;
  aiSentiment: SentimentLabel;
  aiSentimentScore: number;
  userFallacies: Array<{
    type: FallacyType;
    startIndex: number;
    endIndex: number;
    explanation: string;
  }>;
  winProbability: number;
  userSentiment: SentimentLabel;
  userSentimentScore: number;
}

export interface EndDebateResponse {
  finalScores: {
    logic: number;
    evidence: number;
    persuasiveness: number;
    clarity: number;
    emotionalTone: number;
  };
  winner: 'user' | 'ai' | 'draw';
  sentimentVolatility: number;
  summary: {
    bestUserArgument: string;
    bestAiArgument: string;
    conclusion: string;
  };
}

// ═══════════════════════════════════════════════════════════════════
// API Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/debate/generate-topic
 * Generates a controversial debate topic using Gemini.
 */
export async function generateTopic(
  intensity: IntensityLevel,
  persona: PersonaId
): Promise<GenerateTopicResponse> {
  return apiRequest<GenerateTopicResponse>('/debate/generate-topic', {
    method: 'POST',
    body: JSON.stringify({ intensity, persona }),
  });
}

/**
 * POST /api/users/sync
 * Syncs Firebase user data to the backend database upon successful login.
 */
export async function syncUserToBackend(params: {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>('/users/sync', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * POST /api/debate/start
 * Creates a new debate session and gets the AI's opening statement.
 */
export async function startDebate(params: {
  topic: string;
  persona: PersonaId;
  intensity: IntensityLevel;
  isPublicDebate: boolean;
  joinDebateId?: string;
}): Promise<StartDebateResponse> {
  return apiRequest<StartDebateResponse>('/debate/start', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * POST /api/debate/message
 * Sends a user message and gets the AI's counter-argument,
 * along with NLP analysis (sentiment, fallacies, win prediction).
 */
export async function sendDebateMessage(params: {
  debateId: string;
  message: string;
  persona: PersonaId;
  intensity: IntensityLevel;
}): Promise<SendMessageResponse> {
  return apiRequest<SendMessageResponse>('/debate/message', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * POST /api/debate/end
 * Ends a debate session, triggers the NLP scoring pipeline,
 * and returns the final scores + summary.
 */
export async function endDebate(debateId: string): Promise<EndDebateResponse> {
  return apiRequest<EndDebateResponse>('/debate/end', {
    method: 'POST',
    body: JSON.stringify({ debateId }),
  });
}

/**
 * GET /api/debate/history
 * Fetches the user's debate history.
 */
export async function getDebateHistory(): Promise<Array<{
  debateId: string;
  topic: string;
  aiPersona: string;
  winner: string;
  startedAt: string;
  finalScores: Record<string, number> | null;
}>> {
  return apiRequest('/debate/history');
}

/**
 * GET /api/debate/:id
 * Fetches a single debate.
 */
export async function getDebate(debateId: string): Promise<any> {
  return apiRequest(`/debate/${debateId}`);
}

/**
 * GET /api/analytics/leaderboard
 * Fetches the cached global leaderboard (top 100 players).
 */
export async function getLeaderboard(): Promise<Array<{
  uid: string;
  displayName: string;
  totalPoints: number;
  rank: number;
  winRate: number;
}>> {
  return apiRequest('/analytics/leaderboard');
}

/**
 * GET /api/analytics/trending-topics
 * Fetches trending debate topics by volume.
 */
export async function getTrendingTopics(): Promise<Array<{
  topicName: string;
  totalDebates: number;
  difficultyScore: number;
}>> {
  return apiRequest('/analytics/trending-topics');
}
