import { useEffect, useState } from 'react';
import { getLeaderboard, type LeaderboardEntry } from '../../services/analyticsApi';

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard()
      .then(setLeaderboard)
      .catch((err) => console.error('Failed to load leaderboard', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
        <p className="text-gray-500 text-sm">Loading Rankings...</p>
      </div>
    );
  }

  if (!leaderboard.length) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">🏆</div>
        <p className="text-gray-500">The leaderboard is empty.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="font-display text-xl font-bold text-white mb-6 uppercase tracking-wider flex items-center gap-2">
        <span className="text-2xl">🏆</span> Global Leaderboard
      </h3>
      
      <div className="space-y-3">
        {leaderboard.map((entry, idx) => (
          <div 
            key={entry.uid} 
            className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
              idx === 0 ? 'bg-yellow-500/10 border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.1)]' :
              idx === 1 ? 'bg-gray-400/10 border-gray-400/30' :
              idx === 2 ? 'bg-amber-700/10 border-amber-700/30' :
              'bg-white/5 border-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-8 text-center font-black text-xl ${
                idx === 0 ? 'text-yellow-500' :
                idx === 1 ? 'text-gray-400' :
                idx === 2 ? 'text-amber-600' :
                'text-gray-600'
              }`}>
                #{idx + 1}
              </div>
              <div className="h-10 w-10 rounded-full bg-dark-elevated overflow-hidden border border-white/10 flex items-center justify-center">
                {entry.photoURL ? (
                  <img src={entry.photoURL} alt={entry.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-500 text-sm font-bold">{entry.displayName.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div>
                <div className="font-bold text-white">{entry.displayName}</div>
                <div className="text-xs text-gray-500">Top Debater</div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="font-black text-2xl text-cyan-400 font-display">{entry.totalPoints.toLocaleString()}</div>
              <div className="text-[10px] text-cyan-400/60 uppercase tracking-widest font-bold">Points</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
