"use client";

import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, orderBy, Timestamp, getDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import Link from "next/link";
import Modal from "@/lib/Modal";
import Image from "next/image";
import { getFollowerCount, getFollowingCount } from "@/lib/followService";
import { toggleBookmark, getBookmarkedIds } from "@/lib/bookmarkService";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlogPost {
  id: string; title?: string; content: string; featuredImage?: string;
  galleryImages?: string[]; categories?: string[]; tags?: string[];
  isPrivate: boolean; isDraft: boolean; createdAt: Timestamp;
  userId: string; userEmail: string; username?: string; profileImage?: string;
  likes?: string[]; comments?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };

const getPostImages = (p: BlogPost) => [...(p.featuredImage ? [p.featuredImage] : []), ...(p.galleryImages ?? [])];
const getInitial = (p: BlogPost) => (p.username || p.userEmail || "U")[0].toUpperCase();
const getDisplayName = (p: BlogPost) => p.username || `@${p.userEmail?.split("@")[0]}`;

const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

const formatDate = (ts: Timestamp) => {
  if (!ts) return "Just now";
  const s = Math.floor((Date.now() - ts.toDate().getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return ts.toDate().toLocaleDateString();
};

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ post, onClose }: { post: BlogPost; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const imgs = getPostImages(post);
  const image = imgs[idx] || "";


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + imgs.length) % imgs.length);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % imgs.length);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, imgs.length]);

  const navBtn = "absolute top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/25 backdrop-blur-sm text-white rounded-full p-3 transition";

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
        <motion.div className="relative z-10 flex w-full h-full max-w-7xl mx-auto" initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.22 }}>
          {/* Image — 70% */}
          <div className="relative w-[70%] h-full flex items-center justify-center bg-black">
            {image && <Image src={image} alt={post.title || "Post image"} fill className="object-contain" sizes="70vw" priority />}
            {imgs.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + imgs.length) % imgs.length); }} className={`${navBtn} left-4`}>
                  <svg className="w-5 h-5" {...ip}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % imgs.length); }} className={`${navBtn} right-4`}>
                  <svg className="w-5 h-5" {...ip}><path {...sw2} d="M9 5l7 7-7 7" /></svg>
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                  <div className="flex gap-1.5">
                    {imgs.map((_, i) => <button key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }} className={`h-1.5 rounded-full transition-all ${i === idx ? "bg-white w-3" : "bg-white/50 w-1.5"}`} />)}
                  </div>
                  <div className="bg-black/50 text-white text-xs px-3 py-1 rounded-full">{idx + 1} / {imgs.length}</div>
                </div>
              </>
            )}
          </div>
          {/* Sidebar — 30% */}
          <div className="w-[30%] h-full bg-white flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                {post.profileImage ? (
                  <Image src={post.profileImage} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#6FA8DC] flex items-center justify-center text-white text-xs font-bold">{getInitial(post)}</div>
                )}
                <span className="text-sm font-semibold text-[#2F4B7C]">{getDisplayName(post)}</span>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" {...ip}><path {...sw2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                {post.title && <h2 className="text-lg font-bold text-[#2F4B7C] leading-snug">{post.title}</h2>}
                <p className="text-xs text-gray-400 mt-1">{post.createdAt?.toDate().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
              </div>
              {post.content && <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed">{stripHtml(post.content).substring(0, 200)}{post.content.length > 200 ? "..." : ""}</p>}
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {post.tags.map((tag, i) => <span key={i} className="text-xs text-[#6FA8DC] font-medium">#{tag}</span>)}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-4 space-y-3">
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" /></svg>
                  {post.likes?.length ?? 0} likes
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-[#6FA8DC]" {...ip}><path {...sw2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  {post.comments ?? 0} comments
                </span>
              </div>
              <Link href={`/post/${post.id}`} className="block w-full text-center bg-[#6FA8DC] hover:bg-[#5a8ec4] text-white text-sm font-semibold py-2.5 rounded-xl transition">Open Full Post</Link>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── CardCarousel ─────────────────────────────────────────────────────────────

function CardCarousel({ images, title }: { images: string[]; title?: string }) {
  const [cur, setCur] = useState(0);
  if (!images.length) return null;
  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setCur((c) => (c - 1 + images.length) % images.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setCur((c) => (c + 1) % images.length); };
  return (
    <div className="relative w-full h-64 group">
      <Image src={images[cur]} alt={`${title || "Post"} ${cur + 1}`} fill className="object-cover transition-opacity duration-300" unoptimized loading="eager" />
      {images.length > 1 && (
        <>
          <button onClick={prev} type="button" className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-3.5 h-3.5" {...ip}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={next} type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-3.5 h-3.5" {...ip}><path {...sw2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => <button key={i} type="button" onClick={(e) => { e.stopPropagation(); setCur(i); }} className={`h-1.5 rounded-full transition-all ${i === cur ? "bg-white w-3" : "bg-white/60 w-1.5"}`} />)}
          </div>
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">{cur + 1}/{images.length}</div>
        </>
      )}
    </div>
  );
}

// ─── GalleryGrid ──────────────────────────────────────────────────────────────

function GalleryGrid({ posts, onOpenLightbox }: { posts: BlogPost[]; onOpenLightbox: (post: BlogPost) => void }) {
  const withImgs = posts.filter((p) => p.featuredImage || p.galleryImages?.length);
  const textOnly = posts.filter((p) => !p.featuredImage && !p.galleryImages?.length);

  if (!withImgs.length && !textOnly.length) return (
    <div className="bg-white rounded-xl shadow-md p-8 text-center border border-gray-100">
      <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" {...ip}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      <p className="text-gray-500 text-lg font-medium">No posts yet. Why not write your first story?</p>
    </div>
  );

  return (
    <div>
      {withImgs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {withImgs.map((post) => (
            <motion.div key={post.id} className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-gray-100" whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }} onClick={() => onOpenLightbox(post)}>
              <Image src={post.featuredImage || post.galleryImages?.[0] || ""} alt={post.title || "Post"} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" unoptimized />
              <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                {post.title && <p className="text-white text-sm font-semibold line-clamp-2 leading-tight">{post.title}</p>}
                <p className="text-white/70 text-xs mt-1">{post.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" /></svg>
                    {post.likes?.length ?? 0}
                  </span>
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" {...ip}><path {...sw2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    {post.comments ?? 0}
                  </span>
                </div>
              </div>
              {(post.isDraft || post.isPrivate) && (
                <div className="absolute top-2 left-2 flex gap-1">
                  {post.isDraft && <span className="bg-yellow-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">Draft</span>}
                  {post.isPrivate && <span className="bg-gray-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">Private</span>}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
      {textOnly.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Text Posts</p>
          {textOnly.map((post) => (
            <Link key={post.id} href={`/post/${post.id}`}>
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-md transition cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  {post.profileImage ? (
                    <Image src={post.profileImage} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#6FA8DC] flex items-center justify-center text-white text-xs font-bold">{getInitial(post)}</div>
                  )}
                  <span className="text-sm font-semibold text-[#2F4B7C]">{getDisplayName(post)}</span>
                  <span className="text-xs text-gray-400">• {post.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                <p className="font-semibold text-[#2F4B7C] text-sm">{post.title || "Untitled"}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [showPostMenu, setShowPostMenu] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [bio, setBio] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "gallery">("list");
  const [lightboxPost, setLightboxPost] = useState<BlogPost | null>(null);
  const [modalState, setModalState] = useState({
    isOpen: false, type: "alert" as "alert" | "confirm",
    title: "", message: "", onConfirm: undefined as (() => void) | undefined,
  });

  const menuRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Effects ──

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchQuery]);

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};
        const name = data.username || localStorage.getItem(`username_${user.uid}`) || "";
        const img = data.profileImage || localStorage.getItem(`profileImage_${user.uid}`) || "";
        const cover = data.coverImage || localStorage.getItem(`coverImage_${user.uid}`) || "";
        const userBio = data.bio || "";
        setUsername(name); setProfileImage(img); setCoverImage(cover); setBio(userBio);
        if (name) localStorage.setItem(`username_${user.uid}`, name);
        if (img) localStorage.setItem(`profileImage_${user.uid}`, img);
        if (cover) localStorage.setItem(`coverImage_${user.uid}`, cover);
      } catch {
        setUsername(localStorage.getItem(`username_${user.uid}`) || "");
        setProfileImage(localStorage.getItem(`profileImage_${user.uid}`) || "");
        setCoverImage(localStorage.getItem(`coverImage_${user.uid}`) || "");
      }
    };
    const loadPosts = async () => {
      const snap = await getDocs(query(collection(db, "posts"), where("userId", "==", user.uid), orderBy("createdAt", "desc")));
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BlogPost[]);
    };
    const loadCounts = async () => {
      const [fc, fwc] = await Promise.all([getFollowerCount(user.uid), getFollowingCount(user.uid)]);
      setFollowerCount(fc); setFollowingCount(fwc);
    };
    loadProfile();
    loadPosts();
    loadCounts();
    getBookmarkedIds(user.uid).then((ids) => setBookmarkedIds(new Set(ids)));
  }, [user]);

  // ── Handlers ──

  const reloadPosts = async () => {
    if (!user) return;
    const snap = await getDocs(query(collection(db, "posts"), where("userId", "==", user.uid), orderBy("createdAt", "desc")));
    setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BlogPost[]);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setCoverUploading(true);
    try {
      const { uploadToCloudinary } = await import("@/lib/imageUtils");
      const url = await uploadToCloudinary(file);
      setCoverImage(url);
      localStorage.setItem(`coverImage_${user.uid}`, url);
      const { doc: firestoreDoc, updateDoc: firestoreUpdate } = await import("firebase/firestore");
      await firestoreUpdate(firestoreDoc(db, "users", user.uid), { coverImage: url });
      showToast("Cover photo updated!");
    } catch {
      showToast("Failed to upload cover photo.");
    } finally {
      setCoverUploading(false);
    }
  };
  const handleLogout = async () => { await signOut(); router.push("/"); };

  const handleSearchNavigate = () => {
    if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleBookmark = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!user) return;
    const was = bookmarkedIds.has(postId);
    const toggle = (s: Set<string>) => { const n = new Set(s); if (was) n.delete(postId); else n.add(postId); return n; };
    const revert = (s: Set<string>) => { const n = new Set(s); if (was) n.add(postId); else n.delete(postId); return n; };
    setBookmarkedIds(toggle);
    try { await toggleBookmark(user.uid, postId); showToast(was ? "Bookmark removed" : "Post saved to bookmarks!"); }
    catch { setBookmarkedIds(revert); }
  };

  const handleEditPost = (post: BlogPost) => {
    localStorage.setItem("editingPost", JSON.stringify({
      id: post.id, title: post.title || "", content: post.content,
      categories: post.categories?.join(", ") || "", tags: post.tags?.join(", ") || "",
      featuredImage: post.featuredImage || "", isPrivate: post.isPrivate, isDraft: post.isDraft,
    }));
    router.push("/editor");
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, "posts", postId));
      await reloadPosts();
      setModalState((m) => ({ ...m, isOpen: false }));
    } catch (err) {
      console.error("Error deleting post:", err);
      setModalState({ isOpen: true, type: "alert", title: "Error", message: "Failed to delete post. Please try again.", onConfirm: undefined });
    }
  };

  const handleDeleteClick = (postId: string) => {
    setModalState({ isOpen: true, type: "confirm", title: "Delete Post", message: "Are you sure you want to delete this post? This action cannot be undone.", onConfirm: () => handleDeletePost(postId) });
    setShowPostMenu(null);
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    const ref = doc(db, "posts", postId);
    const likes = (await getDoc(ref)).data()?.likes || [];
    await updateDoc(ref, { likes: likes.includes(user.uid) ? arrayRemove(user.uid) : arrayUnion(user.uid) });
    reloadPosts();
  };

  const filteredPosts = posts.filter((p) => {
    if (!debouncedQuery) return true;
    const q = debouncedQuery.toLowerCase();
    return p.title?.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) ||
      p.tags?.some((t) => t.toLowerCase().includes(q)) || p.categories?.some((c) => c.toLowerCase().includes(q));
  });

  // ── Render ──

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F4B7C]" />
    </div>
  );
  if (!user) return null;

  const displayName = username || `@${user.email?.split("@")[0]}`;
  const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
  const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";

  return (
    <div className="min-h-screen bg-[#F6F3EC]" onClick={() => setShowPostMenu(null)}>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#2F4B7C] text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg">{toast}</div>}
      {lightboxPost ? <Lightbox key={lightboxPost.id} post={lightboxPost} onClose={() => setLightboxPost(null)} /> : null}

      {/* Navbar */}
      <header className="bg-white shadow-sm sticky top-0 z-40 border-b border-gray-100">
        <div className="w-full pl-4 pr-6 h-16 flex items-center justify-between gap-4">
          <Link href="/home"><h1 className="font-serif text-2xl font-bold tracking-wide text-[#2F4B7C] cursor-pointer transition-opacity hover:opacity-80">NOOK</h1></Link>
          <div className="flex-1 max-w-md">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearchNavigate()} placeholder="Search posts..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6FA8DC] text-sm bg-white" />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" {...ip}><path {...sw2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
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
                <svg className="w-6 h-6 text-[#2F4B7C] group-hover:scale-110 transition-transform" {...ip}><path {...sw2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-xl py-2 z-50 border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-gray-50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Account</p>
                    <p className="text-sm font-bold text-[#1F2F46] truncate">{user.email}</p>
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

      {/* Twitter-style Profile Header */}
      <div className="bg-white border-b border-gray-200">
        {/* Cover photo */}
        <div className="relative h-48 md:h-56 overflow-hidden group cursor-pointer">
          {coverImage
            ? <Image src={coverImage} alt="Cover" fill className="object-cover" unoptimized priority />
            : <div className="absolute inset-0 bg-linear-to-br from-[#2F4B7C] via-[#5A90C4] to-[#6FA8DC]">
                <div className="absolute -top-8 -right-8 w-64 h-64 bg-white/10 rounded-full blur-2xl" />
                <div className="absolute -bottom-12 -left-8 w-80 h-80 bg-[#F4A261]/20 rounded-full blur-3xl" />
              </div>
          }
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-2 bg-black/60 hover:bg-black/80 text-white text-sm font-semibold px-4 py-2 rounded-full backdrop-blur-sm"
            >
              {coverUploading
                ? <><svg className="animate-spin w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Uploading...</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Edit cover photo</>
              }
            </button>
          </div>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
        </div>

        {/* Avatar + actions row */}
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-end justify-between -mt-14 md:-mt-16 pb-3">
            <div className="relative shrink-0 z-10">
              <div className="w-28 h-28 md:w-32 md:h-32 rounded-full ring-4 ring-white bg-white shadow-xl overflow-hidden relative">
                {profileImage
                  ? <Image src={profileImage} alt="" fill className="object-cover" unoptimized onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  : null}
                {!profileImage && (
                  <div className="w-full h-full bg-[#2F4B7C] flex items-center justify-center">
                    <span className="text-4xl font-bold text-white">{(username || user.email || "U")[0].toUpperCase()}</span>
                  </div>
                )}
              </div>
              <Link href="/settings" title="Edit profile picture"
                className="absolute bottom-1 right-1 w-8 h-8 bg-[#6FA8DC] hover:bg-[#5A90C4] text-white rounded-full flex items-center justify-center shadow-md transition-colors border-2 border-white">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </Link>
            </div>
            <Link href="/settings"
              className="mb-2 px-5 py-2 rounded-full border-2 border-[#2F4B7C] text-[#2F4B7C] text-sm font-bold hover:bg-[#2F4B7C] hover:text-white transition-all duration-200">
              Edit Profile
            </Link>
          </div>

          {/* Name, handle, bio, stats */}
          <div className="pb-5 space-y-2">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#1F2F46] leading-tight">{displayName}</h2>
              <p className="text-sm text-gray-400">@{(username || user.email?.split("@")[0] || "user").toLowerCase()}</p>
            </div>
            {bio && <p className="text-sm text-gray-700 max-w-xl leading-relaxed">{bio}</p>}
            <div className="flex items-center gap-5 pt-1">
              {([[posts.length, "Posts"], [followerCount, "Followers"], [followingCount, "Following"]] as [number, string][]).map(([val, label]) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="text-sm font-bold text-[#1F2F46]">{val}</span>
                  <span className="text-sm text-gray-500">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link href="/editor" className="inline-flex items-center gap-2 text-base font-bold bg-[#5A90C4] text-white px-8 py-3 rounded-full shadow-lg hover:bg-[#4A7FAA] hover:scale-105 transition-all duration-200 active:scale-95">
            <span className="text-xl leading-none">+</span> Create New Post
          </Link>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            {(["list", "gallery"] as const).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} title={`${mode} view`} className={`p-2 rounded-lg transition-all ${viewMode === mode ? "bg-[#6FA8DC] text-white shadow-sm" : "text-gray-400 hover:text-[#2F4B7C]"}`}>
                {mode === "list"
                  ? <svg className="w-5 h-5" {...ip}><path {...sw2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                  : <svg className="w-5 h-5" {...ip}><path {...sw2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                }
              </button>
            ))}
          </div>
        </div>

        {viewMode === "gallery" && <GalleryGrid posts={filteredPosts} onOpenLightbox={(post) => setLightboxPost(post)} />}

        {viewMode === "list" && (
          <div className="max-w-2xl mx-auto space-y-6">
            {filteredPosts.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-8 text-center border border-gray-100">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" {...ip}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6" /></svg>
                <p className="text-gray-500 text-lg font-medium">{searchQuery ? "No posts match your search." : "No posts yet. Why not write your first story?"}</p>
              </div>
            ) : filteredPosts.map((post) => (
              <article key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible relative">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => router.push(`/profile/${post.userId}`)} className="w-9 h-9 rounded-full overflow-hidden hover:opacity-90 transition">
                      {post.profileImage ? (
                        <Image src={post.profileImage} alt="" width={36} height={36} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#2F4B7C] flex items-center justify-center text-white text-xs font-bold">{getInitial(post)}</div>
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => router.push(`/profile/${post.userId}`)} className="text-sm font-semibold text-[#1F2F46] hover:underline">{getDisplayName(post)}</button>
                      <svg className="w-3 h-3 text-[#2F4B7C]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs text-gray-500">• {formatDate(post.createdAt)}</span>
                    </div>
                  </div>
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); setShowPostMenu(showPostMenu === post.id ? null : post.id); }} className="p-1 hover:bg-[#F6F3EC] rounded-full">
                      <svg className="w-5 h-5 text-[#2F4B7C]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                    </button>
                    {showPostMenu === post.id && (
                      <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-2xl shadow-xl py-2 z-50 border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setShowPostMenu(null); handleEditPost(post); }} className="flex items-center gap-3 w-full px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors text-left">
                          <svg className="w-4 h-4" {...ip}><path {...sw2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          Edit
                        </button>
                        <button onClick={() => handleDeleteClick(post.id)} className="flex items-center gap-3 w-full px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors text-left">
                          <svg className="w-4 h-4" {...ip}><path {...sw2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {(post.featuredImage || (post.galleryImages?.length ?? 0) > 0) && <CardCarousel images={getPostImages(post)} title={post.title} />}

                {/* Content */}
                <div className="px-4 py-3">
                  {post.title && <p className="font-semibold text-[#1F2F46] mb-1">{post.title}</p>}
                  {(() => { const text = stripHtml(post.content); return text && <p className="text-gray-800 text-sm leading-relaxed line-clamp-3">{text.substring(0, 200)}{text.length > 200 ? "..." : ""}</p>; })()}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {post.tags.map((tag, i) => <span key={i} className="text-xs text-[#6FA8DC] hover:underline cursor-pointer font-medium">#{tag}</span>)}
                    </div>
                  )}
                  {post.categories && post.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {post.categories.map((cat, i) => <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{cat}</span>)}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button onClick={() => handleLike(post.id)} className={`flex items-center gap-1.5 transition ${post.likes?.includes(user.uid) ? "text-red-600" : "text-gray-700 hover:text-red-600"}`}>
                      <svg className="w-6 h-6" fill={post.likes?.includes(user.uid) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path {...sw2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                      <span className="text-xs">{post.likes?.length || 0}</span>
                    </button>
                    <button onClick={() => router.push(`/post/${post.id}#comments`)} className="flex items-center gap-1.5 text-gray-700 hover:text-[#6FA8DC] transition">
                      <svg className="w-6 h-6" {...ip}><path {...sw2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      <span className="text-xs">{post.comments || 0}</span>
                    </button>
                    <button className="flex items-center gap-1.5 text-gray-700 hover:text-green-600 transition">
                      <svg className="w-6 h-6" {...ip}><path {...sw2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                      <span className="text-xs">Shares</span>
                    </button>
                  </div>
                  <button onClick={(e) => handleBookmark(e, post.id)} title={bookmarkedIds.has(post.id) ? "Remove bookmark" : "Save post"} className="transition" style={{ color: bookmarkedIds.has(post.id) ? "#F4A261" : "#9ca3af" }}>
                    <svg className="w-6 h-6" fill={bookmarkedIds.has(post.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path {...sw2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState((m) => ({ ...m, isOpen: false }))}
        onConfirm={modalState.onConfirm}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />
    </div>
  );
}