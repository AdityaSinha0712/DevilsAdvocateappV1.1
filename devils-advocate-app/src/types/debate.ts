// ─── Persona Types ───
export type PersonaId =
  | 'devils_advocate'
  | 'philosopher'
  | 'scientist'
  | 'politician'
  | 'lawyer'
  | 'skeptic'
  | 'historian'
  | 'comedian';

export interface Persona {
  id: PersonaId;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

// ─── Intensity Types ───
export type IntensityLevel = 'friendly' | 'challenging' | 'devil';

export interface IntensityConfig {
  level: IntensityLevel;
  label: string;
  emoji: string;
  color: string;
  temperature: number;
  topP: number;
  promptSuffix: string;
}

// ─── Sentiment Types ───
export type SentimentLabel = 'anger' | 'neutral' | 'positive' | 'fear' | 'optimism';

export interface SentimentData {
  label: SentimentLabel;
  score: number;
  color: string;
  emoji: string;
}

// ─── Fallacy Types ───
export type FallacyType =
  | 'strawman'
  | 'ad_hominem'
  | 'false_dilemma'
  | 'slippery_slope'
  | 'texas_sharpshooter'
  | 'red_herring'
  | 'no_true_scotsman'
  | 'appeal_to_emotion'
  | 'bandwagon'
  | 'argument_from_ignorance';

export interface FallacyDetection {
  type: FallacyType;
  startIndex: number;
  endIndex: number;
  explanation: string;
}

// ─── Message Types ───
export interface DebateMessage {
  id: string;
  sender: 'user' | 'ai' | 'moderator';
  content: string;
  timestamp: Date;
  sentiment: SentimentData;
  fallaciesDetected: FallacyDetection[];
  winProbability: number;
  uid?: string;
  displayName?: string;
}

// ─── Score Types ───
export interface DebateScores {
  logic: number;
  evidence: number;
  persuasiveness: number;
  clarity: number;
  emotionalTone: number;
}

// ─── Debate Summary ───
export interface DebateSummary {
  bestUserArgument: string;
  bestAiArgument: string;
  conclusion: string;
}

// ─── Full Debate Record ───
export interface Debate {
  debateId: string;
  userId: string;
  topic: string;
  aiPersona: PersonaId;
  intensityLevel: IntensityLevel;
  isPublicDebate: boolean;
  opponentUserId: string | null;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: Date;
  endedAt: Date | null;
  messages: DebateMessage[];
  finalScores: DebateScores | null;
  sentimentVolatility: number;
  winner: 'user' | 'ai' | 'draw' | null;
  difficultyRating: number;
  summary: DebateSummary | null;
  winProbabilityFinal: number;
}
