"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getBookmarkedPosts, toggleBookmark } from "@/lib/bookmarkService";
import Image from "next/image";

// ─── Types & Helpers ──────────────────────────────────────────────────────────

interface Post {
  id: string; title?: string; content: string; username: string;
  userEmail: string; userId: string; createdAt: { toDate: () => Date };
  likes?: string[]; comments?: number; tags?: string[];
  categories?: string[]; featuredImage?: string;
  isPrivate: boolean; isDraft: boolean;
}

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };

const formatDate = (createdAt: Post["createdAt"]) => {
  try { return createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
};

const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookmarksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Effects ──

  useEffect(() => { if (!authLoading && !user) router.push("/"); }, [user, authLoading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const fetched = await getBookmarkedPosts(user.uid);
        setPosts(fetched as Post[]);
        setBookmarkedIds(new Set(fetched.map((p: { id: string }) => p.id)));
      } catch (err) { console.error("Error loading bookmarks:", err); }
      finally { setLoading(false); }
    })();
  }, [user]);

  // ── Handlers ──

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const handleToggleBookmark = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!user) return;
    const was = bookmarkedIds.has(postId);
    setBookmarkedIds((prev) => { const s = new Set(prev); if (was) s.delete(postId); else s.add(postId); return s; });
    if (was) setPosts((prev) => prev.filter((p) => p.id !== postId));
    try { await toggleBookmark(user.uid, postId); showToast(was ? "Bookmark removed" : "Post bookmarked!"); }
    catch {
      setBookmarkedIds((prev) => { const s = new Set(prev); if (was) s.add(postId); else s.delete(postId); return s; });
    }
  };

  const handleLogout = async () => { await signOut(auth); router.push("/"); };

  const handleSearchNavigate = () => {
    if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  // ── Render ──

  if (authLoading || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F4B7C]" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6F3EC]">
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#2F4B7C] text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">{toast}</div>}

      {/* Header */}
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
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-xl py-2 z-50 border border-gray-100" onClick={(e) => e.stopPropagation()}>
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

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <svg className="w-6 h-6 text-[#2F4B7C]" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          <h1 className="font-serif text-2xl font-bold text-[#2F4B7C]">Bookmarks</h1>
          {posts.length > 0 && <span className="text-sm text-gray-400 font-medium">{posts.length} saved</span>}
        </div>

        {posts.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-gray-100">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" {...ip}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            <p className="text-gray-400 text-lg font-medium">No bookmarks yet</p>
            <p className="text-gray-400 text-sm mt-1">Save posts by clicking the bookmark icon on any post</p>
            <Link href="/home" className="inline-block mt-6 px-6 py-2.5 bg-[#6FA8DC] text-white text-sm font-bold rounded-full hover:bg-[#5A90C4] transition">Browse posts</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div key={post.id} onClick={() => router.push(`/post/${post.id}`)} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={(e) => { e.stopPropagation(); router.push(`/profile/${post.userId}`); }} className="flex items-center gap-2 hover:opacity-80 transition">
                    <div className="w-8 h-8 rounded-full bg-[#2F4B7C] flex items-center justify-center text-white text-xs font-bold">
                      {(post.username?.[0] || post.userEmail?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">{post.username || post.userEmail}</p>
                      <p className="text-xs text-gray-400">{formatDate(post.createdAt)}</p>
                    </div>
                  </button>
                  <button onClick={(e) => handleToggleBookmark(e, post.id)} title="Remove bookmark" className="p-2 rounded-lg hover:bg-gray-100 transition">
                    <svg className="w-5 h-5" fill={bookmarkedIds.has(post.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: bookmarkedIds.has(post.id) ? "#F4A261" : "#9ca3af" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>

                {post.featuredImage && (
                  <div className="mb-3 rounded-xl overflow-hidden relative h-40">
                    <Image src={post.featuredImage} alt={post.title || "Post image"} fill className="object-cover" unoptimized />
                  </div>
                )}

                {post.title && <h3 className="text-base font-bold text-gray-900 mb-1">{post.title}</h3>}
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-2" dangerouslySetInnerHTML={{ __html: post.content.replace(/<[^>]*>/g, "").substring(0, 150) + (post.content.length > 150 ? "..." : "") }} />

                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {post.tags.map((tag, i) => <span key={i} className="text-xs text-[#6FA8DC] font-medium">#{tag}</span>)}
                  </div>
                )}

                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
                  <span>❤️ {post.likes?.length || 0}</span>
                  <span>💬 {post.comments || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}