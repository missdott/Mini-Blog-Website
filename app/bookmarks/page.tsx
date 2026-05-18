"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getBookmarkedPosts, toggleBookmark } from "@/lib/bookmarkService";
import Image from "next/image";

// ─── Types & Helpers ──────────────────────────────────────────────────────────

interface Post {
  id: string; title?: string; content: string; username: string;
  userEmail: string; userId: string; createdAt: { toDate: () => Date };
  likes?: string[]; comments?: number; tags?: string[];
  categories?: string[]; featuredImage?: string; profileImage?: string;
  isPrivate: boolean; isDraft: boolean;
}

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };

const formatDate = (createdAt: Post["createdAt"]) => {
  try { return createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
};

const timeAgo = (createdAt: Post["createdAt"]) => {
  try {
    const date = createdAt?.toDate();
    if (!date) return "";
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  } catch { return ""; }
};

const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookmarksPage() {
  const { user, loading: authLoading, signOut } = useAuth();
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
        setPosts(fetched as unknown as Post[]);
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

  const handleLogout = async () => { await signOut(); router.push("/"); };

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
              <button onClick={handleSearchNavigate} disabled={!searchQuery.trim()} className="px-4 py-2 text-sm font-bold text-white bg-[#6FA8DC] rounded-lg hover:bg-[#5A90C4] transition-all duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed shrink-0 hover:shadow-md hover:scale-105 active:scale-95 cursor-pointer">Search</button>
            </div>
          </div>
          <nav className="flex items-center gap-8 shrink-0">
            <Link href="/home" className={navLink}>Home</Link>
            <Link href="/dashboard" className={navLink}>My Blogs</Link>
            <Link href="/galleries" className={navLink}>Galleries</Link>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu((s) => !s)} className="p-2 hover:bg-[#F6F3EC] rounded-full transition-all duration-200 ease-in-out group cursor-pointer hover:scale-110 active:scale-95">
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
                    <button onClick={handleLogout} className="w-full text-left px-5 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-all duration-200 ease-in-out hover:text-red-700 cursor-pointer">Log Out</button>
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
            <Link href="/home" className="inline-block mt-6 px-6 py-2.5 bg-[#6FA8DC] text-white text-sm font-bold rounded-full hover:bg-[#5A90C4] transition-all duration-200 ease-in-out hover:shadow-md hover:scale-105 active:scale-95 cursor-pointer">Browse posts</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => {
              const strippedContent = post.content?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "";
              return (
                <div key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/post/${post.id}`)}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <button onClick={(e) => { e.stopPropagation(); router.push(`/profile/${post.userId}`); }} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#2F4B7C] flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden relative">
                        {post.profileImage
                          ? <Image src={post.profileImage} alt="" fill className="object-cover" unoptimized onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          : (post.username?.[0] || post.userEmail?.[0] || "?").toUpperCase()
                        }
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-[#1F2F46] leading-none">{post.username || post.userEmail?.split("@")[0]}</p>
                        <p className="text-xs text-gray-400 mt-0.5">• {timeAgo(post.createdAt)}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => handleToggleBookmark(e, post.id)} className={`transition p-1.5 rounded-full hover:bg-[#F6F3EC] ${bookmarkedIds.has(post.id) ? "text-[#F4A261]" : "text-gray-400 hover:text-[#F4A261]"}`}>
                        <svg className="w-5 h-5" fill={bookmarkedIds.has(post.id) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* Featured image */}
                  {post.featuredImage && (
                    <div className="relative w-full h-56">
                      <Image src={post.featuredImage} alt={post.title || "Post image"} fill className="object-cover" unoptimized />
                    </div>
                  )}

                  {/* Body */}
                  <div className="px-4 py-3">
                    {post.title && <h3 className="font-bold text-[#1F2F46] text-base mb-1">{post.title}</h3>}
                    {strippedContent && <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed">{strippedContent.substring(0, 200)}{strippedContent.length > 200 ? "..." : ""}</p>}
                    {(post.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {post.tags!.map((tag, i) => <span key={i} className="text-xs text-[#6FA8DC] font-medium">#{tag}</span>)}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                    <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                      <span className="text-xs">{post.likes?.length || 0}</span>
                    </button>
                    <button onClick={() => router.push(`/post/${post.id}#comments`)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#6FA8DC] transition">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      <span className="text-xs">{post.comments || 0}</span>
                    </button>
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}/post/${post.id}`;
                      try {
                        if (navigator.share) { await navigator.share({ title: post.title || "Check out this post", url }); }
                        else { await navigator.clipboard.writeText(url); showToast("Link copied to clipboard!"); }
                      } catch { await navigator.clipboard.writeText(url); showToast("Link copied to clipboard!"); }
                    }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 transition">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                      <span className="text-xs">Share</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}