/**
 * ═══════════════════════════════════════════════════════════════════
 * AuthContext — Firebase Auth State Provider
 * ═══════════════════════════════════════════════════════════════════
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth, onAuthStateChanged, signInWithGoogle, signOut, getIdToken, type User } from '../config/firebase';
import { setAuthToken, syncUserToBackend } from '../services/debateApi';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  logOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const token = await getIdToken();
        setAuthToken(token);
        
        // Sync user payload with backend
        try {
          await syncUserToBackend({
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
          });
        } catch (error) {
          console.error("Failed to sync user with backend:", error);
        }
      } else {
        setAuthToken(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    await signInWithGoogle();
  };

  const logOut = async () => {
    await signOut();
    setAuthToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
