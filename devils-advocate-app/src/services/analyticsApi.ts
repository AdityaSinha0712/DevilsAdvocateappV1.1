const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  totalPoints: number;
}

export interface TrendingTopic {
  text: string;
  value: number;
}

export interface GlobalStats {
  totalDebates: number;
  totalUsers: number;
  avgLogic: number;
  avgPersuasiveness: number;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch(`${API_URL}/analytics/leaderboard`);
  if (!response.ok) throw new Error('Network response was not ok');
  const data = await response.json();
  return data.data;
}

export async function getTrendingTopics(): Promise<TrendingTopic[]> {
  const response = await fetch(`${API_URL}/analytics/trending-topics`);
  if (!response.ok) throw new Error('Network response was not ok');
  const data = await response.json();
  return data.data;
}

export async function getGlobalStatsData(): Promise<GlobalStats> {
  const response = await fetch(`${API_URL}/analytics/global-stats`);
  if (!response.ok) throw new Error('Network response was not ok');
  const data = await response.json();
  return data.data;
}
