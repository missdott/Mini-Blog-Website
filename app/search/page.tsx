"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { searchPosts, SearchPost } from "@/lib/searchService";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

// ─── Types & Helpers ──────────────────────────────────────────────────────────

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";

const formatDate = (createdAt: { toDate: () => Date } | null) =>
  createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? "";

const highlightMatch = (text: string, term: string) => {
  if (!term.trim() || !text) return text;
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${esc})`, "gi"), '<mark class="bg-yellow-100 text-yellow-900 rounded px-0.5">$1</mark>');
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const MoreIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
);
const HeartIcon = ({ className, filled }: { className?: string; filled?: boolean }) => (
  <svg className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path {...sw2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
);
const CommentIcon = ({ className }: { className?: string }) => (
  <svg className={className} {...ip}><path {...sw2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
);
const ShareIcon = ({ className }: { className?: string }) => (
  <svg className={className} {...ip}><path {...sw2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
);
const BookmarkIcon = ({ className }: { className?: string }) => (
  <svg className={className} {...ip}><path {...sw2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
);

// ─── Spinner ──────────────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F4B7C]" />
  </div>
);

// ─── SearchPageContent ────────────────────────────────────────────────────────

function SearchPageContent() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [results, setResults] = useState<SearchPost[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const didInitSearch = useRef(false);

  // ── Effects ──

  useEffect(() => { if (!authLoading && !user) router.push("/"); }, [user, authLoading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
      if (openMenuId && !menuRefs.current[openMenuId]?.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuId]);

  useEffect(() => {
    if (didInitSearch.current) return;
    didInitSearch.current = true;
    const q = searchParams.get("q");
    if (q) { setQuery(q); runSearch(q); }
  }, [searchParams]);

  // ── Handlers ──

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setSearching(true); setHasSearched(true);
    try { setResults(await searchPosts(q)); }
    catch (err) { console.error("Search error:", err); setResults([]); }
    finally { setSearching(false); }
  };

  const handleSearch = () => {
    if (!query.trim()) return;
    router.replace(`/search?q=${encodeURIComponent(query.trim())}`);
    runSearch(query.trim());
  };

  const handleLike = async (e: React.MouseEvent, postId: string, currentLikes: string[] = []) => {
    e.stopPropagation();
    if (!user) return;
    const isLiked = currentLikes.includes(user.uid);
    try {
      await updateDoc(doc(db, "posts", postId), { likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
      setResults((prev) => prev.map((p) => p.id !== postId ? p : {
        ...p, likes: isLiked ? p.likes?.filter((u) => u !== user.uid) : [...(p.likes || []), user.uid],
      }));
    } catch (err) { console.error("Error updating like:", err); }
  };

  const handleSeeProfile = (e: React.MouseEvent, userId: string) => { e.stopPropagation(); router.push(`/profile/${userId}`); setOpenMenuId(null); };
  const handleReport = (e: React.MouseEvent) => { e.stopPropagation(); if (window.confirm("Are you sure you want to report this post?")) { alert("Post reported. Thank you for helping keep our community safe."); setOpenMenuId(null); } };
  const handleLogout = async () => { await signOut(); router.push("/"); };

  // ── Render ──

  if (authLoading) return <Spinner />;

  const displayQuery = searchParams.get("q") || query;

  return (
    <div className="min-h-screen bg-[#F6F3EC]">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40 border-b border-gray-100">
        <div className="w-full pl-4 pr-6 h-16 flex items-center justify-between gap-4">
          <Link href="/home"><h1 className="font-serif text-2xl font-bold tracking-wide text-[#2F4B7C] cursor-pointer transition-opacity hover:opacity-80">NOOK</h1></Link>
          <div className="flex-1 max-w-xl">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="Search posts, authors, tags..." autoFocus className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6FA8DC] text-sm bg-white" />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" {...ip}><path {...sw2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <button onClick={handleSearch} disabled={!query.trim() || searching} className="px-5 py-2 text-sm font-bold text-white bg-[#6FA8DC] rounded-lg hover:bg-[#5A90C4] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                {searching ? "Searching..." : "Search"}
              </button>
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
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-xl py-2 z-50 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-gray-50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Account</p>
                    <p className="text-sm font-bold text-[#1F2F46] truncate">{user?.email}</p>
                  </div>
                  <div className="py-2">
                    <Link href="/dashboard" onClick={() => setShowMenu(false)} className={menuItem}>My Profile</Link>
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
        {hasSearched && !searching && (
          <p className="text-sm text-gray-500 mb-6">
            {results.length === 0 ? `No results for "${displayQuery}"` : `${results.length} result${results.length === 1 ? "" : "s"} for "${displayQuery}"`}
          </p>
        )}

        {/* Skeleton */}
        {searching && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 animate-pulse">
                <div className="flex items-center gap-3 mb-4"><div className="w-9 h-9 rounded-full bg-gray-200" /><div className="h-4 bg-gray-200 rounded w-32" /></div>
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-full mb-1" /><div className="h-4 bg-gray-100 rounded w-5/6" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!hasSearched && !searching && (
          <div className="text-center py-20">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" {...ip}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <p className="text-gray-400 text-lg font-medium">Search for posts, authors or tags</p>
            <p className="text-gray-400 text-sm mt-1">Press Enter or click Search to find results</p>
          </div>
        )}

        {/* No results */}
        {hasSearched && !searching && results.length === 0 && (
          <div className="text-center py-20">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" {...ip}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-gray-400 text-lg font-medium">No posts found</p>
            <p className="text-gray-400 text-sm mt-1">Try different keywords or check your spelling</p>
          </div>
        )}

        {/* Results */}
        {!searching && results.length > 0 && (
          <div className="space-y-4">
            {results.map((post) => (
              <div key={post.id} onClick={() => router.push(`/post/${post.id}`)} className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={(e) => handleSeeProfile(e, post.userId)} className="flex items-center gap-3 hover:opacity-80 transition">
                    <div className="w-10 h-10 rounded-full bg-[#2F4B7C] flex items-center justify-center text-white font-bold text-sm">
                      {(post.username?.[0] || post.userEmail?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900 text-sm hover:text-[#6FA8DC] transition" dangerouslySetInnerHTML={{ __html: highlightMatch(post.username || post.userEmail, query) }} />
                      <p className="text-xs text-gray-500">• {formatDate(post.createdAt)}</p>
                    </div>
                  </button>
                  <div className="relative" ref={(el) => { menuRefs.current[post.id] = el; }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === post.id ? null : post.id); }} className="p-2 hover:bg-gray-100 rounded-lg transition">
                      <MoreIcon className="w-5 h-5 text-gray-400" />
                    </button>
                    {openMenuId === post.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
                        <button onClick={(e) => handleSeeProfile(e, post.userId)} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition">See profile</button>
                        <button onClick={handleReport} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition">Report</button>
                      </div>
                    )}
                  </div>
                </div>

                {post.title && <h3 className="text-lg font-bold text-gray-900 mb-2" dangerouslySetInnerHTML={{ __html: highlightMatch(post.title, query) }} />}
                <div className="text-gray-700 text-sm prose prose-sm max-w-none mb-3" dangerouslySetInnerHTML={{ __html: highlightMatch(post.content.substring(0, 300) + (post.content.length > 300 ? "..." : ""), query) }} />

                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {post.tags.map((tag, i) => <span key={i} className="text-xs text-[#6FA8DC] font-medium" dangerouslySetInnerHTML={{ __html: highlightMatch(`#${tag}`, query) }} />)}
                  </div>
                )}

                <div className="flex items-center gap-6 pt-3 border-t border-gray-100">
                  <button onClick={(e) => handleLike(e, post.id, post.likes)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition">
                    <HeartIcon className="w-5 h-5" filled={post.likes?.includes(user?.uid || "")} />
                    <span className="text-xs">{post.likes?.length || 0}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); router.push(`/post/${post.id}#comments`); }} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#6FA8DC] transition">
                    <CommentIcon className="w-5 h-5" /><span className="text-xs">{post.comments || 0}</span>
                  </button>
                  <button onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#6FA8DC] transition">
                    <ShareIcon className="w-5 h-5" /><span className="text-xs">Share</span>
                  </button>
                  <button onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#6FA8DC] transition ml-auto">
                    <BookmarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SearchPage ───────────────────────────────────────────────────────────────

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SearchPageContent />
    </Suspense>
  );
}