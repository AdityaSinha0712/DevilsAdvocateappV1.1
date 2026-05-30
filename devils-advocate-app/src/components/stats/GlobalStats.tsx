import { useEffect, useState } from 'react';
import { getGlobalStatsData, type GlobalStats as GlobalStatsData } from '../../services/analyticsApi';

export default function GlobalStats() {
  const [stats, setStats] = useState<GlobalStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGlobalStatsData()
      .then(setStats)
      .catch((err) => console.error('Failed to load global stats', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-10 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
        <p className="text-gray-500 text-sm">Aggregating global data...</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="glass-card flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10 animate-fade-in relative overflow-hidden">
      {/* Decorative gradient orb */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-[80px] -translate-y-1/2 translate-x-1/2 rounded-full pointer-events-none" />
      
      <div className="p-6 md:w-1/3 flex flex-col justify-center">
        <h3 className="font-display text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Global Community</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black text-white">{stats.totalDebates.toLocaleString()}</span>
          <span className="text-sm font-medium text-gray-500">Total Debates</span>
        </div>
        <div className="mt-2 text-xs font-semibold text-cyan-400/80 bg-cyan-400/10 inline-block px-2 py-1 rounded w-max border border-cyan-400/20">
          {stats.totalUsers.toLocaleString()} Active Debaters
        </div>
      </div>

      <div className="p-6 md:w-2/3 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Platform Avg Logic</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black text-teal-400 font-display">{stats.avgLogic.toFixed(1)}</span>
            <span className="text-sm text-gray-400 mb-1">/ 10</span>
          </div>
          <div className="w-full h-1.5 bg-dark-elevated rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-teal-400 rounded-full" style={{ width: `${(stats.avgLogic / 10) * 100}%` }} />
          </div>
        </div>
        
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Platform Avg Persuasiveness</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black text-cyan-400 font-display">{stats.avgPersuasiveness.toFixed(1)}</span>
            <span className="text-sm text-gray-400 mb-1">/ 10</span>
          </div>
          <div className="w-full h-1.5 bg-dark-elevated rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${(stats.avgPersuasiveness / 10) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
