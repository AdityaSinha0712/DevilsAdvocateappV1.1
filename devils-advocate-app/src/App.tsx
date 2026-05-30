import { useState, useCallback } from 'react';
import DebateArena from './components/arena/DebateArena';
import StatsPage from './components/stats/StatsPage';
import HistorySidebar from './components/history/HistorySidebar';
import AuthBar from './components/auth/AuthBar';
import PublicLobbies from './components/arena/PublicLobbies';

type View = 'arena' | 'stats' | 'lobbies';

export interface LoadDebatePayload {
  debateId: string;
  topic: string;
  aiPersona: string;
  isCreatingPublic?: boolean;
  isJoiningLobby?: boolean;
  isCreatorResuming?: boolean;
  isHistoryView?: boolean;
}

function App() {
  const [currentView, setCurrentView] = useState<View>('arena');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadDebatePayload, setLoadDebatePayload] = useState<LoadDebatePayload | null>(null);
  const [hasActiveDebate, setHasActiveDebate] = useState(false);
  const [activeDebatePayload, setActiveDebatePayload] = useState<LoadDebatePayload | null>(null);
  const [hasActiveLobbyWaiting, setHasActiveLobbyWaiting] = useState(false);

  const handleDebateActiveChange = useCallback((active: boolean, payload?: LoadDebatePayload) => {
    setHasActiveDebate(active);
    if (active && payload) {
      setActiveDebatePayload(payload);
    } else if (!active) {
      setActiveDebatePayload(null);
    }
  }, []);

  // Is the user viewing a history debate while an active debate is in progress?
  const isViewingHistoryWhileActive = hasActiveDebate && !!loadDebatePayload?.isHistoryView;

  const handleReturnToActive = useCallback(() => {
    setCurrentView('arena');
    if (activeDebatePayload) {
      setLoadDebatePayload(activeDebatePayload);
    }
  }, [activeDebatePayload]);

  return (
    <div className="min-h-screen bg-black">
      {/* ─── Top Navigation Bar ─── */}
      <nav className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-dark-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Left — Navigation Tabs */}
          <div className="flex items-center gap-1">
            <button
              id="nav-arena"
              onClick={() => {
                setCurrentView('arena');
                if (isViewingHistoryWhileActive) {
                  if (activeDebatePayload) {
                    setLoadDebatePayload(activeDebatePayload);
                  }
                } else if (loadDebatePayload?.isHistoryView) {
                  setLoadDebatePayload(null);
                }
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 relative ${
                currentView === 'arena'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              ⚔️ Arena
              {/* Active debate indicator dot */}
              {(hasActiveDebate || hasActiveLobbyWaiting) && currentView !== 'arena' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
              )}
            </button>
            <button
              id="nav-stats"
              onClick={() => setCurrentView('stats')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                currentView === 'stats'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              📊 Stats
            </button>
            <button
              id="nav-lobbies"
              onClick={() => setCurrentView('lobbies')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                currentView === 'lobbies'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              🌐 Lobbies
            </button>
            <button
              id="nav-history"
              onClick={() => setHistoryOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all duration-300 border border-transparent"
            >
              📜 History
            </button>
          </div>

          {/* Right — Auth */}
          <AuthBar />
        </div>
      </nav>

      {/* ─── Page Content ─── */}
      <div className={currentView === 'arena' ? 'block' : 'hidden'}>
        <DebateArena 
          loadDebatePayload={loadDebatePayload} 
          onDebateActiveChange={handleDebateActiveChange}
          onReturnToArenaOverride={isViewingHistoryWhileActive ? handleReturnToActive : undefined}
          isHistoryMode={!!loadDebatePayload?.isHistoryView}
        />
      </div>
      <div className={currentView === 'lobbies' ? 'block' : 'hidden'}>
        <PublicLobbies 
          onWaitingChange={(isWaiting) => setHasActiveLobbyWaiting(isWaiting)}
          onJoinDebate={(lobby: any) => {
            // Check if this is the creator being auto-transitioned (lobby._isCreatorResuming)
            // vs a new user clicking "Join Debate"
            const isCreatorResuming = lobby._isCreatorResuming === true;
            setLoadDebatePayload({
              debateId: lobby.id,
              topic: lobby.topic,
              aiPersona: lobby.aiPersona || 'devils_advocate',
              isJoiningLobby: !isCreatorResuming,
              isCreatorResuming: isCreatorResuming,
            });
            setCurrentView('arena');
          }}
        />
      </div>
      <div className={currentView === 'stats' ? 'block' : 'hidden'}>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <StatsPage />
        </div>
      </div>
      {/* ─── Floating "Return to Debate" Banner ─── */}
      {(hasActiveDebate || hasActiveLobbyWaiting) && (currentView !== (hasActiveLobbyWaiting ? 'lobbies' : 'arena') || isViewingHistoryWhileActive) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <button
            id="return-to-debate-btn"
            onClick={hasActiveLobbyWaiting ? () => setCurrentView('lobbies') : handleReturnToActive}
            className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-display font-bold text-sm shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_40px_rgba(6,182,212,0.6)] hover:scale-105 transition-all duration-300 border border-cyan-400/30"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
            </span>
            ⚔️ Return to {hasActiveLobbyWaiting ? 'Waiting Lobby' : 'Active Debate'}
          </button>
        </div>
      )}

      {/* ─── History Sidebar ─── */}
      <HistorySidebar 
        isOpen={historyOpen} 
        onClose={() => setHistoryOpen(false)} 
        onSelectDebate={(item) => {
          setLoadDebatePayload({
            debateId: item.debateId,
            topic: item.topic,
            aiPersona: item.aiPersona,
            isHistoryView: true,
          });
          setCurrentView('arena');
          setHistoryOpen(false);
        }}
      />
    </div>
  );
}

export default App;
