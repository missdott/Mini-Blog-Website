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

interface BookmarkedPost {
  id: string;
  [key: string]: unknown;
}

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

export async function getBookmarkedIds(userId: string): Promise<string[]> {
  const userSnap = await getDoc(doc(db, "users", userId));
  if (!userSnap.exists()) return [];
  return userSnap.data()?.bookmarks ?? [];
}

export async function getBookmarkedPosts(userId: string): Promise<BookmarkedPost[]> {
  const ids = await getBookmarkedIds(userId);
  if (ids.length === 0) return [];

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
    snap.docs.map((d): BookmarkedPost => ({ id: d.id, ...d.data() }))
  );

  // Fetch profileImage for each post's author
  const uniqueUserIds = [...new Set(posts.map((p) => p.userId as string).filter(Boolean))];
  const userSnaps = await Promise.all(uniqueUserIds.map((uid) => getDoc(doc(db, "users", uid))));
  const profileImages: Record<string, string> = {};
  userSnaps.forEach((snap) => {
    if (snap.exists()) profileImages[snap.id] = snap.data()?.profileImage ?? "";
  });

  const postsWithImages = posts.map((p) => ({
    ...p,
    profileImage: profileImages[p.userId as string] ?? "",
  }));

  return postsWithImages.sort((a, b) => ids.indexOf(b.id) - ids.indexOf(a.id));
}