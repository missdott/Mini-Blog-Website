"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { compressFeaturedImage, formatFileSize, uploadToCloudinary } from "@/lib/imageUtils";
import Image from "next/image";

// ─── Types & Constants ────────────────────────────────────────────────────────

const MAX_IMAGES = 5;

interface ImageEntry {
  file: File; preview: string;
  compressionInfo: string | null; isCompressing: boolean;
}
interface EditingPost {
  id: string; title: string; content: string; categories: string;
  tags: string; featuredImage: string; galleryImages?: string[];
  isPrivate: boolean; isDraft: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ip = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw2 = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
const navLink = "text-[#2F4B7C] hover:text-[#6FA8DC] font-bold transition-colors uppercase tracking-widest text-[11px]";
const menuItem = "flex items-center px-5 py-3 text-sm font-bold text-[#2F4B7C] hover:bg-[#F6F3EC] transition-colors";
const inputCls = "w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none text-gray-900 placeholder-gray-400 transition-shadow bg-white";
const toolBtn = (active?: boolean) => `p-2 rounded hover:bg-gray-200 transition${active ? " bg-gray-300" : ""}`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditorPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [categories, setCategories] = useState("");
  const [tags, setTags] = useState("");
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);
  const pendingPublishRef = useRef<{ isDraft: boolean } | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      TiptapLink.configure({ openOnClick: false }),
      TiptapImage,
      Placeholder.configure({ placeholder: "Rich text editor." }),
    ],
    content: "",
    editorProps: { attributes: { class: "prose prose-sm max-w-none focus:outline-none min-h-[300px] p-4" } },
    immediatelyRender: false,
  });

  // ── Effects ──

  useEffect(() => () => { blobUrlsRef.current.forEach(URL.revokeObjectURL); }, []);

  useEffect(() => {
    const data = localStorage.getItem("editingPost");
    if (!data) return;
    try {
      const post: EditingPost = JSON.parse(data);
      setEditingPostId(post.id); setTitle(post.title);
      setCategories(post.categories); setTags(post.tags);
      setIsPrivate(post.isPrivate);
      if (editor && post.content) editor.commands.setContent(post.content);
      localStorage.removeItem("editingPost");
    } catch (err) { console.error("Error loading post data:", err); }
  }, [editor]);

  useEffect(() => { if (!authLoading && !user) router.push("/"); }, [user, authLoading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Handlers ──

  const handleSearchNavigate = () => {
    if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleImagesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const toAdd = files.slice(0, MAX_IMAGES - images.length);
    const newEntries: ImageEntry[] = toAdd.map((file) => {
      const preview = URL.createObjectURL(file);
      blobUrlsRef.current.push(preview);
      return { file, preview, compressionInfo: null, isCompressing: true };
    });
    setImages((prev) => [...prev, ...newEntries]);
    for (let i = 0; i < toAdd.length; i++) {
      const globalIndex = images.length + i;
      try {
        const originalSize = toAdd[i].size;
        const compressed = await compressFeaturedImage(toAdd[i]);
        setImages((prev) => prev.map((entry, idx) =>
          idx === globalIndex ? { ...entry, file: compressed, isCompressing: false, compressionInfo: `${formatFileSize(originalSize)} → ${formatFileSize(compressed.size)}` } : entry
        ));
      } catch {
        setImages((prev) => prev.map((entry, idx) => idx === globalIndex ? { ...entry, isCompressing: false } : entry));
      }
    }
    e.target.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const entry = prev[index];
      if (entry?.preview.startsWith("blob:")) {
        URL.revokeObjectURL(entry.preview);
        blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== entry.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleMoveImage = (from: number, to: number) => {
    setImages((prev) => { const a = [...prev]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });
  };

  const handleLogout = async () => { await signOut(auth); router.push("/"); };

  const isAnyCompressing = images.some((img) => img.isCompressing);

  const handlePublish = async (isDraft = false) => {
    if (!user || !editor) return;
    if (!title.trim()) { setError("Please enter a title"); return; }
    const content = editor.getHTML();
    if (!content || content === "<p></p>") { setError("Please write some content"); return; }
    if (isAnyCompressing) { setError("Please wait for images to finish optimizing."); return; }

    pendingPublishRef.current = { isDraft };
    setLoading(true); setUploadProgress(null); setUploadError(null); setError("");

    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        setUploadProgress(`Uploading image ${i + 1} of ${images.length}...`);
        uploadedUrls.push(await uploadToCloudinary(images[i].file));
      }
      setUploadProgress(null);

      const username = localStorage.getItem(`username_${user.uid}`) || user.email?.split("@")[0] || "Anonymous";
      const postData = {
        title: title.trim(), content, username, userEmail: user.email, userId: user.uid,
        categories: categories ? categories.split(",").map((c) => c.trim()) : [],
        tags: tags ? tags.split(",").map((t) => t.trim()) : [],
        featuredImage: uploadedUrls[0] || "", galleryImages: uploadedUrls.slice(1),
        likes: [], comments: 0, isPrivate, isDraft, updatedAt: serverTimestamp(),
      };

      if (editingPostId) {
        await updateDoc(doc(db, "posts", editingPostId), postData);
        alert(isDraft ? "Draft updated!" : "Post updated successfully!");
      } else {
        await addDoc(collection(db, "posts"), { ...postData, createdAt: serverTimestamp() });
        alert(isDraft ? "Saved as draft!" : "Post published successfully!");
      }
      pendingPublishRef.current = null;
      router.push("/dashboard");
    } catch (err: unknown) {
      console.error("Error saving post:", err);
      setUploadProgress(null);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Network error")) setUploadError("Image upload failed — please check your internet connection and try again.");
      else if (msg.includes("Upload failed")) setUploadError("Image upload failed. Try removing the image and re-adding it.");
      else setError("Failed to save post. Please try again.");
    } finally { setLoading(false); }
  };

  const handleRetryUpload = () => { if (pendingPublishRef.current) handlePublish(pendingPublishRef.current.isDraft); };

  // ── Render ──

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F3EC]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F4B7C]" />
    </div>
  );

  const slotsLeft = MAX_IMAGES - images.length;

  return (
    <div className="min-h-screen bg-[#F6F3EC]">
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

      {/* Back Button */}
      <div className="pl-4 pr-6 py-4">
        <button onClick={() => { localStorage.removeItem("editingPost"); router.push("/dashboard"); }} className="inline-flex items-center gap-2 text-sm font-medium text-[#2F4B7C] hover:text-[#6FA8DC] transition-colors group">
          <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" {...ip}><path {...sw2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#6FA8DC]" />
            <span className="text-sm font-bold text-[#2F4B7C]">{uploadProgress}</span>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {editingPostId && <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">✏️ You are editing an existing post</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Editor Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-bold text-[#2F4B7C] uppercase tracking-wider">Title</label>
              <div className="flex items-center gap-4">
                {(["Public", "Private"] as const).map((label) => (
                  <label key={label} className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="visibility" checked={isPrivate === (label === "Private")} onChange={() => setIsPrivate(label === "Private")} className="w-4 h-4 text-[#6FA8DC] focus:ring-[#6FA8DC]" />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter a captivating title..." className="w-full px-5 py-4 text-lg font-medium border border-gray-300 rounded-2xl focus:ring-2 focus:ring-[#6FA8DC] focus:border-transparent outline-none text-gray-900 placeholder-gray-400 transition-shadow bg-white" disabled={loading} />

            {/* Rich Text Editor */}
            <div className="border border-gray-300 rounded-2xl overflow-hidden shadow-sm">
              <EditorContent editor={editor} className="min-h-100 bg-white" />
              <div className="border-t border-gray-300 bg-gray-50 p-3 flex items-center gap-2">
                <button onClick={() => editor?.chain().focus().toggleBold().run()} className={toolBtn(editor?.isActive("bold"))} title="Bold" type="button"><span className="font-bold text-gray-700">B</span></button>
                <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={toolBtn(editor?.isActive("italic"))} title="Italic" type="button"><span className="italic text-gray-700">I</span></button>
                <button onClick={() => editor?.chain().focus().toggleStrike().run()} className={toolBtn(editor?.isActive("strike"))} title="Strikethrough" type="button"><span className="line-through text-gray-700">S</span></button>
                <div className="w-px h-6 bg-gray-300 mx-1" />
                <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={toolBtn(editor?.isActive("bulletList"))} title="Bullet List" type="button">
                  <svg className="w-5 h-5 text-gray-700" {...ip}><path {...sw2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={toolBtn(editor?.isActive("orderedList"))} title="Numbered List" type="button">
                  <svg className="w-5 h-5 text-gray-700" {...ip}><path {...sw2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </button>
                <button onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={toolBtn(editor?.isActive("codeBlock"))} title="Code Block" type="button">
                  <svg className="w-5 h-5 text-gray-700" {...ip}><path {...sw2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                </button>
                <button onClick={() => editor?.chain().focus().setHorizontalRule().run()} className={toolBtn()} title="Horizontal Rule" type="button">
                  <span className="text-gray-700">―</span>
                </button>
              </div>
            </div>

            {uploadError && (
              <div className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-4">
                <span>⚠️ {uploadError}</span>
                <button onClick={handleRetryUpload} className="text-xs font-bold underline underline-offset-2 whitespace-nowrap hover:text-orange-900 transition-colors" type="button">Retry</button>
              </div>
            )}
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

            <div className="flex items-center justify-end gap-4 pt-4">
              <button onClick={() => handlePublish(true)} disabled={loading || isAnyCompressing} className="inline-flex items-center justify-center px-8 py-3 text-sm font-bold uppercase tracking-wider text-[#2F4B7C] bg-white border-2 border-[#2F4B7C] rounded-full hover:bg-[#F6F3EC] hover:scale-105 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" type="button">
                {loading ? "Saving..." : editingPostId ? "Update Draft" : "Save as Draft"}
              </button>
              <button onClick={() => handlePublish(false)} disabled={loading || isAnyCompressing} className="inline-flex items-center justify-center px-10 py-3 text-sm font-bold uppercase tracking-wider text-white bg-[#5A90C4] rounded-full shadow-lg hover:bg-[#4A7FAA] hover:scale-105 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" type="button">
                {loading ? "Publishing..." : editingPostId ? "Update Post" : "Publish"}
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Images */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-bold text-[#2F4B7C] uppercase tracking-wider">Images</label>
                <span className="text-xs text-gray-400">{images.length}/{MAX_IMAGES}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">First image is the cover. Drag to reorder. Up to {MAX_IMAGES} images.</p>

              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {images.map((img, index) => (
                    <div key={img.preview} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-white h-28">
                      <Image src={img.preview} alt={`Image ${index + 1}`} fill className="object-cover" unoptimized />
                      {index === 0 && <div className="absolute top-1 left-1 bg-[#2F4B7C] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">COVER</div>}
                      {img.isCompressing && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /></div>}
                      {img.compressionInfo && !img.isCompressing && <div className="absolute bottom-1 left-1 bg-green-600/80 text-white text-[10px] px-1.5 py-0.5 rounded">✓ {img.compressionInfo}</div>}
                      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {index > 0 && (
                          <button onClick={() => handleMoveImage(index, index - 1)} className="p-1 bg-white/90 rounded-full hover:bg-white shadow text-gray-700" title="Move left" type="button">
                            <svg className="w-3 h-3" {...ip}><path {...sw2} d="M15 19l-7-7 7-7" /></svg>
                          </button>
                        )}
                        {index < images.length - 1 && (
                          <button onClick={() => handleMoveImage(index, index + 1)} className="p-1 bg-white/90 rounded-full hover:bg-white shadow text-gray-700" title="Move right" type="button">
                            <svg className="w-3 h-3" {...ip}><path {...sw2} d="M9 5l7 7-7 7" /></svg>
                          </button>
                        )}
                        <button onClick={() => handleRemoveImage(index)} className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow" title="Remove" type="button">
                          <svg className="w-3 h-3" {...ip}><path {...sw2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {images.length < MAX_IMAGES && (
                <label className="cursor-pointer block">
                  <input type="file" accept="image/*" multiple onChange={handleImagesSelected} className="hidden" disabled={loading || isAnyCompressing} />
                  <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center hover:border-[#6FA8DC] transition bg-white">
                    <svg className="w-10 h-10 text-gray-400 mb-2 mx-auto" {...ip}><path {...sw2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <p className="text-sm text-gray-500">{images.length === 0 ? "Click to add images" : "Click to add more"}</p>
                    <p className="text-xs text-gray-400 mt-1">{slotsLeft} slot{slotsLeft !== 1 ? "s" : ""} remaining</p>
                  </div>
                </label>
              )}
            </div>

            {/* Categories & Tags */}
            {([["Categories", categories, setCategories, "e.g., Technology, Lifestyle"], ["Tags", tags, setTags, "e.g., writing, creativity"]] as const).map(([label, value, setter, placeholder]) => (
              <div key={label}>
                <label className="block text-sm font-bold text-[#2F4B7C] uppercase tracking-wider mb-2">{label}</label>
                <input type="text" value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder} className={inputCls} disabled={loading} />
                <p className="text-xs text-gray-500 mt-1">Separate with commas</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}