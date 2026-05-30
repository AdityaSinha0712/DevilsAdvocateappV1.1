/**
 * ═══════════════════════════════════════════════════════════════════
 * Devil's Advocate — Firebase Configuration
 * ═══════════════════════════════════════════════════════════════════
 */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth: Auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

// ─── Auth Helpers ────────────────────────────────────────────────
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google sign-in failed:", error);
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch (error) {
    console.error("Sign-out failed:", error);
  }
}

export async function getIdToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export { onAuthStateChanged };
export type { User };

console.log("🔥 Firebase Frontend Initialized!");