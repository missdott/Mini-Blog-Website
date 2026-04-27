"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Comment, getComments, addComment, editComment, deleteComment, toggleCommentLike } from "@/lib/commentsService";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { useIsAdmin } from "@/lib/useIsAdmin";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommentsProps { postId: string; authorId: string; }

interface FirebaseUser {
  uid: string; email: string | null; displayName: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function generateAvatarColor(userId: string): string {
  const colors = ["#6FA8DC", "#EA9999", "#F8CBAD", "#FFE599", "#93C5FD", "#C5A9FF", "#A4DE6C"];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const userInitial = (user: FirebaseUser) =>
  user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "?";

// ─── Shared sub-components (declared at module level) ─────────────────────────

function CommentInput({ user, error, newComment, setNewComment, onSubmit, submitting, className }: {
  user: FirebaseUser | null; error: string | null; newComment: string;
  setNewComment: (v: string) => void; onSubmit: () => void;
  submitting: boolean; className?: string;
}) {
  return (
    <div className={className}>
      {user ? (
        <div>
          {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0" style={{ background: generateAvatarColor(user.uid) }}>
              {userInitial(user)}
            </div>
            <div className="flex-1 flex gap-2">
              <input type="text" className="flex-1 text-sm bg-gray-100 rounded-full px-4 py-2 focus:outline-none border border-gray-200" placeholder="Add a comment…" value={newComment} onChange={(e) => setNewComment(e.target.value)} maxLength={1000} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }} />
              <button onClick={onSubmit} disabled={submitting || !newComment.trim()} className="px-4 py-2 text-sm font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center"><a href="/login" className="text-blue-600 hover:text-blue-700">Sign in</a> to comment</p>
      )}
    </div>
  );
}

function CommentsList({ visibleComments, user, isAdmin, authorId, onLike, onEdit, onDelete, hasMore, loadingMore, loadMore }: {
  visibleComments: Comment[]; user: FirebaseUser | null; isAdmin: boolean; authorId: string;
  onLike: (id: string, liked: boolean) => void; onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void; hasMore: boolean; loadingMore: boolean; loadMore: () => void;
}) {
  if (visibleComments.length === 0) return <p className="text-sm text-gray-500 text-center py-8">No comments yet. Be the first to comment!</p>;
  return (
    <>
      {visibleComments.map((comment) => (
        <CommentItemFull key={comment.id} comment={comment} currentUserId={user?.uid ?? null} isAdmin={isAdmin} postAuthorId={authorId} onLike={onLike} onEdit={onEdit} onDelete={onDelete} />
      ))}
      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore} className="w-full mt-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50">
          {loadingMore ? "Loading…" : "Load more comments"}
        </button>
      )}
    </>
  );
}

// ─── CommentPreview ───────────────────────────────────────────────────────────

function CommentPreview({ comment, currentUserId, isAdmin, postAuthorId, onLike, onEdit, onDelete }: {
  comment: Comment; currentUserId: string | null; isAdmin: boolean; postAuthorId: string;
  onLike: (id: string, liked: boolean) => void; onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);

  const isOwner = currentUserId === comment.userId;
  const canModerate = isAdmin || currentUserId === postAuthorId;
  const liked = currentUserId ? comment.likes.includes(currentUserId) : false;

  const handleSave = async () => {
    if (!draft.trim() || draft === comment.content) { setEditing(false); return; }
    setSaving(true);
    try { await onEdit(comment.id, draft); setEditing(false); }
    finally { setSaving(false); }
  };

  if (comment.isDeleted) return null;

  return (
    <div className="py-3 group" onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5" style={{ background: generateAvatarColor(comment.userId) }}>
          {comment.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-gray-900">{comment.username}</span>
            <span className="text-xs text-gray-500">{timeAgo(comment.createdAt)}</span>
          </div>
          {editing ? (
            <div className="mt-2">
              <textarea className="w-full rounded-lg p-2 text-sm resize-none focus:outline-none border border-gray-200" style={{ minHeight: "60px", backgroundColor: "#f9fafb" }} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} autoFocus />
              <div className="flex gap-2 mt-1.5">
                <button onClick={handleSave} disabled={saving || !draft.trim()} className="text-xs px-2 py-1 rounded font-medium transition-opacity disabled:opacity-40 bg-gray-100 hover:bg-gray-200 text-gray-900">{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => { setEditing(false); setDraft(comment.content); }} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-800 mt-1 line-clamp-2">{comment.content}</p>
          )}
          {!editing && showActions && (
            <div className="flex gap-3 mt-2 text-xs">
              {currentUserId && <button onClick={() => onLike(comment.id, liked)} className="text-gray-500 hover:text-red-600 transition-colors">{liked ? "Unlike" : "Like"}</button>}
              {isOwner && <button onClick={() => setEditing(true)} className="text-gray-500 hover:text-gray-900 transition-colors">Edit</button>}
              {(isOwner || canModerate) && <button onClick={() => onDelete(comment.id)} className="text-gray-500 hover:text-red-600 transition-colors">Delete</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CommentItemFull ──────────────────────────────────────────────────────────

function CommentItemFull({ comment, currentUserId, isAdmin, postAuthorId, onLike, onEdit, onDelete }: {
  comment: Comment; currentUserId: string | null; isAdmin: boolean; postAuthorId: string;
  onLike: (id: string, liked: boolean) => void; onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);

  const isOwner = currentUserId === comment.userId;
  const canModerate = isAdmin || currentUserId === postAuthorId;
  const liked = currentUserId ? comment.likes.includes(currentUserId) : false;

  const handleSave = async () => {
    if (!draft.trim() || draft === comment.content) { setEditing(false); return; }
    setSaving(true);
    try { await onEdit(comment.id, draft); setEditing(false); }
    finally { setSaving(false); }
  };

  if (comment.isDeleted) return <div className="py-4 px-0"><p className="text-sm italic text-gray-400">Comment removed.</p></div>;

  return (
    <div className="py-4 border-b border-gray-100 last:border-b-0">
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0" style={{ background: generateAvatarColor(comment.userId) }}>
          {comment.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">{comment.username}</span>
            <span className="text-xs text-gray-500">{timeAgo(comment.createdAt)}</span>
          </div>
          {editing ? (
            <div className="mt-2 -ml-3">
              <textarea className="w-full rounded-lg p-2 text-sm resize-none focus:outline-none border border-gray-200" style={{ minHeight: "70px", backgroundColor: "#f9fafb" }} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} autoFocus />
              <div className="flex gap-2 mt-2">
                <button onClick={handleSave} disabled={saving || !draft.trim()} className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity disabled:opacity-40 bg-gray-100 hover:bg-gray-200 text-gray-900">{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => { setEditing(false); setDraft(comment.content); }} className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-800 leading-relaxed">{comment.content}</p>
          )}
          {!editing && (
            <div className="flex items-center gap-4 mt-2 text-xs">
              {currentUserId && (
                <button onClick={() => onLike(comment.id, liked)} className="flex items-center gap-1 text-gray-500 hover:text-red-600 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  {liked && <span className="text-red-600 font-medium">{comment.likes.length}</span>}
                </button>
              )}
              {isOwner && <button onClick={() => setEditing(true)} className="text-gray-500 hover:text-gray-900 transition-colors">Edit</button>}
              {(isOwner || canModerate) && <button onClick={() => onDelete(comment.id)} className="text-gray-500 hover:text-red-600 transition-colors">Delete</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CommentsModal ────────────────────────────────────────────────────────────

function CommentsModal({ isOpen, onClose, comments, authorId, user, isAdmin, onEdit, onDelete, onLike, loadMore, hasMore, loadingMore, newComment, setNewComment, onSubmit, submitting, error }: {
  isOpen: boolean; onClose: () => void; comments: Comment[]; authorId: string;
  user: FirebaseUser | null; isAdmin: boolean;
  onEdit: (id: string, content: string) => void; onDelete: (id: string) => void;
  onLike: (id: string, liked: boolean) => void; loadMore: () => void;
  hasMore: boolean; loadingMore: boolean; newComment: string;
  setNewComment: (v: string) => void; onSubmit: () => void;
  submitting: boolean; error: string | null;
}) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const visibleComments = comments.filter((c) => !c.isDeleted);
  const listProps = { visibleComments, user, isAdmin, authorId, onLike, onEdit, onDelete, hasMore, loadingMore, loadMore };
  const inputProps = { user, error, newComment, setNewComment, onSubmit, submitting };
  const closeBtn = <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors p-2 -mr-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>;

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={onClose} />

      {/* Desktop drawer */}
      <div className={`hidden sm:flex fixed right-0 top-0 bottom-0 w-96 z-50 flex-col bg-white shadow-2xl rounded-l-2xl transform transition-transform duration-300 ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Comments ({visibleComments.length})</h2>
          {closeBtn}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4"><CommentsList {...listProps} /></div>
        <CommentInput {...inputProps} className="border-t border-gray-100 px-6 py-4 shrink-0" />
      </div>

      {/* Mobile bottom sheet */}
      <div className={`sm:hidden fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white rounded-t-2xl shadow-2xl transform transition-transform duration-300 ${isOpen ? "translate-y-0" : "translate-y-full"}`} style={{ maxHeight: "90vh" }}>
        <div className="flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
        <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Comments ({visibleComments.length})</h2>
          {closeBtn}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4"><CommentsList {...listProps} /></div>
        <CommentInput {...inputProps} className="border-t border-gray-100 px-4 py-4 shrink-0" />
      </div>
    </>
  );
}

// ─── CommentsSidebar ──────────────────────────────────────────────────────────

export function CommentsSidebar({ authorId, comments, user, isAdmin, loading, hasMore, loadingMore, newComment, setNewComment, onSubmit, submitting, error, onEdit, onDelete, onLike, loadMore }: {
  authorId: string; comments: Comment[]; user: FirebaseUser | null;
  isAdmin: boolean; loading: boolean; hasMore: boolean; loadingMore: boolean;
  newComment: string; setNewComment: (v: string) => void; onSubmit: () => void;
  submitting: boolean; error: string | null;
  onEdit: (id: string, content: string) => void; onDelete: (id: string) => void;
  onLike: (id: string, liked: boolean) => void; loadMore: () => void;
}) {
  const visibleComments = comments.filter((c) => !c.isDeleted);
  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 shrink-0">
        <h2 className="text-base font-bold text-[#2F4B7C]">Comments{visibleComments.length > 0 ? ` (${visibleComments.length})` : ""}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-2">
        {loading ? (
          <div className="animate-pulse space-y-4 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2"><div className="h-3 bg-gray-200 rounded w-24" /><div className="h-3 bg-gray-100 rounded w-full" /><div className="h-3 bg-gray-100 rounded w-3/4" /></div>
              </div>
            ))}
          </div>
        ) : visibleComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <p className="text-sm text-gray-400 font-medium">No comments yet</p>
            <p className="text-xs text-gray-300 mt-1">Be the first to share your thoughts!</p>
          </div>
        ) : (
          <>
            {visibleComments.map((comment) => (
              <CommentItemFull key={comment.id} comment={comment} currentUserId={user?.uid ?? null} isAdmin={isAdmin} postAuthorId={authorId} onLike={onLike} onEdit={onEdit} onDelete={onDelete} />
            ))}
            {hasMore && <button onClick={loadMore} disabled={loadingMore} className="w-full mt-2 mb-4 py-2 text-sm font-medium text-[#6FA8DC] hover:text-[#2F4B7C] transition-colors disabled:opacity-50">{loadingMore ? "Loading…" : "Load more comments"}</button>}
          </>
        )}
      </div>
      <div className="border-t border-gray-100 px-5 py-4 shrink-0 bg-white">
        {user ? (
          <div>
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 items-center">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0" style={{ background: generateAvatarColor(user.uid) }}>{userInitial(user)}</div>
              <input type="text" className="flex-1 text-sm bg-gray-50 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#6FA8DC] border border-gray-200" placeholder="Add a comment…" value={newComment} onChange={(e) => setNewComment(e.target.value)} maxLength={1000} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }} />
              <button onClick={onSubmit} disabled={submitting || !newComment.trim()} className="px-4 py-2 text-sm font-semibold rounded-full bg-[#6FA8DC] hover:bg-[#5A90C4] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0">{submitting ? "…" : "Post"}</button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center"><a href="/login" className="text-[#6FA8DC] hover:text-[#2F4B7C] font-medium">Sign in</a> to comment</p>
        )}
      </div>
    </div>
  );
}

// ─── Shared state logic ───────────────────────────────────────────────────────

function useCommentsState(postId: string) {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [comments, setComments] = useState<Comment[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getComments(postId);
      setComments(result.comments); setLastDoc(result.lastDoc); setHasMore(result.lastDoc !== null);
    } catch { setError("Failed to load comments."); }
    finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const loadMore = async () => {
    if (!lastDoc) return;
    setLoadingMore(true);
    try {
      const result = await getComments(postId, lastDoc);
      setComments((prev) => { const ids = new Set(prev.map((c) => c.id)); return [...prev, ...result.comments.filter((c) => !ids.has(c.id))]; });
      setLastDoc(result.lastDoc); setHasMore(result.lastDoc !== null);
    } finally { setLoadingMore(false); }
  };

  const handleSubmit = async () => {
    if (!user || !newComment.trim()) return;
    setSubmitting(true); setError(null);
    try {
      const comment = await addComment({ postId, userId: user.uid, username: user.displayName ?? user.email ?? "Anonymous", userEmail: user.email ?? "", content: newComment.trim() });
      setComments((prev) => prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]);
      setNewComment("");
    } catch (e) { setError((e as Error).message ?? "Failed to post comment."); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (commentId: string, content: string) => {
    await editComment(commentId, content);
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, content, updatedAt: new Date() } : c));
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    await deleteComment(commentId, postId);
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, isDeleted: true, content: "" } : c));
  };

  const handleLike = async (commentId: string, liked: boolean) => {
    if (!user) return;
    const toggle = (prev: Comment[]) => prev.map((c) => c.id !== commentId ? c : { ...c, likes: liked ? c.likes.filter((id) => id !== user.uid) : [...c.likes, user.uid] });
    const revert = (prev: Comment[]) => prev.map((c) => c.id !== commentId ? c : { ...c, likes: liked ? [...c.likes, user.uid] : c.likes.filter((id) => id !== user.uid) });
    setComments(toggle);
    try { await toggleCommentLike(commentId, user.uid, liked); }
    catch { setComments(revert); }
  };

  return { user, isAdmin, comments, hasMore, loading, loadingMore, newComment, setNewComment, submitting, error, modalOpen, setModalOpen, loadMore, handleSubmit, handleEdit, handleDelete, handleLike };
}

// ─── Comments (legacy export) ─────────────────────────────────────────────────

export default function Comments({ postId, authorId }: CommentsProps) {
  const s = useCommentsState(postId);
  const visibleComments = s.comments.filter((c) => !c.isDeleted);
  const previewComments = visibleComments.slice(0, 2);

  return (
    <section className="mt-8 pt-6 border-t border-gray-200">
      <div className="mb-6">
        {s.loading ? (
          <div className="animate-pulse"><div className="h-4 bg-gray-200 rounded w-20 mb-4" /><div className="space-y-3"><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div></div>
        ) : visibleComments.length === 0 ? (
          <p className="text-sm text-gray-500">No comments yet. Be the first to comment!</p>
        ) : (
          <>
            {previewComments.map((comment) => (
              <CommentPreview key={comment.id} comment={comment} currentUserId={s.user?.uid ?? null} isAdmin={s.isAdmin} postAuthorId={authorId} onLike={s.handleLike} onEdit={s.handleEdit} onDelete={s.handleDelete} />
            ))}
            {visibleComments.length > 0 && (
              <button onClick={() => s.setModalOpen(true)} className="text-sm text-gray-600 hover:text-gray-900 transition-colors mt-2 font-medium">
                {visibleComments.length === 1 ? "1 comment" : `View all ${visibleComments.length} comments`}
              </button>
            )}
          </>
        )}
      </div>
      {s.user && !s.modalOpen && (
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5" style={{ background: generateAvatarColor(s.user.uid) }}>{userInitial(s.user)}</div>
          <input type="text" className="flex-1 text-sm bg-gray-100 rounded-full px-4 py-2 focus:outline-none border border-gray-200" placeholder="Add a comment…" value={s.newComment} onChange={(e) => s.setNewComment(e.target.value)} maxLength={1000} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); s.handleSubmit(); } }} />
        </div>
      )}
      {!s.user && !s.modalOpen && (
        <p className="text-xs text-gray-500 pt-4 border-t border-gray-100"><a href="/login" className="text-blue-600 hover:text-blue-700 font-medium">Sign in</a> to comment</p>
      )}
      <CommentsModal isOpen={s.modalOpen} onClose={() => s.setModalOpen(false)} comments={s.comments} authorId={authorId} user={s.user} isAdmin={s.isAdmin} onEdit={s.handleEdit} onDelete={s.handleDelete} onLike={s.handleLike} loadMore={s.loadMore} hasMore={s.hasMore} loadingMore={s.loadingMore} newComment={s.newComment} setNewComment={s.setNewComment} onSubmit={s.handleSubmit} submitting={s.submitting} error={s.error} />
    </section>
  );
}

// ─── CommentsController ───────────────────────────────────────────────────────

export function CommentsController({ postId, authorId }: CommentsProps) {
  const s = useCommentsState(postId);
  const visibleComments = s.comments.filter((c) => !c.isDeleted);
  const previewComments = visibleComments.slice(0, 2);

  const sharedProps = { authorId, comments: s.comments, user: s.user, isAdmin: s.isAdmin, loading: s.loading, hasMore: s.hasMore, loadingMore: s.loadingMore, newComment: s.newComment, setNewComment: s.setNewComment, onSubmit: s.handleSubmit, submitting: s.submitting, error: s.error, onEdit: s.handleEdit, onDelete: s.handleDelete, onLike: s.handleLike, loadMore: s.loadMore };

  return (
    <>
      <div className="hidden lg:block h-full"><CommentsSidebar {...sharedProps} /></div>
      <section className="lg:hidden mt-8 pt-6 border-t border-gray-200">
        <div className="mb-6">
          {s.loading ? (
            <div className="animate-pulse space-y-3"><div className="h-4 bg-gray-200 rounded w-20 mb-4" /><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div>
          ) : visibleComments.length === 0 ? (
            <p className="text-sm text-gray-500">No comments yet. Be the first to comment!</p>
          ) : (
            <>
              {previewComments.map((comment) => (
                <CommentPreview key={comment.id} comment={comment} currentUserId={s.user?.uid ?? null} isAdmin={s.isAdmin} postAuthorId={authorId} onLike={s.handleLike} onEdit={s.handleEdit} onDelete={s.handleDelete} />
              ))}
              {visibleComments.length > 0 && (
                <button onClick={() => s.setModalOpen(true)} className="text-sm text-gray-600 hover:text-gray-900 transition-colors mt-2 font-medium">
                  {visibleComments.length === 1 ? "1 comment" : `View all ${visibleComments.length} comments`}
                </button>
              )}
            </>
          )}
        </div>
        {s.user && !s.modalOpen && (
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5" style={{ background: generateAvatarColor(s.user.uid) }}>{userInitial(s.user)}</div>
            <input type="text" className="flex-1 text-sm bg-gray-100 rounded-full px-4 py-2 focus:outline-none border border-gray-200" placeholder="Add a comment…" value={s.newComment} onChange={(e) => s.setNewComment(e.target.value)} maxLength={1000} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); s.handleSubmit(); } }} />
          </div>
        )}
        {!s.user && !s.modalOpen && (
          <p className="text-xs text-gray-500 pt-4 border-t border-gray-100"><a href="/login" className="text-blue-600 hover:text-blue-700 font-medium">Sign in</a> to comment</p>
        )}
        <CommentsModal isOpen={s.modalOpen} onClose={() => s.setModalOpen(false)} comments={s.comments} authorId={authorId} user={s.user} isAdmin={s.isAdmin} onEdit={s.handleEdit} onDelete={s.handleDelete} onLike={s.handleLike} loadMore={s.loadMore} hasMore={s.hasMore} loadingMore={s.loadingMore} newComment={s.newComment} setNewComment={s.setNewComment} onSubmit={s.handleSubmit} submitting={s.submitting} error={s.error} />
      </section>
    </>
  );
}