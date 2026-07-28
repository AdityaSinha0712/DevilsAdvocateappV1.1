/**
 * ═══════════════════════════════════════════════════════════════════
 * useDebate Hook — Manages debate state and API communication
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tries real API calls first; falls back to mock data ONLY on error.
 * The backend availability is re-checked on each debate start.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { DebateMessage, PersonaId, IntensityLevel, SentimentLabel } from '../types/debate';
import { SENTIMENT_COLORS } from '../utils/sentimentColors';
import * as api from '../services/debateApi';
import { db } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

// ─── Types ───────────────────────────────────────────────────────
export interface DebateResultsData {
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

// ─── Helpers ─────────────────────────────────────────────────────
const getRandomSentiment = (): SentimentLabel => {
  const sentiments: SentimentLabel[] = ['anger', 'neutral', 'positive', 'fear', 'optimism'];
  return sentiments[Math.floor(Math.random() * sentiments.length)];
};

const getRandomScore = (label: SentimentLabel): number => {
  const ranges: Record<SentimentLabel, [number, number]> = {
    anger: [-0.8, -0.3], fear: [-0.6, -0.1], neutral: [-0.2, 0.2],
    positive: [0.3, 0.8], optimism: [0.4, 0.9],
  };
  const [min, max] = ranges[label];
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
};

const msgId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

// ─── Backend availability — re-checks each time ─────────────────
async function checkBackend(): Promise<boolean> {
  try {
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const resp = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Mock fallback responses (only used when backend is truly down) ─
const MOCK_AI_RESPONSES: Record<PersonaId, string[]> = {
  devils_advocate: [
    "Interesting position, but you're ignoring a fundamental contradiction in your own logic.",
    "That's a convenient narrative. Where's your causal mechanism?",
    "You've built your entire argument on an unexamined assumption.",
  ],
  philosopher: [
    'Before we proceed, define what you mean by "better." Better for whom?',
    'Do you truly know this, or do you merely believe it?',
    'If your position is correct, what would a world governed by this principle look like?',
  ],
  scientist: [
    "Your argument lacks empirical support. You've cited zero peer-reviewed studies.",
    'The data contradicts your assertion. Meta-analyses show an inverse correlation.',
    "Correlation is not causation. You haven't controlled for confounding variables.",
  ],
  politician: [
    "The real question isn't about the technical details — it's about the people.",
    'We need practical solutions, not academic speculation.',
    "I've been fighting for this cause for decades. My track record speaks for itself.",
  ],
  lawyer: [
    "Objection. You're making a claim without establishing the burden of proof.",
    'Your testimony contradicts your earlier statement.',
    'Your argument has been tried before — and it failed.',
  ],
  skeptic: [
    "That's an extraordinary claim requiring extraordinary evidence.",
    'Trace your belief back to its source. Is it based on verified data?',
    "The null hypothesis remains undefeated.",
  ],
  historian: [
    'History tells a different story. A similar argument in 1848 led to catastrophic consequences.',
    'The Roman Senate debated this very question in 44 BCE.',
    "Your argument echoes the same structural tensions that shaped the modern world order.",
  ],
  comedian: [
    "So we should trust the same species that invented both the internet AND the pet rock?",
    "Almost as compelling as my uncle's theory that the moon landing was faked.",
    "If we follow your logic, pigeons should get voting rights.",
  ],
};

// ═══════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════

export function useDebate() {
  const [debateId, setDebateId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [winProbability, setWinProbability] = useState(0.5);
  const [turnCount, setTurnCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [debateStarted, setDebateStarted] = useState(false);
  const [debateResults, setDebateResults] = useState<DebateResultsData | null>(null);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);
  // ─── Multiplayer state ─────────────────────────────────────
  const [isPublicDebate, setIsPublicDebate] = useState(false);
  const [currentTurnUid, setCurrentTurnUid] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<string, { displayName: string; role: string }> | null>(null);
  const isProcessing = useRef(false);

  // ─── Real-Time Sync (Firebase onSnapshot) ────────────────────
  useEffect(() => {
    if (!debateId || debateId.startsWith('mock_')) return;

    console.log(`Setting up real-time sync for debate: ${debateId}`);
    const unsubscribe = onSnapshot(doc(db, 'debates', debateId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        // Track public debate status
        const isPublic = data.isPublicDebate === true;
        setIsPublicDebate(isPublic);

        // Sync multiplayer fields
        if (data.currentTurnUid !== undefined) {
          setCurrentTurnUid(data.currentTurnUid);
        }
        if (data.players) {
          setPlayers(data.players);
        }
        
        // Update Wait Status
        if (isPublic && data.status === 'waiting') {
          setIsWaitingForOpponent(true);
        } else {
          setIsWaitingForOpponent(false);
        }

        // Update Messages
        // For PUBLIC debates: ALWAYS accept snapshot updates (opponent's messages come via Firestore)
        // For PRIVATE debates: skip while isProcessing to avoid overwriting optimistic user message
        const shouldAcceptMessages = isPublic || !isProcessing.current;
        
        if (data.messages && Array.isArray(data.messages) && shouldAcceptMessages) {
          const parsedMsgs = data.messages.map((m: any) => {
            const label = m.sentiment?.label || 'neutral';
            return {
              ...m,
              timestamp: new Date(m.timestamp),
              id: m.id || `sync_${m.timestamp}_${m.content?.length || 0}`,
              sentiment: {
                label,
                score: m.sentiment?.score || 0,
                color: SENTIMENT_COLORS[label as SentimentLabel]?.text || 'text-gray-400',
                emoji: SENTIMENT_COLORS[label as SentimentLabel]?.emoji || '😐',
              }
            };
          });
          
          setMessages(parsedMsgs);
          setTurnCount(Math.floor(parsedMsgs.length / 2));
          
          const lastMsg = parsedMsgs[parsedMsgs.length - 1];
          if (lastMsg?.winProbability !== undefined) {
             setWinProbability(lastMsg.winProbability);
          }
        }
        
        // Update Results (if completed by opponent)
        if (data.status === 'completed' && data.finalScores) {
          setDebateResults({
            finalScores: data.finalScores,
            winner: data.winner,
            sentimentVolatility: data.sentimentVolatility,
            summary: data.summary,
          });
        }
      }
    }, (err) => {
      console.warn('Real-time sync failed:', err);
    });

    return () => unsubscribe();
  }, [debateId]);

  // ─── Generate Topic ──────────────────────────────────────────
  const generateTopic = useCallback(async (
    intensity: IntensityLevel,
    persona: PersonaId
  ): Promise<string> => {
    setError(null);
    const online = await checkBackend();

    if (online) {
      try {
        const result = await api.generateTopic(intensity, persona);
        return result.topic;
      } catch (err) {
        console.warn('API topic generation failed, using fallback', err);
      }
    }

    // Mock fallback
    const topics = [
      'Is artificial intelligence an existential threat to humanity?',
      'Should social media platforms be regulated as public utilities?',
      'Is capitalism inherently exploitative or fundamentally empowering?',
      'Should genetic engineering of human embryos be permitted?',
      'Is universal basic income economically viable at scale?',
    ];
    await new Promise(r => setTimeout(r, 600));
    return topics[Math.floor(Math.random() * topics.length)];
  }, []);

  // ─── Start Debate ────────────────────────────────────────────
  const startDebate = useCallback(async (params: {
    topic: string;
    persona: PersonaId;
    intensity: IntensityLevel;
    isPublicDebate: boolean;
    personaIcon: string;
    personaName: string;
    joinDebateId?: string;
  }) => {
    setError(null);
    setMessages([]);
    setWinProbability(0.5);
    setTurnCount(0);
    setDebateStarted(true);
    setDebateResults(null);
    setIsPublicDebate(params.isPublicDebate);
    setPlayers(null);
    setCurrentTurnUid(null);

    const online = await checkBackend();

    if (online) {
      try {
        const result = await api.startDebate({
          topic: params.topic,
          persona: params.persona,
          intensity: params.intensity,
          isPublicDebate: params.isPublicDebate,
          joinDebateId: params.joinDebateId,
        });

        setDebateId(result.debateId);

        if (result.joinedExisting) {
           setIsWaitingForOpponent(false);
           return;
        }

        if (params.isPublicDebate) {
           setIsWaitingForOpponent(true);
        }

        const openingMsg: DebateMessage = {
          id: msgId(),
          sender: 'ai',
          content: result.aiOpeningMessage,
          timestamp: new Date(),
          sentiment: {
            label: result.aiSentiment,
            score: result.aiSentimentScore,
            color: SENTIMENT_COLORS[result.aiSentiment].text,
            emoji: SENTIMENT_COLORS[result.aiSentiment].emoji,
          },
          fallaciesDetected: [],
          winProbability: 0.5,
        };

        setMessages([openingMsg]);
        return;
      } catch (err) {
        console.warn('API debate start failed, using fallback', err);
      }
    }

    // Mock fallback
    setDebateId(`mock_${Date.now()}`);
    const sentiment = getRandomSentiment();
    const openingMsg: DebateMessage = {
      id: msgId(),
      sender: 'ai',
      content: `${params.personaIcon} I am **${params.personaName}**. The topic is: "${params.topic}". Make your opening argument.`,
      timestamp: new Date(),
      sentiment: {
        label: sentiment,
        score: getRandomScore(sentiment),
        color: SENTIMENT_COLORS[sentiment].text,
        emoji: SENTIMENT_COLORS[sentiment].emoji,
      },
      fallaciesDetected: [],
      winProbability: 0.5,
    };
    setMessages([openingMsg]);
  }, []);

  // ─── Send Message ────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    persona: PersonaId,
    intensity: IntensityLevel
  ) => {
    if (!text.trim() || isProcessing.current) return;
    isProcessing.current = true;
    setError(null);

    // Optimistically add the user's message to state IMMEDIATELY
    const userMsg: DebateMessage = {
      id: msgId(),
      sender: 'user',
      content: text,
      timestamp: new Date(),
      sentiment: {
        label: 'neutral',
        score: 0,
        color: SENTIMENT_COLORS['neutral'].text,
        emoji: SENTIMENT_COLORS['neutral'].emoji,
      },
      fallaciesDetected: [],
      winProbability: winProbability,
    };

    setMessages(prev => [...prev, userMsg]);
    setIsAiThinking(true);
    setTurnCount(t => t + 1);

    // For public debates, just send to API and let Firestore snapshot handle the response
    // No local AI response needed — the message will appear via the onSnapshot listener
    if (debateId && !debateId.startsWith('mock_')) {
      try {
        const result = await api.sendDebateMessage({
          debateId,
          message: text,
          persona,
          intensity,
        });

        if (!isPublicDebate) {
          // Private debate: update user message with real NLP data from the API response
          setMessages(prev => {
            const updated = [...prev];
            const userIdx = updated.findIndex(m => m.id === userMsg.id);
            if (userIdx !== -1) {
              updated[userIdx] = {
                ...updated[userIdx],
                sentiment: {
                  label: result.userSentiment,
                  score: result.userSentimentScore,
                  color: SENTIMENT_COLORS[result.userSentiment].text,
                  emoji: SENTIMENT_COLORS[result.userSentiment].emoji,
                },
                fallaciesDetected: result.userFallacies,
              };
            }
            
            const aiMsg: DebateMessage = {
              id: msgId(),
              sender: 'ai',
              content: result.aiResponse,
              timestamp: new Date(),
              sentiment: {
                label: result.aiSentiment,
                score: result.aiSentimentScore,
                color: SENTIMENT_COLORS[result.aiSentiment].text,
                emoji: SENTIMENT_COLORS[result.aiSentiment].emoji,
              },
              fallaciesDetected: [],
              winProbability: result.winProbability,
            };

            return [...updated, aiMsg];
          });
        }
        // For public debates, the snapshot listener will update messages automatically

        setWinProbability(result.winProbability);
        setIsAiThinking(false);
        isProcessing.current = false;
        return;
      } catch (err) {
        if (err instanceof api.ApiError) {
          if (err.code === 'TOXICITY_DETECTED') {
            setError(err.message);
            setMessages(prev => prev.filter(m => m.id !== userMsg.id));
            setTurnCount(t => t - 1);
            setIsAiThinking(false);
            isProcessing.current = false;
            return;
          }
          if (err.code === 'RATE_LIMITED') {
            setError(err.message);
            setIsAiThinking(false);
            isProcessing.current = false;
            return;
          }
          // Turn validation error from backend
          if (err.status === 403) {
            setError(err.message);
            setMessages(prev => prev.filter(m => m.id !== userMsg.id));
            setTurnCount(t => t - 1);
            setIsAiThinking(false);
            isProcessing.current = false;
            return;
          }
        }
        console.warn('API message failed, using fallback', err);
      }
    }

    // Mock fallback — ONLY for private/offline debates
    // Public debates should never get a fake AI reply.
    if (isPublicDebate) {
      // For public debates, the message was already optimistically added.
      // If API failed, remove the optimistic message and show error.
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      setTurnCount(t => t - 1);
      setError('Failed to send message. Please try again.');
      setIsAiThinking(false);
      isProcessing.current = false;
      return;
    }

    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

    const aiResponses = MOCK_AI_RESPONSES[persona];
    const aiText = aiResponses[Math.floor(Math.random() * aiResponses.length)];
    const aiSentiment = getRandomSentiment();
    const newWinProb = Math.max(0.1, Math.min(0.9, winProbability + (Math.random() - 0.5) * 0.15));

    const aiMsg: DebateMessage = {
      id: msgId(),
      sender: 'ai',
      content: aiText,
      timestamp: new Date(),
      sentiment: {
        label: aiSentiment,
        score: getRandomScore(aiSentiment),
        color: SENTIMENT_COLORS[aiSentiment].text,
        emoji: SENTIMENT_COLORS[aiSentiment].emoji,
      },
      fallaciesDetected: [],
      winProbability: newWinProb,
    };

    setMessages(prev => [...prev, aiMsg]);
    setWinProbability(newWinProb);
    setIsAiThinking(false);
    isProcessing.current = false;
  }, [debateId, winProbability, isPublicDebate]);

  // ─── End Debate ──────────────────────────────────────────────
  const endDebateSession = useCallback(async (): Promise<DebateResultsData | null> => {
    if (debateId && !debateId.startsWith('mock_')) {
      try {
        const result = await api.endDebate(debateId);
        const results: DebateResultsData = {
          finalScores: result.finalScores,
          winner: result.winner,
          sentimentVolatility: result.sentimentVolatility,
          summary: result.summary,
        };
        setDebateResults(results);
        setDebateStarted(false);
        return results;
      } catch (err) {
        console.warn('API end debate failed', err);
      }
    }

    // Mock results for offline mode
    const mockResults: DebateResultsData = {
      finalScores: {
        logic: Math.round(Math.random() * 4 + 5),
        evidence: Math.round(Math.random() * 4 + 4),
        persuasiveness: Math.round(Math.random() * 4 + 5),
        clarity: Math.round(Math.random() * 3 + 6),
        emotionalTone: Math.round(Math.random() * 4 + 4),
      },
      winner: (['user', 'ai', 'draw'] as const)[Math.floor(Math.random() * 3)],
      sentimentVolatility: Math.random() * 0.5 + 0.2,
      summary: {
        bestUserArgument: 'Your strongest point demonstrated clear logical reasoning.',
        bestAiArgument: 'The AI challenged your assumptions with historical precedent.',
        conclusion: 'A well-fought debate with strong arguments on both sides.',
      },
    };
    setDebateResults(mockResults);
    setDebateStarted(false);
    return mockResults;
  }, [debateId]);

  // ─── Reset ───────────────────────────────────────────────────
  const resetDebate = useCallback(() => {
    setDebateId(null);
    setMessages([]);
    setIsAiThinking(false);
    setWinProbability(0.5);
    setTurnCount(0);
    setError(null);
    setDebateStarted(false);
    setDebateResults(null);
    setIsPublicDebate(false);
    setCurrentTurnUid(null);
    setPlayers(null);
  }, []);

  // ─── Resume Debate ───────────────────────────────────────────
  const resumeDebate = useCallback(async (id: string) => {
    setError(null);
    setDebateId(id);
    setDebateStarted(true);
    setDebateResults(null);
    try {
      const debate = await api.getDebate(id);
      if (debate.messages && debate.messages.length > 0) {
        // Parse dates correctly
        const parsedMsgs = debate.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
          id: m.id || msgId()
        }));
        setMessages(parsedMsgs);
        setTurnCount(Math.floor(parsedMsgs.length / 2));
        
        const lastMsg = parsedMsgs[parsedMsgs.length - 1];
        setWinProbability(lastMsg?.winProbability ?? 0.5);
        
        if (debate.status === 'completed') {
          setDebateResults({
            finalScores: debate.finalScores,
            winner: debate.winner,
            sentimentVolatility: debate.sentimentVolatility,
            summary: debate.summary,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to load past debate', err);
      setError('Could not load debate history.');
    }
  }, []);

  return {
    debateId,
    messages,
    isAiThinking,
    winProbability,
    turnCount,
    error,
    debateStarted,
    debateResults,
    isWaitingForOpponent,
    isPublicDebate,
    currentTurnUid,
    players,
    generateTopic,
    startDebate,
    sendMessage,
    endDebateSession,
    resetDebate,
    resumeDebate,
    setError,
  };
}

export { ApiError } from '../services/debateApi';
