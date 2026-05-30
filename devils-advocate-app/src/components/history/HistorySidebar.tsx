/**
 * ═══════════════════════════════════════════════════════════════════
 * HistorySidebar — Past Debates Panel
 * ═══════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import { getDebateHistory } from '../../services/debateApi';
import { useAuth } from '../../contexts/AuthContext';

interface DebateHistoryItem {
  debateId: string;
  topic: string;
  aiPersona: string;
  winner: string;
  startedAt: string;
  finalScores: Record<string, number> | null;
}

const PERSONA_ICONS: Record<string, string> = {
  devils_advocate: '😈',
  philosopher: '🏛️',
  scientist: '🔬',
  politician: '🎤',
  lawyer: '⚖️',
  skeptic: '🤨',
  historian: '📜',
  comedian: '🎭',
};

function WinnerBadge({ winner }: { winner: string }) {
  if (winner === 'user') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/20">WON</span>;
  if (winner === 'ai') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">LOST</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">DRAW</span>;
}

export default function HistorySidebar({ isOpen, onClose, onSelectDebate }: { isOpen: boolean; onClose: () => void; onSelectDebate: (item: DebateHistoryItem) => void }) {
  const { user } = useAuth();
  const [history, setHistory] = useState<DebateHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setLoading(true);
      getDebateHistory()
        .then(setHistory)
        .catch((err) => {
          console.warn('Failed to fetch debate history', err);
          setHistory([]);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, user]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-80 md:w-96 bg-dark-surface border-l border-dark-border z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            📜 Debate History
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-60px)] p-4 space-y-3">
          {!user ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🔒</div>
              <p className="text-gray-500 text-sm">Sign in to view your debate history</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
              <p className="text-gray-500 text-sm">Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">⚔️</div>
              <p className="text-gray-500 text-sm">No debates yet. Start your first one!</p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.debateId || item.startedAt}
                onClick={() => onSelectDebate(item)}
                className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/[0.08] hover:border-cyan-500/20 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{PERSONA_ICONS[item.aiPersona] || '🤖'}</span>
                    <span className="text-xs text-gray-500 capitalize">{item.aiPersona.replace('_', ' ')}</span>
                  </div>
                  <WinnerBadge winner={item.winner} />
                </div>
                <p className="text-sm text-gray-300 leading-snug line-clamp-2 mb-2">{item.topic}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-600">
                    {item.startedAt ? new Date(item.startedAt).toLocaleDateString() : 'Unknown date'}
                  </span>
                  {item.finalScores && (
                    <span className="text-[10px] text-cyan-400/60">
                      Avg: {(Object.values(item.finalScores).reduce((a, b) => a + b, 0) / Object.values(item.finalScores).length).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
