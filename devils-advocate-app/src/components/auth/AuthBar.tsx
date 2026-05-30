/**
 * ═══════════════════════════════════════════════════════════════════
 * AuthBar — Login/Logout UI
 * ═══════════════════════════════════════════════════════════════════
 */

import { useAuth } from '../../contexts/AuthContext';

export default function AuthBar() {
  const { user, loading, signIn, logOut } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
        <div className="w-4 h-4 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin" />
        <span className="text-xs text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <button
        id="login-btn"
        onClick={signIn}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/30 transition-all duration-300 group"
      >
        <svg className="w-4 h-4 text-gray-400 group-hover:text-cyan-400 transition-colors" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        <span className="text-sm text-gray-400 group-hover:text-white transition-colors font-medium">
          Sign in with Google
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            className="w-6 h-6 rounded-full border border-cyan-500/30"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-xs font-bold text-black">
            {user.displayName?.[0] || '?'}
          </div>
        )}
        <span className="text-sm text-gray-300 font-medium max-w-[120px] truncate">
          {user.displayName || user.email}
        </span>
      </div>
      <button
        id="logout-btn"
        onClick={logOut}
        className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all"
      >
        Sign Out
      </button>
    </div>
  );
}
