import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  doc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = "like" | "comment" | "follow";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  recipientId: string;   // user who receives the notification
  senderId: string;      // user who triggered it
  senderName: string;    // display name of sender
  postId?: string;       // relevant post (for like/comment)
  postTitle?: string;    // post title snippet
  read: boolean;
  createdAt: any;
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a like notification.
 * Skip if the liker is the post author (don't notify yourself).
 */
export async function createLikeNotification(
  recipientId: string,
  senderId: string,
  senderName: string,
  postId: string,
  postTitle?: string
): Promise<void> {
  if (recipientId === senderId) return;

  // Avoid duplicate like notifications for the same post
  const existing = await getDocs(
    query(
      collection(db, "notifications"),
      where("recipientId", "==", recipientId),
      where("senderId", "==", senderId),
      where("postId", "==", postId),
      where("type", "==", "like")
    )
  );
  if (!existing.empty) return;

  await addDoc(collection(db, "notifications"), {
    type: "like",
    message: `${senderName} liked your post${postTitle ? ` "${postTitle}"` : ""}`,
    recipientId,
    senderId,
    senderName,
    postId,
    postTitle: postTitle ?? "",
    read: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Remove a like notification (when user unlikes).
 */
export async function removeLikeNotification(
  recipientId: string,
  senderId: string,
  postId: string
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, "notifications"),
      where("recipientId", "==", recipientId),
      where("senderId", "==", senderId),
      where("postId", "==", postId),
      where("type", "==", "like")
    )
  );
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/**
 * Create a comment notification.
 */
export async function createCommentNotification(
  recipientId: string,
  senderId: string,
  senderName: string,
  postId: string,
  postTitle?: string
): Promise<void> {
  if (recipientId === senderId) return;

  await addDoc(collection(db, "notifications"), {
    type: "comment",
    message: `${senderName} commented on your post${postTitle ? ` "${postTitle}"` : ""}`,
    recipientId,
    senderId,
    senderName,
    postId,
    postTitle: postTitle ?? "",
    read: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Create a follow notification.
 */
export async function createFollowNotification(
  recipientId: string,
  senderId: string,
  senderName: string
): Promise<void> {
  if (recipientId === senderId) return;

  // Avoid duplicate follow notifications
  const existing = await getDocs(
    query(
      collection(db, "notifications"),
      where("recipientId", "==", recipientId),
      where("senderId", "==", senderId),
      where("type", "==", "follow")
    )
  );
  if (!existing.empty) return;

  await addDoc(collection(db, "notifications"), {
    type: "follow",
    message: `${senderName} started following you`,
    recipientId,
    senderId,
    senderName,
    postId: "",
    postTitle: "",
    read: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Remove a follow notification (when user unfollows).
 */
export async function removeFollowNotification(
  recipientId: string,
  senderId: string
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, "notifications"),
      where("recipientId", "==", recipientId),
      where("senderId", "==", senderId),
      where("type", "==", "follow")
    )
  );
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to real-time notifications for a user.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(30)
  );

  return onSnapshot(q, (snap) => {
    const notifications = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Notification[];
    callback(notifications);
  });
}

// ─── Mark read ────────────────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, "notifications"),
      where("recipientId", "==", userId),
      where("read", "==", false)
    )
  );
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}