import React, { useEffect, useState, useCallback } from 'react';
import * as api from '../../services/debateApi';
import { db } from '../../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface Lobby {
  id: string;
  topic: string;
  aiPersona: string;
  intensityLevel: string;
  startedAt: string;
  hostName: string;
  hostRating: number;
}

interface PublicLobbiesProps {
  onJoinDebate: (lobby: Lobby) => void;
  onWaitingChange?: (isWaiting: boolean) => void;
}

const PublicLobbies: React.FC<PublicLobbiesProps> = ({ onJoinDebate, onWaitingChange }) => {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Create Lobby State ─────────────────────────────────────
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
  const [waitingDebateId, setWaitingDebateId] = useState<string | null>(null);

  // ─── Real-Time Listener: detect when opponent joins ──────────
  useEffect(() => {
    if (!waitingDebateId) return;

    console.log(`[PublicLobbies] Listening for opponent on debate: ${waitingDebateId}`);
    const unsubscribe = onSnapshot(doc(db, 'debates', waitingDebateId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        // When someone joins, status changes from 'waiting' to 'active'
        if (data.status === 'active') {
          console.log(`[PublicLobbies] Opponent joined! Transitioning to arena.`);
          // Transition the creator to the debate arena
          onJoinDebate({
            id: waitingDebateId,
            topic: data.topic || newTopic,
            aiPersona: data.aiPersona || 'devils_advocate',
            intensityLevel: data.intensityLevel || 'challenging',
            startedAt: data.startedAt?.toDate?.() 
              ? data.startedAt.toDate().toISOString() 
              : new Date().toISOString(),
            hostName: '',
            hostRating: 0,
            _isCreatorResuming: true,
          } as any);
          // Clear waiting state
          setWaitingDebateId(null);
          onWaitingChange?.(false);
          setShowCreateForm(false);
          setNewTopic('');
        }
      }
    }, (err) => {
      console.warn('[PublicLobbies] Snapshot listener error:', err);
    });

    return () => unsubscribe();
  }, [waitingDebateId, onJoinDebate, newTopic]);

  // ─── Fetch Lobbies ──────────────────────────────────────────
  const fetchLobbies = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/debate/public-lobbies`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (res.ok) {
        const data = await res.json();
        setLobbies(data);
      }
    } catch (err) {
      console.error('Failed to fetch lobbies', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLobbies();
    // Poll every 5 seconds for new lobbies
    const interval = setInterval(fetchLobbies, 5000);
    return () => clearInterval(interval);
  }, [fetchLobbies]);

  // ─── Generate a Random Topic ───────────────────────────────
  const handleGenerateTopic = async () => {
    setIsGeneratingTopic(true);
    try {
      const result = await api.generateTopic('challenging', 'devils_advocate');
      setNewTopic(result.topic);
    } catch (err) {
      console.warn('Topic generation failed', err);
      const fallbacks = [
        'Is social media doing more harm than good?',
        'Should AI have rights?',
        'Is democracy the best form of government?',
        'Should college education be free?',
      ];
      setNewTopic(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
    } finally {
      setIsGeneratingTopic(false);
    }
  };

  // ─── Create Public Lobby ───────────────────────────────────
  const handleCreateLobby = async () => {
    if (!newTopic.trim()) return;
    setIsCreating(true);
    try {
      const result = await api.startDebate({
        topic: newTopic.trim(),
        persona: 'devils_advocate' as any,
        intensity: 'challenging' as any,
        isPublicDebate: true,
      });
      setWaitingDebateId(result.debateId);
      onWaitingChange?.(true);
    } catch (err) {
      console.error('Failed to create lobby', err);
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Cancel Waiting ─────────────────────────────────────────
  const handleCancelWaiting = () => {
    setWaitingDebateId(null);
    onWaitingChange?.(false);
    setShowCreateForm(false);
    setNewTopic('');
  };

  // ─── When opponent joins, clear waiting state ─────────────────
  // (In the useEffect where status === 'active')

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Waiting for Opponent
  // ═══════════════════════════════════════════════════════════════
  if (waitingDebateId) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="relative mb-8">
            <div className="w-20 h-20 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-2xl">⚔️</div>
          </div>
          <h2 className="font-display text-3xl font-bold text-white mb-3">
            Waiting for Challenger...
          </h2>
          <p className="text-gray-400 max-w-md mx-auto mb-2">
            Your lobby for <span className="text-cyan-400 font-semibold">"{newTopic}"</span> is live.
          </p>
          <p className="text-gray-500 text-sm mb-8">
            The debate will begin as soon as someone joins.
          </p>
          <button
            onClick={handleCancelWaiting}
            className="px-6 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-medium transition-all"
          >
            Cancel & Return
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Main Lobbies Page
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl font-bold text-white mb-2">
            Public Lobbies
          </h1>
          <p className="text-gray-400">
            Join an open debate or host your own for others to challenge.
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="neon-button"
          >
            ➕ Host a Debate
          </button>
        )}
      </div>

      {/* ─── Inline Create Form ─── */}
      {showCreateForm && (
        <div className="glass-card p-6 mb-8 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-white">
              Create Public Lobby
            </h2>
            <button
              onClick={() => { setShowCreateForm(false); setNewTopic(''); }}
              className="text-gray-500 hover:text-white text-lg transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Pick a debate topic. No AI persona needed — it's human vs. human, with an AI observer tracking the analytics.
          </p>

          <div className="flex gap-3 mb-4">
            <textarea
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="Enter a debate topic..."
              rows={2}
              className="flex-1 bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none font-body text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateTopic}
              disabled={isGeneratingTopic}
              className="px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-medium transition-all disabled:opacity-50"
            >
              {isGeneratingTopic ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                '⚡ Generate Topic'
              )}
            </button>
            <button
              onClick={handleCreateLobby}
              disabled={!newTopic.trim() || isCreating}
              className="neon-button !py-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                '🚀 Create Lobby'
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Lobby List ─── */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      ) : lobbies.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-5xl mb-4">🏟️</div>
          <h3 className="text-xl font-bold text-white mb-2">No Open Lobbies</h3>
          <p className="text-gray-400 mb-6">
            There are currently no waiting public debates. Be the first to host one!
          </p>
          {!showCreateForm && (
            <button onClick={() => setShowCreateForm(true)} className="neon-button">
              Create Lobby
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lobbies.map((lobby) => (
            <div key={lobby.id} className="glass-card-hover p-6 flex flex-col h-full">
              {/* Time badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2 py-1 bg-cyan-500/15 text-cyan-400 text-xs font-bold rounded">
                  LIVE
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(lobby.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Topic */}
              <h3 className="font-display text-xl font-bold text-white mb-4 flex-grow leading-snug">
                {lobby.topic}
              </h3>

              {/* Host Info */}
              <div className="bg-dark-surface/50 rounded-lg p-3 mb-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Host</span>
                  <span className="font-semibold text-cyan-400">{lobby.hostName}</span>
                </div>
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-gray-400">Rating</span>
                  <span className="text-yellow-400 font-bold">{lobby.hostRating} pts</span>
                </div>
              </div>

              {/* Join Button */}
              <button
                onClick={() => onJoinDebate(lobby)}
                className="w-full py-3 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 hover:from-cyan-500/30 hover:to-teal-500/30 border border-cyan-500/20 hover:border-cyan-500/40 text-white font-semibold rounded-xl transition-all"
              >
                ⚔️ Join Debate
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PublicLobbies;
