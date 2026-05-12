"use client";

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { subscribeToNotifications, Notification } from "@/lib/notificationService";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  notifications: Notification[];
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  notifications: [],
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notifUnsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Tear down any existing listener first
      if (notifUnsubRef.current) {
        notifUnsubRef.current();
        notifUnsubRef.current = null;
      }

      // Set up listener only when logged in
      if (firebaseUser) {
        notifUnsubRef.current = subscribeToNotifications(
          firebaseUser.uid,
          setNotifications
        );
      } else {
        setNotifications([]);
      }
    });

    return () => {
      unsubscribeAuth();
      notifUnsubRef.current?.();
    };
  }, []);

  const signInWithGoogle = async (): Promise<void> => {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;

    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        username:
          firebaseUser.displayName ??
          firebaseUser.email?.split("@")[0] ??
          "user",
        bio: "",
        profileImage: firebaseUser.photoURL ?? "",
        gender: "",
        role: "user",
        banned: false,
        following: [],
        followers: [],
        bookmarks: [],
        createdAt: serverTimestamp(),
      });
    }
  };

  const signOut = async (): Promise<void> => {
    // Unsubscribe BEFORE signing out so the listener
    // doesn't fire with a null user and get permission-denied
    if (notifUnsubRef.current) {
      notifUnsubRef.current();
      notifUnsubRef.current = null;
    }
    setNotifications([]);
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, notifications, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}