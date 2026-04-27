import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Check if a user has admin role
 * @param uid - User ID to check
 * @returns true if user is admin, false otherwise
 */
export async function isAdmin(uid: string): Promise<boolean> {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return false;
    
    const role = userDoc.data()?.role;
    return role === "admin";
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}