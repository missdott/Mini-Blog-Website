import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  createFollowNotification,
  removeFollowNotification,
} from "./notificationService";

/**
 * Toggle follow/unfollow between two users.
 * Updates `following` on the current user and `followers` on the target user.
 * Fires or removes a follow notification.
 * Returns true if now following, false if now unfollowed.
 */
export async function toggleFollow(
  currentUserId: string,
  targetUserId: string,
  isCurrentlyFollowing: boolean,
  currentUserName?: string
): Promise<boolean> {
  if (currentUserId === targetUserId) return isCurrentlyFollowing;

  const currentUserRef = doc(db, "users", currentUserId);
  const targetUserRef = doc(db, "users", targetUserId);

  const [currentUserDoc, targetUserDoc] = await Promise.all([
    getDoc(currentUserRef),
    getDoc(targetUserRef),
  ]);

  if (!currentUserDoc.exists()) {
    await setDoc(currentUserRef, { following: [], followers: [] });
  }
  if (!targetUserDoc.exists()) {
    await setDoc(targetUserRef, { following: [], followers: [] });
  }

  const senderName = currentUserName
    || currentUserDoc.data()?.username
    || currentUserDoc.data()?.email
    || "Someone";

  if (isCurrentlyFollowing) {
    await Promise.all([
      updateDoc(currentUserRef, { following: arrayRemove(targetUserId) }),
      updateDoc(targetUserRef, { followers: arrayRemove(currentUserId) }),
    ]);
    // Remove follow notification
    removeFollowNotification(targetUserId, currentUserId).catch(console.error);
    return false;
  } else {
    await Promise.all([
      updateDoc(currentUserRef, { following: arrayUnion(targetUserId) }),
      updateDoc(targetUserRef, { followers: arrayUnion(currentUserId) }),
    ]);
    // Create follow notification
    createFollowNotification(targetUserId, currentUserId, senderName).catch(console.error);
    return true;
  }
}

/**
 * Get the list of userIds the current user is following.
 */
export async function getFollowing(userId: string): Promise<string[]> {
  const userDoc = await getDoc(doc(db, "users", userId));
  return userDoc.exists() ? (userDoc.data()?.following ?? []) : [];
}

/**
 * Get follower count for a user — single document read.
 */
export async function getFollowerCount(userId: string): Promise<number> {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return 0;
  return (userDoc.data()?.followers ?? []).length;
}

/**
 * Get following count for a user — single document read.
 */
export async function getFollowingCount(userId: string): Promise<number> {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return 0;
  return (userDoc.data()?.following ?? []).length;
}