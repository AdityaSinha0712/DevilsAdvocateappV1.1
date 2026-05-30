import type { SentimentLabel } from '../types/debate';

export const SENTIMENT_COLORS: Record<SentimentLabel, { bg: string; text: string; border: string; emoji: string }> = {
  anger:    { bg: 'bg-red-500/15',    text: 'text-red-400',    border: 'border-red-500/30',    emoji: '😤' },
  neutral:  { bg: 'bg-gray-500/15',   text: 'text-gray-400',   border: 'border-gray-500/30',   emoji: '😐' },
  positive: { bg: 'bg-green-500/15',  text: 'text-green-400',  border: 'border-green-500/30',  emoji: '😊' },
  fear:     { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', emoji: '😨' },
  optimism: { bg: 'bg-cyan-500/15',   text: 'text-cyan-400',   border: 'border-cyan-500/30',   emoji: '🌟' },
};

export const getSentimentStyle = (label: SentimentLabel) => SENTIMENT_COLORS[label];
