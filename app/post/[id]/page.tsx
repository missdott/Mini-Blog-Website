"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { CommentsController } from "@/components/Comments";

// ─── Types & Helpers ──────────────────────────────────────────────────────────

interface Post {
  id: string; title: string; content: string; username: string;
  userEmail: string; userId: string; featuredImage?: string;
  profileImage?: string;
  galleryImages?: string[]; categories: string[]; tags: string[];
  likes: string[]; comments: number; isPrivate: boolean; isDraft: boolean;
  createdAt: { toDate: () => Date }; updatedAt?: { toDate: () => Date };
}

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";

const formatDate = (date: Date) => {
  if (!date) return "Just now";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return date.toLocaleDateString();
};

// ─── ImageGallery ─────────────────────────────────────────────────────────────

function ImageGallery({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);
  if (!images.length) return null;

  const navBtn = "absolute top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition";

  return (
    <div className="relative w-full">
      <div className="relative w-full h-72 lg:h-96">
        <Image src={images[current]} alt={`Image ${current + 1}`} fill className="object-cover" unoptimized />
        {images.length > 1 && (
          <>
            <button onClick={() => setCurrent((c) => (c - 1 + images.length) % images.length)} className={`${navBtn} left-3`} type="button">
              <svg className="w-4 h-4" {...ip}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => setCurrent((c) => (c + 1) % images.length)} className={`${navBtn} right-3`} type="button">
              <svg className="w-4 h-4" {...ip}><path {...sw2} d="M9 5l7 7-7 7" /></svg>
            </button>
            <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">{current + 1} / {images.length}</div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 p-3 bg-gray-50 overflow-x-auto">
          {images.map((src, i) => (
            <button key={i} onClick={() => setCurrent(i)} className={`relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition ${i === current ? "border-[#2F4B7C]" : "border-transparent hover:border-gray-300"}`} type="button">
              <Image src={src} alt={`Thumbnail ${i + 1}`} fill className="object-cover" unoptimized />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PostPage ─────────────────────────────────────────────────────────────────

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Effects ──

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "posts", id));
        if (!snap.exists()) { setNotFound(true); return; }
        const data = snap.data() as Omit<Post, "id">;
        const isOwner = user?.uid === data.userId;
        if ((data.isDraft || data.isPrivate) && !isOwner) { setNotFound(true); return; }
        let profileImage = "";
        try {
          const userSnap = await getDoc(doc(db, "users", data.userId));
          if (userSnap.exists()) {
            profileImage = userSnap.data().profileImage || "";
          }
        } catch { /* skip silently */ }
        
        setPost({ id: snap.id, profileImage, ...data });
      } catch (err) { console.error("Error fetching post:", err); setNotFound(true); }
      finally { setLoading(false); }
    })();
  }, [id, user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Handlers ──

  const handleLike = async () => {
    if (!user || !post) return;
    const ref = doc(db, "posts", post.id);
    const isLiked = post.likes?.includes(user.uid);
    try {
      await updateDoc(ref, { likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
      setPost({ ...post, likes: isLiked ? post.likes.filter((u) => u !== user.uid) : [...(post.likes || []), user.uid] });
    } catch (err) { console.error("Error updating like:", err); }
  };

  const handleEdit = () => {
    if (!post) return;
    localStorage.setItem("editingPost", JSON.stringify({
      id: post.id, title: post.title, content: post.content,
      categories: post.categories.join(", "), tags: post.tags.join(", "),
      featuredImage: post.featuredImage ?? "", galleryImages: post.galleryImages ?? [],
      isPrivate: post.isPrivate, isDraft: post.isDraft,
    }));
    router.push("/editor");
  };

  const handleLogout = async () => { try { await signOut(); router.push("/"); } catch (e) { console.error("Logout error:", e); } };
  const handleSearchNavigate = () => { if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`); };

  // ── Early returns ──

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F4B7C]" />
    </div>
  );

  if (notFound || !post) return (
    <div className="min-h-screen bg-[#F6F3EC] flex flex-col items-center justify-center gap-4">
      <p className="text-[#2F4B7C] text-lg font-medium">Post not found.</p>
      <Link href="/home" className="text-sm text-[#6FA8DC] hover:underline">Back to home</Link>
    </div>
  );

  const createdAt = post.createdAt?.toDate?.();
  const updatedAt = post.updatedAt?.toDate?.();
  const isOwner = user?.uid === post.userId;
  const isLiked = post.likes?.includes(user?.uid || "");
  const allImages = [...(post.featuredImage ? [post.featuredImage] : []), ...(post.galleryImages ?? [])];

  return (
    <div className="min-h-screen bg-[#F6F3EC]">
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
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu((s) => !s)} className="p-2 hover:bg-[#F6F3EC] rounded-full transition-colors group">
                <svg className="w-6 h-6 text-[#2F4B7C] group-hover:scale-110 transition-transform" {...ip}><path {...sw2} d="M4 6h16M4 12h16M4 18h16" /></svg>
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

      {/* Back button */}
      <div className="w-full pl-9 pt-8 pb-4">
        <button onClick={() => router.back()} className="inline-flex items-center text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-sm">
          <svg className="w-4 h-4 mr-1" {...ip}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
          Go back
        </button>
      </div>

      {/* Layout */}
      <div className="max-w-7xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-12 gap-6 lg:gap-8">
          <article className="col-span-12 lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Post header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => router.push(`/profile/${post.userId}`)} className="w-9 h-9 rounded-full bg-[#2F4B7C] flex items-center justify-center text-white text-xs font-bold hover:opacity-90 transition overflow-hidden relative shrink-0">
                    {post.profileImage ? (
                      <Image src={post.profileImage} alt={post.username || "User"} fill className="object-cover" unoptimized />
                    ) : (
                      (post.username || post.userEmail || "U")[0].toUpperCase()
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => router.push(`/profile/${post.userId}`)} className="text-sm font-semibold text-[#1F2F46] hover:underline">
                      {post.username || `@${post.userEmail?.split("@")[0]}`}
                    </button>
                    <span className="text-xs text-gray-500">
                      • {formatDate(createdAt)}
                      {updatedAt && <span className="ml-1 text-gray-400">(edited)</span>}
                    </span>
                  </div>
                </div>
                {isOwner && (
                  <button onClick={handleEdit} className="flex items-center gap-2 text-sm font-medium text-[#2F4B7C] hover:text-[#6FA8DC] transition-colors px-3 py-1.5 rounded-full hover:bg-[#F6F3EC]">
                    <svg className="w-4 h-4" {...ip}><path {...sw2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit
                  </button>
                )}
              </div>

              {allImages.length > 0 && <ImageGallery images={allImages} />}

              {/* Content */}
              <div className="px-4 py-4">
                {post.title && <h1 className="text-xl font-bold text-[#1F2F46] mb-3 leading-snug">{post.title}</h1>}
                <div className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />
                {post.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-4">
                    {post.tags.map((tag, i) => <span key={i} className="text-xs text-[#6FA8DC] hover:underline cursor-pointer font-medium">#{tag}</span>)}
                  </div>
                )}
                {post.categories?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {post.categories.map((cat, i) => <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{cat}</span>)}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button onClick={handleLike} className={`flex items-center gap-1.5 transition ${isLiked ? "text-red-600" : "text-gray-700 hover:text-red-600"}`}>
                    <svg className="w-6 h-6" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path {...sw2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                    <span className="text-xs">{post.likes?.length || 0}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-gray-700 hover:text-[#6FA8DC] transition lg:hidden">
                    <svg className="w-6 h-6" {...ip}><path {...sw2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    <span className="text-xs">{post.comments || 0}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-gray-700 hover:text-green-600 transition">
                    <svg className="w-6 h-6" {...ip}><path {...sw2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    <span className="text-xs">Shares</span>
                  </button>
                </div>
                <button className="text-gray-700 hover:text-[#F4A261] transition">
                  <svg className="w-6 h-6" {...ip}><path {...sw2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                </button>
              </div>
            </div>

            <div className="mt-6 lg:hidden">
              <CommentsController postId={post.id} authorId={post.userId} />
            </div>
          </article>

          <aside className="hidden lg:block lg:col-span-4">
            <div className="sticky top-22 h-[calc(100vh-7rem)]">
              <CommentsController postId={post.id} authorId={post.userId} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}