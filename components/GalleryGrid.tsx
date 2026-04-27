"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import Lightbox from "./Lightbox";

interface Post {
  id: string; title: string; content: string; featuredImage: string;
  createdAt: { toDate: () => Date }; userId: string; username: string;
  likes: string[]; comments: number;
}

export default function GalleryGrid({ posts }: { posts: Post[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const withImages = posts.filter((p) => p.featuredImage);
  const textOnly = posts.filter((p) => !p.featuredImage);

  const navigate = (dir: 1 | -1) =>
    setSelectedIndex((i) => i === null ? null : (i + dir + withImages.length) % withImages.length);

  return (
    <>
      {withImages.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {withImages.map((post, index) => (
            <motion.div key={post.id} className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-gray-100" whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }} onClick={() => setSelectedIndex(index)}>
              <Image src={post.featuredImage} alt={post.title} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" />
              <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                <p className="text-white text-sm font-semibold line-clamp-2 leading-tight">{post.title}</p>
                <p className="text-white/70 text-xs mt-1">{post.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" /></svg>
                    {post.likes?.length ?? 0}
                  </span>
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    {post.comments ?? 0}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {textOnly.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Text Posts</p>
          {textOnly.map((post) => (
            <div key={post.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-md transition cursor-pointer">
              <p className="font-semibold text-[#2F4B7C] text-sm">{post.title}</p>
              <p className="text-xs text-gray-400 mt-1">{post.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            </div>
          ))}
        </div>
      )}

      {selectedIndex !== null && (
        <Lightbox
          post={withImages[selectedIndex]}
          onClose={() => setSelectedIndex(null)}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
          totalCount={withImages.length}
          currentIndex={selectedIndex}
        />
      )}
    </>
  );
}