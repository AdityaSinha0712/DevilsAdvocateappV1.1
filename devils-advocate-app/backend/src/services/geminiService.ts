/**
 * ═══════════════════════════════════════════════════════════════════
 * Devil's Advocate Backend — Gemini AI Service
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Orchestrates all interactions with the Google Gemini API.
 * Handles persona prompt injection, intensity-based parameter tuning,
 * fallacy detection, sentiment analysis, and NLP scoring.
 */

import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import { logger } from '../utils/logger.js';

// ─── Initialize Gemini Client ────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function extractJson(text: string): any {
  // Step 1: Strip markdown code fences
  let clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // Step 2: Replace smart/curly quotes with standard quotes
  // Gemini 2.5 often uses \u201c \u201d \u2018 \u2019 inside JSON strings
  clean = clean
    .replace(/[\u201c\u201d\u201e\u201f\u2033\u2036]/g, '"')  // curly double quotes → "
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035]/g, "'");  // curly single quotes → '

  // Step 3: Try to extract and parse the JSON object/array
  const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  const candidate = match ? match[0] : clean;

  try {
    return JSON.parse(candidate);
  } catch (_firstErr) {
    // Step 4: Attempt repairs on common malformed JSON issues
    let repaired = candidate
      // Remove trailing commas before } or ]
      .replace(/,\s*([}\]])/g, '$1')
      // Fix unescaped newlines inside string values
      .replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, '\\n');

    // If JSON is truncated (missing closing brackets), try to close it
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/]/g) || []).length;

    // Close any unclosed arrays then objects
    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';

    // If it ends abruptly mid-string, try to close the string
    if (repaired.match(/:\s*"[^"]*$/)) {
      repaired += '"}';
    }

    try {
      return JSON.parse(repaired);
    } catch (_secondErr) {
      // Step 5: Last resort — try to extract the rebuttal text manually
      const rebuttalMatch = candidate.match(/"rebuttal"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/);
      if (rebuttalMatch) {
        return {
          rebuttal: rebuttalMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
          aiSentiment: { label: 'neutral', score: 0.0 },
          userSentiment: { label: 'neutral', score: 0.0 },
          userFallacies: [],
          winProbability: 0.5,
        };
      }
      // Re-throw if nothing worked
      throw _secondErr;
    }
  }
}

// ─── Retry Helper with Exponential Backoff ───────────────────────
// Free-tier Gemini frequently returns 429 (rate limit) or 503.
// Retry up to 3 times with increasing delays.
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message || '';
      const isRetryable = msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('overloaded');
      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn(`${label}: retryable error (attempt ${attempt + 1}/${maxRetries}), waiting ${delay}ms`, { err: msg });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError!;
}

// ─── Persona System Prompts ──────────────────────────────────────
const PERSONA_PROMPTS: Record<string, string> = {
  devils_advocate: `You are the Devil's Advocate. Your sole purpose is to be inherently critical of the user's arguments. Actively seek out implicit biases in their statements. Highlight fundamental weaknesses in their premise regardless of moral consensus. Challenge every assumption. Never agree easily. Force the user to defend their position rigorously.`,
  philosopher: `You are The Philosopher. Engage exclusively in Socratic dialogue. Generate deep, sequential interrogations that force the user to define their foundational axioms and confront epistemological limits. Never provide direct answers—only questions that expose the gaps in the user's reasoning.`,
  scientist: `You are The Scientist. Apply the scientific method strictly to every argument. Automatically reject anecdotal evidence. Demand empirical data, peer-reviewed citations, statistical significance, and falsifiable hypotheses.`,
  politician: `You are The Politician. Prioritize persuasive rhetoric and emotional appeals (Pathos). Utilize subtle subject pivots to dominate the narrative flow. Appeal to an invisible audience. Your goal is to WIN the debate in the court of public opinion.`,
  lawyer: `You are The Lawyer. Focus exclusively on logical deconstruction, the burden of proof, and evidentiary standards. Parse user statements for internal contradictions. Cross-examine the user relentlessly.`,
  skeptic: `You are The Skeptic. Assume the null hypothesis for every user claim. Demand overwhelming proof for any positive assertion. Focus relentlessly on the probability of alternative explanations.`,
  historian: `You are The Historian. Contextualize every argument within historical precedents. Counter user arguments by citing historical events, treaties, sociological shifts, and the long-term consequences of similar policies.`,
  comedian: `You are The Comedian. Utilize reductio ad absurdum as your primary weapon. Expose logical flaws by escalating the user's premise to its most absurd, satirical conclusion. Rely on wit, irony, and humor to dismantle arguments.`,
};

// ─── Intensity Configurations ────────────────────────────────────
const INTENSITY_CONFIGS: Record<string, { temperature: number; topP: number; suffix: string }> = {
  friendly: {
    temperature: 0.3,
    topP: 0.8,
    suffix: 'Be conversational and approachable. Acknowledge good points. Offer gentle counter-perspectives. Maintain a friendly, educational tone.',
  },
  challenging: {
    temperature: 0.7,
    topP: 0.9,
    suffix: 'Be firm but fair. Challenge weak arguments directly. Do not let logical inconsistencies slide. Push the user to strengthen their reasoning.',
  },
  devil: {
    temperature: 1.0,
    topP: 0.95,
    suffix: 'Do not concede any points. Utilize relentless counter-questioning. Maximize argument complexity and rebuttal frequency. Exploit every logical gap ruthlessly.',
  },
};

// ═══════════════════════════════════════════════════════════════════
// Core Generation Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a single combined response (rebuttal + sentiment + fallacies + win prediction).
 * This replaces multiple parallel API calls to Google Gemini to save quota and prevent rate limits.
 */
export async function generateCombinedResponse(params: {
  topic: string;
  persona: string;
  intensity: string;
  conversationHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  userMessage: string;
  userStats: {
    userMessageCount: number;
    aiMessageCount: number;
    userAvgLength: number;
    fallacyCount: number;
  };
  isPublicDebate?: boolean;
}) {
  const { topic, persona, intensity, conversationHistory, userMessage, userStats, isPublicDebate } = params;
  const personaPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.devils_advocate;
  const intensityConfig = INTENSITY_CONFIGS[intensity] || INTENSITY_CONFIGS.challenging;

  let systemInstruction = '';
  if (isPublicDebate) {
    systemInstruction = `You are a silent AI observer analyzing a live debate between two humans. The debate topic is: "${topic}"\n\nYour persona lens: ${personaPrompt}\n\nRules:\n- You are observing User 1 and User 2 arguing.\n- DO NOT generate a rebuttal or comment.\n- Return an empty string for "rebuttal".\n- Only analyze the argument for fallacies, text sentiment, and win probabilities.\n- Do not break the JSON format.\n\nYou must return a valid JSON object with this exact structure:\n{\n  "rebuttal": "",\n  "aiSentiment": { "label": "neutral", "score": 0.0 },\n  "userSentiment": { "label": "<anger|neutral|positive|fear|optimism>", "score": 0.0 },\n  "userFallacies": [ { "type": "<strawman|ad_hominem|...", "startIndex": 0, "endIndex": 0, "explanation": "Why" } ],\n  "winProbability": 0.5\n}`;
  } else {
    systemInstruction = `${personaPrompt}\n\nDebate Topic: "${topic}"\n\nIntensity Directive: ${intensityConfig.suffix}\n\nRules:\n- Stay in character at all times.\n- Respond only to the debate topic.\n- Keep responses under 200 words for pacing.\n- Do not break the fourth wall or acknowledge you are an AI.\n\nYou must return a valid JSON object with this exact structure:\n{\n  "rebuttal": "Your counter-argument text",\n  "aiSentiment": { "label": "<anger|neutral|positive|fear|optimism>", "score": 0.0 },\n  "userSentiment": { "label": "<anger|neutral|positive|fear|optimism>", "score": 0.0 },\n  "userFallacies": [ { "type": "<strawman|ad_hominem|...", "startIndex": 0, "endIndex": 0, "explanation": "Why" } ],\n  "winProbability": 0.5\n}`;
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    systemInstruction,
    generationConfig: {
      temperature: intensityConfig.temperature,
      topP: intensityConfig.topP,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    } as GenerationConfig,
  });

  try {
    // Gemini's startChat requires the first history entry to have role 'user'.
    // Our conversation starts with the AI opening (role 'model'), so we need
    // to fix the history before passing it to startChat.
    let chatHistory = [...conversationHistory];
    if (chatHistory.length > 0 && chatHistory[0].role === 'model') {
      // Prepend a synthetic user message so Gemini accepts the history
      chatHistory = [
        { role: 'user' as const, parts: [{ text: `The debate topic is: "${topic}". Begin.` }] },
        ...chatHistory,
      ];
    }

    const promptText = `User Message: "${userMessage}"\n\nContext for Win Probability:\nUser Message Count: ${userStats.userMessageCount}, Avg Length: ${userStats.userAvgLength}, Previous Fallacies: ${userStats.fallacyCount}\n\nAnalyze the message, determine any fallacies, calculate overall win probability, and provide your rebuttal in JSON format.`;
    
    const result = await withRetry(async () => {
      const chat = model.startChat({ history: chatHistory });
      return chat.sendMessage(promptText);
    }, 'generateCombinedResponse');
    const rawText = result.response.text();
    const parsed = extractJson(rawText);
    
    return {
      rebuttal: isPublicDebate ? (parsed.rebuttal || '') : (parsed.rebuttal || `[MOCK AI REPLY] I strongly disagree with your assertion on "${topic}".`),
      aiSentiment: parsed.aiSentiment || { label: 'neutral', score: 0.0 },
      userSentiment: parsed.userSentiment || { label: 'neutral', score: 0.0 },
      userFallacies: Array.isArray(parsed.userFallacies) ? parsed.userFallacies : [],
      winProbability: typeof parsed.winProbability === 'number' ? parsed.winProbability : 0.5,
    };
  } catch (err) {
    const error = err as Error;
    logger.warn('Gemini generateCombinedResponse failed, returning fallback', { 
      err: error.message,
      historyLength: conversationHistory.length,
      firstRole: conversationHistory[0]?.role,
    });
    return {
      rebuttal: `[MOCK AI REPLY] Due to API limits, I cannot fully analyze your argument at this moment. However, I still disagree.`,
      aiSentiment: { label: 'neutral', score: 0.0 },
      userSentiment: { label: 'neutral', score: 0.0 },
      userFallacies: [],
      winProbability: 0.5,
    };
  }
}

/**
 * Generate the AI's opening statement for a debate.
 */
export async function generateOpeningStatement(params: {
  topic: string;
  persona: string;
  intensity: string;
}): Promise<string> {
  const { topic, persona, intensity } = params;
  const personaPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.devils_advocate;
  const intensityConfig = INTENSITY_CONFIGS[intensity] || INTENSITY_CONFIGS.challenging;

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    systemInstruction: `${personaPrompt}\n\nIntensity: ${intensityConfig.suffix}`,
    generationConfig: {
      temperature: intensityConfig.temperature,
      topP: intensityConfig.topP,
      maxOutputTokens: 2048,
    } as GenerationConfig,
  });

  try {
    const result = await withRetry(
      () => model.generateContent(
        `The debate topic is: "${topic}". Introduce yourself briefly in character and challenge the user to make their opening argument. Keep it under 100 words.`
      ),
      'generateOpeningStatement',
    );
    return result.response.text();
  } catch (err) {
    logger.warn('Gemini API failed in generateOpeningStatement returning mock fallback', { err: (err as Error).message });
    return `[MOCK] Assuming the persona of ${persona}, I challenge your stance on "${topic}". Defend your position!`;
  }
}

/**
 * Generate a controversial debate topic.
 */
export async function generateDebateTopic(params: {
  intensity: string;
  persona: string;
}): Promise<{ topic: string; difficultyRating: number }> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    } as GenerationConfig,
  });

  try {
    const result = await withRetry(
      () => model.generateContent(
        `Generate a single controversial, thought-provoking debate topic suitable for a ${params.intensity} intensity debate. The AI persona is "${params.persona}". Return JSON: { "topic": "the topic text", "difficultyRating": <number 1-10> }`
      ),
      'generateDebateTopic',
    );
    return extractJson(result.response.text());
  } catch (err) {
    logger.warn('Gemini generateDebateTopic failed', { err: (err as Error).message });
    return { topic: 'Should artificial intelligence be regulated by governments?', difficultyRating: 7.5 };
  }
}

/**
 * Analyze sentiment of a message.
 */
export async function analyzeSentiment(text: string): Promise<{
  label: string;
  score: number;
}> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    } as GenerationConfig,
  });

  try {
    const result = await model.generateContent(
      `Analyze the emotional sentiment of this debate message. Return JSON: { "label": "<anger|neutral|positive|fear|optimism>", "score": <float -1.0 to 1.0> }\n\nMessage: "${text}"`
    );
    return extractJson(result.response.text());
  } catch (err) {
    logger.warn('Gemini analyzeSentiment failed', { err: (err as Error).message });
    return { label: 'neutral', score: 0.0 };
  }
}

/**
 * Detect logical fallacies in a message.
 */
export async function detectFallacies(text: string, conversationContext: string): Promise<Array<{
  type: string;
  startIndex: number;
  endIndex: number;
  explanation: string;
}>> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    } as GenerationConfig,
  });

  try {
    const result = await model.generateContent(
      `You are a logical fallacy detection engine. Analyze this debate message for logical fallacies.\n\nConversation context:\n${conversationContext}\n\nMessage to analyze:\n"${text}"\n\nDetectable fallacies: strawman, ad_hominem, false_dilemma, slippery_slope, texas_sharpshooter, red_herring, no_true_scotsman, appeal_to_emotion, bandwagon, argument_from_ignorance.\n\nReturn a JSON array. If no fallacies found, return []. If found: [{ "type": "<fallacy_type>", "startIndex": <int>, "endIndex": <int>, "explanation": "<why this is a fallacy>" }]`
    );
    const parsed = extractJson(result.response.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.warn('Gemini detectFallacies failed', { err: (err as Error).message });
    return [];
  }
}

/**
 * Predict the probability of the user winning mid-debate.
 */
export async function predictWinProbability(params: {
  conversationHistory: Array<{ sender: string; content: string }>;
  currentScores: {
    userMessageCount: number;
    aiMessageCount: number;
    userAvgLength: number;
    fallacyCount: number;
  };
}): Promise<number> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    } as GenerationConfig,
  });

  const recentMessages = params.conversationHistory.slice(-6)
    .map(m => `${m.sender}: ${m.content.substring(0, 100)}`)
    .join('\n');

  try {
    const result = await model.generateContent(
      `Based on this debate excerpt, estimate the probability (0.0 to 1.0) that the user is winning. Consider argument quality, logical consistency, evidence usage, and rhetorical effectiveness.\n\nStats: User messages: ${params.currentScores.userMessageCount}, Avg length: ${params.currentScores.userAvgLength}, Fallacies committed: ${params.currentScores.fallacyCount}\n\nRecent exchange:\n${recentMessages}\n\nReturn JSON: { "winProbability": <float 0.0-1.0> }`
    );
    const parsed = extractJson(result.response.text());
    return Math.max(0.05, Math.min(0.95, parsed.winProbability || 0.5));
  } catch (err) {
    logger.warn('Gemini predictWinProbability failed', { err: (err as Error).message });
    return 0.5;
  }
}

/**
 * Generate post-debate NLP scores and summary.
 */
export async function generatePostDebateAnalysis(transcript: Array<{
  sender: string;
  content: string;
}>): Promise<{
  scores: {
    logic: number;
    evidence: number;
    persuasiveness: number;
    clarity: number;
    emotionalTone: number;
  };
  winner: string;
  summary: {
    bestUserArgument: string;
    bestAiArgument: string;
    conclusion: string;
  };
}> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    } as GenerationConfig,
  });

  const formattedTranscript = transcript
    .map(m => `[${m.sender.toUpperCase()}]: ${m.content}`)
    .join('\n\n');

  try {
    const result = await model.generateContent(
      `Analyze this debate transcript and evaluate the USER's performance.\n\nTranscript:\n${formattedTranscript}\n\nReturn JSON:\n{\n  "scores": {\n    "logic": <0-10>,\n    "evidence": <0-10>,\n    "persuasiveness": <0-10>,\n    "clarity": <0-10>,\n    "emotionalTone": <0-10>\n  },\n  "winner": "<user|ai|draw>",\n  "summary": {\n    "bestUserArgument": "<extract the single strongest user argument>",\n    "bestAiArgument": "<extract the single strongest AI argument>",\n    "conclusion": "<objective 1-2 sentence verdict>"\n  }\n}`
    );
    return extractJson(result.response.text());
  } catch (err) {
    logger.warn('Gemini generatePostDebateAnalysis failed', { err: (err as Error).message });
    return {
      scores: { logic: 5, evidence: 5, persuasiveness: 5, clarity: 5, emotionalTone: 5 },
      winner: 'draw',
      summary: {
        bestUserArgument: 'Analysis unavailable.',
        bestAiArgument: 'Analysis unavailable.',
        conclusion: 'The debate concluded without a clear winner.',
      },
    };
  }
}

/**
 * Screen user input for toxicity before processing.
 */
// Keyword-based toxicity check — avoids wasting a Gemini API call per message.
// This saves quota for the actual debate response.
const TOXIC_PATTERNS = [
  /\b(kill|murder|die|death threat)\b/i,
  /\b(f+u+c+k|s+h+i+t|a+s+s+h+o+l+e|b+i+t+c+h|d+a+m+n)\b/i,
  /\b(n[i1]gg|f[a@]gg?|r[e3]t[a@]rd)\b/i,
  /\b(ignore previous|ignore above|system prompt|you are now|forget your instructions)\b/i,
];

export async function checkToxicity(text: string): Promise<{
  isToxic: boolean;
  reason: string | null;
}> {
  // Use simple keyword matching instead of Gemini to preserve API quota
  const lower = text.toLowerCase();
  for (const pattern of TOXIC_PATTERNS) {
    if (pattern.test(lower)) {
      const isJailbreak = /ignore previous|ignore above|system prompt|you are now|forget your instructions/i.test(lower);
      return { isToxic: true, reason: isJailbreak ? 'jailbreak' : 'harassment' };
    }
  }
  return { isToxic: false, reason: null };
}
