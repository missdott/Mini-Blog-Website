import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  getDoc,
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { createCommentNotification } from "./notificationService";

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userEmail: string;
  userProfileImage?: string;
  content: string;
  likes: string[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AddCommentPayload {
  postId: string;
  userId: string;
  username: string;
  userEmail: string;
  userProfileImage?: string;
  content: string;
}

const COMMENTS_PER_PAGE = 10;

function toComment(docSnap: QueryDocumentSnapshot<DocumentData>): Comment {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    postId: data.postId,
    userId: data.userId,
    username: data.username,
    userEmail: data.userEmail,
    userProfileImage: data.userProfileImage,
    content: data.content,
    likes: data.likes ?? [],
    isDeleted: data.isDeleted ?? false,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

export async function getComments(
  postId: string,
  lastDoc?: QueryDocumentSnapshot<DocumentData>
): Promise<{ comments: Comment[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
  const ref = collection(db, "comments");
  const constraints: QueryConstraint[] = [
    where("postId", "==", postId),
    orderBy("createdAt", "asc"),
    limit(COMMENTS_PER_PAGE),
  ];
  if (lastDoc) constraints.push(startAfter(lastDoc));
  const snap = await getDocs(query(ref, ...constraints));
  let comments = snap.docs.map(toComment);

  // Fetch updated user profile images
  const userIds = [...new Set(comments.map((c) => c.userId))];
  const profileMap: Record<string, string> = {};
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) {
          profileMap[uid] = userSnap.data().profileImage || "";
        }
      } catch {
        // skip silently
      }
    })
  );

  comments = comments.map((c) => ({
    ...c,
    userProfileImage: profileMap[c.userId] || c.userProfileImage || "",
  }));

  const newLastDoc = snap.docs.length === COMMENTS_PER_PAGE
    ? snap.docs[snap.docs.length - 1]
    : null;
  return { comments, lastDoc: newLastDoc };
}

export async function addComment(payload: AddCommentPayload): Promise<Comment> {
  const { postId, userId, username, userEmail, userProfileImage, content } = payload;
  if (!content.trim()) throw new Error("Comment cannot be empty.");
  if (content.trim().length > 1000) throw new Error("Comment is too long (max 1000 chars).");

  const commentRef = await addDoc(collection(db, "comments"), {
    postId, userId, username, userEmail,
    userProfileImage: userProfileImage || "",
    content: content.trim(),
    likes: [],
    isDeleted: false,
    createdAt: serverTimestamp(),
  });

  const postRef = doc(db, "posts", postId);
  await updateDoc(postRef, { comments: increment(1) });

  try {
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const postData = postSnap.data();
      await createCommentNotification(
        postData.userId,
        userId,
        username,
        postId,
        postData.title ?? ""
      );
    }
  } catch (err) {
    console.error("Failed to create comment notification:", err);
  }

  return {
    id: commentRef.id,
    postId, userId, username, userEmail,
    userProfileImage: userProfileImage || "",
    content: content.trim(),
    likes: [],
    isDeleted: false,
    createdAt: new Date(),
  };
}

export async function editComment(commentId: string, newContent: string): Promise<void> {
  if (!newContent.trim()) throw new Error("Comment cannot be empty.");
  if (newContent.trim().length > 1000) throw new Error("Comment is too long (max 1000 chars).");
  await updateDoc(doc(db, "comments", commentId), {
    content: newContent.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteComment(commentId: string, postId: string): Promise<void> {
  await updateDoc(doc(db, "comments", commentId), {
    isDeleted: true, content: "", updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "posts", postId), { comments: increment(-1) });
}

export async function hardDeleteComment(commentId: string, postId: string): Promise<void> {
  await deleteDoc(doc(db, "comments", commentId));
  await updateDoc(doc(db, "posts", postId), { comments: increment(-1) });
}

export async function deleteAllCommentsForPost(postId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, "comments"), where("postId", "==", postId))
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function toggleCommentLike(
  commentId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<void> {
  await updateDoc(doc(db, "comments", commentId), {
    likes: currentlyLiked ? arrayRemove(userId) : arrayUnion(userId),
  });
}