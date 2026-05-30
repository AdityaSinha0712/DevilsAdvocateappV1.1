import { useEffect, useState } from 'react';
import { getTrendingTopics, type TrendingTopic } from '../../services/analyticsApi';

export default function TrendingTopics() {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTrendingTopics()
      .then(setTopics)
      .catch((err) => console.error('Failed to load trending topics', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
        <p className="text-gray-500 text-sm">Analyzing global debates...</p>
      </div>
    );
  }

  if (!topics.length) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">🧊</div>
        <p className="text-gray-500">No trending topics right now.</p>
      </div>
    );
  }

  // Calculate scaling for word cloud sizes
  const maxVal = Math.max(...topics.map(t => t.value));
  const minVal = Math.min(...topics.map(t => t.value));

  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="font-display text-xl font-bold text-white mb-6 uppercase tracking-wider flex items-center gap-2">
        <span className="text-2xl">🔥</span> Trending Keywords
      </h3>
      
      <div className="flex flex-wrap gap-3 justify-center py-4">
        {topics.map((topic, i) => {
          // Map frequency to font-size classes loosely
          const relativeFreq = maxVal === minVal ? 1 : (topic.value - minVal) / (maxVal - minVal);
          
          let sizeClass = 'text-sm font-medium';
          let colorClass = 'text-gray-400 border-white/5 bg-white/5';
          
          if (relativeFreq > 0.8) {
            sizeClass = 'text-2xl font-black';
            colorClass = 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10 shadow-[0_0_15px_rgba(34,211,238,0.2)]';
          } else if (relativeFreq > 0.5) {
            sizeClass = 'text-lg font-bold';
            colorClass = 'text-teal-300 border-teal-400/20 bg-teal-400/5';
          } else if (relativeFreq > 0.2) {
            sizeClass = 'text-base font-semibold';
            colorClass = 'text-gray-300 border-white/10 bg-white/5 hover:bg-white/10';
          }

          return (
            <div 
              key={`${topic.text}-${i}`}
              className={`px-4 py-2 rounded-full border transition-all hover:scale-105 cursor-default ${sizeClass} ${colorClass}`}
              title={`Used in ${topic.value} debates`}
            >
              {topic.text}
              <span className="ml-2 opacity-50 text-[0.6em]">{topic.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
