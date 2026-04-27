import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Toggle a bookmark on a post for the current user.
 * Returns true if now bookmarked, false if removed.
 */
export async function toggleBookmark(
  userId: string,
  postId: string
): Promise<boolean> {
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  const bookmarks: string[] = userSnap.exists()
    ? userSnap.data()?.bookmarks ?? []
    : [];

  const isBookmarked = bookmarks.includes(postId);

  await updateDoc(userRef, {
    bookmarks: isBookmarked ? arrayRemove(postId) : arrayUnion(postId),
  });

  return !isBookmarked;
}

/**
 * Get all bookmarked post IDs for a user.
 */
export async function getBookmarkedIds(userId: string): Promise<string[]> {
  const userSnap = await getDoc(doc(db, "users", userId));
  if (!userSnap.exists()) return [];
  return userSnap.data()?.bookmarks ?? [];
}

/**
 * Fetch full post documents for all bookmarked post IDs.
 * Firestore `in` queries support max 30 items — we chunk if needed.
 */
export async function getBookmarkedPosts(userId: string): Promise<any[]> {
  const ids = await getBookmarkedIds(userId);
  if (ids.length === 0) return [];

  // Chunk into groups of 30 (Firestore limit for `in` queries)
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) {
    chunks.push(ids.slice(i, i + 30));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, "posts"), where("__name__", "in", chunk)))
    )
  );

  const posts = results.flatMap((snap) =>
    snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  );

  // Preserve bookmark order (most recently bookmarked last in array = show first)
  return posts.sort(
    (a, b) => ids.indexOf(b.id) - ids.indexOf(a.id)
  );
}