"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Hook to check if current user is admin
 * Redirects to /login if not authenticated
 * Redirects to /home if authenticated but not admin
 */
export function useAdminCheck() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      // Wait for auth to finish loading
      if (loading) {
        setChecking(true);
        return;
      }
      
      // Redirect if not logged in
      if (!user) {
        console.log("No user found, redirecting to login");
        router.push("/login");
        setChecking(false);
        return;
      }

      try {
        // Check user's role in Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (!userDoc.exists()) {
          // User document doesn't exist
          console.log("User document doesn't exist, redirecting to home");
          router.push("/home");
          setChecking(false);
          return;
        }

        const userData = userDoc.data();
        const role = userData?.role;
        
        console.log("User role:", role); // Debug log
        
        if (role === "admin") {
          console.log("User is admin, allowing access");
          setIsAdmin(true);
          setChecking(false);
        } else {
          // Not an admin - redirect to home
          console.log("User is not an admin, redirecting to home");
          router.push("/home");
          setChecking(false);
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        router.push("/home");
        setChecking(false);
      }
    };

    checkAdmin();
  }, [user, loading, router]);

  return { isAdmin, checking };
}