/**
 * ═══════════════════════════════════════════════════════════════════
 * StatsPage — User Debate Statistics Dashboard
 * ═══════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getDebateHistory } from '../../services/debateApi';
import Leaderboard from './Leaderboard';
import TrendingTopics from './TrendingTopics';
import GlobalStats from './GlobalStats';

interface DebateHistoryItem {
  debateId: string;
  topic: string;
  aiPersona: string;
  winner: string;
  startedAt: string;
  finalScores: Record<string, number> | null;
}

interface ComputedStats {
  totalDebates: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgScores: {
    logic: number;
    evidence: number;
    persuasiveness: number;
    clarity: number;
    emotionalTone: number;
  };
  personaBreakdown: Record<string, { count: number; wins: number }>;
  recentStreak: string[];
}

function computeStats(history: DebateHistoryItem[]): ComputedStats {
  const wins = history.filter(d => d.winner === 'user').length;
  const losses = history.filter(d => d.winner === 'ai').length;
  const draws = history.filter(d => d.winner === 'draw').length;
  const total = history.length;

  const scored = history.filter(d => d.finalScores);
  const avgScores = {
    logic: scored.length ? scored.reduce((a, d) => a + (d.finalScores?.logic || 0), 0) / scored.length : 0,
    evidence: scored.length ? scored.reduce((a, d) => a + (d.finalScores?.evidence || 0), 0) / scored.length : 0,
    persuasiveness: scored.length ? scored.reduce((a, d) => a + (d.finalScores?.persuasiveness || 0), 0) / scored.length : 0,
    clarity: scored.length ? scored.reduce((a, d) => a + (d.finalScores?.clarity || 0), 0) / scored.length : 0,
    emotionalTone: scored.length ? scored.reduce((a, d) => a + (d.finalScores?.emotionalTone || 0), 0) / scored.length : 0,
  };

  const personaBreakdown: Record<string, { count: number; wins: number }> = {};
  for (const d of history) {
    if (!personaBreakdown[d.aiPersona]) personaBreakdown[d.aiPersona] = { count: 0, wins: 0 };
    personaBreakdown[d.aiPersona].count++;
    if (d.winner === 'user') personaBreakdown[d.aiPersona].wins++;
  }

  const recentStreak = history.slice(0, 10).map(d => d.winner);

  return { totalDebates: total, wins, losses, draws, winRate: total ? wins / total : 0, avgScores, personaBreakdown, recentStreak };
}

const PERSONA_ICONS: Record<string, string> = {
  devils_advocate: '😈', philosopher: '🏛️', scientist: '🔬', politician: '🎤',
  lawyer: '⚖️', skeptic: '🤨', historian: '📜', comedian: '🎭',
};

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="glass-card p-5 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl md:text-3xl font-black font-display text-white">{value}</div>
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">{label}</div>
      {sub && <div className="text-[10px] text-cyan-400/60 mt-0.5">{sub}</div>}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-28 text-right">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-dark-elevated overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-700"
          style={{ width: `${(value / 10) * 100}%` }}
        />
      </div>
      <span className="text-xs font-bold text-cyan-400 w-8">{value.toFixed(1)}</span>
    </div>
  );
}

export default function StatsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ComputedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'personal' | 'leaderboard' | 'community'>('personal');

  useEffect(() => {
    if (user) {
      setLoading(true);
      getDebateHistory()
        .then(history => setStats(computeStats(history)))
        .catch(() => setStats(null))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="text-center py-20 animate-fade-in">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="font-display text-2xl font-bold text-white mb-2">Sign In Required</h2>
        <p className="text-gray-500">Sign in to view your debate statistics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 animate-fade-in">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
        <p className="text-gray-500 text-sm">Loading your stats...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in w-full max-w-5xl mx-auto">
      {/* ─── Sub-Navigation Tabs ─── */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center p-1 bg-dark-elevated rounded-xl border border-white/5 shadow-2xl">
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'personal' ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            👤 Personal Stats
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'leaderboard' ? 'bg-yellow-500/20 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            🏆 Leaderboard
          </button>
          <button
            onClick={() => setActiveTab('community')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'community' ? 'bg-teal-500/20 text-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.2)]' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            🌍 Community Insights
          </button>
        </div>
      </div>

      {activeTab === 'leaderboard' && <Leaderboard />}
      
      {activeTab === 'community' && (
        <div className="space-y-6">
          <GlobalStats />
          <TrendingTopics />
        </div>
      )}

      {activeTab === 'personal' && (
        !stats || stats.totalDebates === 0 ? (
          <div className="text-center py-20 animate-fade-in bg-white/5 border border-white/10 rounded-3xl">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="font-display text-2xl font-bold text-white mb-2">No Stats Yet</h2>
            <p className="text-gray-500">Complete your first debate to see your progress!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon="⚔️" label="Total Debates" value={stats.totalDebates} />
              <StatCard icon="🏆" label="Wins" value={stats.wins} sub={`${(stats.winRate * 100).toFixed(0)}% win rate`} />
              <StatCard icon="💀" label="Losses" value={stats.losses} />
              <StatCard icon="🤝" label="Draws" value={stats.draws} />
            </div>

            {/* Recent Streak */}
            <div className="glass-card p-5">
              <h3 className="font-display text-sm font-bold text-white mb-3 uppercase tracking-wider">Recent Results</h3>
              <div className="flex gap-2 flex-wrap">
                {stats.recentStreak.map((result, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${
                      result === 'user' ? 'bg-green-500/15 border-green-500/30 text-green-400' :
                      result === 'ai' ? 'bg-red-500/15 border-red-500/30 text-red-400' :
                      'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                    }`}
                  >
                    {result === 'user' ? 'W' : result === 'ai' ? 'L' : 'D'}
                  </div>
                ))}
              </div>
            </div>

            {/* Average Scores */}
            <div className="glass-card p-6">
              <h3 className="font-display text-sm font-bold text-white mb-5 uppercase tracking-wider">Average Scores</h3>
              <div className="space-y-3">
                <ScoreBar label="🧠 Logic" value={stats.avgScores.logic} />
                <ScoreBar label="📚 Evidence" value={stats.avgScores.evidence} />
                <ScoreBar label="🎯 Persuasiveness" value={stats.avgScores.persuasiveness} />
                <ScoreBar label="💎 Clarity" value={stats.avgScores.clarity} />
                <ScoreBar label="🎭 Emotional Tone" value={stats.avgScores.emotionalTone} />
              </div>
            </div>

            {/* Persona Breakdown */}
            <div className="glass-card p-6">
              <h3 className="font-display text-sm font-bold text-white mb-4 uppercase tracking-wider">Opponent Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(stats.personaBreakdown).map(([persona, data]) => (
                  <div key={persona} className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                    <div className="text-2xl mb-1">{PERSONA_ICONS[persona] || '🤖'}</div>
                    <div className="text-xs text-gray-400 capitalize mb-1">{persona.replace('_', ' ')}</div>
                    <div className="text-sm font-bold text-white">{data.count} debates</div>
                    <div className="text-[10px] text-green-400">{data.wins} wins</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
