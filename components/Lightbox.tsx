"use client";

import { useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface Post {
  id: string; title: string; content: string; featuredImage: string;
  createdAt: { toDate: () => Date }; userId: string; username: string;
  likes: string[]; comments: number;
}

interface LightboxProps {
  post: Post; onClose: () => void; onPrev: () => void; onNext: () => void;
  totalCount: number; currentIndex: number;
}

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
const navBtn = "absolute top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/30 backdrop-blur-sm text-white rounded-full p-3 transition-all duration-300 ease-in-out hover:shadow-lg hover:scale-110 active:scale-95 cursor-pointer";

export default function Lightbox({ post, onClose, onPrev, onNext, totalCount, currentIndex }: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, onPrev, onNext]);

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
        <motion.div className="relative z-10 flex w-full h-full max-w-7xl mx-auto" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.25 }}>

          {/* Image — 70% */}
          <div className="relative w-[70%] h-full flex items-center justify-center bg-black">
            <Image src={post.featuredImage} alt={post.title} fill className="object-contain" sizes="70vw" priority />
            <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className={`${navBtn} left-4`}>
              <svg className="w-5 h-5" {...ip}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onNext(); }} className={`${navBtn} right-4`}>
              <svg className="w-5 h-5" {...ip}><path {...sw2} d="M9 5l7 7-7 7" /></svg>
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full">
              {currentIndex + 1} / {totalCount}
            </div>
          </div>

          {/* Sidebar — 30% */}
          <div className="w-[30%] h-full bg-white flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#6FA8DC] flex items-center justify-center text-white text-xs font-bold">{post.username?.[0]?.toUpperCase()}</div>
                <span className="text-sm font-semibold text-[#2F4B7C]">{post.username}</span>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-all duration-200 p-1 rounded-lg hover:bg-gray-100 hover:scale-110 active:scale-95 cursor-pointer">
                <svg className="w-5 h-5" {...ip}><path {...sw2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[#2F4B7C] leading-snug">{post.title}</h2>
                <p className="text-xs text-gray-400 mt-1">{post.createdAt?.toDate().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
              </div>
              {post.content && <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: post.content }} />}
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
              <Link href={`/post/${post.id}`} className="block w-full text-center bg-[#6FA8DC] hover:bg-[#5a8ec4] text-white text-sm font-semibold py-2.5 rounded-xl transition-all duration-300 ease-in-out hover:shadow-lg hover:scale-105 active:scale-95 cursor-pointer">Open Full Post</Link>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}