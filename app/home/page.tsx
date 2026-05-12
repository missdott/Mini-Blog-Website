"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { collection, query, orderBy, where, onSnapshot, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { toggleFollow, getFollowing } from "@/lib/followService";
import { subscribeToNotifications, markNotificationRead, markAllNotificationsRead, createLikeNotification, removeLikeNotification, Notification as AppNotification } from "@/lib/notificationService";
import { toggleBookmark, getBookmarkedIds } from "@/lib/bookmarkService";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirestoreTimestamp { toDate: () => Date; }
interface FirebaseUser { uid: string; email: string | null; displayName: string | null; }
interface Post {
  id: string; title?: string; content: string; username: string;
  userEmail: string; userId: string; createdAt: FirestoreTimestamp | null;
  likes?: string[]; comments?: number; isPrivate: boolean; isDraft: boolean;
  tags?: string[]; featuredImage?: string; featuredImages?: string[]; galleryImages?: string[];
  profileImage?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: FirestoreTimestamp | string | number | null): string {
  if (!ts) return "";
  const date = typeof ts === "object" && "toDate" in ts ? ts.toDate() : new Date(ts as string | number);
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const notificationIcon = (type: string) => type === "like" ? "❤️" : type === "comment" ? "💬" : "👤";
const getPostImages = (post: Post) => [...(post.featuredImage ? [post.featuredImage] : []), ...(post.galleryImages ?? [])];
const getDisplayName = (post: Post) => post.username || post.userEmail?.split("@")[0];
const getInitial = (post: Post) => (post.username || post.userEmail || "U")[0].toUpperCase();

function Avatar({ post, size = 10 }: { post: Post; size?: number }) {
  const px = `w-${size} h-${size}`;
  if (post.profileImage) {
    return (
      <div className={`${px} rounded-full overflow-hidden shrink-0 relative`}>
        <Image src={post.profileImage} alt={post.username || "User"} fill className="object-cover" unoptimized />
      </div>
    );
  }
  const textSize = size <= 6 ? "text-[10px]" : size <= 7 ? "text-xs" : "text-sm";
  return (
    <div className={`${px} rounded-full bg-[#2F4B7C] flex items-center justify-center text-white font-bold ${textSize} shrink-0`}>
      {getInitial(post)}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const iconProps = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };

function MoreIcon({ className }: { className?: string }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>;
}
function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return <svg className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path {...sw2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
}
function CommentIcon({ className }: { className?: string }) {
  return <svg className={className} {...iconProps}><path {...sw2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
}
function ShareIcon({ className }: { className?: string }) {
  return <svg className={className} {...iconProps}><path {...sw2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>;
}
function BookmarkIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return <svg className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path {...sw2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>;
}
function BellIcon({ className }: { className?: string }) {
  return <svg className={className} {...iconProps}><path {...sw2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
}

// ─── CardCarousel ─────────────────────────────────────────────────────────────

function CardCarousel({ images, title }: { images: string[]; title?: string }) {
  const [current, setCurrent] = useState(0);
  if (!images.length) return null;

  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setCurrent((c) => (c - 1 + images.length) % images.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setCurrent((c) => (c + 1) % images.length); };

  return (
    <div className="relative w-full h-56 rounded-xl overflow-hidden mb-3 group">
      <Image src={images[current]} alt={`${title || "Post"} ${current + 1}`} fill className="object-cover transition-opacity duration-300" unoptimized loading="eager" />
      {images.length > 1 && (
        <>
          <button onClick={prev} type="button" className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-3.5 h-3.5" {...iconProps}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={next} type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-3.5 h-3.5" {...iconProps}><path {...sw2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button key={i} type="button" onClick={(e) => { e.stopPropagation(); setCurrent(i); }} className={`h-1.5 rounded-full transition-all ${i === current ? "bg-white w-3" : "bg-white/60 w-1.5"}`} />
            ))}
          </div>
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">{current + 1}/{images.length}</div>
        </>
      )}
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ post, onClose, user, bookmarkedIds, onLike, onBookmark }: {
  post: Post; onClose: () => void; user: FirebaseUser | null;
  bookmarkedIds: Set<string>;
  onLike: (e: React.MouseEvent, postId: string, likes: string[]) => void;
  onBookmark: (e: React.MouseEvent, postId: string) => void;
}) {
  const router = useRouter();
  const [imgIndex, setImgIndex] = useState(0);
  const allImages = getPostImages(post);
  const image = allImages[imgIndex] || "";
  const isLiked = post.likes?.includes(user?.uid || "") ?? false;
  const isBookmarked = bookmarkedIds.has(post.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setImgIndex((i) => (i - 1 + allImages.length) % allImages.length);
      if (e.key === "ArrowRight") setImgIndex((i) => (i + 1) % allImages.length);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, allImages.length]);

  const navBtn = "absolute top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/25 backdrop-blur-sm text-white rounded-full p-3 transition";

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
        <motion.div className="relative z-10 flex w-full h-full max-w-7xl mx-auto" initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.22 }}>
          <div className="relative w-[70%] h-full flex items-center justify-center bg-black">
            {image && <Image src={image} alt={post.title || "Post image"} fill className="object-contain" sizes="70vw" priority />}
            <button onClick={(e) => { e.stopPropagation(); setImgIndex((i) => (i - 1 + allImages.length) % allImages.length); }} className={`${navBtn} left-4`}>
              <svg className="w-5 h-5" {...iconProps}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setImgIndex((i) => (i + 1) % allImages.length); }} className={`${navBtn} right-4`}>
              <svg className="w-5 h-5" {...iconProps}><path {...sw2} d="M9 5l7 7-7 7" /></svg>
            </button>
            {allImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                <div className="flex gap-1.5">
                  {allImages.map((_, i) => (
                    <button key={i} onClick={(e) => { e.stopPropagation(); setImgIndex(i); }} className={`h-1.5 rounded-full transition-all ${i === imgIndex ? "bg-white w-3" : "bg-white/50 w-1.5"}`} />
                  ))}
                </div>
                <div className="bg-black/50 text-white text-xs px-3 py-1 rounded-full">{imgIndex + 1} / {allImages.length}</div>
              </div>
            )}
          </div>
          <div className="w-[30%] h-full bg-white flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={() => { onClose(); router.push(`/profile/${post.userId}`); }} className="flex items-center gap-2 hover:opacity-80 transition">
                <Avatar post={post} size={7} />
                <span className="text-sm font-semibold text-[#2F4B7C]">{getDisplayName(post)}</span>
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" {...iconProps}><path {...sw2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                {post.title && <h2 className="text-lg font-bold text-[#2F4B7C] leading-snug">{post.title}</h2>}
                <p className="text-xs text-gray-400 mt-1">{post.createdAt?.toDate?.().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
              </div>
              {post.content && <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: post.content }} />}
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {post.tags.map((tag, i) => <span key={i} className="text-xs text-[#6FA8DC] font-medium">#{tag}</span>)}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-4 space-y-3">
              <div className="flex items-center gap-4">
                <button onClick={(e) => onLike(e, post.id, post.likes || [])} className={`flex items-center gap-1.5 text-sm transition ${isLiked ? "text-red-500" : "text-gray-500 hover:text-red-500"}`}>
                  <HeartIcon className="w-5 h-5" filled={isLiked} />
                  <span className="text-xs">{post.likes?.length || 0}</span>
                </button>
                <button onClick={() => { onClose(); router.push(`/post/${post.id}#comments`); }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#6FA8DC] transition">
                  <CommentIcon className="w-5 h-5" />
                  <span className="text-xs">{post.comments || 0}</span>
                </button>
                <button onClick={(e) => onBookmark(e, post.id)} className="flex items-center gap-1.5 text-sm transition ml-auto" style={{ color: isBookmarked ? "#F4A261" : "#9ca3af" }}>
                  <BookmarkIcon className="w-5 h-5" filled={isBookmarked} />
                </button>
              </div>
              <Link href={`/post/${post.id}`} className="block w-full text-center bg-[#6FA8DC] hover:bg-[#5a8ec4] text-white text-sm font-semibold py-2.5 rounded-xl transition">
                Open Full Post
              </Link>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── GalleryGrid ──────────────────────────────────────────────────────────────

function GalleryGrid({ posts, user, onOpenLightbox }: {
  posts: Post[]; user: FirebaseUser | null; onOpenLightbox: (post: Post) => void;
}) {
  const withImages = posts.filter((p) => p.featuredImage || p.featuredImages?.length);
  const textOnly = posts.filter((p) => !p.featuredImage && !p.featuredImages?.length);

  if (!posts.length) return (
    <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
      <p className="text-gray-500">No posts yet. Be the first to write!</p>
    </div>
  );

  return (
    <div>
      {withImages.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {withImages.map((post) => {
            const image = post.featuredImages?.[0] || post.featuredImage || "";
            return (
              <motion.div key={post.id} className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-gray-100" whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }} onClick={() => onOpenLightbox(post)}>
                <Image src={image} alt={post.title || "Post"} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(max-width: 768px) 50vw, 33vw" unoptimized />
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                  {post.title && <p className="text-white text-sm font-semibold line-clamp-2 leading-tight">{post.title}</p>}
                  <p className="text-white/70 text-xs mt-1">{post.createdAt?.toDate?.().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-white/80 text-xs flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" /></svg>
                      {post.likes?.length ?? 0}
                    </span>
                    <span className="text-white/80 text-xs flex items-center gap-1">
                      <CommentIcon className="w-3.5 h-3.5" />
                      {post.comments ?? 0}
                    </span>
                    <span className="text-white/60 text-xs ml-auto truncate">{getDisplayName(post)}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      {textOnly.length > 0 && (
        <div className="mt-6 space-y-3">
          {withImages.length > 0 && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Text Posts</p>}
          {textOnly.map((post) => (
            <Link key={post.id} href={`/post/${post.id}`}>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 hover:shadow-md transition cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <Avatar post={post} size={6} />
                  <span className="text-xs text-gray-500">{getDisplayName(post)}</span>
                  <span className="text-xs text-gray-400">• {timeAgo(post.createdAt)}</span>
                </div>
                <p className="font-semibold text-[#2F4B7C] text-sm">{post.title || "Untitled"}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><HeartIcon className="w-3.5 h-3.5" filled={post.likes?.includes(user?.uid ?? "")} />{post.likes?.length || 0}</span>
                  <span className="flex items-center gap-1"><CommentIcon className="w-3.5 h-3.5" />{post.comments || 0}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HomePage ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [showMenu, setShowMenu] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "gallery">("list");
  const [lightboxPost, setLightboxPost] = useState<Post | null>(null);
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postsUnsubRef = useRef<(() => void) | undefined>(undefined);
  const notificationsUnsubRef = useRef<(() => void) | undefined>(undefined);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Effects ──

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    user.getIdToken(true)
      .then(() => {
        if (cancelled) return;
        unsub = subscribeToNotifications(user.uid, setNotifications);
        notificationsUnsubRef.current = unsub;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unsub?.();
      if (notificationsUnsubRef.current === unsub) notificationsUnsubRef.current = undefined;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getFollowing(user.uid).then((f) => setFollowedUsers(new Set(f)));
    getBookmarkedIds(user.uid).then((ids) => setBookmarkedIds(new Set(ids)));
  }, [user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openMenuId && !menuRefs.current[openMenuId]?.contains(e.target as Node)) setOpenMenuId(null);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuId]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    user.getIdToken(true).then(() => {
      if (cancelled) return;
      const q = query(collection(db, "posts"), where("isPrivate", "==", false), where("isDraft", "==", false), orderBy("createdAt", "desc"));
      unsub = onSnapshot(q,
        async (snap) => {
          const rawPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Post[];

          // Fetch profileImage from users collection for posts that don't have it
          const missingIds = [...new Set(
            rawPosts.filter((p) => !p.profileImage).map((p) => p.userId)
          )];

          const profileMap: Record<string, string> = {};
          await Promise.all(
            missingIds.map(async (uid) => {
              try {
                const userSnap = await getDoc(doc(db, "users", uid));
                if (userSnap.exists()) profileMap[uid] = userSnap.data().profileImage || "";
              } catch { /* skip silently */ }
            })
          );

          // Merge fetched profileImage into each post
          const merged = rawPosts.map((p) => ({
            ...p,
            profileImage: p.profileImage || profileMap[p.userId] || "",
          }));

          setPosts(merged);
          setLoading(false);
        },
        (err) => {
          if (err?.code === "permission-denied") return;
          console.error("Posts listener error:", err);
          setLoading(false);
        }
      );
      postsUnsubRef.current = unsub;
    }).catch((err) => { console.error("Token error:", err); setLoading(false); });

    return () => {
      cancelled = true;
      unsub?.();
      if (postsUnsubRef.current === unsub) postsUnsubRef.current = undefined;
    };
  }, [user]);

  // ── Handlers ──

  const handleLike = async (e: React.MouseEvent, postId: string, currentLikes: string[] = []) => {
    e.stopPropagation();
    if (!user?.uid) return;
    const uid = user.uid;
    const isLiked = currentLikes.includes(uid);
    try {
      const postRef = doc(db, "posts", postId);
      await updateDoc(postRef, { likes: isLiked ? arrayRemove(uid) : arrayUnion(uid) });
      const snap = await getDoc(postRef);
      if (snap.exists()) {
        const data = snap.data();
        const name = user.displayName ?? user.email ?? "Someone";
        if (isLiked) removeLikeNotification(data.userId, uid, postId).catch(console.error);
        else createLikeNotification(data.userId, uid, name, postId, data.title ?? "").catch(console.error);
      }
    } catch (err) { console.error("Error updating like:", err); }
  };

  const handleLogout = async () => {
    try {
      postsUnsubRef.current?.();
      notificationsUnsubRef.current?.();
      await signOut();
      router.push("/");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) markNotificationRead(n.id).catch(console.error);
    if (n.postId) router.push(`/post/${n.postId}`);
    else if (n.type === "follow") router.push(`/profile/${n.senderId}`);
  };

  const handleMarkAllRead = () => user?.uid && markAllNotificationsRead(user.uid).catch(console.error);

  const toggleMenu = (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    setOpenMenuId((id) => id === postId ? null : postId);
  };

  const handleSeeProfile = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation(); router.push(`/profile/${userId}`); setOpenMenuId(null);
  };

  const handleFollow = async (e: React.MouseEvent, targetId: string) => {
    e.stopPropagation();
    if (!user?.uid || targetId === user.uid) return;
    const isFollowing = followedUsers.has(targetId);
    const toggle = (s: Set<string>) => { const n = new Set(s); if (isFollowing) n.delete(targetId); else n.add(targetId); return n; };
    const revert = (s: Set<string>) => { const n = new Set(s); if (isFollowing) n.add(targetId); else n.delete(targetId); return n; };
    setFollowedUsers(toggle);
    try { await toggleFollow(user.uid, targetId, isFollowing, user.displayName ?? user.email ?? "Someone"); }
    catch { setFollowedUsers(revert); }
    setOpenMenuId(null);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const handleBookmark = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!user?.uid) return;
    const isBookmarked = bookmarkedIds.has(postId);
    const toggle = (s: Set<string>) => { const n = new Set(s); if (isBookmarked) n.delete(postId); else n.add(postId); return n; };
    const revert = (s: Set<string>) => { const n = new Set(s); if (isBookmarked) n.add(postId); else n.delete(postId); return n; };
    setBookmarkedIds(toggle);
    try { await toggleBookmark(user.uid, postId); showToast(isBookmarked ? "Bookmark removed" : "Post saved to bookmarks!"); }
    catch { setBookmarkedIds(revert); }
  };

  const handleReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to report this post?")) {
      alert("Post reported. Thank you for helping keep our community safe.");
      setOpenMenuId(null);
    }
  };

  const handleSearchNavigate = () => {
    if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const filteredPosts = posts.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.title?.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || p.tags?.some((t) => t.toLowerCase().includes(q));
  });

  const handleOpenLightbox = (post: Post) => setLightboxPost(post);

  // ── Render ──

  if (authLoading || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6FA8DC] mx-auto" />
        <p className="mt-4 text-[#2F4B7C]">Loading...</p>
      </div>
    </div>
  );

  const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
  const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";

  return (
    <div className="min-h-screen bg-[#F6F3EC]">
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#2F4B7C] text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg">{toast}</div>}

      {lightboxPost && (
        <Lightbox key={lightboxPost.id} post={lightboxPost} onClose={() => setLightboxPost(null)}
          user={user} bookmarkedIds={bookmarkedIds} onLike={handleLike} onBookmark={handleBookmark} />
      )}

      <header className="bg-white shadow-sm sticky top-0 z-40 border-b border-gray-100">
        <div className="w-full pl-4 pr-6 h-16 flex items-center justify-between gap-4">
          <Link href="/home">
            <h1 className="font-serif text-2xl font-bold tracking-wide text-[#2F4B7C] cursor-pointer transition-opacity hover:opacity-80">NOOK</h1>
          </Link>
          <div className="flex-1 max-w-md">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSearchNavigate(); }} placeholder="Search posts..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6FA8DC] text-sm bg-white" />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" {...iconProps}><path {...sw2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <button onClick={handleSearchNavigate} disabled={!searchQuery.trim()} className="px-4 py-2 text-sm font-bold text-white bg-[#6FA8DC] rounded-lg hover:bg-[#5A90C4] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0">Search</button>
            </div>
          </div>
          <nav className="flex items-center gap-8 shrink-0">
            <Link href="/home" className={navLink}>Home</Link>
            <Link href="/dashboard" className={navLink}>My Blogs</Link>
            <Link href="/galleries" className={navLink}>Galleries</Link>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu((s) => !s)} className="p-2 hover:bg-[#F6F3EC] rounded-full transition-colors group">
                <svg className="w-6 h-6 text-[#2F4B7C] group-hover:scale-110 transition-transform" {...iconProps}><path {...sw2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-xl py-2 z-50 border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-gray-50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Account</p>
                    <p className="text-sm font-bold text-[#1F2F46] truncate">{user?.email}</p>
                  </div>
                  <div className="py-2">
                    <Link href="/dashboard" onClick={() => setShowMenu(false)} className={menuItem}>My Profile</Link>
                    <Link href="/bookmarks" onClick={() => setShowMenu(false)} className={menuItem}>Bookmarks</Link>
                    <Link href="/settings" onClick={() => setShowMenu(false)} className={menuItem}>Settings</Link>
                  </div>
                  <div className="border-t border-gray-50 pt-2 pb-1">
                    <button onClick={handleLogout} className="w-full text-left px-5 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors">Log Out</button>
                  </div>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>

      <div className="relative">
        <div className="lg:pr-80">
          <div className="max-w-3xl xl:max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-end mb-5">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
                {(["list", "gallery"] as const).map((mode) => (
                  <button key={mode} onClick={() => setViewMode(mode)} title={`${mode} view`} className={`p-2 rounded-lg transition-all ${viewMode === mode ? "bg-[#6FA8DC] text-white shadow-sm" : "text-gray-400 hover:text-[#2F4B7C]"}`}>
                    {mode === "list"
                      ? <svg className="w-5 h-5" {...iconProps}><path {...sw2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                      : <svg className="w-5 h-5" {...iconProps}><path {...sw2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    }
                  </button>
                ))}
              </div>
            </div>

            {viewMode === "gallery" && <GalleryGrid posts={filteredPosts} user={user} onOpenLightbox={handleOpenLightbox} />}

            {viewMode === "list" && (
              <div className="space-y-6">
                {filteredPosts.length === 0 ? (
                  <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
                    <p className="text-gray-500">{searchQuery ? "No posts match your search." : "No posts yet. Be the first to write!"}</p>
                  </div>
                ) : filteredPosts.map((post) => (
                  <div key={post.id} onClick={() => router.push(`/post/${post.id}`)} className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center justify-between mb-4">
                      <button onClick={(e) => handleSeeProfile(e, post.userId)} className="flex items-center gap-3 hover:opacity-80 transition">
                        <Avatar post={post} size={10} />
                        <div className="text-left">
                          <p className="font-semibold text-gray-900 text-sm hover:text-[#6FA8DC] transition">{post.username || post.userEmail}</p>
                          <p className="text-xs text-gray-500">• {post.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                        </div>
                      </button>
                      <div className="relative" ref={(el) => void (menuRefs.current[post.id] = el)} onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => toggleMenu(e, post.id)} className="p-2 hover:bg-gray-100 rounded-lg transition"><MoreIcon className="w-5 h-5 text-gray-400" /></button>
                        {openMenuId === post.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
                            <button onClick={(e) => handleSeeProfile(e, post.userId)} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition">See profile</button>
                            {post.userId !== user?.uid && (
                              <button onClick={(e) => handleFollow(e, post.userId)} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition">{followedUsers.has(post.userId) ? "Unfollow" : "Follow"}</button>
                            )}
                            <button onClick={(e) => handleReport(e)} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition">Report</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {post.title && <h3 className="text-lg font-bold text-gray-900 mb-2">{post.title}</h3>}
                    {(post.featuredImage || post.galleryImages?.length) && (
                      <CardCarousel images={getPostImages(post)} title={post.title} />
                    )}
                    <div className="text-gray-700 text-sm prose prose-sm max-w-none mb-3" dangerouslySetInnerHTML={{ __html: post.content.substring(0, 300) + (post.content.length > 300 ? "..." : "") }} />
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {post.tags.map((tag, i) => <span key={i} className="text-xs text-[#6FA8DC] font-medium">#{tag}</span>)}
                      </div>
                    )}
                    <div className="flex items-center gap-6 pt-3 border-t border-gray-100">
                      <button onClick={(e) => handleLike(e, post.id, post.likes ?? [])} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition">
                        <HeartIcon className="w-5 h-5" filled={post.likes?.includes(user?.uid || "")} />
                        <span className="text-xs">{post.likes?.length || 0}</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); router.push(`/post/${post.id}#comments`); }} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#6FA8DC] transition">
                        <CommentIcon className="w-5 h-5" /><span className="text-xs">{post.comments || 0}</span>
                      </button>
                      <button onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#6FA8DC] transition">
                        <ShareIcon className="w-5 h-5" /><span className="text-xs">Share</span>
                      </button>
                      <button onClick={(e) => handleBookmark(e, post.id)} className="flex items-center gap-1.5 text-sm transition ml-auto" style={{ color: bookmarkedIds.has(post.id) ? "#F4A261" : "#9ca3af" }} title={bookmarkedIds.has(post.id) ? "Remove bookmark" : "Save post"}>
                        <BookmarkIcon className="w-5 h-5" filled={bookmarkedIds.has(post.id)} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:flex fixed right-4 top-20 w-80 max-h-[calc(100vh-6rem)] flex-col rounded-xl shadow-lg border border-gray-200 bg-white z-30">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900">Notifications</h3>
              {unreadCount > 0 && <span className="text-xs font-bold text-white bg-red-500 rounded-full px-2 py-0.5">{unreadCount}</span>}
            </div>
            {unreadCount > 0 && <button onClick={handleMarkAllRead} className="text-xs text-[#6FA8DC] hover:underline font-medium">Mark all read</button>}
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <div className="px-5 py-12 text-center text-gray-500">
                <BellIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : notifications.map((n) => (
              <button key={n.id} onClick={() => handleNotificationClick(n)} className={`w-full px-5 py-4 hover:bg-gray-50 transition-colors text-left ${!n.read ? "bg-blue-50/60" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="text-xl shrink-0 mt-0.5">{notificationIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug">{n.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-[#6FA8DC] shrink-0 mt-1.5" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:hidden fixed bottom-4 left-4 z-50">
        <button className="w-12 h-12 rounded-full bg-[#2F4B7C] flex items-center justify-center text-white font-bold shadow-lg">
          {user?.email?.[0].toUpperCase()}
        </button>
      </div>
    </div>
  );
}