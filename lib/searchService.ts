import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface SearchPost {
  id: string;
  title?: string;
  content: string;
  username: string;
  userEmail: string;
  userId: string;
  categories?: string[];
  tags?: string[];
  likes?: string[];
  comments?: number;
  createdAt: Timestamp;
  isPrivate: boolean;
  isDraft: boolean;
}

export async function searchPosts(searchQuery: string): Promise<SearchPost[]> {
  if (!searchQuery.trim()) return [];

  const q = query(
    collection(db, "posts"),
    where("isPrivate", "==", false),
    where("isDraft", "==", false),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);
  const allPosts = snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as SearchPost[];

  const term = searchQuery.toLowerCase().trim();

  return allPosts.filter((post) => {
    return (
      post.content?.toLowerCase().includes(term) ||
      post.title?.toLowerCase().includes(term) ||
      post.username?.toLowerCase().includes(term) ||
      post.userEmail?.toLowerCase().includes(term) ||
      post.tags?.some((tag) => tag.toLowerCase().includes(term)) ||
      post.categories?.some((cat) => cat.toLowerCase().includes(term))
    );
  });
}