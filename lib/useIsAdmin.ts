"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Hook to check if current user is admin (without redirecting)
 * Used for UI purposes like showing/hiding moderation actions
 * Returns the admin status, doesn't redirect non-admins
 */
export function useIsAdmin() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      // Don't check if still loading auth
      if (loading) {
        return;
      }

      // If no user, they're not admin
      if (!user) {
        setIsAdmin(false);
        setChecking(false);
        return;
      }

      try {
        // Check user's role in Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (!userDoc.exists()) {
          setIsAdmin(false);
          setChecking(false);
          return;
        }

        const userData = userDoc.data();
        const role = userData?.role;

        setIsAdmin(role === "admin");
        setChecking(false);
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
        setChecking(false);
      }
    };

    checkAdmin();
  }, [user, loading]);

  return { isAdmin, checking };
}
