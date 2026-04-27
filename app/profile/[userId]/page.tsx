"use client";

import { useAuth } from "@/lib/AuthContext";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, orderBy, Timestamp, doc, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import Link from "next/link";
import Image from "next/image";
import { toggleFollow, getFollowing, getFollowerCount, getFollowingCount } from "@/lib/followService";

// ─── Types & Helpers ──────────────────────────────────────────────────────────

interface BlogPost {
  id: string; title?: string; content: string; featuredImage?: string;
  featuredImages?: string[]; categories?: string[]; tags?: string[];
  isPrivate: boolean; isDraft: boolean; createdAt: Timestamp;
  userId: string; userEmail: string; username?: string;
  likes?: string[]; comments?: number;
}

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";

const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

const formatDate = (ts: Timestamp) => ts?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const getPostImages = (post: BlogPost) => post.featuredImages?.length ? post.featuredImages : post.featuredImage ? [post.featuredImage] : [];

// ─── ProfilePage ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const profileUserId = params.userId as string;

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showPostMenu, setShowPostMenu] = useState<string | null>(null);
  const profileUsername = localStorage.getItem(`username_${profileUserId}`) || "";
  const profileImage = localStorage.getItem(`profileImage_${profileUserId}`) || "";
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOwnProfile = user?.uid === profileUserId;

  // ── Effects ──

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchQuery]);

  useEffect(() => {
    if (!user || !profileUserId) return;

    getDocs(query(collection(db, "posts"), where("userId", "==", profileUserId), where("isPrivate", "==", false), where("isDraft", "==", false), orderBy("createdAt", "desc")))
      .then((snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BlogPost[]))
      .catch((err) => { console.error("Error fetching posts:", err); setPosts([]); })
      .finally(() => setIsLoading(false));

    getFollowing(user.uid).then((f) => setFollowedUsers(new Set(f)));
    getFollowerCount(profileUserId).then(setFollowerCount);
    getFollowingCount(profileUserId).then(setFollowingCount);
  }, [user, profileUserId]);

  // ── Handlers ──

  const handleFollow = async (targetId: string) => {
    if (!user?.uid || targetId === user.uid) return;
    const isFollowing = followedUsers.has(targetId);
    const toggle = (s: Set<string>) => { const n = new Set(s); if (isFollowing) n.delete(targetId); else n.add(targetId); return n; };
    const revert = (s: Set<string>) => { const n = new Set(s); if (isFollowing) n.add(targetId); else n.delete(targetId); return n; };
    setFollowedUsers(toggle);
    setFollowerCount((c) => c + (isFollowing ? -1 : 1));
    try { await toggleFollow(user.uid, targetId, isFollowing); }
    catch { setFollowedUsers(revert); setFollowerCount((c) => c + (isFollowing ? 1 : -1)); }
  };

  const handleLike = async (postId: string) => {
    if (!user?.uid) return;
    const ref = doc(db, "posts", postId);
    const likes = (await getDoc(ref)).data()?.likes || [];
    await updateDoc(ref, { likes: likes.includes(user.uid) ? arrayRemove(user.uid) : arrayUnion(user.uid) });
    getDocs(query(collection(db, "posts"), where("userId", "==", profileUserId), where("isPrivate", "==", false), where("isDraft", "==", false), orderBy("createdAt", "desc")))
      .then((snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BlogPost[]));
  };

  const handleLogout = async () => { await signOut(auth); router.push("/"); };

  const filteredPosts = posts.filter((p) => {
    if (!debouncedQuery) return true;
    const q = debouncedQuery.toLowerCase();
    return p.title?.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) ||
      p.tags?.some((t) => t.toLowerCase().includes(q)) || p.categories?.some((c) => c.toLowerCase().includes(q));
  });

  // ── Render ──

  if (loading || isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F4B7C]" />
    </div>
  );

  const displayName = profileUsername || `@${posts[0]?.userEmail?.split("@")[0] || "user"}`;
  const navLinkCls = (path: string) => `font-bold transition-colors uppercase tracking-widest text-[11px] ${pathname === path ? "text-[#6FA8DC]" : "text-[#2F4B7C] hover:text-[#6FA8DC]"}`;

  return (
    <div className="min-h-screen bg-[#F6F3EC]" onClick={() => { setShowPostMenu(null); setShowMenu(false); }}>

      {/* Navbar */}
      <header className="bg-white shadow-sm sticky top-0 z-40 border-b border-gray-100">
        <div className="w-full pl-4 pr-6 h-16 flex items-center justify-between gap-4">
          <Link href="/home"><h1 className="font-serif text-2xl font-bold tracking-wide text-[#2F4B7C] cursor-pointer transition-opacity hover:opacity-80">NOOK</h1></Link>
          <div className="flex-1 max-w-md">
            <div className="relative">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search posts..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6FA8DC] text-sm bg-white" />
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" {...ip}><path {...sw2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          </div>
          <nav className="flex items-center gap-8 shrink-0">
            <Link href="/home" className={navLinkCls("/home")}>Home</Link>
            <Link href="/dashboard" className={navLinkCls("/dashboard")}>My Blogs</Link>
            <Link href="/galleries" className={navLinkCls("/galleries")}>Galleries</Link>
            <div className="relative" ref={menuRef}>
              <button onClick={(e) => { e.stopPropagation(); setShowMenu((s) => !s); }} className="p-2 hover:bg-[#F6F3EC] rounded-full transition-colors group">
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

      {/* Profile Header */}
      <div className="bg-white">
        <div className="h-48 bg-[#2F4B7C] relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-64 h-64 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-12 -left-8 w-80 h-80 bg-[#F4A261]/20 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-6 items-center pb-6">
            <div className="relative z-10 -mt-14 w-28 h-28 bg-white p-1 rounded-xl shadow-xl shrink-0 ring-4 ring-white overflow-hidden">
              {profileImage
                ? <Image src={profileImage} alt="Profile" fill className="object-cover rounded-lg" unoptimized />
                : <div className="w-full h-full bg-[#2F4B7C] rounded-lg flex items-center justify-center"><span className="text-3xl font-bold text-white">{displayName[0]?.toUpperCase()}</span></div>
              }
            </div>
            <div className="pt-2 flex-1 min-w-0">
              <div className="flex items-center gap-8 flex-wrap">
                <h2 className="font-serif text-2xl font-bold text-[#1F2F46] leading-none py-1">{displayName}</h2>
                <div className="flex items-center gap-6">
                  {([["Posts", posts.length], ["Followers", followerCount], ["Following", followingCount]] as const).map(([label, val]) => (
                    <div key={label} className="flex flex-col items-center">
                      <span className="text-lg font-bold text-[#1F2F46]">{val}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#2F4B7C]">{label}</span>
                    </div>
                  ))}
                </div>
                {!isOwnProfile && (
                  <button onClick={() => handleFollow(profileUserId)} className={`ml-auto inline-flex items-center gap-2 text-base font-bold px-8 py-3 rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${followedUsers.has(profileUserId) ? "bg-gray-100 text-[#2F4B7C] border border-[#2F4B7C]/20 hover:bg-gray-200" : "bg-[#6FA8DC] text-white hover:bg-[#5A90C4]"}`}>
                    {followedUsers.has(profileUserId) ? "Unfollow" : "Follow"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {filteredPosts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
            <p className="text-gray-500 text-lg">{searchQuery ? "No posts match your search." : "No public posts yet."}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredPosts.map((post) => {
              const images = getPostImages(post);
              const isLiked = post.likes?.includes(user?.uid || "");
              return (
                <article key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible relative">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <Link href={`/profile/${post.userId}`} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2F4B7C] flex items-center justify-center text-white text-xs font-bold">
                        {(post.username || post.userEmail || "U")[0].toUpperCase()}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{post.username || `@${post.userEmail?.split("@")[0]}`}</p>
                        <span className="text-gray-400">•</span>
                        <p className="text-xs text-gray-500">{formatDate(post.createdAt)}</p>
                      </div>
                    </Link>
                    <div className="relative">
                      <button onClick={(e) => { e.stopPropagation(); setShowPostMenu(showPostMenu === post.id ? null : post.id); }} className="p-1 hover:bg-gray-100 rounded-full">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                      </button>
                      {showPostMenu === post.id && (
                        <div className="absolute left-full ml-2 top-0 w-56 bg-white rounded-lg shadow-2xl z-100 border border-gray-200" onClick={(e) => e.stopPropagation()}>
                          <button className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-gray-50 text-left">
                            <svg className="w-4 h-4" {...ip}><path {...sw2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            Report
                          </button>
                          {post.userId !== user?.uid && (
                            <button onClick={() => { handleFollow(post.userId); setShowPostMenu(null); }} className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-gray-50 text-left">
                              <svg className="w-4 h-4" {...ip}>
                                {followedUsers.has(post.userId)
                                  ? <path {...sw2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                  : <path {...sw2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />}
                              </svg>
                              {followedUsers.has(post.userId) ? "Unfollow" : "Follow"}
                            </button>
                          )}
                          <button className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-gray-50 text-left">
                            <svg className="w-4 h-4" {...ip}><path {...sw2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            About this Account
                          </button>
                          <button onClick={() => setShowPostMenu(null)} className="w-full px-4 py-3 text-sm text-gray-600 border-t hover:bg-gray-50">Cancel</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Images */}
                  {images.length > 0 && (
                    <div className={`grid gap-1 overflow-hidden ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                      {images.map((img, i) => (
                        <div key={i} className="relative w-full h-64">
                          <Image src={img} alt={`Post image ${i + 1}`} fill className="object-cover" unoptimized />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Content */}
                  <div className="px-4 py-3">
                    {post.title && <p className="font-semibold text-gray-900 mb-1">{post.title}</p>}
                    <p className="text-gray-800 text-sm leading-relaxed line-clamp-3">
                      {stripHtml(post.content).substring(0, 200)}{post.content.length > 200 ? "..." : ""}
                    </p>
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {post.tags.map((tag, i) => <span key={i} className="text-xs text-blue-600 hover:underline cursor-pointer">#{tag}</span>)}
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
                      <button onClick={() => handleLike(post.id)} className={`flex items-center gap-1.5 transition ${isLiked ? "text-red-600" : "text-gray-700 hover:text-red-600"}`}>
                        <svg className="w-6 h-6" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path {...sw2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                        <span className="text-xs">{post.likes?.length || 0}</span>
                      </button>
                      <button className="flex items-center gap-1.5 text-gray-700 hover:text-blue-600 transition">
                        <svg className="w-6 h-6" {...ip}><path {...sw2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <span className="text-xs">{post.comments || 0}</span>
                      </button>
                      <button className="flex items-center gap-1.5 text-gray-700 hover:text-green-600 transition">
                        <svg className="w-6 h-6" {...ip}><path {...sw2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                        <span className="text-xs">Shares</span>
                      </button>
                    </div>
                    <button className="text-gray-700 hover:text-yellow-600 transition">
                      <svg className="w-6 h-6" {...ip}><path {...sw2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}