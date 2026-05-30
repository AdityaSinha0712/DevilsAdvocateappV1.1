import { useState, useEffect, useRef, useCallback } from 'react';
import { PERSONAS } from '../../config/personas';
import { INTENSITY_LEVELS, getIntensityConfig } from '../../config/intensityLevels';
import { getFallacyByType } from '../../config/fallacyTaxonomy';
import { SENTIMENT_COLORS } from '../../utils/sentimentColors';
import { useDebate } from '../../hooks/useDebate';
import { useAuth } from '../../contexts/AuthContext';
import DebateResults from './DebateResults';
import type { PersonaId, IntensityLevel, SentimentLabel } from '../../types/debate';

import type { LoadDebatePayload } from '../../App';

// ═══════════════════════════════════════════════════════════════════
// DebateArena Component
// ═══════════════════════════════════════════════════════════════════

export default function DebateArena({ 
  loadDebatePayload, 
  onDebateActiveChange,
  onReturnToArenaOverride,
  isHistoryMode = false
}: { 
  loadDebatePayload?: LoadDebatePayload | null; 
  onDebateActiveChange?: (active: boolean, payload?: LoadDebatePayload) => void;
  onReturnToArenaOverride?: () => void;
  isHistoryMode?: boolean;
}) {
  // ─── Pre-Debate State ──────────────────────────────────────────
  const [topic, setTopic] = useState<string>('');
  const [customTopic, setCustomTopic] = useState<string>('');
  const [selectedPersona, setSelectedPersona] = useState<PersonaId>('devils_advocate');
  const [intensity, setIntensity] = useState<IntensityLevel>('challenging');
  
  const { user } = useAuth();

  // ─── UI State ──────────────────────────────────────────────────
  const [isGeneratingTopic, setIsGeneratingTopic] = useState<boolean>(false);
  const [showPersonaDropdown, setShowPersonaDropdown] = useState<boolean>(false);
  const [isEnding, setIsEnding] = useState(false);
  const [resultView, setResultView] = useState<'results' | 'chat'>('results');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ─── useDebate Hook (handles API + fallback) ──────────────────
  const {
    debateId,
    messages,
    isAiThinking,
    winProbability,
    turnCount,
    error,
    debateStarted,
    debateResults,
    generateTopic: apiGenerateTopic,
    startDebate: apiStartDebate,
    sendMessage: apiSendMessage,
    endDebateSession,
    resetDebate,
    resumeDebate,
    setError,
    isWaitingForOpponent,
    isPublicDebate,
    currentTurnUid,
    players,
  } = useDebate();

  // ─── Turn logic ─────────────────────────────────────────────
  const isMyTurn = !isPublicDebate || !currentTurnUid || (user && currentTurnUid === user.uid);
  const isInputDisabled = isPublicDebate ? (!isMyTurn || isAiThinking) : isAiThinking;

  // Get player display names for the UI
  const getPlayerNames = () => {
    if (!isPublicDebate || !players || !user) return { myName: 'YOU', opponentName: 'AI' };
    const myName = players[user.uid]?.displayName || user.displayName || 'You';
    const opponentUid = Object.keys(players).find(uid => uid !== user.uid);
    const opponentName = opponentUid ? (players[opponentUid]?.displayName || 'Opponent') : 'Opponent';
    return { myName, opponentName };
  };
  const { myName, opponentName } = getPlayerNames();
  const isHost = !isPublicDebate || !players || !user || players[user.uid]?.role === 'host';
  const displayWinProbability = isHost ? winProbability : (1 - winProbability);

  // ─── User input state ──────────────────────────────────────────
  const [userInput, setUserInput] = useState<string>('');

  // ─── Notify parent of active debate status ─────────────────────
  useEffect(() => {
    if (isHistoryMode) return; // Do not overwrite active debate state when viewing history
    // Active = debate started AND not finished (no results yet)
    const isActive = debateStarted && !debateResults;
    onDebateActiveChange?.(isActive, isActive && debateId ? { debateId, topic, aiPersona: selectedPersona } : undefined);
  }, [debateStarted, debateResults, debateId, topic, selectedPersona, onDebateActiveChange, isHistoryMode]);

  // ─── Auto-scroll to latest message ─────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasJoinedRef = useRef(false);

  // ─── Load / Join Past Debate ─────────────────────────────────────
  useEffect(() => {
    if (loadDebatePayload) {
      if (loadDebatePayload.isCreatingPublic) {
        setCustomTopic('');
        setTopic('');
        hasJoinedRef.current = false;
      } else if (loadDebatePayload.isCreatorResuming && loadDebatePayload.debateId) {
        // Creator's lobby was joined — resume the existing debate (don't re-join)
        setTopic(loadDebatePayload.topic);
        setCustomTopic(loadDebatePayload.topic);
        setSelectedPersona(loadDebatePayload.aiPersona as PersonaId);
        resumeDebate(loadDebatePayload.debateId);
        hasJoinedRef.current = false;
      } else if (loadDebatePayload.isJoiningLobby && loadDebatePayload.debateId) {
        if (!hasJoinedRef.current) {
          hasJoinedRef.current = true;
          setTopic(loadDebatePayload.topic);
          setCustomTopic(loadDebatePayload.topic);
          setSelectedPersona(loadDebatePayload.aiPersona as PersonaId);
          
          const currentPersona = PERSONAS.find((p) => p.id === loadDebatePayload.aiPersona) || PERSONAS[0];
          
          apiStartDebate({
            topic: loadDebatePayload.topic,
            persona: loadDebatePayload.aiPersona as PersonaId,
            intensity,
            isPublicDebate: true,
            personaIcon: currentPersona.icon,
            personaName: currentPersona.name,
            joinDebateId: loadDebatePayload.debateId,
          });
        }
      } else if (loadDebatePayload.debateId) {
        setCustomTopic(loadDebatePayload.topic);
        setTopic(loadDebatePayload.topic);
        setSelectedPersona(loadDebatePayload.aiPersona as PersonaId);
        resumeDebate(loadDebatePayload.debateId);
        hasJoinedRef.current = false;
      }
    } else if (loadDebatePayload === null) {
      resetDebate();
      setTopic('');
      setCustomTopic('');
      setResultView('results');
    }
  }, [loadDebatePayload, resumeDebate, apiStartDebate, intensity, resetDebate]);

  // ─── Close dropdown on outside click ───────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPersonaDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Auto-clear error after 5s ─────────────────────────────────
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  // ─── Topic Generator ──────────────────────────────────────────
  const handleGenerateTopic = useCallback(async () => {
    setIsGeneratingTopic(true);
    const newTopic = await apiGenerateTopic(intensity, selectedPersona);
    setTopic(newTopic);
    setCustomTopic(newTopic);
    setIsGeneratingTopic(false);
  }, [apiGenerateTopic, intensity, selectedPersona]);

  // ─── Start Debate ─────────────────────────────────────────────
  const handleStartDebate = useCallback(() => {
    const debateTopic = customTopic.trim() || topic;
    if (!debateTopic) return;
    setTopic(debateTopic);

    const currentPersona = PERSONAS.find((p) => p.id === selectedPersona)!;
    apiStartDebate({
      topic: debateTopic,
      persona: selectedPersona,
      intensity,
      isPublicDebate: loadDebatePayload?.isCreatingPublic ?? false,
      personaIcon: currentPersona.icon,
      personaName: currentPersona.name,
    });
  }, [customTopic, topic, selectedPersona, intensity, loadDebatePayload?.isCreatingPublic, apiStartDebate]);

  // ─── Send Message ───────────────────────────────────────
  const handleSendMessage = useCallback(async () => {
    const text = userInput.trim();
    if (!text || isInputDisabled) return;
    setUserInput('');
    await apiSendMessage(text, selectedPersona, intensity);
  }, [userInput, isInputDisabled, selectedPersona, intensity, apiSendMessage]);

  // ─── Handle Enter key ─────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ─── End Debate ───────────────────────────────────────────────
  const handleEndDebate = useCallback(async () => {
    setIsEnding(true);
    await endDebateSession();
    setIsEnding(false);
  }, [endDebateSession]);

  // ─── Handlers ──────────────────────────────────────────────────
  const handleReturnToArena = () => {
    if (onReturnToArenaOverride) {
      onReturnToArenaOverride();
      return;
    }
    resetDebate();
    setTopic('');
    setCustomTopic('');
    setResultView('results');
  };

  // ─── Current persona & intensity config ────────────────────────
  const currentPersona = PERSONAS.find((p) => p.id === selectedPersona) || PERSONAS[0];
  const intensityConfig = getIntensityConfig(intensity);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  // ─── Results Screen ────────────────────────────────────────────
  if (debateResults) {
    return (
      <div className="min-h-screen bg-black text-white font-body">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-glow-breathe" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl animate-glow-breathe" style={{ animationDelay: '1.5s' }} />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 py-6">
          <header className="text-center mb-6">
            <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight">
              <span className="text-white">Debate </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-400">
                {resultView === 'results' ? 'Results' : 'Transcript'}
              </span>
            </h1>
          </header>

          {/* ─── View Toggle ─── */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-xl bg-dark-elevated border border-dark-border p-1 gap-1">
              <button
                id="toggle-results-view"
                onClick={() => setResultView('results')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  resultView === 'results'
                    ? 'bg-gradient-to-r from-cyan-500/20 to-teal-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                📊 Results
              </button>
              <button
                id="toggle-chat-view"
                onClick={() => setResultView('chat')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  resultView === 'chat'
                    ? 'bg-gradient-to-r from-cyan-500/20 to-teal-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                💬 Chat Transcript
              </button>
            </div>
          </div>

          {resultView === 'results' ? (
            <DebateResults
              results={debateResults}
              topic={topic}
              personaName={currentPersona.name}
              personaIcon={currentPersona.icon}
              onReturnToArena={handleReturnToArena}
              isPublicDebate={isPublicDebate}
              myName={myName}
              opponentName={opponentName}
              players={players}
              user={user}
            />
          ) : (
            /* ─── Chat Transcript View ─── */
            <div className="animate-fade-in">
              {/* Topic Header */}
              <div className="glass-card-dense p-4 mb-4 flex items-center gap-3">
                <span className="text-2xl shrink-0">{currentPersona.icon}</span>
                <div className="min-w-0">
                  <div className="text-white font-display font-bold text-sm">{currentPersona.name}</div>
                  <div className="text-gray-500 text-xs line-clamp-2 break-words mt-0.5">{topic}</div>
                </div>
                <div className="ml-auto text-xs text-gray-500 shrink-0">
                  {messages.length} messages
                </div>
              </div>

              {/* Messages */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scroll-smooth">
                {messages.length > 0 ? messages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={`max-w-[85%] md:max-w-[75%] ${
                      msg.sender === 'user'
                        ? (msg.uid && user && msg.uid !== user.uid ? 'message-opponent' : 'message-user ml-auto')
                        : msg.sender === 'moderator' ? 'message-moderator'
                        : 'message-ai'
                    } p-4`}
                  >
                    {/* Sender Label */}
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        msg.sender === 'user'
                          ? (msg.uid && user && msg.uid !== user.uid ? 'text-fuchsia-400' : 'text-cyan-400')
                          : msg.sender === 'moderator' ? 'text-yellow-400'
                          : 'text-gray-400'
                      }`}>
                        {msg.sender === 'user'
                          ? (msg.uid && user && msg.uid !== user.uid
                              ? `👥 ${msg.displayName || opponentName}`
                              : `👤 ${isPublicDebate ? (msg.displayName || myName) : 'You'}`)
                          : msg.sender === 'moderator' ? '⚖️ Moderator'
                          : `${currentPersona.icon} ${currentPersona.name}`}
                      </span>

                      {/* Sentiment Tag */}
                      {msg.sentiment && msg.sentiment.label && SENTIMENT_COLORS[msg.sentiment.label as SentimentLabel] && (
                        <span className={`sentiment-tag ${SENTIMENT_COLORS[msg.sentiment.label as SentimentLabel].bg} ${SENTIMENT_COLORS[msg.sentiment.label as SentimentLabel].text} ${SENTIMENT_COLORS[msg.sentiment.label as SentimentLabel].border}`}>
                          {msg.sentiment.emoji} {msg.sentiment.label}
                        </span>
                      )}
                    </div>

                    {/* Message Content */}
                    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>

                    {/* Fallacies Alerts */}
                    {msg.fallaciesDetected && msg.fallaciesDetected.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.fallaciesDetected.map((fallacy: any, idx: number) => {
                          const fallacyDef = getFallacyByType(fallacy.type);
                          return (
                            <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                              <span className="text-orange-400 text-xs mt-0.5">⚠️</span>
                              <div>
                                <span className="text-orange-400 text-xs font-bold">
                                  {fallacyDef?.name ?? fallacy.type} detected
                                </span>
                                <p className="text-orange-300/70 text-xs mt-0.5">{fallacy.explanation}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Message metadata */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-gray-600">
                        {msg.timestamp instanceof Date
                          ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        Win: {((isHost ? (msg.winProbability ?? 0.5) : (1 - (msg.winProbability ?? 0.5))) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-12 text-gray-500">
                    <span className="text-3xl mb-3 block">📭</span>
                    <p className="text-sm">No chat messages available for this debate.</p>
                  </div>
                )}
              </div>

              {/* Return to Arena Button */}
              <div className="mt-6 text-center">
                <button
                  onClick={handleReturnToArena}
                  className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-semibold transition-all"
                >
                  ← Return to Arena
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-body">
      {/* ─── Background Ambient Glow ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-glow-breathe" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl animate-glow-breathe" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-6">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* HEADER                                                 */}
        {/* ═══════════════════════════════════════════════════════ */}
        <header className="text-center mb-8">
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight">
            <span className="text-white">Devil's </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-400">
              Advocate
            </span>
          </h1>
          <p className="mt-2 text-gray-500 text-sm font-medium tracking-wide uppercase">
            AI-Powered Debate Arena
          </p>
        </header>

        {/* ─── Error Toast ─── */}
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between animate-slide-up">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400 ml-3">✕</button>
          </div>
        )}

        {!debateStarted ? (
          /* ═══════════════════════════════════════════════════════ */
          /* PRE-DEBATE CONTROLS                                    */
          /* ═══════════════════════════════════════════════════════ */
          <div className="space-y-6 animate-fade-in">
            {/* ─── Topic Generator ─── */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-bold text-white">Choose Your Battleground</h2>
                <button
                  id="topic-generator-btn"
                  onClick={handleGenerateTopic}
                  disabled={isGeneratingTopic}
                  className="neon-button text-sm !px-4 !py-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              </div>
              <textarea
                id="topic-input"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Enter a debate topic or generate one..."
                rows={2}
                className="w-full bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none font-body text-sm"
              />
              {topic && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Selected:</span>
                  <span className="text-sm text-cyan-400 font-medium">{topic}</span>
                </div>
              )}
            </div>

            {/* ─── Persona Selector + Intensity Row ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Persona Selector */}
              <div className="glass-card p-6 relative overflow-visible z-20" ref={dropdownRef}>
                <h2 className="font-display text-lg font-bold text-white mb-4">AI Opponent</h2>
                <button
                  id="persona-selector-btn"
                  onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
                  className="w-full flex items-center justify-between bg-dark-surface border border-dark-border rounded-xl px-4 py-3 hover:border-cyan-500/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{currentPersona.icon}</span>
                    <div className="text-left">
                      <div className="text-white font-semibold text-sm">{currentPersona.name}</div>
                      <div className="text-gray-500 text-xs">{currentPersona.description.substring(0, 50)}...</div>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-gray-500 transition-transform ${showPersonaDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showPersonaDropdown && (
                  <div className="absolute z-50 mt-2 left-0 right-0 mx-6 bg-dark-elevated border border-dark-border rounded-xl shadow-2xl max-h-[360px] overflow-y-auto animate-slide-up">
                    {PERSONAS.map((persona) => (
                      <button
                        key={persona.id}
                        onClick={() => {
                          setSelectedPersona(persona.id);
                          setShowPersonaDropdown(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left ${
                          selectedPersona === persona.id ? 'bg-cyan-500/10 border-l-2 border-cyan-400' : ''
                        }`}
                      >
                        <span className="text-xl">{persona.icon}</span>
                        <div>
                          <div className="text-white font-medium text-sm">{persona.name}</div>
                          <div className="text-gray-500 text-xs">{persona.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Intensity Slider */}
              <div className="glass-card p-6">
                <h2 className="font-display text-lg font-bold text-white mb-4">Debate Intensity</h2>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <span className="text-sm font-medium">
                      <span className="mr-2">{intensityConfig.emoji}</span>
                      <span className={intensityConfig.color}>{intensityConfig.label}</span>
                    </span>
                  </div>

                  {/* 3-State Toggle */}
                  <div className="flex gap-2">
                    {INTENSITY_LEVELS.map((level) => (
                      <button
                        key={level.level}
                        id={`intensity-${level.level}`}
                        onClick={() => setIntensity(level.level)}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 border ${
                          intensity === level.level
                            ? level.level === 'friendly'
                              ? 'bg-green-500/20 border-green-500/40 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]'
                              : level.level === 'challenging'
                              ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                              : 'bg-red-500/20 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                            : 'bg-dark-surface border-dark-border text-gray-500 hover:border-gray-600'
                        }`}
                      >
                        {level.emoji} {level.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>

                  {/* Visual intensity bar */}
                  <div className="intensity-track">
                    <div
                      className={`intensity-fill ${
                        intensity === 'friendly' ? 'w-1/3 bg-gradient-to-r from-green-500 to-green-400' :
                        intensity === 'challenging' ? 'w-2/3 bg-gradient-to-r from-yellow-500 to-yellow-400' :
                        'w-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Start Debate Button ─── */}
            <button
              id="start-debate-btn"
              onClick={handleStartDebate}
              disabled={!customTopic.trim() && !topic}
              className="w-full neon-button !py-4 text-lg disabled:opacity-30 disabled:cursor-not-allowed group"
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                ⚔️ Enter the Arena
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>
          </div>
        ) : isWaitingForOpponent ? (
          /* ═══════════════════════════════════════════════════════ */
          /* WAITING FOR OPPONENT                                   */
          /* ═══════════════════════════════════════════════════════ */
           <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
             <div className="relative mb-8">
               <div className="w-20 h-20 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
               <div className="absolute inset-0 flex items-center justify-center text-2xl">
                 ⚔️
               </div>
             </div>
             <h2 className="font-display text-3xl font-bold text-white mb-3">Looking for an Opponent...</h2>
             <p className="text-gray-400 max-w-md mx-auto mb-6">
               You are waiting in a public lobby for {topic ? `the topic "${topic}"` : 'any topic'}. The debate will start as soon as someone else joins.
             </p>
             <button
               onClick={handleReturnToArena}
               className="px-6 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm transition-all"
             >
               Cancel Search
             </button>
           </div>
        ) : (
          /* ═══════════════════════════════════════════════════════ */
          /* LIVE DEBATE ARENA                                      */
          /* ═══════════════════════════════════════════════════════ */
          <div className="flex flex-col h-[calc(100vh-10rem)] animate-fade-in">
            {/* ─── Arena Header Bar ─── */}
            <div className="glass-card-dense p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-2xl shrink-0">{isPublicDebate ? '⚔️' : currentPersona.icon}</span>
                <div className="min-w-0">
                  <div className="text-white font-display font-bold text-sm truncate">
                    {isPublicDebate ? `${myName} vs ${opponentName}` : currentPersona.name}
                  </div>
                  <div className="text-gray-500 text-xs line-clamp-2 md:line-clamp-3 break-words mt-0.5" title={topic}>{topic}</div>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {/* Turn Indicator (public debates only) */}
                {isPublicDebate && (
                  <div className={`px-3 py-1 rounded-full text-xs font-bold border animate-pulse ${
                    isMyTurn
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                      : 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-400'
                  }`}>
                    {isMyTurn ? '✍️ Your Turn' : `⏳ ${opponentName}'s Turn`}
                  </div>
                )}

                {/* Intensity Badge */}
                <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  intensity === 'friendly' ? 'bg-green-500/15 border-green-500/30 text-green-400' :
                  intensity === 'challenging' ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' :
                  'bg-red-500/15 border-red-500/30 text-red-400'
                }`}>
                  {intensityConfig.emoji} {intensityConfig.label}
                </div>

                {/* Turn Counter */}
                <div className="text-xs text-gray-500">
                  Turn <span className="text-cyan-400 font-bold">{turnCount}</span>
                </div>

                {/* End Debate */}
                <button
                  id="end-debate-btn"
                  onClick={handleEndDebate}
                  disabled={isEnding}
                  className="px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all disabled:opacity-50"
                >
                  {isEnding ? (
                    <span className="flex items-center gap-1">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Ending...
                    </span>
                  ) : (
                    '🏳️ End Debate'
                  )}
                </button>
              </div>
            </div>

            {/* ─── ML Win Prediction Widget ─── */}
            <div className="glass-card-dense p-3 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wider font-display">
                  🧠 Win Prediction
                </span>
                <span className={`text-sm font-bold font-display ${
                  displayWinProbability > 0.6 ? 'text-green-400' :
                  displayWinProbability > 0.4 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {(displayWinProbability * 100).toFixed(1)}% {isPublicDebate ? myName : 'User'}
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-dark-elevated overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${displayWinProbability * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 right-0 bg-gradient-to-l from-red-500 to-orange-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${(1 - displayWinProbability) * 100}%` }}
                />
                <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/30" />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-cyan-400/60 font-medium">{isPublicDebate ? myName.toUpperCase() : 'YOU'}</span>
                <span className="text-[10px] text-red-400/60 font-medium">{isPublicDebate ? opponentName.toUpperCase() : 'AI'}</span>
              </div>
            </div>

            {/* ─── Chat Messages Area ─── */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 scroll-smooth">
              {messages.map((msg: any) => (
                <div
                  key={msg.id}
                  className={`max-w-[85%] md:max-w-[75%] animate-slide-up ${
                    msg.sender === 'user' 
                      ? (msg.uid && user && msg.uid !== user.uid ? 'message-opponent' : 'message-user ml-auto') 
                      : msg.sender === 'moderator' ? 'message-moderator' :
                    'message-ai'
                  } p-4`}
                >
                  {/* Sender Label */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                      msg.sender === 'user' 
                        ? (msg.uid && user && msg.uid !== user.uid ? 'text-fuchsia-400' : 'text-cyan-400')
                        : msg.sender === 'moderator' ? 'text-yellow-400' :
                      'text-gray-400'
                    }`}>
                      {msg.sender === 'user' 
                        ? (msg.uid && user && msg.uid !== user.uid 
                            ? `👥 ${msg.displayName || opponentName}` 
                            : `👤 ${isPublicDebate ? (msg.displayName || myName) : 'You'}`)
                        : msg.sender === 'moderator' ? '⚖️ Moderator' :
                       `${currentPersona.icon} ${currentPersona.name}`}
                    </span>

                    {/* Sentiment Tag */}
                    {msg.sentiment && msg.sentiment.label && SENTIMENT_COLORS[msg.sentiment.label as SentimentLabel] && (
                      <span className={`sentiment-tag ${SENTIMENT_COLORS[msg.sentiment.label as SentimentLabel].bg} ${SENTIMENT_COLORS[msg.sentiment.label as SentimentLabel].text} ${SENTIMENT_COLORS[msg.sentiment.label as SentimentLabel].border}`}>
                        {msg.sentiment.emoji} {msg.sentiment.label}
                      </span>
                    )}
                  </div>

                  {/* Message Content */}
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>

                  {/* Fallacies Alerts */}
                  {msg.fallaciesDetected && msg.fallaciesDetected.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.fallaciesDetected.map((fallacy: any, idx: number) => {
                        const fallacyDef = getFallacyByType(fallacy.type);
                        return (
                          <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                            <span className="text-orange-400 text-xs mt-0.5">⚠️</span>
                            <div>
                              <span className="text-orange-400 text-xs font-bold">
                                {fallacyDef?.name ?? fallacy.type} detected
                              </span>
                              <p className="text-orange-300/70 text-xs mt-0.5">{fallacy.explanation}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Message metadata */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-gray-600">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      Win: {((isHost ? (msg.winProbability ?? 0.5) : (1 - (msg.winProbability ?? 0.5))) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}

              {/* AI Thinking Indicator */}
              {isAiThinking && (
                <div className="message-ai max-w-[75%] p-4 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs font-bold uppercase">{currentPersona.icon} {currentPersona.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="text-xs text-gray-500 ml-2">Formulating counter-argument...</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* ─── Message Input Area ─── */}
            <div className="mt-4 glass-card-dense p-3">
              <div className="flex gap-3">
                <textarea
                  ref={inputRef}
                  id="message-input"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isPublicDebate && !isMyTurn 
                      ? `Waiting for ${opponentName}'s argument...` 
                      : isAiThinking 
                        ? 'Wait for AI response...' 
                        : 'Present your argument...'
                  }
                  disabled={isInputDisabled}
                  rows={2}
                  className="flex-1 bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none text-sm disabled:opacity-50"
                />
                <button
                  id="send-message-btn"
                  onClick={handleSendMessage}
                  disabled={!userInput.trim() || isInputDisabled}
                  className="relative self-end px-6 py-3 bg-cyan-500 text-black font-display font-bold rounded-xl transition-all duration-300 hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed group overflow-visible"
                >
                  <span className="absolute inset-[-6px] bg-cyan-500 rounded-xl blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-300 -z-10" />
                  <span className="relative z-10 flex items-center gap-2">
                    Send
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </span>
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-[10px] text-gray-600">Shift+Enter for new line</span>
                <span className="text-[10px] text-gray-600">
                  {userInput.length} characters
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
