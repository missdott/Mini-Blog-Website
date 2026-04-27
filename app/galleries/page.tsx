"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "firebase/auth";
import { collection, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types & Helpers ──────────────────────────────────────────────────────────

interface Post {
  id: string; title?: string; content: string; featuredImage?: string;
  featuredImages?: string[]; tags?: string[]; createdAt: Timestamp;
  userId: string; username?: string; userEmail: string;
  likes?: string[]; comments?: number; isPrivate: boolean; isDraft: boolean;
}

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";

const getMonthKey = (ts: Timestamp) => ts.toDate().toLocaleDateString("en-US", { month: "long", year: "numeric" });

const getMonthImages = (posts: Post[]) => posts.flatMap((p) => p.featuredImages?.length ? p.featuredImages : p.featuredImage ? [p.featuredImage] : []);

const getCoverImage = (posts: Post[]) => {
  const sorted = [...posts].sort((a, b) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0));
  for (const p of sorted) { const img = p.featuredImages?.[0] || p.featuredImage; if (img) return img; }
  return "";
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ─── Shared Components ────────────────────────────────────────────────────────

function PostThumb({ src, size }: { src: string; size: string }) {
  return <div className="relative w-full h-full"><Image src={src} alt="" fill className="object-cover" unoptimized sizes={size} /></div>;
}

function NoThumb({ iconSize = "w-5 h-5" }: { iconSize?: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center text-gray-400">
      <svg className={iconSize} {...ip}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    </div>
  );
}

function ChevronRight() {
  return <svg className="w-4 h-4 text-gray-300 group-hover:text-[#6FA8DC] transition shrink-0" {...ip}><path {...sw2} d="M9 5l7 7-7 7" /></svg>;
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
        <motion.div className="relative z-10 bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25 }}>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ModalHeader({ title, sub, onClose }: { title: React.ReactNode; sub: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
      <div>{title}<p className="text-sm text-gray-400 mt-0.5">{sub}</p></div>
      <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition text-gray-500">
        <svg className="w-5 h-5" {...ip}><path {...sw2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

function PostRow({ post, onClick, thumbSize = "w-12 h-12", iconSize = "w-5 h-5" }: { post: Post; onClick: () => void; thumbSize?: string; iconSize?: string }) {
  const src = post.featuredImages?.[0] || post.featuredImage || "";
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 bg-[#F6F3EC] hover:bg-[#EDE9E0] rounded-xl px-4 py-3 transition text-left group">
      <div className={`${thumbSize} rounded-lg overflow-hidden bg-gray-200 shrink-0 relative`}>
        {src ? <PostThumb src={src} size={thumbSize.includes("12") ? "48px" : "40px"} /> : <NoThumb iconSize={iconSize} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#2F4B7C] text-sm truncate group-hover:text-[#6FA8DC] transition">{post.title || "Untitled"}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {post.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {post.tags?.length ? ` · ${post.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" /></svg>
          {post.likes?.length ?? 0}
        </span>
        <ChevronRight />
      </div>
    </button>
  );
}

// ─── MonthModal ───────────────────────────────────────────────────────────────

function MonthModal({ monthKey, posts, onClose }: { monthKey: string; posts: Post[]; onClose: () => void }) {
  const router = useRouter();
  const images = getMonthImages(posts);
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={<h2 className="text-2xl font-bold text-[#2F4B7C]">{monthKey}</h2>} sub={`${plural(posts.length, "entry")} · ${plural(images.length, "photo")}`} onClose={onClose} />
      <div className="overflow-y-auto flex-1">
        {images.length > 0 && (
          <div className="p-6 pb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Photo Filmstrip</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <Image src={img} alt="" fill className="object-cover" unoptimized sizes="20vw" />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="p-6 pt-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Entries</p>
          {posts.map((post) => <PostRow key={post.id} post={post} onClick={() => router.push(`/post/${post.id}`)} />)}
        </div>
      </div>
    </ModalShell>
  );
}

// ─── TagModal ─────────────────────────────────────────────────────────────────

function TagModal({ tag, posts, onClose }: { tag: string; posts: Post[]; onClose: () => void }) {
  const router = useRouter();
  const images = getMonthImages(posts);
  const byMonth: Record<string, Post[]> = {};
  posts.forEach((p) => { const mk = getMonthKey(p.createdAt); if (!byMonth[mk]) byMonth[mk] = []; byMonth[mk].push(p); });
  const monthCount = Object.keys(byMonth).length;

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={<span className="text-2xl font-bold text-[#6FA8DC]">#{tag}</span>} sub={`${plural(posts.length, "entry")} across ${plural(monthCount, "month")}`} onClose={onClose} />
      <div className="overflow-y-auto flex-1 p-6 space-y-6">
        {images.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">All Photos</p>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {images.slice(0, 15).map((img, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <Image src={img} alt="" fill className="object-cover" unoptimized sizes="15vw" />
                </div>
              ))}
              {images.length > 15 && <div className="relative aspect-square rounded-lg bg-gray-100 flex items-center justify-center"><span className="text-sm font-bold text-gray-500">+{images.length - 15}</span></div>}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Timeline</p>
          <div className="space-y-4">
            {Object.entries(byMonth).map(([month, mPosts]) => (
              <div key={month}>
                <p className="text-xs font-semibold text-gray-500 mb-2">{month}</p>
                <div className="space-y-2">
                  {mPosts.map((post) => (
                    <button key={post.id} onClick={() => router.push(`/post/${post.id}`)} className="w-full flex items-center gap-3 bg-[#F6F3EC] hover:bg-[#EDE9E0] rounded-xl px-4 py-3 transition text-left group">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 shrink-0 relative">
                        {(post.featuredImages?.[0] || post.featuredImage)
                          ? <PostThumb src={post.featuredImages?.[0] || post.featuredImage || ""} size="40px" />
                          : <NoThumb iconSize="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#2F4B7C] text-sm truncate group-hover:text-[#6FA8DC] transition">{post.title || "Untitled"}</p>
                        <p className="text-xs text-gray-400">{post.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </div>
                      <ChevronRight />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="font-bold text-[#2F4B7C] text-lg">{title}</p>
      <p className="text-gray-400 text-sm mt-2 max-w-xs mx-auto">{desc}</p>
      <Link href="/editor" className="inline-flex items-center gap-2 mt-6 bg-[#6FA8DC] hover:bg-[#5A90C4] text-white text-sm font-bold px-6 py-3 rounded-full transition">
        <span>+</span> Create your first entry
      </Link>
    </div>
  );
}

// ─── GalleriesPage ────────────────────────────────────────────────────────────

export default function GalleriesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyGroups, setMonthlyGroups] = useState<Record<string, Post[]>>({});
  const [tagGroups, setTagGroups] = useState<[string, Post[]][]>([]);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [tab, setTab] = useState<"monthly" | "interests">("monthly");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!authLoading && !user) router.push("/"); }, [user, authLoading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(query(collection(db, "posts"), where("userId", "==", user.uid), where("isDraft", "==", false), orderBy("createdAt", "desc")));
      const fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Post[];
      setPosts(fetched);

      const monthly: Record<string, Post[]> = {};
      fetched.forEach((p) => { if (!p.createdAt) return; const mk = getMonthKey(p.createdAt); if (!monthly[mk]) monthly[mk] = []; monthly[mk].push(p); });
      setMonthlyGroups(monthly);

      const tagCount: Record<string, Post[]> = {};
      fetched.forEach((p) => p.tags?.forEach((tag) => { const t = tag.toLowerCase().trim(); if (!tagCount[t]) tagCount[t] = []; tagCount[t].push(p); }));
      setTagGroups(Object.entries(tagCount).filter(([, ps]) => ps.length >= 2).sort((a, b) => b[1].length - a[1].length));
      setLoading(false);
    })();
  }, [user]);

  const handleLogout = async () => { try { await signOut(auth); router.push("/"); } catch (e) { console.error("Logout error:", e); } };
  const handleSearchNavigate = () => { if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`); };

  if (authLoading || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6FA8DC] mx-auto" />
        <p className="mt-4 text-[#2F4B7C] text-sm">Building your galleries…</p>
      </div>
    </div>
  );

  const monthKeys = Object.keys(monthlyGroups);
  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? "bg-[#2F4B7C] text-white shadow-md" : "bg-white text-[#2F4B7C] border border-gray-200 hover:border-[#6FA8DC]"}`}>{label}</button>
  );

  return (
    <div className="min-h-screen bg-[#F6F3EC]">
      {openMonth && monthlyGroups[openMonth] && <MonthModal monthKey={openMonth} posts={monthlyGroups[openMonth]} onClose={() => setOpenMonth(null)} />}
      {openTag && <TagModal tag={openTag} posts={tagGroups.find(([t]) => t === openTag)?.[1] ?? []} onClose={() => setOpenTag(null)} />}

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

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-[#2F4B7C] font-serif">Smart Galleries</h2>
          <p className="text-gray-500 text-sm mt-1">Your life, automatically organized — {plural(posts.length, "entry")} across {plural(monthKeys.length, "month")}</p>
        </div>

        <div className="flex gap-2 mb-8">
          {tabBtn("monthly", "📅 Monthly Log")}
          {tabBtn("interests", "✨ Interest Pulse")}
        </div>

        {/* Monthly Log */}
        {tab === "monthly" && (
          monthKeys.length === 0
            ? <EmptyState icon="📅" title="No entries yet" desc="Start writing posts and they'll appear here, grouped by month." />
            : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {monthKeys.map((mk, i) => {
                  const mPosts = monthlyGroups[mk];
                  const cover = getCoverImage(mPosts);
                  const totalPhotos = getMonthImages(mPosts).length;
                  const topLikes = Math.max(...mPosts.map((p) => p.likes?.length ?? 0));
                  return (
                    <motion.button key={mk} onClick={() => setOpenMonth(mk)} className="group relative bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 text-left" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -4 }}>
                      <div className="relative h-44 bg-linear-to-br from-[#5A90C4] to-[#2F4B7C] overflow-hidden">
                        {cover
                          ? <Image src={cover} alt={mk} fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                          : <div className="absolute inset-0 flex items-center justify-center"><span className="text-5xl opacity-30">📝</span></div>}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                        {totalPhotos > 0 && (
                          <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                            <svg className="w-3 h-3" {...ip}><path {...sw2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            {totalPhotos}
                          </div>
                        )}
                      </div>
                      <div className="px-5 py-4">
                        <h3 className="font-bold text-[#2F4B7C] text-lg leading-tight group-hover:text-[#6FA8DC] transition-colors">{mk}</h3>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" {...ip}><path {...sw2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            {plural(mPosts.length, "entry")}
                          </span>
                          {topLikes > 0 && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" /></svg>
                              {topLikes} top likes
                            </span>
                          )}
                        </div>
                        {totalPhotos > 0 && (
                          <div className="flex gap-1 mt-3">
                            {getMonthImages(mPosts).slice(0, 4).map((img, idx) => (
                              <div key={idx} className="relative w-10 h-10 rounded-md overflow-hidden bg-gray-100 shrink-0">
                                <Image src={img} alt="" fill className="object-cover" unoptimized sizes="40px" />
                              </div>
                            ))}
                            {totalPhotos > 4 && <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">+{totalPhotos - 4}</div>}
                          </div>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
        )}

        {/* Interest Pulse */}
        {tab === "interests" && (
          tagGroups.length === 0
            ? <EmptyState icon="✨" title="No interests detected yet" desc="Tag your posts with topics like #fitness or #coding. Tags used 2+ times will appear here as dedicated galleries." />
            : <>
                <div className="mb-8">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Your Top Interests</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {tagGroups.slice(0, 3).map(([tag, tPosts], i) => {
                      const cover = getCoverImage(tPosts);
                      const totalPhotos = getMonthImages(tPosts).length;
                      return (
                        <motion.button key={tag} onClick={() => setOpenTag(tag)} className="group relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 text-left" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -4 }}>
                          <div className="relative h-52 bg-linear-to-br from-[#6FA8DC] to-[#F4A261] overflow-hidden">
                            {cover
                              ? <Image src={cover} alt={tag} fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized sizes="33vw" />
                              : <div className="absolute inset-0 flex items-center justify-center"><span className="text-6xl opacity-20">#</span></div>}
                            <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                              <p className="text-white font-bold text-xl">#{tag}</p>
                              <p className="text-white/70 text-xs mt-0.5">{tPosts.length} entries{totalPhotos > 0 ? ` · ${totalPhotos} photos` : ""}</p>
                            </div>
                            {i === 0 && <div className="absolute top-3 left-3 bg-[#F4A261] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">#1 Interest</div>}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
                {tagGroups.length > 3 && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">All Interests</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {tagGroups.slice(3).map(([tag, tPosts], i) => {
                        const cover = getCoverImage(tPosts);
                        const totalPhotos = getMonthImages(tPosts).length;
                        const pct = Math.round((tPosts.length / tagGroups[0][1].length) * 100);
                        return (
                          <motion.button key={tag} onClick={() => setOpenTag(tag)} className="group bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-[#6FA8DC] transition-all text-left" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -2 }}>
                            {cover && <div className="relative w-full aspect-video rounded-lg overflow-hidden mb-3 bg-gray-100"><Image src={cover} alt={tag} fill className="object-cover" unoptimized sizes="25vw" /></div>}
                            <p className="font-bold text-[#2F4B7C] text-sm group-hover:text-[#6FA8DC] transition">#{tag}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{tPosts.length} entries{totalPhotos > 0 ? ` · ${totalPhotos} photos` : ""}</p>
                            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#6FA8DC] rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
        )}
      </div>
    </div>
  );
}