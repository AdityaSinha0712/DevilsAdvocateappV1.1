/**
 * ═══════════════════════════════════════════════════════════════════
 * DebateResults — Post-Debate Scores & Summary Screen
 * ═══════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import type { DebateResultsData } from '../../hooks/useDebate';

interface Props {
  results: DebateResultsData;
  topic: string;
  personaName: string;
  personaIcon: string;
  onReturnToArena: () => void;
  isPublicDebate?: boolean;
  myName?: string;
  opponentName?: string;
  players?: Record<string, any> | null;
  user?: any;
}

function AnimatedBar({ label, value, max = 10, delay }: { label: string; value: number; max?: number; delay: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setWidth((value / max) * 100), delay);
    return () => clearTimeout(timer);
  }, [value, max, delay]);

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-400 font-medium">{label}</span>
        <span className="text-sm font-bold text-cyan-400">{value.toFixed(1)}/{max}</span>
      </div>
      <div className="h-3 rounded-full bg-dark-elevated overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-1000 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export default function DebateResults({
  results,
  topic,
  personaName,
  personaIcon,
  onReturnToArena,
  isPublicDebate = false,
  myName = 'You',
  opponentName = 'Opponent',
  players,
  user
}: Props) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const getWinnerInfo = () => {
    if (!isPublicDebate || !players || !user) {
      const isWinner = results.winner === 'user';
      const isAi = results.winner === 'ai';
      return {
        text: isWinner ? '🏆 You Won!' : isAi ? '🤖 AI Wins' : '🤝 Draw',
        color: isWinner ? 'from-green-400 to-emerald-400' : isAi ? 'from-red-400 to-orange-400' : 'from-yellow-400 to-amber-400'
      };
    }

    const isHost = players[user.uid]?.role === 'host';
    const amIWinner = (results.winner === 'host' && isHost) || (results.winner === 'challenger' && !isHost);
    const isOpponentWinner = (results.winner === 'host' && !isHost) || (results.winner === 'challenger' && isHost);

    if (amIWinner) {
      return {
        text: '🏆 You Won!',
        color: 'from-green-400 to-emerald-400'
      };
    } else if (isOpponentWinner) {
      return {
        text: `🎉 ${opponentName} Wins`,
        color: 'from-red-400 to-orange-400'
      };
    } else {
      return {
        text: '🤝 Draw',
        color: 'from-yellow-400 to-amber-400'
      };
    }
  };
  const { text: winnerText, color: winnerColor } = getWinnerInfo();

  const isHost = !isPublicDebate || (players && user && players[user.uid]?.role === 'host');
  const defaultScores = { logic: 5, evidence: 5, persuasiveness: 5, clarity: 5, emotionalTone: 5 };
  
  // Extract separate scores from the current player's map if public debate
  const finalScores = (isPublicDebate && players && user && players[user.uid]?.scores)
    ? players[user.uid].scores
    : (results.finalScores || defaultScores);

  const avgScore = Object.values(finalScores).reduce((a: any, b: any) => a + b, 0) / 5;
  const summary = results.summary || { bestUserArgument: 'N/A', bestAiArgument: 'N/A', conclusion: 'N/A'};

  // Swap arguments in Challenger's view so they always see their own best argument on top
  const displayBestUserArgument = isHost ? summary.bestUserArgument : summary.bestAiArgument;
  const displayBestOpponentArgument = isHost ? summary.bestAiArgument : summary.bestUserArgument;

  return (
    <div className={`space-y-6 transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {/* Winner Announcement */}
      <div className="glass-card p-8 text-center">
        <div className={`text-5xl md:text-6xl font-black font-display mb-3 text-transparent bg-clip-text bg-gradient-to-r ${winnerColor}`}>
          {winnerText}
        </div>
        <p className="text-gray-500 text-sm">
          {isPublicDebate ? `${myName} vs ${opponentName}` : `${personaIcon} vs You`} — "{topic}"
        </p>
        <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
          <span className="text-xs text-gray-500">Overall Score</span>
          <span className="text-lg font-bold text-cyan-400">{avgScore.toFixed(1)}/10</span>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-bold text-white mb-5 flex items-center gap-2">
          📊 Performance Breakdown
        </h3>
        <div className="space-y-4">
          <AnimatedBar label="🧠 Logic" value={finalScores.logic || 5} delay={200} />
          <AnimatedBar label="📚 Evidence" value={finalScores.evidence || 5} delay={400} />
          <AnimatedBar label="🎯 Persuasiveness" value={finalScores.persuasiveness || 5} delay={600} />
          <AnimatedBar label="💎 Clarity" value={finalScores.clarity || 5} delay={800} />
          <AnimatedBar label="🎭 Emotional Tone" value={finalScores.emotionalTone || 5} delay={1000} />
        </div>
      </div>

      {/* Debate Summary */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-bold text-white mb-4 flex items-center gap-2">
          📝 Debate Summary
        </h3>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/15">
            <div className="text-xs text-cyan-400 font-bold uppercase tracking-wider mb-1">
              Your Best Argument
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {displayBestUserArgument}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/15">
            <div className="text-xs text-red-400 font-bold uppercase tracking-wider mb-1">
              {isPublicDebate ? `👥 ${opponentName}'s Best Argument` : `${personaIcon} ${personaName}'s Best Argument`}
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {displayBestOpponentArgument}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">
              ⚖️ Verdict
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {summary.conclusion}
            </p>
          </div>
        </div>
      </div>

      {/* Volatility Meter */}
      <div className="glass-card p-4 flex items-center justify-between">
        <div>
          <span className="text-white font-semibold text-sm">Sentiment Volatility</span>
          <span className="text-gray-500 text-xs ml-2">How heated the debate got</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 rounded-full bg-dark-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
              style={{ width: `${results.sentimentVolatility * 100}%` }}
            />
          </div>
          <span className="text-sm font-bold text-yellow-400">
            {(results.sentimentVolatility * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Return Button */}
      <button
        id="return-to-arena-btn"
        onClick={onReturnToArena}
        className="w-full neon-button !py-4 text-lg group"
      >
        <span className="relative z-10 flex items-center justify-center gap-3">
          🔄 New Debate
          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </span>
      </button>
    </div>
  );
}
